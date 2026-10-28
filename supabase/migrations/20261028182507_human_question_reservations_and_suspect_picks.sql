-- Bots have room-scoped identities, not auth.users accounts. Keep the user
-- foreign key and reserve unseen questions only for participating humans.
CREATE OR REPLACE FUNCTION public._reserve_unseen_question_for_round()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_room public.rooms;
    v_player_id UUID;
    v_question_id TEXT;
    v_available_count INTEGER;
    v_rounds_remaining INTEGER;
BEGIN
    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = NEW.room_id
    FOR UPDATE;
    IF NOT FOUND OR NEW.game_number <> v_room.game_number
       OR NEW.round_number < 1 OR NEW.round_number > v_room.total_rounds THEN
        RAISE EXCEPTION 'Soru için geçerli oyun turu bulunamadı';
    END IF;

    FOR v_player_id IN
        SELECT rp.player_id
        FROM public.room_players rp
        WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
        ORDER BY rp.player_id
    LOOP
        PERFORM pg_advisory_xact_lock(
            hashtextextended('foxmasque-question-history:' || v_player_id::TEXT, 0)
        );
        DELETE FROM public.question_reservations qr
        WHERE qr.user_id = v_player_id AND qr.expires_at <= now();
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM public.room_players rp
        WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Aktif oyuncu olmadığı için soru seçilemedi';
    END IF;

    v_rounds_remaining := v_room.total_rounds - NEW.round_number + 1;
    SELECT count(*)::INTEGER INTO v_available_count
    FROM public.questions q
    WHERE q.category_id = ANY(v_room.selected_categories)
      AND q.is_active
      AND q.status = 'approved'
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_players rp
          JOIN public.question_seen_history sh
            ON sh.user_id = rp.player_id
           AND sh.category_id = q.category_id
           AND sh.question_id = q.id
          WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_players rp
          JOIN public.question_reservations qr
            ON qr.user_id = rp.player_id
           AND qr.category_id = q.category_id
           AND qr.question_id = q.id
          WHERE rp.room_id = v_room.id
            AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
            AND qr.expires_at > now()
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_round_questions rrq
          WHERE rrq.room_id = v_room.id
            AND rrq.game_number = NEW.game_number
            AND rrq.question_id = q.id
      );

    IF v_available_count < v_rounds_remaining THEN
        RAISE EXCEPTION 'Seçilen kategorilerde oyuncuların görmediği % tur için yeterli soru yok',
            v_rounds_remaining;
    END IF;

    SELECT q.id INTO v_question_id
    FROM public.questions q
    WHERE q.category_id = ANY(v_room.selected_categories)
      AND q.is_active
      AND q.status = 'approved'
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_players rp
          JOIN public.question_seen_history sh
            ON sh.user_id = rp.player_id
           AND sh.category_id = q.category_id
           AND sh.question_id = q.id
          WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_players rp
          JOIN public.question_reservations qr
            ON qr.user_id = rp.player_id
           AND qr.category_id = q.category_id
           AND qr.question_id = q.id
          WHERE rp.room_id = v_room.id
            AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
            AND qr.expires_at > now()
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_round_questions rrq
          WHERE rrq.room_id = v_room.id
            AND rrq.game_number = NEW.game_number
            AND rrq.question_id = q.id
      )
    ORDER BY random()
    LIMIT 1;

    IF v_question_id IS NULL THEN
        RAISE EXCEPTION 'Oyuncuların görmediği uygun soru bulunamadı';
    END IF;

    NEW.question_id := v_question_id;

    INSERT INTO public.question_reservations (
        user_id, category_id, question_id, room_id, game_number, round_number, expires_at
    )
    SELECT rp.player_id, q.category_id, q.id, v_room.id, NEW.game_number,
           NEW.round_number, now() + interval '10 minutes'
    FROM public.room_players rp
    JOIN public.questions q ON q.id = v_question_id
    WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._reserve_unseen_question_for_round() FROM PUBLIC, anon, authenticated;

-- Restore the persisted suspect choice and detective authorization after schema drift.
CREATE OR REPLACE FUNCTION public.submit_suspect_pick_secure(p_room_code CHARACTER VARYING,p_suspect_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_room public.rooms%ROWTYPE; v_detective UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(p_room_code) FOR UPDATE;
  IF NOT FOUND OR v_room.phase<>'guess' THEN RAISE EXCEPTION 'Şüpheli tahmini yalnız tahmin aşamasında yapılabilir'; END IF;
  IF v_room.game_mode NOT IN ('suspicious','detective_fox') THEN RAISE EXCEPTION 'Bu mod şüpheli tahmini kullanmıyor'; END IF;
  IF p_suspect_id=auth.uid() THEN RAISE EXCEPTION 'Kendini seçemezsin'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND player_id=auth.uid() AND is_active)
     OR NOT EXISTS(SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND player_id=p_suspect_id AND is_active)
  THEN RAISE EXCEPTION 'Geçersiz oyuncu'; END IF;

  IF v_room.game_mode='detective_fox' THEN
    SELECT rp.player_id INTO v_detective
    FROM public.room_players rp WHERE rp.room_id=v_room.id AND rp.is_active
    ORDER BY rp.player_id
    OFFSET ((v_room.current_round-1) % GREATEST((SELECT count(*) FROM public.room_players x WHERE x.room_id=v_room.id AND x.is_active),1))
    LIMIT 1;
    IF auth.uid() IS DISTINCT FROM v_detective THEN RAISE EXCEPTION 'Bu tur yalnız dedektif şüpheli seçebilir'; END IF;
  END IF;

  INSERT INTO public.round_suspect_picks(room_id,round_number,player_id,suspect_player_id)
  VALUES(v_room.id,v_room.current_round,auth.uid(),p_suspect_id)
  ON CONFLICT(room_id,round_number,player_id) DO NOTHING;
  RETURN TRUE;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_suspect_pick_secure(CHARACTER VARYING,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_suspect_pick_secure(CHARACTER VARYING,UUID) TO authenticated, service_role;

