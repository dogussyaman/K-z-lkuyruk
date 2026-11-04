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
2. Add `https://dogussyaman.github.io/K-z-lkuyruk/auth/callback` to the
   Supabase Auth redirect URL allowlist.
3. Under **Settings → Pages**, set the publishing source to **GitHub Actions**.
4. Push a commit to `main` or run the workflow manually.

The workflow builds for the repository Pages subpath and publishes a `404.html`
fallback so Expo Router routes continue to work when opened directly or
refreshed. This base path is only applied during the web deployment; it does
not change the iOS or Android app configuration. For a custom Pages domain,
add the Actions variable `EXPO_PUBLIC_BASE_URL` with the value `/`.

## Native iOS and Android builds (EAS)

The repository includes development, preview and production profiles in
`eas.json`. Before the first native build:

1. Run `eas init` and commit the generated EAS project ID/owner.
2. Configure the EAS production environment with
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Build an installable preview with
   `eas build --platform all --profile preview`.
4. After the release checklist passes, build with
   `eas build --platform all --profile production`.

Production builds use remote version management and auto-increment native
build numbers. Store submission still requires the App Store Connect and
Google Play Console records, signing credentials, legal disclosures and
review assets. See [Store release checklist](docs/STORE_RELEASE_CHECKLIST.md).

## Supabase schema and production migration safety

The production Supabase project currently records 20 migrations. The repository
also contains 29 SQL migration files that do not have matching production
history entries. Some of their schema changes appear in the live database,
which indicates that at least part of the history was applied manually or
through a different migration sequence.

**Do not run `supabase db push`, `supabase migration up`, `supabase db reset`,
or the combined `supabase/schema.sql` against the production project until the
remaining migration files have been reconciled against the live schema.**
Blindly applying them can duplicate columns, constraints, triggers or
functions. The exact recorded versions, unrecorded files and verification
results are tracked in
[the Supabase migration audit](docs/SUPABASE_MIGRATION_AUDIT.md).

The following production changes are already applied and recorded:

- `20261103121201_team_battle_start_guard.sql`
- `20261103121205_double_trap_two_player_answers.sql`
- `20261103121209_account_deletion.sql`
- `20261103122647_player_reporting.sql`

The game-mode, account-deletion and player-reporting SQL smoke tests were run
against production using synthetic data inside rollback transactions. No
synthetic test accounts or game records were retained.

For a brand-new Supabase project, first reconcile and validate the complete
migration chain on a disposable project. The current combined schema file is
not yet a verified clean-install baseline for the latest account-deletion and
player-reporting features. Do not use it as a substitute for that validation.

Account deletion is handled by the JWT-protected `delete-account` Edge
Function. Player reports are submitted through `report_player_secure`; the
private moderation queue is `public.player_reports`. See
[the content moderation workflow](docs/CONTENT_MODERATION.md).

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
need domain association files and platform account configuration.

Questions use one prompt and one correct answer. New question rows default to
`status = 'draft'` and are excluded from games until reviewed and approved.
Question selection reserves an unseen question for active room members, while
the player's history is written only after the question screen acknowledges
that the question was displayed. A depleted unseen pool returns an error
instead of silently repeating a question.

There is no in-app question-admin screen. For a reviewed live import, use the
Supabase Table Editor CSV import for `public.questions`, supplying at minimum
`id`, `category_id`, `prompt`, `correct_answer`, and `explanation`.
Omit `default_decoys`; do not import AI-generated content directly as
approved. Review each row, then explicitly set `status = 'approved'` and
`is_active = true` before it can be selected.

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

## Sign in with Apple setup

The iOS login screen includes an Apple sign-in action to meet the platform's
third-party sign-in requirements. It will not work until the Apple provider is
configured:

1. In Apple Developer, enable **Sign in with Apple** for the app identifier
   `com.foxmasque.game`.
2. Create a Services ID and configure the web authentication domain
   `sjryoojjaqrhvligjqjs.supabase.co` with this return URL:
   `https://sjryoojjaqrhvligjqjs.supabase.co/auth/v1/callback`.
3. Create a Sign in with Apple key and keep its private key secure.
4. In Supabase Dashboard → Authentication → Providers → Apple, enable the
   provider and enter the Services ID, Team ID, Key ID and private key.
5. In Supabase Auth URL Configuration, allow
   `foxmasque://auth/callback` for native sign-in and the deployed HTTPS
   `/auth/callback` route for web.
6. Test first-time and returning Apple sign-in on a physical iOS device,
   including the case where Apple provides the user's name only on first
   authorization.

Do not submit the iOS build while Apple sign-in is unconfigured or untested.

Email/password accounts use Supabase Auth. Configure email confirmation and
SMTP in Supabase as appropriate for production. Password recovery redirects to
the same callback route and allows the user to set a new password after
Supabase verifies the recovery link. OAuth and email identities are not
automatically merged based only on matching email addresses.

## Checks

Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build:web`.
