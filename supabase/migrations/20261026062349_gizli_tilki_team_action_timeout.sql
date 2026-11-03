-- Tighten the operation loop: only the proposed team can submit an action.
-- If no operator chooses before the server deadline, create a default team vote.
create or replace function public.gizli_tilki_submit_action(p_room_code text,p_action text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_room public.rooms%rowtype; v_state public.gizli_tilki_sessions%rowtype; v_role public.gizli_tilki_private_roles%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.* into v_room from public.rooms r join public.room_players rp on rp.room_id=r.id
    where r.code=upper(trim(p_room_code)) and rp.player_id=auth.uid() and rp.is_active and rp.kicked_at is null;
  if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
  select * into v_state from public.gizli_tilki_sessions where room_id=v_room.id for update;
  if v_state.phase<>'secret_action' or v_state.phase_deadline_at<now() then raise exception 'INVALID_PHASE_OR_DEADLINE'; end if;
  if not (auth.uid() = any(v_state.proposed_team)) then raise exception 'PLAYER_NOT_ON_PROPOSED_TEAM'; end if;
  select * into v_role from public.gizli_tilki_private_roles where room_id=v_room.id and player_id=auth.uid();
  if not found then raise exception 'ROLE_NOT_ASSIGNED'; end if;
  if p_action not in ('support','repair','intel','sabotage','pass') then raise exception 'INVALID_ACTION'; end if;
  if v_role.loyalty='crew' and p_action='sabotage' then raise exception 'ROLE_CANNOT_SABOTAGE'; end if;
  if v_role.loyalty='saboteurs' and p_action in ('repair','support') then raise exception 'ROLE_CANNOT_SUPPORT'; end if;
  insert into public.gizli_tilki_actions(room_id,operation_round,player_id,action_kind)
    values(v_room.id,v_state.operation_round,auth.uid(),p_action)
    on conflict(room_id,operation_round,player_id) do nothing;
  return public.gizli_tilki_get_state(p_room_code);
end $$;

create or replace function public.gizli_tilki_advance(p_room_code text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_room public.rooms%rowtype; v_state public.gizli_tilki_sessions%rowtype;
  v_total integer; v_actions integer; v_sabotage integer; v_support integer; v_repair integer;
  v_energy integer; v_parts integer; v_trust integer; v_success boolean; v_report jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.* into v_room from public.rooms r join public.room_players rp on rp.room_id=r.id
    where r.code=upper(trim(p_room_code)) and rp.player_id=auth.uid() and rp.is_active and rp.kicked_at is null;
  if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
  if v_room.host_id<>auth.uid() then raise exception 'HOST_ONLY'; end if;
  select * into v_state from public.gizli_tilki_sessions where room_id=v_room.id for update;
  if v_state.phase_deadline_at>now() then raise exception 'DEADLINE_NOT_REACHED'; end if;
  if v_state.phase='briefing' then
    update public.gizli_tilki_sessions set phase='operation_select',phase_deadline_at=now()+interval '20 seconds',
      state_version=state_version+1,updated_at=now() where room_id=v_room.id;
  elsif v_state.phase='secret_action' then
    select count(*) into v_total from public.room_players where room_id=v_room.id and is_active and kicked_at is null;
    select count(*) into v_actions from public.gizli_tilki_actions where room_id=v_room.id and operation_round=v_state.operation_round;
    select count(*) filter(where action_kind='sabotage'),count(*) filter(where action_kind='support'),
      count(*) filter(where action_kind='repair') into v_sabotage,v_support,v_repair
      from public.gizli_tilki_actions where room_id=v_room.id and operation_round=v_state.operation_round;
    v_energy:=coalesce((v_state.resources->>'energy')::integer,0);
    v_parts:=coalesce((v_state.resources->>'parts')::integer,0);
    v_trust:=coalesce((v_state.resources->>'trust')::integer,0);
    v_success := v_sabotage=0 and (v_support+v_repair)>=1 and v_energy>=1 and v_parts>=0;
    v_energy:=greatest(0,v_energy-1);
    if v_repair>0 then v_parts:=greatest(0,v_parts-1); else v_trust:=greatest(0,v_trust-1); end if;
    if v_sabotage>0 then v_trust:=greatest(0,v_trust-v_sabotage); v_energy:=greatest(0,v_energy-v_sabotage); end if;
    v_report:=jsonb_build_object('operation',v_state.selected_operation,'success',v_success,
      'support_count',v_support,'repair_count',v_repair,'resources',jsonb_build_object('energy',v_energy,'parts',v_parts,'trust',v_trust),
      'message',case when v_success then 'Operasyon tamamlandı. Tilkiler iyi iş çıkardı… belki.' else 'Operasyon aksadı. Birileri kablolarla fazla samimi olmuş.' end);
    update public.gizli_tilki_sessions set phase='debrief',operation_round=operation_round+1,
      resources=jsonb_build_object('energy',v_energy,'parts',v_parts,'trust',v_trust),
      last_report=v_report,successful_operations=successful_operations+(case when v_success then 1 else 0 end),
      failed_operations=failed_operations+(case when v_success then 0 else 1 end),
      phase_deadline_at=now()+interval '20 seconds',state_version=state_version+1,updated_at=now()
      where room_id=v_room.id;
    update public.gizli_tilki_sessions set winner=case
      when successful_operations>=3 then 'crew'
      when failed_operations>=3 or operation_round>=5 or (v_energy=0 and v_parts=0 and v_trust=0) then 'saboteurs'
      else null end,
      phase=case when successful_operations>=3 or failed_operations>=3 or operation_round>=5 or (v_energy=0 and v_parts=0 and v_trust=0) then 'finished' else 'debrief' end,
      phase_deadline_at=case when successful_operations>=3 or failed_operations>=3 or operation_round>=5 or (v_energy=0 and v_parts=0 and v_trust=0) then null else now()+interval '20 seconds' end
      where room_id=v_room.id;
  elsif v_state.phase='operation_select' then
    update public.gizli_tilki_sessions set phase='team_vote',selected_operation='power_relay',
      proposed_team=array(select rp.player_id from public.room_players rp
        where rp.room_id=v_room.id and rp.is_active and rp.kicked_at is null order by rp.joined_at limit 3),
      phase_deadline_at=now()+interval '20 seconds',state_version=state_version+1,updated_at=now()
      where room_id=v_room.id;
  elsif v_state.phase='team_vote' then
    select count(*) into v_total from public.room_players where room_id=v_room.id and is_active and kicked_at is null;
    select count(*),count(*) filter(where approve) into v_actions,v_support
      from public.gizli_tilki_votes where room_id=v_room.id and operation_round=v_state.operation_round and vote_kind='team_approve';
    if v_actions=v_total and v_support>v_total/2 then
      update public.gizli_tilki_sessions set phase='secret_action',phase_deadline_at=now()+interval '15 seconds',
        state_version=state_version+1,updated_at=now() where room_id=v_room.id;
    else
      update public.gizli_tilki_sessions set phase='operation_select',selected_operation=null,
        proposed_team='{}'::uuid[],phase_deadline_at=now()+interval '20 seconds',
        state_version=state_version+1,updated_at=now() where room_id=v_room.id;
    end if;
  elsif v_state.phase='debrief' then
    update public.gizli_tilki_sessions set phase='operation_select',selected_operation=null,
      proposed_team='{}'::uuid[],phase_deadline_at=now()+interval '20 seconds',
      state_version=state_version+1,updated_at=now() where room_id=v_room.id;
  else raise exception 'PHASE_CANNOT_ADVANCE'; end if;
  update public.rooms set state_version=state_version+1,updated_at=now() where id=v_room.id;
  return public.gizli_tilki_get_state(p_room_code);
end $$;
