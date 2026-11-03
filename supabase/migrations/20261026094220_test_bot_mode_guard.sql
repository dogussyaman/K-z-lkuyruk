-- Keep test bots out of custom/special phase machines until they have bot parity.
CREATE OR REPLACE FUNCTION public.guard_test_bot_supported_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_game_mode TEXT;
BEGIN
  IF NOT NEW.is_bot THEN RETURN NEW; END IF;

  SELECT r.game_mode INTO v_game_mode
  FROM public.rooms r
  WHERE r.id = NEW.room_id;

  IF v_game_mode IN ('double_trap', 'gizli_tilki', 'orman_hazinesi') THEN
    RAISE EXCEPTION 'Bu oyun modu test botlarını henüz desteklemiyor';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_test_bot_supported_mode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_test_bot_supported_mode() TO service_role;

DROP TRIGGER IF EXISTS guard_test_bot_supported_mode ON public.room_players;
CREATE TRIGGER guard_test_bot_supported_mode
BEFORE INSERT OR UPDATE OF is_bot, room_id ON public.room_players
FOR EACH ROW EXECUTE FUNCTION public.guard_test_bot_supported_mode();
