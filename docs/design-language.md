# Kızılkuyruk · Quiet Fox design language (2026-11)

## Intent

The site should read like a polished social game, not five neon products
competing on one screen. Keep mascots, illustrated game covers, motion and
celebrations; let the controls and navigation breathe.

## Foundation

- **Graphite** \`#14151D\`: canvas. Neutral layered cards \`#23232E\` and
  \`#2B2A37\`: structure and depth.
- **Tangerine** \`#D87B57\`: emphasis on neutral surfaces.
  Deep \`#B95A3D\`: primary button fill with legible white text.
- **Soft violet** \`#9783BB\`: secondary focus and select secondary scenes;
  not a parallel primary call to action.
- **Semantic only**: muted green = correct/success, muted rose = errors,
  gold = reward or exceptional selection. Correctness/awards must remain
  understandable without color.
- Off-white text \`#F5F2EE\` and secondary text \`#BCB8C5\`.

## Component hierarchy

1. Primary CTA in one place per screen (tangerine); secondary actions as
   neutral outlined surfaces. Keep 44px+ touch size.
2. Cards have a 1px border, subtle shadow and 18–22px radius. No unnecessary
   3D stacking or chromatic halos in every panel.
3. Pills, badges and chips prefer translucent surfaces, not full chroma.
   Use selection border and check mark to supplement color.
4. Bottom tab selection uses a single orange color across all five tabs.
   Each route still has its own icon and its own content.
5. Game modes retain their illustrated art, tiny mode-themed glows, emoji and
   unique match rules, but don't tint every entire screen a different color.
6. The result screen's green/blue/gold answer distribution is **deliberately
   exempt**: those colors communicate correct, other and best bluff answers.
7. Both light and dark modes use the same hierarchy and readable text.

## Non-goals

Do not alter gameplay, answer scoring, phase transitions, account logic,
database schema, matchmaking or service wiring as part of this pass.

## Verification

\`npm test\`, \`npm run typecheck\`, \`npm run lint\`, and \`npm run build:web\`.
Contrast assertions for the new dark palette live in
\`tests/visualSystem.test.ts\`. A 360px / 390px / tablet phone smoke check is
recommended before considering the design fully validated.
