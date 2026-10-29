BEGIN;
CREATE TEMP TABLE party_test_results(mode text,result text) ON COMMIT DROP;
DO $test$
DECLARE host uuid; outsider uuid; c text; r uuid; mode_n text; min_n integer; i integer; iteration integer; s kizilkuyruk_private.sessions; p kizilkuyruk_private.players; bot record; snapshot jsonb; payload_n jsonb; target uuid; expected_error boolean; old_deadline timestamptz;
BEGIN
 SELECT id INTO host FROM auth.users ORDER BY id LIMIT 1;
 SELECT id INTO outsider FROM auth.users ORDER BY id OFFSET 1 LIMIT 1;
 IF host IS NULL OR outsider IS NULL THEN RAISE EXCEPTION 'Two Auth fixtures required'; END IF;
 IF has_schema_privilege('authenticated','kizilkuyruk_private','USAGE') OR has_function_privilege('anon','public.party_state_secure(text)','EXECUTE') THEN RAISE EXCEPTION 'Private engine is exposed'; END IF;
 FOREACH mode_n IN ARRAY ARRAY['tilki_soygunu','kizil_pakt','kilit_altinda','kayip_kare','gece_pazari'] LOOP
  PERFORM set_config('request.jwt.claim.sub',host::text,true);
  c:=upper(substr(md5(gen_random_uuid()::text),1,6));
  SELECT room_id INTO r FROM public.create_party_room_secure(c::varchar,'Party regression','fox',5,40,'{}',false,null,mode_n);
  SELECT min_players INTO min_n FROM public.rooms WHERE id=r;
  FOR i IN 1..min_n-1 LOOP PERFORM public.add_test_bot_secure(c::varchar,'balanced'); END LOOP;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  expected_error:=false;
  BEGIN PERFORM public.party_state_secure(c); EXCEPTION WHEN OTHERS THEN expected_error:=true; END;
  IF NOT expected_error THEN RAISE EXCEPTION 'Outsider could read the room'; END IF;
  PERFORM set_config('request.jwt.claim.sub',host::text,true);
  PERFORM public.party_start_secure(c);
  SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
  old_deadline:=s.deadline;
  PERFORM public.party_pause_secure(c,true);
  IF NOT (public.party_state_secure(c) ? 'pausedAt') THEN RAISE EXCEPTION 'Pause missing'; END IF;
  expected_error:=false;
  BEGIN PERFORM public.party_action_secure(c,s.step,'{}'); EXCEPTION WHEN OTHERS THEN expected_error:=true; END;
  IF NOT expected_error THEN RAISE EXCEPTION 'Paused action accepted'; END IF;
  PERFORM public.party_pause_secure(c,false);
  IF (SELECT deadline FROM kizilkuyruk_private.sessions WHERE room_id=r)<old_deadline THEN RAISE EXCEPTION 'Pause shortened deadline'; END IF;
  PERFORM public.party_message_secure(c,s.step,'Birinci mesaj'); PERFORM public.party_message_secure(c,s.step,'İkinci mesaj');
  expected_error:=false;
  BEGIN PERFORM public.party_message_secure(c,s.step,'Üçüncü mesaj'); EXCEPTION WHEN OTHERS THEN expected_error:=true; END;
  IF NOT expected_error THEN RAISE EXCEPTION 'Message limit bypassed'; END IF;
  expected_error:=false;
  BEGIN PERFORM public.party_action_secure(c,s.step-1,'{}'); EXCEPTION WHEN OTHERS THEN expected_error:=true; END;
  IF NOT expected_error THEN RAISE EXCEPTION 'Stale step accepted'; END IF;
  FOR iteration IN 1..90 LOOP
   SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
   EXIT WHEN s.phase='finished';
   snapshot:=public.party_state_secure(c);
   IF snapshot ? 'secret' OR snapshot->'me' ? 'answer' OR snapshot->'me' ? 'assets_value' THEN RAISE EXCEPTION 'Server secret leaked'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'players') x WHERE x->>'role' IS NOT NULL) THEN RAISE EXCEPTION 'Another private role leaked'; END IF;
   IF s.phase='report' THEN PERFORM public.party_advance_secure(c,s.step); CONTINUE; END IF;
   SELECT * INTO p FROM kizilkuyruk_private.players WHERE room_id=r AND player_id=host;
   payload_n:=NULL;
   IF EXISTS(SELECT 1 FROM kizilkuyruk_private.expected(r) x WHERE x=host) THEN
    CASE s.phase
     WHEN 'plan' THEN payload_n:=jsonb_build_object('choice',CASE WHEN p.seat=0 THEN 'guard' WHEN p.seat<=ceil(min_n::numeric/2) THEN 'open' WHEN (p.data->>'steals')::integer>0 THEN 'steal' ELSE 'guard' END);
     WHEN 'night' THEN payload_n:=jsonb_build_object('choice',CASE WHEN p.data->>'role'='fox' AND NOT (p.data->>'exposed')::boolean AND (p.data->>'detained')::integer<s.round_no THEN 'sabotage' WHEN p.data->>'role'='keeper' AND (p.data->>'protects')::integer>0 THEN 'protect' ELSE 'work' END,'site',1,'claim',1);
     WHEN 'lock' THEN payload_n:=jsonb_build_object('choice',s.secret->>'answer');
     WHEN 'clue' THEN payload_n:='{"text":"Karemde bir yapı görüyorum."}';
     WHEN 'detail' THEN payload_n:='{"text":"Bir ışık ve yön çizgisi var."}';
     WHEN 'vote' THEN
      SELECT player_id INTO target FROM kizilkuyruk_private.players WHERE room_id=r AND player_id<>host AND NOT (data->>'exposed')::boolean ORDER BY CASE WHEN data->>'role' IN ('fox','impostor') THEN 0 ELSE 1 END LIMIT 1;
      payload_n:=jsonb_build_object('target',target);
     WHEN 'last_guess' THEN payload_n:=jsonb_build_object('scene',s.secret->'scene');
     WHEN 'pitch' THEN payload_n:='{"text":"Bu sandık sürpriz yapabilir."}';
     WHEN 'bid' THEN payload_n:=jsonb_build_object('bid',least(2,(p.data->>'coins')::integer));
     ELSE RAISE EXCEPTION 'Unknown stage %',s.phase;
    END CASE;
    PERFORM public.party_action_secure(c,s.step,payload_n);
    -- A retry cannot alter a locked action or consume a second steal token.
    IF (SELECT step FROM kizilkuyruk_private.sessions WHERE room_id=r)=s.step THEN PERFORM public.party_action_secure(c,s.step,payload_n); END IF;
   END IF;
   FOR bot IN SELECT rp.player_id FROM public.room_players rp WHERE rp.room_id=r AND rp.is_bot LOOP
    PERFORM public.party_bot_turn_secure(c,bot.player_id,s.step);
   END LOOP;
  END LOOP;
  SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
  IF s.phase<>'finished' THEN RAISE EXCEPTION '% never finished, phase %',mode_n,s.phase; END IF;
  IF (SELECT count(*) FROM public.room_game_stats WHERE room_id=r)<>1 THEN RAISE EXCEPTION 'Human stats not exactly once'; END IF;
  IF EXISTS(SELECT 1 FROM kizilkuyruk_private.players WHERE room_id=r AND ((data->>'coins')::integer<0 OR (data->>'steals')::integer<0)) THEN RAISE EXCEPTION 'Negative balance'; END IF;
  IF mode_n='kilit_altinda' AND (s.public_state->>'locks')::integer<>4 THEN RAISE EXCEPTION 'Cooperative solution failed'; END IF;
  IF mode_n='gece_pazari' AND s.round_no<>min_n THEN RAISE EXCEPTION 'Every player must sell once'; END IF;
  INSERT INTO party_test_results VALUES(mode_n,'PASS: full match, privacy, outsiders, stale actions, pauses, bots, final stats');
 END LOOP;
END $test$;
SELECT * FROM party_test_results;
ROLLBACK;
