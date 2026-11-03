begin;
-- One rotating decision maker per team turn, with a stable join order.
create or replace function public.forest_treasure_actor(p_room uuid,p_team text,p_turn integer)
returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
 select player_id from public.room_players where room_id=p_room and team_id=p_team and is_active and kicked_at is null
 order by joined_at,player_id offset ((p_turn/2) % greatest(1,(select count(*)::int from public.room_players where room_id=p_room and team_id=p_team and is_active and kicked_at is null))) limit 1
$$;
revoke all on function public.forest_treasure_actor(uuid,text,integer) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.forest_treasure_get_state(p_room_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare r public.rooms%rowtype; s public.forest_treasure_sessions%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select x.* into r from public.rooms x join public.room_players p on p.room_id=x.id
 where x.code=upper(trim(p_room_code)) and p.player_id=auth.uid() and p.is_active and p.kicked_at is null;
 if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
 select * into s from public.forest_treasure_sessions where room_id=r.id;
 if not found then return jsonb_build_object('mode','orman_hazinesi','phase','lobby',
  'players',(select coalesce(jsonb_agg(jsonb_build_object('player_id',p.player_id,'name',p.name,'avatar_key',p.avatar_key,'is_bot',p.is_bot,'is_ready',p.is_ready,'team_id',p.team_id) order by p.joined_at),'[]'::jsonb) from public.room_players p where p.room_id=r.id and p.is_active and p.kicked_at is null)); end if;
 return jsonb_build_object('mode','orman_hazinesi','phase',s.phase,'turn_number',s.turn_number,'current_team',s.current_team,
 'team_state',s.team_state,'last_action',s.last_action,'event_log',s.event_log,'winner',s.winner,'phase_deadline_at',s.phase_deadline_at,
 'state_version',s.state_version,'active_player_id',public.forest_treasure_actor(r.id,s.current_team,s.turn_number),'can_act',s.phase='expedition' and auth.uid()=public.forest_treasure_actor(r.id,s.current_team,s.turn_number),'my_team',(select p.team_id from public.room_players p where p.room_id=r.id and p.player_id=auth.uid()),
 'is_host',r.host_id=auth.uid(),'players',(select coalesce(jsonb_agg(jsonb_build_object('player_id',p.player_id,'name',p.name,'avatar_key',p.avatar_key,'is_bot',p.is_bot,'is_ready',p.is_ready,'team_id',p.team_id) order by p.joined_at),'[]'::jsonb) from public.room_players p where p.room_id=r.id and p.is_active and p.kicked_at is null));
end $function$;


CREATE OR REPLACE FUNCTION public.forest_treasure_apply_turn(p_room_code text, p_action text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare r public.rooms%rowtype; s public.forest_treasure_sessions%rowtype; t text; other_t text; ts jsonb; other_s jsonb;
 p integer; f integer; food_n integer; rope_n integer; torch_n integer; morale_n integer; msg text; turn_n integer; winner_n text; ev jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_actor <> auth.uid() and not exists(select 1 from public.rooms x join public.room_players p on p.room_id=x.id where x.code=upper(trim(p_room_code)) and x.host_id=auth.uid() and p.player_id=p_actor and p.is_bot and p.is_active and p.kicked_at is null) then raise exception 'BOT_HOST_ONLY'; end if;
 select x.* into r from public.rooms x join public.room_players rp on rp.room_id=x.id
 where x.code=upper(trim(p_room_code)) and rp.player_id=p_actor and rp.is_active and rp.kicked_at is null for update of x;
 if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
 select * into s from public.forest_treasure_sessions where room_id=r.id for update;
 if not found or s.phase<>'expedition' then raise exception 'EXPEDITION_NOT_ACTIVE'; end if;
 if s.phase_deadline_at<now() then raise exception 'TURN_EXPIRED'; end if;
 select team_id into t from public.room_players where room_id=r.id and player_id=p_actor;
 if t is distinct from s.current_team then raise exception 'NOT_YOUR_TEAM_TURN'; end if;
 if p_actor is distinct from public.forest_treasure_actor(r.id,s.current_team,s.turn_number) then raise exception 'NOT_YOUR_TURN'; end if;
 if p_action not in ('explore','forage','use_rope','use_torch','camp','claim_treasure') then raise exception 'INVALID_ACTION'; end if;
 ts:=s.team_state->t; other_t:=case when t='A' then 'B' else 'A' end; other_s:=s.team_state->other_t;
 p:=coalesce((ts->>'progress')::int,0); f:=coalesce((ts->>'fragments')::int,0);
 food_n:=coalesce((ts->>'food')::int,0); rope_n:=coalesce((ts->>'rope')::int,0);
 torch_n:=coalesce((ts->>'torch')::int,0); morale_n:=coalesce((ts->>'morale')::int,0);
 case p_action
 when 'explore' then
  if p>0 and p%2=1 then
   if rope_n>0 then rope_n:=rope_n-1;p:=p+1;msg:='İpli geçidi aştınız: +1 ilerleme, -1 ip.';
   elsif torch_n>0 then torch_n:=torch_n-1;p:=p+1;msg:='Meşale geçidi aydınlattı: +1 ilerleme, -1 meşale.';
   else morale_n:=greatest(0,morale_n-1);msg:='Tehlikeli geçit! Ekipman yok; moral düştü ve ilerleme durdu.'; end if;
  else p:=p+1;msg:='Yeni patika bulundu: +1 ilerleme.'; end if;
  if p>=2 and f<1 then f:=1;msg:=msg||' Haritanın ilk parçası bulundu!'; end if;
  if p>=4 and f<2 then f:=2;msg:=msg||' İkinci harita parçası bulundu!'; end if;
  if p>=6 and f<3 then f:=3;msg:=msg||' Son harita parçası bulundu!'; end if;
 when 'forage' then
  if food_n=0 then food_n:=food_n+1;msg:='Yenilebilir kökler buldunuz: erzak +1.';
  elsif rope_n=0 then rope_n:=rope_n+1;msg:='Lifli sarmaşık topladınız: ip +1.';
  else torch_n:=torch_n+1;msg:='Kuru dal ve reçine buldunuz: meşale +1.'; end if;
 when 'use_rope' then
  if rope_n<1 then raise exception 'NO_ROPE'; end if;
  rope_n:=rope_n-1;p:=p+2;msg:='İp köprüsü kuruldu: +2 ilerleme, -1 ip.';
 when 'use_torch' then
  if torch_n<1 then raise exception 'NO_TORCH'; end if;
  torch_n:=torch_n-1;p:=p+1;morale_n:=least(5,morale_n+1);msg:='Meşale mağara yolunu aydınlattı: +1 ilerleme, +1 moral.';
 when 'camp' then
  if food_n<1 then raise exception 'NO_FOOD'; end if;
  food_n:=food_n-1;morale_n:=least(5,morale_n+2);msg:='Kamp kuruldu: -1 erzak, +2 moral.';
 when 'claim_treasure' then
  if p<6 or f<3 then raise exception 'TREASURE_NOT_FOUND'; end if;
  msg:='Hazine sandığı açıldı! Takımınız kayıp hazineyi buldu.';
 end case;
 if p_action in ('use_rope','use_torch') then
  if p>=2 and f<1 then f:=1;msg:=msg||' İlk harita parçası bulundu!'; end if;
  if p>=4 and f<2 then f:=2;msg:=msg||' İkinci harita parçası bulundu!'; end if;
  if p>=6 and f<3 then f:=3;msg:=msg||' Son harita parçası bulundu!'; end if;
 end if;
 ts:=jsonb_build_object('progress',least(8,p),'fragments',least(3,f),'food',least(9,food_n),'rope',least(9,rope_n),'torch',least(9,torch_n),'morale',least(5,morale_n));
 ts:=jsonb_set(s.team_state,array[t],ts,true);turn_n:=s.turn_number+1;winner_n:=null;
 if p_action='claim_treasure' and p>=6 and f>=3 then winner_n:=t;
 elsif turn_n>=16 then
  if coalesce((ts->'A'->>'progress')::int,0)>coalesce((ts->'B'->>'progress')::int,0) then winner_n:='A';
  elsif coalesce((ts->'B'->>'progress')::int,0)>coalesce((ts->'A'->>'progress')::int,0) then winner_n:='B';
  else winner_n:='draw'; end if;
 end if;
 ev:=jsonb_build_object('turn',turn_n,'team',t,'action',p_action,'message',msg,'at',now(),'player_id',p_actor);
 update public.forest_treasure_sessions set phase=case when winner_n is null then 'expedition' else 'finished' end,
 turn_number=turn_n,current_team=case when t='A' then 'B' else 'A' end,team_state=ts,last_action=ev,
 event_log=event_log||jsonb_build_array(ev),winner=winner_n,phase_deadline_at=case when winner_n is null then now()+interval '30 seconds' else null end,
 state_version=state_version+1,updated_at=now() where room_id=r.id;
 update public.rooms set current_round=least(8,ceil(turn_n::numeric/2)::int),phase_started_at=now(),
 phase_deadline_at=case when winner_n is null then now()+interval '30 seconds' else null end,state_version=state_version+1,updated_at=now() where id=r.id;
 return public.forest_treasure_get_state(p_room_code);
end $function$;

revoke all on function public.forest_treasure_apply_turn(text,text,uuid) from public,anon,authenticated;
create or replace function public.forest_treasure_move(p_room_code text,p_action text)
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
 select public.forest_treasure_apply_turn(p_room_code,p_action,auth.uid())
$$;
revoke all on function public.forest_treasure_move(text,text) from public,anon;
grant execute on function public.forest_treasure_move(text,text) to authenticated;
create or replace function public.bot_forest_move_secure(p_room_code text,p_bot_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.rooms%rowtype; s public.forest_treasure_sessions%rowtype; ts jsonb; a text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into r from public.rooms where code=upper(trim(p_room_code)) for update;
 if not found or r.host_id<>auth.uid() or r.game_mode<>'orman_hazinesi' then raise exception 'BOT_HOST_ONLY'; end if;
 if not exists(select 1 from public.room_players where room_id=r.id and player_id=p_bot_id and is_bot and is_active and kicked_at is null) then return false; end if;
 select * into s from public.forest_treasure_sessions where room_id=r.id for update;
 if not found or s.phase<>'expedition' or s.phase_deadline_at<=now() or p_bot_id is distinct from public.forest_treasure_actor(r.id,s.current_team,s.turn_number) then return false; end if;
 ts:=s.team_state->s.current_team;
 a:=case when (ts->>'progress')::int>=6 and (ts->>'fragments')::int>=3 then 'claim_treasure'
 when (ts->>'rope')::int>0 then 'use_rope'
 when (ts->>'torch')::int>0 then 'use_torch'
 when (ts->>'progress')::int%2=1 then 'forage' else 'explore' end;
 perform public.forest_treasure_apply_turn(p_room_code,a,p_bot_id);
 return true;
end $$;
revoke all on function public.bot_forest_move_secure(text,uuid) from public,anon;
grant execute on function public.bot_forest_move_secure(text,uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.forest_treasure_advance(p_room_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare r public.rooms%rowtype; s public.forest_treasure_sessions%rowtype; n integer; t text; ev jsonb; w text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select x.* into r from public.rooms x join public.room_players rp on rp.room_id=x.id where x.code=upper(trim(p_room_code)) and rp.player_id=auth.uid() and rp.is_active and rp.kicked_at is null for update of x;
 if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;

 select * into s from public.forest_treasure_sessions where room_id=r.id for update;
 if not found or s.phase<>'expedition' then raise exception 'EXPEDITION_NOT_ACTIVE'; end if;
 if s.phase_deadline_at>now() then raise exception 'TURN_NOT_EXPIRED'; end if;
 n:=s.turn_number+1;t:=s.current_team;w:=null;
 if n>=16 then
  if coalesce((s.team_state->'A'->>'progress')::int,0)>coalesce((s.team_state->'B'->>'progress')::int,0) then w:='A';
  elsif coalesce((s.team_state->'B'->>'progress')::int,0)>coalesce((s.team_state->'A'->>'progress')::int,0) then w:='B'; else w:='draw'; end if;
 end if;
 ev:=jsonb_build_object('turn',n,'team',t,'action','timeout','message','Süre doldu; takım hamlesini kaçırdı.','at',now());
 update public.forest_treasure_sessions set turn_number=n,current_team=case when t='A' then 'B' else 'A' end,last_action=ev,event_log=event_log||jsonb_build_array(ev),
 phase=case when w is null then 'expedition' else 'finished' end,winner=w,phase_deadline_at=case when w is null then now()+interval '30 seconds' else null end,
 state_version=state_version+1,updated_at=now() where room_id=r.id;
 update public.rooms set state_version=state_version+1,phase_started_at=now(),phase_deadline_at=case when w is null then now()+interval '30 seconds' else null end,updated_at=now() where id=r.id;
 return public.forest_treasure_get_state(p_room_code);
end $function$;



commit;
