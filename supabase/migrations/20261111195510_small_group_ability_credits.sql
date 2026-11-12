-- Accessible, repeat-safe ability credits for three-player and short matches.
-- Compatible with the live resolver and later milestone-aware resolvers.

ALTER TABLE public.room_players
  ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0 CHECK (credits >= 0),
  ADD COLUMN IF NOT EXISTS credit_milestones_awarded integer NOT NULL DEFAULT 0
    CHECK (credit_milestones_awarded BETWEEN 0 AND 3);

CREATE OR REPLACE FUNCTION public._match_credit_milestones(p_score integer)
RETURNS integer LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN p_score >= 12 THEN 3 WHEN p_score >= 8 THEN 2 WHEN p_score >= 4 THEN 1 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public._award_match_credit_on_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_target_milestones integer;
BEGIN
  IF NEW.score <= OLD.score OR NOT NEW.is_active THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = NEW.room_id AND COALESCE(r.game_mode, 'classic') <> 'blitz'
  ) THEN
    v_target_milestones := public._match_credit_milestones(NEW.score);
    -- If the round resolver has already granted a milestone, do not grant twice.
    IF v_target_milestones > NEW.credit_milestones_awarded THEN
      NEW.credits := NEW.credits + v_target_milestones - NEW.credit_milestones_awarded;
      NEW.credit_milestones_awarded := v_target_milestones;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_match_credit_on_score ON public.room_players;
CREATE TRIGGER award_match_credit_on_score
BEFORE UPDATE OF score ON public.room_players
FOR EACH ROW EXECUTE FUNCTION public._award_match_credit_on_score();

CREATE OR REPLACE FUNCTION public._grant_match_opening_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- start_game_secure resets credits before the first ability selection.
  -- A rematch also follows the lobby -> ability_select transition.
  IF OLD.phase = 'lobby' AND NEW.phase = 'ability_select'
     AND COALESCE(NEW.game_mode, 'classic') <> 'blitz' THEN
    UPDATE public.room_players rp
    SET credits = GREATEST(rp.credits, 1)
    WHERE rp.room_id = NEW.id AND rp.is_active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grant_match_opening_credit ON public.rooms;
CREATE TRIGGER grant_match_opening_credit
AFTER UPDATE OF phase ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public._grant_match_opening_credit();

REVOKE ALL ON FUNCTION public._match_credit_milestones(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._award_match_credit_on_score() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._grant_match_opening_credit() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public._match_credit_milestones(integer) IS 'Earn one credit each at 4, 8 and 12 cumulative match points.';
