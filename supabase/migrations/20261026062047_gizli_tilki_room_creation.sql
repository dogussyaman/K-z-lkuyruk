-- Permit the already-authenticated room creation RPC to accept Gizli Tilki.
-- Preserve the existing secure creation flow and only extend mode validation/bounds.
create or replace function public.create_room_with_mode_secure(
  p_code character varying,
  p_name character varying,
  p_avatar_key character varying,
  p_total_rounds integer,
  p_round_seconds integer,
  p_categories text[],
  p_is_private boolean,
  p_password text,
  p_game_mode text
)
returns table(room_id uuid, room_code character varying, host_id uuid)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_room_id uuid;
  v_room_code character varying;
  v_host_id uuid;
  v_min_players integer := 2;
  v_max_players integer := 10;
  v_round_seconds integer := p_round_seconds;
begin
  if auth.uid() is null then
    raise exception 'Oturum açılması gerekiyor';
  end if;

  if p_game_mode is null or p_game_mode not in (
    'classic','survival','suspicious','blitz','team_battle',
    'secret_missions','double_trap','golden_question','detective_fox','gizli_tilki'
  ) then
    raise exception 'Desteklenmeyen oyun modu';
  end if;

  case p_game_mode
    when 'team_battle' then v_min_players := 4;
    when 'secret_missions' then v_min_players := 3; v_max_players := 8;
    when 'double_trap' then v_max_players := 6;
    when 'detective_fox' then v_min_players := 4;
    when 'gizli_tilki' then v_min_players := 4;
    when 'blitz' then v_round_seconds := 7;
    else null;
  end case;

  select created.room_id, created.room_code, created.host_id
    into v_room_id, v_room_code, v_host_id
    from public.create_room_secure(
      p_code, p_name, p_avatar_key, p_total_rounds,
      v_round_seconds, p_categories, p_is_private, p_password
    ) as created;

  update public.rooms
    set game_mode = p_game_mode,
        min_players = v_min_players,
        max_players = v_max_players,
        round_seconds = v_round_seconds,
        survival_finished = false,
        updated_at = now()
    where id = v_room_id;

  return query select v_room_id, v_room_code, v_host_id;
end;
$function$;
