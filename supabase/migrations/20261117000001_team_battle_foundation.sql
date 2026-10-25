-- Kızılkuyruk: Team Battle foundation
-- Adds server-owned A/B team assignment and team score aggregation.
-- This migration intentionally keeps the existing round engine intact.

ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_game_mode_check;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_game_mode_check
  CHECK (game_mode IN ('classic', 'survival', 'suspicious', 'blitz', 'team_battle'));

ALTER TABLE public.room_players
  ADD COLUMN IF NOT EXISTS team_id TEXT;

ALTER TABLE public.room_players
  DROP CONSTRAINT IF EXISTS room_players_team_id_check;

ALTER TABLE public.room_players
  ADD CONSTRAINT room_players_team_id_check
  CHECK (team_id IS NULL OR team_id IN ('A', 'B'));

CREATE INDEX IF NOT EXISTS room_players_room_team_idx
  ON public.room_players(room_id, team_id)
  WHERE is_active = TRUE;

CREATE OR REPLACE FUNCTION public.assign_team_secure(
  p_room_code CHARACTER VARYING,
  p_target_id UUID,
  p_team_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum açılması gerekiyor';
  END IF;

  IF p_team_id NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'Takım A veya B olmalıdır';
  END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE code = UPPER(p_room_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadı';
  END IF;

  IF v_room.host_id <> auth.uid() THEN
    RAISE EXCEPTION 'Takımları yalnızca oda sahibi düzenleyebilir';
  END IF;

  IF v_room.game_mode <> 'team_battle' THEN
    RAISE EXCEPTION 'Takım ataması yalnızca Takım Savaşı modunda kullanılabilir';
  END IF;

  IF v_room.phase <> 'lobby' THEN
    RAISE EXCEPTION 'Takımlar yalnızca lobide değiştirilebilir';
  END IF;

  UPDATE public.room_players
  SET team_id = p_team_id
  WHERE room_id = v_room.id
    AND player_id = p_target_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oyuncu bu odada aktif değil';
  END IF;

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_team_secure(CHARACTER VARYING, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_team_secure(CHARACTER VARYING, UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_team_scores_secure(
  p_room_code CHARACTER VARYING
)
RETURNS TABLE(team_id TEXT, score BIGINT, active_players BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum açılması gerekiyor';
  END IF;

  SELECT r.id INTO v_room_id
  FROM public.rooms r
  WHERE r.code = UPPER(p_room_code)
    AND EXISTS (
      SELECT 1 FROM public.room_players rp
      WHERE rp.room_id = r.id
        AND rp.player_id = auth.uid()
        AND rp.is_active = TRUE
    );

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Oda bulunamadı veya bu odaya erişiminiz yok';
  END IF;

  RETURN QUERY
  SELECT rp.team_id,
         COALESCE(SUM(rp.score), 0)::BIGINT,
         COUNT(*)::BIGINT
  FROM public.room_players rp
  WHERE rp.room_id = v_room_id
    AND rp.is_active = TRUE
    AND rp.team_id IN ('A', 'B')
  GROUP BY rp.team_id
  ORDER BY rp.team_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_team_scores_secure(CHARACTER VARYING) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_scores_secure(CHARACTER VARYING) TO authenticated, service_role;

-- Existing rooms stay unassigned. Team Battle room creation / lobby code should
-- assign players before start and reject starts unless both teams are populated.
