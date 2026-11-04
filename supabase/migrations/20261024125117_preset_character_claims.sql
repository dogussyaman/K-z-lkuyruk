-- Reserve each preset guest character to one Supabase identity.
-- The browser can read occupancy keys, while the server atomically claims a character.

CREATE TABLE IF NOT EXISTS public.preset_character_catalog (
    avatar_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL UNIQUE,
    avatar_label TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.preset_character_catalog (avatar_key, display_name, avatar_label)
VALUES
    ('fox', 'Tilki Reis', 'Tilki'),
    ('panda', 'Panda Pati', 'Panda'),
    ('lion', 'Aslan Kral', 'Aslan'),
    ('frog', 'Kurbağa Kıpır', 'Kurbağa'),
    ('unicorn', 'Unicorn Nila', 'Unicorn'),
    ('owl', 'Baykuş Bilge', 'Baykuş'),
    ('tiger', 'Kaplan Pusu', 'Kaplan'),
    ('monkey', 'Maymun Muzo', 'Maymun'),
    ('bear', 'Ayı Badi', 'Ayı'),
    ('rabbit', 'Tavşan Zıpır', 'Tavşan'),
    ('special:photographer', 'Lens Avcısı', 'Fotoğrafçı'),
    ('special:alien', 'Uzaylı Zeno', 'Uzaylı'),
    ('special:pirate', 'Kaptan Kara', 'Korsan'),
    ('special:gorilla', 'Gogo', 'Goril'),
    ('special:gold-woman', 'Altın Diva', 'Altın Kadın'),
    ('special:cute-girl', 'Papatya', 'Sevimli Kız'),
    ('special:boy', 'Mert Vites', 'Genç Çocuk'),
    ('special:anime-girl', 'Hikari', 'Anime Kız'),
    ('special:gold-girl', 'Aurora', 'Parıltılı Kız'),
    ('special:hijab-girl', 'Ayla', 'Tropik Güzel'),
    ('special:purple-woman', 'Violet', 'Mor Kadın'),
    ('special:pink-white-girl', 'Lalin', 'Zarif Kız'),
    ('special:pink-watercolor', 'Pembe Bulut', 'Sulu Boya'),
    ('special:witch', 'Gece Cadısı', 'Cadı'),
    ('special:abstract', 'Soyut Rüya', 'Soyut Rüya'),
    ('special:yellow-blue-girl', 'Maviş', 'Mavi Şapkalı'),
    ('db:lorelei:foxmasque-01', 'Ada', 'Portre'),
    ('db:lorelei:foxmasque-02', 'Alara', 'Portre'),
    ('db:lorelei:foxmasque-03', 'Arya', 'Portre'),
    ('db:lorelei:foxmasque-04', 'Defne', 'Portre'),
    ('db:lorelei:foxmasque-05', 'Duru', 'Portre'),
    ('db:lorelei:foxmasque-06', 'Eylül', 'Portre'),
    ('db:lorelei:foxmasque-07', 'İdil', 'Portre'),
    ('db:lorelei:foxmasque-08', 'Lara', 'Portre'),
    ('db:lorelei:foxmasque-09', 'Luna', 'Portre'),
    ('db:lorelei:foxmasque-10', 'Mina', 'Portre'),
    ('db:lorelei:foxmasque-11', 'Mira', 'Portre'),
    ('db:lorelei:foxmasque-12', 'Narin', 'Portre'),
    ('db:lorelei:foxmasque-13', 'Nova', 'Portre'),
    ('db:lorelei:foxmasque-14', 'Peri', 'Portre'),
    ('db:lorelei:foxmasque-15', 'Rüya', 'Portre'),
    ('db:lorelei:foxmasque-16', 'Vera', 'Portre'),
    ('db:adventurer:foxmasque-01', 'Aras', 'Maceracı'),
    ('db:adventurer:foxmasque-02', 'Atlas', 'Maceracı'),
    ('db:adventurer:foxmasque-03', 'Baran', 'Maceracı'),
    ('db:adventurer:foxmasque-04', 'Bora', 'Maceracı'),
    ('db:adventurer:foxmasque-05', 'Demir', 'Maceracı'),
    ('db:adventurer:foxmasque-06', 'Doruk', 'Maceracı'),
    ('db:adventurer:foxmasque-07', 'Efe', 'Maceracı'),
    ('db:adventurer:foxmasque-08', 'Kaan', 'Maceracı'),
    ('db:adventurer:foxmasque-09', 'Kuzey', 'Maceracı'),
    ('db:adventurer:foxmasque-10', 'Mert', 'Maceracı'),
    ('db:adventurer:foxmasque-11', 'Poyraz', 'Maceracı'),
    ('db:adventurer:foxmasque-12', 'Rüzgar', 'Maceracı'),
    ('db:adventurer:foxmasque-13', 'Sarp', 'Maceracı'),
    ('db:adventurer:foxmasque-14', 'Toprak', 'Maceracı'),
    ('db:adventurer:foxmasque-15', 'Yiğit', 'Maceracı'),
    ('db:adventurer:foxmasque-16', 'Yaman', 'Maceracı'),
    ('db:bottts:foxmasque-01', 'Bitron', 'Robot'),
    ('db:bottts:foxmasque-02', 'Byte', 'Robot'),
    ('db:bottts:foxmasque-03', 'Circuit', 'Robot'),
    ('db:bottts:foxmasque-04', 'Glitch', 'Robot'),
    ('db:bottts:foxmasque-05', 'Hexa', 'Robot'),
    ('db:bottts:foxmasque-06', 'Krom', 'Robot'),
    ('db:bottts:foxmasque-07', 'Metrix', 'Robot'),
    ('db:bottts:foxmasque-08', 'Nano', 'Robot'),
    ('db:bottts:foxmasque-09', 'Neo', 'Robot'),
    ('db:bottts:foxmasque-10', 'Oniks', 'Robot'),
    ('db:bottts:foxmasque-11', 'Pixel', 'Robot'),
    ('db:bottts:foxmasque-12', 'Robo', 'Robot'),
    ('db:bottts:foxmasque-13', 'Tekno', 'Robot'),
    ('db:bottts:foxmasque-14', 'Volt', 'Robot'),
    ('db:bottts:foxmasque-15', 'Zeta', 'Robot'),
    ('db:bottts:foxmasque-16', 'Astro', 'Robot'),
    ('db:fun-emoji:foxmasque-01', 'Badem', 'Emoji'),
    ('db:fun-emoji:foxmasque-02', 'Bonbon', 'Emoji'),
    ('db:fun-emoji:foxmasque-03', 'Bıcır', 'Emoji'),
    ('db:fun-emoji:foxmasque-04', 'Ceviz', 'Emoji'),
    ('db:fun-emoji:foxmasque-05', 'Cingöz', 'Emoji'),
    ('db:fun-emoji:foxmasque-06', 'Fındık', 'Emoji'),
    ('db:fun-emoji:foxmasque-07', 'Fıstık', 'Emoji'),
    ('db:fun-emoji:foxmasque-08', 'Gofret', 'Emoji'),
    ('db:fun-emoji:foxmasque-09', 'Köpük', 'Emoji'),
    ('db:fun-emoji:foxmasque-10', 'Lokum', 'Emoji'),
    ('db:fun-emoji:foxmasque-11', 'Mırmır', 'Emoji'),
    ('db:fun-emoji:foxmasque-12', 'Minnoş', 'Emoji'),
    ('db:fun-emoji:foxmasque-13', 'Pofuduk', 'Emoji'),
    ('db:fun-emoji:foxmasque-14', 'Ponçik', 'Emoji'),
    ('db:fun-emoji:foxmasque-15', 'Pıtırcık', 'Emoji'),
    ('db:fun-emoji:foxmasque-16', 'Tospik', 'Emoji'),
    ('db:fashion:foxmasque-01', 'Alin', 'Moda'),
    ('db:fashion:foxmasque-02', 'Bella', 'Moda'),
    ('db:fashion:foxmasque-03', 'Beren', 'Moda'),
    ('db:fashion:foxmasque-04', 'Coco', 'Moda'),
    ('db:fashion:foxmasque-05', 'Ece', 'Moda'),
    ('db:fashion:foxmasque-06', 'Ela', 'Moda'),
    ('db:fashion:foxmasque-07', 'İnci', 'Moda'),
    ('db:fashion:foxmasque-08', 'Jade', 'Moda'),
    ('db:fashion:foxmasque-09', 'Lola', 'Moda'),
    ('db:fashion:foxmasque-10', 'Melis', 'Moda'),
    ('db:fashion:foxmasque-11', 'Neva', 'Moda'),
    ('db:fashion:foxmasque-12', 'Paris', 'Moda'),
    ('db:fashion:foxmasque-13', 'Roxy', 'Moda'),
    ('db:fashion:foxmasque-14', 'Sera', 'Moda'),
    ('db:fashion:foxmasque-15', 'Stella', 'Moda'),
    ('db:fashion:foxmasque-16', 'Yasmin', 'Moda'),
    ('db:streetwear:foxmasque-01', 'Akım', 'Sokak stili'),
    ('db:streetwear:foxmasque-02', 'Baskı', 'Sokak stili'),
    ('db:streetwear:foxmasque-03', 'Duman', 'Sokak stili'),
    ('db:streetwear:foxmasque-04', 'Frekans', 'Sokak stili'),
    ('db:streetwear:foxmasque-05', 'Flow', 'Sokak stili'),
    ('db:streetwear:foxmasque-06', 'Graffiti', 'Sokak stili'),
    ('db:streetwear:foxmasque-07', 'Hype', 'Sokak stili'),
    ('db:streetwear:foxmasque-08', 'Jet', 'Sokak stili'),
    ('db:streetwear:foxmasque-09', 'Kobra', 'Sokak stili'),
    ('db:streetwear:foxmasque-10', 'Kicks', 'Sokak stili'),
    ('db:streetwear:foxmasque-11', 'Neon', 'Sokak stili'),
    ('db:streetwear:foxmasque-12', 'Rebel', 'Sokak stili'),
    ('db:streetwear:foxmasque-13', 'Riff', 'Sokak stili'),
    ('db:streetwear:foxmasque-14', 'Rota', 'Sokak stili'),
    ('db:streetwear:foxmasque-15', 'Skate', 'Sokak stili'),
    ('db:streetwear:foxmasque-16', 'Vandal', 'Sokak stili')
ON CONFLICT (avatar_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    avatar_label = EXCLUDED.avatar_label,
    enabled = TRUE;

CREATE TABLE IF NOT EXISTS public.preset_character_claims (
    avatar_key TEXT PRIMARY KEY REFERENCES public.preset_character_catalog(avatar_key),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.preset_character_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preset_character_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.preset_character_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.preset_character_claims FROM PUBLIC, anon, authenticated;

-- Only availability keys are exposed. Existing profiles also reserve their
-- selectable avatar, so new players cannot pick an avatar already in use.
CREATE OR REPLACE FUNCTION public.list_taken_preset_characters()
RETURNS TABLE (avatar_key TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT occupied.avatar_key
    FROM (
        SELECT c.avatar_key FROM public.preset_character_claims AS c
        UNION
        SELECT p.avatar_key
        FROM public.profiles AS p
        INNER JOIN public.preset_character_catalog AS cat
            ON cat.avatar_key = p.avatar_key
        WHERE cat.enabled = TRUE
    ) AS occupied;
$$;

REVOKE ALL ON FUNCTION public.list_taken_preset_characters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_taken_preset_characters() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_preset_character_secure(p_avatar_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_character public.preset_character_catalog;
    v_existing public.preset_character_claims;
    v_username_base TEXT;
    v_username TEXT;
    v_inserted INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT * INTO v_existing
    FROM public.preset_character_claims
    WHERE user_id = v_user_id;

    IF FOUND THEN
        IF v_existing.avatar_key = p_avatar_key THEN
            SELECT * INTO v_character
            FROM public.preset_character_catalog
            WHERE avatar_key = v_existing.avatar_key;
            RETURN jsonb_build_object(
                'success', TRUE, 'avatar_key', v_existing.avatar_key,
                'display_name', v_character.display_name, 'username', v_existing.username
            );
        END IF;
        RETURN jsonb_build_object(
            'success', FALSE, 'reason', 'already_claimed', 'avatar_key', v_existing.avatar_key
        );
    END IF;

    SELECT * INTO v_character
    FROM public.preset_character_catalog
    WHERE avatar_key = p_avatar_key AND enabled = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Geçersiz karakter seçimi';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.profiles AS p
        WHERE p.avatar_key = p_avatar_key AND p.id <> v_user_id
    ) THEN
        RETURN jsonb_build_object('success', FALSE, 'reason', 'taken', 'avatar_key', p_avatar_key);
    END IF;

    v_username_base := trim(both '_' from regexp_replace(
        lower(v_character.display_name), '[^a-z0-9]+', '_', 'g'
    ));
    IF v_username_base = '' THEN v_username_base := 'oyuncu'; END IF;
    v_username := left(v_username_base, 18) || '_' ||
                  left(replace(gen_random_uuid()::TEXT, '-', ''), 8);

    INSERT INTO public.preset_character_claims (avatar_key, user_id, username)
    VALUES (p_avatar_key, v_user_id, v_username)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 0 THEN
        -- Network retries are idempotent for the same user and character.
        SELECT * INTO v_existing
        FROM public.preset_character_claims
        WHERE user_id = v_user_id;
        IF FOUND THEN
            IF v_existing.avatar_key = p_avatar_key THEN
                RETURN jsonb_build_object(
                    'success', TRUE, 'avatar_key', v_existing.avatar_key,
                    'display_name', v_character.display_name, 'username', v_existing.username
                );
            END IF;
            RETURN jsonb_build_object(
                'success', FALSE, 'reason', 'already_claimed', 'avatar_key', v_existing.avatar_key
            );
        END IF;
        RETURN jsonb_build_object('success', FALSE, 'reason', 'taken', 'avatar_key', p_avatar_key);
    END IF;

    UPDATE public.profiles
    SET display_name = v_character.display_name,
        avatar_key = v_character.avatar_key,
        avatar_url = NULL,
        updated_at = now()
    WHERE id = v_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Profil oluşturulamadı'; END IF;

    UPDATE auth.users
    SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::JSONB) ||
        jsonb_build_object(
            'name', v_character.display_name,
            'avatarKey', v_character.avatar_key,
            'characterKey', v_character.avatar_key,
            'username', v_username,
            'accountType', 'character'
        )
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', TRUE, 'avatar_key', v_character.avatar_key,
        'display_name', v_character.display_name, 'username', v_username
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_preset_character_secure(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_preset_character_secure(TEXT) TO authenticated;
