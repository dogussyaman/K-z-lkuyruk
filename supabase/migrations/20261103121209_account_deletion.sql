-- Secure, idempotent cleanup for user-initiated account deletion.
-- The Edge Function verifies the caller's JWT, invokes this service-role-only
-- RPC, removes avatar objects, then deletes the Auth user through the Admin API.
CREATE OR REPLACE FUNCTION public.delete_account_data_secure(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_room_ids UUID[] := ARRAY[]::UUID[];
  v_room RECORD;
  v_new_host UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Silinecek hesap bulunamadı';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT)::BIGINT);

  SELECT COALESCE(array_agg(DISTINCT r.id), ARRAY[]::UUID[])
  INTO v_room_ids
  FROM public.rooms r
  WHERE r.host_id = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.room_players rp
       WHERE rp.room_id = r.id AND rp.player_id = p_user_id
     );

  PERFORM 1
  FROM public.rooms r
  WHERE r.id = ANY(v_room_ids)
  ORDER BY r.id
  FOR UPDATE;

  PERFORM 1
  FROM public.room_players rp
  WHERE rp.room_id = ANY(v_room_ids)
  ORDER BY rp.room_id, rp.player_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.rooms r
    JOIN public.room_players rp ON rp.room_id = r.id
    WHERE r.id = ANY(v_room_ids)
      AND r.phase <> 'game_over'
      AND rp.player_id = p_user_id
      AND COALESCE(rp.is_active, TRUE)
      AND rp.kicked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Aktif oyunlardan ayrılmadan hesabını silemezsin. Önce tüm odalardan ayrıl.';
  END IF;

  FOR v_room IN
    SELECT r.id, r.host_id
    FROM public.rooms r
    WHERE r.id = ANY(v_room_ids)
    ORDER BY r.id
  LOOP
    IF v_room.host_id = p_user_id THEN
      SELECT rp.player_id
      INTO v_new_host
      FROM public.room_players rp
      WHERE rp.room_id = v_room.id
        AND rp.player_id <> p_user_id
        AND COALESCE(rp.is_active, TRUE)
        AND rp.kicked_at IS NULL
        AND COALESCE(rp.is_bot, FALSE) = FALSE
      ORDER BY rp.joined_at NULLS LAST, rp.player_id
      LIMIT 1;

      IF v_new_host IS NULL THEN
        DELETE FROM public.rooms WHERE id = v_room.id;
      ELSE
        UPDATE public.rooms SET host_id = v_new_host WHERE id = v_room.id;
        UPDATE public.room_players
        SET is_host = (player_id = v_new_host)
        WHERE room_id = v_room.id;
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.round_picks p
  WHERE p.player_id = p_user_id
     OR EXISTS (
       SELECT 1
       FROM public.round_choices c
       WHERE c.room_id = p.room_id
         AND c.round_number = p.round_number
         AND c.choice_index = p.choice_index
         AND c.author_id = p_user_id
     );

  UPDATE public.round_results
  SET picked_text = NULL, deceived_by_author_id = NULL
  WHERE deceived_by_author_id = p_user_id;

  DELETE FROM public.round_results WHERE player_id = p_user_id;
  DELETE FROM public.round_choices WHERE author_id = p_user_id;
  DELETE FROM public.round_fake_answers WHERE player_id = p_user_id;
  DELETE FROM public.round_answers
  WHERE player_id = p_user_id OR zartal_target_id = p_user_id;
  DELETE FROM public.round_suspect_picks
  WHERE player_id = p_user_id OR suspect_player_id = p_user_id;
  DELETE FROM public.ability_actions
  WHERE player_id = p_user_id OR target_id = p_user_id;
  DELETE FROM public.nudges
  WHERE from_id = p_user_id OR to_id = p_user_id;
  DELETE FROM public.gizli_tilki_votes
  WHERE target_player_id = p_user_id;

  DELETE FROM public.forest_treasure_sessions WHERE room_id = ANY(v_room_ids);
  DELETE FROM public.gizli_tilki_sessions WHERE room_id = ANY(v_room_ids);
  DELETE FROM kizilkuyruk_private.sessions WHERE room_id = ANY(v_room_ids);

  DELETE FROM public.room_game_stats WHERE user_id = p_user_id;
  DELETE FROM public.room_invites WHERE created_by = p_user_id;
  DELETE FROM public.question_reservations WHERE user_id = p_user_id;
  DELETE FROM public.question_seen_history WHERE user_id = p_user_id;
  DELETE FROM public.room_join_rate_limits WHERE user_id = p_user_id;
  DELETE FROM public.preset_character_claims WHERE user_id = p_user_id;
  DELETE FROM public.friend_requests
  WHERE sender_id = p_user_id OR recipient_id = p_user_id;
  DELETE FROM public.friendships
  WHERE user_low = p_user_id OR user_high = p_user_id;
  DELETE FROM public.user_blocks
  WHERE blocker_id = p_user_id OR blocked_id = p_user_id;
  DELETE FROM public.user_stats WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  DELETE FROM public.room_players WHERE player_id = p_user_id;

  DELETE FROM public.rooms r
  WHERE r.id = ANY(v_room_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.room_players rp
      WHERE rp.room_id = r.id
        AND COALESCE(rp.is_active, TRUE)
        AND rp.kicked_at IS NULL
        AND COALESCE(rp.is_bot, FALSE) = FALSE
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_account_data_secure(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data_secure(UUID) TO service_role;

COMMENT ON FUNCTION public.delete_account_data_secure(UUID) IS
  'Service-role-only cleanup for a verified user-initiated account deletion. Auth identity and avatar objects are removed by the delete-account Edge Function.';
