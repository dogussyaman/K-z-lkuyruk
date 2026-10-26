# Gizli Tilki — implementation contract

## Product direction
A premium tactical social-deduction mode for 4–10 players. It must feel distinct from the question/bluff loop: two teams cooperate on operations while one or two hidden saboteurs manipulate resource decisions. Tone: tense heist/mission control with sharp, playful Kızılkuyruk comedy—not horror.

## Round loop
1. **Briefing (20s):** show objective, public resources, operation history and the current leader.
2. **Select operation (20s):** choose one of several operations with visible costs, risk bands and rewards.
3. **Team proposal (20s):** leader proposes a team; eligible players approve/reject privately.
4. **Secret action (15s):** authorized role-specific support, repair, intel or sabotage.
5. **Resolution:** server atomically spends resources, resolves risk and publishes only safe-to-reveal outcomes.
6. **Debrief / suspicion (20s):** discuss the report, optionally vote to restrict a suspected player from the next operation (not eliminate them).
7. **Next operation:** rotate leader, update deadlines/version and continue until a win condition is reached.

## Balance baseline (tune with playtests)
- 4–7 players: 1 saboteur; 8–10 players: 2 saboteurs.
- Public resources: Energy 6, Parts 5, Trust 4.
- Example operations: secure a power relay; repair surveillance; crack a vault; infiltrate a rival network.
- Loyal team wins by completing 3 successful operations before the 5-operation limit while retaining minimum operational capacity.
- Saboteurs win if the team reaches the operation limit without success or critical resources are depleted.
- Avoid full elimination; temporary restriction preserves participation in 4-player matches.

## Server contract (required before activation)
- Reuse `rooms`, `room_players`, current room recovery, state version and shared deadline conventions; do not fork the existing room system.
- Add mode-specific operation/resource/action/vote records only after inspecting current constraints, policies and migration history.
- Generate roles server-side. A client must only receive its own role and authorized personal clue. Never publish the full role map or unresolved sabotage payloads through shared Realtime events.
- All state-changing actions go through authenticated, membership-checked RPCs. Validate phase, deadline, role, team, idempotency and available resources inside a transaction. Lock the room/resource row while resolving simultaneous actions.
- Clients display the server deadline; client timers are presentation only. Reject late actions server-side. Use `state_version` to ignore duplicate/out-of-order Realtime updates.
- On reconnect, fetch an authorized snapshot before subscribing/acting. Existing modes must keep their current RPC paths and phase semantics.

## UI direction
- Mission-control layout: deep navy surfaces, orange-vs-cyan team accents, restrained glow, strong type hierarchy and operation cards with cost/risk/reward.
- Mobile-first: large tap targets, safe-area aware bottom action rail, readable resource meters, clear phase/deadline and disabled states.
- Screens: mode intro, lobby/team roster, operation center, operation picker, team approval, private role/action panel, report, suspicion vote and final debrief.
- Comedy belongs in short report copy and mascot reactions; keep critical action labels unambiguous.

## Acceptance gates
- Do not mark this mode active until server RPCs, RLS, Realtime payload filtering, room recovery and mobile UI are connected end-to-end.
- Test 4, 5, 6, 8 and 10 players; duplicate submissions; simultaneous last-resource spend; expired deadline; role privacy; reconnect; host disconnect; stale/duplicate Realtime messages; and regression tests for every existing mode.
- Never reset production data or blindly push a migration. Apply and verify a reviewed additive migration in a controlled environment first.
