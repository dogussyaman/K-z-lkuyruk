-- Independent, server-timed reflex game. The server owns signal timing,
-- scoring, bot reactions, and round transitions; clients submit only a color.

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_party_mode_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_party_mode_check
  CHECK (party_mode IS NULL OR party_mode IN (
    'tilki_soygunu','kizil_pakt','kilit_altinda','kayip_kare','gece_pazari',
    'tilki_parkuru','kivilcim_kapisma'
  ));

CREATE TABLE kizilkuyruk_private.kivilcim_sessions (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_no integer NOT NULL DEFAULT 1 CHECK (round_no BETWEEN 1 AND 8),
  step integer NOT NULL DEFAULT 1,
  phase text NOT NULL DEFAULT 'ready' CHECK (phase IN ('ready','signal','report','finished')),
  deadline timestamptz,
  signal_started_at timestamptz,
  target text,
  report jsonb NOT NULL DEFAULT '{}',
  winners uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kizilkuyruk_private.kivilcim_players (
  room_id uuid NOT NULL REFERENCES kizilkuyruk_private.kivilcim_sessions(room_id) ON DELETE CASCADE,
  player_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  last_result text CHECK (last_result IS NULL OR last_result IN ('correct','wrong','false_start','missed')),
  reaction_ms integer CHECK (reaction_ms IS NULL OR reaction_ms BETWEEN 0 AND 5000),
  PRIMARY KEY (room_id, player_id),
  FOREIGN KEY (room_id, player_id) REFERENCES public.room_players(room_id, player_id) ON DELETE CASCADE
);

CREATE TABLE kizilkuyruk_private.kivilcim_actions (
  room_id uuid NOT NULL REFERENCES kizilkuyruk_private.kivilcim_sessions(room_id) ON DELETE CASCADE,
  step integer NOT NULL,
  player_id uuid NOT NULL,
  choice text,
  result text NOT NULL CHECK (result IN ('correct','wrong','false_start','missed')),
  reaction_ms integer CHECK (reaction_ms IS NULL OR reaction_ms BETWEEN 0 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, step, player_id),
  FOREIGN KEY (room_id, player_id) REFERENCES kizilkuyruk_private.kivilcim_players(room_id, player_id) ON DELETE CASCADE
);

ALTER TABLE kizilkuyruk_private.kivilcim_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kizilkuyruk_private.kivilcim_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE kizilkuyruk_private.kivilcim_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kizilkuyruk_private.kivilcim_sessions,kizilkuyruk_private.kivilcim_players,kizilkuyruk_private.kivilcim_actions FROM PUBLIC,anon,authenticated;
CREATE POLICY kivilcim_sessions_deny_direct_access ON kizilkuyruk_private.kivilcim_sessions FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY kivilcim_players_deny_direct_access ON kizilkuyruk_private.kivilcim_players FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY kivilcim_actions_deny_direct_access ON kizilkuyruk_private.kivilcim_actions FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);

CREATE OR REPLACE FUNCTION public.create_kivilcim_room_secure(
  p_code varchar,p_name varchar,p_avatar_key varchar,p_total_rounds integer,
  p_round_seconds integer,p_categories text[],p_is_private boolean,
  p_password text,p_game_mode text
) RETURNS TABLE(room_id uuid,room_code varchar,host_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açmalısın'; END IF;
  IF p_game_mode IS DISTINCT FROM 'kivilcim_kapisma' THEN RAISE EXCEPTION 'Oyun desteklenmiyor'; END IF;
  IF upper(trim(p_code)) !~ '^[A-Z0-9]{5,6}$' THEN RAISE EXCEPTION 'Oda kodu geçersiz'; END IF;
  IF p_is_private IS NULL OR (p_is_private AND (p_password IS NULL OR octet_length(p_password) NOT BETWEEN 8 AND 72)) THEN
    RAISE EXCEPTION 'Özel oda şifresi 8–72 bayt olmalı';
  END IF;
  INSERT INTO public.rooms(code,host_id,game_mode,party_mode,phase,total_rounds,round_seconds,selected_categories,min_players,max_players)
  VALUES(upper(trim(p_code)),auth.uid(),'classic','kivilcim_kapisma','lobby',8,5,'{}',2,8)
  RETURNING id INTO r;
  INSERT INTO public.room_players(room_id,player_id,name,avatar_key,is_host,is_ready,is_online,is_active)
  VALUES(r,auth.uid(),left(coalesce(nullif(trim(p_name),''),'Ev Sahibi'),32),left(coalesce(p_avatar_key,'fox'),128),true,true,true,true);
  IF p_is_private THEN
    INSERT INTO public.private_room_credentials(room_id,password_hash)
    VALUES(r,extensions.crypt(p_password,extensions.gen_salt('bf',12)));
  END IF;
  RETURN QUERY SELECT r,upper(trim(p_code))::varchar,auth.uid();
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.kivilcim_resolve(p_room uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s kizilkuyruk_private.kivilcim_sessions; quickest text;
BEGIN
  SELECT * INTO s FROM kizilkuyruk_private.kivilcim_sessions WHERE room_id=p_room FOR UPDATE;
  IF NOT FOUND OR s.phase NOT IN ('ready','signal') THEN RETURN; END IF;
  INSERT INTO kizilkuyruk_private.kivilcim_actions(room_id,step,player_id,choice,result,reaction_ms)
  SELECT p_room,s.step,p.player_id,NULL,'missed',NULL
  FROM kizilkuyruk_private.kivilcim_players p
  JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id AND rp.is_active AND rp.kicked_at IS NULL
  WHERE p.room_id=p_room
    AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.kivilcim_actions a WHERE a.room_id=p_room AND a.step=s.step AND a.player_id=p.player_id)
  ON CONFLICT(room_id,step,player_id) DO NOTHING;
  UPDATE kizilkuyruk_private.kivilcim_players p SET last_result='missed',reaction_ms=NULL
  WHERE p.room_id=p_room AND EXISTS(SELECT 1 FROM kizilkuyruk_private.kivilcim_actions a WHERE a.room_id=p_room AND a.step=s.step AND a.player_id=p.player_id AND a.result='missed');
  SELECT coalesce(rp.name,'Bir yarışçı') INTO quickest
  FROM kizilkuyruk_private.kivilcim_actions a
  JOIN public.room_players rp ON rp.room_id=a.room_id AND rp.player_id=a.player_id
  WHERE a.room_id=p_room AND a.step=s.step AND a.result='correct'
  ORDER BY a.reaction_ms ASC LIMIT 1;
  UPDATE kizilkuyruk_private.kivilcim_sessions
  SET phase='report',deadline=now()+interval '2200 milliseconds',
      report=jsonb_build_object('message',CASE WHEN quickest IS NULL THEN 'Bu turda doğru sinyal yakalanamadı.' ELSE quickest||' en hızlı tepkiyi verdi!' END,'quickest',quickest,'round',s.round_no)
  WHERE room_id=p_room;
  UPDATE public.rooms SET phase='reveal',phase_started_at=now(),phase_deadline_at=now()+interval '2200 milliseconds',state_version=state_version+1,updated_at=now() WHERE id=p_room;
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.kivilcim_record(
  p_room uuid,p_player uuid,p_icon text
) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s kizilkuyruk_private.kivilcim_sessions; result_n text; elapsed integer; delta integer;
BEGIN
  SELECT * INTO s FROM kizilkuyruk_private.kivilcim_sessions WHERE room_id=p_room FOR UPDATE;
  IF NOT FOUND OR s.phase NOT IN ('ready','signal') THEN RAISE EXCEPTION 'Bu turda hamle yapılamıyor'; END IF;
  IF p_icon NOT IN ('🔴','🔵','🟡','🟢') THEN RAISE EXCEPTION 'Sinyal seçimi geçersiz'; END IF;
  IF EXISTS(SELECT 1 FROM kizilkuyruk_private.kivilcim_actions WHERE room_id=p_room AND step=s.step AND player_id=p_player) THEN
    RAISE EXCEPTION 'Bu turdaki hamleni kilitledin';
  END IF;
  IF s.phase='ready' THEN
    IF s.deadline<=now() THEN RAISE EXCEPTION 'Sinyal değişiyor; ekrana tekrar bak'; END IF;
    result_n:='false_start'; elapsed:=NULL; delta:=-20;
  ELSE
    IF s.signal_started_at IS NULL OR s.deadline<=now() THEN RAISE EXCEPTION 'Tepki süren doldu'; END IF;
    elapsed:=greatest(0,floor(extract(epoch FROM (now()-s.signal_started_at))*1000)::integer);
    IF p_icon=s.target THEN
      result_n:='correct'; delta:=greatest(10,100-floor(elapsed::numeric/42)::integer);
    ELSE
      result_n:='wrong'; delta:=-15;
    END IF;
  END IF;
  INSERT INTO kizilkuyruk_private.kivilcim_actions(room_id,step,player_id,choice,result,reaction_ms)
  VALUES(p_room,s.step,p_player,p_icon,result_n,elapsed);
  UPDATE kizilkuyruk_private.kivilcim_players SET score=score+delta,last_result=result_n,reaction_ms=elapsed
  WHERE room_id=p_room AND player_id=p_player;
  IF NOT EXISTS(
    SELECT 1 FROM kizilkuyruk_private.kivilcim_players p
    JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id AND rp.is_active AND rp.kicked_at IS NULL
    WHERE p.room_id=p_room AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.kivilcim_actions a WHERE a.room_id=p_room AND a.step=s.step AND a.player_id=p.player_id)
  ) THEN
    PERFORM kizilkuyruk_private.kivilcim_resolve(p_room);
  END IF;
  RETURN result_n;
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.kivilcim_finish(p_room uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE winners_n uuid[]; game_no integer; top_score integer;
BEGIN
  SELECT max(score) INTO top_score FROM kizilkuyruk_private.kivilcim_players WHERE room_id=p_room;
  SELECT array_agg(player_id ORDER BY score DESC) INTO winners_n FROM kizilkuyruk_private.kivilcim_players WHERE room_id=p_room AND score=top_score;
  UPDATE kizilkuyruk_private.kivilcim_sessions SET phase='finished',deadline=NULL,winners=coalesce(winners_n,'{}'),report=jsonb_build_object('message','Sekiz tur tamamlandı. En hızlı refleks kazandı.','winnerIds',to_jsonb(winners_n)) WHERE room_id=p_room;
  SELECT game_number INTO game_no FROM public.rooms WHERE id=p_room;
  UPDATE public.room_players rp SET score=p.score FROM kizilkuyruk_private.kivilcim_players p WHERE p.room_id=p_room AND rp.room_id=p.room_id AND rp.player_id=p.player_id;
  WITH recorded AS (
    INSERT INTO public.room_game_stats(room_id,game_number,user_id,score,rank)
    SELECT p_room,game_no,p.player_id,p.score,dense_rank() OVER(ORDER BY p.score DESC)::integer
    FROM kizilkuyruk_private.kivilcim_players p JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id
    WHERE p.room_id=p_room AND NOT rp.is_bot
    ON CONFLICT(room_id,game_number,user_id) DO NOTHING RETURNING user_id,score
  )
  INSERT INTO public.user_stats(user_id,games_played,games_won,total_score)
  SELECT user_id,1,(user_id=ANY(coalesce(winners_n,'{}')))::integer,score FROM recorded
  ON CONFLICT(user_id) DO UPDATE SET games_played=public.user_stats.games_played+excluded.games_played,
    games_won=public.user_stats.games_won+excluded.games_won,total_score=public.user_stats.total_score+excluded.total_score,updated_at=now();
  UPDATE public.rooms SET phase='game_over',finished_at=now(),phase_deadline_at=NULL,state_version=state_version+1,updated_at=now() WHERE id=p_room;
END $$;

CREATE OR REPLACE FUNCTION public.kivilcim_start_secure(p_room_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.rooms; n integer; p record;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id=kizilkuyruk_private.room(p_room_code) FOR UPDATE;
  IF r.host_id<>auth.uid() THEN RAISE EXCEPTION 'Yalnızca ev sahibi başlatabilir'; END IF;
  IF r.party_mode<>'kivilcim_kapisma' OR r.phase<>'lobby' THEN RAISE EXCEPTION 'Kıvılcım odası başlatılamıyor'; END IF;
  SELECT count(*) INTO n FROM public.room_players WHERE room_id=r.id AND is_active AND kicked_at IS NULL;
  IF n<2 OR n>8 THEN RAISE EXCEPTION 'Kıvılcım Kapışması 2–8 oyuncu ister'; END IF;
  IF EXISTS(SELECT 1 FROM public.room_players WHERE room_id=r.id AND is_active AND kicked_at IS NULL AND (NOT is_ready OR NOT is_online)) THEN RAISE EXCEPTION 'Herkes hazır ve çevrim içi olmalı'; END IF;
  DELETE FROM kizilkuyruk_private.kivilcim_sessions WHERE room_id=r.id;
  INSERT INTO kizilkuyruk_private.kivilcim_sessions(room_id,deadline) VALUES(r.id,now()+interval '3 seconds');
  FOR p IN SELECT player_id FROM public.room_players WHERE room_id=r.id AND is_active AND kicked_at IS NULL LOOP
    INSERT INTO kizilkuyruk_private.kivilcim_players(room_id,player_id) VALUES(r.id,p.player_id);
  END LOOP;
  UPDATE public.room_players SET score=0 WHERE room_id=r.id;
  UPDATE public.rooms SET phase='question',current_round=1,total_rounds=8,round_seconds=5,current_question_id=NULL,finished_at=NULL,paused_at=NULL,phase_deadline_at=now()+interval '3 seconds',state_version=state_version+1,updated_at=now() WHERE id=r.id;
END $$;

CREATE OR REPLACE FUNCTION public.kivilcim_action_secure(p_room_code text,p_step integer,p_icon text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.kivilcim_sessions; result_n text;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  PERFORM 1 FROM public.rooms WHERE id=r FOR UPDATE;
  SELECT * INTO s FROM kizilkuyruk_private.kivilcim_sessions WHERE room_id=r FOR UPDATE;
  IF s.step<>p_step OR s.phase NOT IN ('ready','signal') THEN RAISE EXCEPTION 'Tur değişti; yeni sinyali bekle'; END IF;
  IF NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.kivilcim_players WHERE room_id=r AND player_id=auth.uid()) THEN RAISE EXCEPTION 'Bu yarışa katılmıyorsun'; END IF;
  IF s.phase='signal' AND s.deadline<=now() THEN
    PERFORM kizilkuyruk_private.kivilcim_resolve(r);
    RETURN 'missed';
  END IF;
  result_n:=kizilkuyruk_private.kivilcim_record(r,auth.uid(),p_icon);
  UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=r;
  RETURN result_n;
END $$;

CREATE OR REPLACE FUNCTION public.kivilcim_advance_secure(p_room_code text,p_step integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.kivilcim_sessions; signal_n text;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  PERFORM 1 FROM public.rooms WHERE id=r FOR UPDATE;
  SELECT * INTO s FROM kizilkuyruk_private.kivilcim_sessions WHERE room_id=r FOR UPDATE;
  IF NOT FOUND OR s.step<>p_step OR s.phase='finished' THEN RETURN; END IF;
  IF s.phase='ready' AND s.deadline<=now() THEN
    signal_n:=CASE ((s.round_no-1)%4) WHEN 0 THEN '🔴' WHEN 1 THEN '🔵' WHEN 2 THEN '🟡' ELSE '🟢' END;
    UPDATE kizilkuyruk_private.kivilcim_sessions SET phase='signal',target=signal_n,signal_started_at=now(),deadline=now()+interval '5 seconds' WHERE room_id=r;
    UPDATE public.rooms SET phase='question',phase_started_at=now(),phase_deadline_at=now()+interval '5 seconds',state_version=state_version+1,updated_at=now() WHERE id=r;
  ELSIF s.phase='signal' AND (s.deadline<=now() OR NOT EXISTS(
    SELECT 1 FROM kizilkuyruk_private.kivilcim_players p JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id AND rp.is_active AND rp.kicked_at IS NULL
    WHERE p.room_id=r AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.kivilcim_actions a WHERE a.room_id=r AND a.step=s.step AND a.player_id=p.player_id)
  )) THEN
    PERFORM kizilkuyruk_private.kivilcim_resolve(r);
  ELSIF s.phase='report' AND s.deadline<=now() THEN
    IF s.round_no>=8 THEN
      PERFORM kizilkuyruk_private.kivilcim_finish(r);
    ELSE
      UPDATE kizilkuyruk_private.kivilcim_sessions SET round_no=round_no+1,phase='ready',step=step+1,deadline=now()+interval '3 seconds',signal_started_at=NULL,target=NULL,report='{}'
      WHERE room_id=r;
      UPDATE kizilkuyruk_private.kivilcim_players SET last_result=NULL,reaction_ms=NULL WHERE room_id=r;
      UPDATE public.rooms SET current_round=s.round_no+1,phase='question',phase_started_at=now(),phase_deadline_at=now()+interval '3 seconds',state_version=state_version+1,updated_at=now() WHERE id=r;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.kivilcim_state_secure(p_room_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.kivilcim_sessions; out_json jsonb;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  SELECT * INTO s FROM kizilkuyruk_private.kivilcim_sessions WHERE room_id=r;
  IF NOT FOUND THEN RETURN jsonb_build_object('phase','lobby'); END IF;
  SELECT jsonb_build_object(
    'mode','kivilcim_kapisma','phase',s.phase,'round',s.round_no,'step',s.step,'deadline',s.deadline,'signalStartedAt',s.signal_started_at,
    'target',CASE WHEN s.phase IN ('signal','report','finished') THEN s.target ELSE NULL END,
    'icons',jsonb_build_array('🔴','🔵','🟡','🟢'),
    'isHost',(SELECT host_id=auth.uid() FROM public.rooms WHERE id=r),
    'canAct',s.phase IN ('ready','signal') AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.kivilcim_actions WHERE room_id=r AND step=s.step AND player_id=auth.uid()),
    'report',s.report,'winnerIds',to_jsonb(s.winners),
    'players',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.player_id,'name',coalesce(pr.display_name,rp.name),'avatarKey',coalesce(pr.avatar_key,rp.avatar_key),'isBot',rp.is_bot,'score',p.score,'lastResult',p.last_result,'reactionMs',p.reaction_ms,'submitted',EXISTS(SELECT 1 FROM kizilkuyruk_private.kivilcim_actions a WHERE a.room_id=r AND a.step=s.step AND a.player_id=p.player_id)) ORDER BY p.score DESC,p.player_id),'[]') FROM kizilkuyruk_private.kivilcim_players p JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id LEFT JOIN public.profiles pr ON pr.id=p.player_id WHERE p.room_id=r AND rp.is_active AND rp.kicked_at IS NULL),
    'submittedCount',(SELECT count(*) FROM kizilkuyruk_private.kivilcim_actions WHERE room_id=r AND step=s.step),
    'totalCount',(SELECT count(*) FROM kizilkuyruk_private.kivilcim_players p JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id WHERE p.room_id=r AND rp.is_active AND rp.kicked_at IS NULL)
  ) INTO out_json;
  RETURN out_json;
END $$;

CREATE OR REPLACE FUNCTION public.kivilcim_bot_turn_secure(p_room_code text,p_bot_id uuid,p_step integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.kivilcim_sessions; bot public.room_players; delay_ms integer; choice_n text; wrong boolean;
BEGIN
  r:=kizilkuyruk_private.room(p_room_code);
  PERFORM 1 FROM public.rooms WHERE id=r AND host_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Botu yalnızca ev sahibi yönetebilir'; END IF;
  SELECT * INTO bot FROM public.room_players WHERE room_id=r AND player_id=p_bot_id AND is_bot AND is_active AND kicked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bot bulunamadı'; END IF;
  SELECT * INTO s FROM kizilkuyruk_private.kivilcim_sessions WHERE room_id=r;
  IF s.step<>p_step OR s.phase<>'signal' OR s.deadline<=now() OR EXISTS(SELECT 1 FROM kizilkuyruk_private.kivilcim_actions WHERE room_id=r AND step=s.step AND player_id=p_bot_id) THEN RETURN; END IF;
  delay_ms:=CASE bot.bot_personality WHEN 'scholar' THEN 350 WHEN 'trickster' THEN 740 ELSE 520 END + mod(abs(hashtext(p_bot_id::text||s.round_no::text)::bigint),230)::integer;
  IF now()<s.signal_started_at+make_interval(secs=>delay_ms::numeric/1000) THEN RETURN; END IF;
  wrong:=bot.bot_personality='trickster' AND mod(abs(hashtext(p_bot_id::text||s.round_no::text)::bigint),4)=0;
  choice_n:=CASE WHEN NOT wrong THEN s.target WHEN s.target='🔴' THEN '🔵' ELSE '🔴' END;
  PERFORM kizilkuyruk_private.kivilcim_record(r,p_bot_id,choice_n);
END $$;

REVOKE ALL ON FUNCTION kizilkuyruk_private.kivilcim_resolve(uuid),kizilkuyruk_private.kivilcim_record(uuid,uuid,text),kizilkuyruk_private.kivilcim_finish(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_kivilcim_room_secure(varchar,varchar,varchar,integer,integer,text[],boolean,text,text),
  public.kivilcim_start_secure(text),public.kivilcim_action_secure(text,integer,text),public.kivilcim_advance_secure(text,integer),
  public.kivilcim_state_secure(text),public.kivilcim_bot_turn_secure(text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_kivilcim_room_secure(varchar,varchar,varchar,integer,integer,text[],boolean,text,text),
  public.kivilcim_start_secure(text),public.kivilcim_action_secure(text,integer,text),public.kivilcim_advance_secure(text,integer),
  public.kivilcim_state_secure(text),public.kivilcim_bot_turn_secure(text,uuid,integer) TO authenticated;
