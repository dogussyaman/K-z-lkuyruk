CREATE OR REPLACE FUNCTION kizilkuyruk_private.drawing_transition(p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s kizilkuyruk_private.arcade_sessions; idx integer; pid uuid; team integer; winners uuid[]; scores jsonb;
BEGIN
 SELECT * INTO s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=p_room FOR UPDATE;
 IF s.phase='draw' THEN
   UPDATE kizilkuyruk_private.arcade_sessions SET phase='guess',step=step+1,deadline=now()+interval '60 seconds',updated_at=now() WHERE room_id=p_room;
 ELSIF s.phase='guess' THEN
   UPDATE kizilkuyruk_private.arcade_sessions
   SET phase='play',step=step+1,deadline=now()+interval '6 seconds',
     public_state=(CASE
       WHEN jsonb_array_length(coalesce(s.public_state->'guesses','[]'::jsonb))=0 THEN s.public_state-'guessResult'
       ELSE s.public_state
     END)||jsonb_build_object('answer',s.secret_state->>'answer'),
     updated_at=now()
   WHERE room_id=p_room;
 ELSE
   idx:=CASE WHEN s.phase='lobby' THEN 0 ELSE (s.public_state->>'turnIndex')::integer+1 END;
   LOOP
     EXIT WHEN idx>=jsonb_array_length(s.public_state->'turnOrder');
     pid:=(s.public_state->'turnOrder'->>idx)::uuid;
     EXIT WHEN EXISTS(SELECT 1 FROM public.room_players WHERE room_id=p_room AND player_id=pid AND is_active AND kicked_at IS NULL);
     idx:=idx+1;
   END LOOP;
   IF idx>=jsonb_array_length(s.public_state->'turnOrder') THEN
     scores:=s.public_state->'teamScores';
     IF (scores->>0)::int<>(scores->>1)::int THEN
       team:=CASE WHEN (scores->>0)::int>(scores->>1)::int THEN 0 ELSE 1 END;
       SELECT array_agg(player_id) INTO winners FROM public.room_players WHERE room_id=p_room AND is_active AND kicked_at IS NULL AND (s.public_state->'teams'->>player_id::text)::int=team;
     END IF;
     UPDATE public.room_players SET score=coalesce((scores->>((s.public_state->'teams'->>player_id::text)::int))::int,0) WHERE room_id=p_room;
     PERFORM kizilkuyruk_private.arcade_finish(p_room,format('Tilki A: %s · Tilki B: %s. %s',scores->>0,scores->>1,CASE WHEN (scores->>0)::int=(scores->>1)::int THEN 'Berabere!' ELSE 'Kazanan: Tilki '||CASE WHEN team=0 THEN 'A' ELSE 'B' END END),coalesce(winners,'{}'));
   ELSE
     team:=(s.public_state->'teams'->>pid::text)::int;
     UPDATE kizilkuyruk_private.arcade_sessions SET phase='draw',step=step+1,current_player_id=pid,deadline=now()+interval '120 seconds',
       public_state=(public_state-'answer'-'guessResult')||jsonb_build_object('turnIndex',idx,'activeTeam',team,'strokes','[]'::jsonb,'guesses','[]'::jsonb,'solved',false,'draftSequence',0),
       secret_state=secret_state||jsonb_build_object('answer',secret_state->'prompts'->>idx),updated_at=now() WHERE room_id=p_room;
   END IF;
 END IF;
 UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=p_room;
END;
$$;
REVOKE ALL ON FUNCTION kizilkuyruk_private.drawing_transition(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.drawing_team_action(p_room uuid,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 s kizilkuyruk_private.arcade_sessions;
 a text:=p_payload->>'action';
 strokes jsonb;
 stroke jsonb;
 point jsonb;
 guess text;
 team integer;
 scores jsonb;
 history jsonb;
 seq bigint;
 is_correct boolean;
BEGIN
 SELECT * INTO s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=p_room FOR UPDATE;
 IF s.phase='draw' AND a IN ('draft','draw','submit_drawing') THEN
   IF auth.uid() IS DISTINCT FROM s.current_player_id THEN RAISE EXCEPTION 'Yalnızca çizen oyuncu tuvali değiştirebilir'; END IF;
   strokes:=p_payload->'strokes';
   IF jsonb_typeof(strokes) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Çizim geçersiz'; END IF;
   IF jsonb_array_length(strokes)>80 OR octet_length(strokes::text)>300000 THEN RAISE EXCEPTION 'Çizim sınırı aşıldı'; END IF;
   FOR stroke IN SELECT value FROM jsonb_array_elements(strokes) LOOP
     IF jsonb_typeof(stroke) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Çizgi geçersiz'; END IF;
     IF jsonb_array_length(stroke)>2500 THEN RAISE EXCEPTION 'Çizgi sınırı aşıldı'; END IF;
     FOR point IN SELECT value FROM jsonb_array_elements(stroke) LOOP
       IF jsonb_typeof(point) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Nokta geçersiz'; END IF;
       IF jsonb_array_length(point)<>2 OR jsonb_typeof(point->0) IS DISTINCT FROM 'number' OR jsonb_typeof(point->1) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Nokta geçersiz'; END IF;
       IF (point->>0)::numeric NOT BETWEEN 0 AND 1000 OR (point->>1)::numeric NOT BETWEEN 0 AND 700 THEN RAISE EXCEPTION 'Nokta tuval dışında'; END IF;
     END LOOP;
   END LOOP;
   seq:=coalesce((p_payload->>'sequence')::bigint,coalesce((s.public_state->>'draftSequence')::bigint,0)+1);
   IF a='draft' AND seq<=coalesce((s.public_state->>'draftSequence')::bigint,0) THEN RETURN; END IF;
   UPDATE kizilkuyruk_private.arcade_sessions
   SET public_state=public_state||jsonb_build_object('strokes',strokes,'draftSequence',seq),updated_at=now()
   WHERE room_id=p_room;
   IF a='submit_drawing' THEN
     PERFORM kizilkuyruk_private.drawing_transition(p_room);
   END IF;
 ELSIF s.phase='guess' AND a='guess' THEN
   team:=(s.public_state->'teams'->>auth.uid()::text)::int;
   IF auth.uid()=s.current_player_id OR team IS DISTINCT FROM (s.public_state->>'activeTeam')::int THEN RAISE EXCEPTION 'Yalnızca çizenin takım arkadaşları tahmin edebilir'; END IF;
   history:=coalesce(s.public_state->'guesses','[]'::jsonb);
   IF jsonb_array_length(history)>0 THEN RAISE EXCEPTION 'Bu tur için tahmin zaten gönderildi'; END IF;
   guess:=trim(p_payload->>'text');
   IF guess IS NULL OR length(guess) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Tahmin 1–80 karakter olmalı'; END IF;
   is_correct:=kizilkuyruk_private.drawing_normalize(guess)=kizilkuyruk_private.drawing_normalize(s.secret_state->>'answer');
   history:=history||jsonb_build_array(jsonb_build_object('playerId',auth.uid(),'text',guess));
   scores:=s.public_state->'teamScores';
   IF is_correct THEN scores:=jsonb_set(scores,ARRAY[team::text],to_jsonb((scores->>team)::int+10)); END IF;
   UPDATE kizilkuyruk_private.arcade_sessions
   SET public_state=public_state||jsonb_build_object(
     'guesses',history,
     'solved',is_correct,
     'guessResult',jsonb_build_object('playerId',auth.uid(),'text',guess,'correct',is_correct),
     'teamScores',scores
   )
   WHERE room_id=p_room;
   PERFORM kizilkuyruk_private.drawing_transition(p_room);
 ELSE
   RAISE EXCEPTION 'Bu aşamada bu işlem yapılamaz';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION kizilkuyruk_private.drawing_team_action(uuid,jsonb) FROM PUBLIC,anon,authenticated;
