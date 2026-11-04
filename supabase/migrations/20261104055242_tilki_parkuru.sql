-- Tilki Parkuru uses its own deterministic race state so the legacy quiz and
-- party engines remain untouched. All submitted inputs and race outcomes are
-- resolved inside Postgres; clients only animate the authoritative snapshots.

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_party_mode_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_party_mode_check
  CHECK (party_mode IS NULL OR party_mode IN (
    'tilki_soygunu','kizil_pakt','kilit_altinda','kayip_kare','gece_pazari','tilki_parkuru'
  ));

CREATE TABLE kizilkuyruk_private.parkur_sessions (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  turn_no integer NOT NULL DEFAULT 1 CHECK (turn_no BETWEEN 1 AND 6),
  step integer NOT NULL DEFAULT 1,
  phase text NOT NULL DEFAULT 'aim' CHECK (phase IN ('aim','report','finished')),
  deadline timestamptz,
  paused_at timestamptz,
  course jsonb NOT NULL,
  report jsonb NOT NULL DEFAULT '{}',
  result text,
  winners uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kizilkuyruk_private.parkur_players (
  room_id uuid NOT NULL REFERENCES kizilkuyruk_private.parkur_sessions(room_id) ON DELETE CASCADE,
  player_id uuid NOT NULL,
  seat integer NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 100),
  lane integer NOT NULL DEFAULT 1 CHECK (lane BETWEEN 0 AND 2),
  boosts integer NOT NULL DEFAULT 2 CHECK (boosts BETWEEN 0 AND 2),
  score integer NOT NULL DEFAULT 0,
  finish_turn integer CHECK (finish_turn BETWEEN 1 AND 6),
  PRIMARY KEY (room_id, player_id),
  FOREIGN KEY (room_id, player_id) REFERENCES public.room_players(room_id, player_id) ON DELETE CASCADE
);

CREATE TABLE kizilkuyruk_private.parkur_actions (
  room_id uuid NOT NULL REFERENCES kizilkuyruk_private.parkur_sessions(room_id) ON DELETE CASCADE,
  step integer NOT NULL,
  player_id uuid NOT NULL,
  aim integer NOT NULL CHECK (aim BETWEEN -25 AND 25),
  power integer NOT NULL CHECK (power BETWEEN 35 AND 100),
  boost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, step, player_id),
  FOREIGN KEY (room_id, player_id) REFERENCES kizilkuyruk_private.parkur_players(room_id, player_id) ON DELETE CASCADE
);

ALTER TABLE kizilkuyruk_private.parkur_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kizilkuyruk_private.parkur_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE kizilkuyruk_private.parkur_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kizilkuyruk_private.parkur_sessions, kizilkuyruk_private.parkur_players, kizilkuyruk_private.parkur_actions FROM PUBLIC, anon, authenticated;
CREATE POLICY parkur_sessions_deny_direct_access ON kizilkuyruk_private.parkur_sessions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY parkur_players_deny_direct_access ON kizilkuyruk_private.parkur_players FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY parkur_actions_deny_direct_access ON kizilkuyruk_private.parkur_actions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.create_parkur_room_secure(
  p_code varchar, p_name varchar, p_avatar_key varchar, p_total_rounds integer,
  p_round_seconds integer, p_categories text[], p_is_private boolean,
  p_password text, p_game_mode text
) RETURNS TABLE(room_id uuid, room_code varchar, host_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açmalısın'; END IF;
  IF p_game_mode IS DISTINCT FROM 'tilki_parkuru' THEN RAISE EXCEPTION 'Oyun desteklenmiyor'; END IF;
  IF upper(trim(p_code)) !~ '^[A-Z0-9]{5,6}$' THEN RAISE EXCEPTION 'Oda kodu geçersiz'; END IF;
  IF p_is_private IS NULL OR (p_is_private AND (p_password IS NULL OR octet_length(p_password) NOT BETWEEN 8 AND 72)) THEN
    RAISE EXCEPTION 'Özel oda şifresi 8–72 bayt olmalı';
  END IF;
  INSERT INTO public.rooms(code,host_id,game_mode,party_mode,phase,total_rounds,round_seconds,selected_categories,min_players,max_players)
  VALUES(upper(trim(p_code)),auth.uid(),'classic','tilki_parkuru','lobby',6,25,'{}',2,8)
  RETURNING id INTO r;
  INSERT INTO public.room_players(room_id,player_id,name,avatar_key,is_host,is_ready,is_online,is_active)
  VALUES(r,auth.uid(),left(coalesce(nullif(trim(p_name),''),'Ev Sahibi'),32),left(coalesce(p_avatar_key,'fox'),128),true,true,true,true);
  IF p_is_private THEN
    INSERT INTO public.private_room_credentials(room_id,password_hash)
    VALUES(r,extensions.crypt(p_password,extensions.gen_salt('bf',12)));
  END IF;
  RETURN QUERY SELECT r,upper(trim(p_code))::varchar,auth.uid();
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.parkur_finish(p_room uuid, p_message text) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE winners_n uuid[]; game_no integer; first_finish integer;
BEGIN
  SELECT min(finish_turn) INTO first_finish
  FROM kizilkuyruk_private.parkur_players
  WHERE room_id=p_room AND finish_turn IS NOT NULL;
  SELECT array_agg(player_id ORDER BY position DESC) INTO winners_n
  FROM kizilkuyruk_private.parkur_players
  WHERE room_id=p_room
    AND ((first_finish IS NOT NULL AND finish_turn=first_finish AND position=(
      SELECT max(position) FROM kizilkuyruk_private.parkur_players WHERE room_id=p_room AND finish_turn=first_finish
    )) OR (first_finish IS NULL AND position=(
      SELECT max(position) FROM kizilkuyruk_private.parkur_players WHERE room_id=p_room
    )));
  UPDATE kizilkuyruk_private.parkur_players p
  SET score = CASE
    WHEN p.player_id=ANY(coalesce(winners_n,'{}')) THEN 10
    WHEN p.finish_turn IS NOT NULL THEN greatest(2,8-p.finish_turn)
    ELSE greatest(0,floor(p.position::numeric/15)::integer)
  END
  WHERE p.room_id=p_room;
  UPDATE kizilkuyruk_private.parkur_sessions
  SET phase='finished',deadline=NULL,winners=coalesce(winners_n,'{}'),result=p_message,step=step+1
  WHERE room_id=p_room;
  SELECT r.game_number INTO game_no FROM public.rooms r WHERE r.id=p_room;
  UPDATE public.room_players rp SET score=pp.score
  FROM kizilkuyruk_private.parkur_players pp
  WHERE pp.room_id=p_room AND rp.room_id=pp.room_id AND rp.player_id=pp.player_id;
  WITH recorded AS (
    INSERT INTO public.room_game_stats(room_id,game_number,user_id,score,rank)
    SELECT p_room,game_no,pp.player_id,pp.score,dense_rank() OVER(ORDER BY pp.score DESC)::integer
    FROM kizilkuyruk_private.parkur_players pp
    JOIN public.room_players rp USING(room_id,player_id)
    WHERE pp.room_id=p_room AND NOT rp.is_bot
    ON CONFLICT(room_id,game_number,user_id) DO NOTHING
    RETURNING user_id,score
  )
  INSERT INTO public.user_stats(user_id,games_played,games_won,total_score)
  SELECT user_id,1,(user_id=ANY(coalesce(winners_n,'{}')))::integer,score FROM recorded
  ON CONFLICT(user_id) DO UPDATE SET
    games_played=public.user_stats.games_played+excluded.games_played,
    games_won=public.user_stats.games_won+excluded.games_won,
    total_score=public.user_stats.total_score+excluded.total_score,
    updated_at=now();
  UPDATE public.rooms SET phase='game_over',finished_at=now(),phase_deadline_at=NULL,
    state_version=state_version+1,updated_at=now() WHERE id=p_room;
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.parkur_resolve(p_room uuid) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE s kizilkuyruk_private.parkur_sessions; hazard jsonb; any_finished boolean;
BEGIN
  SELECT * INTO s FROM kizilkuyruk_private.parkur_sessions WHERE room_id=p_room FOR UPDATE;
  IF s.phase<>'aim' THEN RETURN; END IF;
  hazard:=s.course->(s.turn_no-1);
  UPDATE kizilkuyruk_private.parkur_players p
  SET lane=greatest(0,least(2,
        p.lane + CASE WHEN a.aim<=-9 THEN -1 WHEN a.aim>=9 THEN 1 ELSE 0 END
        + CASE WHEN hazard->>'kind'='ice'
                    AND greatest(0,least(2,p.lane + CASE WHEN a.aim<=-9 THEN -1 WHEN a.aim>=9 THEN 1 ELSE 0 END))=(hazard->>'lane')::integer
               THEN CASE WHEN a.aim<0 THEN -1 ELSE 1 END ELSE 0 END)),
      boosts=p.boosts-CASE WHEN a.boost THEN 1 ELSE 0 END,
      position=least(100,p.position + greatest(4,
        floor(a.power*0.43 - abs(a.aim)*0.16 + CASE WHEN a.boost THEN 13 ELSE 0 END)::integer
        + CASE WHEN hazard->>'kind'='mud' AND greatest(0,least(2,p.lane + CASE WHEN a.aim<=-9 THEN -1 WHEN a.aim>=9 THEN 1 ELSE 0 END))=(hazard->>'lane')::integer THEN -9
               WHEN hazard->>'kind'='gate' AND greatest(0,least(2,p.lane + CASE WHEN a.aim<=-9 THEN -1 WHEN a.aim>=9 THEN 1 ELSE 0 END))=(hazard->>'lane')::integer THEN -7
               WHEN hazard->>'kind'='ramp' AND a.power>=70 THEN 10
               WHEN hazard->>'kind'='ramp' THEN -2 ELSE 0 END)),
      finish_turn=CASE WHEN least(100,p.position + greatest(4,
        floor(a.power*0.43 - abs(a.aim)*0.16 + CASE WHEN a.boost THEN 13 ELSE 0 END)::integer
        + CASE WHEN hazard->>'kind'='mud' AND greatest(0,least(2,p.lane + CASE WHEN a.aim<=-9 THEN -1 WHEN a.aim>=9 THEN 1 ELSE 0 END))=(hazard->>'lane')::integer THEN -9
               WHEN hazard->>'kind'='gate' AND greatest(0,least(2,p.lane + CASE WHEN a.aim<=-9 THEN -1 WHEN a.aim>=9 THEN 1 ELSE 0 END))=(hazard->>'lane')::integer THEN -7
               WHEN hazard->>'kind'='ramp' AND a.power>=70 THEN 10
               WHEN hazard->>'kind'='ramp' THEN -2 ELSE 0 END))>=100 THEN s.turn_no ELSE p.finish_turn END
  FROM kizilkuyruk_private.parkur_actions a
  WHERE p.room_id=p_room AND a.room_id=p.room_id AND a.player_id=p.player_id AND a.step=s.step AND p.finish_turn IS NULL;
  SELECT EXISTS(SELECT 1 FROM kizilkuyruk_private.parkur_players WHERE room_id=p_room AND finish_turn IS NOT NULL) INTO any_finished;
  UPDATE kizilkuyruk_private.parkur_sessions SET report=jsonb_build_object(
    'message',coalesce(hazard->>'label','Parkur bölümü tamamlandı.'),
    'hazard',hazard,'turn',s.turn_no
  ) WHERE room_id=p_room;
  UPDATE kizilkuyruk_private.parkur_sessions SET phase='report',deadline=now()+interval '5 seconds',step=step+1 WHERE room_id=p_room;
  UPDATE public.rooms SET current_round=s.turn_no,phase='reveal',phase_deadline_at=now()+interval '5 seconds',state_version=state_version+1,updated_at=now() WHERE id=p_room;
  IF any_finished THEN PERFORM kizilkuyruk_private.parkur_finish(p_room,'Bilyeler finiş çizgisini geçti! Yarış sıralaması kesinleşti.'); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.parkur_start_secure(p_room_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r public.rooms; n integer; p record; course_n jsonb;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id=kizilkuyruk_private.room(p_room_code) FOR UPDATE;
  IF r.host_id<>auth.uid() THEN RAISE EXCEPTION 'Yalnızca ev sahibi başlatabilir'; END IF;
  IF r.party_mode<>'tilki_parkuru' OR r.phase<>'lobby' THEN RAISE EXCEPTION 'Parkur odası başlatılamıyor'; END IF;
  SELECT count(*) INTO n FROM public.room_players WHERE room_id=r.id AND is_active AND kicked_at IS NULL;
  IF n<2 OR n>8 THEN RAISE EXCEPTION 'Tilki Parkuru 2–8 oyuncu ister'; END IF;
  IF EXISTS(SELECT 1 FROM public.room_players WHERE room_id=r.id AND is_active AND kicked_at IS NULL AND (NOT is_ready OR NOT is_online)) THEN RAISE EXCEPTION 'Herkes hazır ve çevrim içi olmalı'; END IF;
  course_n:='[{"kind":"mud","lane":1,"label":"Çamur çukuru"},{"kind":"ice","lane":0,"label":"Buz virajı"},{"kind":"ramp","lane":2,"label":"Sıçrama rampası"},{"kind":"gate","lane":1,"label":"Dönen kapı"},{"kind":"mud","lane":0,"label":"Yumuşak zemin"},{"kind":"ramp","lane":1,"label":"Finiş rampası"}]'::jsonb;
  DELETE FROM kizilkuyruk_private.parkur_sessions WHERE room_id=r.id;
  INSERT INTO kizilkuyruk_private.parkur_sessions(room_id,course,deadline)
  VALUES(r.id,course_n,now()+interval '25 seconds');
  FOR p IN SELECT rp.*,row_number() OVER(ORDER BY random())-1 AS seat FROM public.room_players rp WHERE room_id=r.id AND is_active AND kicked_at IS NULL LOOP
    INSERT INTO kizilkuyruk_private.parkur_players(room_id,player_id,seat,lane,boosts)
    VALUES(r.id,p.player_id,p.seat,p.seat%3,2);
  END LOOP;
  UPDATE public.room_players SET score=0 WHERE room_id=r.id;
  UPDATE public.rooms SET phase='question',current_round=1,total_rounds=6,round_seconds=25,
    current_question_id=NULL,finished_at=NULL,paused_at=NULL,phase_deadline_at=now()+interval '25 seconds',state_version=state_version+1
  WHERE id=r.id;
END $$;

CREATE OR REPLACE FUNCTION public.parkur_action_secure(p_room_code text,p_step integer,p_aim integer,p_power integer,p_boost boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r uuid; s kizilkuyruk_private.parkur_sessions; p kizilkuyruk_private.parkur_players;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  PERFORM 1 FROM public.rooms WHERE id=r FOR UPDATE;
  SELECT * INTO s FROM kizilkuyruk_private.parkur_sessions WHERE room_id=r FOR UPDATE;
  IF s.phase<>'aim' OR s.step<>p_step OR s.paused_at IS NOT NULL OR s.deadline<=now() THEN RAISE EXCEPTION 'Hamle süresi doldu veya aşama değişti'; END IF;
  SELECT * INTO p FROM kizilkuyruk_private.parkur_players WHERE room_id=r AND player_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR p.finish_turn IS NOT NULL THEN RAISE EXCEPTION 'Bu oyuncu artık hamle yapamaz'; END IF;
  IF p_aim IS NULL OR p_aim NOT BETWEEN -25 AND 25 OR p_power IS NULL OR p_power NOT BETWEEN 35 AND 100 OR p_boost IS NULL THEN RAISE EXCEPTION 'Yön, güç veya takviye seçimi geçersiz'; END IF;
  IF p_boost AND p.boosts<=0 THEN RAISE EXCEPTION 'Takviye enerjin kalmadı'; END IF;
  INSERT INTO kizilkuyruk_private.parkur_actions(room_id,step,player_id,aim,power,boost)
  VALUES(r,s.step,auth.uid(),p_aim,p_power,p_boost)
  ON CONFLICT(room_id,step,player_id) DO NOTHING;
  UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=r;
  IF NOT EXISTS(
    SELECT 1 FROM kizilkuyruk_private.parkur_players p2
    JOIN public.room_players rp ON rp.room_id=p2.room_id AND rp.player_id=p2.player_id AND rp.is_active AND rp.kicked_at IS NULL
    WHERE p2.room_id=r AND p2.finish_turn IS NULL
      AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.parkur_actions a WHERE a.room_id=r AND a.step=s.step AND a.player_id=p2.player_id)
  ) THEN PERFORM kizilkuyruk_private.parkur_resolve(r); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.parkur_advance_secure(p_room_code text,p_step integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r uuid; s kizilkuyruk_private.parkur_sessions;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  PERFORM 1 FROM public.rooms WHERE id=r FOR UPDATE;
  SELECT * INTO s FROM kizilkuyruk_private.parkur_sessions WHERE room_id=r FOR UPDATE;
  IF NOT FOUND OR s.step<>p_step OR s.phase='finished' OR s.paused_at IS NOT NULL THEN RETURN; END IF;
  IF s.phase='report' AND s.deadline<=now() THEN
    IF s.turn_no>=6 THEN
      PERFORM kizilkuyruk_private.parkur_finish(r,'Altı etap tamamlandı. En ileri giden tilki kazandı.');
    ELSE
      UPDATE kizilkuyruk_private.parkur_sessions SET turn_no=turn_no+1,phase='aim',step=step+1,deadline=now()+interval '25 seconds' WHERE room_id=r;
      UPDATE public.rooms SET current_round=s.turn_no+1,phase='question',phase_started_at=now(),phase_deadline_at=now()+interval '25 seconds',state_version=state_version+1 WHERE id=r;
    END IF;
  ELSIF s.phase='aim' AND s.deadline<=now() THEN
    INSERT INTO kizilkuyruk_private.parkur_actions(room_id,step,player_id,aim,power,boost)
    SELECT r,s.step,p.player_id,0,55,false
    FROM kizilkuyruk_private.parkur_players p
    JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id AND rp.is_active AND rp.kicked_at IS NULL
    WHERE p.room_id=r AND p.finish_turn IS NULL
      AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.parkur_actions a WHERE a.room_id=r AND a.step=s.step AND a.player_id=p.player_id)
    ON CONFLICT(room_id,step,player_id) DO NOTHING;
    PERFORM kizilkuyruk_private.parkur_resolve(r);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.parkur_pause_secure(p_room_code text,p_paused boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r uuid; s kizilkuyruk_private.parkur_sessions;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  PERFORM 1 FROM public.rooms WHERE id=r AND host_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Yalnızca ev sahibi duraklatabilir'; END IF;
  SELECT * INTO s FROM kizilkuyruk_private.parkur_sessions WHERE room_id=r FOR UPDATE;
  IF s.phase='finished' OR p_paused IS NULL THEN RETURN; END IF;
  IF p_paused AND s.paused_at IS NULL THEN UPDATE kizilkuyruk_private.parkur_sessions SET paused_at=now() WHERE room_id=r;
  ELSIF NOT p_paused AND s.paused_at IS NOT NULL THEN UPDATE kizilkuyruk_private.parkur_sessions SET deadline=deadline+(now()-paused_at),paused_at=NULL WHERE room_id=r; END IF;
  UPDATE public.rooms SET paused_at=(SELECT paused_at FROM kizilkuyruk_private.parkur_sessions WHERE room_id=r),phase_deadline_at=(SELECT deadline FROM kizilkuyruk_private.parkur_sessions WHERE room_id=r),state_version=state_version+1 WHERE id=r;
END $$;

CREATE OR REPLACE FUNCTION public.parkur_state_secure(p_room_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r uuid; s kizilkuyruk_private.parkur_sessions; me_row kizilkuyruk_private.parkur_players; out_json jsonb;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  SELECT * INTO s FROM kizilkuyruk_private.parkur_sessions WHERE room_id=r;
  IF NOT FOUND THEN RETURN jsonb_build_object('phase','lobby'); END IF;
  SELECT * INTO me_row FROM kizilkuyruk_private.parkur_players WHERE room_id=r AND player_id=auth.uid();
  SELECT jsonb_build_object(
    'mode','tilki_parkuru','phase',s.phase,'round',s.turn_no,'step',s.step,'deadline',s.deadline,'pausedAt',s.paused_at,
    'isHost',(SELECT host_id=auth.uid() FROM public.rooms WHERE id=r),
    'canAct',s.phase='aim' AND s.paused_at IS NULL AND me_row.finish_turn IS NULL AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.parkur_actions WHERE room_id=r AND step=s.step AND player_id=auth.uid()),
    'course',s.course,'report',s.report,'result',s.result,'winnerIds',to_jsonb(s.winners),
    'me',jsonb_build_object('position',me_row.position,'lane',me_row.lane,'boosts',me_row.boosts,'finishTurn',me_row.finish_turn),
    'players',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.player_id,'name',coalesce(pr.display_name,rp.name),'avatarKey',coalesce(pr.avatar_key,rp.avatar_key),'isBot',rp.is_bot,'score',p.score,'parkourPosition',p.position,'parkourLane',p.lane,'finishTurn',p.finish_turn,'submitted',EXISTS(SELECT 1 FROM kizilkuyruk_private.parkur_actions a WHERE a.room_id=r AND a.step=s.step AND a.player_id=p.player_id)) ORDER BY p.position DESC,p.seat),'[]') FROM kizilkuyruk_private.parkur_players p JOIN public.room_players rp USING(room_id,player_id) LEFT JOIN public.profiles pr ON pr.id=p.player_id WHERE p.room_id=r AND rp.is_active AND rp.kicked_at IS NULL),
    'submittedCount',(SELECT count(*) FROM kizilkuyruk_private.parkur_actions WHERE room_id=r AND step=s.step),
    'totalCount',(SELECT count(*) FROM kizilkuyruk_private.parkur_players p JOIN public.room_players rp USING(room_id,player_id) WHERE p.room_id=r AND p.finish_turn IS NULL AND rp.is_active AND rp.kicked_at IS NULL)
  ) INTO out_json;
  RETURN out_json;
END $$;

CREATE OR REPLACE FUNCTION public.parkur_bot_turn_secure(p_room_code text,p_bot_id uuid,p_step integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r uuid; s kizilkuyruk_private.parkur_sessions; p kizilkuyruk_private.parkur_players; hazard jsonb; aim_n integer; boost_n boolean;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  PERFORM 1 FROM public.rooms WHERE id=r AND host_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.room_players WHERE room_id=r AND player_id=p_bot_id AND is_bot AND is_active AND kicked_at IS NULL) THEN RAISE EXCEPTION 'Botu yalnızca ev sahibi yönetebilir'; END IF;
  SELECT * INTO s FROM kizilkuyruk_private.parkur_sessions WHERE room_id=r;
  SELECT * INTO p FROM kizilkuyruk_private.parkur_players WHERE room_id=r AND player_id=p_bot_id;
  IF s.step<>p_step OR s.phase<>'aim' OR s.deadline<=now() OR s.paused_at IS NOT NULL OR p.finish_turn IS NOT NULL OR EXISTS(SELECT 1 FROM kizilkuyruk_private.parkur_actions WHERE room_id=r AND step=p_step AND player_id=p_bot_id) THEN RETURN; END IF;
  hazard:=s.course->(s.turn_no-1);
  aim_n:=CASE WHEN (hazard->>'lane')::integer=p.lane AND p.lane<2 THEN 18 WHEN (hazard->>'lane')::integer=p.lane AND p.lane>0 THEN -18 ELSE 0 END;
  boost_n:=p.boosts>0 AND (p.position<35 OR s.turn_no>=4);
  INSERT INTO kizilkuyruk_private.parkur_actions(room_id,step,player_id,aim,power,boost)
  VALUES(r,s.step,p_bot_id,aim_n,80,boost_n)
  ON CONFLICT(room_id,step,player_id) DO NOTHING;
  IF NOT EXISTS(
    SELECT 1 FROM kizilkuyruk_private.parkur_players p2 JOIN public.room_players rp USING(room_id,player_id)
    WHERE p2.room_id=r AND p2.finish_turn IS NULL AND rp.is_active AND rp.kicked_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.parkur_actions a WHERE a.room_id=r AND a.step=s.step AND a.player_id=p2.player_id)
  ) THEN PERFORM kizilkuyruk_private.parkur_resolve(r); END IF;
END $$;

REVOKE ALL ON FUNCTION kizilkuyruk_private.parkur_finish(uuid,text),kizilkuyruk_private.parkur_resolve(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_parkur_room_secure(varchar,varchar,varchar,integer,integer,text[],boolean,text,text),
  public.parkur_start_secure(text),public.parkur_action_secure(text,integer,integer,integer,boolean),
  public.parkur_advance_secure(text,integer),public.parkur_pause_secure(text,boolean),
  public.parkur_state_secure(text),public.parkur_bot_turn_secure(text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_parkur_room_secure(varchar,varchar,varchar,integer,integer,text[],boolean,text,text),
  public.parkur_start_secure(text),public.parkur_action_secure(text,integer,integer,integer,boolean),
  public.parkur_advance_secure(text,integer),public.parkur_pause_secure(text,boolean),
  public.parkur_state_secure(text),public.parkur_bot_turn_secure(text,uuid,integer) TO authenticated;
