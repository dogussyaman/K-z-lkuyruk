-- Run in a transaction with the migration loaded, then ROLLBACK.
DO $$
DECLARE ids uuid[]; rid uuid:=gen_random_uuid(); code text:=upper(substr(md5(random()::text),1,6));
 s kizilkuyruk_private.arcade_sessions; view_state jsonb; drawer uuid; mate uuid; rival uuid; i int; rejected boolean; seen uuid[]:='{}';
BEGIN
 SELECT array_agg(player_id) INTO ids FROM (SELECT DISTINCT player_id FROM public.room_players WHERE NOT is_bot LIMIT 4) p;
 ASSERT cardinality(ids)=4,'Four existing identities required for rollback-only fixture';
 INSERT INTO public.rooms(id,code,host_id,game_mode,min_players,max_players) VALUES(rid,code,ids[1],'drawing_chain',4,8);
 FOR i IN 1..4 LOOP
   INSERT INTO public.room_players(room_id,player_id,name,avatar_key,is_host,is_ready,is_online,is_active,is_bot)
   SELECT rid,ids[i],'Test '||i,avatar_key,i=1,true,true,true,false FROM public.room_players WHERE player_id=ids[i] LIMIT 1;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',ids[1]::text,true);
 PERFORM public.arcade_start_secure(code,'drawing_chain');
 SELECT * INTO s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=rid;
 ASSERT s.phase='lobby' AND jsonb_array_length(s.public_state->'turnOrder')=4,'Assignment phase';
 ASSERT (SELECT count(*) FROM jsonb_each_text(s.public_state->'teams') WHERE value='0')=2,'Balanced teams';
 UPDATE kizilkuyruk_private.arcade_sessions SET deadline=now()-interval '1 second' WHERE room_id=rid;
 PERFORM public.arcade_advance_secure(code,s.step);
 FOR i IN 0..3 LOOP
   SELECT * INTO s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=rid;
   ASSERT s.phase='draw' AND s.deadline=now()+interval '120 seconds','120-second drawing phase';
   ASSERT (s.public_state->>'activeTeam')::int=i%2,'Alternating teams';
   drawer:=s.current_player_id; ASSERT NOT drawer=ANY(seen),'Each player draws once'; seen:=array_append(seen,drawer);
   SELECT key::uuid INTO mate FROM jsonb_each_text(s.public_state->'teams') WHERE value::int=i%2 AND key::uuid<>drawer LIMIT 1;
   SELECT key::uuid INTO rival FROM jsonb_each_text(s.public_state->'teams') WHERE value::int<>i%2 LIMIT 1;
   PERFORM set_config('request.jwt.claim.sub',rival::text,true);
   view_state:=public.arcade_state_secure(code);
   ASSERT NOT (view_state->'me' ? 'text') AND NOT (view_state->'public' ? 'answer'),'Prompt stays secret';
   rejected:=false;
   BEGIN PERFORM public.arcade_action_secure(code,s.step,'{"action":"draft","sequence":1,"strokes":[[[1,2],[3,4]]]}'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
   ASSERT rejected,'Opponent cannot draw';
   PERFORM set_config('request.jwt.claim.sub',drawer::text,true);
   PERFORM public.arcade_action_secure(code,s.step,'{"action":"draft","sequence":1,"strokes":[[[1,2],[3,4]]]}');
   PERFORM set_config('request.jwt.claim.sub',rival::text,true);
   view_state:=public.arcade_state_secure(code);
   ASSERT view_state->'public'->'strokes'='[[[1,2],[3,4]]]'::jsonb,'Spectator receives canvas';
   -- Any room member can resolve an expired timer; host absence cannot stall play.
   UPDATE kizilkuyruk_private.arcade_sessions SET deadline=now()-interval '1 second' WHERE room_id=rid;
   PERFORM public.arcade_advance_secure(code,s.step);
   SELECT * INTO s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=rid;
   ASSERT s.phase='guess' AND s.deadline=now()+interval '60 seconds','60-second guessing phase';
   ASSERT s.public_state->'strokes'='[[[1,2],[3,4]]]'::jsonb,'Timeout keeps drawing';
   rejected:=false;
   BEGIN PERFORM public.arcade_action_secure(code,s.step,jsonb_build_object('action','guess','text',s.secret_state->>'answer')); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
   ASSERT rejected,'Opponent cannot guess';
   PERFORM set_config('request.jwt.claim.sub',drawer::text,true);
   rejected:=false;
   BEGIN PERFORM public.arcade_action_secure(code,s.step,jsonb_build_object('action','guess','text',s.secret_state->>'answer')); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
   ASSERT rejected,'Drawer cannot guess';
   PERFORM set_config('request.jwt.claim.sub',mate::text,true);
   PERFORM public.arcade_action_secure(code,s.step,jsonb_build_object('action','guess','text',s.secret_state->>'answer'));
   SELECT * INTO s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=rid;
   ASSERT s.phase='play' AND (s.public_state->>'solved')::boolean,'Correct guess reveals answer';
   UPDATE kizilkuyruk_private.arcade_sessions SET deadline=now()-interval '1 second' WHERE room_id=rid;
   PERFORM public.arcade_advance_secure(code,s.step);
 END LOOP;
 SELECT * INTO s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=rid;
 ASSERT s.phase='finished' AND s.public_state->'teamScores'='[20,20]'::jsonb,'Match finishes with exact team scores';
 ASSERT cardinality(seen)=4,'Everyone has drawn';
END;
$$;
SELECT 'PASS: teams, alternating turns, durations, prompt secrecy, spectator snapshots, authorization, score and completion' AS result;
