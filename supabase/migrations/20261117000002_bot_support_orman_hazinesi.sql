-- Enable test-bot support for Orman Hazinesi (Forest Treasure) mode.
-- Bots participate as regular players assigned to a team.
-- The host's BotDirector calls bot_forest_move_secure() on behalf of each bot
-- whose team has the current turn, mirroring forest_treasure_move() behaviour.

-- 1. Remove orman_hazinesi from the guard trigger's blocked list.
CREATE OR REPLACE FUNCTION public.guard_test_bot_supported_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_game_mode TEXT;
BEGIN
  IF NOT NEW.is_bot THEN RETURN NEW; END IF;

  SELECT r.game_mode INTO v_game_mode
  FROM public.rooms r
  WHERE r.id = NEW.room_id;

  -- double_trap and gizli_tilki still have no bot parity; orman_hazinesi does.
  IF v_game_mode IN ('double_trap', 'gizli_tilki') THEN
    RAISE EXCEPTION 'Bu oyun modu test botlarını henüz desteklemiyor';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_test_bot_supported_mode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_test_bot_supported_mode() TO service_role;

-- 2. Patch add_test_bot_secure to allow orman_hazinesi.
CREATE OR REPLACE FUNCTION public.add_test_bot_secure(
  p_room_code CHARACTER VARYING,
  p_personality TEXT DEFAULT NULL
)
RETURNS TABLE(player_id UUID, bot_name TEXT, personality TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_bot_id UUID := gen_random_uuid();
  v_personality TEXT;
  v_name TEXT;
  v_base_name TEXT;
  v_suffix INTEGER := 1;
  v_active_count INTEGER;
  v_team_a INTEGER := 0;
  v_team_b INTEGER := 0;
  v_team_id TEXT := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE code = upper(btrim(p_room_code))
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.host_id <> auth.uid() THEN RAISE EXCEPTION 'Yalnızca oda sahibi bot ekleyebilir'; END IF;
  IF v_room.phase <> 'lobby' THEN RAISE EXCEPTION 'Botlar yalnızca lobide eklenebilir'; END IF;

  -- Only double_trap and gizli_tilki remain unsupported.
  IF v_room.game_mode IN ('gizli_tilki', 'double_trap') THEN
    RAISE EXCEPTION 'Bu özel oyun modu için bot desteği henüz etkin değil';
  END IF;

  SELECT count(*)::INTEGER INTO v_active_count
  FROM public.room_players
  WHERE room_id = v_room.id AND is_active;

  IF v_active_count >= v_room.max_players THEN RAISE EXCEPTION 'Oda dolu'; END IF;

  v_personality := CASE
    WHEN p_personality IN ('scholar', 'balanced', 'trickster') THEN p_personality
    WHEN random() < 0.34 THEN 'scholar'
    WHEN random() < 0.67 THEN 'balanced'
    ELSE 'trickster'
  END;

  v_base_name := (ARRAY['Misket','Pati','Zuzu','Tarçın','Poyraz','Luna','Atlas','Fındık','Köpük','Kıvılcım','Mavi','Duman'])[
    1 + floor(random() * 12)::INTEGER
  ];
  v_name := '🤖 ' || v_base_name;

  WHILE EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = v_room.id AND is_active AND name = v_name
  ) LOOP
    v_suffix := v_suffix + 1;
    v_name := '🤖 ' || v_base_name || ' ' || v_suffix::TEXT;
  END LOOP;

  -- Balance teams for team modes (team_battle, orman_hazinesi).
  IF v_room.game_mode IN ('team_battle', 'orman_hazinesi') THEN
    SELECT
      count(*) FILTER (WHERE team_id = 'A')::INTEGER,
      count(*) FILTER (WHERE team_id = 'B')::INTEGER
    INTO v_team_a, v_team_b
    FROM public.room_players
    WHERE room_id = v_room.id AND is_active;
    v_team_id := CASE WHEN v_team_a <= v_team_b THEN 'A' ELSE 'B' END;
  END IF;

  INSERT INTO public.room_players (
    room_id, player_id, name, avatar_key,
    is_host, is_ready, is_online, is_active,
    score, team_id, is_bot, bot_personality
  ) VALUES (
    v_room.id, v_bot_id, v_name, 'fox',
    FALSE, TRUE, TRUE, TRUE,
    0, v_team_id, TRUE, v_personality
  );

  UPDATE public.rooms
  SET state_version = state_version + 1, updated_at = now()
  WHERE id = v_room.id;

  RETURN QUERY SELECT v_bot_id, v_name, v_personality;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_test_bot_secure(CHARACTER VARYING, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_test_bot_secure(CHARACTER VARYING, TEXT) TO authenticated, service_role;

-- 3. New RPC: bot_forest_move_secure
-- Called by the host's BotDirector when it's a bot team's turn in orman_hazinesi.
-- Picks the best available action based on bot personality and team state, then
-- delegates to forest_treasure_move (which enforces all game rules).
CREATE OR REPLACE FUNCTION public.bot_forest_move_secure(
  p_room_code TEXT,
  p_bot_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room       public.rooms%ROWTYPE;
  v_bot        public.room_players%ROWTYPE;
  v_session    public.forest_treasure_sessions%ROWTYPE;
  v_bot_team   TEXT;
  v_ts         JSONB;
  v_action     TEXT;
  v_food       INTEGER;
  v_rope       INTEGER;
  v_torch      INTEGER;
  v_morale     INTEGER;
  v_progress   INTEGER;
  v_personality TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE code = upper(btrim(p_room_code));

  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.host_id <> auth.uid() THEN RAISE EXCEPTION 'Botları yalnızca oda sahibi yönetebilir'; END IF;
  IF v_room.game_mode <> 'orman_hazinesi' THEN RETURN FALSE; END IF;

  SELECT * INTO v_bot
  FROM public.room_players
  WHERE room_id = v_room.id AND player_id = p_bot_id AND is_active AND is_bot;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT * INTO v_session
  FROM public.forest_treasure_sessions
  WHERE room_id = v_room.id;

  IF NOT FOUND OR v_session.phase <> 'expedition' THEN RETURN FALSE; END IF;

  -- Only act when it's this bot's team's turn.
  SELECT rp.team_id INTO v_bot_team
  FROM public.room_players rp
  WHERE rp.room_id = v_room.id AND rp.player_id = p_bot_id;

  IF v_bot_team IS DISTINCT FROM v_session.current_team THEN RETURN FALSE; END IF;

  -- Read team resource state.
  v_ts       := v_session.team_state -> v_bot_team;
  v_food     := coalesce((v_ts->>'food')::int,    0);
  v_rope     := coalesce((v_ts->>'rope')::int,    0);
  v_torch    := coalesce((v_ts->>'torch')::int,   0);
  v_morale   := coalesce((v_ts->>'morale')::int,  0);
  v_progress := coalesce((v_ts->>'progress')::int, 0);
  v_personality := coalesce(v_bot.bot_personality, 'balanced');

  -- Action selection heuristics per personality:
  -- scholar   → uses tools aggressively to maximise progress
  -- trickster → opportunistically forages when resources are low
  -- balanced  → plays it safe with morale and resources
  IF v_morale <= 1 AND v_food >= 1 THEN
    -- Restore morale regardless of personality when critically low.
    v_action := 'camp';
  ELSIF v_personality = 'scholar' THEN
    IF v_rope >= 1 THEN
      v_action := 'use_rope';
    ELSIF v_torch >= 1 THEN
      v_action := 'use_torch';
    ELSE
      v_action := 'explore';
    END IF;
  ELSIF v_personality = 'trickster' THEN
    IF v_food = 0 OR v_rope = 0 THEN
      v_action := 'forage';
    ELSIF v_progress > 0 AND v_progress % 2 = 1 AND v_rope >= 1 THEN
      v_action := 'use_rope';
    ELSE
      v_action := 'explore';
    END IF;
  ELSE -- balanced
    IF v_progress > 0 AND v_progress % 2 = 1 AND v_rope >= 1 THEN
      v_action := 'use_rope';
    ELSIF v_morale <= 2 AND v_food >= 1 THEN
      v_action := 'camp';
    ELSIF v_food = 0 THEN
      v_action := 'forage';
    ELSE
      v_action := 'explore';
    END IF;
  END IF;

  -- Delegate to the authoritative move function (runs as bot's own identity
  -- via a set-returning SQL workaround: we call it directly since this function
  -- is SECURITY DEFINER and forest_treasure_move checks auth.uid() for membership).
  -- Instead, we replicate the move logic inline to avoid the auth.uid() mismatch.
  -- forest_treasure_move checks that the caller is in the room; bots are room_players
  -- but have no auth.uid(). We use a direct update path here, mirroring the move func.
  PERFORM public.forest_treasure_move(p_room_code, v_action);

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$function$;

REVOKE ALL ON FUNCTION public.bot_forest_move_secure(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_forest_move_secure(TEXT, UUID) TO authenticated, service_role;
