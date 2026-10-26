-- Orman Hazinesi: finding the map is not an instant win; teams must spend a turn to claim the treasure.
begin;
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
 ev:=jsonb_build_object('turn',turn_n,'team',t,'action',p_action,'message',msg,'at',now());
 update public.forest_treasure_sessions set phase=case when winner_n is null then 'expedition' else 'finished' end,
 turn_number=turn_n,current_team=case when t='A' then 'B' else 'A' end,team_state=ts,last_action=ev,
 event_log=event_log||jsonb_build_array(ev),winner=winner_n,phase_deadline_at=case when winner_n is null then now()+interval '30 seconds' else null end,
 state_version=state_version+1,updated_at=now() where room_id=r.id;
 update public.rooms set current_round=least(8,ceil(turn_n::numeric/2)::int),phase_started_at=now(),
 phase_deadline_at=case when winner_n is null then now()+interval '30 seconds' else null end,state_version=state_version+1,updated_at=now() where id=r.id;
 return public.forest_treasure_get_state(p_room_code);
end $function$;
revoke all on function public.forest_treasure_move(text,text) from public,anon;
grant execute on function public.forest_treasure_move(text,text) to authenticated;
commit;