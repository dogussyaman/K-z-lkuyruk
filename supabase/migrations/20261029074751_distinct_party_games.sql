-- Independent party engines share rooms/profiles, not the trivia state machine.
-- party_mode is additive: historical game_mode values and migrations stay valid.
CREATE SCHEMA IF NOT EXISTS kizilkuyruk_private;
REVOKE ALL ON SCHEMA kizilkuyruk_private FROM PUBLIC, anon, authenticated;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS party_mode text
 CHECK (party_mode IS NULL OR party_mode IN ('tilki_soygunu','kizil_pakt','kilit_altinda','kayip_kare','gece_pazari'));
CREATE TABLE IF NOT EXISTS kizilkuyruk_private.sessions (
 room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
 mode text NOT NULL, game_number integer NOT NULL, round_no integer NOT NULL DEFAULT 1,
 step integer NOT NULL DEFAULT 1, phase text NOT NULL, deadline timestamptz,
 paused_at timestamptz, public_state jsonb NOT NULL DEFAULT '{}', secret jsonb NOT NULL DEFAULT '{}',
 report jsonb NOT NULL DEFAULT '{}', winners uuid[] NOT NULL DEFAULT '{}', result text
);
CREATE TABLE IF NOT EXISTS kizilkuyruk_private.players (
 room_id uuid NOT NULL REFERENCES kizilkuyruk_private.sessions(room_id) ON DELETE CASCADE,
 player_id uuid NOT NULL, seat integer NOT NULL, score integer NOT NULL DEFAULT 0, data jsonb NOT NULL DEFAULT '{}',
 PRIMARY KEY(room_id,player_id), FOREIGN KEY(room_id,player_id) REFERENCES public.room_players(room_id,player_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS kizilkuyruk_private.actions (
 room_id uuid NOT NULL REFERENCES kizilkuyruk_private.sessions(room_id) ON DELETE CASCADE,
 step integer NOT NULL, player_id uuid NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(room_id,step,player_id), FOREIGN KEY(room_id,player_id) REFERENCES kizilkuyruk_private.players(room_id,player_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS kizilkuyruk_private.messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 room_id uuid NOT NULL REFERENCES kizilkuyruk_private.sessions(room_id) ON DELETE CASCADE,
 step integer NOT NULL, player_id uuid NOT NULL, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 120), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS party_actions_member_idx ON kizilkuyruk_private.actions(room_id,player_id);
CREATE INDEX IF NOT EXISTS party_messages_room_step ON kizilkuyruk_private.messages(room_id,step);
ALTER TABLE kizilkuyruk_private.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kizilkuyruk_private.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE kizilkuyruk_private.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kizilkuyruk_private.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA kizilkuyruk_private FROM PUBLIC,anon,authenticated;

DO $policies$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sessions','players','actions','messages'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='kizilkuyruk_private' AND tablename=t AND policyname='party_deny_direct_access') THEN
   EXECUTE format('CREATE POLICY party_deny_direct_access ON kizilkuyruk_private.%I FOR ALL TO anon,authenticated USING(false) WITH CHECK(false)',t);
  END IF;
 END LOOP;
END $policies$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.room(p_code text) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE id_found uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açmalısın'; END IF;
 SELECT r.id INTO id_found FROM public.rooms r JOIN public.room_players p ON p.room_id=r.id
 WHERE r.code=upper(trim(p_code)) AND p.player_id=auth.uid() AND p.is_active AND p.kicked_at IS NULL AND r.party_mode IS NOT NULL;
 IF id_found IS NULL THEN RAISE EXCEPTION 'Bu odaya erişimin yok'; END IF;
 RETURN id_found;
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.expected(p_room uuid) RETURNS SETOF uuid LANGUAGE sql SET search_path=pg_catalog,public AS $$
 SELECT p.player_id FROM kizilkuyruk_private.players p
 JOIN public.room_players rp ON rp.room_id=p.room_id AND rp.player_id=p.player_id
 JOIN kizilkuyruk_private.sessions s ON s.room_id=p.room_id
 WHERE p.room_id=p_room AND rp.is_active AND rp.kicked_at IS NULL
 AND s.phase NOT IN ('report','finished')
 AND (s.phase<>'pitch' OR p.player_id::text=s.public_state->>'seller')
 AND (s.phase<>'bid' OR p.player_id::text<>s.public_state->>'seller')
 AND (s.phase<>'last_guess' OR p.data->>'role'='impostor')
$$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.touch(p_room uuid) RETURNS void LANGUAGE sql SET search_path=pg_catalog,public AS $$
 UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=p_room
$$;
CREATE OR REPLACE FUNCTION kizilkuyruk_private.stage(p_room uuid,p_phase text,p_seconds integer DEFAULT 40) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE kizilkuyruk_private.sessions SET phase=p_phase,step=step+1,deadline=now()+make_interval(secs=>p_seconds) WHERE room_id=p_room;
 UPDATE public.rooms SET phase_started_at=now(),phase_deadline_at=now()+make_interval(secs=>p_seconds),state_version=state_version+1,updated_at=now() WHERE id=p_room;
END $$;
CREATE OR REPLACE FUNCTION kizilkuyruk_private.report(p_room uuid,p_message text,p_next text,p_details jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE kizilkuyruk_private.sessions SET report=jsonb_build_object('message',p_message,'details',p_details), secret=secret||jsonb_build_object('next',p_next) WHERE room_id=p_room;
 PERFORM kizilkuyruk_private.stage(p_room,'report',12);
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.finish(p_room uuid,p_result text,p_winners uuid[]) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s kizilkuyruk_private.sessions;
BEGIN
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=p_room;
 IF s.mode='kayip_kare' THEN UPDATE kizilkuyruk_private.sessions SET public_state=public_state||jsonb_build_object('scene',secret->'scene') WHERE room_id=p_room; END IF;
 UPDATE kizilkuyruk_private.sessions SET phase='finished',deadline=NULL,winners=coalesce(p_winners,'{}'),result=p_result,step=step+1 WHERE room_id=p_room;
 UPDATE public.room_players p SET score=x.score FROM kizilkuyruk_private.players x WHERE x.room_id=p_room AND p.room_id=x.room_id AND p.player_id=x.player_id;
 WITH recorded AS (
  INSERT INTO public.room_game_stats(room_id,game_number,user_id,score,rank)
  SELECT p_room,s.game_number,p.player_id,p.score,dense_rank() OVER(ORDER BY p.score DESC)::integer
  FROM kizilkuyruk_private.players p JOIN public.room_players rp USING(room_id,player_id)
  WHERE p.room_id=p_room AND NOT rp.is_bot
  ON CONFLICT(room_id,game_number,user_id) DO NOTHING RETURNING user_id,score
 ) INSERT INTO public.user_stats(user_id,games_played,games_won,total_score)
 SELECT user_id,1,(user_id=ANY(coalesce(p_winners,'{}')))::integer,score FROM recorded
 ON CONFLICT(user_id) DO UPDATE SET games_played=public.user_stats.games_played+1,games_won=public.user_stats.games_won+excluded.games_won,total_score=public.user_stats.total_score+excluded.total_score,updated_at=now();
 UPDATE public.rooms SET phase='game_over',finished_at=now(),phase_deadline_at=NULL,state_version=state_version+1,updated_at=now() WHERE id=p_room;
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.prepare(p_room uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s kizilkuyruk_private.sessions; p record; order_symbols text[]; colors text[]; reverse_it boolean; answer text; seller uuid; value_n integer; low_n integer; high_n integer; public_n jsonb;
BEGIN
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=p_room;
 IF s.mode='tilki_soygunu' THEN
  PERFORM kizilkuyruk_private.stage(p_room,'plan',35);
 ELSIF s.mode='kizil_pakt' THEN
  UPDATE kizilkuyruk_private.players SET data=data-'hint' WHERE room_id=p_room;
  PERFORM kizilkuyruk_private.stage(p_room,'night',35);
 ELSIF s.mode='kilit_altinda' THEN
  SELECT array_agg(x ORDER BY random()) INTO order_symbols FROM unnest(ARRAY['Güneş','Ay','Göz']) x;
  SELECT array_agg(x ORDER BY random()) INTO colors FROM unnest(ARRAY['1','2','3']) x;
  reverse_it:=random()<0.5;
  SELECT string_agg(colors[array_position(ARRAY['Güneş','Ay','Göz'],x)],'' ORDER BY CASE WHEN reverse_it THEN -i ELSE i END)
  INTO answer FROM unnest(order_symbols) WITH ORDINALITY t(x,i);
  UPDATE kizilkuyruk_private.sessions SET secret=secret||jsonb_build_object('answer',answer) WHERE room_id=p_room;
  FOR p IN SELECT * FROM kizilkuyruk_private.players WHERE room_id=p_room LOOP
   UPDATE kizilkuyruk_private.players SET data=data||jsonb_build_object('role',CASE p.seat%3 WHEN 0 THEN 'Sıra Uzmanı' WHEN 1 THEN 'Renk Uzmanı' ELSE 'Güvenlik Uzmanı' END,
    'hint',CASE p.seat%3 WHEN 0 THEN 'Sembol sırası: '||array_to_string(order_symbols,' → ')
    WHEN 1 THEN 'Güneş = '||colors[1]||', Ay = '||colors[2]||', Göz = '||colors[3]
    ELSE CASE WHEN reverse_it THEN 'Renkleri bulduktan sonra sırayı TERS ÇEVİRİN.' ELSE 'Bulduğunuz renk sırasını aynen kullanın.' END END)
    WHERE room_id=p_room AND player_id=p.player_id;
  END LOOP;
  PERFORM kizilkuyruk_private.stage(p_room,'lock',65);
 ELSIF s.mode='kayip_kare' THEN
  PERFORM kizilkuyruk_private.stage(p_room,'clue',45);
 ELSIF s.mode='gece_pazari' THEN
  SELECT player_id INTO seller FROM kizilkuyruk_private.players WHERE room_id=p_room ORDER BY seat OFFSET s.round_no-1 LIMIT 1;
  value_n:=floor(random()*9)::integer;
  UPDATE kizilkuyruk_private.sessions SET secret=secret||jsonb_build_object('value',value_n),public_state=public_state||jsonb_build_object('seller',seller,'pitch',NULL) WHERE room_id=p_room;
  FOR p IN SELECT * FROM kizilkuyruk_private.players WHERE room_id=p_room LOOP
   low_n:=greatest(0,value_n-(1+floor(random()*3)::integer)); high_n:=least(8,value_n+(1+floor(random()*3)::integer));
   UPDATE kizilkuyruk_private.players SET data=data||jsonb_build_object('hint',CASE WHEN p.player_id=seller THEN 'Sandığın gerçek değeri: '||value_n||'. Açıklamanda blöf yapabilirsin.' ELSE 'Özel ekspertiz: değer '||low_n||'–'||high_n||' arasında.' END,'low',low_n,'high',high_n)
   WHERE room_id=p_room AND player_id=p.player_id;
  END LOOP;
  PERFORM kizilkuyruk_private.stage(p_room,'pitch',25);
 END IF;
 UPDATE public.rooms SET current_round=s.round_no WHERE id=p_room;
END $$;

CREATE OR REPLACE FUNCTION public.create_party_room_secure(p_code varchar,p_name varchar,p_avatar_key varchar,p_total_rounds integer,p_round_seconds integer,p_categories text[],p_is_private boolean,p_password text,p_game_mode text)
RETURNS TABLE(room_id uuid,room_code varchar,host_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; min_n integer; max_n integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açmalısın'; END IF;
 IF p_game_mode NOT IN ('tilki_soygunu','kizil_pakt','kilit_altinda','kayip_kare','gece_pazari') OR p_game_mode IS NULL THEN RAISE EXCEPTION 'Oyun desteklenmiyor'; END IF;
 IF upper(trim(p_code)) !~ '^[A-Z0-9]{5,6}$' THEN RAISE EXCEPTION 'Oda kodu geçersiz'; END IF;
 IF p_is_private IS NULL OR (p_is_private AND (p_password IS NULL OR octet_length(p_password) NOT BETWEEN 8 AND 72)) THEN RAISE EXCEPTION 'Özel oda şifresi 8–72 bayt olmalı'; END IF;
 min_n:=CASE p_game_mode WHEN 'kizil_pakt' THEN 6 WHEN 'kilit_altinda' THEN 3 WHEN 'gece_pazari' THEN 3 ELSE 4 END;
 max_n:=CASE p_game_mode WHEN 'kizil_pakt' THEN 10 WHEN 'tilki_soygunu' THEN 8 WHEN 'kayip_kare' THEN 8 ELSE 6 END;
 INSERT INTO public.rooms(code,host_id,game_mode,party_mode,phase,total_rounds,round_seconds,selected_categories,min_players,max_players)
 VALUES(upper(trim(p_code)),auth.uid(),'classic',p_game_mode,'lobby',10,40,'{}',min_n,max_n) RETURNING id INTO r;
 INSERT INTO public.room_players(room_id,player_id,name,avatar_key,is_host,is_ready,is_online,is_active)
 VALUES(r,auth.uid(),left(coalesce(nullif(trim(p_name),''),'Oyuncu'),32),left(coalesce(p_avatar_key,'fox'),128),true,true,true,true);
 IF p_is_private THEN INSERT INTO public.private_room_credentials(room_id,password_hash) VALUES(r,extensions.crypt(p_password,extensions.gen_salt('bf',12))); END IF;
 RETURN QUERY SELECT r,upper(trim(p_code))::varchar,auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.party_start_secure(p_room_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.rooms; n integer; foxes integer; common_scene integer; fox_scene integer; p record; role_n text;
BEGIN
 SELECT * INTO r FROM public.rooms WHERE id=kizilkuyruk_private.room(p_room_code) FOR UPDATE;
 IF r.host_id<>auth.uid() THEN RAISE EXCEPTION 'Yalnızca ev sahibi başlatabilir'; END IF;
 IF r.phase<>'lobby' THEN RAISE EXCEPTION 'Oyun zaten başladı'; END IF;
 SELECT count(*) INTO n FROM public.room_players WHERE room_id=r.id AND is_active AND kicked_at IS NULL;
 IF n<r.min_players OR n>r.max_players THEN RAISE EXCEPTION 'Bu oyun %–% oyuncu ister',r.min_players,r.max_players; END IF;
 IF EXISTS(SELECT 1 FROM public.room_players WHERE room_id=r.id AND is_active AND kicked_at IS NULL AND (NOT is_ready OR NOT is_online)) THEN RAISE EXCEPTION 'Herkes hazır ve çevrim içi olmalı'; END IF;
 DELETE FROM kizilkuyruk_private.sessions WHERE room_id=r.id;
 INSERT INTO kizilkuyruk_private.sessions(room_id,mode,game_number,phase,public_state)
 VALUES(r.id,r.party_mode,r.game_number,'setup',CASE r.party_mode WHEN 'tilki_soygunu' THEN '{"alarm":0,"successes":0,"rounds":5}' WHEN 'kizil_pakt' THEN '{"damage":0,"rounds":5,"exposed":[]}' WHEN 'kilit_altinda' THEN '{"locks":0,"errors":0,"rounds":6}' WHEN 'kayip_kare' THEN '{"rounds":1,"clues":[],"details":[]}' ELSE jsonb_build_object('rounds',n)::text END::jsonb);
 foxes:=CASE WHEN r.party_mode='kizil_pakt' AND n>=8 THEN 2 ELSE 1 END;
 common_scene:=floor(random()*6)::integer; fox_scene:=(common_scene+1+floor(random()*5)::integer)%6;
 FOR p IN SELECT rp.*,row_number() OVER(ORDER BY random())-1 AS seat FROM public.room_players rp WHERE room_id=r.id AND is_active AND kicked_at IS NULL LOOP
  role_n:=CASE r.party_mode WHEN 'kizil_pakt' THEN CASE WHEN p.seat<foxes THEN 'fox' WHEN p.seat=foxes THEN 'scout' ELSE 'keeper' END WHEN 'kayip_kare' THEN CASE WHEN p.seat=0 THEN 'impostor' ELSE 'observer' END ELSE 'player' END;
  INSERT INTO kizilkuyruk_private.players(room_id,player_id,seat,data) VALUES(r.id,p.player_id,p.seat,jsonb_build_object('role',role_n,'steals',2,'protects',2,'coins',12,'assets_value',0,'asset_count',0,'exposed',false,'detained',0,'scene',CASE WHEN role_n='impostor' THEN fox_scene ELSE common_scene END,'crop',(p.seat%4)::integer));
 END LOOP;
 UPDATE kizilkuyruk_private.sessions SET secret=jsonb_build_object('scene',common_scene) WHERE room_id=r.id;
 UPDATE public.rooms SET phase='question',total_rounds=CASE r.party_mode WHEN 'kilit_altinda' THEN 6 WHEN 'gece_pazari' THEN n WHEN 'kayip_kare' THEN 1 ELSE 5 END,current_round=1,current_question_id=NULL,finished_at=NULL,paused_at=NULL WHERE id=r.id;
 UPDATE public.room_players SET score=0 WHERE room_id=r.id;
 PERFORM kizilkuyruk_private.prepare(r.id);
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.resolve(p_room uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s kizilkuyruk_private.sessions; n integer; opens integer; guards integer; alarm_n integer; success_n integer; damage_n integer; locks_n integer; errors_n integer; target uuid; top_n integer; tie_n integer; winners_n uuid[]; v_scout record; a jsonb; counts jsonb; details_n jsonb; protected_sites integer[]; suspects uuid[]; actual_fox uuid; winner_bool boolean; bid_n integer; seller uuid; value_n integer; answer_n text; next_n text; message_n text;
BEGIN
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=p_room FOR UPDATE;
 IF s.phase IN ('finished','report') THEN RETURN; END IF;
 SELECT count(*) INTO n FROM kizilkuyruk_private.expected(p_room);
 IF s.mode='tilki_soygunu' THEN
  SELECT count(*) FILTER(WHERE payload->>'choice'='open'),count(*) FILTER(WHERE payload->>'choice'='guard') INTO opens,guards FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step;
  winner_bool:=opens>=ceil(n::numeric/2) AND guards>=1;
  alarm_n:=(s.public_state->>'alarm')::integer+CASE WHEN winner_bool THEN 0 ELSE 1 END;
  success_n:=(s.public_state->>'successes')::integer+winner_bool::integer;
  UPDATE kizilkuyruk_private.players p SET score=score+CASE WHEN NOT winner_bool THEN 0 WHEN a.payload->>'choice'='steal' THEN 4 ELSE 2 END FROM kizilkuyruk_private.actions a WHERE a.room_id=p_room AND a.step=s.step AND p.room_id=a.room_id AND p.player_id=a.player_id;
  SELECT jsonb_agg(jsonb_build_object('playerId',player_id,'choice',payload->>'choice')) INTO details_n FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step;
  UPDATE kizilkuyruk_private.sessions SET public_state=public_state||jsonb_build_object('alarm',alarm_n,'successes',success_n) WHERE room_id=p_room;
  IF alarm_n>=3 THEN UPDATE kizilkuyruk_private.players SET score=0 WHERE room_id=p_room; PERFORM kizilkuyruk_private.finish(p_room,'Alarm doldu; ekip kaçamadı. Kimse kazanamadı.','{}');
  ELSIF s.round_no>=5 THEN
   SELECT array_agg(player_id) INTO winners_n FROM kizilkuyruk_private.players WHERE room_id=p_room AND score=(SELECT max(score) FROM kizilkuyruk_private.players WHERE room_id=p_room);
   PERFORM kizilkuyruk_private.finish(p_room,'Ekip kaçtı! En çok ganimeti taşıyan tilki kazandı.',winners_n);
  ELSE PERFORM kizilkuyruk_private.report(p_room,CASE WHEN winner_bool THEN 'Soygun başarılı! Çalışanlar +2, pay çalanlar +4 aldı.' ELSE 'Yeterli kasa açıcı veya gözcü yoktu. Alarm +1; ganimet alınamadı.' END,'new_round',coalesce(details_n,'[]')); END IF;
 ELSIF s.mode='kilit_altinda' THEN
  SELECT payload->>'choice',count(*) INTO answer_n,top_n FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step GROUP BY payload->>'choice' ORDER BY count(*) DESC LIMIT 1;
  SELECT count(*) INTO tie_n FROM (SELECT 1 FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step GROUP BY payload->>'choice' HAVING count(*)=top_n) q;
  winner_bool:=tie_n=1 AND answer_n=s.secret->>'answer';
  locks_n:=(s.public_state->>'locks')::integer+winner_bool::integer; errors_n:=(s.public_state->>'errors')::integer+(NOT winner_bool)::integer;
  UPDATE kizilkuyruk_private.sessions SET public_state=public_state||jsonb_build_object('locks',locks_n,'errors',errors_n) WHERE room_id=p_room;
  UPDATE kizilkuyruk_private.players SET score=locks_n*3 WHERE room_id=p_room;
  IF locks_n>=4 THEN SELECT array_agg(player_id) INTO winners_n FROM kizilkuyruk_private.players WHERE room_id=p_room; PERFORM kizilkuyruk_private.finish(p_room,'Dört kilit açıldı. Hep birlikte kaçtınız!',winners_n);
  ELSIF errors_n>=3 OR s.round_no>=6 THEN PERFORM kizilkuyruk_private.finish(p_room,'Güvenlik kilitlendi; bu sefer kaçış olmadı.','{}');
  ELSE PERFORM kizilkuyruk_private.report(p_room,CASE WHEN winner_bool THEN 'Kilit açıldı! Parçalı bilgileri doğru birleştirdiniz.' ELSE 'Kilit açılmadı. Tek bir sırada uzlaşın ve güvenlik kuralını kontrol edin.' END,'new_round',jsonb_build_object('answer',s.secret->>'answer','selected',answer_n)); END IF;
 ELSIF s.mode='kizil_pakt' AND s.phase='night' THEN
  SELECT coalesce(array_agg((a.payload->>'site')::integer),'{}') INTO protected_sites FROM kizilkuyruk_private.actions a JOIN kizilkuyruk_private.players p USING(room_id,player_id) WHERE a.room_id=p_room AND a.step=s.step AND a.payload->>'choice'='protect';
  SELECT count(*) INTO damage_n FROM kizilkuyruk_private.actions a WHERE a.room_id=p_room AND a.step=s.step AND a.payload->>'choice'='sabotage' AND NOT ((a.payload->>'site')::integer=ANY(protected_sites));
  damage_n:=least(3,(s.public_state->>'damage')::integer+least(1,damage_n));
  SELECT coalesce(jsonb_agg(jsonb_build_object('playerId',player_id,'site',payload->>'claim')),'[]') INTO details_n FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step;
  SELECT player_id INTO actual_fox FROM kizilkuyruk_private.players WHERE room_id=p_room AND data->>'role'='fox' AND NOT (data->>'exposed')::boolean ORDER BY random() LIMIT 1;
  FOR v_scout IN SELECT * FROM kizilkuyruk_private.players WHERE room_id=p_room AND data->>'role'='scout' LOOP
   -- Always include a fox plus an innocent; the scout still has to deduce which.
   SELECT ARRAY[actual_fox,player_id] INTO suspects FROM kizilkuyruk_private.players WHERE room_id=p_room AND player_id<>v_scout.player_id AND data->>'role'<>'fox' ORDER BY random() LIMIT 1;
   UPDATE kizilkuyruk_private.players SET data=data||jsonb_build_object('suspects',to_jsonb(suspects)) WHERE room_id=p_room AND player_id=v_scout.player_id;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('site',site,'protected',site=ANY(protected_sites),'damage',(SELECT count(*) FROM kizilkuyruk_private.actions a WHERE a.room_id=p_room AND a.step=s.step AND a.payload->>'choice'='sabotage' AND (a.payload->>'site')::integer=site AND NOT (site=ANY(protected_sites)))) ORDER BY site)
  INTO counts FROM generate_series(0,2) site;
  UPDATE kizilkuyruk_private.sessions SET public_state=public_state||jsonb_build_object('damage',damage_n,'claims',details_n,'events',counts) WHERE room_id=p_room;
  IF damage_n>=3 THEN SELECT array_agg(player_id) INTO winners_n FROM kizilkuyruk_private.players WHERE room_id=p_room AND data->>'role'='fox'; UPDATE kizilkuyruk_private.players SET score=CASE WHEN player_id=ANY(winners_n) THEN 10 ELSE 0 END WHERE room_id=p_room; PERFORM kizilkuyruk_private.finish(p_room,'Üç erzak kaybedildi. Kızıl Tilkiler köyü ele geçirdi.',winners_n);
  ELSE PERFORM kizilkuyruk_private.report(p_room,'Gece bitti. Konum beyanlarını karşılaştırın; izci iki adaydan oluşan özel bir iz aldı.','vote',jsonb_build_object('damage',damage_n,'claims',details_n)); END IF;
 ELSIF s.mode IN ('kizil_pakt','kayip_kare') AND s.phase='vote' THEN
  SELECT (payload->>'target')::uuid,count(*) INTO target,top_n FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step AND payload ? 'target' GROUP BY payload->>'target' ORDER BY count(*) DESC LIMIT 1;
  SELECT count(*) INTO tie_n FROM (SELECT 1 FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step AND payload ? 'target' GROUP BY payload->>'target' HAVING count(*)=top_n) q;
  IF s.mode='kizil_pakt' THEN
   winner_bool:=target IS NOT NULL AND tie_n=1 AND top_n>=floor(n::numeric/2)+1;
   IF winner_bool THEN UPDATE kizilkuyruk_private.players SET data=data||jsonb_build_object('detained',s.round_no+1,'exposed',CASE WHEN data->>'role'='fox' THEN true ELSE (data->>'exposed')::boolean END) WHERE room_id=p_room AND player_id=target; END IF;
   SELECT coalesce(jsonb_agg(player_id),'[]') INTO details_n FROM kizilkuyruk_private.players WHERE room_id=p_room AND (data->>'exposed')::boolean;
   UPDATE kizilkuyruk_private.sessions SET public_state=public_state||jsonb_build_object('exposed',details_n,'detained',CASE WHEN winner_bool THEN to_jsonb(target) ELSE 'null'::jsonb END) WHERE room_id=p_room;
   IF NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.players WHERE room_id=p_room AND data->>'role'='fox' AND NOT (data->>'exposed')::boolean) OR s.round_no>=5 THEN
    SELECT array_agg(player_id) INTO winners_n FROM kizilkuyruk_private.players WHERE room_id=p_room AND data->>'role'<>'fox';
    UPDATE kizilkuyruk_private.players SET score=CASE WHEN player_id=ANY(winners_n) THEN 10 ELSE 0 END WHERE room_id=p_room;
    PERFORM kizilkuyruk_private.finish(p_room,'Köy korundu. Köylüler kazandı!',winners_n);
   ELSE PERFORM kizilkuyruk_private.report(p_room,CASE WHEN winner_bool THEN 'Çoğunluk kararıyla bir oyuncu gözetimde. Oyundan çıkmaz; sonraki gece sabotaj yapamaz.' ELSE 'Çoğunluk oluşmadı; kimse gözetim altına alınmadı.' END,'new_round',jsonb_build_object('target',target,'votes',top_n)); END IF;
  ELSE
   IF target IS NOT NULL AND tie_n=1 AND EXISTS(SELECT 1 FROM kizilkuyruk_private.players WHERE room_id=p_room AND player_id=target AND data->>'role'='impostor') THEN PERFORM kizilkuyruk_private.report(p_room,'Sahtekar bulundu! Ortak sahneyi tahmin ederek son kez kurtulabilir.','last_guess');
   ELSE SELECT array_agg(player_id) INTO winners_n FROM kizilkuyruk_private.players WHERE room_id=p_room AND data->>'role'='impostor'; UPDATE kizilkuyruk_private.players SET score=CASE WHEN player_id=ANY(winners_n) THEN 5 ELSE 0 END WHERE room_id=p_room; PERFORM kizilkuyruk_private.finish(p_room,'Sahtekar fark edilmeden sıyrıldı.',winners_n); END IF;
  END IF;
 ELSIF s.mode='kayip_kare' AND s.phase IN ('clue','detail') THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('playerId',player_id,'text',payload->>'text')),'[]') INTO details_n FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step;
  UPDATE kizilkuyruk_private.sessions SET public_state=public_state||jsonb_build_object(CASE WHEN s.phase='clue' THEN 'clues' ELSE 'details' END,details_n) WHERE room_id=p_room;
  PERFORM kizilkuyruk_private.report(p_room,CASE WHEN s.phase='clue' THEN 'İlk gözlemler açıldı. Şimdi görüntündeki ışık veya yön işaretine odaklan.' ELSE 'Ayrıntılar açıldı. Farklı sahneyi gören oyuncuyu oylayın.' END,CASE WHEN s.phase='clue' THEN 'detail' ELSE 'vote' END,details_n);
 ELSIF s.mode='kayip_kare' AND s.phase='last_guess' THEN
  SELECT coalesce((payload->>'scene')::integer,-1)=(s.secret->>'scene')::integer INTO winner_bool FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step LIMIT 1;
  SELECT array_agg(player_id) INTO winners_n FROM kizilkuyruk_private.players WHERE room_id=p_room AND CASE WHEN coalesce(winner_bool,false) THEN data->>'role'='impostor' ELSE data->>'role'<>'impostor' END;
  UPDATE kizilkuyruk_private.players SET score=CASE WHEN player_id=ANY(winners_n) THEN 5 ELSE 0 END WHERE room_id=p_room;
  UPDATE kizilkuyruk_private.sessions SET public_state=public_state||jsonb_build_object('scene',secret->'scene') WHERE room_id=p_room;
  PERFORM kizilkuyruk_private.finish(p_room,CASE WHEN coalesce(winner_bool,false) THEN 'Sahtekar ortak sahneyi buldu ve kurtuldu!' ELSE 'Sahtekar sahneyi bulamadı. Gözlemciler kazandı!' END,winners_n);
 ELSIF s.mode='gece_pazari' AND s.phase='pitch' THEN
  SELECT payload->>'text' INTO message_n FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step LIMIT 1;
  UPDATE kizilkuyruk_private.sessions SET public_state=public_state||jsonb_build_object('pitch',coalesce(message_n,'Satıcı sessiz kaldı. Ekspertizine güven.')) WHERE room_id=p_room;
  PERFORM kizilkuyruk_private.stage(p_room,'bid',35);
 ELSIF s.mode='gece_pazari' AND s.phase='bid' THEN
  SELECT player_id,(payload->>'bid')::integer INTO target,bid_n FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step AND (payload->>'bid')::integer>0 ORDER BY (payload->>'bid')::integer DESC LIMIT 1;
  SELECT count(*) INTO tie_n FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=s.step AND (payload->>'bid')::integer=bid_n;
  seller:=(s.public_state->>'seller')::uuid; value_n:=(s.secret->>'value')::integer;
  winner_bool:=target IS NOT NULL AND tie_n=1;
  IF winner_bool THEN
   UPDATE kizilkuyruk_private.players SET data=data||jsonb_build_object('coins',(data->>'coins')::integer-bid_n,'assets_value',(data->>'assets_value')::integer+value_n,'asset_count',(data->>'asset_count')::integer+1) WHERE room_id=p_room AND player_id=target;
   UPDATE kizilkuyruk_private.players SET data=data||jsonb_build_object('coins',(data->>'coins')::integer+2+bid_n/3) WHERE room_id=p_room AND player_id=seller;
  END IF;
  IF s.round_no>=(s.public_state->>'rounds')::integer THEN
   UPDATE kizilkuyruk_private.players SET score=(data->>'coins')::integer+(data->>'assets_value')::integer WHERE room_id=p_room;
   SELECT array_agg(player_id) INTO winners_n FROM kizilkuyruk_private.players WHERE room_id=p_room AND score=(SELECT max(score) FROM kizilkuyruk_private.players WHERE room_id=p_room);
   PERFORM kizilkuyruk_private.finish(p_room,'Pazar kapandı. Kalan para ve malların gerçek değeri birlikte sayıldı.',winners_n);
  ELSE PERFORM kizilkuyruk_private.report(p_room,CASE WHEN winner_bool THEN 'Sandık satıldı. Gerçek değeri finalde hesaba katılacak.' ELSE 'Teklif çıkmadı veya en yüksek teklif eşitti; sandık satılmadı.' END,'new_round',jsonb_build_object('buyer',CASE WHEN winner_bool THEN target ELSE NULL END,'price',CASE WHEN winner_bool THEN bid_n ELSE 0 END)); END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.submit(p_room uuid,p_actor uuid,p_step integer,p_payload jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s kizilkuyruk_private.sessions; d jsonb; ch text; val integer; target uuid;
BEGIN
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=p_room FOR UPDATE;
 IF s.step<>p_step THEN RAISE EXCEPTION 'Aşama değişti; ekran yenileniyor'; END IF;
 IF s.paused_at IS NOT NULL THEN RAISE EXCEPTION 'Oyun duraklatıldı'; END IF;
 IF s.deadline<=now() THEN RAISE EXCEPTION 'Süre doldu; ekran yenileniyor'; END IF;
 IF NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.expected(p_room) x WHERE x=p_actor) THEN RAISE EXCEPTION 'Bu aşamada hamle yapamazsın'; END IF;
 IF EXISTS(SELECT 1 FROM kizilkuyruk_private.actions WHERE room_id=p_room AND step=p_step AND player_id=p_actor) THEN RETURN; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Geçersiz hamle'; END IF;
 SELECT data INTO d FROM kizilkuyruk_private.players WHERE room_id=p_room AND player_id=p_actor;
 ch:=p_payload->>'choice';
 IF s.phase='plan' THEN
  IF ch IS NULL OR ch NOT IN ('open','guard','steal') THEN RAISE EXCEPTION 'Bir hamle seç'; END IF;
  IF ch='steal' THEN IF (d->>'steals')::integer<1 THEN RAISE EXCEPTION 'Çalma hakkın kalmadı'; END IF; UPDATE kizilkuyruk_private.players SET data=data||jsonb_build_object('steals',(data->>'steals')::integer-1) WHERE room_id=p_room AND player_id=p_actor; END IF;
  p_payload:=jsonb_build_object('choice',ch);
 ELSIF s.phase='night' THEN
  IF ch IS NULL OR ch NOT IN ('work','protect','sabotage') OR jsonb_typeof(p_payload->'site')<>'number' OR jsonb_typeof(p_payload->'claim')<>'number' THEN RAISE EXCEPTION 'Konum ve hamle seç'; END IF;
  IF ch='sabotage' AND (d->>'role'<>'fox' OR (d->>'exposed')::boolean OR (d->>'detained')::integer>=s.round_no) THEN RAISE EXCEPTION 'Sabotaj yapamazsın'; END IF;
  IF ch='protect' THEN
   IF d->>'role'<>'keeper' OR (d->>'protects')::integer<1 THEN RAISE EXCEPTION 'Koruma hakkın yok'; END IF;
   UPDATE kizilkuyruk_private.players SET data=data||jsonb_build_object('protects',(data->>'protects')::integer-1) WHERE room_id=p_room AND player_id=p_actor;
  END IF;
  IF (p_payload->>'site')::integer NOT BETWEEN 0 AND 2 OR (p_payload->>'claim')::integer NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'Konum geçersiz'; END IF;
  p_payload:=jsonb_build_object('choice',ch,'site',(p_payload->>'site')::integer,'claim',(p_payload->>'claim')::integer);
 ELSIF s.phase='vote' THEN
  target:=(p_payload->>'target')::uuid;
  IF target IS NULL OR target=p_actor OR NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.players WHERE room_id=p_room AND player_id=target) THEN RAISE EXCEPTION 'Başka bir oyuncu seç'; END IF;
  IF s.mode='kizil_pakt' AND EXISTS(SELECT 1 FROM kizilkuyruk_private.players WHERE room_id=p_room AND player_id=target AND (data->>'exposed')::boolean) THEN RAISE EXCEPTION 'Bu tilki zaten ifşa edildi'; END IF;
  p_payload:=jsonb_build_object('target',target);
 ELSIF s.phase='lock' THEN
  IF ch IS NULL OR ch NOT IN ('123','132','213','231','312','321') THEN RAISE EXCEPTION 'Üç farklı renk seç'; END IF;
  p_payload:=jsonb_build_object('choice',ch);
 ELSIF s.phase IN ('clue','detail','pitch') THEN
  ch:=trim(p_payload->>'text'); IF ch IS NULL OR length(ch) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION '2–120 karakter yaz'; END IF;
  p_payload:=jsonb_build_object('text',ch);
 ELSIF s.phase='last_guess' THEN
  IF jsonb_typeof(p_payload->'scene')<>'number' OR (p_payload->>'scene')::integer NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'Bir sahne seç'; END IF;
  p_payload:=jsonb_build_object('scene',(p_payload->>'scene')::integer);
 ELSIF s.phase='bid' THEN
  IF jsonb_typeof(p_payload->'bid')<>'number' THEN RAISE EXCEPTION 'Teklif geçersiz'; END IF;
  val:=(p_payload->>'bid')::integer; IF val<0 OR val>(d->>'coins')::integer THEN RAISE EXCEPTION 'Yalnızca elindeki para kadar teklif verebilirsin'; END IF;
  p_payload:=jsonb_build_object('bid',val);
 ELSE RAISE EXCEPTION 'Bu aşamada hamle yok'; END IF;
 INSERT INTO kizilkuyruk_private.actions VALUES(p_room,p_step,p_actor,p_payload);
 PERFORM kizilkuyruk_private.touch(p_room);
 IF NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.expected(p_room) x WHERE NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.actions a WHERE a.room_id=p_room AND a.step=p_step AND a.player_id=x)) THEN PERFORM kizilkuyruk_private.resolve(p_room); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.party_action_secure(p_room_code text,p_step integer,p_payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid;
BEGIN r:=kizilkuyruk_private.room(p_room_code); PERFORM 1 FROM public.rooms WHERE id=r FOR UPDATE; PERFORM kizilkuyruk_private.submit(r,auth.uid(),p_step,p_payload); END $$;

CREATE OR REPLACE FUNCTION public.party_advance_secure(p_room_code text,p_step integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.sessions; host uuid;
BEGIN
 r:=kizilkuyruk_private.room(p_room_code); SELECT host_id INTO host FROM public.rooms WHERE id=r FOR UPDATE;
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r FOR UPDATE;
 IF s.step<>p_step OR s.phase='finished' OR s.paused_at IS NOT NULL THEN RETURN; END IF;
 IF s.phase='report' THEN
  IF s.deadline>now() AND host<>auth.uid() THEN RETURN; END IF;
  IF s.secret->>'next'='new_round' THEN UPDATE kizilkuyruk_private.sessions SET round_no=round_no+1 WHERE room_id=r; PERFORM kizilkuyruk_private.prepare(r);
  ELSE PERFORM kizilkuyruk_private.stage(r,s.secret->>'next',40); END IF;
 ELSIF s.deadline<=now() THEN PERFORM kizilkuyruk_private.resolve(r); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.party_message_secure(p_room_code text,p_step integer,p_text text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.sessions;
BEGIN
 r:=kizilkuyruk_private.room(p_room_code); PERFORM 1 FROM public.rooms WHERE id=r FOR UPDATE;
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
 IF s.step<>p_step OR s.phase='finished' OR s.paused_at IS NOT NULL THEN RAISE EXCEPTION 'Bu aşamada mesaj gönderilemez'; END IF;
 IF p_text IS NULL OR length(trim(p_text)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION '1–120 karakter yaz'; END IF;
 IF (SELECT count(*) FROM kizilkuyruk_private.messages WHERE room_id=r AND step=p_step AND player_id=auth.uid())>=2 THEN RAISE EXCEPTION 'Bu aşamada iki mesaj hakkın var'; END IF;
 INSERT INTO kizilkuyruk_private.messages(room_id,step,player_id,body) VALUES(r,p_step,auth.uid(),trim(p_text));
 PERFORM kizilkuyruk_private.touch(r);
END $$;

CREATE OR REPLACE FUNCTION public.party_pause_secure(p_room_code text,p_paused boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.sessions;
BEGIN
 r:=kizilkuyruk_private.room(p_room_code); PERFORM 1 FROM public.rooms WHERE id=r AND host_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Yalnızca ev sahibi duraklatabilir'; END IF;
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r FOR UPDATE;
 IF s.phase='finished' THEN RETURN; END IF;
 IF p_paused IS NULL THEN RAISE EXCEPTION 'Duraklatma durumu geçersiz'; END IF;
 IF p_paused AND s.paused_at IS NULL THEN UPDATE kizilkuyruk_private.sessions SET paused_at=now() WHERE room_id=r;
 ELSIF NOT p_paused AND s.paused_at IS NOT NULL THEN UPDATE kizilkuyruk_private.sessions SET deadline=deadline+(now()-paused_at),paused_at=NULL WHERE room_id=r; END IF;
 UPDATE public.rooms SET paused_at=(SELECT paused_at FROM kizilkuyruk_private.sessions WHERE room_id=r),phase_deadline_at=(SELECT deadline FROM kizilkuyruk_private.sessions WHERE room_id=r),state_version=state_version+1 WHERE id=r;
END $$;

CREATE OR REPLACE FUNCTION public.party_state_secure(p_room_code text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.sessions; d jsonb; v jsonb;
BEGIN
 r:=kizilkuyruk_private.room(p_room_code); SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
 IF NOT FOUND THEN RETURN jsonb_build_object('phase','lobby'); END IF;
 SELECT data INTO d FROM kizilkuyruk_private.players WHERE room_id=r AND player_id=auth.uid();
 SELECT jsonb_build_object('mode',s.mode,'gameNumber',s.game_number,'stateVersion',(SELECT state_version FROM public.rooms WHERE id=r),'phase',s.phase,'round',s.round_no,'step',s.step,'deadline',s.deadline,'pausedAt',s.paused_at,'public',s.public_state,'report',s.report,'result',s.result,'winnerIds',to_jsonb(s.winners),
 'isHost',(SELECT host_id=auth.uid() FROM public.rooms WHERE id=r),
 'canAct',EXISTS(SELECT 1 FROM kizilkuyruk_private.expected(r) x WHERE x=auth.uid()) AND NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.actions WHERE room_id=r AND step=s.step AND player_id=auth.uid()) AND s.paused_at IS NULL,
 'me',jsonb_build_object('role',d->'role','hint',d->'hint','scene',CASE WHEN s.mode='kayip_kare' THEN d->'scene' ELSE NULL END,'crop',d->'crop','steals',d->'steals','protects',d->'protects','coins',d->'coins','assetCount',d->'asset_count','suspects',CASE WHEN d->>'role'='scout' THEN d->'suspects' ELSE NULL END,'allies',CASE WHEN d->>'role'='fox' THEN (SELECT jsonb_agg(player_id) FROM kizilkuyruk_private.players WHERE room_id=r AND data->>'role'='fox' AND player_id<>auth.uid()) ELSE NULL END,'exposed',d->'exposed','detained',d->'detained'),
 'players',(SELECT jsonb_agg(jsonb_build_object('id',p.player_id,'name',coalesce(pr.display_name,rp.name),'avatarKey',coalesce(pr.avatar_key,rp.avatar_key),'isBot',rp.is_bot,'score',p.score,'coins',CASE WHEN s.mode='gece_pazari' THEN p.data->'coins' ELSE NULL END,'role',CASE WHEN s.phase='finished' THEN p.data->'role' ELSE NULL END,'submitted',EXISTS(SELECT 1 FROM kizilkuyruk_private.actions WHERE room_id=r AND step=s.step AND player_id=p.player_id)) ORDER BY p.seat) FROM kizilkuyruk_private.players p JOIN public.room_players rp USING(room_id,player_id) LEFT JOIN public.profiles pr ON pr.id=p.player_id WHERE p.room_id=r),
 'submittedCount',(SELECT count(*) FROM kizilkuyruk_private.actions WHERE room_id=r AND step=s.step),
 'totalCount',(SELECT count(*) FROM kizilkuyruk_private.expected(r)),
 'messages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'playerId',player_id,'text',body) ORDER BY id),'[]') FROM (SELECT * FROM kizilkuyruk_private.messages WHERE room_id=r ORDER BY id DESC LIMIT 24) m)) INTO v;
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.party_bot_turn_secure(p_room_code text,p_bot_id uuid,p_step integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r uuid; s kizilkuyruk_private.sessions; p kizilkuyruk_private.players; payload_n jsonb; target uuid; site_n integer; choice_n text; candidate_n text; scene_n integer;
BEGIN
 r:=kizilkuyruk_private.room(p_room_code); PERFORM 1 FROM public.rooms WHERE id=r AND host_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.room_players WHERE room_id=r AND player_id=p_bot_id AND is_bot AND is_active AND kicked_at IS NULL) THEN RAISE EXCEPTION 'Botu yalnızca ev sahibi yönetebilir'; END IF;
 SELECT * INTO s FROM kizilkuyruk_private.sessions WHERE room_id=r;
 IF s.step<>p_step OR s.deadline<=now() OR s.paused_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.expected(r) x WHERE x=p_bot_id) OR EXISTS(SELECT 1 FROM kizilkuyruk_private.actions WHERE room_id=r AND step=p_step AND player_id=p_bot_id) THEN RETURN; END IF;
 SELECT * INTO p FROM kizilkuyruk_private.players WHERE room_id=r AND player_id=p_bot_id;
 IF s.phase='plan' THEN choice_n:=CASE WHEN p.seat=0 THEN 'guard' WHEN p.seat<=ceil((SELECT count(*) FROM kizilkuyruk_private.players WHERE room_id=r)::numeric/2) THEN 'open' WHEN (p.data->>'steals')::integer>0 THEN 'steal' ELSE 'guard' END; payload_n:=jsonb_build_object('choice',choice_n);
 ELSIF s.phase='night' THEN site_n:=floor(random()*3)::integer; choice_n:=CASE WHEN p.data->>'role'='fox' AND NOT (p.data->>'exposed')::boolean AND (p.data->>'detained')::integer<s.round_no THEN 'sabotage' WHEN p.data->>'role'='keeper' AND (p.data->>'protects')::integer>0 THEN 'protect' ELSE 'work' END; payload_n:=jsonb_build_object('choice',choice_n,'site',site_n,'claim',CASE WHEN choice_n='sabotage' THEN (site_n+1)%3 ELSE site_n END);
 ELSIF s.phase='vote' THEN SELECT player_id INTO target FROM kizilkuyruk_private.players WHERE room_id=r AND player_id<>p_bot_id ORDER BY random() LIMIT 1; payload_n:=jsonb_build_object('target',target);
 ELSIF s.phase='lock' THEN
  -- Teaching bots share their own clue; their final choice follows a human's
  -- locked proposal when present, otherwise they explore a permutation.
  IF NOT EXISTS(SELECT 1 FROM kizilkuyruk_private.messages WHERE room_id=r AND step=p_step AND player_id=p_bot_id) THEN INSERT INTO kizilkuyruk_private.messages(room_id,step,player_id,body) VALUES(r,p_step,p_bot_id,p.data->>'hint'); PERFORM kizilkuyruk_private.touch(r); END IF;
  SELECT a.payload->>'choice' INTO candidate_n FROM kizilkuyruk_private.actions a JOIN public.room_players rp USING(room_id,player_id) WHERE a.room_id=r AND a.step=p_step AND NOT rp.is_bot LIMIT 1;
  IF candidate_n IS NULL AND s.deadline>now()+interval '8 seconds' THEN RETURN; END IF;
  payload_n:=jsonb_build_object('choice',coalesce(candidate_n,(ARRAY['123','132','213','231','312','321'])[1+floor(random()*6)::integer]));
 ELSIF s.phase IN ('clue','detail') THEN
  scene_n:=(p.data->>'scene')::integer;
  choice_n:=(ARRAY['Raylar ve bir saat seçiliyor.','Camların yanında uçuş yönleri var.','Su kenarında demir halkalar var.','Renkli ışıklar ve dönme dolap var.','Kitap raflarının yanında lamba var.','Ağaçların arasında bir çadır var.'])[scene_n+1];
  payload_n:=jsonb_build_object('text',choice_n);
 ELSIF s.phase='last_guess' THEN payload_n:=jsonb_build_object('scene',floor(random()*6)::integer);
 ELSIF s.phase='pitch' THEN payload_n:=jsonb_build_object('text','Ekspertiz raporunu değerlendir; bu sandık sürpriz yapabilir.');
 ELSIF s.phase='bid' THEN payload_n:=jsonb_build_object('bid',least((p.data->>'coins')::integer,greatest(0,((p.data->>'low')::integer+(p.data->>'high')::integer)/2-1)));
 ELSE RETURN; END IF;
 PERFORM kizilkuyruk_private.submit(r,p_bot_id,p_step,payload_n);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA kizilkuyruk_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_party_room_secure(varchar,varchar,varchar,integer,integer,text[],boolean,text,text),public.party_start_secure(text),public.party_state_secure(text),public.party_action_secure(text,integer,jsonb),public.party_advance_secure(text,integer),public.party_message_secure(text,integer,text),public.party_pause_secure(text,boolean),public.party_bot_turn_secure(text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_party_room_secure(varchar,varchar,varchar,integer,integer,text[],boolean,text,text),public.party_start_secure(text),public.party_state_secure(text),public.party_action_secure(text,integer,jsonb),public.party_advance_secure(text,integer),public.party_message_secure(text,integer,text),public.party_pause_secure(text,boolean),public.party_bot_turn_secure(text,uuid,integer) TO authenticated;
