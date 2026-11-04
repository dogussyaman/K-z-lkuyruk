-- Special phase-machine modes can use bots to fill/test their lobby.
-- Their in-game bot automation remains intentionally disabled client-side.
CREATE OR REPLACE FUNCTION public.guard_test_bot_supported_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_game_mode TEXT;
  v_phase public.room_phase;
BEGIN
  IF NOT NEW.is_bot THEN RETURN NEW; END IF;

  SELECT r.game_mode, r.phase
  INTO v_game_mode, v_phase
  FROM public.rooms r
  WHERE r.id = NEW.room_id;

  IF v_game_mode = 'double_trap' THEN
    RAISE EXCEPTION 'Çifte Tuzak modu test botlarını henüz desteklemiyor';
  END IF;

  -- Gizli Tilki / Orman Hazinesi bots are currently lobby fillers only.
  -- They are inserted ready and may participate in team/role setup, while
  -- dedicated in-game automation stays disabled until those engines get parity.
  IF v_game_mode IN ('gizli_tilki', 'orman_hazinesi') AND v_phase <> 'lobby' THEN
    RAISE EXCEPTION 'Bu modda bot yalnızca lobby aşamasında eklenebilir';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_test_bot_supported_mode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_test_bot_supported_mode() TO service_role;
