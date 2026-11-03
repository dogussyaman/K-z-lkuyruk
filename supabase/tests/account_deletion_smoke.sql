-- Run after 20261118000005_account_deletion.sql on a disposable database.
-- Uses synthetic UUIDs only and rolls back all fixture data.
BEGIN;

DO $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_other UUID := gen_random_uuid();
  v_room UUID;
  v_code TEXT := upper(substr(md5(gen_random_uuid()::TEXT), 1, 6));
  v_host UUID;
  v_picked TEXT;
  v_deceived UUID;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data, is_anonymous)
  VALUES
    (v_user, 'deletion-smoke-' || v_user::TEXT || '@example.invalid', jsonb_build_object('display_name', 'Deletion smoke user'), TRUE),
    (v_other, 'deletion-smoke-' || v_other::TEXT || '@example.invalid', jsonb_build_object('display_name', 'Remaining player'), TRUE);
  UPDATE public.profiles SET display_name = 'Deletion smoke user' WHERE id = v_user;
  INSERT INTO public.user_stats(user_id) VALUES (v_user) ON CONFLICT DO NOTHING;
  INSERT INTO public.friendships(user_low, user_high)
  VALUES (LEAST(v_user, v_other), GREATEST(v_user, v_other))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.rooms(code, host_id, phase, game_mode)
  VALUES (v_code, v_user, 'lobby', 'classic')
  RETURNING id INTO v_room;

  INSERT INTO public.room_players(room_id, player_id, name, is_host, is_active, is_bot)
  VALUES
    (v_room, v_user, 'Deletion smoke user', TRUE, TRUE, FALSE),
    (v_room, v_other, 'Remaining player', FALSE, TRUE, FALSE);

  INSERT INTO public.round_choices(room_id, round_number, choice_index, text, author_id, is_correct)
  VALUES (v_room, 1, 1, 'Synthetic personal fake answer', v_user, FALSE);
  INSERT INTO public.round_picks(room_id, round_number, player_id, choice_index)
  VALUES (v_room, 1, v_other, 1);
  INSERT INTO public.round_fake_answers(room_id, round_number, player_id, fake_answer)
  VALUES (v_room, 1, v_user, 'Synthetic personal fake answer');
  INSERT INTO public.round_results(
    room_id, round_number, player_id, answered_correctly,
    "zartaladın", "zartalandın", points_delta,
    deceived_by_author_id, picked_text
  ) VALUES (
    v_room, 1, v_other, FALSE, FALSE, TRUE, 0,
    v_user, 'Synthetic personal fake answer'
  );

  -- An active participant must not be deleted mid-game.
  BEGIN
    PERFORM public.delete_account_data_secure(v_user);
    RAISE EXCEPTION 'Expected active-room guard to reject deletion';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected active-room guard to reject deletion' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE 'Aktif oyunlardan ayrılmadan%' THEN
      RAISE;
    END IF;
  END;

  UPDATE public.rooms SET phase = 'game_over' WHERE id = v_room;
  PERFORM public.delete_account_data_secure(v_user);

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user) THEN
    RAISE EXCEPTION 'Profile row survived account deletion';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_stats WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'User stats survived account deletion';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_low = v_user OR user_high = v_user
  ) THEN
    RAISE EXCEPTION 'Friendship survived account deletion';
  END IF;
  IF EXISTS (SELECT 1 FROM public.room_players WHERE room_id = v_room AND player_id = v_user) THEN
    RAISE EXCEPTION 'Room membership survived account deletion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.room_players WHERE room_id = v_room AND player_id = v_other) THEN
    RAISE EXCEPTION 'Other player was incorrectly deleted';
  END IF;
  SELECT host_id INTO v_host FROM public.rooms WHERE id = v_room;
  IF v_host IS DISTINCT FROM v_other THEN
    RAISE EXCEPTION 'Room host was not transferred to the remaining human player';
  END IF;
  IF EXISTS (SELECT 1 FROM public.round_choices WHERE room_id = v_room AND author_id = v_user) THEN
    RAISE EXCEPTION 'Personal fake choice survived account deletion';
  END IF;
  IF EXISTS (SELECT 1 FROM public.round_picks WHERE room_id = v_room AND choice_index = 1) THEN
    RAISE EXCEPTION 'Pick referencing the deleted fake choice survived';
  END IF;
  IF EXISTS (SELECT 1 FROM public.round_fake_answers WHERE room_id = v_room AND player_id = v_user) THEN
    RAISE EXCEPTION 'Fake answer row survived account deletion';
  END IF;
  SELECT picked_text, deceived_by_author_id
  INTO v_picked, v_deceived
  FROM public.round_results
  WHERE room_id = v_room AND round_number = 1 AND player_id = v_other;
  IF v_picked IS NOT NULL OR v_deceived IS NOT NULL THEN
    RAISE EXCEPTION 'Another player result still contains the deleted account reference';
  END IF;
END;
$$;

ROLLBACK;
