-- Human-like test bots for host-driven QA sessions.
-- Bots are room participants, not auth users, and are excluded from persistent user statistics.

ALTER TABLE public.room_players
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bot_personality TEXT;

ALTER TABLE public.room_players
  DROP CONSTRAINT IF EXISTS room_players_bot_personality_check;
ALTER TABLE public.room_players
  ADD CONSTRAINT room_players_bot_personality_check
  CHECK (bot_personality IS NULL OR bot_personality IN ('scholar', 'balanced', 'trickster'));

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

CREATE OR REPLACE FUNCTION public.list_test_bots_secure(p_room_code CHARACTER VARYING)
RETURNS TABLE(player_id UUID, personality TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;

  SELECT r.id INTO v_room_id
  FROM public.rooms r
  WHERE r.code = upper(btrim(p_room_code));

  IF v_room_id IS NULL OR NOT public.is_room_member(v_room_id) THEN
    RAISE EXCEPTION 'Odaya erişim izniniz yok';
  END IF;

  RETURN QUERY
  SELECT rp.player_id, coalesce(rp.bot_personality, 'balanced')
  FROM public.room_players rp
  WHERE rp.room_id = v_room_id AND rp.is_active AND rp.is_bot
  ORDER BY rp.joined_at, rp.player_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_test_bots_secure(CHARACTER VARYING) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_test_bots_secure(CHARACTER VARYING) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bot_take_turn_secure(
  p_room_code CHARACTER VARYING,
  p_bot_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_bot public.room_players%ROWTYPE;
  v_q public.questions%ROWTYPE;
  v_fake TEXT;
  v_choice_index INTEGER;
  v_remaining INTEGER;
  v_accuracy DOUBLE PRECISION;
  v_detective UUID;
  v_suspect UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE code = upper(btrim(p_room_code))
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.host_id <> auth.uid() THEN RAISE EXCEPTION 'Botları yalnızca oda sahibi yönetebilir'; END IF;
  IF v_room.game_mode IN ('gizli_tilki', 'orman_hazinesi') THEN RETURN FALSE; END IF;

  SELECT * INTO v_bot
  FROM public.room_players
  WHERE room_id = v_room.id AND player_id = p_bot_id AND is_active AND is_bot
  FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_room.game_mode = 'survival' AND v_bot.lives_remaining <= 0 THEN RETURN FALSE; END IF;

  IF v_room.phase = 'ability_select' THEN
    IF v_bot.ability_ready_round = v_room.current_round THEN RETURN TRUE; END IF;

    UPDATE public.room_players
    SET ability_ready_round = v_room.current_round
    WHERE room_id = v_room.id AND player_id = v_bot.player_id;

    SELECT count(*)::INTEGER INTO v_remaining
    FROM public.room_players rp
    WHERE rp.room_id = v_room.id
      AND rp.is_active
      AND (v_room.game_mode <> 'survival' OR rp.lives_remaining > 0)
      AND rp.ability_ready_round <> v_room.current_round;

    IF v_remaining = 0 THEN
      PERFORM public._apply_round_block_effects(v_room.id, v_room.current_round);
      PERFORM public._set_room_phase(v_room.id, 'fake_answer', v_room.round_seconds);
    ELSE
      UPDATE public.rooms SET state_version = state_version + 1, updated_at = now() WHERE id = v_room.id;
    END IF;
    RETURN TRUE;
  END IF;

  IF v_room.phase = 'fake_answer' THEN
    IF v_bot.is_blocked_current_round THEN RETURN TRUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.round_fake_answers fa
      WHERE fa.room_id = v_room.id AND fa.round_number = v_room.current_round AND fa.player_id = v_bot.player_id
    ) THEN RETURN TRUE; END IF;

    SELECT * INTO v_q FROM public.questions WHERE id = v_room.current_question_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    SELECT candidate INTO v_fake
    FROM unnest(v_q.default_decoys) AS candidate
    WHERE btrim(candidate) <> ''
      AND lower(btrim(candidate)) <> lower(btrim(v_q.correct_answer))
      AND NOT EXISTS (
        SELECT 1 FROM public.round_fake_answers fa
        WHERE fa.room_id = v_room.id
          AND fa.round_number = v_room.current_round
          AND lower(btrim(fa.fake_answer)) = lower(btrim(candidate))
      )
    ORDER BY random()
    LIMIT 1;

    IF v_fake IS NULL THEN
      SELECT candidate INTO v_fake
      FROM unnest(ARRAY['Ankara','İstanbul','Bursa','1923','1984','Mars','Venüs','Pasifik Okyanusu','Albert Einstein','Leonardo da Vinci']) AS candidate
      WHERE lower(btrim(candidate)) <> lower(btrim(v_q.correct_answer))
        AND NOT EXISTS (
          SELECT 1 FROM public.round_fake_answers fa
          WHERE fa.room_id = v_room.id
            AND fa.round_number = v_room.current_round
            AND lower(btrim(fa.fake_answer)) = lower(btrim(candidate))
        )
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF v_fake IS NULL THEN v_fake := 'Bence ' || (100 + floor(random() * 900)::INTEGER)::TEXT; END IF;

    INSERT INTO public.round_fake_answers(room_id, round_number, player_id, fake_answer)
    VALUES(v_room.id, v_room.current_round, v_bot.player_id, v_fake)
    ON CONFLICT(room_id, round_number, player_id) DO NOTHING;

    SELECT count(*)::INTEGER INTO v_remaining
    FROM public.room_players rp
    WHERE rp.room_id = v_room.id
      AND rp.is_active
      AND NOT rp.is_blocked_current_round
      AND (v_room.game_mode <> 'survival' OR rp.lives_remaining > 0)
      AND NOT EXISTS (
        SELECT 1 FROM public.round_fake_answers fa
        WHERE fa.room_id = v_room.id AND fa.round_number = v_room.current_round AND fa.player_id = rp.player_id
      );

    IF v_remaining = 0 THEN
      PERFORM public._build_round_choices(v_room.id, v_room.current_round);
      PERFORM public._set_room_phase(v_room.id, 'guess', v_room.round_seconds);
    ELSE
      UPDATE public.rooms SET state_version = state_version + 1, updated_at = now() WHERE id = v_room.id;
    END IF;
    RETURN TRUE;
  END IF;

  IF v_room.phase = 'guess' THEN
    IF EXISTS (
      SELECT 1 FROM public.round_picks p
      WHERE p.room_id = v_room.id AND p.round_number = v_room.current_round AND p.player_id = v_bot.player_id
    ) THEN RETURN TRUE; END IF;

    v_accuracy := CASE coalesce(v_bot.bot_personality, 'balanced')
      WHEN 'scholar' THEN 0.70
      WHEN 'trickster' THEN 0.34
      ELSE 0.48
    END;

    IF random() < v_accuracy THEN
      SELECT c.choice_index INTO v_choice_index
      FROM public.round_choices c
      WHERE c.room_id = v_room.id AND c.round_number = v_room.current_round AND c.is_correct
      ORDER BY random()
      LIMIT 1;
    ELSE
      SELECT c.choice_index INTO v_choice_index
      FROM public.round_choices c
      WHERE c.room_id = v_room.id
        AND c.round_number = v_room.current_round
        AND NOT c.is_correct
        AND c.author_id IS DISTINCT FROM v_bot.player_id
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF v_choice_index IS NULL THEN
      SELECT c.choice_index INTO v_choice_index
      FROM public.round_choices c
      WHERE c.room_id = v_room.id
        AND c.round_number = v_room.current_round
        AND c.author_id IS DISTINCT FROM v_bot.player_id
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF v_choice_index IS NULL THEN RETURN FALSE; END IF;

    IF v_room.game_mode = 'suspicious' THEN
      SELECT rp.player_id INTO v_suspect
      FROM public.room_players rp
      WHERE rp.room_id = v_room.id AND rp.is_active AND rp.player_id <> v_bot.player_id
      ORDER BY random() LIMIT 1;
    ELSIF v_room.game_mode = 'detective_fox' THEN
      SELECT rp.player_id INTO v_detective
      FROM public.room_players rp
      WHERE rp.room_id = v_room.id AND rp.is_active
      ORDER BY rp.player_id
      OFFSET ((v_room.current_round - 1) % GREATEST((SELECT count(*) FROM public.room_players x WHERE x.room_id = v_room.id AND x.is_active), 1))
      LIMIT 1;
      IF v_detective = v_bot.player_id THEN
        SELECT rp.player_id INTO v_suspect
        FROM public.room_players rp
        WHERE rp.room_id = v_room.id AND rp.is_active AND rp.player_id <> v_bot.player_id
        ORDER BY random() LIMIT 1;
      END IF;
    END IF;

    IF v_suspect IS NOT NULL THEN
      INSERT INTO public.round_suspect_picks(room_id, round_number, player_id, suspect_player_id)
      VALUES(v_room.id, v_room.current_round, v_bot.player_id, v_suspect)
      ON CONFLICT(room_id, round_number, player_id) DO NOTHING;
    END IF;

    INSERT INTO public.round_picks(room_id, round_number, player_id, choice_index)
    VALUES(v_room.id, v_room.current_round, v_bot.player_id, v_choice_index)
    ON CONFLICT(room_id, round_number, player_id) DO NOTHING;

    SELECT count(*)::INTEGER INTO v_remaining
    FROM public.room_players rp
    WHERE rp.room_id = v_room.id
      AND rp.is_active
      AND (v_room.game_mode <> 'survival' OR rp.lives_remaining > 0)
      AND NOT EXISTS (
        SELECT 1 FROM public.round_picks p
        WHERE p.room_id = v_room.id AND p.round_number = v_room.current_round AND p.player_id = rp.player_id
      );

    IF v_remaining = 0 THEN
      PERFORM public.resolve_round_authoritative(v_room.id, v_room.current_round);
    ELSE
      UPDATE public.rooms SET state_version = state_version + 1, updated_at = now() WHERE id = v_room.id;
    END IF;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

REVOKE ALL ON FUNCTION public.bot_take_turn_secure(CHARACTER VARYING, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_take_turn_secure(CHARACTER VARYING, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._skip_bot_room_game_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.room_players rp
    WHERE rp.room_id = NEW.room_id AND rp.player_id = NEW.user_id AND rp.is_bot
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public._skip_bot_room_game_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._skip_bot_room_game_stats() TO service_role;

DROP TRIGGER IF EXISTS skip_bot_room_game_stats ON public.room_game_stats;
CREATE TRIGGER skip_bot_room_game_stats
BEFORE INSERT ON public.room_game_stats
FOR EACH ROW EXECUTE FUNCTION public._skip_bot_room_game_stats();
