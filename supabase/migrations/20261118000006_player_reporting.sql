-- Player reporting for user-generated content moderation.
CREATE TABLE IF NOT EXISTS public.player_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  room_code_snapshot TEXT NOT NULL,
  reporter_name_snapshot TEXT NOT NULL,
  reported_name_snapshot TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('harassment', 'inappropriate_name', 'inappropriate_content', 'cheating', 'spam', 'other')
  ),
  description VARCHAR(500) NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'reviewed', 'dismissed', 'action_taken')
  ),
  moderation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS player_reports_status_created_at_idx
  ON public.player_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS player_reports_reported_player_idx
  ON public.player_reports(reported_player_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS player_reports_one_pending_per_room_idx
  ON public.player_reports(reporter_id, reported_player_id, room_id)
  WHERE status = 'pending'
    AND reporter_id IS NOT NULL
    AND reported_player_id IS NOT NULL
    AND room_id IS NOT NULL;

ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.player_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.player_reports TO service_role;

CREATE OR REPLACE FUNCTION public.report_player_secure(
  p_room_code TEXT,
  p_reported_player_id UUID,
  p_category TEXT,
  p_description TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_reporter_id UUID := auth.uid();
  v_room_id UUID;
  v_reporter_name TEXT;
  v_reported_name TEXT;
  v_is_bot BOOLEAN;
  v_description TEXT := btrim(COALESCE(p_description, ''));
  v_recent_count INTEGER;
  v_report_id UUID;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'Bildirimin gönderilmesi için oturum açmalısın';
  END IF;
  IF p_reported_player_id IS NULL OR p_reported_player_id = v_reporter_id THEN
    RAISE EXCEPTION 'Kendini bildiremezsin';
  END IF;
  IF p_room_code IS NULL OR btrim(p_room_code) = '' THEN
    RAISE EXCEPTION 'Oyun odası bulunamadı';
  END IF;
  IF p_category NOT IN ('harassment', 'inappropriate_name', 'inappropriate_content', 'cheating', 'spam', 'other') THEN
    RAISE EXCEPTION 'Geçersiz bildirim kategorisi';
  END IF;
  IF char_length(v_description) > 500 THEN
    RAISE EXCEPTION 'Açıklama en fazla 500 karakter olabilir';
  END IF;

  SELECT r.id
  INTO v_room_id
  FROM public.rooms r
  WHERE r.code = upper(btrim(p_room_code));
  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Oyun odası bulunamadı';
  END IF;

  SELECT COALESCE(p.display_name, rp.name)
  INTO v_reporter_name
  FROM public.room_players rp
  LEFT JOIN public.profiles p ON p.id = rp.player_id
  WHERE rp.room_id = v_room_id
    AND rp.player_id = v_reporter_id
    AND COALESCE(rp.is_bot, FALSE) = FALSE
  LIMIT 1;
  IF v_reporter_name IS NULL THEN
    RAISE EXCEPTION 'Bu odada bildirim gönderme yetkin yok';
  END IF;

  SELECT COALESCE(p.display_name, rp.name), COALESCE(rp.is_bot, FALSE)
  INTO v_reported_name, v_is_bot
  FROM public.room_players rp
  LEFT JOIN public.profiles p ON p.id = rp.player_id
  WHERE rp.room_id = v_room_id
    AND rp.player_id = p_reported_player_id
  LIMIT 1;
  IF v_reported_name IS NULL THEN
    RAISE EXCEPTION 'Bildirilecek oyuncu bu odada bulunamadı';
  END IF;
  IF v_is_bot THEN
    RAISE EXCEPTION 'Bot oyuncular bildirilemez';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_recent_count
  FROM public.player_reports pr
  WHERE pr.reporter_id = v_reporter_id
    AND pr.created_at >= now() - INTERVAL '1 hour';
  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'Saatlik bildirim sınırına ulaştın. Daha sonra tekrar dene.';
  END IF;

  INSERT INTO public.player_reports (
    reporter_id, reported_player_id, room_id, room_code_snapshot,
    reporter_name_snapshot, reported_name_snapshot, category, description
  )
  VALUES (
    v_reporter_id, p_reported_player_id, v_room_id, upper(btrim(p_room_code)),
    v_reporter_name, v_reported_name, p_category, v_description
  )
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Bu oyuncuyu bu odada zaten bildirdin';
END;
$function$;

REVOKE ALL ON FUNCTION public.report_player_secure(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_player_secure(TEXT, UUID, TEXT, TEXT) TO authenticated;

-- Preserve moderation evidence while removing account identifiers on deletion.
CREATE OR REPLACE FUNCTION public.anonymize_player_reports_before_auth_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  UPDATE public.player_reports
  SET reporter_id = NULL, reporter_name_snapshot = 'Silinmiş kullanıcı'
  WHERE reporter_id = OLD.id;

  UPDATE public.player_reports
  SET reported_player_id = NULL, reported_name_snapshot = 'Silinmiş kullanıcı'
  WHERE reported_player_id = OLD.id;

  UPDATE public.player_reports
  SET reviewed_by = NULL
  WHERE reviewed_by = OLD.id;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS anonymize_player_reports_before_auth_delete ON auth.users;
CREATE TRIGGER anonymize_player_reports_before_auth_delete
BEFORE DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.anonymize_player_reports_before_auth_delete();

REVOKE ALL ON FUNCTION public.anonymize_player_reports_before_auth_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_player_reports_before_auth_delete() TO service_role;

-- Preserve the current room-state payload and expose isBot so the client can
-- hide report actions for test bots. Fail loudly if the expected payload shape
-- changes, rather than silently deploying an incomplete patch.
DO $migration$
DECLARE
  v_definition TEXT;
  v_patched TEXT;
BEGIN
  SELECT pg_get_functiondef('public.get_room_state_secure(character varying)'::regprocedure)
  INTO v_definition;

  IF position('''isBot'',rp.is_bot' IN v_definition) > 0 THEN
    RETURN;
  END IF;

  v_patched := replace(
    v_definition,
    '''isHost'',rp.is_host,''isReady''',
    '''isHost'',rp.is_host,''isBot'',rp.is_bot,''isReady'''
  );

  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'get_room_state_secure player JSON shape changed; add isBot manually';
  END IF;

  EXECUTE v_patched;
END;
$migration$;

COMMENT ON TABLE public.player_reports IS
  'Player-generated content and conduct reports retained for safety moderation; identifiers are anonymized when an account is deleted.';
