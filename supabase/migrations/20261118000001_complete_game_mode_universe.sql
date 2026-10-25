-- Kızılkuyruk complete game-mode universe.
-- Intentionally runs after the Team Battle foundation so older migrations cannot
-- narrow rooms.game_mode back to a smaller set.

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_game_mode_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_game_mode_check
CHECK (game_mode IN (
  'classic','survival','suspicious','blitz','team_battle',
  'secret_missions','double_trap','golden_question','detective_fox'
));

ALTER TABLE public.round_results ADD COLUMN IF NOT EXISTS mission_bonus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.round_results ADD COLUMN IF NOT EXISTS golden_multiplier INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.round_results ADD COLUMN IF NOT EXISTS detective_bonus INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.round_suspect_picks (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  player_id UUID NOT NULL,
  suspect_player_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, round_number, player_id)
);
ALTER TABLE public.round_suspect_picks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.round_suspect_picks FROM anon;
GRANT SELECT, INSERT ON TABLE public.round_suspect_picks TO authenticated;
DROP POLICY IF EXISTS round_suspect_picks_member_read ON public.round_suspect_picks;
CREATE POLICY round_suspect_picks_member_read ON public.round_suspect_picks
FOR SELECT TO authenticated USING (public.is_room_member(room_id));
DROP POLICY IF EXISTS round_suspect_picks_owner_insert ON public.round_suspect_picks;
CREATE POLICY round_suspect_picks_owner_insert ON public.round_suspect_picks
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = player_id AND public.is_room_member(room_id));

CREATE OR REPLACE FUNCTION public.create_room_with_mode_secure(
  p_code CHARACTER VARYING,
  p_name CHARACTER VARYING,
  p_avatar_key CHARACTER VARYING,
  p_total_rounds INTEGER,
  p_round_seconds INTEGER,
  p_categories TEXT[],
  p_is_private BOOLEAN,
  p_password TEXT,
  p_game_mode TEXT
)
RETURNS TABLE(room_id UUID, room_code CHARACTER VARYING, host_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_room_id UUID; v_room_code CHARACTER VARYING; v_host_id UUID;
  v_min_players INTEGER := 2; v_max_players INTEGER := 10;
  v_round_seconds INTEGER := p_round_seconds;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  IF p_game_mode IS NULL OR p_game_mode NOT IN (
    'classic','survival','suspicious','blitz','team_battle',
    'secret_missions','double_trap','golden_question','detective_fox'
  ) THEN RAISE EXCEPTION 'Desteklenmeyen oyun modu'; END IF;

  CASE p_game_mode
    WHEN 'team_battle' THEN v_min_players := 4;
    WHEN 'secret_missions' THEN v_min_players := 3; v_max_players := 8;
    WHEN 'double_trap' THEN v_max_players := 6;
    WHEN 'detective_fox' THEN v_min_players := 4;
    WHEN 'blitz' THEN v_round_seconds := 7;
    ELSE NULL;
  END CASE;

  SELECT created.room_id, created.room_code, created.host_id
  INTO v_room_id, v_room_code, v_host_id
  FROM public.create_room_secure(
    p_code,p_name,p_avatar_key,p_total_rounds,v_round_seconds,
    p_categories,p_is_private,p_password
  ) AS created;

  UPDATE public.rooms
  SET game_mode = p_game_mode,
      min_players = v_min_players,
      max_players = v_max_players,
      round_seconds = v_round_seconds,
      survival_finished = FALSE,
      updated_at = now()
  WHERE id = v_room_id;

  RETURN QUERY SELECT v_room_id, v_room_code, v_host_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_room_with_mode_secure(CHARACTER VARYING,CHARACTER VARYING,CHARACTER VARYING,INTEGER,INTEGER,TEXT[],BOOLEAN,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_room_with_mode_secure(CHARACTER VARYING,CHARACTER VARYING,CHARACTER VARYING,INTEGER,INTEGER,TEXT[],BOOLEAN,TEXT,TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_mode_start_secure(p_room_code CHARACTER VARYING)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_room public.rooms%ROWTYPE; v_ready INTEGER;
  v_team_a INTEGER; v_team_b INTEGER; v_unassigned INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.host_id <> auth.uid() THEN RAISE EXCEPTION 'Yalnızca oda kurucusu doğrulama yapabilir'; END IF;
  IF v_room.phase <> 'lobby' THEN RAISE EXCEPTION 'Oyun zaten başladı'; END IF;

  SELECT count(*)::INTEGER INTO v_ready
  FROM public.room_players
  WHERE room_id = v_room.id AND is_ready AND is_online;
  IF v_ready < v_room.min_players THEN
    RAISE EXCEPTION 'Bu mod için en az % hazır oyuncu gerekiyor', v_room.min_players;
  END IF;

  IF v_room.game_mode = 'team_battle' THEN
    SELECT count(*) FILTER (WHERE team_id='A')::INTEGER,
           count(*) FILTER (WHERE team_id='B')::INTEGER,
           count(*) FILTER (WHERE team_id IS NULL)::INTEGER
    INTO v_team_a,v_team_b,v_unassigned
    FROM public.room_players
    WHERE room_id=v_room.id AND is_ready AND is_online;
    IF v_unassigned > 0 THEN RAISE EXCEPTION 'Tüm hazır oyuncular bir takıma atanmalıdır'; END IF;
    IF v_team_a < 2 OR v_team_b < 2 THEN RAISE EXCEPTION 'Her takımda en az 2 oyuncu olmalıdır'; END IF;
    IF abs(v_team_a-v_team_b) > 1 THEN RAISE EXCEPTION 'Takımlar dengeli olmalıdır'; END IF;
  END IF;
  RETURN TRUE;
END;
$function$;
REVOKE ALL ON FUNCTION public.validate_mode_start_secure(CHARACTER VARYING) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_mode_start_secure(CHARACTER VARYING) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_game_secure(p_room_code CHARACTER VARYING)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_user_id UUID := auth.uid(); v_room public.rooms; v_question_id TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.host_id <> v_user_id THEN RAISE EXCEPTION 'Yalnızca oda kurucusu oyunu başlatabilir'; END IF;
  IF v_room.game_mode='team_battle' THEN PERFORM public.auto_balance_teams_secure(p_room_code); END IF;
  PERFORM public.validate_mode_start_secure(p_room_code);

  SELECT q.id INTO v_question_id FROM public.questions q
  WHERE q.category_id=ANY(v_room.selected_categories)
    AND q.is_active IS DISTINCT FROM FALSE
  ORDER BY random() LIMIT 1;
  IF v_question_id IS NULL THEN RAISE EXCEPTION 'Seçilen kategorilerde kullanılabilir soru bulunamadı'; END IF;

  UPDATE public.room_players
  SET is_active=is_ready AND is_online, score=0, credits=0,
      credit_milestones_awarded=0, consecutive_correct=0,
      shields_available=0, blocks_available=0,
      is_blocked_current_round=FALSE, is_blocked_next_round=FALSE,
      last_blocked_player_id=NULL, ability_ready_round=0,
      ability_uses='{"block":0,"shield":0,"penalty":0,"counter":0}'::JSONB
  WHERE room_id=v_room.id;

  INSERT INTO public.room_round_questions(room_id,game_number,round_number,question_id)
  VALUES(v_room.id,v_room.game_number,1,v_question_id)
  ON CONFLICT(room_id,game_number,round_number) DO UPDATE SET question_id=EXCLUDED.question_id;
  UPDATE public.rooms SET current_round=1,current_question_id=v_question_id,finished_at=NULL,updated_at=now() WHERE id=v_room.id;
  PERFORM public._set_room_phase(v_room.id,'ability_select',v_room.round_seconds);
END;
$function$;
REVOKE ALL ON FUNCTION public.start_game_secure(CHARACTER VARYING) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_game_secure(CHARACTER VARYING) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_suspect_pick_secure(p_room_code CHARACTER VARYING,p_suspect_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_room public.rooms%ROWTYPE; v_detective UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(p_room_code) FOR UPDATE;
  IF NOT FOUND OR v_room.phase<>'guess' THEN RAISE EXCEPTION 'Şüpheli tahmini yalnız tahmin aşamasında yapılabilir'; END IF;
  IF v_room.game_mode NOT IN ('suspicious','detective_fox') THEN RAISE EXCEPTION 'Bu mod şüpheli tahmini kullanmıyor'; END IF;
  IF p_suspect_id=auth.uid() THEN RAISE EXCEPTION 'Kendini seçemezsin'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND player_id=auth.uid() AND is_active)
     OR NOT EXISTS(SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND player_id=p_suspect_id AND is_active)
  THEN RAISE EXCEPTION 'Geçersiz oyuncu'; END IF;

  IF v_room.game_mode='detective_fox' THEN
    SELECT rp.player_id INTO v_detective
    FROM public.room_players rp WHERE rp.room_id=v_room.id AND rp.is_active
    ORDER BY rp.player_id
    OFFSET ((v_room.current_round-1) % GREATEST((SELECT count(*) FROM public.room_players x WHERE x.room_id=v_room.id AND x.is_active),1))
    LIMIT 1;
    IF auth.uid() IS DISTINCT FROM v_detective THEN RAISE EXCEPTION 'Bu tur yalnız dedektif şüpheli seçebilir'; END IF;
  END IF;

  INSERT INTO public.round_suspect_picks(room_id,round_number,player_id,suspect_player_id)
  VALUES(v_room.id,v_room.current_round,auth.uid(),p_suspect_id)
  ON CONFLICT(room_id,round_number,player_id) DO NOTHING;
  RETURN TRUE;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_suspect_pick_secure(CHARACTER VARYING,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_suspect_pick_secure(CHARACTER VARYING,UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_round_authoritative(p_room_id UUID,p_round_number INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_room public.rooms%ROWTYPE; v_player RECORD; v_choice public.round_choices%ROWTYPE;
  v_points INTEGER; v_victims INTEGER; v_correct BOOLEAN; v_golden BOOLEAN;
  v_mission INTEGER; v_detective UUID; v_detective_bonus INTEGER;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  v_golden := v_room.game_mode='golden_question' AND p_round_number % 3=0;
  IF v_room.game_mode='detective_fox' THEN
    SELECT rp.player_id INTO v_detective FROM public.room_players rp
    WHERE rp.room_id=v_room.id AND rp.is_active ORDER BY rp.player_id
    OFFSET ((p_round_number-1) % GREATEST((SELECT count(*) FROM public.room_players x WHERE x.room_id=v_room.id AND x.is_active),1)) LIMIT 1;
  END IF;
  DELETE FROM public.round_results WHERE room_id=p_room_id AND round_number=p_round_number;

  FOR v_player IN SELECT * FROM public.room_players WHERE room_id=p_room_id AND is_active LOOP
    SELECT c.* INTO v_choice FROM public.round_picks p
    JOIN public.round_choices c ON c.room_id=p.room_id AND c.round_number=p.round_number AND c.choice_index=p.choice_index
    WHERE p.room_id=p_room_id AND p.round_number=p_round_number AND p.player_id=v_player.player_id;
    v_correct := FOUND AND v_choice.is_correct;

    SELECT count(*)::INTEGER INTO v_victims
    FROM public.round_picks p
    JOIN public.round_choices c ON c.room_id=p.room_id AND c.round_number=p.round_number AND c.choice_index=p.choice_index
    JOIN public.room_players picker ON picker.room_id=p.room_id AND picker.player_id=p.player_id
    WHERE p.room_id=p_room_id AND p.round_number=p_round_number
      AND c.author_id=v_player.player_id AND NOT c.is_correct AND p.player_id<>v_player.player_id
      AND (v_room.game_mode<>'team_battle' OR picker.team_id IS DISTINCT FROM v_player.team_id);

    v_points := (CASE WHEN v_correct THEN 2 ELSE 0 END) + v_victims;
    IF v_room.game_mode='blitz' AND v_correct AND EXISTS(
      SELECT 1 FROM public.round_picks p WHERE p.room_id=p_room_id AND p.round_number=p_round_number
      AND p.player_id=v_player.player_id AND p.submitted_at<=v_room.phase_started_at+interval '3 seconds'
    ) THEN v_points:=v_points+1; END IF;
    IF v_golden AND v_correct THEN v_points:=v_points+4; END IF;

    v_mission:=0;
    IF v_room.game_mode='secret_missions' THEN
      CASE abs(hashtext(v_player.player_id::text)) % 3
        WHEN 0 THEN IF v_victims>=2 THEN v_mission:=2; END IF;
        WHEN 1 THEN IF v_correct THEN v_mission:=1; END IF;
        ELSE IF v_victims>=1 AND p_round_number%2=0 THEN v_mission:=2; END IF;
      END CASE;
      v_points:=v_points+v_mission;
    END IF;

    v_detective_bonus:=0;
    IF v_room.game_mode='detective_fox' AND v_player.player_id=v_detective AND EXISTS(
      SELECT 1 FROM public.round_suspect_picks sp
      WHERE sp.room_id=p_room_id AND sp.round_number=p_round_number AND sp.player_id=v_player.player_id
      AND EXISTS(
        SELECT 1 FROM public.round_picks pp
        JOIN public.round_choices cc ON cc.room_id=pp.room_id AND cc.round_number=pp.round_number AND cc.choice_index=pp.choice_index
        WHERE pp.room_id=p_room_id AND pp.round_number=p_round_number AND cc.author_id=sp.suspect_player_id
          AND NOT cc.is_correct AND pp.player_id<>sp.suspect_player_id
      )
    ) THEN v_detective_bonus:=2; v_points:=v_points+2; END IF;

    UPDATE public.room_players SET score=GREATEST(0,score+v_points)
    WHERE room_id=p_room_id AND player_id=v_player.player_id;

    INSERT INTO public.round_results(
      room_id,round_number,player_id,answered_correctly,"zartaladın","zartalandın",points_delta,
      victims_count,deceived_by_author_id,picked_text,own_fake_text,is_blocked,penalty_delta,
      mission_bonus,golden_multiplier,detective_bonus
    ) VALUES(
      p_room_id,p_round_number,v_player.player_id,v_correct,v_victims>0,
      COALESCE(NOT v_choice.is_correct AND v_choice.author_id IS NOT NULL,FALSE),v_points,v_victims,
      v_choice.author_id,v_choice.text,
      (SELECT fake_answer FROM public.round_fake_answers fa WHERE fa.room_id=p_room_id AND fa.round_number=p_round_number AND fa.player_id=v_player.player_id),
      v_player.is_blocked_current_round,0,v_mission,CASE WHEN v_golden AND v_correct THEN 3 ELSE 1 END,v_detective_bonus
    );
  END LOOP;
  PERFORM public._set_room_phase(v_room.id,'reveal',NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.resolve_round_authoritative(UUID,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_round_authoritative(UUID,INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.use_ability_secure(p_room_code CHARACTER VARYING,p_ability public.ability_type,p_target_id UUID DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  v_user_id UUID:=auth.uid(); v_room public.rooms; v_player public.room_players;
  v_target public.room_players; v_uses INTEGER; v_cost INTEGER:=1; v_existing public.ability_actions;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(p_room_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
  IF v_room.phase<>'ability_select' THEN RAISE EXCEPTION 'Yetenek seçimi aşaması sona erdi'; END IF;
  IF v_room.game_mode='blitz' THEN RAISE EXCEPTION 'Fırtına Turu yetenek kullanmaz'; END IF;
  SELECT * INTO v_player FROM public.room_players WHERE room_id=v_room.id AND player_id=v_user_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aktif oda üyesi değilsiniz'; END IF;
  SELECT * INTO v_existing FROM public.ability_actions WHERE room_id=v_room.id AND round_number=v_room.current_round AND player_id=v_user_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.ability=p_ability AND v_existing.target_id IS NOT DISTINCT FROM p_target_id THEN RETURN; END IF;
    RAISE EXCEPTION 'Bu tur yalnızca bir yetenek kullanabilirsin';
  END IF;
  IF p_ability::text NOT IN ('block','shield') THEN RAISE EXCEPTION 'Bu yetenek kullanılamıyor'; END IF;
  IF v_player.credits<v_cost THEN RAISE EXCEPTION 'Yetersiz kredi'; END IF;
  IF p_ability='block' THEN
    IF p_target_id IS NULL OR p_target_id=v_user_id THEN RAISE EXCEPTION 'Geçerli rakip seçmelisin'; END IF;
    SELECT * INTO v_target FROM public.room_players WHERE room_id=v_room.id AND player_id=p_target_id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Hedef aktif değil'; END IF;
    IF v_room.game_mode='team_battle' AND v_player.team_id IS NOT NULL AND v_player.team_id=v_target.team_id THEN
      RAISE EXCEPTION 'Takım arkadaşına saldırı yeteneği kullanamazsın';
    END IF;
    IF v_player.last_blocked_player_id=p_target_id THEN RAISE EXCEPTION 'Aynı oyuncuyu art arda bloklayamazsın'; END IF;
  ELSIF p_target_id IS NOT NULL THEN RAISE EXCEPTION 'Bu yetenek hedef kabul etmez'; END IF;
  v_uses:=coalesce((v_player.ability_uses->>p_ability::text)::INTEGER,0);
  UPDATE public.room_players SET credits=credits-v_cost,
    last_blocked_player_id=CASE WHEN p_ability='block' THEN p_target_id ELSE last_blocked_player_id END,
    ability_uses=jsonb_set(ability_uses,ARRAY[p_ability::text],to_jsonb(v_uses+1))
  WHERE room_id=v_room.id AND player_id=v_user_id;
  INSERT INTO public.ability_actions(room_id,round_number,player_id,ability,target_id)
  VALUES(v_room.id,v_room.current_round,v_user_id,p_ability,p_target_id);
  UPDATE public.rooms SET state_version=state_version+1,updated_at=now() WHERE id=v_room.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.use_ability_secure(CHARACTER VARYING,public.ability_type,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_ability_secure(CHARACTER VARYING,public.ability_type,UUID) TO authenticated, service_role;
