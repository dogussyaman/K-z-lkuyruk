-- Replace the drawing chain with alternating fox-team drawing and guessing turns.

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
    WHEN 'drawing_chain' THEN v_min_players := 4; v_max_players := 8; v_round_seconds := 120;
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

ALTER TABLE kizilkuyruk_private.arcade_sessions DROP CONSTRAINT IF EXISTS arcade_sessions_phase_check;
ALTER TABLE kizilkuyruk_private.arcade_sessions ADD CONSTRAINT arcade_sessions_phase_check
  CHECK (phase IN ('lobby','teams','play','draw','guess','aim','finished'));

ALTER FUNCTION public.arcade_start_secure(text,text) RENAME TO arcade_start_legacy_secure;
ALTER FUNCTION public.arcade_state_secure(text) RENAME TO arcade_state_legacy_secure;
ALTER FUNCTION public.arcade_action_secure(text,integer,jsonb) RENAME TO arcade_action_legacy_secure;
ALTER FUNCTION public.arcade_advance_secure(text,integer) RENAME TO arcade_advance_legacy_secure;

CREATE OR REPLACE FUNCTION public.arcade_drawing_start_secure(p_room_code text,p_expected_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  v_room public.rooms;
  v_count integer;
  v_player record;
  v_team integer;
  v_index integer:=0;
  v_team_a uuid[]:=ARRAY[]::uuid[];
  v_team_b uuid[]:=ARRAY[]::uuid[];
  v_order jsonb:='[]'::jsonb;
  v_secret jsonb:=jsonb_build_object('teams','{}'::jsonb);
  v_public jsonb;
  v_max_team_size integer;
  v_current uuid;
  v_prompt text;
  v_prompts text[]:=ARRAY[
    'Ayda piknik yapan bir tilki','Yağmurdan kaçan bir korsan','Kahve taşıyan bir robot',
    'Denizde yüzen bir ada','Sahneye çıkan utangaç bir kedi','Şemsiyesini kaybeden bir astronot',
    'Dans eden bir deniz feneri','Pasta kurtaran bir köpek'
  ];
BEGIN
  SELECT * INTO v_room FROM public.rooms
  WHERE id=kizilkuyruk_private.arcade_room(p_room_code) FOR UPDATE;
  IF v_room.host_id<>auth.uid() THEN RAISE EXCEPTION 'Yalnızca ev sahibi başlatabilir'; END IF;
  IF v_room.game_mode IS DISTINCT FROM p_expected_mode OR p_expected_mode<>'drawing_chain' THEN RAISE EXCEPTION 'Oyun modu değişmiş'; END IF;
  IF v_room.phase<>'lobby' THEN RAISE EXCEPTION 'Oyun zaten başladı'; END IF;
  SELECT count(*) INTO v_count FROM public.room_players WHERE room_id=v_room.id AND is_active AND kicked_at IS NULL;
  IF v_count<4 OR v_count>8 THEN RAISE EXCEPTION 'Tilki takımlı çizim oyunu 4–8 oyuncu ister'; END IF;
  IF EXISTS(SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND is_active AND kicked_at IS NULL AND (NOT is_ready OR NOT is_online)) THEN
    RAISE EXCEPTION 'Herkes hazır ve çevrim içi olmalı';
  END IF;

  DELETE FROM kizilkuyruk_private.arcade_submissions WHERE room_id=v_room.id;
  DELETE FROM kizilkuyruk_private.arcade_sessions WHERE room_id=v_room.id;
  FOR v_player IN
    SELECT player_id FROM public.room_players
    WHERE room_id=v_room.id AND is_active AND kicked_at IS NULL ORDER BY random(),player_id
  LOOP
    v_team:=v_index%2;
    v_secret:=jsonb_set(v_secret,ARRAY['teams',v_player.player_id::text],to_jsonb(v_team),true);
    IF v_team=0 THEN v_team_a:=array_append(v_team_a,v_player.player_id);
    ELSE v_team_b:=array_append(v_team_b,v_player.player_id); END IF;
    v_index:=v_index+1;
  END LOOP;

  v_max_team_size:=greatest(cardinality(v_team_a),cardinality(v_team_b));
  FOR v_index IN 1..v_max_team_size LOOP
    IF v_index<=cardinality(v_team_a) THEN v_order:=v_order||jsonb_build_array(v_team_a[v_index]); END IF;
    IF v_index<=cardinality(v_team_b) THEN v_order:=v_order||jsonb_build_array(v_team_b[v_index]); END IF;
  END LOOP;
  v_current:=(v_order->>0)::uuid;
  v_prompt:=v_prompts[1+floor(random()*cardinality(v_prompts))::integer];
  v_secret:=v_secret||jsonb_build_object(
    'teamPlayers',jsonb_build_object('0',to_jsonb(v_team_a),'1',to_jsonb(v_team_b)),
    'roundOrder',v_order,'roundIndex',0,'prompt',v_prompt
  );
  v_public:=jsonb_build_object(
    'teamScores',jsonb_build_array(0,0),'turnIndex',0,
    'turnTotal',jsonb_array_length(v_order),'currentDrawing',NULL,'rounds','[]'::jsonb
  );
  INSERT INTO kizilkuyruk_private.arcade_sessions(
    room_id,mode,phase,step,current_player_id,deadline,public_state,secret_state
  ) VALUES(v_room.id,'drawing_chain','teams',1,v_current,now()+interval '6 seconds',v_public,v_secret);
  UPDATE public.room_players SET score=0 WHERE room_id=v_room.id AND is_active AND kicked_at IS NULL;
  UPDATE public.rooms SET phase='question',current_round=1,round_seconds=120,finished_at=NULL,paused_at=NULL,
    state_version=state_version+1,updated_at=now() WHERE id=v_room.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_drawing_state_secure(p_room_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  v_room uuid;
  v_session kizilkuyruk_private.arcade_sessions;
  v_me jsonb:='{}'::jsonb;
  v_players jsonb;
  v_team integer;
  v_can_act boolean:=false;
  v_submitted boolean:=false;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT * INTO v_session FROM kizilkuyruk_private.arcade_sessions WHERE room_id=v_room;
  IF NOT FOUND OR v_session.mode<>'drawing_chain' THEN RAISE EXCEPTION 'Takımlı çizim oyunu bulunamadı'; END IF;
  v_team:=(v_session.secret_state->'teams'->>auth.uid()::text)::integer;
  IF v_session.phase='draw' AND v_session.current_player_id=auth.uid() THEN
    v_me:=jsonb_build_object('team',v_team,'prompt',v_session.secret_state->>'prompt');
  ELSE
    v_me:=jsonb_build_object('team',v_team);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.player_id,'name',p.name,'avatarKey',p.avatar_key,'isBot',p.is_bot,'isHost',p.is_host,
    'submitted',EXISTS(
      SELECT 1 FROM kizilkuyruk_private.arcade_submissions a
      WHERE a.room_id=v_room AND a.step=v_session.step AND a.player_id=p.player_id
    ),
    'score',p.score,'team',(v_session.secret_state->'teams'->>p.player_id::text)::integer
  ) ORDER BY p.joined_at,p.player_id),'[]'::jsonb)
  INTO v_players
  FROM public.room_players p
  WHERE p.room_id=v_room AND p.is_active AND p.kicked_at IS NULL;

  SELECT EXISTS(
    SELECT 1 FROM kizilkuyruk_private.arcade_submissions
    WHERE room_id=v_room AND step=v_session.step AND player_id=auth.uid()
  ) INTO v_submitted;
  IF v_session.phase='draw' THEN
    v_can_act:=v_session.current_player_id=auth.uid();
  ELSIF v_session.phase='guess' THEN
    v_can_act:=v_team=(v_session.secret_state->'teams'->>v_session.current_player_id::text)::integer
      AND auth.uid()<>v_session.current_player_id AND NOT v_submitted;
  END IF;
  RETURN jsonb_build_object(
    'mode',v_session.mode,'phase',v_session.phase,'step',v_session.step,
    'stateVersion',(SELECT state_version FROM public.rooms WHERE id=v_room),
    'deadline',v_session.deadline,'currentPlayerId',v_session.current_player_id,
    'isHost',(SELECT host_id=auth.uid() FROM public.rooms WHERE id=v_room),
    'canAct',v_can_act,'public',v_session.public_state,'me',v_me,'players',v_players,
    'winnerIds',to_jsonb(v_session.winner_ids),'result',v_session.result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION kizilkuyruk_private.arcade_drawing_close_round(p_room uuid,p_step integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  v_session kizilkuyruk_private.arcade_sessions;
  v_team integer;
  v_prompt text;
  v_guesses jsonb;
  v_correct_players uuid[];
  v_team_score integer;
  v_rounds jsonb;
  v_index integer;
  v_next uuid;
  v_order jsonb;
  v_winners uuid[];
  v_prompt_pool text[]:=ARRAY[
    'Ayda piknik yapan bir tilki','Yağmurdan kaçan bir korsan','Kahve taşıyan bir robot',
    'Denizde yüzen bir ada','Sahneye çıkan utangaç bir kedi','Şemsiyesini kaybeden bir astronot',
    'Dans eden bir deniz feneri','Pasta kurtaran bir köpek'
  ];
BEGIN
  SELECT * INTO v_session FROM kizilkuyruk_private.arcade_sessions WHERE room_id=p_room FOR UPDATE;
  IF v_session.step<>p_step OR v_session.phase<>'guess' THEN RETURN; END IF;
  v_team:=(v_session.secret_state->'teams'->>v_session.current_player_id::text)::integer;
  v_prompt:=v_session.secret_state->>'prompt';
  SELECT coalesce(array_agg(player_id),ARRAY[]::uuid[]) INTO v_correct_players
  FROM kizilkuyruk_private.arcade_submissions
  WHERE room_id=p_room AND step=p_step AND payload->>'correct'='true';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'playerId',player_id,'text',payload->>'text','correct',(payload->>'correct')='true'
  ) ORDER BY created_at),'[]'::jsonb) INTO v_guesses
  FROM kizilkuyruk_private.arcade_submissions WHERE room_id=p_room AND step=p_step;
  v_team_score:=(v_session.public_state->'teamScores'->>v_team)::integer;
  IF cardinality(v_correct_players)>0 THEN
    v_team_score:=v_team_score+1;
    UPDATE public.room_players SET score=score+1
    WHERE room_id=p_room AND player_id=ANY(v_correct_players) AND is_active AND kicked_at IS NULL;
  END IF;
  v_rounds:=coalesce(v_session.public_state->'rounds','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
    'drawerId',v_session.current_player_id,'team',v_team,'prompt',v_prompt,
    'strokes',coalesce(v_session.public_state->'currentDrawing'->'strokes','[]'::jsonb),
    'guesses',v_guesses,'solved',cardinality(v_correct_players)>0
  ));
  v_index:=(v_session.secret_state->>'roundIndex')::integer+1;
  v_order:=v_session.secret_state->'roundOrder';

  IF v_index>=jsonb_array_length(v_order) THEN
    IF (v_session.public_state->'teamScores'->>0)::integer>(v_session.public_state->'teamScores'->>1)::integer THEN
      SELECT coalesce(array_agg(player_id),ARRAY[]::uuid[]) INTO v_winners FROM public.room_players
      WHERE room_id=p_room AND is_active AND kicked_at IS NULL
        AND (v_session.secret_state->'teams'->>player_id::text)::integer=0;
    ELSIF (v_session.public_state->'teamScores'->>1)::integer>(v_session.public_state->'teamScores'->>0)::integer THEN
      SELECT coalesce(array_agg(player_id),ARRAY[]::uuid[]) INTO v_winners FROM public.room_players
      WHERE room_id=p_room AND is_active AND kicked_at IS NULL
        AND (v_session.secret_state->'teams'->>player_id::text)::integer=1;
    ELSE v_winners:=ARRAY[]::uuid[]; END IF;
    UPDATE kizilkuyruk_private.arcade_sessions SET
      public_state=public_state||jsonb_build_object(
        'teamScores',jsonb_set(public_state->'teamScores',ARRAY[v_team::text],to_jsonb(v_team_score)),
        'rounds',v_rounds,'turnIndex',v_index,'currentDrawing',NULL
      ),
      step=step+1,updated_at=now() WHERE room_id=p_room;
    PERFORM kizilkuyruk_private.arcade_finish(
      p_room,
      format('Tilki çizim maçı bitti. Kızıl takım %s – Mavi takım %s.',
        CASE WHEN v_team=0 THEN v_team_score ELSE (v_session.public_state->'teamScores'->>0)::integer END,
        CASE WHEN v_team=1 THEN v_team_score ELSE (v_session.public_state->'teamScores'->>1)::integer END
      ),
      v_winners
    );
    RETURN;
  END IF;

  v_next:=(v_order->>v_index)::uuid;
  UPDATE kizilkuyruk_private.arcade_sessions SET
    phase='draw',step=step+1,current_player_id=v_next,deadline=now()+interval '120 seconds',
    public_state=public_state||jsonb_build_object(
      'teamScores',jsonb_set(public_state->'teamScores',ARRAY[v_team::text],to_jsonb(v_team_score)),
      'rounds',v_rounds,'turnIndex',v_index,'currentDrawing',NULL
    ),
    secret_state=jsonb_set(
      jsonb_set(secret_state,'{roundIndex}',to_jsonb(v_index)),
      '{prompt}',to_jsonb(v_prompt_pool[1+floor(random()*cardinality(v_prompt_pool))::integer])
    ),
    updated_at=now() WHERE room_id=p_room;
  UPDATE public.rooms SET current_round=v_index+1,state_version=state_version+1,updated_at=now() WHERE id=p_room;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_drawing_action_secure(p_room_code text,p_step integer,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  v_room uuid;
  v_room_row public.rooms;
  v_session kizilkuyruk_private.arcade_sessions;
  v_team integer;
  v_prompt text;
  v_text text;
  v_expected integer;
  v_submitted integer;
  v_correct boolean;
  v_points integer;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT * INTO v_room_row FROM public.rooms WHERE id=v_room FOR UPDATE;
  SELECT * INTO v_session FROM kizilkuyruk_private.arcade_sessions WHERE room_id=v_room FOR UPDATE;
  IF v_session.mode<>'drawing_chain' OR v_session.step<>p_step OR v_session.phase='finished' THEN RAISE EXCEPTION 'Oyun adımı güncel değil'; END IF;
  IF v_session.deadline<=now() THEN RAISE EXCEPTION 'Bu turun süresi doldu'; END IF;
  v_team:=(v_session.secret_state->'teams'->>auth.uid()::text)::integer;

  IF v_session.phase='draw' AND p_payload->>'action'='draw' THEN
    IF auth.uid()<>v_session.current_player_id THEN RAISE EXCEPTION 'Bu turda çizim sırası sende değil'; END IF;
    IF jsonb_typeof(p_payload->'strokes')<>'array'
      OR jsonb_array_length(p_payload->'strokes')>80
      OR length((p_payload->'strokes')::text)>65536 THEN RAISE EXCEPTION 'Çizim verisi geçersiz'; END IF;
    SELECT coalesce(sum(jsonb_array_length(value)),0) INTO v_points
    FROM jsonb_array_elements(p_payload->'strokes');
    IF v_points>2500 THEN RAISE EXCEPTION 'Çizimde çok fazla nokta var'; END IF;
    UPDATE kizilkuyruk_private.arcade_sessions SET
      phase='guess',step=step+1,deadline=now()+interval '60 seconds',
      public_state=public_state||jsonb_build_object(
        'currentDrawing',jsonb_build_object('playerId',auth.uid(),'team',v_team,'strokes',p_payload->'strokes')
      ),updated_at=now() WHERE room_id=v_room;
    UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=v_room;
  ELSIF v_session.phase='guess' AND p_payload->>'action'='guess' THEN
    IF auth.uid()=v_session.current_player_id
      OR v_team<>(v_session.secret_state->'teams'->>v_session.current_player_id::text)::integer THEN
      RAISE EXCEPTION 'Yalnızca çizen oyuncunun takım arkadaşları tahmin edebilir';
    END IF;
    v_text:=trim(p_payload->>'text');
    IF length(v_text) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Tahmin 1–80 karakter olmalı'; END IF;
    v_prompt:=v_session.secret_state->>'prompt';
    v_correct:=lower(v_text)=lower(v_prompt);
    INSERT INTO kizilkuyruk_private.arcade_submissions(room_id,step,player_id,payload)
    VALUES(v_room,p_step,auth.uid(),jsonb_build_object('action','guess','text',v_text,'correct',v_correct));
    v_expected:=jsonb_array_length(v_session.secret_state->'teamPlayers'->v_team::text)-1;
    SELECT count(*) INTO v_submitted FROM kizilkuyruk_private.arcade_submissions
    WHERE room_id=v_room AND step=p_step;
    UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=v_room;
    IF v_submitted>=v_expected THEN PERFORM kizilkuyruk_private.arcade_drawing_close_round(v_room,p_step); END IF;
  ELSE
    RAISE EXCEPTION 'Hamle çizim turuyla uyuşmuyor';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_drawing_advance_secure(p_room_code text,p_step integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE
  v_room uuid;
  v_session kizilkuyruk_private.arcade_sessions;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT * INTO v_session FROM kizilkuyruk_private.arcade_sessions WHERE room_id=v_room FOR UPDATE;
  IF v_session.mode<>'drawing_chain' OR v_session.step<>p_step OR v_session.phase='finished' OR v_session.deadline>now() THEN RETURN; END IF;
  IF (SELECT host_id FROM public.rooms WHERE id=v_room)<>auth.uid() THEN RAISE EXCEPTION 'Yalnızca ev sahibi süre aşımını çözebilir'; END IF;
  IF v_session.phase='teams' THEN
    UPDATE kizilkuyruk_private.arcade_sessions SET
      phase='draw',step=step+1,deadline=now()+interval '120 seconds',updated_at=now()
    WHERE room_id=v_room;
  ELSIF v_session.phase='draw' THEN
    UPDATE kizilkuyruk_private.arcade_sessions SET
      phase='guess',step=step+1,deadline=now()+interval '60 seconds',
      public_state=public_state||jsonb_build_object(
        'currentDrawing',jsonb_build_object('playerId',current_player_id,'team',(secret_state->'teams'->>current_player_id::text)::integer,'strokes','[]'::jsonb)
      ),updated_at=now() WHERE room_id=v_room;
  ELSIF v_session.phase='guess' THEN
    PERFORM kizilkuyruk_private.arcade_drawing_close_round(v_room,p_step);
  END IF;
  UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=v_room;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_start_secure(p_room_code text,p_expected_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_room uuid; v_mode text;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT game_mode INTO v_mode FROM public.rooms WHERE id=v_room;
  IF v_mode='drawing_chain' THEN
    PERFORM public.arcade_drawing_start_secure(p_room_code,p_expected_mode);
  ELSE
    PERFORM public.arcade_start_legacy_secure(p_room_code,p_expected_mode);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_state_secure(p_room_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_room uuid; v_mode text;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT game_mode INTO v_mode FROM public.rooms WHERE id=v_room;
  IF v_mode='drawing_chain' THEN RETURN public.arcade_drawing_state_secure(p_room_code); END IF;
  RETURN public.arcade_state_legacy_secure(p_room_code);
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_action_secure(p_room_code text,p_step integer,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_room uuid; v_mode text;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT game_mode INTO v_mode FROM public.rooms WHERE id=v_room;
  IF v_mode='drawing_chain' THEN
    PERFORM public.arcade_drawing_action_secure(p_room_code,p_step,p_payload);
  ELSE
    PERFORM public.arcade_action_legacy_secure(p_room_code,p_step,p_payload);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.arcade_advance_secure(p_room_code text,p_step integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_room uuid; v_mode text;
BEGIN
  v_room:=kizilkuyruk_private.arcade_room(p_room_code);
  SELECT game_mode INTO v_mode FROM public.rooms WHERE id=v_room;
  IF v_mode='drawing_chain' THEN
    PERFORM public.arcade_drawing_advance_secure(p_room_code,p_step);
  ELSE
    PERFORM public.arcade_advance_legacy_secure(p_room_code,p_step);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.arcade_drawing_start_secure(text,text),
  public.arcade_drawing_state_secure(text),public.arcade_drawing_action_secure(text,integer,jsonb),
  public.arcade_drawing_advance_secure(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.arcade_drawing_start_secure(text,text),
  public.arcade_drawing_state_secure(text),public.arcade_drawing_action_secure(text,integer,jsonb),
  public.arcade_drawing_advance_secure(text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.arcade_start_secure(text,text),public.arcade_state_secure(text),
  public.arcade_action_secure(text,integer,jsonb),public.arcade_advance_secure(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.arcade_start_secure(text,text),public.arcade_state_secure(text),
  public.arcade_action_secure(text,integer,jsonb),public.arcade_advance_secure(text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.arcade_start_legacy_secure(text,text),public.arcade_state_legacy_secure(text),
  public.arcade_action_legacy_secure(text,integer,jsonb),public.arcade_advance_legacy_secure(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION kizilkuyruk_private.arcade_drawing_close_round(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION kizilkuyruk_private.arcade_drawing_close_round(uuid,integer) TO service_role;
