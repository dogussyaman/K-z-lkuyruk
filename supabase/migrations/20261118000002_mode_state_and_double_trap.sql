-- Final mode-state contract and Double Trap server behavior.

CREATE OR REPLACE FUNCTION public.submit_fake_answer_secure(p_room_code CHARACTER VARYING,p_fake_answer TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_user_id UUID:=auth.uid(); v_room public.rooms%ROWTYPE; v_q public.questions%ROWTYPE;
  v_active_players_count INT; v_submitted_count INT; v_rec RECORD; v_idx INT;
  v_trimmed TEXT:=btrim(p_fake_answer); v_normalized TEXT; v_correct_normalized TEXT;
  v_i INT; v_shadow_idx INT:=1;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısınız'; END IF;
  IF v_trimmed IS NULL OR v_trimmed='' OR length(v_trimmed)>120 THEN RAISE EXCEPTION 'Cevap 1-120 karakter arasında olmalıdır'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(p_room_code) FOR UPDATE;
  IF v_room.id IS NULL THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.phase<>'fake_answer' THEN RAISE EXCEPTION 'Şu anda sahte cevap gönderme aşamasında değilsiniz'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND player_id=v_user_id AND is_online=TRUE
      AND (v_room.game_mode<>'survival' OR lives_remaining>0)
  ) THEN RAISE EXCEPTION 'Bu odada aktif bir oyuncu değilsiniz'; END IF;
  IF EXISTS(SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND player_id=v_user_id AND is_blocked_current_round=TRUE)
  THEN RAISE EXCEPTION 'Bu tur bloklandınız, sahte cevap gönderemezsiniz'; END IF;

  SELECT * INTO v_q FROM public.questions WHERE id=v_room.current_question_id;
  IF v_q.id IS NULL OR v_q.correct_answer IS NULL THEN RAISE EXCEPTION 'Bu tur için doğru cevap bulunamadı'; END IF;
  v_normalized:=lower(regexp_replace(normalize(btrim(v_trimmed),NFKC),'[[:space:]]+',' ','g'));
  v_correct_normalized:=lower(regexp_replace(normalize(btrim(v_q.correct_answer),NFKC),'[[:space:]]+',' ','g'));
  IF v_normalized=v_correct_normalized THEN RAISE EXCEPTION 'Cevabınız doğru cevap veya arkadaşınızın yazdığı bir cevap ile uyuşuyor, lütfen farklı bir cevap yazınız.'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.round_fake_answers fa
    WHERE fa.room_id=v_room.id AND fa.round_number=v_room.current_round AND fa.player_id<>v_user_id
      AND lower(regexp_replace(normalize(btrim(fa.fake_answer),NFKC),'[[:space:]]+',' ','g'))=v_normalized
  ) THEN RAISE EXCEPTION 'Cevabınız doğru cevap veya arkadaşınızın yazdığı bir cevap ile uyuşuyor, lütfen farklı bir cevap yazınız.'; END IF;

  INSERT INTO public.round_fake_answers(room_id,round_number,player_id,fake_answer)
  VALUES(v_room.id,v_room.current_round,v_user_id,v_trimmed)
  ON CONFLICT(room_id,round_number,player_id) DO UPDATE SET fake_answer=EXCLUDED.fake_answer;

  SELECT count(*) INTO v_active_players_count FROM public.room_players
  WHERE room_id=v_room.id AND is_online=TRUE
    AND (v_room.game_mode<>'survival' OR lives_remaining>0)
    AND is_blocked_current_round=FALSE;
  SELECT count(*) INTO v_submitted_count
  FROM public.round_fake_answers fa
  JOIN public.room_players rp ON rp.room_id=fa.room_id AND rp.player_id=fa.player_id
  WHERE fa.room_id=v_room.id AND fa.round_number=v_room.current_round AND rp.is_online=TRUE
    AND (v_room.game_mode<>'survival' OR rp.lives_remaining>0)
    AND rp.is_blocked_current_round=FALSE;

  IF v_submitted_count>=v_active_players_count THEN
    DELETE FROM public.round_choices WHERE room_id=v_room.id AND round_number=v_room.current_round;
    CREATE TEMP TABLE temp_blended_choices(choice_text TEXT,author_id UUID,is_correct BOOLEAN) ON COMMIT DROP;
    INSERT INTO temp_blended_choices VALUES(btrim(v_q.correct_answer),NULL,TRUE);

    FOR v_rec IN SELECT fake_answer,player_id FROM public.round_fake_answers
      WHERE room_id=v_room.id AND round_number=v_room.current_round ORDER BY submitted_at,player_id
    LOOP
      IF NOT EXISTS(
        SELECT 1 FROM temp_blended_choices t
        WHERE lower(regexp_replace(normalize(btrim(t.choice_text),NFKC),'[[:space:]]+',' ','g'))=
              lower(regexp_replace(normalize(btrim(v_rec.fake_answer),NFKC),'[[:space:]]+',' ','g'))
      ) THEN INSERT INTO temp_blended_choices VALUES(btrim(v_rec.fake_answer),v_rec.player_id,FALSE); END IF;
    END LOOP;

    -- Double Trap adds one server-owned shadow fake per player and attributes it
    -- to that player, so each player has two independent trap opportunities.
    IF v_room.game_mode='double_trap' AND v_q.default_decoys IS NOT NULL THEN
      FOR v_rec IN SELECT player_id FROM public.room_players WHERE room_id=v_room.id AND is_active ORDER BY player_id LOOP
        WHILE v_shadow_idx<=COALESCE(array_length(v_q.default_decoys,1),0) LOOP
          IF NOT EXISTS(
            SELECT 1 FROM temp_blended_choices t
            WHERE lower(regexp_replace(normalize(btrim(t.choice_text),NFKC),'[[:space:]]+',' ','g'))=
                  lower(regexp_replace(normalize(btrim(v_q.default_decoys[v_shadow_idx]),NFKC),'[[:space:]]+',' ','g'))
          ) THEN
            INSERT INTO temp_blended_choices VALUES(btrim(v_q.default_decoys[v_shadow_idx]),v_rec.player_id,FALSE);
            v_shadow_idx:=v_shadow_idx+1;
            EXIT;
          END IF;
          v_shadow_idx:=v_shadow_idx+1;
        END LOOP;
      END LOOP;
    END IF;

    IF v_room.game_mode<>'double_trap' AND v_q.default_decoys IS NOT NULL THEN
      FOR v_i IN 1..COALESCE(array_length(v_q.default_decoys,1),0) LOOP
        IF (SELECT count(*) FROM temp_blended_choices)>=4 THEN EXIT; END IF;
        IF NOT EXISTS(
          SELECT 1 FROM temp_blended_choices t
          WHERE lower(regexp_replace(normalize(btrim(t.choice_text),NFKC),'[[:space:]]+',' ','g'))=
                lower(regexp_replace(normalize(btrim(v_q.default_decoys[v_i]),NFKC),'[[:space:]]+',' ','g'))
        ) THEN INSERT INTO temp_blended_choices VALUES(btrim(v_q.default_decoys[v_i]),NULL,FALSE); END IF;
      END LOOP;
    END IF;

    v_idx:=0;
    FOR v_rec IN SELECT * FROM temp_blended_choices ORDER BY random() LOOP
      INSERT INTO public.round_choices(room_id,round_number,choice_index,text,author_id,is_correct)
      VALUES(v_room.id,v_room.current_round,v_idx,v_rec.choice_text,v_rec.author_id,v_rec.is_correct);
      v_idx:=v_idx+1;
    END LOOP;
    PERFORM public._set_room_phase(v_room.id,'guess',v_room.round_seconds);
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_fake_answer_secure(CHARACTER VARYING,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_fake_answer_secure(CHARACTER VARYING,TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_room_state_secure(p_room_code CHARACTER VARYING)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_room public.rooms; v_user_id UUID:=auth.uid(); v_total INTEGER:=0; v_submitted INTEGER:=0;
  v_state JSONB; v_detective UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(p_room_code);
  IF NOT FOUND OR NOT public.is_room_member(v_room.id) THEN RAISE EXCEPTION 'Oda bulunamadı veya erişim izniniz yok'; END IF;

  SELECT count(*)::INTEGER INTO v_total FROM public.room_players rp
  WHERE rp.room_id=v_room.id AND rp.is_active
    AND (v_room.phase<>'fake_answer' OR NOT rp.is_blocked_current_round)
    AND (v_room.game_mode<>'survival' OR rp.lives_remaining>0);

  IF v_room.phase='lobby' THEN
    SELECT count(*)::INTEGER INTO v_submitted FROM public.room_players rp
    WHERE rp.room_id=v_room.id AND rp.is_active AND rp.is_ready AND (v_room.game_mode<>'survival' OR rp.lives_remaining>0);
  ELSIF v_room.phase='fake_answer' THEN
    SELECT count(*)::INTEGER INTO v_submitted FROM public.round_fake_answers fa
    JOIN public.room_players rp ON rp.room_id=fa.room_id AND rp.player_id=fa.player_id
    WHERE fa.room_id=v_room.id AND fa.round_number=v_room.current_round AND rp.is_active
      AND NOT rp.is_blocked_current_round AND (v_room.game_mode<>'survival' OR rp.lives_remaining>0);
  ELSIF v_room.phase='guess' THEN
    SELECT count(*)::INTEGER INTO v_submitted FROM public.round_picks p
    JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id
    WHERE p.room_id=v_room.id AND p.round_number=v_room.current_round AND rp.is_active
      AND (v_room.game_mode<>'survival' OR rp.lives_remaining>0);
  END IF;

  IF v_room.game_mode='detective_fox' THEN
    SELECT rp.player_id INTO v_detective FROM public.room_players rp
    WHERE rp.room_id=v_room.id AND rp.is_active ORDER BY rp.player_id
    OFFSET ((v_room.current_round-1)%GREATEST((SELECT count(*) FROM public.room_players x WHERE x.room_id=v_room.id AND x.is_active),1)) LIMIT 1;
  END IF;

  SELECT jsonb_build_object(
    'config',jsonb_build_object(
      'code',v_room.code,'hostId',v_room.host_id,'maxPlayers',v_room.max_players,'minPlayers',v_room.min_players,
      'totalRounds',v_room.total_rounds,'roundSeconds',v_room.round_seconds,
      'selectedCategoryIds',v_room.selected_categories,'gameMode',v_room.game_mode
    ),
    'players',coalesce((SELECT jsonb_object_agg(rp.player_id::text,jsonb_build_object(
      'id',rp.player_id,'name',coalesce(profile.display_name,rp.name),'avatarKey',coalesce(profile.avatar_key,rp.avatar_key),
      'avatarUrl',profile.avatar_url,'isHost',rp.is_host,'isReady',rp.is_ready,'isOnline',rp.is_online,'score',rp.score,
      'teamId',rp.team_id,'livesRemaining',rp.lives_remaining,'credits',rp.credits,
      'creditMilestonesAwarded',rp.credit_milestones_awarded,'abilityUsedCounts',rp.ability_uses,
      'consecutiveCorrect',rp.consecutive_correct,'shieldsAvailable',rp.shields_available,'blocksAvailable',rp.blocks_available,
      'isBlockedCurrentRound',rp.is_blocked_current_round,'isBlockedNextRound',rp.is_blocked_next_round,
      'lastBlockedPlayerId',rp.last_blocked_player_id
    )) FROM public.room_players rp LEFT JOIN public.profiles profile ON profile.id=rp.player_id WHERE rp.room_id=v_room.id),'{}'::jsonb),
    'phase',v_room.phase,'currentRound',v_room.current_round,'currentQuestionId',v_room.current_question_id,
    'phaseStartedAt',v_room.phase_started_at,'phaseDeadlineAt',v_room.phase_deadline_at,'pausedAt',v_room.paused_at,'stateVersion',v_room.state_version,
    'teamScores',CASE WHEN v_room.game_mode='team_battle' THEN jsonb_build_object(
      'A',coalesce((SELECT sum(score) FROM public.room_players WHERE room_id=v_room.id AND is_active AND team_id='A'),0),
      'B',coalesce((SELECT sum(score) FROM public.room_players WHERE room_id=v_room.id AND is_active AND team_id='B'),0)
    ) ELSE '{}'::jsonb END,
    'modeMeta',jsonb_build_object(
      'isGoldenRound',v_room.game_mode='golden_question' AND v_room.current_round%3=0,
      'detectivePlayerId',v_detective,
      'secretMissionHint',CASE WHEN v_room.game_mode='secret_missions' THEN CASE abs(hashtext(v_user_id::text))%3
        WHEN 0 THEN 'Aynı turda en az 2 rakibi blöfünle kandır.'
        WHEN 1 THEN 'Bu tur doğru cevabı bul.'
        ELSE 'Çift numaralı bir turda en az 1 rakibi kandır.' END ELSE NULL END
    ),
    'progress',jsonb_build_object('submittedCount',v_submitted,'totalCount',v_total,'completed',v_total>0 AND v_submitted>=v_total,'submissionStatus','{}'::jsonb),
    'fakeAnswers',CASE WHEN v_room.phase IN('reveal','scoreboard','game_over') THEN coalesce((SELECT jsonb_object_agg(fa.player_id::text,fa.fake_answer) FROM public.round_fake_answers fa WHERE fa.room_id=v_room.id AND fa.round_number=v_room.current_round),'{}'::jsonb) ELSE '{}'::jsonb END,
    'choices',CASE WHEN v_room.phase IN('reveal','scoreboard','game_over') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('choiceIndex',c.choice_index,'text',c.text,'authorId',c.author_id,'isCorrect',c.is_correct,'isOwnFake',c.author_id=v_user_id) ORDER BY c.choice_index) FROM public.round_choices c WHERE c.room_id=v_room.id AND c.round_number=v_room.current_round),'[]'::jsonb) ELSE '[]'::jsonb END,
    'picks',CASE WHEN v_room.phase IN('reveal','scoreboard','game_over') THEN coalesce((SELECT jsonb_object_agg(p.player_id::text,p.choice_index) FROM public.round_picks p WHERE p.room_id=v_room.id AND p.round_number=v_room.current_round),'{}'::jsonb) ELSE '{}'::jsonb END,
    'answers','{}'::jsonb,
    'abilityActions',CASE WHEN v_room.phase IN('reveal','scoreboard','game_over') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('playerId',a.player_id,'abilityId',a.ability,'targetId',a.target_id)) FROM public.ability_actions a WHERE a.room_id=v_room.id AND a.round_number=v_room.current_round),'[]'::jsonb) ELSE '[]'::jsonb END,
    'roundResults',CASE WHEN v_room.phase IN('reveal','scoreboard','game_over') THEN coalesce((SELECT jsonb_object_agg(rr.player_id::text,jsonb_build_object(
      'playerId',rr.player_id,
      'outcome',jsonb_build_object('correct',rr.answered_correctly,'zartaladın',rr."zartaladın",'zartalandın',rr."zartalandın",'victimsCount',rr.victims_count,'pointsEarned',rr.points_delta,'labels','[]'::jsonb),
      'labels','[]'::jsonb,'pointsDelta',rr.points_delta,'victimsCount',rr.victims_count,'penaltyDelta',rr.penalty_delta,
      'deceivedByAuthorId',rr.deceived_by_author_id,'pickedText',rr.picked_text,'ownFakeText',rr.own_fake_text,
      'isBlocked',rr.is_blocked,'teamId',(SELECT team_id FROM public.room_players p2 WHERE p2.room_id=v_room.id AND p2.player_id=rr.player_id),
      'missionBonus',rr.mission_bonus,'goldenMultiplier',rr.golden_multiplier,'detectiveBonus',rr.detective_bonus
    )) FROM public.round_results rr WHERE rr.room_id=v_room.id AND rr.round_number=v_room.current_round),'{}'::jsonb) ELSE '{}'::jsonb END,
    'history','[]'::jsonb
  ) INTO v_state;
  RETURN v_state;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_room_state_secure(CHARACTER VARYING) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_state_secure(CHARACTER VARYING) TO authenticated, service_role;
