# Kızılkuyruk — Store release checklist

This checklist is a release gate, not a statement that the app is already approved
or ready for submission. Repository changes can prepare builds; Apple and Google
developer accounts, store records, legal declarations and real-device review
remain external release steps.

## Build pipeline

- [ ] Create/link the Expo EAS project with `eas init`; commit the generated
  `extra.eas.projectId` and set the correct Expo owner in `app.json`.
- [ ] Configure EAS production environment variables:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] Verify Supabase Google OAuth provider settings and add the native
  `foxmasque://auth/callback` URI plus the current production web callback.
- [ ] Run `eas build --platform all --profile preview` and install both builds.
- [ ] Run `eas build --platform all --profile production` after all release gates pass.
- [ ] Confirm the final iOS bundle ID (`com.foxmasque.game`), Android package
  (`com.foxmasque.game`), app version and incremented native build numbers.

## Store blockers to resolve before submission

- [ ] Set the Google Play account-deletion URL to
  `https://dogussyaman.github.io/K-z-lkuyruk/account-deletion` and verify it
  works in a signed-out browser before submission.
- [ ] Configure Sign in with Apple in Apple Developer and Supabase (Services ID,
  Team ID, Key ID, private key and Supabase callback URL). The iOS app now
  exposes an Apple sign-in action; do not submit until this provider is enabled
  and tested on a real iOS device.
- [ ] Verify report/block controls and assign a person to review the private
  `player_reports` queue. Publish the moderation and appeals process.
- [ ] Publish a public privacy policy that accurately describes Supabase Auth,
  Google sign-in, email/password sign-in, profile names, avatars, friend
  relationships, game-room activity, gameplay statistics, uploaded profile
  images, retention and deletion. Add its URL to both store records and in-app
  settings.
- [ ] Deploy and end-to-end test the in-app account deletion flow and public
  account-deletion URL on a test account before store submission.
- [ ] Verify deletion removes the Auth identity, avatar storage, friendships,
  blocks, stats, historical round references, private game state and invites.
  Active games intentionally block deletion until the player leaves; host-only
  rooms are handed off or closed.
- [ ] Publish terms of service and a support/contact page with a monitored
  contact channel. Confirm the legal operator name and contact details.
- [ ] Complete Apple App Privacy and Google Play Data safety declarations from
  the actual production data flows. Never place a service-role key in a client
  build or an `EXPO_PUBLIC_*` variable.
- [ ] Review user-generated names, avatars and in-game messages for reporting,
  blocking, moderation and abuse handling. Ensure the store listing accurately
  describes the available controls.
- [ ] Verify age rating, content descriptors, export-compliance answers and
  account/login review instructions.

## iOS App Store

- [ ] Apple Developer Program membership and App Store Connect app record.
- [ ] App icon, launch/splash presentation and required iPhone screenshots.
- [ ] Because iPad support is enabled, test iPad layouts and prepare iPad
  screenshots; otherwise explicitly decide whether to disable tablet support.
- [ ] Test Google OAuth, email registration, email confirmation, password
  recovery, session restoration, account deletion and sign-out on a physical
  iPhone and iPad.
- [ ] Provide a review account or a clear review path that does not depend on
  finding other live players.

## Google Play

- [ ] Google Play Console app record, signed Android App Bundle and internal
  testing track.
- [ ] 512×512 store icon, feature graphic 1024×500, phone screenshots and
  localized Turkish listing.
- [ ] Complete Data safety, content rating, target API and account-deletion
  declarations using the current Play Console requirements.
- [ ] Publish and verify the public account-deletion URL.
- [ ] Test install, update, deep links, OAuth return, permissions and session
  recovery on supported Android versions and screen sizes.

## Gameplay and backend release gates

- [ ] Run the complete automated suite, TypeScript check, lint, web export and
  Expo Doctor on the exact release commit.
- [ ] Apply only reviewed, additive Supabase migrations after checking the
  live schema and migration history. Never replay `supabase/schema.sql` on
  the populated production project.
- [ ] Run the SQL game-mode smoke suite on a disposable/test database and
  retain the results with the release.
- [ ] Manually test all 16 listed modes, including 2–10 player boundaries,
  minimum-player rules, host handoff, reconnect, pause/resume, timeout,
  duplicate actions, simultaneous submissions, rematch and game-over.
- [ ] Test the five distinct party games on multiple physical devices, with
  hidden-role/private-state checks and a reconnect during every phase.
- [ ] Test bot availability only in modes explicitly supported by the server;
  do not advertise test bots as a production matchmaking feature.
- [ ] Verify crash reporting, moderation response, support response ownership
  and a rollback plan before public rollout.

## Current known gaps

- EAS profiles are defined in `eas.json`, but the project still needs an EAS
  project ID/owner and production environment configuration.
- Native build numbers are initialized at 1 and configured for remote
  auto-increment in EAS.
- The account cleanup migration and JWT-protected Edge Function are deployed.
  The in-app request screen is in PR #30; a real end-to-end test with a
  disposable account remains required.
- A published privacy policy, terms and a monitored support contact are still
  required before store submission.
- The production Supabase migration history differs from the repository
  migration filenames. Compare actual schema/function definitions before
  applying any pending migration.
- CI now includes lint, web export and Expo Doctor; resolve every failing check
  before treating the branch as release-ready.
