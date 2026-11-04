-- Kızılküre Parkuru: original multiplayer platform-race mode.
-- Per-player splits and total times stay private; clients submit stage completion only.

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_party_mode_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_party_mode_check
  CHECK (party_mode IS NULL OR party_mode IN (
    'tilki_soygunu','kizil_pakt','kilit_altinda','kayip_kare','gece_pazari',
    'tilki_parkuru','kivilcim_kapisma','kizilkure_parkuru'
  ));

CREATE TABLE kizilkuyruk_private.kizilkure_sessions (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'race' CHECK (phase IN ('race','finished')),
  started_at timestamptz NOT NULL,
  winner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kizilkuyruk_private.kizilkure_players (
  room_id uuid NOT NULL REFERENCES kizilkuyruk_private.kizilkure_sessions(room_id) ON DELETE CASCADE,
  player_id uuid NOT NULL,
  seat integer NOT NULL,
  stage_no integer NOT NULL DEFAULT 1 CHECK (stage_no BETWEEN 1 AND 4),
  stage_started_at timestamptz NOT NULL,
  stage_times_ms integer[] NOT NULL DEFAULT '{}',
  total_elapsed_ms integer NOT NULL DEFAULT 0 CHECK (total_elapsed_ms >= 0),
  deaths integer NOT NULL DEFAULT 0 CHECK (deaths >= 0),
  gems integer NOT NULL DEFAULT 0 CHECK (gems BETWEEN 0 AND 9),
  is_finished boolean NOT NULL DEFAULT false,
  PRIMARY KEY (room_id, player_id),
  FOREIGN KEY (room_id, player_id) REFERENCES public.room_players(room_id, player_id) ON DELETE CASCADE
);
CREATE INDEX kizilkure_players_finish_order_idx
  ON kizilkuyruk_private.kizilkure_players(room_id, is_finished, total_elapsed_ms, gems DESC);

ALTER TABLE kizilkuyruk_private.kizilkure_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kizilkuyruk_private.kizilkure_players ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kizilkuyruk_private.kizilkure_sessions,kizilkuyruk_private.kizilkure_players FROM PUBLIC,anon,authenticated;
CREATE POLICY kizilkure_sessions_deny_direct_access ON kizilkuyruk_private.kizilkure_sessions
  FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY kizilkure_players_deny_direct_access ON kizilkuyruk_private.kizilkure_players
  FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);

CREATE OR REPLACE FUNCTION public.create_kizilkure_room_secure(
  p_code varchar,p_name varchar,p_avatar_key varchar,p_total_rounds integer,
  p_round_seconds integer,p_categories text[],p_is_private boolean,
  p_password text,p_game_mode text
) RETURNS TABLE(room_id uuid,room_code varchar,host_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açmalısın'; END IF;
  IF p_game_mode IS DISTINCT FROM 'kizilkure_parkuru' THEN RAISE EXCEPTION 'Oyun desteklenmiyor'; END IF;
  IF upper(trim(p_code)) !~ '^[A-Z0-9]{5,6}$' THEN RAISE EXCEPTION 'Oda kodu geçersiz'; END IF;
  IF p_is_private IS NULL OR (p_is_private AND (p_password IS NULL OR octet_length(p_password) NOT BETWEEN 8 AND 72)) THEN
    RAISE EXCEPTION 'Özel oda şifresi 8–72 bayt olmalı';
  END IF;
  INSERT INTO public.rooms(code,host_id,game_mode,party_mode,phase,total_rounds,round_seconds,selected_categories,min_players,max_players)
  VALUES(upper(trim(p_code)),auth.uid(),'classic','kizilkure_parkuru','lobby',3,30,'{}',2,8)
  RETURNING id INTO r;
  INSERT INTO public.room_players(room_id,player_id,name,avatar_key,is_host,is_ready,is_online,is_active)
  VALUES(r,auth.uid(),left(coalesce(nullif(trim(p_name),''),'Ev Sahibi'),32),left(coalesce(p_avatar_key,'fox'),128),true,true,true,true);
  IF p_is_private THEN
    INSERT INTO public.private_room_credentials(room_id,password_hash)
    VALUES(r,extensions.crypt(p_password,extensions.gen_salt('bf',12)));
  END IF;
  RETURN QUERY SELECT r,upper(trim(p_code))::varchar,auth.uid();
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.kizilkure_finish_match(p_room uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE winner uuid; winner_time integer; winner_gems integer; game_no integer; winner_ids uuid[];
BEGIN
  SELECT player_id,total_elapsed_ms,gems INTO winner,winner_time,winner_gems
  FROM kizilkuyruk_private.kizilkure_players
  WHERE room_id=p_room AND is_finished
  ORDER BY total_elapsed_ms ASC,gems DESC,seat ASC LIMIT 1;
  IF winner IS NULL THEN RETURN; END IF;
  SELECT game_number INTO game_no FROM public.rooms WHERE id=p_room;
  SELECT array_agg(player_id ORDER BY seat) INTO winner_ids
  FROM kizilkuyruk_private.kizilkure_players
  WHERE room_id=p_room AND is_finished AND total_elapsed_ms=winner_time AND gems=winner_gems;
  UPDATE kizilkuyruk_private.kizilkure_sessions
  SET phase='finished',winner_id=winner WHERE room_id=p_room;
  UPDATE public.room_players rp
  SET score=greatest(0,30000000-p.total_elapsed_ms)
  FROM kizilkuyruk_private.kizilkure_players p
  WHERE p.room_id=p_room AND rp.room_id=p.room_id AND rp.player_id=p.player_id;
  WITH recorded AS (
    INSERT INTO public.room_game_stats(room_id,game_number,user_id,score,rank)
    SELECT p_room,game_no,p.player_id,greatest(0,30000000-p.total_elapsed_ms),
      dense_rank() OVER(ORDER BY p.total_elapsed_ms ASC,p.gems DESC)::integer
    FROM kizilkuyruk_private.kizilkure_players p
    JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id
    WHERE p.room_id=p_room AND p.is_finished AND NOT rp.is_bot
    ON CONFLICT(room_id,game_number,user_id) DO NOTHING
    RETURNING user_id,score,rank
  )
  INSERT INTO public.user_stats(user_id,games_played,games_won,total_score)
  SELECT user_id,1,(rank=1)::integer,score FROM recorded
  ON CONFLICT(user_id) DO UPDATE SET
    games_played=public.user_stats.games_played+excluded.games_played,
    games_won=public.user_stats.games_won+excluded.games_won,
    total_score=public.user_stats.total_score+excluded.total_score,
    updated_at=now();
  UPDATE public.rooms SET phase='game_over',finished_at=now(),phase_deadline_at=NULL,
    state_version=state_version+1,updated_at=now() WHERE id=p_room;
END $$;

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
    WHERE room_id=r.id AND is_active AND kicked_at IS NULL ORDER BY seat LOOP
    INSERT INTO kizilkuyruk_private.kizilkure_players(room_id,player_id,seat,stage_started_at)
    VALUES(r.id,p.player_id,seat_no,start_at);
    seat_no:=seat_no+1;
  END LOOP;
  UPDATE public.room_players SET score=0 WHERE room_id=r.id;
  UPDATE public.rooms SET phase='question',current_round=1,total_rounds=3,round_seconds=30,
    current_question_id=NULL,finished_at=NULL,paused_at=NULL,phase_started_at=now(),
    phase_deadline_at=NULL,state_version=state_version+1,updated_at=now() WHERE id=r.id;
END $$;

CREATE OR REPLACE FUNCTION public.kizilkure_finish_stage_secure(
  p_room_code text,p_stage integer,p_deaths integer,p_gems integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.kizilkure_sessions; p kizilkuyruk_private.kizilkure_players;
  elapsed_ms integer; next_stage integer; active_total integer; finished_total integer;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  PERFORM 1 FROM public.rooms WHERE id=r FOR UPDATE;
  SELECT * INTO s FROM kizilkuyruk_private.kizilkure_sessions WHERE room_id=r FOR UPDATE;
  IF NOT FOUND OR s.phase<>'race' THEN RAISE EXCEPTION 'Parkur artık aktif değil'; END IF;
  SELECT * INTO p FROM kizilkuyruk_private.kizilkure_players
  WHERE room_id=r AND player_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR p.is_finished THEN RAISE EXCEPTION 'Bu parkuru zaten bitirdin'; END IF;
  IF p_stage IS DISTINCT FROM p.stage_no OR p_stage NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Etap değişti; yeni etap yükleniyor'; END IF;
  IF now()<p.stage_started_at THEN RAISE EXCEPTION 'Başlangıç sinyalini bekle'; END IF;
  elapsed_ms:=floor(extract(epoch FROM (now()-p.stage_started_at))*1000)::integer;
  IF elapsed_ms>1800000 THEN RAISE EXCEPTION 'Etap süren sona erdi'; END IF;
  IF coalesce(p_deaths,0) NOT BETWEEN 0 AND 99 OR coalesce(p_gems,0) NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Etap sonucu geçersiz'; END IF;
  next_stage:=p.stage_no+1;
  UPDATE kizilkuyruk_private.kizilkure_players SET
    stage_times_ms=array_append(stage_times_ms,elapsed_ms),
    total_elapsed_ms=total_elapsed_ms+elapsed_ms,
    deaths=deaths+coalesce(p_deaths,0),gems=gems+coalesce(p_gems,0),
    stage_no=CASE WHEN p.stage_no=3 THEN 4 ELSE next_stage END,
    stage_started_at=CASE WHEN p.stage_no=3 THEN stage_started_at ELSE now() END,
    is_finished=(p.stage_no=3)
  WHERE room_id=r AND player_id=auth.uid();
  IF p_stage=3 THEN
    SELECT count(*) INTO active_total FROM public.room_players
    WHERE room_id=r AND is_active AND kicked_at IS NULL;
    SELECT count(*) INTO finished_total FROM kizilkuyruk_private.kizilkure_players p
    JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id
    WHERE p.room_id=r AND p.is_finished AND rp.is_active AND rp.kicked_at IS NULL;
    IF finished_total>=active_total THEN
      PERFORM kizilkuyruk_private.kizilkure_finish_match(r);
    ELSE
      UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=r;
    END IF;
  ELSE
    UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=r;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.kizilkure_state_secure(p_room_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.kizilkure_sessions; result jsonb; me_json jsonb; me_id uuid:=auth.uid();
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  SELECT * INTO s FROM kizilkuyruk_private.kizilkure_sessions WHERE room_id=r;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('mode','kizilkure_parkuru','phase','lobby','stageCount',3,'players','[]'::jsonb,'me',NULL);
  END IF;
  SELECT jsonb_build_object(
    'mode','kizilkure_parkuru',
    'phase',CASE WHEN s.phase='finished' OR rooms.phase='game_over' THEN 'finished' ELSE 'race' END,
    'stageCount',3,'isHost',(rooms.host_id=me_id),'deadline',NULL,
    'winnerId',s.winner_id,
    'players',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',p.player_id,'name',rp.name,'avatarKey',rp.avatar_key,'isBot',rp.is_bot,
        'stage',p.stage_no,'stageStartedAt',p.stage_started_at,
        'stageTimes',p.stage_times_ms,'totalElapsedMs',p.total_elapsed_ms,
        'deaths',p.deaths,'gems',p.gems,'finished',p.is_finished,
        'botReadyAt',CASE WHEN rp.is_bot AND NOT p.is_finished THEN
          p.stage_started_at + make_interval(secs=>11+mod(abs(hashtext(p.player_id::text||':'||p.stage_no::text)),7))
          ELSE NULL END
      ) ORDER BY p.seat)
      FROM kizilkuyruk_private.kizilkure_players p
      JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id
      WHERE p.room_id=r AND rp.is_active AND rp.kicked_at IS NULL
    ),'[]'::jsonb)
  ) INTO result FROM public.rooms WHERE rooms.id=r;
  SELECT p INTO me_json FROM jsonb_array_elements(result->'players') p WHERE p->>'id'=me_id::text;
  result:=result||jsonb_build_object('me',me_json);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.kizilkure_bot_stage_secure(p_room_code text,p_bot_id uuid,p_stage integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; p kizilkuyruk_private.kizilkure_players; rp public.room_players; s kizilkuyruk_private.kizilkure_sessions;
  delay_seconds integer; stage_ms integer; active_total integer; finished_total integer;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  IF NOT EXISTS(SELECT 1 FROM public.rooms WHERE id=r AND host_id=auth.uid()) THEN RAISE EXCEPTION 'Yalnızca ev sahibi botları ilerletebilir'; END IF;
  PERFORM 1 FROM public.rooms WHERE id=r FOR UPDATE;
  SELECT * INTO s FROM kizilkuyruk_private.kizilkure_sessions WHERE room_id=r FOR UPDATE;
  SELECT * INTO p FROM kizilkuyruk_private.kizilkure_players WHERE room_id=r AND player_id=p_bot_id FOR UPDATE;
  SELECT * INTO rp FROM public.room_players WHERE room_id=r AND player_id=p_bot_id;
  IF s.phase<>'race' OR p.player_id IS NULL OR rp.player_id IS NULL OR NOT coalesce(rp.is_bot,false)
    OR p.is_finished OR p.stage_no<>p_stage OR p_stage NOT BETWEEN 1 AND 3 THEN RETURN false; END IF;
  delay_seconds:=11+mod(abs(hashtext(p_bot_id::text||':'||p_stage::text)),7);
  IF now()<p.stage_started_at+make_interval(secs=>delay_seconds) THEN RETURN false; END IF;
  stage_ms:=delay_seconds*1000;
  UPDATE kizilkuyruk_private.kizilkure_players SET
    stage_times_ms=array_append(stage_times_ms,stage_ms),total_elapsed_ms=total_elapsed_ms+stage_ms,
    stage_no=CASE WHEN p_stage=3 THEN 4 ELSE p_stage+1 END,
    stage_started_at=CASE WHEN p_stage=3 THEN stage_started_at ELSE p.stage_started_at+make_interval(secs=>delay_seconds) END,
    is_finished=(p_stage=3)
  WHERE room_id=r AND player_id=p_bot_id;
  IF p_stage=3 THEN
    SELECT count(*) INTO active_total FROM public.room_players WHERE room_id=r AND is_active AND kicked_at IS NULL;
    SELECT count(*) INTO finished_total FROM kizilkuyruk_private.kizilkure_players x JOIN public.room_players y USING(room_id,player_id)
      WHERE x.room_id=r AND x.is_finished AND y.is_active AND y.kicked_at IS NULL;
    IF finished_total>=active_total THEN PERFORM kizilkuyruk_private.kizilkure_finish_match(r);
    ELSE UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=r; END IF;
  ELSE
    UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=r;
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION kizilkuyruk_private.kizilkure_finish_match(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_kizilkure_room_secure(varchar,varchar,varchar,integer,integer,text[],boolean,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.kizilkure_start_secure(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.kizilkure_finish_stage_secure(text,integer,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.kizilkure_state_secure(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.kizilkure_bot_stage_secure(text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_kizilkure_room_secure(varchar,varchar,varchar,integer,integer,text[],boolean,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kizilkure_start_secure(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kizilkure_finish_stage_secure(text,integer,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kizilkure_state_secure(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kizilkure_bot_stage_secure(text,uuid,integer) TO authenticated;
