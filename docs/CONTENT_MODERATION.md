# Kızılkuyruk — UGC moderation workflow

Kızılkuyruk contains user-generated player names and multiplayer interactions. The app now includes a report action on human player rows in match results, alongside the existing block-user controls.

## Report handling

- Reports are created through the authenticated `report_player_secure` RPC.
- A report can only target another human participant from the same room.
- Self-reports, bots, duplicate pending reports and excessive hourly submissions are rejected server-side.
- Report records are private to the service role; clients cannot query the moderation table directly.
- The record stores the room code, category, optional description and name snapshots for review.
- When an account is deleted, reporter/reported account IDs and name snapshots are anonymized while the moderation record is retained.

## Manual review

Review `public.player_reports` in the Supabase Dashboard:

1. Filter `status = pending`, oldest first.
2. Review the report category, description and room context.
3. Record the outcome in `status` (`reviewed`, `dismissed`, or `action_taken`), `moderation_notes`, `reviewed_at` and `reviewed_by`.
4. Use the existing block controls and account-level enforcement process where appropriate.
5. Keep a monitored support contact and publish the moderation/appeals process before store submission.

The report queue is not an automated moderation system. A real person must review pending reports regularly and respond to serious safety issues promptly.
