-- Gizli Tilki tactical social-deduction mode.
-- Additive migration: reuses rooms/room_players and keeps hidden role/action data private.
begin;

alter table public.rooms drop constraint if exists rooms_game_mode_check;
alter table public.rooms add constraint rooms_game_mode_check
  check (game_mode = any (array[
    'classic','survival','suspicious','blitz','team_battle','secret_missions',
    'double_trap','golden_question','detective_fox','gizli_tilki'
  ]::text[]));

create table if not exists public.gizli_tilki_sessions (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  phase text not null default 'lobby'
    check (phase in ('lobby','briefing','operation_select','team_vote','secret_action','debrief','finished')),
  operation_round integer not null default 0 check (operation_round between 0 and 5),
  resources jsonb not null default '{"energy":6,"parts":5,"trust":4}'::jsonb,
  selected_operation text,
  proposed_team uuid[] not null default '{}'::uuid[],
  last_report jsonb,
  successful_operations integer not null default 0 check (successful_operations between 0 and 5),
  failed_operations integer not null default 0 check (failed_operations between 0 and 5),
  winner text check (winner is null or winner in ('crew','saboteurs')),
  phase_deadline_at timestamptz,
  state_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gizli_tilki_private_roles (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null,
  role_name text not null check (role_name in ('operator','engineer','scout','saboteur')),
  loyalty text not null check (loyalty in ('crew','saboteurs')),
  private_clue text not null default '',
  created_at timestamptz not null default now(),
  primary key (room_id, player_id),
  foreign key (room_id, player_id) references public.room_players(room_id, player_id) on delete cascade
);

create table if not exists public.gizli_tilki_actions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  operation_round integer not null,
  player_id uuid not null,
  action_kind text not null check (action_kind in ('support','repair','intel','sabotage','pass')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (room_id, operation_round, player_id),
  foreign key (room_id, player_id) references public.room_players(room_id, player_id) on delete cascade
);

create table if not exists public.gizli_tilki_votes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  operation_round integer not null,
  voter_id uuid not null,
  vote_kind text not null check (vote_kind in ('team_approve','suspect')),
  target_player_id uuid,
  approve boolean,
  created_at timestamptz not null default now(),
  primary key (room_id, operation_round, voter_id, vote_kind),
  foreign key (room_id, voter_id) references public.room_players(room_id, player_id) on delete cascade
);

alter table public.gizli_tilki_sessions enable row level security;
alter table public.gizli_tilki_private_roles enable row level security;
alter table public.gizli_tilki_actions enable row level security;
alter table public.gizli_tilki_votes enable row level security;
revoke all on public.gizli_tilki_sessions, public.gizli_tilki_private_roles,
  public.gizli_tilki_actions, public.gizli_tilki_votes from anon, authenticated;
grant select, insert, update, delete on public.gizli_tilki_sessions,
  public.gizli_tilki_private_roles, public.gizli_tilki_actions,
  public.gizli_tilki_votes to service_role;

create or replace function public.gizli_tilki_start(p_room_code text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_room public.rooms%rowtype;
  v_count integer;
  v_saboteurs integer;
  v_player record;
  v_index integer := 0;
  v_role text;
  v_loyalty text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_room from public.rooms where code = upper(trim(p_room_code)) for update;
  if not found or v_room.game_mode <> 'gizli_tilki' then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'HOST_ONLY'; end if;
  select count(*) into v_count from public.room_players
    where room_id = v_room.id and is_active and kicked_at is null;
  if v_count < 4 or v_count > 10 then raise exception 'PLAYER_COUNT_MUST_BE_4_TO_10'; end if;
  if exists (select 1 from public.room_players where room_id=v_room.id and is_active and kicked_at is null and not is_ready) then
    raise exception 'ALL_PLAYERS_MUST_BE_READY';
  end if;

  insert into public.gizli_tilki_sessions(room_id, phase, operation_round, resources,
      phase_deadline_at, state_version)
    values(v_room.id,'briefing',0,'{"energy":6,"parts":5,"trust":4}'::jsonb,now()+interval '20 seconds',1)
    on conflict(room_id) do update set phase='briefing', operation_round=0,
      resources='{"energy":6,"parts":5,"trust":4}'::jsonb, selected_operation=null,
      proposed_team='{}'::uuid[], last_report=null, successful_operations=0,
      failed_operations=0, winner=null, phase_deadline_at=now()+interval '20 seconds',
      state_version=public.gizli_tilki_sessions.state_version+1, updated_at=now();

  delete from public.gizli_tilki_private_roles where room_id=v_room.id;
  delete from public.gizli_tilki_actions where room_id=v_room.id;
  delete from public.gizli_tilki_votes where room_id=v_room.id;
  update public.room_players set team_id=null where room_id=v_room.id;

  v_saboteurs := case when v_count >= 8 then 2 else 1 end;
  for v_player in
    select player_id from public.room_players
    where room_id=v_room.id and is_active and kicked_at is null
    order by gen_random_uuid()
  loop
    v_index := v_index + 1;
    if v_index <= v_saboteurs then
      v_role := 'saboteur'; v_loyalty := 'saboteurs';
    else
      v_role := case when v_index % 3 = 0 then 'engineer'
                     when v_index % 3 = 1 then 'operator' else 'scout' end;
      v_loyalty := 'crew';
    end if;
    insert into public.gizli_tilki_private_roles(room_id,player_id,role_name,loyalty,private_clue)
    values(v_room.id,v_player.player_id,v_role,v_loyalty,
      case when v_loyalty='saboteurs' then 'Sabotaj ekibini tanırsın. Kaynakları tüketip operasyonları başarısız kıl.'
           when v_role='engineer' then 'Tamir hamlen operasyonun riskini düşürür ve parça yönetiminde kritiksin.'
           when v_role='scout' then 'İstihbarat hamlen operasyon öncesi risk hakkında ek bilgi sağlar.'
           else 'Destek hamlen enerji ve operasyon başarısı için önemlidir.' end);
  end loop;
  update public.rooms set current_round=1,total_rounds=5,phase_started_at=now(),
    phase_deadline_at=now()+interval '20 seconds',state_version=state_version+1,updated_at=now()
    where id=v_room.id;
  return public.gizli_tilki_get_state(p_room_code);
end;
$$;

create or replace function public.gizli_tilki_get_state(p_room_code text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_room public.rooms%rowtype; v_state public.gizli_tilki_sessions%rowtype;
        v_role public.gizli_tilki_private_roles%rowtype; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.* into v_room from public.rooms r join public.room_players rp on rp.room_id=r.id
    where r.code=upper(trim(p_room_code)) and rp.player_id=auth.uid()
      and rp.is_active and rp.kicked_at is null;
  if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
  select * into v_state from public.gizli_tilki_sessions where room_id=v_room.id;
  if not found then
    return jsonb_build_object('mode','gizli_tilki','phase','lobby','state_version',v_room.state_version,
      'players',(select coalesce(jsonb_agg(jsonb_build_object('player_id',rp.player_id,'name',rp.name,'avatar_key',rp.avatar_key,'is_ready',rp.is_ready,'team_id',rp.team_id) order by rp.joined_at),'[]'::jsonb)
        from public.room_players rp where rp.room_id=v_room.id and rp.is_active and rp.kicked_at is null));
  end if;
  select * into v_role from public.gizli_tilki_private_roles
    where room_id=v_room.id and player_id=auth.uid();
  select jsonb_build_object(
    'mode','gizli_tilki','phase',v_state.phase,'operation_round',v_state.operation_round,
    'resources',v_state.resources,'selected_operation',v_state.selected_operation,
    'proposed_team',to_jsonb(v_state.proposed_team),'last_report',v_state.last_report,
    'successful_operations',v_state.successful_operations,'failed_operations',v_state.failed_operations,
    'winner',v_state.winner,'phase_deadline_at',v_state.phase_deadline_at,
    'state_version',v_state.state_version,
    'my_role',case when v_role.player_id is null then null else jsonb_build_object('role_name',v_role.role_name,'loyalty',v_role.loyalty,'private_clue',v_role.private_clue) end,
    'players',(select coalesce(jsonb_agg(jsonb_build_object('player_id',rp.player_id,'name',rp.name,'avatar_key',rp.avatar_key,'is_ready',rp.is_ready,'team_id',rp.team_id) order by rp.joined_at),'[]'::jsonb)
      from public.room_players rp where rp.room_id=v_room.id and rp.is_active and rp.kicked_at is null),
    'my_action_submitted',exists(select 1 from public.gizli_tilki_actions a where a.room_id=v_room.id and a.operation_round=v_state.operation_round and a.player_id=auth.uid()),
    'my_team_vote_submitted',exists(select 1 from public.gizli_tilki_votes v where v.room_id=v_room.id and v.operation_round=v_state.operation_round and v.voter_id=auth.uid() and v.vote_kind='team_approve')
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.gizli_tilki_choose_operation(p_room_code text, p_operation text, p_team_player_ids uuid[])
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_room public.rooms%rowtype; v_state public.gizli_tilki_sessions%rowtype; v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.* into v_room from public.rooms r join public.room_players rp on rp.room_id=r.id
    where r.code=upper(trim(p_room_code)) and rp.player_id=auth.uid() and rp.is_active and rp.kicked_at is null;
  if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
  select * into v_state from public.gizli_tilki_sessions where room_id=v_room.id for update;
  if v_state.phase not in ('briefing','operation_select') then raise exception 'INVALID_PHASE'; end if;
  if v_state.phase_deadline_at < now() then raise exception 'DEADLINE_EXPIRED'; end if;
  if cardinality(p_team_player_ids) < 2 or cardinality(p_team_player_ids) > 5 then raise exception 'TEAM_SIZE_INVALID'; end if;
  if (select count(distinct x) from unnest(p_team_player_ids) x) <> cardinality(p_team_player_ids) then raise exception 'DUPLICATE_TEAM_MEMBER'; end if;
  if exists(select 1 from unnest(p_team_player_ids) x where not exists(
    select 1 from public.room_players rp where rp.room_id=v_room.id and rp.player_id=x and rp.is_active and rp.kicked_at is null)) then raise exception 'INVALID_TEAM_MEMBER'; end if;
  if p_operation not in ('power_relay','surveillance','vault','network','supply_run') then raise exception 'INVALID_OPERATION'; end if;
  select count(*) into v_count from public.room_players where room_id=v_room.id and is_active and kicked_at is null;
  if v_room.host_id <> auth.uid() and not exists(select 1 from public.gizli_tilki_private_roles where room_id=v_room.id and player_id=auth.uid() and role_name='operator') then
    raise exception 'OPERATOR_OR_HOST_ONLY';
  end if;
  update public.gizli_tilki_sessions set phase='team_vote',selected_operation=p_operation,
    proposed_team=p_team_player_ids,phase_deadline_at=now()+interval '20 seconds',
    state_version=state_version+1,updated_at=now() where room_id=v_room.id;
  delete from public.gizli_tilki_votes where room_id=v_room.id and operation_round=v_state.operation_round and vote_kind='team_approve';
  return public.gizli_tilki_get_state(p_room_code);
end $$;

create or replace function public.gizli_tilki_vote_team(p_room_code text,p_approve boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_room public.rooms%rowtype; v_state public.gizli_tilki_sessions%rowtype; v_total integer; v_votes integer; v_yes integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.* into v_room from public.rooms r join public.room_players rp on rp.room_id=r.id
    where r.code=upper(trim(p_room_code)) and rp.player_id=auth.uid() and rp.is_active and rp.kicked_at is null;
  if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
  select * into v_state from public.gizli_tilki_sessions where room_id=v_room.id for update;
  if v_state.phase<>'team_vote' or v_state.phase_deadline_at<now() then raise exception 'INVALID_PHASE_OR_DEADLINE'; end if;
  insert into public.gizli_tilki_votes(room_id,operation_round,voter_id,vote_kind,approve)
  values(v_room.id,v_state.operation_round,auth.uid(),'team_approve',p_approve)
  on conflict(room_id,operation_round,voter_id,vote_kind) do update set approve=excluded.approve,created_at=now();
  select count(*) into v_total from public.room_players where room_id=v_room.id and is_active and kicked_at is null;
  select count(*),count(*) filter(where approve) into v_votes,v_yes from public.gizli_tilki_votes
    where room_id=v_room.id and operation_round=v_state.operation_round and vote_kind='team_approve';
  if v_votes=v_total then
    if v_yes > v_total/2 then
      update public.gizli_tilki_sessions set phase='secret_action',phase_deadline_at=now()+interval '15 seconds',
        state_version=state_version+1,updated_at=now() where room_id=v_room.id;
    else
      update public.gizli_tilki_sessions set phase='operation_select',selected_operation=null,
        proposed_team='{}'::uuid[],phase_deadline_at=now()+interval '20 seconds',
        state_version=state_version+1,updated_at=now() where room_id=v_room.id;
    end if;
  end if;
  return public.gizli_tilki_get_state(p_room_code);
end $$;

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

create or replace function public.gizli_tilki_vote_suspect(p_room_code text,p_suspect_player_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $
declare v_room public.rooms%rowtype; v_state public.gizli_tilki_sessions%rowtype; v_tally jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.* into v_room from public.rooms r join public.room_players rp on rp.room_id=r.id
    where r.code=upper(trim(p_room_code)) and rp.player_id=auth.uid() and rp.is_active and rp.kicked_at is null;
  if not found then raise exception 'ROOM_MEMBERSHIP_REQUIRED'; end if;
  select * into v_state from public.gizli_tilki_sessions where room_id=v_room.id for update;
  if v_state.phase<>'debrief' or v_state.phase_deadline_at<now() then raise exception 'INVALID_PHASE_OR_DEADLINE'; end if;
  if not exists(select 1 from public.room_players where room_id=v_room.id and player_id=p_suspect_player_id and is_active and kicked_at is null) then
    raise exception 'INVALID_SUSPECT';
  end if;
  if p_suspect_player_id=auth.uid() then raise exception 'CANNOT_VOTE_FOR_SELF'; end if;
  insert into public.gizli_tilki_votes(room_id,operation_round,voter_id,vote_kind,target_player_id)
    values(v_room.id,v_state.operation_round,auth.uid(),'suspect',p_suspect_player_id)
    on conflict(room_id,operation_round,voter_id,vote_kind) do update set target_player_id=excluded.target_player_id,created_at=now();
  select coalesce(jsonb_object_agg(t.target_player_id::text,t.vote_count),'{}'::jsonb) into v_tally
    from (select target_player_id,count(*)::integer as vote_count from public.gizli_tilki_votes
      where room_id=v_room.id and operation_round=v_state.operation_round and vote_kind='suspect'
      group by target_player_id) t;
  update public.gizli_tilki_sessions set last_report=coalesce(last_report,'{}'::jsonb)||jsonb_build_object('suspect_votes',v_tally),
    state_version=state_version+1,updated_at=now() where room_id=v_room.id;
  return public.gizli_tilki_get_state(p_room_code);
end $;

revoke all on function public.gizli_tilki_start(text) from public, anon;
revoke all on function public.gizli_tilki_get_state(text) from public, anon;
revoke all on function public.gizli_tilki_choose_operation(text,text,uuid[]) from public, anon;
revoke all on function public.gizli_tilki_vote_team(text,boolean) from public, anon;
revoke all on function public.gizli_tilki_submit_action(text,text) from public, anon;
revoke all on function public.gizli_tilki_advance(text) from public, anon;
revoke all on function public.gizli_tilki_vote_suspect(text,uuid) from public, anon;
grant execute on function public.gizli_tilki_start(text) to authenticated;
grant execute on function public.gizli_tilki_get_state(text) to authenticated;
grant execute on function public.gizli_tilki_choose_operation(text,text,uuid[]) to authenticated;
grant execute on function public.gizli_tilki_vote_team(text,boolean) to authenticated;
grant execute on function public.gizli_tilki_submit_action(text,text) to authenticated;
grant execute on function public.gizli_tilki_advance(text) to authenticated;
grant execute on function public.gizli_tilki_vote_suspect(text,uuid) to authenticated;

commit;
