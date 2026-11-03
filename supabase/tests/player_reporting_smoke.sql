-- Rollback-safe smoke test for player reporting and account-deletion anonymization.
BEGIN;

DO $$
DECLARE
  v_reporter UUID := gen_random_uuid();
  v_target UUID := gen_random_uuid();
  v_bot UUID := gen_random_uuid();
  v_room UUID;
  v_code TEXT := upper(substr(md5(gen_random_uuid()::TEXT), 1, 6));
  v_report_id UUID;
  v_reporter_after UUID;
  v_reporter_name_after TEXT;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data, is_anonymous)
  VALUES
    (v_reporter, 'report-smoke-' || v_reporter::TEXT || '@example.invalid', jsonb_build_object('display_name', 'Reporter'), TRUE),
    (v_target, 'report-smoke-' || v_target::TEXT || '@example.invalid', jsonb_build_object('display_name', 'Reported player'), TRUE),
    (v_bot, 'report-smoke-' || v_bot::TEXT || '@example.invalid', jsonb_build_object('display_name', 'Test bot'), TRUE);

  INSERT INTO public.rooms(code, host_id, phase, game_mode)
  VALUES (v_code, v_target, 'game_over', 'classic')
  RETURNING id INTO v_room;

  INSERT INTO public.room_players(room_id, player_id, name, is_host, is_active, is_bot)
  VALUES
    (v_room, v_reporter, 'Reporter', FALSE, TRUE, FALSE),
    (v_room, v_target, 'Reported player', TRUE, TRUE, FALSE),
    (v_room, v_bot, 'Test bot', FALSE, TRUE, TRUE);

  PERFORM set_config('request.jwt.claim.sub', v_reporter::TEXT, TRUE);
  v_report_id := public.report_player_secure(v_code, v_target, 'harassment', 'Synthetic report');

  IF NOT EXISTS (
    SELECT 1 FROM public.player_reports
    WHERE id = v_report_id
      AND reporter_id = v_reporter
      AND reported_player_id = v_target
      AND room_id = v_room
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Report row was not created with the expected ownership';
  END IF;

  BEGIN
    PERFORM public.report_player_secure(v_code, v_target, 'harassment', 'Duplicate report');
    RAISE EXCEPTION 'Expected duplicate-report guard';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected duplicate-report guard' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Bu oyuncuyu bu odada zaten bildirdin%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.report_player_secure(v_code, v_reporter, 'other', 'Self report');
    RAISE EXCEPTION 'Expected self-report guard';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected self-report guard' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Kendini bildiremezsin%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.report_player_secure(v_code, v_bot, 'spam', 'Bot report');
    RAISE EXCEPTION 'Expected bot-report guard';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected bot-report guard' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Bot oyuncular bildirilemez%' THEN RAISE; END IF;
  END;

  -- Simulate the Auth deletion performed by the account-deletion Edge Function.
  DELETE FROM auth.users WHERE id = v_reporter;

  SELECT reporter_id, reporter_name_snapshot
  INTO v_reporter_after, v_reporter_name_after
  FROM public.player_reports
  WHERE id = v_report_id;

  IF v_reporter_after IS NOT NULL OR v_reporter_name_after <> 'Silinmiş kullanıcı' THEN
    RAISE EXCEPTION 'Report evidence was not anonymized when the reporter account was deleted';
  END IF;

  IF strpos(pg_get_functiondef('public.get_room_state_secure(character varying)'::regprocedure), 'isBot') = 0 THEN
    RAISE EXCEPTION 'Room state does not expose the isBot flag';
  END IF;
END;
$$;

ROLLBACK;
