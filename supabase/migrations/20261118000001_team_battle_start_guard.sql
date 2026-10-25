-- Kızılkuyruk: Team Battle V1 lobby/start safety.
-- Adds deterministic host-only balancing and a reusable server-side start guard.

CREATE OR REPLACE FUNCTION public.validate_team_battle_start_secure(p_room_code CHARACTER VARYING)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_team_a_count INTEGER;
  v_team_b_count INTEGER;
  v_unassigned_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code);
  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.host_id <> auth.uid() THEN RAISE EXCEPTION 'Oyunu yalnızca oda sahibi başlatabilir'; END IF;
  IF v_room.game_mode <> 'team_battle' THEN RETURN TRUE; END IF;

  SELECT COUNT(*) FILTER (WHERE team_id = 'A'),
         COUNT(*) FILTER (WHERE team_id = 'B'),
         COUNT(*) FILTER (WHERE team_id IS NULL)
  INTO v_team_a_count, v_team_b_count, v_unassigned_count
  FROM public.room_players
  WHERE room_id = v_room.id AND is_active = TRUE;

  IF v_unassigned_count > 0 THEN
    RAISE EXCEPTION 'Takım Savaşı başlamadan önce tüm oyuncular bir takıma atanmalıdır';
  END IF;
  IF v_team_a_count < 2 OR v_team_b_count < 2 THEN
    RAISE EXCEPTION 'Takım Savaşı için her takımda en az 2 oyuncu olmalıdır';
  END IF;
  IF ABS(v_team_a_count - v_team_b_count) > 1 THEN
    RAISE EXCEPTION 'Takımlar dengeli olmalıdır; oyuncu farkı en fazla 1 olabilir';
  END IF;
  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_team_battle_start_secure(CHARACTER VARYING) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_team_battle_start_secure(CHARACTER VARYING) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_balance_teams_secure(p_room_code CHARACTER VARYING)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_player RECORD;
  v_index INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.host_id <> auth.uid() THEN RAISE EXCEPTION 'Takımları yalnızca oda sahibi düzenleyebilir'; END IF;
  IF v_room.game_mode <> 'team_battle' OR v_room.phase <> 'lobby' THEN
    RAISE EXCEPTION 'Otomatik dengeleme yalnızca Takım Savaşı lobisinde kullanılabilir';
  END IF;

  FOR v_player IN
    SELECT player_id FROM public.room_players
    WHERE room_id = v_room.id AND is_active = TRUE
    ORDER BY joined_at, player_id
  LOOP
    UPDATE public.room_players
    SET team_id = CASE WHEN MOD(v_index, 2) = 0 THEN 'A' ELSE 'B' END
    WHERE room_id = v_room.id AND player_id = v_player.player_id;
    v_index := v_index + 1;
  END LOOP;
  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_balance_teams_secure(CHARACTER VARYING) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_balance_teams_secure(CHARACTER VARYING) TO authenticated, service_role;
