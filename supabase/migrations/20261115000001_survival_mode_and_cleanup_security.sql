-- Kızılkuyruk: first playable Survival mode plus cleanup RPC hardening.
-- Apply after 20261114000001_restore_fake_answer_room_lock.sql.
-- Existing Classic rooms remain Classic and retain their current score economy.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS survival_finished BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.room_players
  ADD COLUMN IF NOT EXISTS lives_remaining INTEGER NOT NULL DEFAULT 3;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rooms_game_mode_check'
      AND conrelid = 'public.rooms'::regclass
  ) THEN
    ALTER TABLE public.rooms
      ADD CONSTRAINT rooms_game_mode_check
      CHECK (game_mode IN ('classic', 'survival'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_players_lives_remaining_check'
      AND conrelid = 'public.room_players'::regclass
  ) THEN
    ALTER TABLE public.room_players
      ADD CONSTRAINT room_players_lives_remaining_check
      CHECK (lives_remaining BETWEEN 0 AND 3);
  END IF;
END
$constraints$;

-- New RPC preserves older create_room_secure clients as Classic.
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum açılması gerekiyor';
  END IF;
  IF p_game_mode IS NULL OR p_game_mode NOT IN ('classic', 'survival') THEN
    RAISE EXCEPTION 'Desteklenmeyen oyun modu';
  END IF;

  SELECT created.room_id, created.room_code, created.host_id
  INTO v_room_id, v_room_code, v_host_id
  FROM public.create_room_secure(
    p_code, p_name, p_avatar_key, p_total_rounds, p_round_seconds,
    p_categories, p_is_private, p_password
  ) AS created;

  UPDATE public.rooms
  SET game_mode = p_game_mode,
      survival_finished = FALSE,
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

-- Life loss is based on authoritative round_results inserted by the server.
CREATE OR REPLACE FUNCTION public.apply_survival_life_loss()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_game_mode TEXT;
  v_remaining INTEGER;
  v_result_count INTEGER;
  v_active_count INTEGER;
BEGIN
  SELECT r.game_mode INTO v_game_mode
  FROM public.rooms r
  WHERE r.id = NEW.room_id;

  IF v_game_mode = 'survival' AND NOT COALESCE(NEW.answered_correctly, FALSE) THEN
    UPDATE public.room_players
    SET lives_remaining = GREATEST(0, lives_remaining - 1)
    WHERE room_id = NEW.room_id
      AND player_id = NEW.player_id
      AND lives_remaining > 0;
  END IF;

  IF v_game_mode = 'survival' THEN
    SELECT count(*)::INTEGER INTO v_remaining
    FROM public.room_players
    WHERE room_id = NEW.room_id AND is_active AND lives_remaining > 0;

    SELECT count(*)::INTEGER INTO v_result_count
    FROM public.round_results
    WHERE room_id = NEW.room_id AND round_number = NEW.round_number;

    SELECT count(*)::INTEGER INTO v_active_count
    FROM public.room_players
    WHERE room_id = NEW.room_id AND is_active;

    IF v_active_count > 0 AND v_result_count >= v_active_count THEN
      UPDATE public.rooms
      SET survival_finished = (v_remaining <= 1),
          state_version = state_version + 1,
          updated_at = now()
      WHERE id = NEW.room_id AND current_round = NEW.round_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS round_results_survival_life_loss ON public.round_results;
CREATE TRIGGER round_results_survival_life_loss
AFTER INSERT ON public.round_results
FOR EACH ROW
EXECUTE FUNCTION public.apply_survival_life_loss();

REVOKE ALL ON FUNCTION public.apply_survival_life_loss() FROM PUBLIC, anon, authenticated;

-- Refill lives only when a new match or rematch starts, never between rounds.
CREATE OR REPLACE FUNCTION public.reset_survival_room_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF (NEW.phase = 'ability_select' AND OLD.phase = 'lobby')
     OR (NEW.phase = 'lobby' AND OLD.phase = 'game_over') THEN
    UPDATE public.room_players
    SET lives_remaining = 3
    WHERE room_id = NEW.id;

    UPDATE public.rooms
    SET survival_finished = FALSE
    WHERE id = NEW.id AND survival_finished;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS rooms_reset_survival_state ON public.rooms;
CREATE TRIGGER rooms_reset_survival_state
AFTER UPDATE OF phase ON public.rooms
FOR EACH ROW
WHEN (
  (NEW.phase = 'ability_select' AND OLD.phase = 'lobby')
  OR (NEW.phase = 'lobby' AND OLD.phase = 'game_over')
)
EXECUTE FUNCTION public.reset_survival_room_state();

REVOKE ALL ON FUNCTION public.reset_survival_room_state() FROM PUBLIC, anon, authenticated;

-- This RPC deletes room data; only trusted server-side jobs may call it directly.
REVOKE ALL ON FUNCTION public.cleanup_inactive_rooms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_inactive_rooms() TO service_role;

-- Close the mutable search_path warning on this legacy resolver.
ALTER FUNCTION public.resolve_round_secure(UUID, INTEGER, INTEGER)
  SET search_path = pg_catalog, public;

-- Extend the verified RPC definitions without replacing unrelated game logic.
-- Every expected source anchor is checked; drift aborts the migration transaction.
DO $functions$
DECLARE
  v_definition TEXT;
  v_before TEXT;
BEGIN
  v_definition := pg_get_functiondef('public.get_room_state_secure(character varying)'::regprocedure);
  
  IF position('''gameMode'', v_room.game_mode' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      '''selectedCategoryIds'', v_room.selected_categories',
      '''selectedCategoryIds'', v_room.selected_categories, ''gameMode'', v_room.game_mode'
    );
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not add gameMode to get_room_state_secure; function body has drifted';
    END IF;
  END IF;

  IF position('''livesRemaining'', rp.lives_remaining' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      '''score'', rp.score,',
      '''score'', rp.score, ''livesRemaining'', rp.lives_remaining,'
    );
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not add livesRemaining to get_room_state_secure; function body has drifted';
    END IF;
  END IF;

  -- The following anchors are progress counters only. Keep the player JSON
  -- and submission-status map complete so eliminated players remain visible.
  IF position('(v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND (v_room.phase <> ''fake_answer'' OR NOT rp.is_blocked_current_round);',
      'AND (v_room.phase <> ''fake_answer'' OR NOT rp.is_blocked_current_round) AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
    );
    IF v_definition = v_before THEN
      v_definition := replace(
        v_definition,
        'AND (v_room.phase NOT IN (''fake_answer'', ''guess'') OR NOT rp.is_blocked_current_round);',
        'AND (v_room.phase <> ''fake_answer'' OR NOT rp.is_blocked_current_round) AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
      );
    END IF;
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s*\(\s*v_room\.phase\s*(?:<>\s*''fake_answer''|NOT\s+IN\s*\(\s*''fake_answer''\s*,\s*''guess''\s*\))\s+OR\s+NOT\s+rp\.is_blocked_current_round\s*\)\s*;',
        'AND (v_room.phase <> ''fake_answer'' OR NOT rp.is_blocked_current_round) AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not scope room-state total count to living players';
    END IF;
  END IF;

  IF position('WHERE rp.room_id = v_room.id AND rp.is_active AND rp.is_ready AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'WHERE rp.room_id = v_room.id AND rp.is_active AND rp.is_ready;',
      'WHERE rp.room_id = v_room.id AND rp.is_active AND rp.is_ready AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'WHERE\s+rp\.room_id\s*=\s*v_room\.id\s+AND\s+rp\.is_active\s+AND\s+rp\.is_ready\s*;',
        'WHERE rp.room_id = v_room.id AND rp.is_active AND rp.is_ready AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not scope lobby progress to living players';
    END IF;
  END IF;

  IF position('AND rp.is_active AND NOT rp.is_blocked_current_round AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND rp.is_active AND NOT rp.is_blocked_current_round;',
      'AND rp.is_active AND NOT rp.is_blocked_current_round AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s+rp\.is_active\s+AND\s+NOT\s+rp\.is_blocked_current_round\s*;',
        'AND rp.is_active AND NOT rp.is_blocked_current_round AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not scope fake-answer progress to living players';
    END IF;
  END IF;

  IF position('AND rp.is_active AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND rp.is_active;',
      'AND rp.is_active AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
    );
    IF v_definition = v_before THEN
      v_definition := replace(
        v_definition,
        'AND rp.is_active AND NOT rp.is_blocked_current_round;',
        'AND rp.is_active AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
      );
    END IF;
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s+rp\.is_active\s*;',
        'AND rp.is_active AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0);'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not scope guess progress to living players';
    END IF;
  END IF;

  IF position('WHEN v_room.game_mode = ''survival'' AND rp.lives_remaining <= 0 THEN TRUE' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'WHEN v_room.phase = ''lobby'' THEN rp.is_ready',
      'WHEN v_room.game_mode = ''survival'' AND rp.lives_remaining <= 0 THEN TRUE
                        WHEN v_room.phase = ''lobby'' THEN rp.is_ready'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'WHEN\s+v_room\.phase\s*=\s*''lobby''\s+THEN\s+rp\.is_ready',
        'WHEN v_room.game_mode = ''survival'' AND rp.lives_remaining <= 0 THEN TRUE
                        WHEN v_room.phase = ''lobby'' THEN rp.is_ready'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not mark eliminated players complete in progress status';
    END IF;
  END IF;
  EXECUTE v_definition;

  v_definition := pg_get_functiondef('public.submit_pick_secure(character varying, integer)'::regprocedure);
  IF position('(v_room.game_mode <> ''survival'' OR lives_remaining > 0)' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND player_id = v_user_id AND is_active',
      'AND player_id = v_user_id AND is_active AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0)'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s+player_id\s*=\s*v_user_id\s+AND\s+is_active',
        'AND player_id = v_user_id AND is_active AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0)'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not prevent eliminated players from submitting picks';
    END IF;
  END IF;

  IF position('(v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0)' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'WHERE rp.room_id = v_room.id AND rp.is_active',
      'WHERE rp.room_id = v_room.id AND rp.is_active AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0)'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'WHERE\s+rp\.room_id\s*=\s*v_room\.id\s+AND\s+rp\.is_active',
        'WHERE rp.room_id = v_room.id AND rp.is_active AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0)'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not scope remaining picks to living players';
    END IF;
  END IF;
  EXECUTE v_definition;

  v_definition := pg_get_functiondef('public.submit_fake_answer_secure(character varying, text)'::regprocedure);
  IF position('(v_room.game_mode <> ''survival'' OR lives_remaining > 0)' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND is_online = TRUE',
      'AND is_online = TRUE AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0)'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s+is_online\s*=\s*TRUE',
        'AND is_online = TRUE AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0)'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not prevent eliminated players from submitting fake answers';
    END IF;
  END IF;

  IF position('(v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0)' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND rp.is_online = TRUE',
      'AND rp.is_online = TRUE AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0)'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s+rp\.is_online\s*=\s*TRUE',
        'AND rp.is_online = TRUE AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0)'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not scope submitted fake answers to living players';
    END IF;
  END IF;
  v_definition := replace(v_definition, 'SET search_path TO ''public''', 'SET search_path TO ''pg_catalog'', ''public''');
  EXECUTE v_definition;

  v_definition := pg_get_functiondef('public.advance_expired_room_phase_secure(character varying)'::regprocedure);
  IF position('(v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0)' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND NOT rp.is_blocked_current_round',
      'AND NOT rp.is_blocked_current_round AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0)'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s+NOT\s+rp\.is_blocked_current_round',
        'AND NOT rp.is_blocked_current_round AND (v_room.game_mode <> ''survival'' OR rp.lives_remaining > 0)'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not scope expired fake-answer inserts to living players';
    END IF;
  END IF;
  EXECUTE v_definition;

  v_definition := pg_get_functiondef('public.confirm_ability_selection_secure(character varying)'::regprocedure);
  IF position('(v_room.game_mode <> ''survival'' OR lives_remaining > 0)' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND player_id = v_user_id AND is_active',
      'AND player_id = v_user_id AND is_active AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0)'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s+player_id\s*=\s*v_user_id\s+AND\s+is_active',
        'AND player_id = v_user_id AND is_active AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0)'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not prevent eliminated players from confirming abilities';
    END IF;
  END IF;

  IF position('(v_room.game_mode <> ''survival'' OR lives_remaining > 0);' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND ability_ready_round <> v_room.current_round;',
      'AND ability_ready_round <> v_room.current_round AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0);'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s+ability_ready_round\s*<>\s*v_room\.current_round\s*;',
        'AND ability_ready_round <> v_room.current_round AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0);'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not exclude eliminated players from the ability-selection barrier';
    END IF;
  END IF;
  EXECUTE v_definition;

  v_definition := pg_get_functiondef('public.use_ability_secure(character varying, public.ability_type, uuid)'::regprocedure);
  IF position('(v_room.game_mode <> ''survival'' OR lives_remaining > 0)' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'AND is_active FOR UPDATE;',
      'AND is_active AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0) FOR UPDATE;'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'AND\s+is_active\s+FOR\s+UPDATE\s*;',
        'AND is_active AND (v_room.game_mode <> ''survival'' OR lives_remaining > 0) FOR UPDATE;'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not prevent eliminated players from using abilities';
    END IF;
  END IF;

  IF position('coalesce(v_target.lives_remaining, 0) <= 0' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'IF NOT FOUND THEN RAISE EXCEPTION ''Hedef bu oyunda aktif değil''; END IF;',
      'IF NOT FOUND THEN RAISE EXCEPTION ''Hedef bu oyunda aktif değil''; END IF;
          IF v_room.game_mode = ''survival'' AND coalesce(v_target.lives_remaining, 0) <= 0 THEN
              RAISE EXCEPTION ''Bu oyuncu elendiği için hedef seçilemez'';
          END IF;'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'IF\s+NOT\s+FOUND\s+THEN\s+RAISE\s+EXCEPTION\s+''Hedef bu oyunda aktif değil''\s*;\s*END\s+IF\s*;',
        'IF NOT FOUND THEN RAISE EXCEPTION ''Hedef bu oyunda aktif değil''; END IF;
          IF v_room.game_mode = ''survival'' AND coalesce(v_target.lives_remaining, 0) <= 0 THEN
              RAISE EXCEPTION ''Bu oyuncu elendiği için hedef seçilemez'';
          END IF;'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not prevent targeting eliminated players';
    END IF;
  END IF;
  EXECUTE v_definition;

  v_definition := pg_get_functiondef('public.advance_round_secure(character varying)'::regprocedure);
  IF position('v_room.survival_finished' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'IF v_room.current_round >= v_room.total_rounds THEN',
      'IF v_room.current_round >= v_room.total_rounds OR (v_room.game_mode = ''survival'' AND v_room.survival_finished) THEN'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'IF\s+v_room\.current_round\s*>=\s*v_room\.total_rounds\s+THEN',
        'IF v_room.current_round >= v_room.total_rounds OR (v_room.game_mode = ''survival'' AND v_room.survival_finished) THEN'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not add Survival match-end condition';
    END IF;
  END IF;

  IF position('v_room.game_mode = ''survival'' AND rp.lives_remaining > 0' IN v_definition) = 0 THEN
    v_before := v_definition;
    v_definition := replace(
      v_definition,
      'row_number() OVER (ORDER BY rp.score DESC, rp.joined_at ASC)::INTEGER AS rank,',
      'row_number() OVER (ORDER BY CASE WHEN v_room.game_mode = ''survival'' AND rp.lives_remaining > 0 THEN 0 ELSE 1 END, rp.lives_remaining DESC, rp.score DESC, rp.joined_at ASC)::INTEGER AS rank,'
    );
    IF v_definition = v_before THEN
      v_definition := regexp_replace(
        v_definition,
        'row_number\(\)\s+OVER\s*\(\s*ORDER\s+BY\s+rp\.score\s+DESC\s*,\s*rp\.joined_at\s+ASC\s*\)::INTEGER\s+AS\s+rank\s*,',
        'row_number() OVER (ORDER BY CASE WHEN v_room.game_mode = ''survival'' AND rp.lives_remaining > 0 THEN 0 ELSE 1 END, rp.lives_remaining DESC, rp.score DESC, rp.joined_at ASC)::INTEGER AS rank,'
      );
    END IF;
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'Could not rank living Survival players ahead of eliminated players';
    END IF;
  END IF;
  EXECUTE v_definition;
END
$functions$;
