# Kızılkuyruk

Çevrim içi oyun kataloğu: Klasik Blöf, Tilki Soygunu, Kızıl Pakt, Kilit Altında,
Kayıp Kare ve Gece Pazarı. Kurallar ve veritabanı kurulumu: [Party games](docs/PARTY_GAMES.md).
Yeni beş oyun için `20261029074751_distinct_party_games.sql` migrationı gerekir.


## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The legacy
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` is also accepted. Leave both keys unset to
   use the local demo service.
3. Start the app with `npm run dev`.

Only the Supabase project URL and publishable/legacy anon key are used by the
client. Never place a `service_role` key or Google OAuth client secret in an
`EXPO_PUBLIC_*` variable.

## GitHub Pages deployment

The `Deploy web to GitHub Pages` workflow builds and deploys the web app when
changes are pushed to `main`, or when started manually from GitHub Actions.
Before the first run:

1. Add the repository Actions variables `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` under **Settings → Secrets and
   variables → Actions → Variables**. These are public client credentials;
   never use a Supabase `service_role` key here.
2. Add `https://dogussyaman.github.io/zartix-main/auth/callback` to the
   Supabase Auth redirect URL allowlist.
3. Under **Settings → Pages**, set the publishing source to **GitHub Actions**.
4. Push a commit to `main` or run the workflow manually.

The workflow builds for the repository Pages subpath and publishes a `404.html`
fallback so Expo Router routes continue to work when opened directly or
refreshed. This base path is only applied during the web deployment; it does
not change the iOS or Android app configuration. For a custom Pages domain,
add the Actions variable `EXPO_PUBLIC_BASE_URL` with the value `/`.

## Supabase schema

- For a brand-new, empty Supabase project, run `supabase/schema.sql` once in
  the SQL Editor. It contains the schema and functions assembled from the
  migrations, including the profile trigger needed by Supabase Auth, current
  round-block behavior, synchronized room pause support, room-join preflight,
  and hashed room-invite functions. Then run
  `supabase/migrations/20261030000001_private_room_access.sql` once to enable
  password-protected rooms, followed by
  `supabase/migrations/20261031000001_player_discovery_weekly_leaderboard.sql`.
  Do not run `20261101000001_block_only_fake_answers.sql` after the combined
  schema; that behavior is already included.
- For a project where migrations have already been applied, do not run the
  combined schema. Apply only pending files in `supabase/migrations/` in
  timestamp order, including `20261024000001_fix_join_room_ambiguity.sql` to
  fix the room-join RPC and `20261025000001_fix_nudge_round_ambiguity.sql`
  to fix the nudge RPC, and `20261026000001_choices_correct_and_player_fakes_only.sql`
  to exclude question distractors from the answer pool, followed by
  `20261027000001_question_bank_and_seen_history.sql` for question metadata,
  per-player repeat prevention, and confirmed-seen tracking. Apply any later
  pending question-bank/avatar migrations (including `20261028000001` and
  `20261029000001`) before `20261030000001_private_room_access.sql`.
  Then apply `20261031000001_player_discovery_weekly_leaderboard.sql` for
  authenticated player search and weekly/friends leaderboard scopes, followed
  by `20261101000001_block_only_fake_answers.sql` so blocks prevent only fake
  answer submission, then `20261102000001_apply_block_during_current_round.sql`
  so blocks take effect in the round where they are selected, followed by
  `20261103000001_room_pause_controls.sql` for host-controlled room pauses.
  Then apply `20261104000001_room_join_preflight.sql` and
  `20261105000001_room_invite_tokens.sql`. Do not edit or re-run the combined
  schema to install these updates.

The combined schema includes the current-round block behavior. Existing
installations should apply `20261102000001_apply_block_during_current_round.sql`
after their previously applied migrations; it replaces the active RPC
definitions, clears any queued next-round block flags, and makes an expired
guess phase resolve without awarding points to players who did not choose.
Apply `20261103000001_room_pause_controls.sql` after it to let the host pause
the live room for everyone while preserving the remaining phase time.
Existing databases should apply `20261104000001_room_join_preflight.sql` and
`20261105000001_room_invite_tokens.sql` after the prior migrations. A preflight
response only controls which form is shown; the join RPC rechecks room access,
capacity, phase, membership, and password/invite authorization transactionally.

The app saves only a versioned room code and authenticated player ID locally.
The saved reference is not game state or access authorization: startup loads the
current Supabase session, verifies membership, and fetches current state before
offering a return to the game. Intentional leave and completed matches clear the
reference. Supabase remains authoritative for submissions, timers, phases, and
scores.

Room-share links use the existing `foxmasque` scheme on native and the current
HTTPS origin on web. Private-room share links contain a random 256-bit,
room-scoped bearer invite; only its SHA-256 hash is stored in Supabase. Invites
expire after 24 hours, allow up to 10 new memberships each, and are capped at 20
active invites per room. They do not contain or replace the room password.
Custom-scheme links work only where the app is installed; a production web host
is required for the web fallback. iOS Universal Links/Android App Links still
need domain association files and platform account configuration. No QR-code
generator dependency exists in this project, so QR presentation is not included.

The private-room migration installs `pgcrypto` in the Supabase `extensions`
schema. Room passwords are stored only as salted bcrypt hashes, and private
rooms are excluded from the public-room listing. The join RPC rate-limits
failed attempts per authenticated user. Configure Supabase Auth's anonymous
sign-in rate limits as an additional safeguard; database-only rate limiting
cannot identify an IP address reliably.
The local demo adapter keeps its mock room password only in transient
in-memory state; production access control is enforced by Supabase RPCs.

Questions use one prompt and one correct answer. Legacy distractors are moved
to the restricted `question_legacy_decoys` archive before the live question
rows are cleared; no existing values are discarded. New rows default to
`status = 'draft'` and are excluded from games until reviewed and approved.
Question selection reserves an unseen question for active room members, while
the player's history is written only after the question screen acknowledges
that it was displayed. A depleted unseen pool returns an error instead of
silently repeating a question.

Weekly rankings include completed games recorded after the player-discovery
migration; earlier game snapshots have no reliable completion timestamp and
are intentionally excluded from weekly results. All-time rankings are
unchanged. The weekly score is the sum of a player's completed-match scores
over the preceding seven days.

There is no in-app question-admin screen. For a reviewed live import, use the
Supabase Table Editor CSV import for `public.questions`, supplying at minimum
`id`, `category_id`, `prompt`, `correct_answer`, and `explanation`; optionally
include `difficulty`, `subcategory`, and `source_url`. Omit
`default_decoys`; do not import AI-generated content directly as approved.
Keep imported category IDs among the app's existing categories. Review each
row, then explicitly set `status = 'approved'` and `is_active = true` before
it can be selected. The local demo question set is bundled in the app and is
not changed by a Supabase CSV import.

The profile row uses the same UUID as `auth.users.id`; no separate Google or
email account table is created.


### Follow-up migrations for the current multiplayer rules

For both fresh and existing Supabase projects, apply all remaining migrations that
have not already run in timestamp order. In particular, migrations newer than
`20261105000001_room_invite_tokens.sql` must not be skipped. Apply
`20261114000001_restore_fake_answer_room_lock.sql` after the earlier pending
migrations: it restores the room-row lock in the secure fake-answer RPC while
preserving its user-friendly validation errors and shared guess-phase deadline
reset. Then apply `20261115000001_survival_mode_and_cleanup_security.sql` to add Classic/Survival mode metadata,
server-authoritative life loss and elimination, and safer cleanup-function permissions. These are forward-only
migrations; do not edit or re-run `supabase/schema.sql` on an existing database.

## Google OAuth setup

1. In Google Cloud Console, create an OAuth client for the application
   platform(s) you use and configure the consent screen. Add your web origins
   and production domains where requested.
2. In Supabase Dashboard, open **Authentication → Providers → Google**, enable
   Google, and paste the Google OAuth client ID and client secret. Keep the
   client secret only in Supabase Dashboard.
3. Copy the Supabase **Callback URL (for OAuth)** shown by the Google provider
   settings into the Google OAuth client's **Authorized redirect URIs**. This
   is the Supabase callback URL, not the app's callback route.
4. In Supabase **Authentication → URL Configuration**, set the production web
   site as the Site URL and add the allowed redirect URLs:
   - `foxmasque://auth/callback` for a native build using the configured app
     scheme.
   - `https://YOUR-WEB-HOST/auth/callback` for each deployed web host.
   - The Expo development callback URL shown by the running app when testing
     in Expo Go, if you use that workflow.
5. Configure the same web callback route on the hosting provider to serve the
   Expo Router single-page app for `/auth/callback`.
6. For native builds, rebuild/reinstall after changing the `foxmasque` scheme.
   For web, serve the app on an allowed HTTPS origin. The app uses Supabase
   PKCE and returns OAuth sessions through `/auth/callback`.

Email/password accounts use Supabase Auth. Configure email confirmation and
SMTP in Supabase as appropriate for production. Password recovery redirects to
the same callback route and allows the user to set a new password after
Supabase verifies the recovery link. OAuth and email identities are not
automatically merged based only on matching email addresses.

## Checks

Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build:web`.
