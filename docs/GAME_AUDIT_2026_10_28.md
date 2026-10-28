# Game audit — 28 October 2026

## Fixed

- Reproduced `question_reservations_user_id_fkey` with a host and a test bot.
  Bot IDs are room identities, not Auth users. Reservations and history checks
  now include only active, non-kicked humans. The Auth foreign key, RLS and
  internal function restrictions remain intact.
- The live suspect RPC had regressed to an older implementation that returned
  success without recording a choice and rejected Detective Fox. Restored the
  version with participant/detective authorization and persisted choices.
  Client errors now propagate to the question screen.
- Kept avatar hooks unconditional when switching between special and generated
  avatars, preventing hook-order failures.
- Fixed automatic Gizli Tilki advancement leaving `busy` permanently true when
  its own state update ran the effect cleanup. Requests now always release their
  lock, with a separate guard against overlapping automatic actions.
- Moved Tilki Aramızda's button component out of render and stored the result
  screen's initial round snapshot in state instead of reading a ref in render.
- Installed the missing lint tools and pinned the test runner. `npm test` now
  discovers every test file and uses the Node loader without the CLI's IPC pipe.
  Validation also runs for direct pushes to main.

## Verification

- 123 automated tests passed; TypeScript and the web export passed.
- 20 database smoke scenarios passed on the connected Supabase database.
  All changes in these scenarios were rolled back. See
  `supabase/tests/game_mode_smoke.sql` for the repeatable assertions.
- All nine question modes completed three rounds and game-over with four humans.
  Eight supported question modes also completed with one human and three bots.
  Assertions cover human-only reservations/statistics, idempotent seen history,
  fresh round questions, answer privacy, saved suspects and round transitions.
- Orman Hazinesi finished with humans and with bots; Gizli Tilki completed its
  voting/action/operation flow with humans. Unsupported bot modes remain disabled.
- The user FK remains in place; anon cannot call the suspect RPC, and neither
  anon nor authenticated users can directly invoke the reservation trigger.
- Applied migration: `20261028182507_human_question_reservations_and_suspect_picks`.

## Remaining findings and limits

### Waiting-screen follow-up

The reported waiting screen mixed a local prototype completion mark with an old
server counter. The real human answer was stored, but the two bots had not
answered and the bluff deadline had expired. Timeout reconciliation previously
lived in question/ability screens, so leaving those screens removed recovery.

Room synchronization now runs in the persistent store, reads authoritative state
every two seconds, respects pauses, and advances expired timed phases. Bot turns
also refresh state immediately. Live waiting uses only server submission status,
routes back to the question when guessing starts, and hides simulation controls.
Snapshot version comparisons are scoped to a room so an older room cannot block
the initial state of a newly created room.

139 automated tests, TypeScript and web export passed. The rolled-back database
test `supabase/tests/waiting_recovery.sql` reproduced one human answer plus two
silent bots, recovered the expired bluff phase, recorded both bot guesses and
reached reveal. This verifies the waiting recovery path in addition to direct
bot RPC behavior; multi-device visual testing remains outside these checks.

- Lint still reports 10 errors and 69 warnings in existing code, mostly React
  compiler diagnostics around effect-based state resets, ref handling and hook
  dependency arrays. Lint is not reported as passing. No rules were suppressed.
- The repository and database had migration-history drift before this change.
  Earlier migration history was not rewritten or replayed. The new migration's
  filename matches its actual applied version.
- Supabase advisors retain findings about callable privileged RPCs, guest access,
  internal tables with RLS but no policies, missing FK indexes and disabled leaked
  password protection. These require intent-specific review; RPC warnings alone
  do not establish an authorization vulnerability. Useful references:
  [database advisors](https://supabase.com/docs/guides/database/database-advisors),
  [function execution](https://supabase.com/docs/guides/database/functions),
  [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Database scenarios invoke real RPCs with test session claims inside rolled-back
  transactions; they are not a multi-device browser or native UI test. Real-device
  timing, reconnects and every possible gameplay combination remain unverified.
