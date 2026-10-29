# Kızılkuyruk: distinct online party games

The main catalog now has six games. Quiz scoring/timing variants live under
Klasik Blöf's match settings, rather than posing as separate games. Existing
rooms, old engine IDs and local Tilki Aramızda remain compatible.

| Game | Players | Decision and end condition |
|---|---:|---|
| Klasik Blöf | 2–10 | Existing trivia/bluff engine; nine selectable rule variants |
| Tilki Soygunu | 4–8 | Secret open/guard/steal actions; five jobs, three alarms lose the shared escape; only two steals per player |
| Kızıl Pakt | 6–10 | Hidden fox/scout/keeper roles, actual and claimed locations, site evidence, private scout candidates; majority exposes or detains without eliminating players; two protections per keeper, at most one supply loss per night |
| Kilit Altında | 3–6 | Split symbol-order, symbol-to-color and reversal clues; consensus opens four locks before three errors |
| Kayıp Kare | 4–8 | Different crops of six curated vector scenes, one impostor sees a different scene; two clue stages, vote, then an impostor last-guess opportunity |
| Gece Pazarı | 3–6 | Each player sells once; exact seller appraisal vs private buyer intervals, sealed bids, no sale on highest-bid ties; final cash plus actual assets |

All five new games use individual devices and in-game short messages, without
requiring microphones or a physical gathering. Rules, private information,
validation, timers, votes, balances, results and game statistics are server-owned.

## Persistence and permissions

Migration: `20261029074751_distinct_party_games.sql` (version matches production).

- `rooms.party_mode` is an additive discriminator for the independent party
  engine. `rooms.game_mode` retains its legacy trivia value, so historical
  migrations and existing rooms do not need destructive rewrites. The Supabase
  adapter reads the discriminator and exposes the correct client game ID.
- Engine tables and helper functions live in `kizilkuyruk_private`, a schema
  unavailable to anon/authenticated roles. Tables have RLS and explicit deny
  policies. Player identities reference room participants, allowing test bots
  without fake Auth accounts.
- The eight public RPCs explicitly require a signed-in user. Read/action/message
  access requires active room membership; start/pause/bot control require the
  host. Internal functions are not client-executable.
- State responses expose only the caller's role/clues/appraisal, shared evidence
  and submission status. Other roles appear at game end. Auction bids and actual
  asset values remain server-side until resolution/final scoring.
- Actions are locked once per stage. A step token rejects late submissions.
  Pause/resume shifts deadlines. Any active member can reconcile expired stages;
  reports also auto-advance after their deadline, without depending on one screen.
- State revisions and game numbers prevent delayed polls overwriting newer turns
  or rematches. Game statistics are recorded once per game for real humans only.

## Verification

- 145 automated Node tests, TypeScript, and production web export passed.
- `supabase/tests/distinct_party_games.sql`: completed all five games using real
  RPCs with a human fixture and bots; checked private-state responses, outsider
  rejection, stale-stage rejection, duplicate actions, pauses, message limits,
  bot behavior, terminal states and human-only statistics. Transaction rolled back.
- `supabase/tests/party_edge_cases.sql`: verified idle-match timeout termination,
  protected sites, role restrictions, majority exposure without elimination,
  exposed-fox restrictions, tied auctions, overdrafts, commissions, asset
  accounting, and both impostor last-guess outcomes. Transaction rolled back.
- New party engine/UI files pass focused ESLint. The repository's previously
  documented lint debt is not hidden or suppressed.

Run SQL tests against a populated test database with at least two Auth identities.
They create disposable rooms inside a transaction and roll back all changes.
Full multi-device load testing, human playtesting/balance tuning and a larger
visual content pack remain follow-up work. Local browser automation could not run
because the available Chromium download was incomplete; do not infer visual or
mobile-device QA from the web export alone.

Security advisor notes for intentionally authenticated privileged RPC endpoints:
https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker
