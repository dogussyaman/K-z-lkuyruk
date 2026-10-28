-- Reproduce the screenshot: one human has submitted, two bots are silent,
-- and the question screen is no longer mounted when the bluff timer expires.
-- Uses existing Auth identity only inside a rolled-back transaction.
BEGIN;
CREATE TEMP TABLE waiting_recovery_result(result text) ON COMMIT DROP;
DO $$
DECLARE h uuid; r uuid; c text; b record; choice integer; snapshot jsonb;
BEGIN
  SELECT id INTO h FROM auth.users ORDER BY id LIMIT 1;
  IF h IS NULL THEN RAISE EXCEPTION 'Auth fixture required'; END IF;
  PERFORM set_config('request.jwt.claim.sub',h::text,true);
  c:=upper(substr(md5(gen_random_uuid()::text),1,6));
  INSERT INTO public.rooms(code,host_id,total_rounds,selected_categories)
    VALUES(c,h,1,ARRAY['genel-kultur']) RETURNING id INTO r;
  INSERT INTO public.room_players(room_id,player_id,name,is_host,is_ready)
    VALUES(r,h,'Waiting regression host',true,true);
  PERFORM public.add_test_bot_secure(c::varchar,'balanced');
  PERFORM public.add_test_bot_secure(c::varchar,'scholar');
  PERFORM public.start_game_secure(c::varchar);
  FOR b IN SELECT player_id FROM public.room_players WHERE room_id=r AND is_bot LOOP
    PERFORM public.bot_take_turn_secure(c::varchar,b.player_id);
  END LOOP;
  PERFORM public.confirm_ability_selection_secure(c::varchar);
  PERFORM public.submit_fake_answer_secure(c::varchar,'Waiting regression bluff');
  snapshot:=public.get_room_state_secure(c::varchar);
  IF snapshot->>'phase'<>'fake_answer' OR (snapshot->'progress'->>'submittedCount')::int<>1 THEN
    RAISE EXCEPTION 'The host answer must be counted as 1/3';
  END IF;
  UPDATE public.rooms SET phase_deadline_at=now()-interval '1 second' WHERE id=r;
  PERFORM public.advance_expired_room_phase_secure(c::varchar);
  snapshot:=public.get_room_state_secure(c::varchar);
  IF snapshot->>'phase'<>'guess' THEN RAISE EXCEPTION 'Waiting client could not recover bluff expiry'; END IF;
  IF (snapshot->'progress'->'submissionStatus'->>h::text)::boolean THEN
    RAISE EXCEPTION 'The new guess phase must require a new human answer';
  END IF;
  FOR b IN SELECT player_id FROM public.room_players WHERE room_id=r AND is_bot LOOP
    PERFORM public.bot_take_turn_secure(c::varchar,b.player_id);
  END LOOP;
  IF (SELECT count(*) FROM public.round_picks WHERE room_id=r)<>2 THEN RAISE EXCEPTION 'Both bots must submit their guess'; END IF;
  SELECT choice_index INTO choice FROM public.round_choices WHERE room_id=r AND is_correct LIMIT 1;
  PERFORM public.submit_pick_secure(c::varchar,choice);
  snapshot:=public.get_room_state_secure(c::varchar);
  IF snapshot->>'phase'<>'reveal' THEN RAISE EXCEPTION 'Recovered game did not reach reveal'; END IF;
  INSERT INTO waiting_recovery_result VALUES('PASS: 1/3 -> expired bluff -> bot guesses -> reveal');
END $$;
SELECT * FROM waiting_recovery_result;
ROLLBACK;
