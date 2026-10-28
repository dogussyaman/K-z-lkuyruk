-- ZARTIX single-run schema for a NEW / EMPTY Supabase project.
-- Run this file once in Supabase SQL Editor. Do not run it on a project that
-- already has these migrations applied; use migrations for existing projects.
-- Built from the source migrations in chronological order. The base enum includes
-- all phases so later ADD VALUE IF NOT EXISTS statements are safe in one execution.

-- -----------------------------------------------------------------------------
-- Included source: supabase\migrations\20261019000001_zartix_schema.sql
-- -----------------------------------------------------------------------------
-- ==============================================================================
-- ZARTIX — Server-Authoritative Database Schema & Security Definer Functions
-- ==============================================================================
-- Designed for secure, cheat-proof multiplayer party game logic.
-- Client NEVER writes directly to scores or validates zartal/abilities.
-- All actions pass through authenticated database functions with RLS enforcement.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE room_phase AS ENUM (
        'lobby',
        'category_select',
        'ability_select',
        'question',
        'submitting',
        'waiting',
        'fake_answer',
        'guess',
        'reveal',
        'scoreboard',
        'game_over'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ability_type AS ENUM ('block', 'shield', 'penalty', 'counter');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. ROOMS TABLE
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(6) UNIQUE NOT NULL,
    host_id UUID NOT NULL,
    phase room_phase NOT NULL DEFAULT 'lobby',
    current_round INT NOT NULL DEFAULT 1,
    total_rounds INT NOT NULL DEFAULT 5,
    round_seconds INT NOT NULL DEFAULT 15,
    selected_categories TEXT[] NOT NULL DEFAULT ARRAY['genel-kultur', 'hayvanlar-alem', 'film-ve-dizi']::TEXT[],
    current_question_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. ROOM PLAYERS TABLE
CREATE TABLE IF NOT EXISTS public.room_players (
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL,
    name VARCHAR(32) NOT NULL,
    avatar_key VARCHAR(32) NOT NULL DEFAULT 'fox',
    is_host BOOLEAN NOT NULL DEFAULT FALSE,
    is_ready BOOLEAN NOT NULL DEFAULT FALSE,
    is_online BOOLEAN NOT NULL DEFAULT TRUE,
    score INT NOT NULL DEFAULT 0,
    ability_uses JSONB NOT NULL DEFAULT '{"block": 0, "shield": 0, "penalty": 0, "counter": 0}'::JSONB,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (room_id, player_id)
);

-- 5. ROUND ANSWERS TABLE (Server-Authoritative)
CREATE TABLE IF NOT EXISTS public.round_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    player_id UUID NOT NULL,
    question_id TEXT NOT NULL,
    selected_index INT NOT NULL,
    zartal_target_id UUID,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(room_id, round_number, player_id)
);

-- 6. ABILITY ACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.ability_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    player_id UUID NOT NULL,
    ability ability_type NOT NULL,
    target_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. ROUND RESULTS LOG
CREATE TABLE IF NOT EXISTS public.round_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    player_id UUID NOT NULL,
    answered_correctly BOOLEAN NOT NULL,
    zartaladın BOOLEAN NOT NULL,
    zartalandın BOOLEAN NOT NULL,
    points_delta INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(room_id, round_number, player_id)
);

-- 8. NUDGES (Realtime broadcast table)
CREATE TABLE IF NOT EXISTS public.nudges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    from_id UUID NOT NULL,
    to_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ability_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;

-- 10. RLS POLICIES
-- Anyone authenticated can read rooms they participate in
CREATE POLICY "Public read open rooms" ON public.rooms
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Read room players" ON public.room_players
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Player submit own answer" ON public.round_answers
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Read round answers after reveal" ON public.round_answers
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Player declare ability" ON public.ability_actions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Read round results" ON public.round_results
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Insert nudge" ON public.nudges
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_id);

CREATE POLICY "Read nudges" ON public.nudges
    FOR SELECT TO authenticated USING (auth.uid() = to_id OR auth.uid() = from_id);

-- 11. SERVER-AUTHORITATIVE RPC: CREATE ROOM
CREATE OR REPLACE FUNCTION public.create_room_secure(
    p_code VARCHAR(6),
    p_name VARCHAR(32),
    p_avatar_key VARCHAR(32),
    p_total_rounds INT,
    p_round_seconds INT,
    p_categories TEXT[]
)
RETURNS TABLE (room_id UUID, room_code VARCHAR(6), host_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    INSERT INTO public.rooms (
        code, host_id, total_rounds, round_seconds, selected_categories, phase
    ) VALUES (
        UPPER(p_code), v_user_id, p_total_rounds, p_round_seconds, p_categories, 'lobby'
    )
    RETURNING id INTO v_room_id;

    INSERT INTO public.room_players (
        room_id, player_id, name, avatar_key, is_host, is_ready, score
    ) VALUES (
        v_room_id, v_user_id, p_name, p_avatar_key, TRUE, TRUE, 0
    );

    RETURN QUERY SELECT v_room_id, UPPER(p_code), v_user_id;
END;
$$;

-- 12. SERVER-AUTHORITATIVE RPC: JOIN ROOM
CREATE OR REPLACE FUNCTION public.join_room_secure(
    p_code VARCHAR(6),
    p_name VARCHAR(32),
    p_avatar_key VARCHAR(32)
)
RETURNS TABLE (room_id UUID, player_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
    v_phase room_phase;
    v_count INT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT id, phase INTO v_room_id, v_phase
    FROM public.rooms
    WHERE code = UPPER(p_code);

    IF v_room_id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    IF v_phase <> 'lobby' THEN
        RAISE EXCEPTION 'Oyun çoktan başladı';
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.room_players WHERE room_id = v_room_id;
    IF v_count >= 10 THEN
        RAISE EXCEPTION 'Oda dolu (Maksimum 10 oyuncu)';
    END IF;

    INSERT INTO public.room_players (
        room_id, player_id, name, avatar_key, is_host, is_ready, score
    ) VALUES (
        v_room_id, v_user_id, p_name, p_avatar_key, FALSE, FALSE, 0
    )
    ON CONFLICT ON CONSTRAINT room_players_pkey DO UPDATE
    SET name = EXCLUDED.name, avatar_key = EXCLUDED.avatar_key, is_online = TRUE;

    RETURN QUERY SELECT v_room_id, v_user_id;
END;
$$;

-- 13. SERVER-AUTHORITATIVE RPC: RESOLVE ROUND & COMPUTE SCORES
CREATE OR REPLACE FUNCTION public.resolve_round_secure(
    p_room_id UUID,
    p_round_number INT,
    p_correct_index INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec RECORD;
    v_target_ans RECORD;
    v_has_shield BOOLEAN;
    v_is_blocked BOOLEAN;
    v_counter_active BOOLEAN;
    v_delta INT;
    v_zartaladın BOOLEAN;
    v_zartalandın BOOLEAN;
    v_correct BOOLEAN;
BEGIN
    -- Only the room host can trigger round resolution
    IF NOT EXISTS (
        SELECT 1 FROM public.rooms WHERE id = p_room_id AND host_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Yalnızca oda kurucusu tur sonucunu onaylayabilir';
    END IF;

    FOR rec IN
        SELECT
            p.player_id,
            a.selected_index,
            a.zartal_target_id
        FROM public.room_players p
        LEFT JOIN public.round_answers a
            ON a.room_id = p_room_id
           AND a.round_number = p_round_number
           AND a.player_id = p.player_id
        WHERE p.room_id = p_room_id
    LOOP
        v_correct := (rec.selected_index IS NOT NULL AND rec.selected_index = p_correct_index);
        v_zartaladın := FALSE;
        v_zartalandın := FALSE;
        v_delta := 0;

        IF v_correct THEN
            v_delta := v_delta + 100; -- DOĞRU BİLDİN (+100)
        END IF;

        -- Check Zartal attempt by this player
        IF rec.zartal_target_id IS NOT NULL AND v_correct THEN
            -- Check defender's answer & defenses
            SELECT selected_index INTO v_target_ans
            FROM public.round_answers
            WHERE room_id = p_room_id AND round_number = p_round_number AND player_id = rec.zartal_target_id;

            SELECT EXISTS(
                SELECT 1 FROM public.ability_actions
                WHERE room_id = p_room_id AND round_number = p_round_number
                  AND player_id = rec.zartal_target_id AND ability = 'shield'
            ) INTO v_has_shield;

            SELECT EXISTS(
                SELECT 1 FROM public.ability_actions
                WHERE room_id = p_room_id AND round_number = p_round_number
                  AND player_id = rec.zartal_target_id AND ability = 'block'
                  AND target_id = rec.player_id
            ) INTO v_is_blocked;

            -- Target wrong and not protected
            IF (v_target_ans.selected_index IS NULL OR v_target_ans.selected_index <> p_correct_index)
               AND NOT v_has_shield AND NOT v_is_blocked THEN
                v_zartaladın := TRUE;
                v_delta := v_delta + 50; -- ZARTALADIN (+50)
            END IF;
        END IF;

        -- Check if someone successfully zartaled this player
        SELECT EXISTS (
            SELECT 1
            FROM public.round_answers attacker_ans
            JOIN public.ability_actions act ON TRUE
            WHERE attacker_ans.room_id = p_room_id
              AND attacker_ans.round_number = p_round_number
              AND attacker_ans.zartal_target_id = rec.player_id
              AND attacker_ans.selected_index = p_correct_index
              AND NOT v_correct
              AND NOT EXISTS (
                  SELECT 1 FROM public.ability_actions
                  WHERE room_id = p_room_id AND round_number = p_round_number
                    AND player_id = rec.player_id AND ability = 'shield'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.ability_actions
                  WHERE room_id = p_room_id AND round_number = p_round_number
                    AND player_id = rec.player_id AND ability = 'block'
                    AND target_id = attacker_ans.player_id
              )
        ) INTO v_zartalandın;

        IF v_zartalandın THEN
            v_delta := v_delta - 40; -- ZARTALANDIN (-40)
        END IF;

        -- Record result
        INSERT INTO public.round_results (
            room_id, round_number, player_id, answered_correctly, zartaladın, zartalandın, points_delta
        ) VALUES (
            p_room_id, p_round_number, rec.player_id, v_correct, v_zartaladın, v_zartalandın, v_delta
        )
        ON CONFLICT (room_id, round_number, player_id) DO UPDATE
        SET points_delta = EXCLUDED.points_delta;

        -- Update cumulative player score (minimum 0)
        UPDATE public.room_players
        SET score = GREATEST(0, score + v_delta)
        WHERE room_id = p_room_id AND player_id = rec.player_id;
    END LOOP;

    -- Update room phase to reveal
    UPDATE public.rooms
    SET phase = 'reveal', updated_at = timezone('utc'::text, now())
    WHERE id = p_room_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- Included source: supabase\migrations\20261020000001_zarto_bluff_engine.sql
-- -----------------------------------------------------------------------------
-- ==============================================================================
-- ZARTO — Server-Authoritative Bluff & Party Game Migration
-- ==============================================================================

-- 1. Extend room_phase enum if needed
DO $$ BEGIN
    ALTER TYPE room_phase ADD VALUE IF NOT EXISTS 'fake_answer';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE room_phase ADD VALUE IF NOT EXISTS 'guess';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. QUESTIONS TABLE (Authoritative question & correct answer repository)
CREATE TABLE IF NOT EXISTS public.questions (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    default_decoys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    explanation TEXT NOT NULL DEFAULT ''
);

-- Seed authoritative questions
INSERT INTO public.questions (id, category_id, prompt, correct_answer, default_decoys, explanation)
VALUES
    ('gk-1', 'genel-kultur', 'Türkiye Cumhuriyeti hangi yıl ilan edildi?', '1923', ARRAY['1920', '1925', '1930'], '29 Ekim 1923’te Cumhuriyet ilan edildi.'),
    ('gk-2', 'genel-kultur', 'Dünya’nın en büyük okyanusu hangisidir?', 'Büyük Okyanus', ARRAY['Atlas Okyanusu', 'Hint Okyanusu', 'Arktik Okyanus'], 'Büyük (Pasifik) Okyanusu en büyük okyanustur.'),
    ('gk-3', 'genel-kultur', 'İnsan vücudunda kaç kemik bulunur?', '206', ARRAY['196', '216', '226'], 'Yetişkin bir insanda 206 kemik vardır.'),
    ('gk-4', 'genel-kultur', '“Suç ve Ceza” romanının yazarı kimdir?', 'Dostoyevski', ARRAY['Tolstoy', 'Çehov', 'Gogol'], 'Fyodor Dostoyevski tarafından yazılmıştır.'),
    ('gk-5', 'genel-kultur', 'Işık hızı yaklaşık olarak nedir?', '300.000 km/s', ARRAY['150.000 km/s', '30.000 km/s', '1.000.000 km/s'], 'Işık boşlukta ~300.000 km/s hızla yayılır.'),

    ('hy-1', 'hayvanlar-alem', 'Bir grup flamingoya ne denir?', 'Flamboyans', ARRAY['Sürü', 'Koloni', 'Yığın'], 'Flamingo topluluklarına “flamboyans” denir.'),
    ('hy-2', 'hayvanlar-alem', 'Pandaların dil rengi nedir?', 'Pembe', ARRAY['Mavi', 'Mor', 'Yeşil'], 'Pandanın dili pembemsi kırmızıdır.'),
    ('hy-3', 'hayvanlar-alem', 'Bir salyangoz kaç dişe sahip olabilir?', 'Yaklaşık 25.000', ARRAY['Hiç dişi yoktur', 'Yaklaşık 100', 'Yaklaşık 10.000'], 'Bazı salyangoz türlerinde ~25.000 diş bulunur.'),
    ('hy-4', 'hayvanlar-alem', 'Hangi hayvan parmak izine sahiptir?', 'Koala', ARRAY['Maymun', 'Kanguru', 'Timsah'], 'Koalaların parmak izi insanlarınkine çok benzer.'),
    ('hy-5', 'hayvanlar-alem', 'Balina hangi canlı sınıfına aittir?', 'Memeli', ARRAY['Balık', 'Sürüngen', 'Amfibi'], 'Balinalar memeli hayvanlardır.'),

    ('md-1', 'moda-ve-stil', '“Louboutin” markasının ikonik özelliği nedir?', 'Kırmızı taban', ARRAY['Mavi logo', 'Altın çıt', 'Yeşil kurdele'], 'Christian Louboutin ayakkabıları kırmızı tabanıyla tanınır.'),
    ('md-2', 'moda-ve-stil', '“Bikini” adını hangisinden alır?', 'Bir ada', ARRAY['Bir çiçek', 'Bir şarkıcı', 'Bir İtalyan şehri'], 'Bikini Atolü’ndeki nükleer testlere atıfla adlandırılmıştır.'),
    ('md-3', 'moda-ve-stil', 'Hangisi klasik bir düğün elbisesi kesimidir?', 'A-line', ARRAY['Sahara', 'Bolero', 'Trench'], 'A-line, klasik gelinlik kesimlerinden biridir.'),
    ('md-4', 'moda-ve-stil', '“Haute Couture” ne demektir?', 'El yapımı yüksek terzilik', ARRAY['Hazır giyim', 'Sokak modası', 'İkinci el'], 'Fransızcada “yüksek terzilik” anlamına gelir.'),
    ('md-5', 'moda-ve-stil', 'Gucci hangi ülkede kuruldu?', 'İtalya', ARRAY['Fransa', 'ABD', 'İngiltere'], 'Gucci, 1921’de Floransa’da kuruldu.'),

    ('fm-1', 'film-ve-dizi', '“Parazit” (Parasite) hangi ülkenin filmidir?', 'Güney Kore', ARRAY['Japonya', 'Çin', 'Tayvan'], 'Bong Joon-ho’nun Güney Kore filmidir.'),
    ('fm-2', 'film-ve-dizi', '“Breaking Bad” hangi karakterin etrafında döner?', 'Walter White', ARRAY['Don Draper', 'Rick Grimes', 'Marty Byrde'], 'Walter White’ın dönüşümünü anlatır.'),
    ('fm-3', 'film-ve-dizi', '“Yüzüklerin Efendisi” hangi yazardan uyarlanmıştır?', 'J.R.R. Tolkien', ARRAY['C.S. Lewis', 'George R.R. Martin', 'Brandon Sanderson'], 'J.R.R. Tolkien’in eserinden uyarlanmıştır.'),
    ('fm-4', 'film-ve-dizi', '“La La Land” müzikalinde başrol kadın oyuncu kimdir?', 'Emma Stone', ARRAY['Natalie Portman', 'Anne Hathaway', 'Scarlett Johansson'], 'Emma Stone Mia rolünü oynamıştır.'),
    ('fm-5', 'film-ve-dizi', '“Dark” dizisi hangi ülkede geçer?', 'Almanya', ARRAY['Avusturya', 'Danimarka', 'İsveç'], 'Alman yapımı bir bilim kurgu dizisidir.'),

    ('mz-1', 'muzik', 'Tarkan’ın “Şımarık” şarkısı hangi yılda büyük hit oldu?', '1997', ARRAY['1995', '2001', '2003'], '1997’de dünya çapında popüler oldu.'),
    ('mz-2', 'muzik', 'Beatles’ın kaç üyesi vardı?', '4', ARRAY['3', '5', '6'], 'John, Paul, George ve Ringo olmak üzere 4 üye.'),
    ('mz-3', 'muzik', 'Standart bir piyanoda kaç tuş vardır?', '88', ARRAY['76', '96', '100'], 'Standart piyanoda 88 tuş bulunur.'),
    ('mz-4', 'muzik', '“Billie Jean” hangi sanatçıya aittir?', 'Michael Jackson', ARRAY['Prince', 'Madonna', 'David Bowie'], 'Michael Jackson’ın ikonik şarkısıdır.'),
    ('mz-5', 'muzik', 'Eurovision 2003’ü kim kazandı?', 'Sertab Erener', ARRAY['Marina', 'Helena Paparizou', 'Loreen'], 'Sertab Erener “Everyway That I Can” ile kazandı.'),

    ('yk-1', 'yemek-ve-lezzet', '“Mantı” hangi mutfağın özgün yemeği kabul edilir?', 'Türk', ARRAY['Çin', 'Meksika', 'Fransız'], 'Mantı Türk mutfağının sevilen yemeklerinden biridir.'),
    ('yk-2', 'yemek-ve-lezzet', 'İtalyan “risotto” hangi pirinçle yapılır?', 'Arborio', ARRAY['Basmati', 'Jasmine', 'Kırık'], 'Arborio pirinci kremamsı dokusuyla bilinir.'),
    ('yk-3', 'yemek-ve-lezzet', '“Sushi” temelde hangi ana malzeme bazında hazırlanır?', 'Pirinç', ARRAY['Noodle', 'Lavaş', 'Peynir'], 'Sushi sirke aromalı pirinç temelinde yapılır.'),
    ('yk-4', 'yemek-ve-lezzet', 'Türk kahvesinin UNESCO listesine alınma yılı?', '2013', ARRAY['2010', '2015', '2018'], '2013’te UNESCO kültürel miras listesine alındı.'),
    ('yk-5', 'yemek-ve-lezzet', 'Klasik baklava hamuru kaç kat açılır?', '40-50', ARRAY['10-20', '20-30', '60-70'], 'Klasik baklavada 40-50 kat yufka bulunur.')
ON CONFLICT (id) DO UPDATE SET
    prompt = EXCLUDED.prompt,
    correct_answer = EXCLUDED.correct_answer,
    default_decoys = EXCLUDED.default_decoys,
    explanation = EXCLUDED.explanation;

-- 3. EXTEND ROOM PLAYERS FOR ZARTO ABILITY COUNTERS
ALTER TABLE public.room_players
    ADD COLUMN IF NOT EXISTS consecutive_correct INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shields_available INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS blocks_available INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_blocked_current_round BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_blocked_next_round BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS last_blocked_player_id UUID DEFAULT NULL;

-- 4. ROUND FAKE ANSWERS (Players submit convincing fake answers)
CREATE TABLE IF NOT EXISTS public.round_fake_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    player_id UUID NOT NULL,
    fake_answer TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(room_id, round_number, player_id)
);

-- 5. ROUND CHOICES (The blended options: true answer + all fake answers)
CREATE TABLE IF NOT EXISTS public.round_choices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    choice_index INT NOT NULL,
    text TEXT NOT NULL,
    author_id UUID DEFAULT NULL, -- NULL if real answer or system decoy
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(room_id, round_number, choice_index)
);

-- 6. ROUND PICKS (Players pick which choice they think is the real answer)
CREATE TABLE IF NOT EXISTS public.round_picks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    player_id UUID NOT NULL,
    choice_index INT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(room_id, round_number, player_id)
);

-- 7. EXTEND ROUND RESULTS FOR BLUFF BREAKDOWN
ALTER TABLE public.round_results
    ADD COLUMN IF NOT EXISTS victims_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deceived_by_author_id UUID DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS picked_text TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS own_fake_text TEXT DEFAULT NULL;

-- 8. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_fake_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_picks ENABLE ROW LEVEL SECURITY;

-- Questions can be read by authenticated users, but never updated by clients
DROP POLICY IF EXISTS "Public read questions" ON public.questions;
CREATE POLICY "Public read questions" ON public.questions
    FOR SELECT TO authenticated USING (true);

-- SECURE FAKE ANSWERS: Player can only read and write their OWN fake answer until reveal!
DROP POLICY IF EXISTS "Player submit own fake answer" ON public.round_fake_answers;
CREATE POLICY "Player submit own fake answer" ON public.round_fake_answers
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "Player read own fake answer before reveal" ON public.round_fake_answers;
CREATE POLICY "Player read own fake answer before reveal" ON public.round_fake_answers
    FOR SELECT TO authenticated USING (
        auth.uid() = player_id OR
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = round_fake_answers.room_id
              AND r.phase IN ('reveal', 'scoreboard', 'game_over')
        )
    );

-- SECURE ROUND CHOICES: Can only select via RPC or after reveal
DROP POLICY IF EXISTS "Read round choices" ON public.round_choices;
CREATE POLICY "Read round choices" ON public.round_choices
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = round_choices.room_id
              AND r.phase IN ('reveal', 'scoreboard', 'game_over')
        )
    );

-- SECURE PICKS: Player can insert and read their own pick
DROP POLICY IF EXISTS "Player submit own pick" ON public.round_picks;
CREATE POLICY "Player submit own pick" ON public.round_picks
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "Player read picks after reveal" ON public.round_picks;
CREATE POLICY "Player read picks after reveal" ON public.round_picks
    FOR SELECT TO authenticated USING (
        auth.uid() = player_id OR
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = round_picks.room_id
              AND r.phase IN ('reveal', 'scoreboard', 'game_over')
        )
    );

-- Fix old round_answers RLS leak
DROP POLICY IF EXISTS "Read round answers after reveal" ON public.round_answers;
CREATE POLICY "Read round answers after reveal" ON public.round_answers
    FOR SELECT TO authenticated USING (
        auth.uid() = player_id OR
        EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = round_answers.room_id
              AND r.phase IN ('reveal', 'scoreboard', 'game_over')
        )
    );

-- 9. REALTIME PUBLICATION
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.round_results;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nudges;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 10. SERVER-AUTHORITATIVE RPC FUNCTIONS
-- ==============================================================================

-- RPC: Set player ready status
CREATE OR REPLACE FUNCTION public.set_player_ready_secure(
    p_room_code VARCHAR(6),
    p_ready BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT id INTO v_room_id FROM public.rooms WHERE code = UPPER(p_room_code);
    IF v_room_id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    UPDATE public.room_players
    SET is_ready = p_ready
    WHERE room_id = v_room_id AND player_id = v_user_id;
END;
$$;

-- RPC: Start game (Host only)
CREATE OR REPLACE FUNCTION public.start_game_secure(
    p_room_code VARCHAR(6)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room RECORD;
    v_ready_count INT;
    v_first_q_id TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code);
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    IF v_room.host_id <> v_user_id THEN
        RAISE EXCEPTION 'Yalnızca oda kurucusu oyunu başlatabilir';
    END IF;

    SELECT COUNT(*) INTO v_ready_count
    FROM public.room_players
    WHERE room_id = v_room.id AND is_ready = TRUE;

    IF v_ready_count < 2 THEN
        RAISE EXCEPTION 'Oyunu başlatmak için en az 2 oyuncu hazır olmalıdır';
    END IF;

    -- Pick first question from selected categories
    SELECT id INTO v_first_q_id
    FROM public.questions
    WHERE category_id = ANY(v_room.selected_categories)
    ORDER BY random()
    LIMIT 1;

    -- Reset round states and set phase to ability_select
    UPDATE public.room_players
    SET score = 0,
        consecutive_correct = 0,
        shields_available = 0,
        blocks_available = 0,
        is_blocked_current_round = FALSE,
        is_blocked_next_round = FALSE,
        last_blocked_player_id = NULL
    WHERE room_id = v_room.id;

    UPDATE public.rooms
    SET phase = 'ability_select',
        current_round = 1,
        current_question_id = v_first_q_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_room.id;
END;
$$;

-- RPC: Use Ability
CREATE OR REPLACE FUNCTION public.use_ability_secure(
    p_room_code VARCHAR(6),
    p_ability ability_type,
    p_target_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room RECORD;
    v_player RECORD;
    v_target RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code);
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    SELECT * INTO v_player FROM public.room_players WHERE room_id = v_room.id AND player_id = v_user_id;
    IF v_player.player_id IS NULL THEN
        RAISE EXCEPTION 'Oda üyesi değilsiniz';
    END IF;

    IF v_player.is_blocked_current_round THEN
        RAISE EXCEPTION 'Bu tur bloklandığınız için yetenek kullanamazsınız';
    END IF;

    IF p_ability = 'block' THEN
        IF p_target_id IS NULL OR p_target_id = v_user_id THEN
            RAISE EXCEPTION 'Bloklamak için geçerli bir rakip seçmelisiniz';
        END IF;
        IF v_player.blocks_available <= 0 THEN
            RAISE EXCEPTION 'Bloklama hakkınız bulunmuyor';
        END IF;
        IF v_player.last_blocked_player_id = p_target_id THEN
            RAISE EXCEPTION 'Aynı oyuncuyu art arda iki tur bloklayamazsınız';
        END IF;

        -- Record action
        INSERT INTO public.ability_actions (room_id, round_number, player_id, ability, target_id)
        VALUES (v_room.id, v_room.current_round, v_user_id, p_ability, p_target_id);

        UPDATE public.room_players
        SET blocks_available = blocks_available - 1,
            last_blocked_player_id = p_target_id
        WHERE room_id = v_room.id AND player_id = v_user_id;

    ELSIF p_ability = 'shield' THEN
        IF v_player.shields_available <= 0 THEN
            RAISE EXCEPTION 'Kalkan hakkınız bulunmuyor';
        END IF;

        INSERT INTO public.ability_actions (room_id, round_number, player_id, ability, target_id)
        VALUES (v_room.id, v_room.current_round, v_user_id, p_ability, NULL);

        UPDATE public.room_players
        SET shields_available = shields_available - 1
        WHERE room_id = v_room.id AND player_id = v_user_id;

    ELSE
        -- Other ability types (penalty / counter)
        INSERT INTO public.ability_actions (room_id, round_number, player_id, ability, target_id)
        VALUES (v_room.id, v_room.current_round, v_user_id, p_ability, p_target_id);
    END IF;
END;
$$;

-- RPC: Submit Fake Answer
CREATE OR REPLACE FUNCTION public.submit_fake_answer_secure(
    p_room_code VARCHAR(6),
    p_fake_answer TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room RECORD;
    v_player RECORD;
    v_trimmed TEXT := TRIM(p_fake_answer);
    v_active_players_count INT;
    v_submitted_count INT;
    v_q RECORD;
    v_rec RECORD;
    v_idx INT := 0;
    v_opt_arr TEXT[] := ARRAY[]::TEXT[];
    v_authors_arr UUID[] := ARRAY[]::UUID[];
    v_correct_arr BOOLEAN[] := ARRAY[]::BOOLEAN[];
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    IF LENGTH(v_trimmed) < 1 THEN
        RAISE EXCEPTION 'Sahte cevap boş olamaz';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code);
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    SELECT * INTO v_player FROM public.room_players WHERE room_id = v_room.id AND player_id = v_user_id;
    IF v_player.player_id IS NULL THEN
        RAISE EXCEPTION 'Oda üyesi değilsiniz';
    END IF;

    IF v_player.is_blocked_current_round THEN
        RAISE EXCEPTION 'Bu tur bloklandınız, cevap veremezsiniz';
    END IF;

    -- Insert or update fake answer
    INSERT INTO public.round_fake_answers (room_id, round_number, player_id, fake_answer)
    VALUES (v_room.id, v_room.current_round, v_user_id, v_trimmed)
    ON CONFLICT (room_id, round_number, player_id)
    DO UPDATE SET fake_answer = EXCLUDED.fake_answer;

    -- Count active unblocked players
    SELECT COUNT(*) INTO v_active_players_count
    FROM public.room_players
    WHERE room_id = v_room.id AND is_online = TRUE AND is_blocked_current_round = FALSE;

    SELECT COUNT(*) INTO v_submitted_count
    FROM public.round_fake_answers
    WHERE room_id = v_room.id AND round_number = v_room.current_round;

    -- If all active unblocked players submitted, generate choices and transition to 'guess'
    IF v_submitted_count >= v_active_players_count THEN
        SELECT * INTO v_q FROM public.questions WHERE id = v_room.current_question_id;

        -- Clear existing choices for this round if any
        DELETE FROM public.round_choices WHERE room_id = v_room.id AND round_number = v_room.current_round;

        -- Collect real answer + fake answers
        CREATE TEMP TABLE temp_blended_choices (
            choice_text TEXT,
            author_id UUID,
            is_correct BOOLEAN
        ) ON COMMIT DROP;

        INSERT INTO temp_blended_choices (choice_text, author_id, is_correct)
        VALUES (v_q.correct_answer, NULL, TRUE);

        FOR v_rec IN
            SELECT fake_answer, player_id FROM public.round_fake_answers
            WHERE room_id = v_room.id AND round_number = v_room.current_round
        LOOP
            INSERT INTO temp_blended_choices (choice_text, author_id, is_correct)
            VALUES (v_rec.fake_answer, v_rec.player_id, FALSE);
        END LOOP;

        -- If fewer than 4 choices, supplement with default decoys from the question
        IF (SELECT COUNT(*) FROM temp_blended_choices) < 4 AND v_q.default_decoys IS NOT NULL THEN
            FOR i IN 1..array_length(v_q.default_decoys, 1) LOOP
                IF (SELECT COUNT(*) FROM temp_blended_choices) < 4 THEN
                    INSERT INTO temp_blended_choices (choice_text, author_id, is_correct)
                    VALUES (v_q.default_decoys[i], NULL, FALSE);
                END IF;
            END LOOP;
        END IF;

        -- Insert in random order into round_choices
        v_idx := 0;
        FOR v_rec IN
            SELECT * FROM temp_blended_choices ORDER BY random()
        LOOP
            INSERT INTO public.round_choices (room_id, round_number, choice_index, text, author_id, is_correct)
            VALUES (v_room.id, v_room.current_round, v_idx, v_rec.choice_text, v_rec.author_id, v_rec.is_correct);
            v_idx := v_idx + 1;
        END LOOP;

        -- Transition phase to 'guess'
        UPDATE public.rooms
        SET phase = 'guess', updated_at = timezone('utc'::text, now())
        WHERE id = v_room.id;
    END IF;
END;
$$;

-- RPC: Get choices safely for the calling player
-- (Hides which is real, hides authors, flags whether it's caller's own fake so client can disable it)
CREATE OR REPLACE FUNCTION public.get_round_choices_secure(
    p_room_code VARCHAR(6)
)
RETURNS TABLE (
    choice_index INT,
    choice_text TEXT,
    is_own_fake BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code);
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    RETURN QUERY
    SELECT
        c.choice_index,
        c.text,
        (c.author_id IS NOT NULL AND c.author_id = v_user_id) AS is_own_fake
    FROM public.round_choices c
    WHERE c.room_id = v_room.id AND c.round_number = v_room.current_round
    ORDER BY c.choice_index ASC;
END;
$$;

-- RPC: Submit Choice / Guess
CREATE OR REPLACE FUNCTION public.submit_pick_secure(
    p_room_code VARCHAR(6),
    p_choice_index INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room RECORD;
    v_player RECORD;
    v_choice RECORD;
    v_active_players_count INT;
    v_picks_count INT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code);
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    SELECT * INTO v_player FROM public.room_players WHERE room_id = v_room.id AND player_id = v_user_id;
    IF v_player.player_id IS NULL THEN
        RAISE EXCEPTION 'Oda üyesi değilsiniz';
    END IF;

    IF v_player.is_blocked_current_round THEN
        RAISE EXCEPTION 'Bu tur bloklandınız, tahmin yapamazsınız';
    END IF;

    -- Verify choice exists
    SELECT * INTO v_choice
    FROM public.round_choices
    WHERE room_id = v_room.id AND round_number = v_room.current_round AND choice_index = p_choice_index;

    IF v_choice.id IS NULL THEN
        RAISE EXCEPTION 'Geçersiz seçenek';
    END IF;

    -- Enforce rule: CANNOT pick your own fake answer!
    IF v_choice.author_id IS NOT NULL AND v_choice.author_id = v_user_id THEN
        RAISE EXCEPTION 'Kendi yazdığınız sahte cevabı seçemezsiniz!';
    END IF;

    -- Save pick
    INSERT INTO public.round_picks (room_id, round_number, player_id, choice_index)
    VALUES (v_room.id, v_room.current_round, v_user_id, p_choice_index)
    ON CONFLICT (room_id, round_number, player_id)
    DO UPDATE SET choice_index = EXCLUDED.choice_index;

    -- Check if all active players submitted picks
    SELECT COUNT(*) INTO v_active_players_count
    FROM public.room_players
    WHERE room_id = v_room.id AND is_online = TRUE AND is_blocked_current_round = FALSE;

    SELECT COUNT(*) INTO v_picks_count
    FROM public.round_picks
    WHERE room_id = v_room.id AND round_number = v_room.current_round;

    IF v_picks_count >= v_active_players_count THEN
        -- Auto-resolve round
        PERFORM public.resolve_round_authoritative(v_room.id, v_room.current_round);
    END IF;
END;
$$;

-- RPC: Authoritative Round Resolution & Scoring
CREATE OR REPLACE FUNCTION public.resolve_round_authoritative(
    p_room_id UUID,
    p_round_number INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_room RECORD;
    v_player RECORD;
    v_pick RECORD;
    v_chosen_choice RECORD;
    v_own_fake RECORD;
    v_correct BOOLEAN;
    v_victims_count INT;
    v_deceived BOOLEAN;
    v_deceived_author_id UUID;
    v_delta INT;
    v_total_rivals INT;
    v_has_shield BOOLEAN;
    v_has_block_action BOOLEAN;
    v_target_blocked BOOLEAN;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    -- Active opponents count (for 50% trick threshold)
    SELECT COUNT(*) - 1 INTO v_total_rivals
    FROM public.room_players
    WHERE room_id = p_room_id AND is_online = TRUE;
    IF v_total_rivals < 1 THEN v_total_rivals := 1; END IF;

    FOR v_player IN
        SELECT * FROM public.room_players WHERE room_id = p_room_id
    LOOP
        v_delta := 0;
        v_correct := FALSE;
        v_deceived := FALSE;
        v_deceived_author_id := NULL;
        v_victims_count := 0;

        -- If player was blocked this round, they score 0 and reset block
        IF v_player.is_blocked_current_round THEN
            INSERT INTO public.round_results (
                room_id, round_number, player_id, answered_correctly,
                zartaladın, zartalandın, points_delta, victims_count,
                deceived_by_author_id, picked_text, own_fake_text
            ) VALUES (
                p_room_id, p_round_number, v_player.player_id, FALSE,
                FALSE, FALSE, 0, 0, NULL, 'BLOKLANDI', NULL
            )
            ON CONFLICT (room_id, round_number, player_id) DO NOTHING;
            CONTINUE;
        END IF;

        -- 1. Check player's pick
        SELECT c.* INTO v_chosen_choice
        FROM public.round_picks p
        JOIN public.round_choices c
            ON c.room_id = p.room_id AND c.round_number = p.round_number AND c.choice_index = p.choice_index
        WHERE p.room_id = p_room_id AND p.round_number = p_round_number AND p.player_id = v_player.player_id;

        IF v_chosen_choice.id IS NOT NULL THEN
            IF v_chosen_choice.is_correct THEN
                v_correct := TRUE;
                v_delta := v_delta + 100; -- DOĞRU BİLDİN (+100)
            ELSIF v_chosen_choice.author_id IS NOT NULL AND v_chosen_choice.author_id <> v_player.player_id THEN
                -- Player picked a rival's fake answer -> ZARTALANDIN (-40)
                v_deceived := TRUE;
                v_deceived_author_id := v_chosen_choice.author_id;
                v_delta := v_delta - 40;
            END IF;
        END IF;

        -- 2. Count how many rivals picked this player's fake answer -> ZARTALADIN (+50 per victim)
        SELECT COUNT(*) INTO v_victims_count
        FROM public.round_picks p
        JOIN public.round_choices c
            ON c.room_id = p.room_id AND c.round_number = p.round_number AND c.choice_index = p.choice_index
        WHERE p.room_id = p_room_id
          AND p.round_number = p_round_number
          AND c.author_id = v_player.player_id
          AND p.player_id <> v_player.player_id;

        IF v_victims_count > 0 THEN
            v_delta := v_delta + (v_victims_count * 50);
        END IF;

        -- 3. Check Ability Unlocks & Stat Progression
        -- Consecutive correct: 3 in a row unlocks a Shield
        IF v_correct THEN
            UPDATE public.room_players
            SET consecutive_correct = consecutive_correct + 1
            WHERE room_id = p_room_id AND player_id = v_player.player_id;

            IF (v_player.consecutive_correct + 1) >= 3 THEN
                UPDATE public.room_players
                SET shields_available = shields_available + 1,
                    consecutive_correct = 0
                WHERE room_id = p_room_id AND player_id = v_player.player_id;
            END IF;
        ELSE
            UPDATE public.room_players
            SET consecutive_correct = 0
            WHERE room_id = p_room_id AND player_id = v_player.player_id;
        END IF;

        -- Tricking rivals: At least 3 rivals OR > 50% of active opponents unlocks a Block
        IF v_victims_count >= 3 OR (v_victims_count::FLOAT / v_total_rivals::FLOAT > 0.5) THEN
            UPDATE public.room_players
            SET blocks_available = blocks_available + 1
            WHERE room_id = p_room_id AND player_id = v_player.player_id;
        END IF;

        -- Get player's fake answer text for review
        SELECT fake_answer INTO v_own_fake
        FROM public.round_fake_answers
        WHERE room_id = p_room_id AND round_number = p_round_number AND player_id = v_player.player_id;

        -- Record round results log
        INSERT INTO public.round_results (
            room_id, round_number, player_id, answered_correctly,
            zartaladın, zartalandın, points_delta, victims_count,
            deceived_by_author_id, picked_text, own_fake_text
        ) VALUES (
            p_room_id, p_round_number, v_player.player_id, v_correct,
            (v_victims_count > 0), v_deceived, v_delta, v_victims_count,
            v_deceived_author_id, v_chosen_choice.text, v_own_fake.fake_answer
        )
        ON CONFLICT (room_id, round_number, player_id) DO UPDATE SET
            answered_correctly = EXCLUDED.answered_correctly,
            zartaladın = EXCLUDED.zartaladın,
            zartalandın = EXCLUDED.zartalandın,
            points_delta = EXCLUDED.points_delta,
            victims_count = EXCLUDED.victims_count;

        -- Update cumulative score (minimum 0)
        UPDATE public.room_players
        SET score = GREATEST(0, score + v_delta)
        WHERE room_id = p_room_id AND player_id = v_player.player_id;
    END LOOP;

    -- Update room phase to 'reveal'
    UPDATE public.rooms
    SET phase = 'reveal', updated_at = timezone('utc'::text, now())
    WHERE id = p_room_id;
END;
$$;

-- RPC: Advance Phase / Next Round (Host only or auto)
CREATE OR REPLACE FUNCTION public.advance_round_secure(
    p_room_code VARCHAR(6)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room RECORD;
    v_next_q_id TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code);
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    IF v_room.host_id <> v_user_id THEN
        RAISE EXCEPTION 'Yalnızca oda kurucusu turu ilerletebilir';
    END IF;

    IF v_room.phase = 'ability_select' THEN
        UPDATE public.rooms SET phase = 'fake_answer', updated_at = timezone('utc'::text, now()) WHERE id = v_room.id;

    ELSIF v_room.phase = 'reveal' THEN
        UPDATE public.rooms SET phase = 'scoreboard', updated_at = timezone('utc'::text, now()) WHERE id = v_room.id;

    ELSIF v_room.phase = 'scoreboard' THEN
        IF v_room.current_round >= v_room.total_rounds THEN
            UPDATE public.rooms SET phase = 'game_over', updated_at = timezone('utc'::text, now()) WHERE id = v_room.id;
        ELSE
            -- Next round
            SELECT id INTO v_next_q_id
            FROM public.questions
            WHERE category_id = ANY(v_room.selected_categories)
            ORDER BY random()
            LIMIT 1;

            UPDATE public.room_players
            SET is_blocked_current_round = FALSE,
                is_blocked_next_round = FALSE
            WHERE room_id = v_room.id;

            UPDATE public.rooms
            SET current_round = current_round + 1,
                current_question_id = v_next_q_id,
                phase = 'ability_select',
                updated_at = timezone('utc'::text, now())
            WHERE id = v_room.id;
        END IF;
    END IF;
END;
$$;

-- RPC: Leave Room
CREATE OR REPLACE FUNCTION public.leave_room_secure(
    p_room_code VARCHAR(6)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room RECORD;
    v_next_host RECORD;
BEGIN
    IF v_user_id IS NULL THEN RETURN; END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code);
    IF v_room.id IS NULL THEN RETURN; END IF;

    DELETE FROM public.room_players
    WHERE room_id = v_room.id AND player_id = v_user_id;

    -- If room is now empty, delete room
    IF NOT EXISTS (SELECT 1 FROM public.room_players WHERE room_id = v_room.id) THEN
        DELETE FROM public.rooms WHERE id = v_room.id;
    ELSIF v_room.host_id = v_user_id THEN
        -- Transfer host to another player
        SELECT player_id INTO v_next_host FROM public.room_players WHERE room_id = v_room.id LIMIT 1;
        UPDATE public.rooms SET host_id = v_next_host.player_id WHERE id = v_room.id;
        UPDATE public.room_players SET is_host = TRUE WHERE room_id = v_room.id AND player_id = v_next_host.player_id;
    END IF;
END;
$$;

-- RPC: Rematch Room (Reset for new party)
CREATE OR REPLACE FUNCTION public.rematch_room_secure(
    p_room_code VARCHAR(6)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room RECORD;
    v_first_q_id TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = UPPER(p_room_code);
    IF v_room.id IS NULL THEN
        RAISE EXCEPTION 'Oda bulunamadı';
    END IF;

    IF v_room.host_id <> v_user_id THEN
        RAISE EXCEPTION 'Yalnızca oda kurucusu yeniden başlatabilir';
    END IF;

    SELECT id INTO v_first_q_id
    FROM public.questions
    WHERE category_id = ANY(v_room.selected_categories)
    ORDER BY random()
    LIMIT 1;

    -- Reset scores and abilities
    UPDATE public.room_players
    SET score = 0,
        consecutive_correct = 0,
        shields_available = 0,
        blocks_available = 0,
        is_blocked_current_round = FALSE,
        is_blocked_next_round = FALSE,
        last_blocked_player_id = NULL,
        is_ready = FALSE
    WHERE room_id = v_room.id;

    UPDATE public.rooms
    SET phase = 'lobby',
        current_round = 1,
        current_question_id = v_first_q_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_room.id;
END;
$$;


-- -----------------------------------------------------------------------------
-- Included source: supabase\migrations\20261021000001_profile_avatars.sql
-- -----------------------------------------------------------------------------
ALTER TABLE public.room_players
    ALTER COLUMN avatar_key TYPE TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    TRUE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read player avatars" ON storage.objects;
CREATE POLICY "Public read player avatars"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Upload own player avatar" ON storage.objects;
CREATE POLICY "Upload own player avatar"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

DROP POLICY IF EXISTS "Update own player avatar" ON storage.objects;
CREATE POLICY "Update own player avatar"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    )
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

CREATE OR REPLACE FUNCTION public.update_player_profile_secure(
    p_name VARCHAR(32),
    p_avatar_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    UPDATE public.room_players
    SET name = COALESCE(NULLIF(BTRIM(p_name), ''), 'Oyuncu'),
        avatar_key = p_avatar_key
    WHERE player_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_player_profile_secure(VARCHAR, TEXT)
    TO authenticated;


-- -----------------------------------------------------------------------------
-- Included source: supabase\migrations\20261022000001_canonical_multiplayer_schema.sql
-- -----------------------------------------------------------------------------
-- Canonical, forward-only multiplayer schema and server-authoritative actions.
-- Earlier migrations are intentionally retained for already-provisioned projects.

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR(32) NOT NULL DEFAULT 'Oyuncu'
        CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 32),
    avatar_key TEXT NOT NULL DEFAULT 'fox'
        CHECK (char_length(avatar_key) BETWEEN 1 AND 128),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.profiles (id, display_name, avatar_key)
SELECT u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), 'Oyuncu'), 32),
       coalesce(nullif(u.raw_user_meta_data ->> 'avatarKey', ''), 'fox')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_stats (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
    games_won INTEGER NOT NULL DEFAULT 0 CHECK (games_won >= 0),
    correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
    successful_traps INTEGER NOT NULL DEFAULT 0 CHECK (successful_traps >= 0),
    times_trapped INTEGER NOT NULL DEFAULT 0 CHECK (times_trapped >= 0),
    total_score BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES public.categories(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO public.categories (id, name, is_active)
SELECT DISTINCT q.category_id, q.category_id, TRUE
FROM public.questions q
WHERE nullif(btrim(q.category_id), '') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories (id, name, is_active)
VALUES
    ('cografya', 'Coğrafya', TRUE),
    ('dunya-tarihi', 'Tarih', TRUE),
    ('osmanli-donemi', 'Osmanlı Dönemi', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE;

ALTER TABLE public.questions
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.questions'::regclass
          AND conname = 'questions_category_id_fkey'
    ) THEN
        ALTER TABLE public.questions
            ADD CONSTRAINT questions_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES public.categories(id)
            ON DELETE RESTRICT NOT VALID;
    END IF;
END;
$$;
ALTER TABLE public.questions VALIDATE CONSTRAINT questions_category_id_fkey;

INSERT INTO public.questions (
    id, category_id, prompt, correct_answer, default_decoys, explanation, is_active
)
VALUES
    ('os-1', 'osmanli-donemi', 'İstanbul hangi yıl fethedilmiştir?', '1453',
     ARRAY['1451', '1455', '1461'], 'Fatih Sultan Mehmet 29 Mayıs 1453’te İstanbul’u fethetti.', TRUE),
    ('os-2', 'osmanli-donemi', 'Osmanlı Devleti’nin kurucusu ve ilk padişahı kimdir?', 'Osman Bey',
     ARRAY['Ertuğrul Gazi', 'Orhan Bey', 'I. Murad'], 'Osman Bey beyliği kurarak ilk hükümdar olmuştur.', TRUE),
    ('os-3', 'osmanli-donemi', 'En uzun süre tahtta kalan Osmanlı padişahı hangisidir?', 'Kanuni Sultan Süleyman',
     ARRAY['Fatih Sultan Mehmet', 'Yavuz Sultan Selim', 'II. Abdülhamid'], 'Kanuni Sultan Süleyman 46 yıl boyunca tahtta kalmıştır.', TRUE),
    ('os-4', 'osmanli-donemi', 'Mimar Sinan’ın “Ustalık eserim” dediği şaheser hangisidir?', 'Selimiye Camii',
     ARRAY['Süleymaniye Camii', 'Şehzade Camii', 'Sultanahmet Camii'], 'Edirne’deki Selimiye Camii Mimar Sinan’ın ustalık eseridir.', TRUE),
    ('os-5', 'osmanli-donemi', 'Osmanlı’da donanma komutanına verilen unvan hangisidir?', 'Kaptan-ı Derya',
     ARRAY['Kazasker', 'Vezir-i Azam', 'Defterdar'], 'Kaptan-ı Derya Osmanlı deniz kuvvetlerinin başkomutanıydı.', TRUE),
    ('dt-1', 'dunya-tarihi', 'Antik Dünyanın 7 Harikasından günümüze ulaşan tek eser hangisidir?', 'Keops Piramidi',
     ARRAY['Babil’in Asma Bahçeleri', 'İskenderiye Feneri', 'Rodos Heykeli'], 'Gize’deki Keops Piramidi günümüze sağlam kalan tek antik harikadır.', TRUE),
    ('dt-2', 'dunya-tarihi', 'Rönesans hareketi ilk olarak hangi ülkede başlamıştır?', 'İtalya',
     ARRAY['Fransa', 'İngiltere', 'Almanya'], 'Rönesans 14. yüzyılda İtalya’nın Floransa kentinde doğmuştur.', TRUE),
    ('dt-3', 'dunya-tarihi', 'Fransız İhtilali hangi yılda patlak vermiştir?', '1789',
     ARRAY['1776', '1804', '1815'], 'Bastille Baskını ile 1789 yılında başlamıştır.', TRUE),
    ('dt-4', 'dunya-tarihi', 'Tarihte bilinen ilk yazılı barış antlaşması hangisidir?', 'Kadeş Antlaşması',
     ARRAY['Vestfalya Antlaşması', 'Versailles Antlaşması', 'Lozan Antlaşması'], 'Hititler ile Mısırlılar arasında M.Ö. 1280 civarında imzalanmıştır.', TRUE),
    ('dt-5', 'dunya-tarihi', 'Magna Carta Libertatum hangi ülkede ve yılda ilan edilmiştir?', 'İngiltere - 1215',
     ARRAY['Fransa - 1302', 'İspanya - 1492', 'Roma - 1189'], 'Kral John 1215 yılında İngiltere’de Magna Carta’yı mühürlemiştir.', TRUE),
    ('cg-1', 'cografya', 'Dünyanın en yüksek zirvesi Everest hangi sıradağlardadır?', 'Himalaya Dağları',
     ARRAY['And Dağları', 'Alpler', 'Kayalık Dağları'], 'Everest Tepesi Nepal-Tibet sınırındaki Himalayalar’da yer alır.', TRUE),
    ('cg-2', 'cografya', 'Dünyanın en uzun nehri kabul edilen Nil nehri hangi kıtadadır?', 'Afrika',
     ARRAY['Asya', 'Güney Amerika', 'Avrupa'], 'Nil Nehri Afrika kıtasının doğu ve kuzeyinde akar.', TRUE),
    ('cg-3', 'cografya', 'Yüzölçümü bakımından dünyanın en büyük ülkesi hangisidir?', 'Rusya',
     ARRAY['Kanada', 'Çin', 'Amerika Birleşik Devletleri'], 'Rusya 17 milyon km² aşkın yüzölçümüyle dünyanın en büyüğüdür.', TRUE),
    ('cg-4', 'cografya', 'Dünyanın en kurak çölü sayılan Atacama Çölü hangi ülkededir?', 'Şili',
     ARRAY['Mısır', 'Avustralya', 'Moğolistan'], 'Atacama Çölü Güney Amerika’da Şili sınırları içindedir.', TRUE),
    ('cg-5', 'cografya', 'Hem Asya hem de Avrupa kıtasında toprağı bulunan Boğaziçi kenti hangisidir?', 'İstanbul',
     ARRAY['Kahire', 'Atina', 'Roma'], 'İstanbul iki kıtayı birbirine bağlayan eşsiz bir metropoldür.', TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.rooms
    ADD COLUMN IF NOT EXISTS min_players INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS max_players INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS phase_deadline_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS state_version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS game_number INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.prevent_paused_room_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_paused_at TIMESTAMPTZ;
BEGIN
    IF TG_TABLE_NAME = 'rooms' THEN
        IF OLD.paused_at IS NOT NULL AND NEW.paused_at IS NOT NULL
           AND NEW.phase IS DISTINCT FROM OLD.phase THEN
            RAISE EXCEPTION 'Oyun duraklatıldı; devam etmeden aşama değiştirilemez';
        END IF;
        RETURN NEW;
    END IF;

    SELECT paused_at INTO v_paused_at
    FROM public.rooms
    WHERE id = NEW.room_id;
    IF v_paused_at IS NOT NULL THEN
        RAISE EXCEPTION 'Oyun duraklatıldı; devam etmeden işlem yapılamaz';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_paused_room_phase_change ON public.rooms;
CREATE TRIGGER prevent_paused_room_phase_change
BEFORE UPDATE OF phase ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.prevent_paused_room_mutations();

DROP TRIGGER IF EXISTS prevent_paused_ability_actions ON public.ability_actions;
CREATE TRIGGER prevent_paused_ability_actions
BEFORE INSERT OR UPDATE ON public.ability_actions
FOR EACH ROW EXECUTE FUNCTION public.prevent_paused_room_mutations();

DROP TRIGGER IF EXISTS prevent_paused_fake_answers ON public.round_fake_answers;
CREATE TRIGGER prevent_paused_fake_answers
BEFORE INSERT OR UPDATE ON public.round_fake_answers
FOR EACH ROW EXECUTE FUNCTION public.prevent_paused_room_mutations();

DROP TRIGGER IF EXISTS prevent_paused_picks ON public.round_picks;
CREATE TRIGGER prevent_paused_picks
BEFORE INSERT OR UPDATE ON public.round_picks
FOR EACH ROW EXECUTE FUNCTION public.prevent_paused_room_mutations();

REVOKE ALL ON FUNCTION public.prevent_paused_room_mutations()
FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.rooms'::regclass
          AND conname = 'rooms_player_bounds_check'
    ) THEN
        ALTER TABLE public.rooms
            ADD CONSTRAINT rooms_player_bounds_check
            CHECK (min_players >= 2 AND max_players >= min_players AND max_players <= 10)
            NOT VALID;
    END IF;
END;
$$;
ALTER TABLE public.rooms VALIDATE CONSTRAINT rooms_player_bounds_check;

ALTER TABLE public.room_players
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS kicked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ability_ready_round INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS prevent_paused_ability_readiness ON public.room_players;
CREATE TRIGGER prevent_paused_ability_readiness
BEFORE UPDATE OF ability_ready_round ON public.room_players
FOR EACH ROW EXECUTE FUNCTION public.prevent_paused_room_mutations();

ALTER TABLE public.room_players
    ALTER COLUMN avatar_key TYPE TEXT;

ALTER TABLE public.round_results
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS penalty_delta INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.nudges
    ADD COLUMN IF NOT EXISTS round_number INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'lobby';

CREATE TABLE IF NOT EXISTS public.room_round_questions (
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    game_number INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    PRIMARY KEY (room_id, game_number, round_number),
    UNIQUE (room_id, game_number, question_id)
);

CREATE TABLE IF NOT EXISTS public.friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sender_id <> recipient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_pair_unique
    ON public.friend_requests (
        LEAST(sender_id, recipient_id),
        GREATEST(sender_id, recipient_id)
    ) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS friend_requests_recipient_status_idx
    ON public.friend_requests (recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS friend_requests_sender_status_idx
    ON public.friend_requests (sender_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.friendships (
    user_low UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_high UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_low, user_high),
    CHECK (user_low < user_high)
);

CREATE TABLE IF NOT EXISTS public.user_blocks (
    blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.room_game_stats (
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    game_number INTEGER NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    PRIMARY KEY (room_id, game_number, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS nudges_stage_unique
    ON public.nudges (room_id, round_number, phase, from_id, to_id)
    WHERE round_number > 0;
CREATE INDEX IF NOT EXISTS rooms_open_lobby_created_idx
    ON public.rooms (created_at DESC) WHERE phase = 'lobby';

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.create_profile_for_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_key)
    VALUES (
        NEW.id,
        left(coalesce(nullif(btrim(NEW.raw_user_meta_data ->> 'name'), ''), 'Oyuncu'), 32),
        left(coalesce(nullif(NEW.raw_user_meta_data ->> 'avatarKey', ''), 'fox'), 128)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_auth_user();

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.room_players rp
        WHERE rp.room_id = p_room_id AND rp.player_id = auth.uid()
    );
$$;

-- Replace permissive legacy policies with room-scoped access.
DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'rooms', 'room_players', 'round_answers', 'ability_actions',
              'round_results', 'nudges', 'questions', 'round_fake_answers',
              'round_choices', 'round_picks'
          )
    LOOP
        EXECUTE format(
            'DROP POLICY %I ON %I.%I',
            policy_row.policyname, policy_row.schemaname, policy_row.tablename
        );
    END LOOP;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_round_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_authenticated_read
    ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_owner_update
    ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
CREATE POLICY user_stats_authenticated_read
    ON public.user_stats FOR SELECT TO authenticated USING (true);
CREATE POLICY categories_authenticated_read
    ON public.categories FOR SELECT TO authenticated USING (is_active);
CREATE POLICY friend_requests_participant_read
    ON public.friend_requests FOR SELECT TO authenticated
    USING (sender_id = auth.uid() OR recipient_id = auth.uid());
CREATE POLICY friendships_participant_read
    ON public.friendships FOR SELECT TO authenticated
    USING (user_low = auth.uid() OR user_high = auth.uid());
CREATE POLICY user_blocks_owner_read
    ON public.user_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
CREATE POLICY room_game_stats_member_read
    ON public.room_game_stats FOR SELECT TO authenticated
    USING (public.is_room_member(room_id));
CREATE POLICY rooms_member_read
    ON public.rooms FOR SELECT TO authenticated
    USING (public.is_room_member(id));
CREATE POLICY room_players_member_read
    ON public.room_players FOR SELECT TO authenticated
    USING (public.is_room_member(room_id));
CREATE POLICY round_answers_owner_or_revealed
    ON public.round_answers FOR SELECT TO authenticated
    USING (
        public.is_room_member(room_id)
        AND (
            player_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.rooms r
                WHERE r.id = round_answers.room_id
                  AND r.phase IN ('reveal', 'scoreboard', 'game_over')
            )
        )
    );
CREATE POLICY ability_actions_room_member_read
    ON public.ability_actions FOR SELECT TO authenticated
    USING (
        public.is_room_member(room_id)
        AND EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = ability_actions.room_id
              AND r.phase IN ('reveal', 'scoreboard', 'game_over')
        )
    );
CREATE POLICY round_results_member_read
    ON public.round_results FOR SELECT TO authenticated
    USING (public.is_room_member(room_id));
CREATE POLICY nudges_recipient_or_sender_read
    ON public.nudges FOR SELECT TO authenticated
    USING (
        public.is_room_member(room_id)
        AND (from_id = auth.uid() OR to_id = auth.uid())
    );
CREATE POLICY round_fake_answers_private_read
    ON public.round_fake_answers FOR SELECT TO authenticated
    USING (
        public.is_room_member(room_id)
        AND (
            player_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.rooms r
                WHERE r.id = round_fake_answers.room_id
                  AND r.phase IN ('reveal', 'scoreboard', 'game_over')
            )
        )
    );
CREATE POLICY round_choices_member_revealed_read
    ON public.round_choices FOR SELECT TO authenticated
    USING (
        public.is_room_member(room_id)
        AND EXISTS (
            SELECT 1 FROM public.rooms r
            WHERE r.id = round_choices.room_id
              AND r.phase IN ('reveal', 'scoreboard', 'game_over')
        )
    );
CREATE POLICY round_picks_private_read
    ON public.round_picks FOR SELECT TO authenticated
    USING (
        public.is_room_member(room_id)
        AND (
            player_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.rooms r
                WHERE r.id = round_picks.room_id
                  AND r.phase IN ('reveal', 'scoreboard', 'game_over')
            )
        )
    );

-- RPCs own all writes that affect membership, progress, scores, or relationships.
REVOKE INSERT, UPDATE, DELETE ON public.profiles, public.user_stats,
    public.friend_requests, public.friendships, public.user_blocks,
    public.room_game_stats, public.room_round_questions,
    public.rooms, public.room_players, public.round_answers,
    public.ability_actions, public.round_results, public.nudges,
    public.round_fake_answers, public.round_choices, public.round_picks
FROM anon, authenticated;
GRANT SELECT ON public.profiles, public.user_stats, public.friend_requests,
    public.friendships, public.user_blocks, public.room_game_stats
TO authenticated;
GRANT SELECT ON public.categories TO authenticated;
REVOKE ALL ON public.room_round_questions FROM anon, authenticated;
REVOKE ALL ON public.questions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_profile_secure(
    p_display_name TEXT,
    p_avatar_key TEXT,
    p_avatar_url TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile public.profiles;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    IF char_length(btrim(coalesce(p_display_name, ''))) NOT BETWEEN 1 AND 32 THEN
        RAISE EXCEPTION 'İsim 1-32 karakter olmalıdır';
    END IF;
    IF char_length(coalesce(p_avatar_key, '')) NOT BETWEEN 1 AND 128 THEN
        RAISE EXCEPTION 'Avatar bilgisi geçersiz';
    END IF;
    UPDATE public.profiles
    SET display_name = btrim(p_display_name),
        avatar_key = p_avatar_key,
        avatar_url = CASE
            WHEN p_avatar_url IS NULL THEN avatar_url
            WHEN p_avatar_url LIKE 'https://%' THEN p_avatar_url
            ELSE NULL
        END
    WHERE id = v_user_id
    RETURNING * INTO v_profile;
    IF NOT FOUND THEN RAISE EXCEPTION 'Profil bulunamadı'; END IF;
    UPDATE public.room_players
    SET name = v_profile.display_name, avatar_key = v_profile.avatar_key
    WHERE player_id = v_user_id AND is_online = TRUE;
    RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_profile_secure(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'avatar_key', p.avatar_key,
        'avatar_url', p.avatar_url,
        'stats', jsonb_build_object(
            'games_played', coalesce(s.games_played, 0),
            'games_won', coalesce(s.games_won, 0),
            'correct_answers', coalesce(s.correct_answers, 0),
            'successful_traps', coalesce(s.successful_traps, 0),
            'times_trapped', coalesce(s.times_trapped, 0),
            'total_score', coalesce(s.total_score, 0)
        )
    )
    FROM public.profiles p
    LEFT JOIN public.user_stats s ON s.user_id = p.id
    WHERE p.id = p_user_id AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_friendship_status_secure(p_other_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_status TEXT;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    IF v_user_id = p_other_id THEN RETURN 'none'; END IF;
    IF EXISTS (
        SELECT 1 FROM public.user_blocks
        WHERE (blocker_id = v_user_id AND blocked_id = p_other_id)
           OR (blocker_id = p_other_id AND blocked_id = v_user_id)
    ) THEN RETURN 'blocked'; END IF;
    IF EXISTS (
        SELECT 1 FROM public.friendships
        WHERE user_low = LEAST(v_user_id, p_other_id)
          AND user_high = GREATEST(v_user_id, p_other_id)
    ) THEN RETURN 'friends'; END IF;
    SELECT CASE WHEN sender_id = v_user_id
        THEN 'outgoing_pending' ELSE 'incoming_pending' END
    INTO v_status
    FROM public.friend_requests
    WHERE status = 'pending'
      AND ((sender_id = v_user_id AND recipient_id = p_other_id)
        OR (sender_id = p_other_id AND recipient_id = v_user_id))
    LIMIT 1;
    RETURN coalesce(v_status, 'none');
END;
$$;

CREATE OR REPLACE FUNCTION public.send_friend_request_secure(p_recipient_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_pending public.friend_requests;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    IF p_recipient_id IS NULL OR p_recipient_id = v_user_id THEN
        RAISE EXCEPTION 'Kendine arkadaşlık isteği gönderemezsin';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
        LEAST(v_user_id, p_recipient_id)::TEXT || ':' || GREATEST(v_user_id, p_recipient_id)::TEXT, 0
    ));
    IF EXISTS (
        SELECT 1 FROM public.user_blocks
        WHERE (blocker_id = v_user_id AND blocked_id = p_recipient_id)
           OR (blocker_id = p_recipient_id AND blocked_id = v_user_id)
    ) THEN RAISE EXCEPTION 'Engellenen kullanıcılar arasında istek gönderilemez'; END IF;
    IF EXISTS (
        SELECT 1 FROM public.friendships
        WHERE user_low = LEAST(v_user_id, p_recipient_id)
          AND user_high = GREATEST(v_user_id, p_recipient_id)
    ) THEN RETURN 'friends'; END IF;
    SELECT * INTO v_pending FROM public.friend_requests
    WHERE status = 'pending'
      AND ((sender_id = v_user_id AND recipient_id = p_recipient_id)
        OR (sender_id = p_recipient_id AND recipient_id = v_user_id))
    FOR UPDATE;
    IF FOUND AND v_pending.recipient_id = v_user_id THEN
        UPDATE public.friend_requests SET status = 'accepted', updated_at = now()
        WHERE id = v_pending.id;
        INSERT INTO public.friendships (user_low, user_high)
        VALUES (LEAST(v_user_id, p_recipient_id), GREATEST(v_user_id, p_recipient_id))
        ON CONFLICT DO NOTHING;
        RETURN 'friends';
    ELSIF FOUND THEN
        RETURN 'outgoing_pending';
    END IF;
    INSERT INTO public.friend_requests (sender_id, recipient_id)
    VALUES (v_user_id, p_recipient_id);
    RETURN 'outgoing_pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_request_secure(
    p_request_id UUID,
    p_accept BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_request public.friend_requests;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_request FROM public.friend_requests
    WHERE id = p_request_id AND recipient_id = v_user_id AND status = 'pending'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bekleyen istek bulunamadı'; END IF;
    IF EXISTS (
        SELECT 1 FROM public.user_blocks
        WHERE (blocker_id = v_user_id AND blocked_id = v_request.sender_id)
           OR (blocker_id = v_request.sender_id AND blocked_id = v_user_id)
    ) THEN RAISE EXCEPTION 'Engellenen kullanıcılar arkadaş olamaz'; END IF;
    UPDATE public.friend_requests
    SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
        updated_at = now()
    WHERE id = p_request_id;
    IF p_accept THEN
        INSERT INTO public.friendships (user_low, user_high)
        VALUES (LEAST(v_user_id, v_request.sender_id), GREATEST(v_user_id, v_request.sender_id))
        ON CONFLICT DO NOTHING;
        RETURN 'friends';
    END IF;
    RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request_secure(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    UPDATE public.friend_requests SET status = 'cancelled', updated_at = now()
    WHERE id = p_request_id AND sender_id = auth.uid() AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'İptal edilebilir istek bulunamadı'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend_secure(p_other_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    DELETE FROM public.friendships
    WHERE user_low = LEAST(auth.uid(), p_other_id)
      AND user_high = GREATEST(auth.uid(), p_other_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.block_user_secure(p_other_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    IF p_other_id IS NULL OR p_other_id = auth.uid() THEN
        RAISE EXCEPTION 'Kendini engelleyemezsin';
    END IF;
    INSERT INTO public.user_blocks (blocker_id, blocked_id)
    VALUES (auth.uid(), p_other_id) ON CONFLICT DO NOTHING;
    DELETE FROM public.friendships
    WHERE user_low = LEAST(auth.uid(), p_other_id)
      AND user_high = GREATEST(auth.uid(), p_other_id);
    UPDATE public.friend_requests SET status = 'cancelled', updated_at = now()
    WHERE status = 'pending'
      AND ((sender_id = auth.uid() AND recipient_id = p_other_id)
        OR (sender_id = p_other_id AND recipient_id = auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user_secure(p_other_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    DELETE FROM public.user_blocks
    WHERE blocker_id = auth.uid() AND blocked_id = p_other_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_friends_secure()
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    avatar_key TEXT,
    avatar_url TEXT,
    relationship_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT p.id, p.display_name::TEXT, p.avatar_key, p.avatar_url, 'friends'::TEXT
    FROM public.friendships f
    JOIN public.profiles p
      ON p.id = CASE WHEN f.user_low = auth.uid() THEN f.user_high ELSE f.user_low END
    WHERE auth.uid() IN (f.user_low, f.user_high)
    UNION ALL
    SELECT p.id, p.display_name::TEXT, p.avatar_key, p.avatar_url, 'incoming_pending'::TEXT
    FROM public.friend_requests fr
    JOIN public.profiles p ON p.id = fr.sender_id
    WHERE fr.recipient_id = auth.uid() AND fr.status = 'pending';
$$;

CREATE OR REPLACE FUNCTION public._build_round_choices(p_room_id UUID, p_round_number INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_question_id TEXT;
BEGIN
    SELECT r.current_question_id INTO v_question_id
    FROM public.rooms r WHERE r.id = p_room_id;
    IF v_question_id IS NULL THEN RAISE EXCEPTION 'Tur sorusu bulunamadı'; END IF;

    DELETE FROM public.round_choices
    WHERE room_id = p_room_id AND round_number = p_round_number;

    INSERT INTO public.round_choices (
        room_id, round_number, choice_index, text, author_id, is_correct
    )
    WITH q AS (
        SELECT questions.correct_answer
        FROM public.questions
        WHERE questions.id = v_question_id
    ), candidates AS (
        SELECT q.correct_answer AS choice_text,
               NULL::UUID AS author_id,
               TRUE AS is_correct,
               0 AS priority
        FROM q
        UNION ALL
        SELECT btrim(f.fake_answer),
               f.player_id,
               FALSE,
               1
        FROM public.round_fake_answers f
        CROSS JOIN q
        WHERE f.room_id = p_room_id
          AND f.round_number = p_round_number
          AND btrim(f.fake_answer) <> ''
          AND lower(btrim(f.fake_answer)) <> lower(btrim(q.correct_answer))
    ), deduplicated AS (
        SELECT DISTINCT ON (lower(btrim(c.choice_text)))
            c.choice_text, c.author_id, c.is_correct
        FROM candidates c
        ORDER BY lower(btrim(c.choice_text)), c.priority
    ), shuffled AS (
        SELECT row_number() OVER (ORDER BY random())::INTEGER - 1 AS choice_index,
               d.choice_text, d.author_id, d.is_correct
        FROM deduplicated d
    )
    SELECT p_room_id, p_round_number, s.choice_index, s.choice_text, s.author_id, s.is_correct
    FROM shuffled s;

    IF NOT EXISTS (
        SELECT 1
        FROM public.round_choices rc
        WHERE rc.room_id = p_room_id
          AND rc.round_number = p_round_number
          AND rc.is_correct
    ) THEN
        RAISE EXCEPTION 'Soru için doğru cevap seçeneği oluşturulamadı';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._set_room_phase(
    p_room_id UUID,
    p_phase room_phase,
    p_deadline_seconds INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    UPDATE public.rooms
    SET phase = p_phase,
        phase_started_at = now(),
        phase_deadline_at = CASE
            WHEN p_deadline_seconds IS NULL THEN NULL
            ELSE now() + make_interval(secs => p_deadline_seconds)
        END,
        state_version = state_version + 1,
        updated_at = now()
    WHERE id = p_room_id;
$$;

CREATE OR REPLACE FUNCTION public.set_player_ready_secure(
    p_room_code VARCHAR(6),
    p_ready BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND OR v_room.phase <> 'lobby' THEN
        RAISE EXCEPTION 'Hazır durumu yalnızca oda lobisinde değiştirilebilir';
    END IF;
    UPDATE public.room_players SET is_ready = p_ready
    WHERE room_id = v_room.id AND player_id = v_user_id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Aktif oda üyesi değilsiniz'; END IF;
    UPDATE public.rooms SET state_version = state_version + 1, updated_at = now()
    WHERE id = v_room.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_game_secure(p_room_code VARCHAR(6))
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_ready_count INTEGER;
    v_question_id TEXT;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
    IF v_room.host_id <> v_user_id THEN RAISE EXCEPTION 'Yalnızca oda kurucusu oyunu başlatabilir'; END IF;
    IF v_room.phase <> 'lobby' THEN RAISE EXCEPTION 'Oyun zaten başlatılmış'; END IF;

    SELECT count(*)::INTEGER INTO v_ready_count
    FROM public.room_players
    WHERE room_id = v_room.id AND is_ready AND is_online;
    IF v_ready_count < v_room.min_players THEN
        RAISE EXCEPTION 'Oyunu başlatmak için en az % oyuncu hazır olmalıdır', v_room.min_players;
    END IF;

    SELECT q.id INTO v_question_id
    FROM public.questions q
    WHERE q.category_id = ANY(v_room.selected_categories)
      AND q.is_active IS DISTINCT FROM FALSE
    ORDER BY random()
    LIMIT 1;
    IF v_question_id IS NULL THEN
        RAISE EXCEPTION 'Seçilen kategorilerde kullanılabilir soru bulunamadı';
    END IF;

    UPDATE public.room_players
    SET is_active = is_ready AND is_online,
        score = 0,
        consecutive_correct = 0,
        shields_available = 0,
        blocks_available = 0,
        is_blocked_current_round = FALSE,
        is_blocked_next_round = FALSE,
        last_blocked_player_id = NULL,
        ability_ready_round = 0,
        ability_uses = '{"block":0,"shield":0,"penalty":0,"counter":0}'::JSONB
    WHERE room_id = v_room.id;
    INSERT INTO public.room_round_questions (room_id, game_number, round_number, question_id)
    VALUES (v_room.id, v_room.game_number, 1, v_question_id);
    UPDATE public.rooms
    SET current_round = 1, current_question_id = v_question_id,
        finished_at = NULL, updated_at = now()
    WHERE id = v_room.id;
    PERFORM public._set_room_phase(v_room.id, 'ability_select', v_room.round_seconds);
END;
$$;

CREATE OR REPLACE FUNCTION public.use_ability_secure(
    p_room_code VARCHAR(6),
    p_ability ability_type,
    p_target_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_player public.room_players;
    v_target public.room_players;
    v_uses INTEGER;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
    IF v_room.phase <> 'ability_select' THEN RAISE EXCEPTION 'Yetenek seçimi aşaması sona erdi'; END IF;
    SELECT * INTO v_player FROM public.room_players
    WHERE room_id = v_room.id AND player_id = v_user_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Aktif oda üyesi değilsiniz'; END IF;
    IF v_room.phase_deadline_at IS NOT NULL AND v_room.phase_deadline_at <= now() THEN
        PERFORM public.advance_expired_room_phase_secure(p_room_code);
        RETURN;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.ability_actions
        WHERE room_id = v_room.id AND round_number = v_room.current_round
          AND player_id = v_user_id AND ability = p_ability
    ) THEN
        RAISE EXCEPTION 'Bu yeteneği bu tur zaten kullandınız';
    END IF;

    IF p_ability IN ('block', 'penalty') THEN
        IF p_target_id IS NULL OR p_target_id = v_user_id THEN
            RAISE EXCEPTION 'Geçerli bir rakip seçmelisiniz';
        END IF;
        SELECT * INTO v_target FROM public.room_players
        WHERE room_id = v_room.id AND player_id = p_target_id AND is_active;
        IF NOT FOUND THEN RAISE EXCEPTION 'Hedef bu oyunda aktif değil'; END IF;
    ELSIF p_target_id IS NOT NULL THEN
        RAISE EXCEPTION 'Bu yetenek hedef kabul etmez';
    END IF;

    v_uses := coalesce((v_player.ability_uses ->> p_ability::TEXT)::INTEGER, 0);
    IF p_ability = 'block' THEN
        IF v_player.blocks_available < 1 THEN RAISE EXCEPTION 'Bloklama hakkınız bulunmuyor'; END IF;
        IF v_player.last_blocked_player_id = p_target_id THEN
            RAISE EXCEPTION 'Aynı oyuncuyu art arda iki tur bloklayamazsınız';
        END IF;
        UPDATE public.room_players
        SET blocks_available = blocks_available - 1,
            last_blocked_player_id = p_target_id,
            ability_uses = jsonb_set(ability_uses, '{block}', to_jsonb(v_uses + 1))
        WHERE room_id = v_room.id AND player_id = v_user_id;
    ELSIF p_ability = 'shield' THEN
        IF v_player.shields_available < 1 THEN RAISE EXCEPTION 'Kalkan hakkınız bulunmuyor'; END IF;
        UPDATE public.room_players
        SET shields_available = shields_available - 1,
            ability_uses = jsonb_set(ability_uses, '{shield}', to_jsonb(v_uses + 1))
        WHERE room_id = v_room.id AND player_id = v_user_id;
    ELSIF p_ability IN ('penalty', 'counter') THEN
        IF v_uses >= 1 THEN RAISE EXCEPTION 'Bu yeteneği oyun başına en fazla bir kez kullanabilirsiniz'; END IF;
        UPDATE public.room_players
        SET ability_uses = jsonb_set(ability_uses, ARRAY[p_ability::TEXT], to_jsonb(v_uses + 1))
        WHERE room_id = v_room.id AND player_id = v_user_id;
    END IF;

    INSERT INTO public.ability_actions (room_id, round_number, player_id, ability, target_id)
    VALUES (v_room.id, v_room.current_round, v_user_id, p_ability, p_target_id);
    UPDATE public.rooms SET state_version = state_version + 1, updated_at = now()
    WHERE id = v_room.id;
END;
$$;

CREATE OR REPLACE FUNCTION public._apply_round_block_effects(
    p_room_id UUID,
    p_round_number INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;
    IF NOT FOUND OR v_room.current_round <> p_round_number
       OR v_room.phase <> 'ability_select' THEN
        RAISE EXCEPTION 'Yetenek seçimi turu artık aktif değil';
    END IF;

    UPDATE public.room_players target
    SET is_blocked_current_round = TRUE
    WHERE target.room_id = p_room_id AND target.is_active
      AND EXISTS (
          SELECT 1
          FROM public.ability_actions block_action
          WHERE block_action.room_id = p_room_id
            AND block_action.round_number = p_round_number
            AND block_action.ability = 'block'
            AND block_action.target_id = target.player_id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.ability_actions shield_action
          WHERE shield_action.room_id = p_room_id
            AND shield_action.round_number = p_round_number
            AND shield_action.ability = 'shield'
            AND shield_action.player_id = target.player_id
      );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_ability_selection_secure(p_room_code VARCHAR(6))
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_remaining INTEGER;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND OR NOT public.is_room_member(v_room.id) THEN
        RAISE EXCEPTION 'Oda bulunamadı veya erişim izniniz yok';
    END IF;
    IF v_room.phase <> 'ability_select' THEN RETURN FALSE; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.room_players
        WHERE room_id = v_room.id AND player_id = v_user_id AND is_active
    ) THEN RAISE EXCEPTION 'Bu tur yetenek seçimini tamamlayamazsınız'; END IF;
    IF v_room.phase_deadline_at IS NOT NULL AND v_room.phase_deadline_at <= now() THEN
        PERFORM public.advance_expired_room_phase_secure(p_room_code);
        RETURN FALSE;
    END IF;

    UPDATE public.room_players
    SET ability_ready_round = v_room.current_round
    WHERE room_id = v_room.id AND player_id = v_user_id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bu tur yetenek seçimini tamamlayamazsınız'; END IF;

    SELECT count(*)::INTEGER INTO v_remaining
    FROM public.room_players
    WHERE room_id = v_room.id AND is_active
      AND ability_ready_round <> v_room.current_round;
    IF v_remaining = 0 THEN
        PERFORM public._apply_round_block_effects(v_room.id, v_room.current_round);
        PERFORM public._set_room_phase(v_room.id, 'fake_answer', v_room.round_seconds);
    ELSE
        UPDATE public.rooms SET state_version = state_version + 1, updated_at = now()
        WHERE id = v_room.id;
    END IF;
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_fake_answer_secure(
    p_room_code VARCHAR(6),
    p_fake_answer TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_existing TEXT;
    v_remaining INTEGER;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    IF char_length(btrim(coalesce(p_fake_answer, ''))) > 120 THEN
        RAISE EXCEPTION 'Sahte cevap en fazla 120 karakter olabilir';
    END IF;
    IF char_length(btrim(coalesce(p_fake_answer, ''))) = 0 THEN
        RAISE EXCEPTION 'Sahte cevap boş olamaz';
    END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
    IF v_room.phase <> 'fake_answer' THEN RAISE EXCEPTION 'Sahte cevap aşaması aktif değil'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.room_players
        WHERE room_id = v_room.id AND player_id = v_user_id AND is_active
          AND NOT is_blocked_current_round
    ) THEN RAISE EXCEPTION 'Bu tur cevap gönderemezsiniz'; END IF;
    IF v_room.phase_deadline_at IS NOT NULL AND v_room.phase_deadline_at <= now() THEN
        PERFORM public.advance_expired_room_phase_secure(p_room_code);
        RETURN;
    END IF;

    SELECT fake_answer INTO v_existing FROM public.round_fake_answers
    WHERE room_id = v_room.id AND round_number = v_room.current_round AND player_id = v_user_id;
    IF FOUND THEN
        IF v_existing IS DISTINCT FROM btrim(coalesce(p_fake_answer, '')) THEN
            RAISE EXCEPTION 'Bu tur cevabınız zaten gönderildi';
        END IF;
        RETURN;
    END IF;

    INSERT INTO public.round_fake_answers (room_id, round_number, player_id, fake_answer)
    VALUES (v_room.id, v_room.current_round, v_user_id, btrim(coalesce(p_fake_answer, '')));

    SELECT count(*)::INTEGER INTO v_remaining
    FROM public.room_players rp
    WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_blocked_current_round
      AND NOT EXISTS (
          SELECT 1 FROM public.round_fake_answers fa
          WHERE fa.room_id = v_room.id AND fa.round_number = v_room.current_round
            AND fa.player_id = rp.player_id
      );
    IF v_remaining = 0 THEN
        PERFORM public._build_round_choices(v_room.id, v_room.current_round);
        PERFORM public._set_room_phase(v_room.id, 'guess', v_room.round_seconds);
    ELSE
        UPDATE public.rooms SET state_version = state_version + 1, updated_at = now()
        WHERE id = v_room.id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_round_choices_secure(p_room_code VARCHAR(6))
RETURNS TABLE (choice_index INTEGER, choice_text TEXT, is_own_fake BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_room public.rooms;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code);
    IF NOT FOUND OR NOT public.is_room_member(v_room.id) THEN
        RAISE EXCEPTION 'Odaya erişim izniniz yok';
    END IF;
    IF v_room.phase <> 'guess' THEN RAISE EXCEPTION 'Tahmin aşaması aktif değil'; END IF;
    RETURN QUERY
    SELECT c.choice_index, c.text,
           (c.author_id = auth.uid()) AS is_own_fake
    FROM public.round_choices c
    WHERE c.room_id = v_room.id AND c.round_number = v_room.current_round
    ORDER BY c.choice_index;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_round_authoritative(
    p_room_id UUID,
    p_round_number INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_room public.rooms;
    v_player public.room_players;
    v_pick public.round_picks;
    v_choice public.round_choices;
    v_correct BOOLEAN;
    v_deceived BOOLEAN;
    v_deceived_author UUID;
    v_victims INTEGER;
    v_delta INTEGER;
    v_penalty INTEGER;
    v_penalty_count INTEGER;
    v_attacker_id UUID;
    v_blocked BOOLEAN;
    v_shielded BOOLEAN;
    v_counter BOOLEAN;
    v_total_opponents INTEGER;
    v_result_created BOOLEAN;
    v_insert_count INTEGER;
    v_has_pick BOOLEAN;
BEGIN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND OR v_room.current_round <> p_round_number THEN
        RAISE EXCEPTION 'Tur artık aktif değil';
    END IF;
    IF NOT public.is_room_member(p_room_id) THEN RAISE EXCEPTION 'Odaya erişim izniniz yok'; END IF;
    IF v_room.phase IN ('reveal', 'scoreboard', 'game_over') THEN RETURN; END IF;
    IF v_room.phase <> 'guess' THEN RAISE EXCEPTION 'Tahmin aşaması tamamlanmadı'; END IF;

    SELECT count(*)::INTEGER INTO v_total_opponents
    FROM public.room_players rp
    WHERE rp.room_id = p_room_id AND rp.is_active;
    v_total_opponents := greatest(v_total_opponents - 1, 1);

    FOR v_player IN
        SELECT * FROM public.room_players
        WHERE room_id = p_room_id AND is_active
        ORDER BY player_id
    LOOP
        v_correct := FALSE;
        v_deceived := FALSE;
        v_deceived_author := NULL;
        v_victims := 0;
        v_delta := 0;
        v_penalty := 0;
        v_penalty_count := 0;
        v_blocked := v_player.is_blocked_current_round;
        v_shielded := EXISTS (
            SELECT 1 FROM public.ability_actions a
            WHERE a.room_id = p_room_id AND a.round_number = p_round_number
              AND a.player_id = v_player.player_id AND a.ability = 'shield'
        );
        v_counter := EXISTS (
            SELECT 1 FROM public.ability_actions a
            WHERE a.room_id = p_room_id AND a.round_number = p_round_number
              AND a.player_id = v_player.player_id AND a.ability = 'counter'
        );

        SELECT * INTO v_pick FROM public.round_picks
        WHERE room_id = p_room_id AND round_number = p_round_number
          AND player_id = v_player.player_id;
        v_has_pick := FOUND;
        IF v_has_pick THEN
            SELECT * INTO v_choice FROM public.round_choices
            WHERE room_id = p_room_id AND round_number = p_round_number
              AND choice_index = v_pick.choice_index;
            v_correct := coalesce(v_choice.is_correct, FALSE);
            v_deceived := v_choice.author_id IS NOT NULL
                AND v_choice.author_id <> v_player.player_id AND NOT v_correct;
            v_deceived_author := CASE WHEN v_deceived THEN v_choice.author_id ELSE NULL END;
            IF v_correct THEN v_delta := v_delta + 100; END IF;
            IF v_deceived THEN v_delta := v_delta - 40; END IF;
        END IF;

        SELECT count(*)::INTEGER INTO v_victims
        FROM public.round_picks p
        JOIN public.round_choices c
          ON c.room_id = p.room_id AND c.round_number = p.round_number
         AND c.choice_index = p.choice_index
        JOIN public.room_players victim
          ON victim.room_id = p.room_id AND victim.player_id = p.player_id
        WHERE p.room_id = p_room_id AND p.round_number = p_round_number
          AND c.author_id = v_player.player_id AND p.player_id <> v_player.player_id
          AND victim.is_active;
        IF NOT v_has_pick THEN
            v_delta := 0;
            v_victims := 0;
        END IF;
        v_delta := v_delta + v_victims * 50;

        SELECT count(*)::INTEGER INTO v_penalty_count
        FROM public.ability_actions a
        WHERE a.room_id = p_room_id AND a.round_number = p_round_number
          AND a.ability = 'penalty' AND a.target_id = v_player.player_id;
        v_blocked := v_penalty_count > 0;
        IF v_blocked AND NOT v_shielded THEN
            IF v_counter THEN
                UPDATE public.room_players attacker
                SET score = greatest(0, attacker.score - 30)
                WHERE attacker.room_id = p_room_id
                  AND attacker.player_id IN (
                      SELECT action.player_id
                      FROM public.ability_actions action
                      WHERE action.room_id = p_room_id
                        AND action.round_number = p_round_number
                        AND action.ability = 'penalty'
                        AND action.target_id = v_player.player_id
                  );
            ELSIF NOT v_correct THEN
                v_penalty := -30 * v_penalty_count;
            END IF;
        END IF;
        v_delta := v_delta + v_penalty;
        v_blocked := v_player.is_blocked_current_round;

        INSERT INTO public.round_results (
            room_id, round_number, player_id, answered_correctly,
            "zartaladın", "zartalandın", points_delta, victims_count,
            deceived_by_author_id, picked_text, own_fake_text, is_blocked, penalty_delta
        )
        SELECT p_room_id, p_round_number, v_player.player_id, v_correct,
               v_victims > 0, v_deceived, v_delta, v_victims,
               v_deceived_author, c.text, fa.fake_answer, v_blocked, v_penalty
        FROM (SELECT 1) seed
        LEFT JOIN public.round_choices c
          ON c.room_id = p_room_id AND c.round_number = p_round_number
         AND c.choice_index = v_pick.choice_index
        LEFT JOIN public.round_fake_answers fa
          ON fa.room_id = p_room_id AND fa.round_number = p_round_number
         AND fa.player_id = v_player.player_id
        ON CONFLICT (room_id, round_number, player_id) DO NOTHING;
        GET DIAGNOSTICS v_insert_count = ROW_COUNT;
        v_result_created := v_insert_count > 0;

        IF v_result_created THEN
            UPDATE public.room_players
            SET score = greatest(0, score + v_delta),
                shields_available = CASE
                    WHEN v_correct AND consecutive_correct + 1 >= 3
                    THEN shields_available + 1
                    ELSE shields_available
                END,
                consecutive_correct = CASE
                    WHEN v_correct AND consecutive_correct + 1 >= 3
                    THEN 0
                    WHEN NOT v_correct THEN 0
                    ELSE consecutive_correct + 1
                END,
                blocks_available = CASE
                    WHEN v_has_pick
                      AND (v_victims >= 3 OR v_victims::NUMERIC / v_total_opponents > 0.5)
                    THEN blocks_available + 1
                    ELSE blocks_available
                END
            WHERE room_id = p_room_id AND player_id = v_player.player_id;
        END IF;
    END LOOP;

    UPDATE public.round_results result
    SET points_delta = result.points_delta + reflected.points_delta,
        penalty_delta = result.penalty_delta + reflected.points_delta
    FROM (
        SELECT penalty.player_id, -30 * count(*)::INTEGER AS points_delta
        FROM public.ability_actions penalty
        JOIN public.room_players target
          ON target.room_id = penalty.room_id AND target.player_id = penalty.target_id
        JOIN public.ability_actions counter
          ON counter.room_id = penalty.room_id
         AND counter.round_number = penalty.round_number
         AND counter.player_id = penalty.target_id
         AND counter.ability = 'counter'
        WHERE penalty.room_id = p_room_id AND penalty.round_number = p_round_number
          AND penalty.ability = 'penalty'
          AND NOT EXISTS (
              SELECT 1 FROM public.ability_actions shield
              WHERE shield.room_id = penalty.room_id
                AND shield.round_number = penalty.round_number
                AND shield.player_id = penalty.target_id
                AND shield.ability = 'shield'
          )
        GROUP BY penalty.player_id
    ) reflected
    WHERE result.room_id = p_room_id AND result.round_number = p_round_number
      AND result.player_id = reflected.player_id;

    PERFORM public._set_room_phase(p_room_id, 'reveal', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_pick_secure(
    p_room_code VARCHAR(6),
    p_choice_index INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_choice public.round_choices;
    v_existing INTEGER;
    v_remaining INTEGER;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND OR v_room.phase <> 'guess' THEN RAISE EXCEPTION 'Tahmin aşaması aktif değil'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.room_players
        WHERE room_id = v_room.id AND player_id = v_user_id AND is_active
    ) THEN RAISE EXCEPTION 'Bu tur tahmin gönderemezsiniz'; END IF;
    IF v_room.phase_deadline_at IS NOT NULL AND v_room.phase_deadline_at <= now() THEN
        PERFORM public.advance_expired_room_phase_secure(p_room_code);
        RETURN;
    END IF;
    SELECT * INTO v_choice FROM public.round_choices
    WHERE room_id = v_room.id AND round_number = v_room.current_round
      AND choice_index = p_choice_index;
    IF NOT FOUND THEN RAISE EXCEPTION 'Geçersiz seçenek'; END IF;
    IF v_choice.author_id = v_user_id THEN RAISE EXCEPTION 'Kendi sahte cevabını seçemezsin'; END IF;

    SELECT choice_index INTO v_existing FROM public.round_picks
    WHERE room_id = v_room.id AND round_number = v_room.current_round AND player_id = v_user_id;
    IF FOUND THEN
        IF v_existing <> p_choice_index THEN RAISE EXCEPTION 'Bu tur tahmininiz zaten gönderildi'; END IF;
        RETURN;
    END IF;
    INSERT INTO public.round_picks (room_id, round_number, player_id, choice_index)
    VALUES (v_room.id, v_room.current_round, v_user_id, p_choice_index);

    SELECT count(*)::INTEGER INTO v_remaining
    FROM public.room_players rp
    WHERE rp.room_id = v_room.id AND rp.is_active
      AND NOT EXISTS (
          SELECT 1 FROM public.round_picks p
          WHERE p.room_id = v_room.id AND p.round_number = v_room.current_round
            AND p.player_id = rp.player_id
      );
    IF v_remaining = 0 THEN
        PERFORM public.resolve_round_authoritative(v_room.id, v_room.current_round);
    ELSE
        UPDATE public.rooms SET state_version = state_version + 1, updated_at = now()
        WHERE id = v_room.id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_round_secure(p_room_code VARCHAR(6))
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_question_id TEXT;
    v_rank INTEGER;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
    IF v_room.host_id <> v_user_id THEN RAISE EXCEPTION 'Yalnızca oda kurucusu aşamayı ilerletebilir'; END IF;

    IF v_room.phase = 'ability_select' THEN
        PERFORM public._apply_round_block_effects(v_room.id, v_room.current_round);
        PERFORM public._set_room_phase(v_room.id, 'fake_answer', v_room.round_seconds);
    ELSIF v_room.phase = 'reveal' THEN
        PERFORM public._set_room_phase(v_room.id, 'scoreboard', NULL);
    ELSIF v_room.phase = 'scoreboard' THEN
        IF v_room.current_round >= v_room.total_rounds THEN
            WITH ranked AS (
                SELECT rp.player_id,
                       row_number() OVER (ORDER BY rp.score DESC, rp.joined_at ASC)::INTEGER AS rank,
                       rp.score
                FROM public.room_players rp
                WHERE rp.room_id = v_room.id AND rp.is_active
            ), recorded AS (
                INSERT INTO public.room_game_stats (room_id, game_number, user_id, score, rank)
                SELECT v_room.id, v_room.game_number, ranked.player_id, ranked.score, ranked.rank
                FROM ranked
                ON CONFLICT (room_id, game_number, user_id) DO NOTHING
                RETURNING user_id, score, rank
            ), totals AS (
                SELECT player_id, sum(answered_correctly::INTEGER) AS correct_count,
                       sum(victims_count) AS trap_count,
                       sum("zartalandın"::INTEGER) AS trapped_count
                FROM public.round_results
                WHERE room_id = v_room.id
                GROUP BY player_id
            )
            INSERT INTO public.user_stats (
                user_id, games_played, games_won, correct_answers,
                successful_traps, times_trapped, total_score, updated_at
            )
            SELECT recorded.user_id, 1, (recorded.rank = 1)::INTEGER,
                   coalesce(totals.correct_count, 0),
                   coalesce(totals.trap_count, 0),
                   coalesce(totals.trapped_count, 0),
                   recorded.score, now()
            FROM recorded
            LEFT JOIN totals ON totals.player_id = recorded.user_id
            ON CONFLICT (user_id) DO UPDATE
            SET games_played = public.user_stats.games_played + EXCLUDED.games_played,
                games_won = public.user_stats.games_won + EXCLUDED.games_won,
                correct_answers = public.user_stats.correct_answers + EXCLUDED.correct_answers,
                successful_traps = public.user_stats.successful_traps + EXCLUDED.successful_traps,
                times_trapped = public.user_stats.times_trapped + EXCLUDED.times_trapped,
                total_score = public.user_stats.total_score + EXCLUDED.total_score,
                updated_at = now();
            UPDATE public.rooms SET finished_at = now() WHERE id = v_room.id;
            PERFORM public._set_room_phase(v_room.id, 'game_over', NULL);
        ELSE
            SELECT q.id INTO v_question_id
            FROM public.questions q
            WHERE q.category_id = ANY(v_room.selected_categories)
              AND q.is_active IS DISTINCT FROM FALSE
              AND NOT EXISTS (
                  SELECT 1 FROM public.room_round_questions history
                  WHERE history.room_id = v_room.id
                    AND history.game_number = v_room.game_number
                    AND history.question_id = q.id
              )
            ORDER BY random()
            LIMIT 1;
            IF v_question_id IS NULL THEN
                RAISE EXCEPTION 'Seçilen kategorilerde tekrar etmeden oynanacak yeterli soru yok';
            END IF;
            INSERT INTO public.room_round_questions (room_id, game_number, round_number, question_id)
            VALUES (v_room.id, v_room.game_number, v_room.current_round + 1, v_question_id);
            UPDATE public.room_players
            SET is_blocked_current_round = FALSE,
                is_blocked_next_round = FALSE,
                ability_ready_round = 0
            WHERE room_id = v_room.id;
            UPDATE public.rooms SET current_round = current_round + 1,
                current_question_id = v_question_id WHERE id = v_room.id;
            PERFORM public._set_room_phase(v_room.id, 'ability_select', v_room.round_seconds);
        END IF;
    ELSE
        RAISE EXCEPTION 'Bu aşama elle ilerletilemez';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_expired_room_phase_secure(p_room_code VARCHAR(6))
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_room public.rooms;
    v_player public.room_players;
    v_choice INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND OR NOT public.is_room_member(v_room.id) THEN
        RAISE EXCEPTION 'Odaya erişim izniniz yok';
    END IF;
    IF v_room.paused_at IS NOT NULL
       OR v_room.phase_deadline_at IS NULL
       OR v_room.phase_deadline_at > now() THEN
        RETURN FALSE;
    END IF;
    IF v_room.phase = 'ability_select' THEN
        PERFORM public._apply_round_block_effects(v_room.id, v_room.current_round);
        PERFORM public._set_room_phase(v_room.id, 'fake_answer', v_room.round_seconds);
    ELSIF v_room.phase = 'fake_answer' THEN
        INSERT INTO public.round_fake_answers (room_id, round_number, player_id, fake_answer)
        SELECT v_room.id, v_room.current_round, rp.player_id, ''
        FROM public.room_players rp
        WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_blocked_current_round
        ON CONFLICT (room_id, round_number, player_id) DO NOTHING;
        PERFORM public._build_round_choices(v_room.id, v_room.current_round);
        PERFORM public._set_room_phase(v_room.id, 'guess', v_room.round_seconds);
    ELSIF v_room.phase = 'guess' THEN
        PERFORM public.resolve_round_authoritative(v_room.id, v_room.current_round);
    ELSE
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_room_secure(
    p_code VARCHAR(6),
    p_name VARCHAR(32),
    p_avatar_key VARCHAR(32)
)
RETURNS TABLE (room_id UUID, player_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_count INTEGER;
    v_name TEXT;
    v_avatar TEXT;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    v_name := left(coalesce(nullif(btrim(p_name), ''), 'Oyuncu'), 32);
    v_avatar := left(coalesce(nullif(btrim(p_avatar_key), ''), 'fox'), 128);
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_code) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
    IF v_room.phase <> 'lobby' THEN RAISE EXCEPTION 'Oyun çoktan başladı'; END IF;
    IF EXISTS (
        SELECT 1 FROM public.user_blocks b
        JOIN public.room_players rp ON rp.player_id = b.blocker_id
        WHERE rp.room_id = v_room.id AND b.blocked_id = v_user_id
    ) THEN RAISE EXCEPTION 'Bu odaya katılamazsın'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.room_players rp
        WHERE rp.room_id = v_room.id AND rp.player_id = v_user_id
    ) THEN
        SELECT count(*)::INTEGER INTO v_count
        FROM public.room_players rp
        WHERE rp.room_id = v_room.id AND rp.is_active;
        IF v_count >= v_room.max_players THEN RAISE EXCEPTION 'Oda dolu'; END IF;
    END IF;

    INSERT INTO public.room_players (
        room_id, player_id, name, avatar_key, is_host, is_ready, is_online, is_active
    ) VALUES (
        v_room.id, v_user_id, v_name, v_avatar, v_user_id = v_room.host_id, FALSE, TRUE, TRUE
    )
    ON CONFLICT ON CONSTRAINT room_players_pkey DO UPDATE
    SET name = EXCLUDED.name, avatar_key = EXCLUDED.avatar_key,
        is_online = TRUE, is_active = TRUE;
    INSERT INTO public.profiles (id, display_name, avatar_key)
    VALUES (v_user_id, v_name, v_avatar)
    ON CONFLICT (id) DO NOTHING;
    UPDATE public.rooms SET state_version = state_version + 1, updated_at = now()
    WHERE id = v_room.id;
    RETURN QUERY SELECT v_room.id, v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_room_secure(
    p_code VARCHAR(6),
    p_name VARCHAR(32),
    p_avatar_key VARCHAR(32),
    p_total_rounds INTEGER,
    p_round_seconds INTEGER,
    p_categories TEXT[]
)
RETURNS TABLE (room_id UUID, room_code VARCHAR(6), host_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
    v_clean_code VARCHAR(6) := upper(btrim(p_code));
    v_name TEXT := left(coalesce(nullif(btrim(p_name), ''), 'Oyuncu'), 32);
    v_avatar TEXT := left(coalesce(nullif(btrim(p_avatar_key), ''), 'fox'), 128);
    v_categories TEXT[];
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    IF v_clean_code !~ '^[A-Z0-9]{5,6}$' THEN RAISE EXCEPTION 'Oda kodu geçersiz'; END IF;
    IF p_total_rounds NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Tur sayısı 1-20 arasında olmalıdır'; END IF;
    IF p_round_seconds NOT BETWEEN 10 AND 180 THEN RAISE EXCEPTION 'Tur süresi 10-180 saniye arasında olmalıdır'; END IF;
    SELECT coalesce(array_agg(DISTINCT requested.category_id), ARRAY[]::TEXT[]) INTO v_categories
    FROM unnest(coalesce(p_categories, ARRAY[]::TEXT[])) AS requested(category_id)
    WHERE EXISTS (
        SELECT 1 FROM public.questions q
        WHERE q.category_id = requested.category_id AND q.is_active IS DISTINCT FROM FALSE
    );
    IF cardinality(v_categories) = 0 THEN
        RAISE EXCEPTION 'Seçilen kategorilerde kullanılabilir soru yok';
    END IF;
    IF (
        SELECT count(*) FROM public.questions q
        WHERE q.category_id = ANY(v_categories) AND q.is_active IS DISTINCT FROM FALSE
    ) < p_total_rounds THEN
        RAISE EXCEPTION 'Seçilen kategorilerde tur sayısı kadar farklı soru yok';
    END IF;
    INSERT INTO public.rooms (
        code, host_id, phase, current_round, total_rounds, round_seconds,
        selected_categories, min_players, max_players
    ) VALUES (
        v_clean_code, v_user_id, 'lobby', 1, p_total_rounds, p_round_seconds,
        v_categories, 2, 10
    ) RETURNING id INTO v_room_id;
    INSERT INTO public.room_players (
        room_id, player_id, name, avatar_key, is_host, is_ready, is_online, is_active
    ) VALUES (v_room_id, v_user_id, v_name, v_avatar, TRUE, TRUE, TRUE, TRUE);
    INSERT INTO public.profiles (id, display_name, avatar_key)
    VALUES (v_user_id, v_name, v_avatar)
    ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name, avatar_key = EXCLUDED.avatar_key;
    RETURN QUERY SELECT v_room_id, v_clean_code, v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_room_secure(p_room_code VARCHAR(6))
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_new_host UUID;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    DELETE FROM public.room_players
    WHERE room_id = v_room.id AND player_id = v_user_id;
    IF NOT FOUND THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.room_players WHERE room_id = v_room.id) THEN
        DELETE FROM public.rooms WHERE id = v_room.id;
        RETURN;
    END IF;
    IF v_room.host_id = v_user_id THEN
        SELECT player_id INTO v_new_host
        FROM public.room_players
        WHERE room_id = v_room.id AND is_active
        ORDER BY joined_at, player_id LIMIT 1;
        UPDATE public.rooms SET host_id = v_new_host,
            state_version = state_version + 1, updated_at = now()
        WHERE id = v_room.id;
        UPDATE public.room_players SET is_host = (player_id = v_new_host)
        WHERE room_id = v_room.id;
    ELSE
        UPDATE public.rooms SET state_version = state_version + 1, updated_at = now()
        WHERE id = v_room.id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rematch_room_secure(p_room_code VARCHAR(6))
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
    IF v_room.host_id <> v_user_id THEN RAISE EXCEPTION 'Yalnızca oda kurucusu yeni oyun başlatabilir'; END IF;
    IF v_room.phase <> 'game_over' THEN RAISE EXCEPTION 'Oyun henüz tamamlanmadı'; END IF;
    DELETE FROM public.round_fake_answers WHERE room_id = v_room.id;
    DELETE FROM public.round_choices WHERE room_id = v_room.id;
    DELETE FROM public.round_picks WHERE room_id = v_room.id;
    DELETE FROM public.round_results WHERE room_id = v_room.id;
    DELETE FROM public.ability_actions WHERE room_id = v_room.id;
    DELETE FROM public.round_answers WHERE room_id = v_room.id;
    DELETE FROM public.room_round_questions WHERE room_id = v_room.id AND game_number = v_room.game_number;
    UPDATE public.room_players SET
        is_ready = is_host, is_active = is_online, score = 0,
        consecutive_correct = 0, shields_available = 0, blocks_available = 0,
        is_blocked_current_round = FALSE, is_blocked_next_round = FALSE,
        last_blocked_player_id = NULL,
        ability_ready_round = 0,
        ability_uses = '{"block":0,"shield":0,"penalty":0,"counter":0}'::JSONB
    WHERE room_id = v_room.id;
    UPDATE public.rooms SET game_number = game_number + 1, current_round = 1,
        current_question_id = NULL, finished_at = NULL
    WHERE id = v_room.id;
    PERFORM public._set_room_phase(v_room.id, 'lobby', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_friend_requests_secure()
RETURNS TABLE (
    request_id UUID,
    user_id UUID,
    display_name TEXT,
    avatar_key TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT fr.id, fr.sender_id, p.display_name::TEXT, p.avatar_key, fr.created_at
    FROM public.friend_requests fr
    JOIN public.profiles p ON p.id = fr.sender_id
    WHERE auth.uid() IS NOT NULL AND fr.recipient_id = auth.uid()
      AND fr.status = 'pending'
    ORDER BY fr.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.advance_friend_request_secure(
    p_request_id UUID,
    p_action TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_request public.friend_requests;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_request FROM public.friend_requests
    WHERE id = p_request_id AND status = 'pending'
      AND (recipient_id = v_user_id OR sender_id = v_user_id)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bekleyen istek bulunamadı'; END IF;
    IF p_action = 'cancel' AND v_request.sender_id = v_user_id THEN
        UPDATE public.friend_requests SET status = 'cancelled', updated_at = now()
        WHERE id = p_request_id;
        RETURN 'none';
    ELSIF v_request.recipient_id = v_user_id AND p_action IN ('accept', 'reject') THEN
        RETURN public.respond_friend_request_secure(p_request_id, p_action = 'accept');
    END IF;
    RAISE EXCEPTION 'Bu arkadaşlık isteği üzerinde bu işlem yapılamaz';
END;
$$;

-- Disable client execution of legacy RPCs that accepted caller-supplied answers,
-- scores, or private data. Current adapters use the constrained RPCs above.
REVOKE ALL ON FUNCTION public.resolve_round_secure(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_player_profile_secure(VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_room_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_secure(VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_secure(VARCHAR, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room_secure(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_player_ready_secure(VARCHAR, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_game_secure(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_ability_secure(VARCHAR, ability_type, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_ability_selection_secure(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_fake_answer_secure(VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_round_choices_secure(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_pick_secure(VARCHAR, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_round_secure(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_expired_room_phase_secure(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rematch_room_secure(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_secure(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friendship_status_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request_secure(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_friend_request_secure(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_friends_secure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_friend_requests_secure() TO authenticated;
REVOKE ALL ON FUNCTION public._apply_round_block_effects(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_room_paused_secure(
    p_room_code VARCHAR(6),
    p_paused BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_room public.rooms;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms
    WHERE code = upper(p_room_code)
    FOR UPDATE;
    IF NOT FOUND OR NOT public.is_room_member(v_room.id) THEN
        RAISE EXCEPTION 'Oda bulunamadı veya erişim izniniz yok';
    END IF;
    IF v_room.host_id <> auth.uid() THEN
        RAISE EXCEPTION 'Oyunu yalnızca oda sahibi duraklatabilir veya devam ettirebilir';
    END IF;
    IF v_room.phase NOT IN ('ability_select', 'fake_answer', 'guess') THEN
        RAISE EXCEPTION 'Oyun bu aşamada duraklatılamaz';
    END IF;
    IF p_paused AND v_room.phase_deadline_at IS NOT NULL
       AND v_room.phase_deadline_at <= v_now THEN
        RAISE EXCEPTION 'Süre dolduğu için oyun duraklatılamaz';
    END IF;
    IF p_paused AND v_room.paused_at IS NULL THEN
        UPDATE public.rooms
        SET paused_at = v_now, state_version = state_version + 1, updated_at = v_now
        WHERE id = v_room.id;
    ELSIF NOT p_paused AND v_room.paused_at IS NOT NULL THEN
        UPDATE public.rooms
        SET phase_started_at = phase_started_at + (v_now - v_room.paused_at),
            phase_deadline_at = CASE
                WHEN phase_deadline_at IS NULL THEN NULL
                ELSE phase_deadline_at + (v_now - v_room.paused_at)
            END,
            paused_at = NULL,
            state_version = state_version + 1,
            updated_at = v_now
        WHERE id = v_room.id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_paused_secure(VARCHAR, BOOLEAN)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_room_paused_secure(VARCHAR, BOOLEAN)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_room_state_secure(p_room_code VARCHAR(6))
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_room public.rooms;
    v_user_id UUID := auth.uid();
    v_total INTEGER := 0;
    v_submitted INTEGER := 0;
    v_state JSONB;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms WHERE code = upper(p_room_code);
    IF NOT FOUND OR NOT public.is_room_member(v_room.id) THEN
        RAISE EXCEPTION 'Oda bulunamadı veya erişim izniniz yok';
    END IF;

    SELECT count(*)::INTEGER INTO v_total
    FROM public.room_players rp
    WHERE rp.room_id = v_room.id AND rp.is_active
      AND (v_room.phase <> 'fake_answer' OR NOT rp.is_blocked_current_round);

    IF v_room.phase = 'lobby' THEN
        SELECT count(*)::INTEGER INTO v_submitted FROM public.room_players rp
        WHERE rp.room_id = v_room.id AND rp.is_active AND rp.is_ready;
    ELSIF v_room.phase = 'fake_answer' THEN
        SELECT count(*)::INTEGER INTO v_submitted FROM public.round_fake_answers fa
        JOIN public.room_players rp ON rp.room_id = fa.room_id AND rp.player_id = fa.player_id
        WHERE fa.room_id = v_room.id AND fa.round_number = v_room.current_round
          AND rp.is_active AND NOT rp.is_blocked_current_round;
    ELSIF v_room.phase = 'guess' THEN
        SELECT count(*)::INTEGER INTO v_submitted FROM public.round_picks p
        JOIN public.room_players rp ON rp.room_id = p.room_id AND rp.player_id = p.player_id
        WHERE p.room_id = v_room.id AND p.round_number = v_room.current_round
          AND rp.is_active;
    END IF;

    SELECT jsonb_build_object(
        'config', jsonb_build_object(
            'code', v_room.code,
            'hostId', v_room.host_id,
            'maxPlayers', v_room.max_players,
            'minPlayers', v_room.min_players,
            'totalRounds', v_room.total_rounds,
            'roundSeconds', v_room.round_seconds,
            'selectedCategoryIds', v_room.selected_categories
        ),
        'players', coalesce((
            SELECT jsonb_object_agg(rp.player_id::TEXT, jsonb_build_object(
                'id', rp.player_id,
                'name', coalesce(profile.display_name, rp.name),
                'avatarKey', coalesce(profile.avatar_key, rp.avatar_key),
                'avatarUrl', profile.avatar_url,
                'isHost', rp.is_host,
                'isReady', rp.is_ready,
                'isOnline', rp.is_online,
                'score', rp.score,
                'abilityUsedCounts', rp.ability_uses,
                'consecutiveCorrect', rp.consecutive_correct,
                'shieldsAvailable', rp.shields_available,
                'blocksAvailable', rp.blocks_available,
                'isBlockedCurrentRound', rp.is_blocked_current_round,
                'isBlockedNextRound', rp.is_blocked_next_round,
                'blockedByPlayerId', CASE WHEN rp.is_blocked_current_round THEN (
                    SELECT block_action.player_id
                    FROM public.ability_actions block_action
                    WHERE block_action.room_id = v_room.id
                      AND block_action.round_number = v_room.current_round
                      AND block_action.ability = 'block'
                      AND block_action.target_id = rp.player_id
                      AND NOT EXISTS (
                          SELECT 1 FROM public.ability_actions shield_action
                          WHERE shield_action.room_id = v_room.id
                            AND shield_action.round_number = block_action.round_number
                            AND shield_action.player_id = rp.player_id
                            AND shield_action.ability = 'shield'
                      )
                    ORDER BY block_action.player_id
                    LIMIT 1
                ) ELSE NULL END,
                'lastBlockedPlayerId', rp.last_blocked_player_id
            ))
            FROM public.room_players rp
            LEFT JOIN public.profiles profile ON profile.id = rp.player_id
            WHERE rp.room_id = v_room.id
        ), '{}'::JSONB),
        'phase', v_room.phase,
        'currentRound', v_room.current_round,
        'currentQuestionId', v_room.current_question_id,
        'phaseStartedAt', v_room.phase_started_at,
        'phaseDeadlineAt', v_room.phase_deadline_at,
        'pausedAt', v_room.paused_at,
        'stateVersion', v_room.state_version,
        'progress', jsonb_build_object(
            'submittedCount', v_submitted,
            'totalCount', v_total,
            'completed', v_total > 0 AND v_submitted >= v_total,
            'submissionStatus', coalesce((
                SELECT jsonb_object_agg(rp.player_id::TEXT,
                    CASE
                        WHEN v_room.phase = 'lobby' THEN rp.is_ready
                        WHEN v_room.phase = 'fake_answer'
                          AND rp.is_blocked_current_round THEN TRUE
                        WHEN v_room.phase = 'fake_answer' THEN EXISTS (
                            SELECT 1 FROM public.round_fake_answers fa
                            WHERE fa.room_id = v_room.id AND fa.round_number = v_room.current_round
                              AND fa.player_id = rp.player_id
                        )
                        WHEN v_room.phase = 'guess' THEN EXISTS (
                            SELECT 1 FROM public.round_picks p
                            WHERE p.room_id = v_room.id AND p.round_number = v_room.current_round
                              AND p.player_id = rp.player_id
                        )
                        ELSE EXISTS (
                            SELECT 1 FROM public.round_results rr
                            WHERE rr.room_id = v_room.id AND rr.round_number = v_room.current_round
                              AND rr.player_id = rp.player_id
                        )
                    END
                )
                FROM public.room_players rp
                WHERE rp.room_id = v_room.id AND rp.is_active
            ), '{}'::JSONB)
        ),
        'fakeAnswers', CASE WHEN v_room.phase IN ('reveal', 'scoreboard', 'game_over') THEN coalesce((
            SELECT jsonb_object_agg(fa.player_id::TEXT, fa.fake_answer)
            FROM public.round_fake_answers fa
            WHERE fa.room_id = v_room.id AND fa.round_number = v_room.current_round
        ), '{}'::JSONB) ELSE '{}'::JSONB END,
        'choices', CASE WHEN v_room.phase IN ('reveal', 'scoreboard', 'game_over') THEN coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'choiceIndex', c.choice_index, 'text', c.text,
                'authorId', c.author_id, 'isCorrect', c.is_correct,
                'isOwnFake', c.author_id = v_user_id
            ) ORDER BY c.choice_index)
            FROM public.round_choices c
            WHERE c.room_id = v_room.id AND c.round_number = v_room.current_round
        ), '[]'::JSONB) ELSE '[]'::JSONB END,
        'picks', CASE WHEN v_room.phase IN ('reveal', 'scoreboard', 'game_over') THEN coalesce((
            SELECT jsonb_object_agg(p.player_id::TEXT, p.choice_index)
            FROM public.round_picks p
            WHERE p.room_id = v_room.id AND p.round_number = v_room.current_round
        ), '{}'::JSONB) ELSE '{}'::JSONB END,
        'answers', '{}'::JSONB,
        'abilityActions', CASE WHEN v_room.phase IN ('reveal', 'scoreboard', 'game_over') THEN coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'playerId', a.player_id, 'abilityId', a.ability, 'targetId', a.target_id
            ))
            FROM public.ability_actions a
            WHERE a.room_id = v_room.id AND a.round_number = v_room.current_round
        ), '[]'::JSONB) ELSE '[]'::JSONB END,
        'roundResults', CASE WHEN v_room.phase IN ('reveal', 'scoreboard', 'game_over') THEN coalesce((
            SELECT jsonb_object_agg(rr.player_id::TEXT, jsonb_build_object(
                'playerId', rr.player_id,
                'outcome', jsonb_build_object(
                    'correct', rr.answered_correctly,
                    'zartaladın', rr."zartaladın",
                    'zartalandın', rr."zartalandın",
                    'victimsCount', rr.victims_count,
                    'pointsEarned', rr.points_delta,
                    'labels', '[]'::JSONB
                ),
                'labels', '[]'::JSONB,
                'pointsDelta', rr.points_delta,
                'victimsCount', rr.victims_count,
                'penaltyDelta', rr.penalty_delta,
                'deceivedByAuthorId', rr.deceived_by_author_id,
                'pickedText', rr.picked_text,
                'ownFakeText', rr.own_fake_text,
                'isBlocked', rr.is_blocked
            ))
            FROM public.round_results rr
            WHERE rr.room_id = v_room.id AND rr.round_number = v_room.current_round
        ), '{}'::JSONB) ELSE '{}'::JSONB END,
        'history', '[]'::JSONB
    ) INTO v_state;
    RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_open_rooms_secure()
RETURNS TABLE (
    code VARCHAR(6),
    host_name TEXT,
    player_count INTEGER,
    phase room_phase,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT r.code, coalesce(p.display_name, rp.name)::TEXT,
           count(rp.player_id)::INTEGER, r.phase, r.created_at
    FROM public.rooms r
    JOIN public.room_players rp ON rp.room_id = r.id AND rp.is_host
    LEFT JOIN public.profiles p ON p.id = rp.player_id
    WHERE auth.uid() IS NOT NULL AND r.phase = 'lobby'
      AND (SELECT count(*) FROM public.room_players player
           WHERE player.room_id = r.id AND player.is_active) < r.max_players
    GROUP BY r.id, p.display_name, rp.name
    ORDER BY r.created_at DESC
    LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_secure()
RETURNS TABLE (
    player_id UUID,
    name TEXT,
    avatar_key TEXT,
    avatar_url TEXT,
    score BIGINT,
    games_played INTEGER,
    games_won INTEGER,
    correct_answers INTEGER,
    successful_traps INTEGER,
    times_trapped INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT p.id, p.display_name::TEXT, p.avatar_key, p.avatar_url,
           coalesce(s.total_score, 0), coalesce(s.games_played, 0),
           coalesce(s.games_won, 0), coalesce(s.correct_answers, 0),
           coalesce(s.successful_traps, 0), coalesce(s.times_trapped, 0)
    FROM public.profiles p
    LEFT JOIN public.user_stats s ON s.user_id = p.id
    WHERE auth.uid() IS NOT NULL AND coalesce(s.games_played, 0) > 0
    ORDER BY coalesce(s.total_score, 0) DESC, p.display_name ASC
    LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.nudge_player_secure(
    p_room_code VARCHAR(6),
    p_target_id UUID
)
RETURNS TABLE (from_id UUID, to_id UUID, created_at TIMESTAMPTZ, round_number INTEGER, phase TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_room public.rooms;
    v_user_id UUID := auth.uid();
    v_target public.room_players;
    v_target_done BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room
    FROM public.rooms r
    WHERE r.code = upper(p_room_code)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Oda bulunamadı'; END IF;
    IF NOT public.is_room_member(v_room.id) THEN RAISE EXCEPTION 'Odaya erişim izniniz yok'; END IF;
    IF v_user_id = p_target_id THEN RAISE EXCEPTION 'Kendini dürtemezsin'; END IF;

    SELECT * INTO v_target
    FROM public.room_players rp
    WHERE rp.room_id = v_room.id
      AND rp.player_id = p_target_id
      AND rp.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Hedef aynı odada değil'; END IF;

    IF v_room.phase = 'lobby' THEN
        v_target_done := v_target.is_ready;
    ELSIF v_room.phase = 'fake_answer' THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.round_fake_answers rfa
            WHERE rfa.room_id = v_room.id
              AND rfa.round_number = v_room.current_round
              AND rfa.player_id = p_target_id
        ) INTO v_target_done;
    ELSIF v_room.phase = 'guess' THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.round_picks rp
            WHERE rp.room_id = v_room.id
              AND rp.round_number = v_room.current_round
              AND rp.player_id = p_target_id
        ) INTO v_target_done;
    ELSE
        RAISE EXCEPTION 'Bu aşamada dürtme gönderilemez';
    END IF;
    IF v_target_done OR (
        v_room.phase = 'fake_answer' AND v_target.is_blocked_current_round
    ) THEN
        RAISE EXCEPTION 'Bu oyuncu aşamayı zaten tamamladı';
    END IF;
    IF EXISTS (
    IF EXISTS (
        FROM public.user_blocks ub
        WHERE (ub.blocker_id = v_user_id AND ub.blocked_id = p_target_id)
           OR (ub.blocker_id = p_target_id AND ub.blocked_id = v_user_id)
    ) THEN RAISE EXCEPTION 'Engellenen kullanıcılar birbirini dürtemez'; END IF;
    IF EXISTS (
        SELECT 1
        FROM public.nudges n
        WHERE n.room_id = v_room.id
          AND n.round_number = v_room.current_round
          AND n.phase = v_room.phase::TEXT
          AND n.from_id = v_user_id
          AND n.to_id = p_target_id
    ) THEN RAISE EXCEPTION 'Bu oyuncuyu bu aşamada zaten dürttün'; END IF;

    INSERT INTO public.nudges (room_id, from_id, to_id, round_number, phase)
    VALUES (v_room.id, v_user_id, p_target_id, v_room.current_round, v_room.phase::TEXT);

    RETURN QUERY
    SELECT n.from_id, n.to_id, n.created_at, n.round_number, n.phase
    FROM public.nudges n
    WHERE n.room_id = v_room.id
      AND n.round_number = v_room.current_round
      AND n.phase = v_room.phase::TEXT
      AND n.from_id = v_user_id
      AND n.to_id = p_target_id;
END;
$$;

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.signature);
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_room_state_secure(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_open_rooms_secure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_secure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nudge_player_secure(VARCHAR, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Included source: supabase\migrations\20261023000001_auth_profiles.sql
-- -----------------------------------------------------------------------------
-- Keep initial profile creation idempotent and use Google claims only once.
CREATE OR REPLACE FUNCTION public.create_profile_for_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_name TEXT;
    v_avatar_url TEXT;
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
    INSERT INTO public.profiles (id, display_name, avatar_key, avatar_url)
    VALUES (
        NEW.id,
        left(v_name, 32),
        left(coalesce(NEW.raw_user_meta_data ->> 'avatarKey', 'fox'), 128),
        CASE WHEN v_avatar_url LIKE 'https://%' THEN v_avatar_url ELSE NULL END
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_auth_user();

INSERT INTO public.profiles (id, display_name, avatar_key, avatar_url)
SELECT u.id,
       left(coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'preferred_username'), ''),
           'Oyuncu'
       ), 32),
       left(coalesce(nullif(u.raw_user_meta_data ->> 'avatarKey', ''), 'fox'), 128),
       CASE
           WHEN coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') LIKE 'https://%'
           THEN coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
           ELSE NULL
       END
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Included from 20261027000001_question_bank_and_seen_history.sql
ALTER TABLE public.questions
    ADD COLUMN IF NOT EXISTS difficulty TEXT,
    ADD COLUMN IF NOT EXISTS subcategory TEXT,
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.questions
SET status = CASE WHEN is_active IS DISTINCT FROM FALSE THEN 'approved' ELSE 'archived' END
WHERE status IS NULL;

UPDATE public.questions
SET difficulty = 'medium'
WHERE difficulty IS NULL;

ALTER TABLE public.questions
    ALTER COLUMN difficulty SET DEFAULT 'medium',
    ALTER COLUMN difficulty SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'draft',
    ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.questions'::regclass
          AND conname = 'questions_difficulty_check'
    ) THEN
        ALTER TABLE public.questions
            ADD CONSTRAINT questions_difficulty_check
            CHECK (difficulty IN ('easy', 'medium', 'hard')) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.questions'::regclass
          AND conname = 'questions_status_check'
    ) THEN
        ALTER TABLE public.questions
            ADD CONSTRAINT questions_status_check
            CHECK (status IN ('draft', 'approved', 'archived')) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.questions'::regclass
          AND conname = 'questions_source_url_check'
    ) THEN
        ALTER TABLE public.questions
            ADD CONSTRAINT questions_source_url_check
            CHECK (source_url IS NULL OR source_url ~* '^https?://') NOT VALID;
    END IF;
END;
$$;

ALTER TABLE public.questions
    VALIDATE CONSTRAINT questions_difficulty_check,
    VALIDATE CONSTRAINT questions_status_check,
    VALIDATE CONSTRAINT questions_source_url_check;

CREATE TABLE IF NOT EXISTS public.question_legacy_decoys (
    question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL,
    choice_text TEXT NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (question_id, position)
);

ALTER TABLE public.question_legacy_decoys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_legacy_decoys FROM anon, authenticated;

INSERT INTO public.question_legacy_decoys (question_id, position, choice_text)
SELECT q.id, legacy.position::INTEGER, legacy.choice_text
FROM public.questions q
CROSS JOIN LATERAL unnest(q.default_decoys) WITH ORDINALITY AS legacy(choice_text, position)
WHERE nullif(btrim(legacy.choice_text), '') IS NOT NULL
ON CONFLICT (question_id, position) DO NOTHING;

UPDATE public.questions
SET default_decoys = ARRAY[]::TEXT[]
WHERE default_decoys IS DISTINCT FROM ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS public.question_seen_history (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_seen_room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    first_seen_game_number INTEGER NOT NULL,
    first_seen_round_number INTEGER NOT NULL,
    PRIMARY KEY (user_id, category_id, question_id)
);

CREATE INDEX IF NOT EXISTS question_seen_history_user_category_idx
    ON public.question_seen_history (user_id, category_id, first_seen_at DESC);

ALTER TABLE public.question_seen_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS question_seen_history_owner_read ON public.question_seen_history;
CREATE POLICY question_seen_history_owner_read
    ON public.question_seen_history FOR SELECT TO authenticated
    USING (user_id = auth.uid());
REVOKE ALL ON public.question_seen_history FROM anon, authenticated;
GRANT SELECT ON public.question_seen_history TO authenticated;

CREATE TABLE IF NOT EXISTS public.question_reservations (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    game_number INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, category_id, question_id)
);

CREATE INDEX IF NOT EXISTS question_reservations_expiry_idx
    ON public.question_reservations (expires_at);

ALTER TABLE public.question_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_reservations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._reserve_unseen_question_for_round()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_room public.rooms;
    v_player_id UUID;
    v_question_id TEXT;
    v_available_count INTEGER;
    v_rounds_remaining INTEGER;
BEGIN
    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = NEW.room_id
    FOR UPDATE;
    IF NOT FOUND OR NEW.game_number <> v_room.game_number
       OR NEW.round_number < 1 OR NEW.round_number > v_room.total_rounds THEN
        RAISE EXCEPTION 'Soru için geçerli oyun turu bulunamadı';
    END IF;

    FOR v_player_id IN
        SELECT rp.player_id
        FROM public.room_players rp
        WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
        ORDER BY rp.player_id
    LOOP
        PERFORM pg_advisory_xact_lock(
            hashtextextended('foxmasque-question-history:' || v_player_id::TEXT, 0)
        );
        DELETE FROM public.question_reservations qr
        WHERE qr.user_id = v_player_id AND qr.expires_at <= now();
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM public.room_players rp
        WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Aktif oyuncu olmadığı için soru seçilemedi';
    END IF;

    v_rounds_remaining := v_room.total_rounds - NEW.round_number + 1;
    SELECT count(*)::INTEGER INTO v_available_count
    FROM public.questions q
    WHERE q.category_id = ANY(v_room.selected_categories)
      AND q.is_active
      AND q.status = 'approved'
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_players rp
          JOIN public.question_seen_history sh
            ON sh.user_id = rp.player_id
           AND sh.category_id = q.category_id
           AND sh.question_id = q.id
          WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_players rp
          JOIN public.question_reservations qr
            ON qr.user_id = rp.player_id
           AND qr.category_id = q.category_id
           AND qr.question_id = q.id
          WHERE rp.room_id = v_room.id
            AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
            AND qr.expires_at > now()
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_round_questions rrq
          WHERE rrq.room_id = v_room.id
            AND rrq.game_number = NEW.game_number
            AND rrq.question_id = q.id
      );

    IF v_available_count < v_rounds_remaining THEN
        RAISE EXCEPTION 'Seçilen kategorilerde oyuncuların görmediği % tur için yeterli soru yok',
            v_rounds_remaining;
    END IF;

    SELECT q.id INTO v_question_id
    FROM public.questions q
    WHERE q.category_id = ANY(v_room.selected_categories)
      AND q.is_active
      AND q.status = 'approved'
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_players rp
          JOIN public.question_seen_history sh
            ON sh.user_id = rp.player_id
           AND sh.category_id = q.category_id
           AND sh.question_id = q.id
          WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_players rp
          JOIN public.question_reservations qr
            ON qr.user_id = rp.player_id
           AND qr.category_id = q.category_id
           AND qr.question_id = q.id
          WHERE rp.room_id = v_room.id
            AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL
            AND qr.expires_at > now()
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_round_questions rrq
          WHERE rrq.room_id = v_room.id
            AND rrq.game_number = NEW.game_number
            AND rrq.question_id = q.id
      )
    ORDER BY random()
    LIMIT 1;

    IF v_question_id IS NULL THEN
        RAISE EXCEPTION 'Oyuncuların görmediği uygun soru bulunamadı';
    END IF;

    NEW.question_id := v_question_id;

    INSERT INTO public.question_reservations (
        user_id, category_id, question_id, room_id, game_number, round_number, expires_at
    )
    SELECT rp.player_id, q.category_id, q.id, v_room.id, NEW.game_number,
           NEW.round_number, now() + interval '10 minutes'
    FROM public.room_players rp
    JOIN public.questions q ON q.id = v_question_id
    WHERE rp.room_id = v_room.id AND rp.is_active AND NOT rp.is_bot AND rp.kicked_at IS NULL;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._sync_assigned_room_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_question_id TEXT;
BEGIN
    IF NEW.current_question_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT rrq.question_id INTO v_question_id
    FROM public.room_round_questions rrq
    WHERE rrq.room_id = NEW.id
      AND rrq.game_number = NEW.game_number
      AND rrq.round_number = NEW.current_round;

    IF v_question_id IS NOT NULL THEN
        NEW.current_question_id := v_question_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_round_questions_reserve_unseen ON public.room_round_questions;
CREATE TRIGGER room_round_questions_reserve_unseen
    BEFORE INSERT ON public.room_round_questions
    FOR EACH ROW EXECUTE FUNCTION public._reserve_unseen_question_for_round();

DROP TRIGGER IF EXISTS rooms_sync_assigned_question ON public.rooms;
CREATE TRIGGER rooms_sync_assigned_question
    BEFORE UPDATE OF current_question_id, current_round, game_number ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION public._sync_assigned_room_question();

CREATE OR REPLACE FUNCTION public.mark_current_question_seen_secure(p_room_code VARCHAR(6))
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_category_id TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT r.* INTO v_room
    FROM public.rooms r
    JOIN public.room_players rp
      ON rp.room_id = r.id AND rp.player_id = v_user_id AND rp.is_active
    WHERE r.code = upper(p_room_code)
      AND r.phase IN ('ability_select', 'fake_answer', 'guess')
    FOR UPDATE OF r;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Aktif oyun sorusu bulunamadı veya erişim izniniz yok';
    END IF;

    SELECT q.category_id INTO v_category_id
    FROM public.room_round_questions rrq
    JOIN public.questions q ON q.id = rrq.question_id
    WHERE rrq.room_id = v_room.id
      AND rrq.game_number = v_room.game_number
      AND rrq.round_number = v_room.current_round
      AND rrq.question_id = v_room.current_question_id;
    IF v_category_id IS NULL THEN
        RAISE EXCEPTION 'Görüntülenen tur sorusu bulunamadı';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('foxmasque-question-history:' || v_user_id::TEXT, 0)
    );

    INSERT INTO public.question_seen_history (
        user_id, category_id, question_id, first_seen_room_id,
        first_seen_game_number, first_seen_round_number
    )
    VALUES (
        v_user_id, v_category_id, v_room.current_question_id, v_room.id,
        v_room.game_number, v_room.current_round
    )
    ON CONFLICT (user_id, category_id, question_id) DO NOTHING;

    DELETE FROM public.question_reservations
    WHERE user_id = v_user_id
      AND room_id = v_room.id
      AND game_number = v_room.game_number
      AND round_number = v_room.current_round
      AND question_id = v_room.current_question_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_question_secure(p_room_code VARCHAR(6))
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_question JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılması gerekiyor';
    END IF;

    SELECT jsonb_build_object(
        'id', q.id,
        'categoryId', q.category_id,
        'prompt', q.prompt,
        'correctAnswer', CASE
            WHEN r.phase IN ('reveal', 'scoreboard', 'game_over') THEN q.correct_answer
            ELSE NULL
        END,
        'difficulty', q.difficulty,
        'subcategory', q.subcategory,
        'explanation', CASE
            WHEN r.phase IN ('reveal', 'scoreboard', 'game_over') THEN q.explanation
            ELSE NULL
        END,
        'sourceUrl', CASE
            WHEN r.phase IN ('reveal', 'scoreboard', 'game_over') THEN q.source_url
            ELSE NULL
        END,
        'status', q.status
    )
    INTO v_question
    FROM public.rooms r
    JOIN public.room_players rp
      ON rp.room_id = r.id AND rp.player_id = v_user_id AND rp.is_active
    JOIN public.room_round_questions rrq
      ON rrq.room_id = r.id
     AND rrq.game_number = r.game_number
     AND rrq.round_number = r.current_round
     AND rrq.question_id = r.current_question_id
    JOIN public.questions q ON q.id = rrq.question_id
    WHERE r.code = upper(p_room_code)
      AND r.phase IN ('ability_select', 'fake_answer', 'guess', 'reveal', 'scoreboard', 'game_over');

    IF v_question IS NULL THEN
        RAISE EXCEPTION 'Aktif soru bulunamadı veya erişim izniniz yok';
    END IF;
    RETURN v_question;
END;
$$;

REVOKE ALL ON FUNCTION public._reserve_unseen_question_for_round() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._sync_assigned_room_question() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_current_question_seen_secure(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_current_question_seen_secure(VARCHAR) TO authenticated;
REVOKE ALL ON FUNCTION public.get_current_question_secure(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_question_secure(VARCHAR) TO authenticated;

-- Included source: supabase\migrations\20261104000001_room_join_preflight.sql
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.private_room_credentials (
    room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.private_room_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_room_credentials FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.room_join_rate_limits (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    blocked_until TIMESTAMPTZ
);
ALTER TABLE public.room_join_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_join_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._record_room_join_failure(p_user_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    INSERT INTO public.room_join_rate_limits AS limits (
        user_id, failed_attempts, window_started_at, blocked_until
    )
    VALUES (p_user_id, 1, now(), NULL)
    ON CONFLICT (user_id) DO UPDATE
    SET failed_attempts = CASE
            WHEN limits.window_started_at < now() - INTERVAL '15 minutes' THEN 1
            ELSE limits.failed_attempts + 1
        END,
        window_started_at = CASE
            WHEN limits.window_started_at < now() - INTERVAL '15 minutes' THEN now()
            ELSE limits.window_started_at
        END,
        blocked_until = CASE
            WHEN CASE
                WHEN limits.window_started_at < now() - INTERVAL '15 minutes' THEN 1
                ELSE limits.failed_attempts + 1
            END >= 10 THEN now() + INTERVAL '15 minutes'
            ELSE NULL
        END;
$$;

CREATE OR REPLACE FUNCTION public.room_join_preflight_secure(p_code VARCHAR(6))
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_locked_until TIMESTAMPTZ;
    v_member BOOLEAN;
    v_member_active BOOLEAN;
    v_count INTEGER;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    IF upper(btrim(p_code)) !~ '^[A-Z0-9]{5,6}$' THEN RETURN 'unavailable'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
    SELECT blocked_until INTO v_locked_until
    FROM public.room_join_rate_limits WHERE user_id = v_user_id FOR UPDATE;
    IF v_locked_until > now() THEN RETURN 'unavailable'; END IF;

    SELECT * INTO v_room FROM public.rooms WHERE code = upper(btrim(p_code));
    IF NOT FOUND THEN
        PERFORM public._record_room_join_failure(v_user_id);
        RETURN 'unavailable';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.room_players
        WHERE room_id = v_room.id AND player_id = v_user_id
    ) INTO v_member;
    SELECT EXISTS (
        SELECT 1 FROM public.room_players
        WHERE room_id = v_room.id AND player_id = v_user_id AND is_active
    ) INTO v_member_active;
    IF v_member THEN
        IF NOT v_member_active AND v_room.phase <> 'lobby' THEN RETURN 'closed'; END IF;
    ELSE
        IF v_room.phase <> 'lobby' THEN RETURN 'closed'; END IF;
        IF EXISTS (
            SELECT 1 FROM public.user_blocks AS blocks
            JOIN public.room_players AS members ON members.player_id = blocks.blocker_id
            WHERE members.room_id = v_room.id AND blocks.blocked_id = v_user_id
        ) THEN RETURN 'unavailable'; END IF;

        SELECT count(*)::INTEGER INTO v_count
        FROM public.room_players WHERE room_id = v_room.id AND is_active;
        IF v_count >= v_room.max_players THEN RETURN 'full'; END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.private_room_credentials WHERE room_id = v_room.id
    ) AND NOT v_member THEN RETURN 'password_required'; END IF;
    RETURN 'open';
END;
$$;

REVOKE ALL ON FUNCTION public._record_room_join_failure(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.room_join_preflight_secure(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_join_preflight_secure(VARCHAR) TO authenticated;

-- Included source: supabase\migrations\20261105000001_room_invite_tokens.sql
CREATE TABLE IF NOT EXISTS public.room_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 10 CHECK (max_uses BETWEEN 1 AND 10),
    use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS room_invites_room_active_idx
    ON public.room_invites (room_id, expires_at)
    WHERE revoked_at IS NULL;
ALTER TABLE public.room_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_invites FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.room_invites IS
    'Hashed, room-scoped invites expire after 24 hours and allow at most 10 successful new memberships.';

CREATE OR REPLACE FUNCTION public.create_room_invite_secure(p_room_code VARCHAR(6))
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_token TEXT;
    v_active_invites INTEGER;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    SELECT * INTO v_room FROM public.rooms
    WHERE code = upper(btrim(p_room_code)) FOR UPDATE;
    IF NOT FOUND OR v_room.phase <> 'lobby' OR NOT EXISTS (
        SELECT 1 FROM public.room_players
        WHERE room_id = v_room.id AND player_id = v_user_id AND is_active
    ) THEN RAISE EXCEPTION 'Bu oda için davet oluşturulamıyor'; END IF;

    DELETE FROM public.room_invites
    WHERE room_id = v_room.id
      AND (revoked_at IS NOT NULL OR expires_at <= now() OR use_count >= max_uses);
    SELECT count(*)::INTEGER INTO v_active_invites
    FROM public.room_invites
    WHERE room_id = v_room.id AND revoked_at IS NULL
      AND expires_at > now() AND use_count < max_uses;
    IF v_active_invites >= 20 THEN
        RAISE EXCEPTION 'Bu oda için etkin davet sınırına ulaşıldı';
    END IF;
    v_token := rtrim(
        translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'),
        '='
    );
    INSERT INTO public.room_invites (
        room_id, created_by, token_hash, expires_at, max_uses
    ) VALUES (
        v_room.id, v_user_id, extensions.digest(v_token, 'sha256'),
        now() + INTERVAL '24 hours', 10
    );
    RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_room_invite_secure(
    p_code VARCHAR(6), p_name VARCHAR(32), p_avatar_key VARCHAR(32), p_invite_token TEXT
)
RETURNS TABLE (room_id UUID, player_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room public.rooms;
    v_member public.room_players;
    v_invite public.room_invites;
    v_locked_until TIMESTAMPTZ;
    v_count INTEGER;
    v_name TEXT;
    v_avatar TEXT;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
    IF p_invite_token IS NULL OR p_invite_token !~ '^[A-Za-z0-9_-]{43}$' THEN RETURN; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
    SELECT blocked_until INTO v_locked_until FROM public.room_join_rate_limits
    WHERE user_id = v_user_id FOR UPDATE;
    IF v_locked_until > now() THEN RETURN; END IF;

    SELECT * INTO v_room FROM public.rooms
    WHERE code = upper(btrim(p_code)) FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM public._record_room_join_failure(v_user_id);
        RETURN;
    END IF;

    SELECT * INTO v_member FROM public.room_players
    WHERE public.room_players.room_id = v_room.id
      AND public.room_players.player_id = v_user_id FOR UPDATE;
    IF FOUND THEN
        IF NOT v_member.is_active AND v_room.phase <> 'lobby' THEN RETURN; END IF;
        UPDATE public.room_players
        SET name = left(coalesce(nullif(btrim(p_name), ''), public.room_players.name), 32),
            avatar_key = left(coalesce(nullif(btrim(p_avatar_key), ''), public.room_players.avatar_key), 128),
            is_online = TRUE, is_active = TRUE
        WHERE public.room_players.room_id = v_room.id
          AND public.room_players.player_id = v_user_id;
        UPDATE public.rooms SET state_version = state_version + 1, updated_at = now()
        WHERE public.rooms.id = v_room.id;
        RETURN QUERY SELECT v_room.id, v_user_id;
        RETURN;
    END IF;

    SELECT * INTO v_invite FROM public.room_invites
    WHERE room_invites.room_id = v_room.id
      AND room_invites.token_hash = extensions.digest(p_invite_token, 'sha256')
    FOR UPDATE;
    IF NOT FOUND OR v_invite.revoked_at IS NOT NULL OR v_invite.expires_at <= now()
       OR v_invite.use_count >= v_invite.max_uses THEN
        PERFORM public._record_room_join_failure(v_user_id);
        RETURN;
    END IF;
    IF v_room.phase <> 'lobby' THEN RAISE EXCEPTION 'Oyun çoktan başladı'; END IF;
    IF EXISTS (
        SELECT 1 FROM public.user_blocks AS blocks
        JOIN public.room_players AS members ON members.player_id = blocks.blocker_id
        WHERE members.room_id = v_room.id AND blocks.blocked_id = v_user_id
    ) THEN RETURN; END IF;
    SELECT count(*)::INTEGER INTO v_count FROM public.room_players
    WHERE room_players.room_id = v_room.id AND room_players.is_active;
    IF v_count >= v_room.max_players THEN RAISE EXCEPTION 'Oda dolu'; END IF;

    v_name := left(coalesce(nullif(btrim(p_name), ''), 'Oyuncu'), 32);
    v_avatar := left(coalesce(nullif(btrim(p_avatar_key), ''), 'fox'), 128);
    INSERT INTO public.room_players (
        room_id, player_id, name, avatar_key, is_host, is_ready, is_online, is_active
    ) VALUES (
        v_room.id, v_user_id, v_name, v_avatar, v_user_id = v_room.host_id, FALSE, TRUE, TRUE
    );
    INSERT INTO public.profiles (id, display_name, avatar_key)
    VALUES (v_user_id, v_name, v_avatar) ON CONFLICT (id) DO NOTHING;
    UPDATE public.room_invites SET use_count = use_count + 1
    WHERE room_invites.id = v_invite.id;
    DELETE FROM public.room_join_rate_limits WHERE user_id = v_user_id;
    UPDATE public.rooms SET state_version = state_version + 1, updated_at = now()
    WHERE public.rooms.id = v_room.id;
    RETURN QUERY SELECT v_room.id, v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_room_invite_secure(VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_room_invite_secure(VARCHAR, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_room_invite_secure(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_invite_secure(VARCHAR, VARCHAR, VARCHAR, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_suspect_pick_secure(p_room_code CHARACTER VARYING,p_suspect_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE v_room public.rooms%ROWTYPE; v_detective UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açılması gerekiyor'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE code=upper(p_room_code) FOR UPDATE;
  IF NOT FOUND OR v_room.phase<>'guess' THEN RAISE EXCEPTION 'Şüpheli tahmini yalnız tahmin aşamasında yapılabilir'; END IF;
  IF v_room.game_mode NOT IN ('suspicious','detective_fox') THEN RAISE EXCEPTION 'Bu mod şüpheli tahmini kullanmıyor'; END IF;
  IF p_suspect_id=auth.uid() THEN RAISE EXCEPTION 'Kendini seçemezsin'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND player_id=auth.uid() AND is_active)
     OR NOT EXISTS(SELECT 1 FROM public.room_players WHERE room_id=v_room.id AND player_id=p_suspect_id AND is_active)
  THEN RAISE EXCEPTION 'Geçersiz oyuncu'; END IF;

  IF v_room.game_mode='detective_fox' THEN
    SELECT rp.player_id INTO v_detective
    FROM public.room_players rp WHERE rp.room_id=v_room.id AND rp.is_active
    ORDER BY rp.player_id
    OFFSET ((v_room.current_round-1) % GREATEST((SELECT count(*) FROM public.room_players x WHERE x.room_id=v_room.id AND x.is_active),1))
    LIMIT 1;
    IF auth.uid() IS DISTINCT FROM v_detective THEN RAISE EXCEPTION 'Bu tur yalnız dedektif şüpheli seçebilir'; END IF;
  END IF;

  INSERT INTO public.round_suspect_picks(room_id,round_number,player_id,suspect_player_id)
  VALUES(v_room.id,v_room.current_round,auth.uid(),p_suspect_id)
  ON CONFLICT(room_id,round_number,player_id) DO NOTHING;
  RETURN TRUE;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_suspect_pick_secure(CHARACTER VARYING,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_suspect_pick_secure(CHARACTER VARYING,UUID) TO authenticated, service_role;
