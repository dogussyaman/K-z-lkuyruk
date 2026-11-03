# Kızılkuyruk — Store data inventory

This is a technical inventory to support App Store App Privacy and Google Play
Data safety declarations. It is not itself a legal disclosure; verify the
production SDKs and provider settings before completing store forms.

| Data category | Current app/backend use | Purpose |
|---|---|---|
| Account identifiers | Supabase Auth UUID; provider identity | Authentication and account management |
| Email address | Email/password accounts and OAuth where returned | Sign-in, confirmation and recovery |
| Profile information | Display name, avatar selection, uploaded avatar image | Player identity |
| User content | Answers, display names, report descriptions | Multiplayer gameplay and moderation |
| Gameplay information | Room membership, game state, score, match statistics, abilities | Operate games and rankings |
| Contacts/social graph | In-app friend requests, friendships and blocks; no device address-book import identified | Social features and safety |
| Safety reports | Category, room context, name snapshots, optional description | Abuse prevention and moderation |
| Device/local data | Session and room-recovery references stored by the app | Session restoration and gameplay continuity |

## Known processors

- Supabase: Auth, database, realtime and avatar storage.
- Google: OAuth authentication when selected.
- Apple: OAuth authentication when selected and configured.
- GitHub Pages: hosting for the web build.

[VERIFY EXPO/EAS RUNTIME SERVICES, CRASH REPORTING, ANALYTICS, ADS, PUSH
NOTIFICATIONS AND ANY OTHER SDK/PROCESSOR BEFORE SUBMISSION.]

## Deletion and retention

- Account deletion removes the Auth identity, profile, avatar objects,
  friendships, blocks, statistics and personal game records.
- A user must leave active rooms before deletion.
- Moderation reports remain in the private queue with account IDs and name
  snapshots anonymized.
- Provider backups/logs may retain data for their configured retention period.

## Store form items requiring operator confirmation

- Minimum age / target audience.
- Whether analytics, advertising, crash reporting or tracking SDKs are enabled.
- Supabase region and cross-border transfer disclosures.
- Privacy policy URL and privacy contact.
- Whether the app offers in-app purchases or other paid digital features.
