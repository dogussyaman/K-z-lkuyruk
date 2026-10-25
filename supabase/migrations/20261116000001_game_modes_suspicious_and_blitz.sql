-- Kızılkuyruk: New Playable Modes (Herkes Şüpheli & Fırtına Turu)
-- Migration: 20261116000001_game_modes_suspicious_and_blitz.sql
-- Applies after 20261115000001_survival_mode_and_cleanup_security.sql.
--
-- MANUAL EXECUTION:
-- In Supabase SQL Editor: Run this entire script as postgres/service_role.
--
-- ROLLBACK INSTRUCTIONS:
-- 1. ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_game_mode_check;
-- 2. ALTER TABLE public.rooms ADD CONSTRAINT rooms_game_mode_check CHECK (game_mode IN ('classic', 'survival'));
-- 3. Re-run 20261115000001_survival_mode_and_cleanup_security.sql definition of create_room_with_mode_secure.
-- 4. DROP FUNCTION IF EXISTS public.submit_suspect_pick_secure(CHARACTER VARYING, UUID);

-- 1. Update rooms_game_mode_check constraint to include 'suspicious' and 'blitz'
ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_game_mode_check;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_game_mode_check
  CHECK (game_mode IN ('classic', 'survival', 'suspicious', 'blitz'));

-- 2. Update create_room_with_mode_secure to support all four playable game modes
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room_id UUID;
  v_room_code CHARACTER VARYING;
  v_host_id UUID;
  v_round_seconds INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum açılması gerekiyor';
  END IF;

  IF p_game_mode IS NULL OR p_game_mode NOT IN ('classic', 'survival', 'suspicious', 'blitz') THEN
    RAISE EXCEPTION 'Desteklenmeyen oyun modu: %', p_game_mode;
  END IF;

  -- Fırtına Turu (blitz) enforces fast round duration
  v_round_seconds := p_round_seconds;
  IF p_game_mode = 'blitz' THEN
    v_round_seconds := LEAST(COALESCE(p_round_seconds, 7), 10);
  END IF;

  SELECT created.room_id, created.room_code, created.host_id
  INTO v_room_id, v_room_code, v_host_id
  FROM public.create_room_secure(
    p_code, p_name, p_avatar_key, p_total_rounds, v_round_seconds,
    p_categories, p_is_private, p_password
  ) AS created;

  UPDATE public.rooms
  SET game_mode = p_game_mode,
      survival_finished = FALSE,
      round_seconds = v_round_seconds,
      updated_at = now()
  WHERE id = v_room_id;

  RETURN QUERY SELECT v_room_id, v_room_code, v_host_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_room_with_mode_secure(
  CHARACTER VARYING, CHARACTER VARYING, CHARACTER VARYING, INTEGER,
  INTEGER, TEXT[], BOOLEAN, TEXT, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_room_with_mode_secure(
  CHARACTER VARYING, CHARACTER VARYING, CHARACTER VARYING, INTEGER,
  INTEGER, TEXT[], BOOLEAN, TEXT, TEXT
) TO authenticated, service_role;

-- 3. Dedicated RPC for submitting suspect deduction in Herkes Şüpheli mode
CREATE OR REPLACE FUNCTION public.submit_suspect_pick_secure(
  p_room_code CHARACTER VARYING,
  p_suspect_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_player_id UUID;
BEGIN
  v_player_id := auth.uid();
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Oturum açılması gerekiyor';
  END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE code = UPPER(p_room_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadı';
  END IF;

  IF v_room.game_mode <> 'suspicious' THEN
    RAISE EXCEPTION 'Şüpheli seçimi yalnızca Herkes Şüpheli modunda geçerlidir';
  END IF;

  IF v_room.phase <> 'guess' THEN
    RAISE EXCEPTION 'Tahmin aşamasında değilsiniz';
  END IF;

  IF v_player_id = p_suspect_id THEN
    RAISE EXCEPTION 'Kendinizi şüpheli olarak seçemezsiniz';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = v_room.id AND player_id = p_suspect_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Geçersiz şüpheli oyuncu';
  END IF;

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_suspect_pick_secure(CHARACTER VARYING, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_suspect_pick_secure(CHARACTER VARYING, UUID) TO authenticated, service_role;
