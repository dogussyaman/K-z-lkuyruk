-- New Phaser-based multiplayer games. Private state and all actions stay server-authoritative.

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_game_mode_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_game_mode_check CHECK (game_mode = ANY (ARRAY[
  'classic','survival','suspicious','blitz','team_battle','secret_missions','double_trap',
  'golden_question','detective_fox','gizli_tilki','orman_hazinesi',
  'critical_signal','drawing_chain','kitchen_chaos','pirate_cannon'
]));

CREATE OR REPLACE FUNCTION public.create_room_with_mode_secure(
  p_code character varying,
  p_name character varying,
  p_avatar_key character varying,
  p_total_rounds integer,
  p_round_seconds integer,
  p_categories text[],
  p_is_private boolean,
  p_password text,
  p_game_mode text
)
RETURNS TABLE(room_id uuid, room_code character varying, host_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_room_id uuid;
  v_room_code character varying;
  v_host_id uuid;
  v_min_players integer := 2;
  v_max_players integer := 10;
  v_round_seconds integer := p_round_seconds;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  IF p_game_mode IS NULL OR p_game_mode NOT IN (
    'classic','survival','suspicious','blitz','team_battle','secret_missions',
    'double_trap','golden_question','detective_fox','gizli_tilki','orman_hazinesi',
    'critical_signal','drawing_chain','kitchen_chaos','pirate_cannon'
  ) THEN RAISE EXCEPTION 'Desteklenmeyen oyun modu'; END IF;

  CASE p_game_mode
    WHEN 'team_battle' THEN v_min_players := 4;
    WHEN 'secret_missions' THEN v_min_players := 3; v_max_players := 8;
    WHEN 'double_trap' THEN v_max_players := 6;
    WHEN 'detective_fox' THEN v_min_players := 4;
    WHEN 'gizli_tilki' THEN v_min_players := 4;
    WHEN 'orman_hazinesi' THEN v_min_players := 4; v_round_seconds := 20;
    WHEN 'blitz' THEN v_round_seconds := LEAST(COALESCE(p_round_seconds,7),10);
    WHEN 'critical_signal' THEN v_min_players := 3; v_max_players := 8; v_round_seconds := 90;
    WHEN 'drawing_chain' THEN v_min_players := 3; v_max_players := 8; v_round_seconds := 45;
    WHEN 'kitchen_chaos' THEN v_min_players := 3; v_max_players := 8; v_round_seconds := 30;
    WHEN 'pirate_cannon' THEN v_min_players := 2; v_max_players := 8; v_round_seconds := 30;
    ELSE NULL;
  END CASE;

  SELECT created.room_id, created.room_code, created.host_id
    INTO v_room_id, v_room_code, v_host_id
    FROM public.create_room_secure(
      p_code,p_name,p_avatar_key,p_total_rounds,v_round_seconds,
      p_categories,p_is_private,p_password
    ) AS created;

  UPDATE public.rooms
  SET game_mode=p_game_mode,min_players=v_min_players,max_players=v_max_players,
      round_seconds=v_round_seconds,survival_finished=false,updated_at=now()
  WHERE id=v_room_id;
  RETURN QUERY SELECT v_room_id,v_room_code,v_host_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_room_with_mode_secure(character varying,character varying,character varying,integer,integer,text[],boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_room_with_mode_secure(character varying,character varying,character varying,integer,integer,text[],boolean,text,text) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS kizilkuyruk_private.arcade_sessions (
  room_id uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('critical_signal','drawing_chain','kitchen_chaos','pirate_cannon')),
  phase text NOT NULL DEFAULT 'lobby' CHECK (phase IN ('lobby','play','draw','guess','aim','finished')),
  step integer NOT NULL DEFAULT 0 CHECK (step >= 0),
  current_player_id uuid,
  deadline timestamptz,
  public_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_ids uuid[] NOT NULL DEFAULT '{}',
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kizilkuyruk_private.arcade_submissions (
  room_id uuid NOT NULL REFERENCES kizilkuyruk_private.arcade_sessions(room_id) ON DELETE CASCADE,
  step integer NOT NULL,
  player_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id,step,player_id)
);

ALTER TABLE kizilkuyruk_private.arcade_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kizilkuyruk_private.arcade_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kizilkuyruk_private.arcade_sessions,kizilkuyruk_private.arcade_submissions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.arcade_room(p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_room_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açmalısın'; END IF;
  SELECT r.id INTO v_room_id
  FROM public.rooms r JOIN public.room_players p ON p.room_id=r.id
  WHERE r.code=upper(trim(p_code)) AND p.player_id=auth.uid()
    AND p.is_active AND p.kicked_at IS NULL
    AND r.game_mode IN ('critical_signal','drawing_chain','kitchen_chaos','pirate_cannon');
  IF v_room_id IS NULL THEN RAISE EXCEPTION 'Bu oyun odasına erişimin yok'; END IF;
  RETURN v_room_id;
END;
$function$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.arcade_new_signal(p_room uuid,p_module integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_answer jsonb; v_hints jsonb:='{}'::jsonb; v_player record; v_i integer:=0; v_color text;
BEGIN
  v_answer:=jsonb_build_array(
    (ARRAY['red','blue','yellow','green'])[1+floor(random()*4)::integer],
    (ARRAY['red','blue','yellow','green'])[1+floor(random()*4)::integer],
    (ARRAY['red','blue','yellow','green'])[1+floor(random()*4)::integer],
    (ARRAY['red','blue','yellow','green'])[1+floor(random()*4)::integer]
  );
  FOR v_player IN SELECT player_id FROM public.room_players WHERE room_id=p_room AND is_active AND kicked_at IS NULL ORDER BY joined_at,player_id LOOP
    v_color:=v_answer->>(v_i%4);
    v_hints:=v_hints||jsonb_build_object(v_player.player_id::text,jsonb_build_object('position',(v_i%4)+1,'color',v_color));
    v_i:=v_i+1;
  END LOOP;
  UPDATE kizilkuyruk_private.arcade_sessions
  SET secret_state=jsonb_build_object('answer',v_answer,'hints',v_hints,'module',p_module),updated_at=now()
  WHERE room_id=p_room;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_start_secure(p_room_code text,p_expected_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_room public.rooms; v_count integer; v_mode text; v_prompt text; v_state jsonb; v_private jsonb:='{}'::jsonb; v_player record; v_i integer:=0; v_team integer; v_current uuid; v_sequence jsonb;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id=kizilkuyruk_private.arcade_room(p_room_code) FOR UPDATE;
  v_mode:=v_room.game_mode;
  IF v_room.host_id<>auth.uid() THEN RAISE EXCEPTION 'Yalnızca ev sahibi başlatabilir'; END IF;
  IF v_mode IS DISTINCT FROM p_expected_mode THEN RAISE EXCEPTION 'Oyun modu değişmiş'; END IF;
  IF v_room.phase<>'lobby' THEN RAISE EXCEPTION 'Oyun zaten başladı'; END IF;
  SELECT count(*) INTO v_count FROM public.room_players WHERE room_id=v_room.id AND is_active AND kicked_at IS NULL;
  IF v_count<v_room.min_players OR v_count>v_room.max_players THEN RAISE EXCEPTION 'Bu oyun %–% oyuncu ister',v_room.min_players,v_room.max_players; END IF;
  IF EXISTS(SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND is_active AND kicked_at IS NULL AND (NOT is_ready OR NOT is_online)) THEN RAISE EXCEPTION 'Herkes hazır ve çevrim içi olmalı'; END IF;

  DELETE FROM kizilkuyruk_private.arcade_submissions WHERE room_id=v_room.id;
  DELETE FROM kizilkuyruk_private.arcade_sessions WHERE room_id=v_room.id;
  v_state:='{}'::jsonb;
  IF v_mode='critical_signal' THEN
    v_current:=v_room.host_id;
    v_state:=jsonb_build_object('module',1,'modules',3,'strikes',0,'chat','[]'::jsonb,'events','[]'::jsonb);
  ELSIF v_mode='drawing_chain' THEN
    v_prompt:=(ARRAY['Ayda piknik yapan bir tilki','Yağmurdan kaçan bir korsan','Kahve taşıyan bir robot','Denizde yüzen bir ada','Sahneye çıkan utangaç bir kedi','Şemsiyesini kaybeden bir astronot','Dans eden bir deniz feneri','Pasta kurtaran bir köpek'])[1+floor(random()*8)::integer];
    SELECT player_id INTO v_current FROM public.room_players WHERE room_id=v_room.id AND is_active AND kicked_at IS NULL ORDER BY joined_at,player_id LIMIT 1;
    v_state:=jsonb_build_object('chain','[]'::jsonb,'chainStep',0,'totalSteps',v_count*2,'promptLabel','Gizli başlangıç fikri');
    v_private:=jsonb_build_object('currentItem',jsonb_build_object('kind','prompt','text',v_prompt));
  ELSIF v_mode='kitchen_chaos' THEN
    v_state:=jsonb_build_object('beat',1,'beats',8,'score',0,'mistakes',0,'orders',jsonb_build_array(
      jsonb_build_object('name','Korsan Burger','emoji','🍔','status','raw','bornBeat',1),
      jsonb_build_object('name','Mercan Çorbası','emoji','🍲','status','raw','bornBeat',1),
      jsonb_build_object('name','Fırtına Pizzası','emoji','🍕','status','raw','bornBeat',1)
    ),'feed','[]'::jsonb);
  ELSIF v_mode='pirate_cannon' THEN
    FOR v_player IN SELECT player_id FROM public.room_players WHERE room_id=v_room.id AND is_active AND kicked_at IS NULL ORDER BY joined_at,player_id LOOP
      v_team:=v_i%2;
      v_private:=v_private||jsonb_build_object(v_player.player_id::text,jsonb_build_object('team',v_team));
      IF v_i=0 THEN v_current:=v_player.player_id; END IF;
      v_i:=v_i+1;
    END LOOP;
    v_state:=jsonb_build_object('turn',1,'turns',0,'maxTurns',12,'wind',(floor(random()*5)::integer)-2,'teamScores',jsonb_build_array(0,0),'teams',v_private,'lastShot',NULL,'island',jsonb_build_object('x',0.5,'top',0.58));
  END IF;

  INSERT INTO kizilkuyruk_private.arcade_sessions(room_id,mode,phase,step,current_player_id,deadline,public_state,secret_state)
  VALUES(v_room.id,v_mode,CASE WHEN v_mode='drawing_chain' THEN 'draw' WHEN v_mode='pirate_cannon' THEN 'aim' ELSE 'play' END,1,v_current,
    now()+make_interval(secs=>v_room.round_seconds),v_state,v_private);
  IF v_mode='critical_signal' THEN PERFORM kizilkuyruk_private.arcade_new_signal(v_room.id,1); END IF;
  UPDATE public.room_players SET score=0 WHERE room_id=v_room.id AND is_active AND kicked_at IS NULL;
  UPDATE public.rooms SET phase='question',current_round=1,finished_at=NULL,paused_at=NULL,state_version=state_version+1,updated_at=now() WHERE id=v_room.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_state_secure(p_room_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_room uuid; v_session kizilkuyruk_private.arcade_sessions; v_me jsonb:='{}'::jsonb; v_players jsonb; v_can_act boolean:=false; v_submitted boolean:=false;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT * INTO v_session FROM kizilkuyruk_private.arcade_sessions WHERE room_id=v_room;
  IF NOT FOUND THEN RETURN jsonb_build_object('phase','lobby'); END IF;
  IF v_session.mode='critical_signal' THEN
    v_me:=coalesce(v_session.secret_state->'hints'->auth.uid()::text,'{}'::jsonb);
  ELSIF v_session.mode='drawing_chain' AND v_session.current_player_id=auth.uid() THEN
    v_me:=coalesce(v_session.secret_state->'currentItem','{}'::jsonb);
  ELSIF v_session.mode='pirate_cannon' THEN
    v_me:=coalesce(v_session.secret_state->(auth.uid()::text),'{}'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.player_id,'name',p.name,'avatarKey',p.avatar_key,
    'isBot',p.is_bot,'isHost',p.is_host,'submitted',EXISTS(SELECT 1 FROM kizilkuyruk_private.arcade_submissions a WHERE a.room_id=v_room AND a.step=v_session.step AND a.player_id=p.player_id),
    'score',p.score,'team',CASE WHEN v_session.mode='pirate_cannon' THEN (v_session.secret_state->p.player_id::text->>'team')::integer ELSE NULL END
  ) ORDER BY p.joined_at,p.player_id),'[]'::jsonb) INTO v_players
  FROM public.room_players p
  WHERE p.room_id=v_room AND p.is_active AND p.kicked_at IS NULL;
  SELECT EXISTS(SELECT 1 FROM kizilkuyruk_private.arcade_submissions WHERE room_id=v_room AND step=v_session.step AND player_id=auth.uid()) INTO v_submitted;
  v_can_act:=v_session.phase<>'finished' AND v_session.current_player_id=auth.uid() AND NOT v_submitted;
  IF v_session.mode='kitchen_chaos' THEN v_can_act:=v_session.phase='play' AND NOT v_submitted; END IF;
  RETURN jsonb_build_object('mode',v_session.mode,'phase',v_session.phase,'step',v_session.step,
    'stateVersion',(SELECT state_version FROM public.rooms WHERE id=v_room),'deadline',v_session.deadline,
    'currentPlayerId',v_session.current_player_id,'isHost',(SELECT host_id=auth.uid() FROM public.rooms WHERE id=v_room),
    'canAct',v_can_act,'public',v_session.public_state,'me',v_me,'players',v_players,
    'winnerIds',to_jsonb(v_session.winner_ids),'result',v_session.result);
END;
$function$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.arcade_finish(p_room uuid,p_result text,p_winners uuid[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
  UPDATE kizilkuyruk_private.arcade_sessions SET phase='finished',deadline=NULL,result=p_result,winner_ids=coalesce(p_winners,'{}'),updated_at=now() WHERE room_id=p_room;
  UPDATE public.rooms SET phase='game_over',finished_at=now(),phase_deadline_at=NULL,state_version=state_version+1,updated_at=now() WHERE id=p_room;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_action_secure(p_room_code text,p_step integer,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  v_room uuid; v_room_row public.rooms; v_s kizilkuyruk_private.arcade_sessions; v_action text;
  v_expected text; v_player record; v_current uuid; v_next uuid; v_count integer; v_idx integer;
  v_text text; v_answer jsonb; v_hints jsonb; v_sequence jsonb; v_public jsonb; v_private jsonb;
  v_orders jsonb; v_order jsonb; v_action_row record; v_kind text; v_ticket integer; v_score integer; v_mistakes integer; v_beat integer; v_name text; v_emoji text;
  v_team integer; v_scores jsonb; v_angle double precision; v_power double precision; v_x double precision; v_y double precision; v_vx double precision; v_vy double precision; v_target_x double precision; v_target_y double precision; v_wind double precision; v_dt double precision:=0.03; v_hit boolean:=false; v_path jsonb:='[]'::jsonb; v_k integer;
  v_chain jsonb; v_chain_step integer; v_phase text; v_winners uuid[]:='{}';
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT * INTO v_room_row FROM public.rooms WHERE id=v_room FOR UPDATE;
  SELECT * INTO v_s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=v_room FOR UPDATE;
  IF v_s.step<>p_step OR v_s.phase='finished' THEN RAISE EXCEPTION 'Oyun adımı güncel değil'; END IF;
  IF v_s.deadline<=now() THEN RAISE EXCEPTION 'Bu hamlenin süresi doldu'; END IF;
  v_action:=p_payload->>'action';

  IF v_s.mode='critical_signal' THEN
    IF v_action='message' THEN
      v_text:=trim(p_payload->>'text');
      IF length(v_text) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Mesaj 1–160 karakter olmalı'; END IF;
      v_public:=jsonb_set(v_s.public_state,'{chat}',coalesce(v_s.public_state->'chat','[]'::jsonb)||jsonb_build_array(jsonb_build_object('playerId',auth.uid(),'text',v_text,'at',now())));
      UPDATE kizilkuyruk_private.arcade_sessions SET public_state=v_public,updated_at=now() WHERE room_id=v_room;
    ELSIF v_action='guess' THEN
      IF auth.uid()<>v_room_row.host_id THEN RAISE EXCEPTION 'Yalnızca defuser diziyi girebilir'; END IF;
      IF jsonb_typeof(p_payload->'answer')<>'array' OR jsonb_array_length(p_payload->'answer')<>4 THEN RAISE EXCEPTION 'Dört renk seçmelisin'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'answer') AS color(value) WHERE value NOT IN ('red','blue','yellow','green')) THEN RAISE EXCEPTION 'Renk seçimi geçersiz'; END IF;
      v_answer:=v_s.secret_state->'answer';
      IF p_payload->'answer'=v_answer THEN
        v_idx:=(v_s.public_state->>'module')::integer;
        IF v_idx>=3 THEN
          SELECT array_agg(player_id) INTO v_winners FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL;
          PERFORM kizilkuyruk_private.arcade_finish(v_room,'Mürettebat üç sinyal modülünü çözdü.',v_winners);
        ELSE
          UPDATE kizilkuyruk_private.arcade_sessions SET public_state=public_state||jsonb_build_object('module',v_idx+1,'events',coalesce(public_state->'events','[]'::jsonb)||jsonb_build_array(jsonb_build_object('module',v_idx,'status','solved'))),deadline=now()+interval '60 seconds',step=step+1,updated_at=now() WHERE room_id=v_room;
          PERFORM kizilkuyruk_private.arcade_new_signal(v_room,v_idx+1);
        END IF;
      ELSE
        v_mistakes:=(v_s.public_state->>'strikes')::integer+1;
        IF v_mistakes>=3 THEN
          PERFORM kizilkuyruk_private.arcade_finish(v_room,'Üç yanlış girişten sonra gemi sinyali koptu.');
        ELSE
          UPDATE kizilkuyruk_private.arcade_sessions SET public_state=jsonb_set(public_state,'{strikes}',to_jsonb(v_mistakes)),secret_state=secret_state||jsonb_build_object('answer','[]'::jsonb),deadline=now()+interval '60 seconds',step=step+1,updated_at=now() WHERE room_id=v_room;
          PERFORM kizilkuyruk_private.arcade_new_signal(v_room,(v_s.public_state->>'module')::integer);
        END IF;
      END IF;
    ELSE RAISE EXCEPTION 'Bu hamle Kritik Sinyal için geçersiz'; END IF;

  ELSIF v_s.mode='drawing_chain' THEN
    IF auth.uid()<>v_s.current_player_id THEN RAISE EXCEPTION 'Sıra sende değil'; END IF;
    IF v_s.phase='draw' AND v_action='draw' THEN
      IF jsonb_typeof(p_payload->'strokes')<>'array' OR jsonb_array_length(p_payload->'strokes')>80 THEN RAISE EXCEPTION 'Çizim verisi geçersiz'; END IF;
      v_chain:=coalesce(v_s.public_state->'chain','[]'::jsonb)||jsonb_build_array(jsonb_build_object('kind','drawing','playerId',auth.uid(),'strokes',p_payload->'strokes'));
      v_chain_step:=(v_s.public_state->>'chainStep')::integer+1;
      v_count:=(SELECT count(*) FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL);
      IF v_chain_step>=v_count*2 THEN
        SELECT array_agg(player_id) INTO v_winners FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL;
        UPDATE public.room_players SET score=score+1 WHERE room_id=v_room AND is_active AND kicked_at IS NULL;
        UPDATE kizilkuyruk_private.arcade_sessions SET public_state=public_state||jsonb_build_object('chain',v_chain,'chainStep',v_chain_step),secret_state='{}'::jsonb,step=step+1,updated_at=now() WHERE room_id=v_room;
        PERFORM kizilkuyruk_private.arcade_finish(v_room,'Çizgi zinciri tamamlandı. Her oyuncu katılım puanı aldı.',v_winners);
      ELSE
        SELECT player_id INTO v_next FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL AND (joined_at,player_id)>(SELECT joined_at,player_id FROM public.room_players WHERE room_id=v_room AND player_id=v_s.current_player_id) ORDER BY joined_at,player_id LIMIT 1;
        IF v_next IS NULL THEN SELECT player_id INTO v_next FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL ORDER BY joined_at,player_id LIMIT 1; END IF;
        UPDATE kizilkuyruk_private.arcade_sessions SET phase='guess',current_player_id=v_next,public_state=public_state||jsonb_build_object('chain',v_chain,'chainStep',v_chain_step),secret_state=jsonb_build_object('currentItem',jsonb_build_object('kind','drawing','strokes',p_payload->'strokes')),step=step+1,deadline=now()+interval '45 seconds',updated_at=now() WHERE room_id=v_room;
      END IF;
    ELSIF v_s.phase='guess' AND v_action='guess' THEN
      v_text:=trim(p_payload->>'text');
      IF length(v_text) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Tahmin 2–80 karakter olmalı'; END IF;
      v_chain:=coalesce(v_s.public_state->'chain','[]'::jsonb)||jsonb_build_array(jsonb_build_object('kind','caption','playerId',auth.uid(),'text',v_text));
      v_chain_step:=(v_s.public_state->>'chainStep')::integer+1;
      v_count:=(SELECT count(*) FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL);
      IF v_chain_step>=v_count*2 THEN
        SELECT array_agg(player_id) INTO v_winners FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL;
        UPDATE public.room_players SET score=score+1 WHERE room_id=v_room AND is_active AND kicked_at IS NULL;
        UPDATE kizilkuyruk_private.arcade_sessions SET public_state=public_state||jsonb_build_object('chain',v_chain,'chainStep',v_chain_step),secret_state='{}'::jsonb,step=step+1,updated_at=now() WHERE room_id=v_room;
        PERFORM kizilkuyruk_private.arcade_finish(v_room,'Çizgi zinciri tamamlandı. Her oyuncu katılım puanı aldı.',v_winners);
      ELSE
        SELECT player_id INTO v_next FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL AND (joined_at,player_id)>(SELECT joined_at,player_id FROM public.room_players WHERE room_id=v_room AND player_id=v_s.current_player_id) ORDER BY joined_at,player_id LIMIT 1;
        IF v_next IS NULL THEN SELECT player_id INTO v_next FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL ORDER BY joined_at,player_id LIMIT 1; END IF;
        v_phase:=CASE WHEN v_chain_step%2=0 THEN 'draw' ELSE 'guess' END;
        IF v_phase='draw' THEN v_private:=jsonb_build_object('currentItem',jsonb_build_object('kind','prompt','text',v_text));
        ELSE v_private:=jsonb_build_object('currentItem',jsonb_build_object('kind','drawing','strokes',(v_chain->(jsonb_array_length(v_chain)-1))->'strokes')); END IF;
        UPDATE kizilkuyruk_private.arcade_sessions SET phase=v_phase,current_player_id=v_next,public_state=public_state||jsonb_build_object('chain',v_chain,'chainStep',v_chain_step),secret_state=v_private,step=step+1,deadline=now()+interval '45 seconds',updated_at=now() WHERE room_id=v_room;
      END IF;
    ELSE RAISE EXCEPTION 'Bu hamle çizim sırasıyla uyuşmuyor'; END IF;

  ELSIF v_s.mode='kitchen_chaos' THEN
    IF v_s.phase<>'play' OR v_action NOT IN ('chop','cook','plate','serve','pass') THEN RAISE EXCEPTION 'Mutfak hamlesi geçersiz'; END IF;
    v_ticket:=coalesce((p_payload->>'ticket')::integer,-1);
    IF v_action<>'pass' AND v_ticket NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'Sipariş seçimi geçersiz'; END IF;
    INSERT INTO kizilkuyruk_private.arcade_submissions(room_id,step,player_id,payload) VALUES(v_room,p_step,auth.uid(),p_payload) ON CONFLICT(room_id,step,player_id) DO NOTHING;
    SELECT count(*) INTO v_count FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL;
    IF (SELECT count(*) FROM kizilkuyruk_private.arcade_submissions WHERE room_id=v_room AND step=p_step)<v_count THEN
      UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=v_room;
      RETURN;
    END IF;
    v_orders:=v_s.public_state->'orders'; v_score:=(v_s.public_state->>'score')::integer; v_mistakes:=(v_s.public_state->>'mistakes')::integer; v_beat:=(v_s.public_state->>'beat')::integer;
    FOR v_action_row IN SELECT a.payload,rp.name FROM kizilkuyruk_private.arcade_submissions a JOIN public.room_players rp ON rp.room_id=a.room_id AND rp.player_id=a.player_id WHERE a.room_id=v_room AND a.step=p_step ORDER BY rp.joined_at,rp.player_id LOOP
      v_kind:=v_action_row.payload->>'action';
      IF v_kind='pass' THEN CONTINUE; END IF;
      v_ticket:=coalesce((v_action_row.payload->>'ticket')::integer,-1);
      v_order:=v_orders->v_ticket;
      IF v_order IS NULL THEN v_mistakes:=v_mistakes+1; CONTINUE; END IF;
      v_expected:=CASE v_order->>'status' WHEN 'raw' THEN 'chop' WHEN 'chopped' THEN 'cook' WHEN 'cooked' THEN 'plate' WHEN 'plated' THEN 'serve' ELSE '' END;
      IF v_kind=v_expected THEN
        IF v_kind='serve' THEN
          v_score:=v_score+3;
          v_name:=v_order->>'name'; v_emoji:=v_order->>'emoji';
          v_orders:=jsonb_set(v_orders,ARRAY[v_ticket::text],jsonb_build_object('name',v_name,'emoji',v_emoji,'status','raw','bornBeat',v_beat+1));
        ELSE
          v_orders:=jsonb_set(v_orders,ARRAY[v_ticket::text],v_order||jsonb_build_object('status',CASE v_kind WHEN 'chop' THEN 'chopped' WHEN 'cook' THEN 'cooked' WHEN 'plate' THEN 'plated' ELSE v_order->>'status' END));
        END IF;
      ELSE v_mistakes:=v_mistakes+1; END IF;
    END LOOP;
    FOR v_idx IN 0..2 LOOP
      v_order:=v_orders->v_idx;
      IF (v_beat-(v_order->>'bornBeat')::integer)>=3 AND v_order->>'status'<>'raw' THEN
        v_mistakes:=v_mistakes+1;
        v_orders:=jsonb_set(v_orders,ARRAY[v_idx::text],jsonb_build_object('name',v_order->>'name','emoji',v_order->>'emoji','status','raw','bornBeat',v_beat+1));
      END IF;
    END LOOP;
    v_beat:=v_beat+1;
    UPDATE kizilkuyruk_private.arcade_sessions SET public_state=public_state||jsonb_build_object('orders',v_orders,'score',v_score,'mistakes',v_mistakes,'beat',v_beat,'feed',coalesce(public_state->'feed','[]'::jsonb)||jsonb_build_array(jsonb_build_object('beat',v_beat-1,'teamScore',v_score))),step=step+1,deadline=now()+interval '30 seconds',updated_at=now() WHERE room_id=v_room;
    UPDATE public.rooms SET current_round=v_beat,state_version=state_version+1,updated_at=now() WHERE id=v_room;
    IF v_beat>8 THEN
      IF v_score>=9 THEN SELECT array_agg(player_id) INTO v_winners FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL; END IF;
      UPDATE public.room_players SET score=v_score WHERE room_id=v_room AND is_active AND kicked_at IS NULL;
      PERFORM kizilkuyruk_private.arcade_finish(v_room,format('Takım %s siparişi yetiştirdi; %s servis puanı aldı.',v_score,v_score),v_winners);
    END IF;

  ELSIF v_s.mode='pirate_cannon' THEN
    IF v_action NOT IN ('fire','auto_fire') OR (v_action='fire' AND auth.uid()<>v_s.current_player_id) OR (v_action='auto_fire' AND auth.uid()<>v_room_row.host_id) THEN RAISE EXCEPTION 'Sıra sende değil'; END IF;
    v_team:=(v_s.secret_state->(CASE WHEN v_action='auto_fire' THEN v_s.current_player_id::text ELSE auth.uid()::text END)->>'team')::integer;
    v_angle:=greatest(15,least(75,coalesce((p_payload->>'angle')::double precision,45)));
    v_power:=greatest(30,least(100,coalesce((p_payload->>'power')::double precision,60)));
    v_wind:=(v_s.public_state->>'wind')::double precision;
    v_x:=CASE WHEN v_team=0 THEN 110 ELSE 890 END;
    v_y:=420;
    v_target_x:=CASE WHEN v_team=0 THEN 850 ELSE 150 END;
    v_target_y:=400;
    v_vx:=CASE WHEN v_team=0 THEN 1 ELSE -1 END * v_power*3*cos(radians(v_angle));
    v_vy:=-v_power*3*sin(radians(v_angle));
    FOR v_k IN 1..240 LOOP
      v_x:=v_x+v_vx*v_dt; v_y:=v_y+v_vy*v_dt; v_vy:=v_vy+22*v_dt; v_vx:=v_vx+v_wind*0.5*v_dt;
      v_path:=v_path||jsonb_build_array(jsonb_build_object('x',round((v_x/1000)::numeric,4),'y',round((v_y/560)::numeric,4)));
      IF v_x BETWEEN 460 AND 560 AND v_y>320 THEN EXIT; END IF;
      IF abs(v_x-v_target_x)<42 AND abs(v_y-v_target_y)<42 THEN v_hit:=true; EXIT; END IF;
      IF v_y>=440 OR v_x<0 OR v_x>1000 THEN EXIT; END IF;
    END LOOP;
    v_scores:=v_s.public_state->'teamScores';
    IF v_hit THEN v_scores:=jsonb_set(v_scores,ARRAY[v_team::text],to_jsonb((v_scores->>v_team)::integer+1)); END IF;
    v_idx:=(v_s.public_state->>'turns')::integer+1;
    SELECT player_id INTO v_next FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL AND (joined_at,player_id)>(SELECT joined_at,player_id FROM public.room_players WHERE room_id=v_room AND player_id=v_s.current_player_id) ORDER BY joined_at,player_id LIMIT 1;
    IF v_next IS NULL THEN SELECT player_id INTO v_next FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL ORDER BY joined_at,player_id LIMIT 1; END IF;
    UPDATE kizilkuyruk_private.arcade_sessions SET public_state=public_state||jsonb_build_object('teamScores',v_scores,'turns',v_idx,'wind',(floor(random()*7)::integer)-3,'lastShot',jsonb_build_object('playerId',CASE WHEN v_action='auto_fire' THEN v_s.current_player_id ELSE auth.uid() END,'team',v_team,'angle',v_angle,'power',v_power,'hit',v_hit,'path',v_path)),step=step+1,current_player_id=v_next,deadline=now()+interval '30 seconds',updated_at=now() WHERE room_id=v_room;
    UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=v_room;
    IF (v_scores->>v_team)::integer>=3 OR v_idx>=12 THEN
      IF (v_scores->>0)::integer=(v_scores->>1)::integer THEN v_winners:='{}';
      ELSE SELECT array_agg(player_id) INTO v_winners FROM public.room_players WHERE room_id=v_room AND is_active AND kicked_at IS NULL AND (v_s.secret_state->(player_id::text)->>'team')::integer=CASE WHEN (v_scores->>0)::integer>(v_scores->>1)::integer THEN 0 ELSE 1 END; END IF;
      UPDATE public.room_players SET score=coalesce((v_scores->>(v_s.secret_state->(player_id::text)->>'team'))::integer,0) WHERE room_id=v_room AND is_active AND kicked_at IS NULL;
      PERFORM kizilkuyruk_private.arcade_finish(v_room,format('Topçu maçı bitti. Takım skorları: %s – %s.',v_scores->>0,v_scores->>1),v_winners);
    END IF;
  END IF;
  UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=v_room;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_advance_secure(p_room_code text,p_step integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_room uuid; v_s kizilkuyruk_private.arcade_sessions; v_count integer; v_player uuid; v_next uuid; v_answer jsonb; v_module integer;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT * INTO v_s FROM kizilkuyruk_private.arcade_sessions WHERE room_id=v_room FOR UPDATE;
  IF v_s.step<>p_step OR v_s.phase='finished' OR v_s.deadline>now() THEN RETURN; END IF;
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

REVOKE ALL ON FUNCTION public.arcade_start_secure(text,text),public.arcade_state_secure(text),public.arcade_action_secure(text,integer,jsonb),public.arcade_advance_secure(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.arcade_start_secure(text,text),public.arcade_state_secure(text),public.arcade_action_secure(text,integer,jsonb),public.arcade_advance_secure(text,integer) TO authenticated;
REVOKE ALL ON FUNCTION kizilkuyruk_private.arcade_room(text),kizilkuyruk_private.arcade_new_signal(uuid,integer),kizilkuyruk_private.arcade_finish(uuid,text,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION kizilkuyruk_private.arcade_room(text),kizilkuyruk_private.arcade_new_signal(uuid,integer),kizilkuyruk_private.arcade_finish(uuid,text,uuid[]) TO service_role;
