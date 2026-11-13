-- Round review readiness and true per-match awards for Classic Blöf.
-- The private table is never exposed through PostgREST or direct player grants.
CREATE TABLE IF NOT EXISTS kizilkuyruk_private.round_readiness (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  game_number integer NOT NULL,
  round_number integer NOT NULL,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, game_number, round_number, player_id)
);

ALTER TABLE kizilkuyruk_private.round_readiness ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE kizilkuyruk_private.round_readiness FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_classic_round_ready_secure(p_room_code varchar)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, kizilkuyruk_private AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_total integer := 0;
  v_ready integer := 0;
  v_self_ready boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(trim(p_room_code));
  IF NOT FOUND OR NOT public.is_room_member(v_room.id) THEN
    RAISE EXCEPTION 'Oda bulunamadı veya erişim izniniz yok';
  END IF;
  IF v_room.phase <> 'scoreboard' THEN
    RAISE EXCEPTION 'Hazırım yalnızca tur skor ekranında kullanılabilir';
  END IF;
  SELECT count(*)::integer,
    count(rr.player_id)::integer
  INTO v_total,v_ready
  FROM public.room_players rp
  LEFT JOIN kizilkuyruk_private.round_readiness rr
    ON rr.room_id=rp.room_id AND rr.game_number=v_room.game_number
   AND rr.round_number=v_room.current_round AND rr.player_id=rp.player_id
  WHERE rp.room_id=v_room.id AND rp.is_active AND NOT coalesce(rp.is_bot,false)
    AND (v_room.game_mode<>'survival' OR rp.lives_remaining>0);
  SELECT EXISTS(
    SELECT 1 FROM kizilkuyruk_private.round_readiness rr
    WHERE rr.room_id=v_room.id AND rr.game_number=v_room.game_number
      AND rr.round_number=v_room.current_round AND rr.player_id=auth.uid()
  ) INTO v_self_ready;
  RETURN jsonb_build_object(
    'readyCount',v_ready,'totalCount',v_total,
    'isReady',v_self_ready,'allReady',v_total>0 AND v_ready>=v_total
  );
END; $$;

CREATE OR REPLACE FUNCTION public.mark_classic_round_ready_secure(p_room_code varchar)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, kizilkuyruk_private AS $$
DECLARE v_room public.rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(trim(p_room_code)) FOR UPDATE;
  IF NOT FOUND OR NOT public.is_room_member(v_room.id) THEN
    RAISE EXCEPTION 'Oda bulunamadı veya erişim izniniz yok';
  END IF;
  IF v_room.phase <> 'scoreboard' THEN
    RAISE EXCEPTION 'Turun skor aşaması tamamlandı';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.room_players rp
    WHERE rp.room_id=v_room.id AND rp.player_id=auth.uid() AND rp.is_active
      AND NOT coalesce(rp.is_bot,false)
      AND (v_room.game_mode<>'survival' OR rp.lives_remaining>0)
  ) THEN
    RAISE EXCEPTION 'Bu tur için aktif oyuncu değilsiniz';
  END IF;
  INSERT INTO kizilkuyruk_private.round_readiness (room_id,game_number,round_number,player_id)
  VALUES (v_room.id,v_room.game_number,v_room.current_round,auth.uid())
  ON CONFLICT DO NOTHING;
  -- Realtime + polling both observe this monotonic server version.
  UPDATE public.rooms
  SET state_version=state_version+1,updated_at=now()
  WHERE id=v_room.id;
  RETURN public.get_classic_round_ready_secure(p_room_code);
END; $$;

CREATE OR REPLACE FUNCTION public.get_classic_match_titles_secure(p_room_code varchar)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_room public.rooms%ROWTYPE;
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(trim(p_room_code));
  IF NOT FOUND OR NOT public.is_room_member(v_room.id) THEN
    RAISE EXCEPTION 'Oda bulunamadı veya erişim izniniz yok';
  END IF;
  IF v_room.phase <> 'game_over' THEN
    RAISE EXCEPTION 'Maç unvanları yalnızca oyun sonunda açıklanır';
  END IF;
  -- Rematch deletes previous-game round_results; these totals are only this match.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'playerId',s.player_id,'rounds',s.round_count,'correct',s.correct_count,
    'victims',s.victim_count,'trapped',s.trapped_count
  )), '[]'::jsonb) INTO v_result
  FROM (
    SELECT rp.player_id,
      count(rr.id)::integer AS round_count,
      count(rr.id) FILTER (WHERE rr.answered_correctly)::integer AS correct_count,
      coalesce(sum(rr.victims_count),0)::integer AS victim_count,
      count(rr.id) FILTER (WHERE rr."zartalandın")::integer AS trapped_count
    FROM public.room_players rp
    LEFT JOIN public.round_results rr
      ON rr.room_id=rp.room_id AND rr.player_id=rp.player_id
    WHERE rp.room_id=v_room.id AND rp.is_active
    GROUP BY rp.player_id
    ORDER BY rp.player_id
  ) s;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.get_classic_round_ready_secure(varchar) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_classic_round_ready_secure(varchar) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_classic_match_titles_secure(varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_classic_round_ready_secure(varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_classic_round_ready_secure(varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_classic_match_titles_secure(varchar) TO authenticated;
