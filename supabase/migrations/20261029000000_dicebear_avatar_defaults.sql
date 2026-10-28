ALTER TABLE public.profiles
    ALTER COLUMN avatar_key SET DEFAULT (
        'db:lorelei:' || left(replace(gen_random_uuid()::TEXT, '-', ''), 16)
    );

CREATE OR REPLACE FUNCTION public.create_profile_for_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_name TEXT;
    v_avatar_url TEXT;
    v_avatar_key TEXT;
BEGIN
    v_name := coalesce(
        nullif(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
        nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(NEW.raw_user_meta_data ->> 'preferred_username'), ''),
        'Oyuncu'
    );
    v_avatar_url := coalesce(
        nullif(NEW.raw_user_meta_data ->> 'avatar_url', ''),
        nullif(NEW.raw_user_meta_data ->> 'picture', '')
    );
    v_avatar_key := coalesce(
        nullif(btrim(NEW.raw_user_meta_data ->> 'avatarKey'), ''),
        'db:lorelei:' || left(replace(gen_random_uuid()::TEXT, '-', ''), 16)
    );

    INSERT INTO public.profiles (id, display_name, avatar_key, avatar_url)
    VALUES (
        NEW.id,
        left(v_name, 32),
        left(v_avatar_key, 128),
        CASE WHEN v_avatar_url LIKE 'https://%' THEN v_avatar_url ELSE NULL END
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;
