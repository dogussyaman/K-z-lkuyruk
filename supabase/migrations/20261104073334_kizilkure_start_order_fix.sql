-- room_players has no seat column. Keep the private seat assignment stable by
-- ordering the active lobby roster by its persisted join timestamp and UUID.
CREATE OR REPLACE FUNCTION public.kizilkure_start_secure(p_room_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.rooms; n integer; start_at timestamptz; p record; seat_no integer:=0;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id=kizilkuyruk_private.room(p_room_code) FOR UPDATE;
  IF r.host_id<>auth.uid() THEN RAISE EXCEPTION 'Yalnızca ev sahibi başlatabilir'; END IF;
  IF r.party_mode<>'kizilkure_parkuru' OR r.phase<>'lobby' THEN RAISE EXCEPTION 'Kızılküre Parkuru odası başlatılamıyor'; END IF;
  SELECT count(*) INTO n FROM public.room_players WHERE room_id=r.id AND is_active AND kicked_at IS NULL;
  IF n<2 OR n>8 THEN RAISE EXCEPTION 'Kızılküre Parkuru 2–8 oyuncu ister'; END IF;
  IF EXISTS(SELECT 1 FROM public.room_players WHERE room_id=r.id AND is_active AND kicked_at IS NULL AND (NOT is_ready OR NOT is_online)) THEN
    RAISE EXCEPTION 'Herkes hazır ve çevrim içi olmalı';
  END IF;
  DELETE FROM kizilkuyruk_private.kizilkure_sessions WHERE room_id=r.id;
  start_at:=now()+interval '3 seconds';
  INSERT INTO kizilkuyruk_private.kizilkure_sessions(room_id,started_at) VALUES(r.id,start_at);
  FOR p IN SELECT player_id FROM public.room_players
    WHERE room_id=r.id AND is_active AND kicked_at IS NULL ORDER BY joined_at,player_id LOOP
    INSERT INTO kizilkuyruk_private.kizilkure_players(room_id,player_id,seat,stage_started_at)
    VALUES(r.id,p.player_id,seat_no,start_at);
    seat_no:=seat_no+1;
  END LOOP;
  UPDATE public.room_players SET score=0 WHERE room_id=r.id;
  UPDATE public.rooms SET phase='question',current_round=1,total_rounds=3,round_seconds=30,
    current_question_id=NULL,finished_at=NULL,paused_at=NULL,phase_started_at=now(),
    phase_deadline_at=NULL,state_version=state_version+1,updated_at=now() WHERE id=r.id;
END $$;

REVOKE ALL ON FUNCTION public.kizilkure_start_secure(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kizilkure_start_secure(text) TO authenticated;
