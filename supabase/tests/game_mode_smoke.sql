-- Run against a database with at least four Auth users and seeded questions.
-- All rooms, history and statistics created by this test are rolled back.
BEGIN;
CREATE TEMP TABLE smoke_results (scenario text, result text) ON COMMIT DROP;
DO $test$
DECLARE
  users uuid[];
  categories text[];
  host uuid;
  room uuid;
  code text;
  mode text;
  with_bots boolean;
  player record;
  round_no integer;
  choice integer;
  detective uuid;
  suspect uuid;
  question text;
  previous_question text;
  expected_humans integer;
  phase_now text;
BEGIN
  SELECT array_agg(id ORDER BY id) INTO users FROM (SELECT id FROM auth.users ORDER BY id LIMIT 4) u;
  IF cardinality(users) < 4 THEN RAISE EXCEPTION 'Smoke test needs four Auth users'; END IF;
  host := users[1];
  SELECT array_agg(DISTINCT category_id) INTO categories FROM public.questions WHERE is_active AND status='approved';
  FOREACH with_bots IN ARRAY ARRAY[false,true] LOOP
    FOREACH mode IN ARRAY ARRAY['classic','survival','suspicious','blitz','team_battle','secret_missions','double_trap','golden_question','detective_fox'] LOOP
      IF with_bots AND mode='double_trap' THEN CONTINUE; END IF;
      -- A subtransaction isolates histories/reservations between scenarios.
      BEGIN
        PERFORM set_config('request.jwt.claim.sub',host::text,true);
        code := upper(substr(md5(gen_random_uuid()::text),1,6));
        INSERT INTO public.rooms(code,host_id,game_mode,total_rounds,selected_categories,min_players)
          VALUES(code,host,mode,3,categories,2) RETURNING id INTO room;
        INSERT INTO public.room_players(room_id,player_id,name,is_host,is_ready)
          SELECT room,id,'Smoke '||n,id=host,true FROM unnest(users) WITH ORDINALITY u(id,n)
          WHERE NOT with_bots OR n=1;
        IF with_bots THEN
          FOR choice IN 1..3 LOOP PERFORM public.add_test_bot_secure(code::varchar,'balanced'); END LOOP;
        END IF;
        expected_humans := CASE WHEN with_bots THEN 1 ELSE 4 END;
        PERFORM public.start_game_secure(code::varchar);
        previous_question := NULL;
        FOR round_no IN 1..3 LOOP
          SELECT current_question_id INTO question FROM public.rooms WHERE id=room;
          IF question IS NULL OR question=previous_question THEN RAISE EXCEPTION 'Question missing or repeated'; END IF;
          IF (SELECT count(*) FROM public.question_reservations WHERE room_id=room AND round_number=round_no)<>expected_humans THEN
            RAISE EXCEPTION 'Reservations must contain humans only';
          END IF;
          IF EXISTS(SELECT 1 FROM public.question_reservations q JOIN public.room_players p ON p.room_id=q.room_id AND p.player_id=q.user_id WHERE q.room_id=room AND p.is_bot) THEN
            RAISE EXCEPTION 'Bot reservation persisted';
          END IF;
          FOR player IN SELECT * FROM public.room_players WHERE room_id=room AND is_active ORDER BY is_bot,player_id LOOP
            IF player.is_bot THEN
              PERFORM set_config('request.jwt.claim.sub',host::text,true);
              PERFORM public.bot_take_turn_secure(code::varchar,player.player_id);
            ELSE
              PERFORM set_config('request.jwt.claim.sub',player.player_id::text,true);
              IF public.get_current_question_secure(code::varchar)->>'correctAnswer' IS NOT NULL THEN RAISE EXCEPTION 'Answer leaked before reveal'; END IF;
              PERFORM public.mark_current_question_seen_secure(code::varchar);
              PERFORM public.mark_current_question_seen_secure(code::varchar);
              PERFORM public.confirm_ability_selection_secure(code::varchar);
            END IF;
          END LOOP;
          FOR player IN SELECT * FROM public.room_players WHERE room_id=room AND is_active ORDER BY is_bot,player_id LOOP
            IF player.is_bot THEN
              PERFORM set_config('request.jwt.claim.sub',host::text,true);
              PERFORM public.bot_take_turn_secure(code::varchar,player.player_id);
            ELSE
              PERFORM set_config('request.jwt.claim.sub',player.player_id::text,true);
              PERFORM public.submit_fake_answer_secure(code::varchar,'Regression '||player.player_id::text||' round '||round_no);
            END IF;
          END LOOP;
          -- Each real RPC commits separately, so its ON COMMIT DROP table is gone.
          DROP TABLE IF EXISTS pg_temp.temp_blended_choices;
          SELECT phase::text INTO phase_now FROM public.rooms WHERE id=room;
          IF phase_now<>'guess' THEN RAISE EXCEPTION 'Guess phase not reached: %',phase_now; END IF;
          SELECT player_id INTO detective FROM public.room_players WHERE room_id=room AND is_active ORDER BY player_id OFFSET (round_no-1)%4 LIMIT 1;
          FOR player IN SELECT * FROM public.room_players WHERE room_id=room AND is_active ORDER BY is_bot,player_id LOOP
            IF player.is_bot THEN
              PERFORM set_config('request.jwt.claim.sub',host::text,true);
              PERFORM public.bot_take_turn_secure(code::varchar,player.player_id);
            ELSE
              PERFORM set_config('request.jwt.claim.sub',player.player_id::text,true);
              IF mode='suspicious' OR (mode='detective_fox' AND player.player_id=detective) THEN
                SELECT player_id INTO suspect FROM public.room_players WHERE room_id=room AND player_id<>player.player_id ORDER BY player_id LIMIT 1;
                PERFORM public.submit_suspect_pick_secure(code::varchar,suspect);
                IF NOT EXISTS(SELECT 1 FROM public.round_suspect_picks WHERE room_id=room AND round_number=round_no AND player_id=player.player_id AND suspect_player_id=suspect) THEN
                  RAISE EXCEPTION 'Suspect choice was not persisted';
                END IF;
              END IF;
              SELECT choice_index INTO choice FROM public.round_choices WHERE room_id=room AND round_number=round_no AND is_correct;
              PERFORM public.submit_pick_secure(code::varchar,choice);
            END IF;
          END LOOP;
          PERFORM set_config('request.jwt.claim.sub',host::text,true);
          SELECT phase::text INTO phase_now FROM public.rooms WHERE id=room;
          IF phase_now<>'reveal' THEN RAISE EXCEPTION 'Reveal phase not reached: %',phase_now; END IF;
          PERFORM public.get_room_state_secure(code::varchar);
          IF public.get_current_question_secure(code::varchar)->>'correctAnswer' IS NULL THEN RAISE EXCEPTION 'Answer missing at reveal'; END IF;
          PERFORM public.advance_round_secure(code::varchar);
          PERFORM public.advance_round_secure(code::varchar);
          previous_question := question;
        END LOOP;
        SELECT phase::text INTO phase_now FROM public.rooms WHERE id=room;
        IF phase_now<>'game_over' THEN RAISE EXCEPTION 'Game did not finish'; END IF;
        IF (SELECT count(*) FROM public.room_game_stats WHERE room_id=room)<>expected_humans THEN RAISE EXCEPTION 'Persistent stats must contain humans only'; END IF;
        RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='scenario passed';
      EXCEPTION
        WHEN SQLSTATE 'ZX001' THEN INSERT INTO smoke_results VALUES(mode||CASE WHEN with_bots THEN ' + bots' ELSE ' humans' END,'PASS');
        WHEN OTHERS THEN INSERT INTO smoke_results VALUES(mode||CASE WHEN with_bots THEN ' + bots' ELSE ' humans' END,SQLSTATE||': '||SQLERRM);
      END;
    END LOOP;
  END LOOP;
END;
$test$;
DO $test$
DECLARE
 users uuid[]; host uuid; room uuid; code text; with_bots boolean; actor uuid;
 state public.forest_treasure_sessions; p record; step integer; current_phase text;
BEGIN
 SELECT array_agg(id ORDER BY id) INTO users FROM (SELECT id FROM auth.users ORDER BY id LIMIT 4) u;
 host:=users[1];
 FOREACH with_bots IN ARRAY ARRAY[false,true] LOOP
  BEGIN
   PERFORM set_config('request.jwt.claim.sub',host::text,true);
   code:=upper(substr(md5(gen_random_uuid()::text),1,6));
   INSERT INTO public.rooms(code,host_id,game_mode) VALUES(code,host,'orman_hazinesi') RETURNING id INTO room;
   INSERT INTO public.room_players(room_id,player_id,name,is_host,is_ready)
    SELECT room,id,'Forest '||n,id=host,true FROM unnest(users) WITH ORDINALITY u(id,n) WHERE NOT with_bots OR n=1;
   IF with_bots THEN FOR step IN 1..3 LOOP PERFORM public.add_test_bot_secure(code::varchar,'balanced'); END LOOP; END IF;
   PERFORM public.forest_treasure_start(code);
   FOR step IN 1..16 LOOP
    SELECT * INTO state FROM public.forest_treasure_sessions WHERE room_id=room;
    EXIT WHEN state.phase='finished';
    actor:=public.forest_treasure_actor(room,state.current_team,state.turn_number);
    IF (SELECT is_bot FROM public.room_players WHERE room_id=room AND player_id=actor) THEN
     PERFORM set_config('request.jwt.claim.sub',host::text,true);
     IF NOT public.bot_forest_move_secure(code,actor) THEN RAISE EXCEPTION 'Bot did not move'; END IF;
    ELSE
     PERFORM set_config('request.jwt.claim.sub',actor::text,true);
     PERFORM public.forest_treasure_move(code,'explore');
    END IF;
   END LOOP;
   IF NOT EXISTS(SELECT 1 FROM public.forest_treasure_sessions WHERE room_id=room AND phase='finished' AND winner IS NOT NULL) THEN RAISE EXCEPTION 'Forest game did not finish'; END IF;
   RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='scenario passed';
  EXCEPTION
   WHEN SQLSTATE 'ZX001' THEN INSERT INTO smoke_results VALUES('orman_hazinesi'||CASE WHEN with_bots THEN ' + bots' ELSE ' humans' END,'PASS');
   WHEN OTHERS THEN INSERT INTO smoke_results VALUES('orman_hazinesi'||CASE WHEN with_bots THEN ' + bots' ELSE ' humans' END,SQLSTATE||': '||SQLERRM);
  END;
 END LOOP;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',host::text,true);
  code:=upper(substr(md5(gen_random_uuid()::text),1,6));
  INSERT INTO public.rooms(code,host_id,game_mode) VALUES(code,host,'gizli_tilki') RETURNING id INTO room;
  INSERT INTO public.room_players(room_id,player_id,name,is_host,is_ready)
   SELECT room,id,'Tactical '||n,id=host,true FROM unnest(users) WITH ORDINALITY u(id,n);
  PERFORM public.gizli_tilki_start(code);
  FOR step IN 1..20 LOOP
   SELECT phase INTO current_phase FROM public.gizli_tilki_sessions WHERE room_id=room;
   EXIT WHEN current_phase='finished';
   IF current_phase='team_vote' THEN
    FOR p IN SELECT unnest(users) AS id LOOP
     PERFORM set_config('request.jwt.claim.sub',p.id::text,true);
     PERFORM public.gizli_tilki_vote_team(code,true);
    END LOOP;
   ELSIF current_phase='secret_action' THEN
    FOR p IN SELECT r.* FROM public.gizli_tilki_private_roles r JOIN public.gizli_tilki_sessions s USING(room_id) WHERE r.room_id=room AND r.player_id=ANY(s.proposed_team) LOOP
     PERFORM set_config('request.jwt.claim.sub',p.player_id::text,true);
     PERFORM public.gizli_tilki_submit_action(code,CASE WHEN p.loyalty='saboteurs' THEN 'pass' ELSE 'support' END);
    END LOOP;
   END IF;
   PERFORM set_config('request.jwt.claim.sub',host::text,true);
   SELECT phase INTO current_phase FROM public.gizli_tilki_sessions WHERE room_id=room;
   IF current_phase<>'secret_action' OR EXISTS(SELECT 1 FROM public.gizli_tilki_actions WHERE room_id=room) THEN
    UPDATE public.gizli_tilki_sessions SET phase_deadline_at=now()-interval '1 second' WHERE room_id=room;
    PERFORM public.gizli_tilki_advance(code);
   END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.gizli_tilki_sessions WHERE room_id=room AND phase='finished' AND winner IS NOT NULL) THEN RAISE EXCEPTION 'Tactical game did not finish'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='scenario passed';
 EXCEPTION
  WHEN SQLSTATE 'ZX001' THEN INSERT INTO smoke_results VALUES('gizli_tilki humans','PASS');
  WHEN OTHERS THEN INSERT INTO smoke_results VALUES('gizli_tilki humans',SQLSTATE||': '||SQLERRM);
 END;
END;
$test$;
SELECT * FROM smoke_results ORDER BY scenario;
DO $$ BEGIN
  IF (SELECT count(*) FROM smoke_results)<>20 OR EXISTS(SELECT 1 FROM smoke_results WHERE result<>'PASS') THEN
    RAISE EXCEPTION 'Game smoke tests failed; inspect smoke_results above';
  END IF;
END $$;
ROLLBACK;
