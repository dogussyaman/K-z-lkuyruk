-- Double Trap: require two player-authored fake answers per participant.
-- One row per player remains the progress unit; the RPC expands both lines
-- into independently selectable choices.
CREATE OR REPLACE FUNCTION public.submit_fake_answer_secure(p_room_code CHARACTER VARYING,p_fake_answer TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_room public.rooms%ROWTYPE;
  v_q public.questions%ROWTYPE;
  v_active_players_count INTEGER;
  v_submitted_count INTEGER;
  v_rec RECORD;
  v_idx INTEGER;
  v_i INTEGER;
  v_answer TEXT;
  v_answers TEXT[];
  v_normalized TEXT;
  v_correct_normalized TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  IF p_fake_answer IS NULL OR btrim(p_fake_answer) = '' OR length(p_fake_answer) > 120 THEN
    RAISE EXCEPTION 'Cevap 1-120 karakter arasında olmalıdır';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.phase <> 'fake_answer' THEN RAISE EXCEPTION 'Şu anda sahte cevap gönderme aşamasında değilsiniz'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = v_room.id AND player_id = v_user_id AND is_online = TRUE
      AND (v_room.game_mode <> 'survival' OR lives_remaining > 0)
  ) THEN RAISE EXCEPTION 'Bu odada aktif bir oyuncu değilsiniz'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = v_room.id AND player_id = v_user_id AND is_blocked_current_round = TRUE
  ) THEN RAISE EXCEPTION 'Bu tur bloklandınız, sahte cevap gönderemezsiniz'; END IF;

  SELECT * INTO v_q FROM public.questions WHERE id = v_room.current_question_id;
  IF v_q.id IS NULL OR v_q.correct_answer IS NULL THEN RAISE EXCEPTION 'Bu tur için doğru cevap bulunamadı'; END IF;
  v_correct_normalized := lower(regexp_replace(normalize(btrim(v_q.correct_answer), NFKC), '[[:space:]]+', ' ', 'g'));

  IF v_room.game_mode = 'double_trap' THEN
    v_answers := regexp_split_to_array(btrim(p_fake_answer), E'\r?\n');
    IF cardinality(v_answers) <> 2 THEN
      RAISE EXCEPTION 'Çifte Tuzak için iki farklı sahte cevap göndermelisiniz';
    END IF;
    v_answers := ARRAY[btrim(v_answers[1]), btrim(v_answers[2])];
    IF v_answers[1] = '' OR v_answers[2] = ''
      OR length(v_answers[1]) > 48 OR length(v_answers[2]) > 48 THEN
      RAISE EXCEPTION 'Her sahte cevap 1-48 karakter arasında olmalıdır';
    END IF;
    IF lower(regexp_replace(normalize(v_answers[1], NFKC), '[[:space:]]+', ' ', 'g'))
      = lower(regexp_replace(normalize(v_answers[2], NFKC), '[[:space:]]+', ' ', 'g')) THEN
      RAISE EXCEPTION 'İki sahte cevabınız birbirinden farklı olmalıdır';
    END IF;
  ELSE
    IF position(E'\n' IN p_fake_answer) > 0 OR position(E'\r' IN p_fake_answer) > 0 THEN
      RAISE EXCEPTION 'Bu oyun modunda yalnızca bir sahte cevap gönderebilirsiniz';
    END IF;
    v_answers := ARRAY[btrim(p_fake_answer)];
  END IF;

  FOR v_i IN 1..cardinality(v_answers) LOOP
    v_answer := btrim(v_answers[v_i]);
    v_normalized := lower(regexp_replace(normalize(v_answer, NFKC), '[[:space:]]+', ' ', 'g'));
    IF v_normalized = v_correct_normalized THEN
      RAISE EXCEPTION 'Cevabınız doğru cevap veya arkadaşınızın yazdığı bir cevap ile uyuşuyor, lütfen farklı bir cevap yazınız.';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.round_fake_answers fa
      CROSS JOIN LATERAL regexp_split_to_table(fa.fake_answer, E'\r?\n') AS existing_answer(answer)
      WHERE fa.room_id = v_room.id
        AND fa.round_number = v_room.current_round
        AND fa.player_id <> v_user_id
        AND lower(regexp_replace(normalize(btrim(existing_answer.answer), NFKC), '[[:space:]]+', ' ', 'g')) = v_normalized
    ) THEN
      RAISE EXCEPTION 'Cevabınız doğru cevap veya arkadaşınızın yazdığı bir cevap ile uyuşuyor, lütfen farklı bir cevap yazınız.';
    END IF;
  END LOOP;

  INSERT INTO public.round_fake_answers(room_id, round_number, player_id, fake_answer)
  VALUES (v_room.id, v_room.current_round, v_user_id, array_to_string(v_answers, E'\n'))
  ON CONFLICT (room_id, round_number, player_id)
  DO UPDATE SET fake_answer = EXCLUDED.fake_answer, submitted_at = now();

  SELECT count(*) INTO v_active_players_count
  FROM public.room_players
  WHERE room_id = v_room.id AND is_online = TRUE
    AND (v_room.game_mode <> 'survival' OR lives_remaining > 0)
    AND is_blocked_current_round = FALSE;

  SELECT count(*) INTO v_submitted_count
  FROM public.round_fake_answers fa
  JOIN public.room_players rp ON rp.room_id = fa.room_id AND rp.player_id = fa.player_id
  WHERE fa.room_id = v_room.id AND fa.round_number = v_room.current_round
    AND rp.is_online = TRUE
    AND (v_room.game_mode <> 'survival' OR rp.lives_remaining > 0)
    AND rp.is_blocked_current_round = FALSE;

  IF v_submitted_count >= v_active_players_count THEN
    DELETE FROM public.round_choices WHERE room_id = v_room.id AND round_number = v_room.current_round;
    CREATE TEMP TABLE temp_blended_choices (
      choice_text TEXT, author_id UUID, is_correct BOOLEAN
    ) ON COMMIT DROP;
    INSERT INTO temp_blended_choices VALUES (btrim(v_q.correct_answer), NULL, TRUE);

    FOR v_rec IN
      SELECT fake_answer, player_id
      FROM public.round_fake_answers
      WHERE room_id = v_room.id AND round_number = v_room.current_round
      ORDER BY submitted_at, player_id
    LOOP
      IF v_room.game_mode = 'double_trap' THEN
        v_answers := regexp_split_to_array(v_rec.fake_answer, E'\r?\n');
      ELSE
        v_answers := ARRAY[v_rec.fake_answer];
      END IF;

      FOREACH v_answer IN ARRAY v_answers LOOP
        v_answer := btrim(v_answer);
        IF v_answer <> '' AND NOT EXISTS (
          SELECT 1 FROM temp_blended_choices t
          WHERE lower(regexp_replace(normalize(btrim(t.choice_text), NFKC), '[[:space:]]+', ' ', 'g'))
            = lower(regexp_replace(normalize(v_answer, NFKC), '[[:space:]]+', ' ', 'g'))
        ) THEN
          INSERT INTO temp_blended_choices VALUES (v_answer, v_rec.player_id, FALSE);
        END IF;
      END LOOP;
    END LOOP;

    IF v_room.game_mode <> 'double_trap' AND v_q.default_decoys IS NOT NULL THEN
      FOR v_i IN 1..COALESCE(array_length(v_q.default_decoys, 1), 0) LOOP
        IF (SELECT count(*) FROM temp_blended_choices) >= 4 THEN EXIT; END IF;
        IF NOT EXISTS (
          SELECT 1 FROM temp_blended_choices t
          WHERE lower(regexp_replace(normalize(btrim(t.choice_text), NFKC), '[[:space:]]+', ' ', 'g'))
            = lower(regexp_replace(normalize(btrim(v_q.default_decoys[v_i]), NFKC), '[[:space:]]+', ' ', 'g'))
        ) THEN
          INSERT INTO temp_blended_choices VALUES (btrim(v_q.default_decoys[v_i]), NULL, FALSE);
        END IF;
      END LOOP;
    END IF;

    v_idx := 0;
    FOR v_rec IN SELECT * FROM temp_blended_choices ORDER BY random() LOOP
      INSERT INTO public.round_choices(room_id, round_number, choice_index, text, author_id, is_correct)
      VALUES (v_room.id, v_room.current_round, v_idx, v_rec.choice_text, v_rec.author_id, v_rec.is_correct);
      v_idx := v_idx + 1;
    END LOOP;
    PERFORM public._set_room_phase(v_room.id, 'guess', v_room.round_seconds);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_fake_answer_secure(CHARACTER VARYING, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_fake_answer_secure(CHARACTER VARYING, TEXT) TO authenticated, service_role;