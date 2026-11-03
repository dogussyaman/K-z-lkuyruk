# Supabase migration history audit

**Checked:** 2026-11-03  
**Project:** `sjryoojjaqrhvligjqjs`

## Current result

The production database records 19 migrations. Their repository filenames now use the same version IDs as the Supabase migration history.

The following new migrations were applied to production and recorded:

- `20261103121201_team_battle_start_guard.sql`
- `20261103121205_double_trap_two_player_answers.sql`
- `20261103121209_account_deletion.sql`

The first two historical migrations, `20261025211337` and `20261025211633`, were already recorded in production. They were not re-applied. Their source files were restored to the original migration content and aligned to the recorded version IDs.

## Production verification performed

- Ran the complete game-mode SQL smoke suite against the current production schema inside a transaction, then rolled it back. All 20 scenarios passed, including the two-answer Double Trap flow.
- Ran the account-deletion SQL smoke suite with synthetic Auth users inside a transaction, then rolled it back. It verified active-room protection, host handoff, deletion of the user's profile/social/round data, and anonymization of another player's result.
- No real player account was deleted and no smoke-test fixture was committed.
- Deployed the `delete-account` Edge Function. It is ACTIVE and requires a valid JWT.
- The `delete_account_data_secure` RPC is executable only by `service_role`.

## Unrecorded repository migrations — do not auto-apply

There are 29 additional SQL files in the repository that do not have matching rows in the production migration history:

```
20261019000001_zartix_schema.sql
20261020000001_zarto_bluff_engine.sql
20261021000001_profile_avatars.sql
20261022000001_canonical_multiplayer_schema.sql
20261023000001_auth_profiles.sql
20261024000001_fix_join_room_ambiguity.sql
20261025000001_fix_nudge_round_ambiguity.sql
20261026000001_choices_correct_and_player_fakes_only.sql
20261027000001_question_bank_and_seen_history.sql
20261028000001_expand_question_bank_2400.sql
20261029000000_dicebear_avatar_defaults.sql
20261030000001_private_room_access.sql
20261031000001_player_discovery_weekly_leaderboard.sql
20261101000001_block_only_fake_answers.sql
20261102000001_apply_block_during_current_round.sql
20261103000001_room_pause_controls.sql
20261104000001_room_join_preflight.sql
20261105000001_room_invite_tokens.sql
20261106000001_open_rooms_and_host_kick.sql
20261107000001_server_clock_sync.sql
20261108000001_round_reveal_attribution.sql
20261109000001_fake_answer_validation.sql
20261110000001_fix_guess_phase_deadline.sql
20261111000001_update_fake_answer_validation_message.sql
20261112000001_match_credit_economy.sql
20261113000001_auto_close_empty_and_inactive_rooms.sql
20261114000001_restore_fake_answer_room_lock.sql
20261116000001_game_modes_suspicious_and_blitz.sql
20261117000001_team_battle_foundation.sql
```

Some of these features are present in the live schema and the multiplayer smoke suite passes, which suggests that parts of this set were applied manually or through a different migration history. That does **not** prove every statement in every file is already applied.

**Do not run `supabase db push`, `supabase migration up`, or `db reset` against production until each of these 29 files has been compared with the live schema and either safely applied or reconciled as already applied.** Applying them blindly could duplicate columns, constraints, triggers, or functions.

## Remaining account-deletion verification

The SQL cleanup and Edge Function are deployed. The app-side request screen is in PR #30. Before store submission, test the full flow with a dedicated disposable account that has an avatar and completed game history, then confirm:

1. The signed-in user can request deletion.
2. An active room blocks deletion with a clear message.
3. Leaving the room allows deletion.
4. The Auth identity, avatar objects, profile, social links, stats and personal game records are removed.
5. Other players' retained results no longer contain the deleted player's identity.

