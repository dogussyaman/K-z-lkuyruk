# Kızılkuyruk — Privacy Policy draft

> **DRAFT — NOT READY TO PUBLISH.** Replace every bracketed field, confirm the
> actual hosting/provider configuration, obtain legal review, and publish a
> stable public URL before App Store or Google Play submission.

**Effective date:** [DATE]  
**Operator / data controller:** [LEGAL NAME OR REGISTERED BUSINESS NAME]  
**Contact:** [MONITORED PRIVACY / SUPPORT EMAIL]  
**Jurisdiction / postal address:** [BUSINESS ADDRESS]

## 1. Information processed

Kızılkuyruk processes the following information to provide multiplayer games:

- **Account and authentication:** Supabase user ID, email address where supplied,
  authentication provider and session/security metadata. Google and Apple
  authenticate users when those sign-in options are used; Kızılkuyruk does not
  receive their provider passwords.
- **Profile:** display name, selected avatar and profile image uploaded by the
  user.
- **Social features:** friend requests, accepted friendships and blocked-user
  relationships.
- **Gameplay:** room membership, room settings, player-submitted answers,
  selected answers, scores, match statistics, ability usage and game progress.
- **Safety reports:** report category, optional description, room context and
  name snapshots needed to investigate abuse.
- **Local app state:** a room recovery reference and authentication/session
  information stored by the app so a player can resume a valid session.

[CONFIRM WHETHER ANY CRASH REPORTING, ANALYTICS, PUSH NOTIFICATIONS OR OTHER
THIRD-PARTY SDKS ARE ENABLED BEFORE PUBLISHING.]

## 2. Why information is used

Information is used to:
- create and secure accounts;
- operate multiplayer rooms, matchmaking, game modes and scoreboards;
- provide profiles, avatars, friends and blocking;
- prevent cheating, spam, abuse and unauthorized access;
- investigate player reports and enforce the rules;
- troubleshoot technical issues and respond to support requests;
- comply with applicable legal obligations.

## 3. Service providers and sharing

Kızılkuyruk uses Supabase for authentication, database, realtime gameplay and
avatar storage. Google and Apple may process authentication information when
their sign-in services are selected. The web version is hosted through GitHub
Pages. [CONFIRM WHETHER EXPO/EAS UPDATES, CRASH REPORTING OR ANY OTHER RUNTIME
PROCESSORS ARE ENABLED.]

Information is not sold. Do not publish this statement until all SDKs, hosting
providers, OAuth settings and operational integrations have been reviewed.

## 4. Safety reports and retention

Player reports are visible only to the moderation operator through the private
Supabase moderation queue. Reports may be retained to investigate abuse and
protect players. If an account is deleted, the reporter/reported account IDs
and name snapshots in associated reports are anonymized; the report record may
remain for safety and moderation purposes.

Other account-linked profile, avatar, friendship, block, statistics and
personal game records are deleted through the in-app account deletion process.
Some information may remain temporarily in encrypted backups or provider logs
under the relevant provider's retention schedule.

## 5. Account deletion

A signed-in player can request permanent account deletion in the app under
**Profile → Account and privacy → Delete account**. The public request page is:

[PUBLIC ACCOUNT-DELETION URL — VERIFY AFTER WEB DEPLOYMENT]

A player must leave active games before deletion can complete. Safety reports
may be retained in anonymized form as described above.

## 6. Security

The service uses authenticated sessions, server-side authorization for
multiplayer actions, restricted database permissions and private storage/API
operations. No internet service can guarantee absolute security; users should
not include passwords, financial information or sensitive personal details in
their display names, answers or report descriptions.

## 7. Children

[STATE THE MINIMUM AGE, WHETHER THE SERVICE IS DIRECTED TO CHILDREN, AND THE
PROCESS FOR HANDLING A CHILD'S DATA. ALIGN THIS SECTION WITH THE STORE
AUDIENCE/AGE-RATING DECLARATIONS.]

## 8. International processing

Supabase and the selected authentication/hosting providers may process data in
the regions configured for their services. [IDENTIFY THE SUPABASE PROJECT
REGION, PROVIDER LOCATIONS, TRANSFER MECHANISM AND ANY REQUIRED KVKK/GDPR
DISCLOSURES.]

## 9. Your rights and contact

Depending on applicable law, users may have rights to access, correct, delete,
restrict or object to certain processing. Contact [MONITORED EMAIL] to submit a
privacy request or appeal a moderation action.

## 10. Changes

We may update this policy when the app or its data practices change. The
current version and effective date will be published at [PUBLIC POLICY URL].

