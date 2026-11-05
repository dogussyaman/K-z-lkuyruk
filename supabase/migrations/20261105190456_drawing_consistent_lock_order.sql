CREATE OR REPLACE FUNCTION public.arcade_advance_secure(p_room_code text,p_step integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_room uuid; v_s kizilkuyruk_private.arcade_sessions; v_count integer; v_player uuid; v_next uuid; v_answer jsonb; v_module integer;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  -- Draft writes lock room, then session. Timer transitions must use the same order.
  PERFORM 1 FROM public.rooms WHERE id=v_room FOR UPDATE;
  SELECT * INTO v_s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=v_room FOR UPDATE;
  IF v_s.step<>p_step OR v_s.phase='finished' OR v_s.deadline>now() THEN RETURN; END IF;
  IF v_s.mode='drawing_chain' AND v_s.public_state->>'rulesVersion'='2' THEN
    PERFORM kizilkuyruk_private.drawing_transition(v_room); RETURN;
  END IF;
  IF (SELECT host_id FROM public.rooms WHERE id=v_room)<>auth.uid() THEN RAISE EXCEPTION 'Yalnızca ev sahibi süre aşımını çözebilir'; END IF;
  IF v_s.mode='kitchen_chaos' THEN
    INSERT INTO kizilkuyruk_private.arcade_submissions(room_id,step,player_id,payload)
    SELECT v_room,v_s.step,p.player_id,'{"action":"pass"}'::jsonb FROM public.room_players p
    WHERE p.room_id=v_room AND p.is_active AND p.kicked_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.arcade_submissions a WHERE a.room_id=v_room AND a.step=v_s.step AND a.player_id=p.player_id)
    ON CONFLICT DO NOTHING;
    UPDATE kizilkuyruk_private.arcade_sessions SET deadline=now()+interval '3 seconds' WHERE room_id=v_room;
    PERFORM public.arcade_action_secure(p_room_code,p_step,'{"action":"pass","ticket":-1}'::jsonb);
  ELSIF v_s.mode='drawing_chain' THEN
    SELECT player_id INTO v_next FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL AND (joined_at,player_id)>(SELECT joined_at,player_id FROM public.room_players WHERE room_id=v_room AND player_id=v_s.current_player_id) ORDER BY joined_at,player_id LIMIT 1;
    IF v_next IS NULL THEN SELECT player_id INTO v_next FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL ORDER BY joined_at,player_id LIMIT 1; END IF;
    UPDATE kizilkuyruk_private.arcade_sessions SET phase=CASE WHEN phase='draw' THEN 'guess' ELSE 'draw' END,current_player_id=v_next,step=step+1,deadline=now()+interval '45 seconds',secret_state=CASE WHEN phase='guess' THEN jsonb_build_object('currentItem',jsonb_build_object('kind','prompt','text','Sıra sende: yeni bir çizim yap')) ELSE jsonb_build_object('currentItem',jsonb_build_object('kind','drawing','strokes','[]'::jsonb)) END,updated_at=now() WHERE room_id=v_room;
  ELSIF v_s.mode='critical_signal' THEN
    v_module:=(v_s.public_state->>'module')::integer;
    v_count:=(v_s.public_state->>'strikes')::integer+1;
    IF v_count>=3 THEN PERFORM kizilkuyruk_private.arcade_finish(v_room,'Süre doldu; sinyal modülleri çözülemedi.');
    ELSE UPDATE kizilkuyruk_private.arcade_sessions SET public_state=jsonb_set(public_state,'{strikes}',to_jsonb(v_count)),step=step+1,deadline=now()+interval '60 seconds',updated_at=now() WHERE room_id=v_room; PERFORM kizilkuyruk_private.arcade_new_signal(v_room,v_module); END IF;
  ELSIF v_s.mode='pirate_cannon' THEN
    UPDATE kizilkuyruk_private.arcade_sessions SET deadline=now()+interval '3 seconds' WHERE room_id=v_room;
    PERFORM public.arcade_action_secure(p_room_code,p_step,jsonb_build_object('action','auto_fire','angle',45,'power',60));
  END IF;
  UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=v_room;
END;
$function$;
