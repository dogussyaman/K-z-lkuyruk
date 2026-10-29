import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PARTY_GAMES, isPartyMode, type PartyState } from '../features/party/catalog';
import { selectPartySnapshot } from '../features/party/state';
import { getRoomRecoveryRoute } from '../services/roomRecovery';
import type { RecoveryState } from '../services/roomRecovery';

const snapshot = (overrides: Partial<PartyState> = {}) => ({
  mode: 'tilki_soygunu', gameNumber: 1, stateVersion: 10, step: 3, phase: 'plan',
  submittedCount: 1, totalCount: 4, ...overrides,
} as PartyState);

test('a delayed poll cannot replace the report that followed the player action', () => {
  const report = snapshot({ step: 4, phase: 'report', stateVersion: 12 });
  assert.equal(selectPartySnapshot(report, snapshot()), report);
});

test('a delayed old match cannot overwrite the first stage of a rematch', () => {
  const rematch = snapshot({ gameNumber: 2, step: 2, stateVersion: 30 });
  assert.equal(selectPartySnapshot(rematch, snapshot({step: 28, stateVersion: 29})), rematch);
});

test('the first snapshot of a rematch replaces a higher stage in the old match', () => {
  const next = snapshot({gameNumber: 2, step: 2, stateVersion: 20});
  assert.equal(selectPartySnapshot(snapshot({step: 28}), next), next);
});

test('same-stage submission and message updates are applied', () => {
  const next = snapshot({stateVersion: 11, submittedCount: 2});
  assert.equal(selectPartySnapshot(snapshot(), next), next);
});

test('new games remain distinct from the legacy quiz variants', () => {
  for (const game of PARTY_GAMES) {
    assert.equal(isPartyMode(game.id), true);
    assert.ok(game.min >= 3 && game.max >= game.min && game.max <= 10);
  }
  for (const legacy of ['classic','blitz','gizli_tilki','orman_hazinesi','suspicious']) {
    assert.equal(isPartyMode(legacy), false);
  }
});

test('every party mode resumes its own board rather than the trivia question screen', () => {
  for (const game of PARTY_GAMES) {
    const state = {phase: 'question',config: {gameMode:game.id}} as RecoveryState;
    assert.equal(getRoomRecoveryRoute(state,'host'), '/party-game');
    assert.equal(getRoomRecoveryRoute({...state,phase:'lobby'},'host'), '/lobby');
  }
});
