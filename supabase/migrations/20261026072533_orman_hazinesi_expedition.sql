-- Orman Hazinesi: server-authoritative, non-question team expedition.
begin;
alter table public.rooms drop constraint if exists rooms_game_mode_check;
alter table public.rooms add constraint rooms_game_mode_check check (game_mode = any (array[
'classic','survival','suspicious','blitz','team_battle','secret_missions','double_trap','golden_question','detective_fox','gizli_tilki','orman_hazinesi'
]::text[]));
create table if not exists public.forest_treasure_sessions (
 room_id uuid primary key references public.rooms(id) on delete cascade,
 phase text not null default 'lobby' check (phase in ('lobby','expedition','finished')),
 turn_number integer not null default 0 check (turn_number between 0 and 16),
 current_team text not null default 'A' check (current_team in ('A','B')),
 team_state jsonb not null default '{"A":{"progress":0,"fragments":0,"food":3,"rope":1,"torch":1,"morale":3},"B":{"progress":0,"fragments":0,"food":3,"rope":1,"torch":1,"morale":3}}'::jsonb,
 last_action jsonb, event_log jsonb not null default '[]'::jsonb,
 winner text check (winner is null or winner in ('A','B','draw')),
 phase_deadline_at timestamptz, state_version bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.forest_treasure_sessions enable row level security;
revoke all on public.forest_treasure_sessions from public,anon,authenticated;
grant all on public.forest_treasure_sessions to service_role;
do $p$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='forest_treasure_sessions' and policyname='forest_treasure_deny_client_access') then
  create policy forest_treasure_deny_client_access on public.forest_treasure_sessions for all to anon,authenticated using(false) with check(false);
 end if;
end $p$;
CREATE OR REPLACE FUNCTION public.create_room_with_mode_secure(p_code character varying, p_name character varying, p_avatar_key character varying, p_total_rounds integer, p_round_seconds integer, p_categories text[], p_is_private boolean, p_password text, p_game_mode text)
 RETURNS TABLE(room_id uuid, room_code character varying, host_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_room_id uuid; v_room_code character varying; v_host_id uuid; v_min_players integer:=2; v_max_players integer:=10; v_round_seconds integer:=p_round_seconds;
begin
 if auth.uid() is null then raise exception 'Oturum açılması gerekiyor'; end if;
 if p_game_mode is null or p_game_mode not in ('classic','survival','suspicious','blitz','team_battle','secret_missions','double_trap','golden_question','detective_fox','gizli_tilki','orman_hazinesi') then raise exception 'Desteklenmeyen oyun modu'; end if;
 case p_game_mode
  when 'team_battle' then v_min_players:=4;
  when 'secret_missions' then v_min_players:=3; v_max_players:=8;
  when 'double_trap' then v_max_players:=6;
  when 'detective_fox' then v_min_players:=4;
  when 'gizli_tilki' then v_min_players:=4;
  when 'orman_hazinesi' then v_min_players:=4; v_round_seconds:=20;
  when 'blitz' then v_round_seconds:=7;
  else null;
 end case;
 select x.room_id,x.room_code,x.host_id into v_room_id,v_room_code,v_host_id
 from public.create_room_secure(p_code,p_name,p_avatar_key,p_total_rounds,v_round_seconds,p_categories,p_is_private,p_password) x;
 update public.rooms set game_mode=p_game_mode,min_players=v_min_players,max_players=v_max_players,round_seconds=v_round_seconds,survival_finished=false,updated_at=now() where id=v_room_id;
 return query select v_room_id,v_room_code,v_host_id;
end $function$


CREATE OR REPLACE FUNCTION public.forest_treasure_start(p_room_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare r public.rooms%rowtype; n integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into r from public.rooms where code=upper(trim(p_room_code)) for update;
 if not found or r.game_mode<>'orman_hazinesi' then raise exception 'ROOM_NOT_FOUND'; end if;
 if r.host_id<>auth.uid() then raise exception 'HOST_ONLY'; end if;
 select count(*) into n from public.room_players where room_id=r.id and is_active and kicked_at is null;
 if n<4 or n>10 then raise exception 'PLAYER_COUNT_MUST_BE_4_TO_10'; end if;
 if exists(select 1 from public.room_players where room_id=r.id and is_active and kicked_at is null and not is_ready) then raise exception 'ALL_PLAYERS_MUST_BE_READY'; end if;
 update public.room_players rp set team_id=case when x.rn%2=1 then 'A' else 'B' end
 from (select player_id,row_number() over(order by gen_random_uuid()) rn from public.room_players where room_id=r.id and is_active and kicked_at is null) x
 where rp.room_id=r.id and rp.player_id=x.player_id;
 insert into public.forest_treasure_sessions(room_id,phase,turn_number,current_team,team_state,last_action,event_log,winner,phase_deadline_at,state_version)
 values(r.id,'expedition',0,'A','{"A":{"progress":0,"fragments":0,"food":3,"rope":1,"torch":1,"morale":3},"B":{"progress":0,"fragments":0,"food":3,"rope":1,"torch":1,"morale":3}}'::jsonb,null,'[]'::jsonb,null,now()+interval '30 seconds',1)
 on conflict(room_id) do update set phase='expedition',turn_number=0,current_team='A',
 team_state='{"A":{"progress":0,"fragments":0,"food":3,"rope":1,"torch":1,"morale":3},"B":{"progress":0,"fragments":0,"food":3,"rope":1,"torch":1,"morale":3}}'::jsonb,
 last_action=null,event_log='[]'::jsonb,winner=null,phase_deadline_at=now()+interval '30 seconds',
 state_version=public.forest_treasure_sessions.state_version+1,updated_at=now();
 update public.rooms set current_round=1,total_rounds=8,phase_started_at=now(),phase_deadline_at=now()+interval '30 seconds',state_version=state_version+1,updated_at=now() where id=r.id;
 return public.forest_treasure_get_state(p_room_code);
end $function$


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
  'players',(select coalesce(jsonb_agg(jsonb_build_object('player_id',p.player_id,'name',p.name,'avatar_key',p.avatar_key,'is_ready',p.is_ready,'team_id',p.team_id) order by p.joined_at),'[]'::jsonb) from public.room_players p where p.room_id=r.id and p.is_active and p.kicked_at is null)); end if;
 return jsonb_build_object('mode','orman_hazinesi','phase',s.phase,'turn_number',s.turn_number,'current_team',s.current_team,
 'team_state',s.team_state,'last_action',s.last_action,'event_log',s.event_log,'winner',s.winner,'phase_deadline_at',s.phase_deadline_at,
 'state_version',s.state_version,'my_team',(select p.team_id from public.room_players p where p.room_id=r.id and p.player_id=auth.uid()),
 'is_host',r.host_id=auth.uid(),'players',(select coalesce(jsonb_agg(jsonb_build_object('player_id',p.player_id,'name',p.name,'avatar_key',p.avatar_key,'is_ready',p.is_ready,'team_id',p.team_id) order by p.joined_at),'[]'::jsonb) from public.room_players p where p.room_id=r.id and p.is_active and p.kicked_at is null));
end $function$


CREATE OR REPLACE FUNCTION public.forest_treasure_move(p_room_code text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare r public.rooms%rowtype; s public.forest_treasure_sessions%rowtype; t text; other_t text; ts jsonb; other_s jsonb;
 p integer; f integer; food_n integer; rope_n integer; torch_n integer; morale_n integer; msg text; turn_n integer; winner_n text; ev jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select x.* into r from public.rooms x join public.room_players rp on rp.room_id=x.id
 where x.code=upper(trim(p_room_code)) and rp.player_id=auth.uid() and rp.is_active and rp.kicked_at is null for update of x;
 if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
 select * into s from public.forest_treasure_sessions where room_id=r.id for update;
 if not found or s.phase<>'expedition' then raise exception 'EXPEDITION_NOT_ACTIVE'; end if;
 if s.phase_deadline_at<now() then raise exception 'TURN_EXPIRED'; end if;
 select team_id into t from public.room_players where room_id=r.id and player_id=auth.uid();
 if t is distinct from s.current_team then raise exception 'NOT_YOUR_TEAM_TURN'; end if;
 if p_action not in ('explore','forage','use_rope','use_torch','camp') then raise exception 'INVALID_ACTION'; end if;
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
 end case;
 if p_action in ('use_rope','use_torch') then
  if p>=2 and f<1 then f:=1;msg:=msg||' İlk harita parçası bulundu!'; end if;
  if p>=4 and f<2 then f:=2;msg:=msg||' İkinci harita parçası bulundu!'; end if;
  if p>=6 and f<3 then f:=3;msg:=msg||' Son harita parçası bulundu!'; end if;
 end if;
 ts:=jsonb_build_object('progress',least(8,p),'fragments',least(3,f),'food',least(9,food_n),'rope',least(9,rope_n),'torch',least(9,torch_n),'morale',least(5,morale_n));
 ts:=jsonb_set(s.team_state,array[t],ts,true);turn_n:=s.turn_number+1;winner_n:=null;
 if p>=7 and f>=3 then winner_n:=t;
 elsif turn_n>=16 then
  if coalesce((ts->'A'->>'progress')::int,0)>coalesce((ts->'B'->>'progress')::int,0) then winner_n:='A';
  elsif coalesce((ts->'B'->>'progress')::int,0)>coalesce((ts->'A'->>'progress')::int,0) then winner_n:='B';
  else winner_n:='draw'; end if;
 end if;
 ev:=jsonb_build_object('turn',turn_n,'team',t,'action',p_action,'message',msg,'at',now());
 update public.forest_treasure_sessions set phase=case when winner_n is null then 'expedition' else 'finished' end,
 turn_number=turn_n,current_team=case when t='A' then 'B' else 'A' end,team_state=ts,last_action=ev,
 event_log=event_log||jsonb_build_array(ev),winner=winner_n,phase_deadline_at=case when winner_n is null then now()+interval '30 seconds' else null end,
 state_version=state_version+1,updated_at=now() where room_id=r.id;
 update public.rooms set current_round=least(8,ceil(turn_n::numeric/2)::int),phase_started_at=now(),
 phase_deadline_at=case when winner_n is null then now()+interval '30 seconds' else null end,state_version=state_version+1,updated_at=now() where id=r.id;
 return public.forest_treasure_get_state(p_room_code);
end $function$


CREATE OR REPLACE FUNCTION public.forest_treasure_advance(p_room_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare r public.rooms%rowtype; s public.forest_treasure_sessions%rowtype; n integer; t text; ev jsonb; w text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select x.* into r from public.rooms x join public.room_players rp on rp.room_id=x.id where x.code=upper(trim(p_room_code)) and rp.player_id=auth.uid() and rp.is_active and rp.kicked_at is null;
 if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
 if r.host_id<>auth.uid() then raise exception 'HOST_ONLY'; end if;
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
end $function$


revoke all on function public.forest_treasure_start(text) from public,anon;
revoke all on function public.forest_treasure_get_state(text) from public,anon;
revoke all on function public.forest_treasure_move(text,text) from public,anon;
revoke all on function public.forest_treasure_advance(text) from public,anon;
grant execute on function public.forest_treasure_start(text) to authenticated;
grant execute on function public.forest_treasure_get_state(text) to authenticated;
grant execute on function public.forest_treasure_move(text,text) to authenticated;
grant execute on function public.forest_treasure_advance(text) to authenticated;
commit;