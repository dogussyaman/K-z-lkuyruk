# Kızılkuyruk — Game Modes & Social Content Roadmap

## Product direction

Kızılkuyruk should feel like one party-game universe rather than one quiz with rule toggles. Every mode can have its own visual identity, soundtrack treatment, round intro, scoreboard skin and end-of-match celebration while sharing the same room, profile, friends and question infrastructure.

## Mode families

### 1. Bluff modes
- **Klasik Blöf** — baseline rules and onboarding-friendly mode.
- **Çifte Tuzak** — two fake answers per player; chaotic but familiar.
- **Altın Soru** — occasional high-stakes multiplier rounds.

### 2. Competitive modes
- **Hayatta Kalma** — lives and elimination.
- **Fırtına Turu** — short timer and speed bonus.
- **Takım Savaşı** — A/B teams, shared score, team victory.

### 3. Social deduction modes
- **Herkes Şüpheli** — identify the bluff author.
- **Dedektif Tilki** — rotating detective role with stronger social deduction.
- **Gizli Görevler** — private objectives layered over the normal match.

## Recommended next mode: Team Battle

Team Battle is the strongest next step because it changes the social structure of the room without requiring a completely separate question engine.

### V1 rules
- 4–10 players.
- Two teams: **A Takımı** and **B Takımı**.
- Host can move players between teams in the lobby.
- Match cannot start until both teams have at least two active players.
- Individual points still exist for personal stats, but the winner is determined by the sum of active team-member scores.
- Players cannot earn trap points from a teammate selecting their fake answer. This prevents farming and makes enemy deception the objective.
- Abilities remain available, but offensive abilities should target the opposing team only.
- Tie breaker: most correct answers; second tie breaker: most successful enemy traps; final tie breaker: sudden-death question.

### V2 ideas
- Auto-balance button.
- Team captain role.
- One shared team ability per match.
- 2v2 / 3v3 / 4v4 / 5v5 presets.
- Private team emotes during reveal.

## UI direction

The mode browser should become a discovery surface rather than a flat list. Recommended sections: **Öne Çıkan**, **Hızlı**, **Rekabetçi**, **Takım**, **Sosyal Dedüksiyon**, **Kaos**. Cards should expose player count, estimated duration, difficulty and whether the mode is solo/team based.

Each mode should provide a theme contract:
- accent / gradient colors
- hero artwork
- lobby background treatment
- round intro treatment
- timer treatment
- scoreboard treatment
- victory animation
- optional sound pack key

For Team Battle, use a split-screen visual language: warm orange/red for Team A and electric blue/cyan for Team B. Avoid permanently tying the team names to colors in data; the theme can change later.

## Meme system

Add a lightweight post-match **Meme Studio** rather than baking memes into gameplay first.

Suggested flow:
1. After the match, generate event cards from real match facts: biggest trap, fastest answer, comeback, zero-point round, perfect round.
2. User taps **Meme Yap**.
3. Pick a template, event caption and optional custom text.
4. Render locally as a shareable image.

Important: generated meme captions should use match events already visible to the player. Do not expose private answers or hidden mission data before reveal.

## GIF / reaction system

Start with curated reaction packs instead of arbitrary remote GIF search. This keeps moderation, performance and visual consistency manageable. Reactions can appear in lobby, reveal and scoreboard phases. Add remote GIF providers only after moderation and rate-limit rules are defined.

## Architecture recommendations

Keep `GameModeDefinition` as the product registry, but split gameplay behavior from presentation:

- `features/game/modes.ts` — metadata and rule flags
- `features/game/modeRules/<mode>.ts` — client rule helpers
- server RPC/migrations — authoritative scoring and phase transitions
- `features/game/themes/<mode>.ts` — visual theme contract
- `components/game-mode/` — reusable mode cards, badges and theme previews

Never trust the client for team assignment validation, scoring, timers or winner calculation. Supabase remains authoritative.

## Delivery order

1. Team Battle DB foundation + shared TypeScript types.
2. Lobby team assignment UI and auto-balance.
3. Server-side start validation and enemy-only trap scoring.
4. Team scoreboard + victory screen.
5. Mode-specific theme contract and mode browser redesign.
6. Meme Studio based on match event cards.
7. Curated GIF/reaction packs.
8. Secret Missions or Detective Fox as the next major gameplay mode.

## Definition of done for Team Battle V1

- Team Battle can be selected when creating a room.
- Host can assign every active player to A/B.
- Both teams have >=2 players before start.
- Team assignment is synchronized for every client.
- Server calculates team totals.
- Teammate trap selections do not grant trap points.
- Offensive abilities cannot target teammates.
- Scoreboard shows individual and team results.
- Game over declares the winning team and MVP.
- Rematch preserves the mode but resets scores and team match state.
- Automated tests cover assignment authorization, start validation, scoring, tie breakers and reconnect behavior.
