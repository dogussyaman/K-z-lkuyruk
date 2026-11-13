import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getFoxTitles } from '../features/game/foxTitles';
import type { GameState, Player, RoundResultRow } from '../types/game';

function player(id: string, score: number, livesRemaining?: number): Player {
  return {
    id, name: id, avatarKey: 'fox', isHost: false, isReady: true, isOnline: true, score,
    livesRemaining,
    abilityUsedCounts: { block: 0, shield: 0, penalty: 0, counter: 0 },
    consecutiveCorrect: 0, shieldsAvailable: 0, blocksAvailable: 0,
    isBlockedCurrentRound: false, isBlockedNextRound: false,
  };
}

function result(playerId: string, correct: boolean, victimsCount: number, tricked: boolean): RoundResultRow {
  return {
    playerId,
    outcome: { correct, zartaladın: victimsCount > 0, zartalandın: tricked, victimsCount, pointsEarned: 0, labels: [] },
    labels: [],
    pointsDelta: 0,
    victimsCount,
  };
}

function state(mode: 'classic' | 'survival' = 'classic'): Pick<GameState, 'players' | 'history' | 'config'> {
  return {
    players: {
      fox: player('fox', 8, mode === 'survival' ? 2 : undefined),
      owl: player('owl', 5, mode === 'survival' ? 0 : undefined),
    },
    history: [[result('fox', true, 2, false), result('owl', false, 0, true)]],
    config: { code: 'ABC12', hostId: 'fox', maxPlayers: 10, minPlayers: 2, totalRounds: 1, roundSeconds: 15, selectedCategoryIds: [], gameMode: mode },
  };
}

describe('match Fox titles', () => {
  test('awards score, knowledge, and trap titles from this match history', () => {
    const titles = getFoxTitles(state());
    assert.ok(titles.some((title) => title.id === 'champion' && title.playerIds.includes('fox')));
    assert.ok(titles.some((title) => title.id === 'sharp_mind' && title.playerIds.includes('fox')));
    assert.ok(titles.some((title) => title.id === 'trap_master' && title.playerIds.includes('fox')));
    assert.ok(titles.some((title) => title.id === 'easy_target' && title.playerIds.includes('owl')));
    assert.ok(!titles.some((title) => title.id === 'survivor'));
  });

  test('only Survival mode awards the Survivor title, to players with lives remaining', () => {
    const titles = getFoxTitles(state('survival'));
    const survivor = titles.find((title) => title.id === 'survivor');
    assert.deepEqual(survivor?.playerIds, ['fox']);
  });

  test('does not invent trap or accuracy awards when match history has no qualifying results', () => {
    const empty = state();
    empty.history = [];
    const titles = getFoxTitles(empty);
    assert.ok(!titles.some((title) => title.id === 'sharp_mind'));
    assert.ok(!titles.some((title) => title.id === 'trap_master'));
    assert.ok(!titles.some((title) => title.id === 'easy_target'));
  });

  test('shares tied titles fairly between players', () => {
    const tied = state();
    tied.players.owl.score = 8;
    tied.history = [[result('fox', true, 0, false), result('owl', true, 0, false)]];
    const champion = getFoxTitles(tied).find((title) => title.id === 'champion');
    const sharpMind = getFoxTitles(tied).find((title) => title.id === 'sharp_mind');
    assert.deepEqual(champion?.playerIds, ['fox', 'owl']);
    assert.deepEqual(sharpMind?.playerIds, ['fox', 'owl']);
  });
  test('uses server match totals when roomState.history is empty', () => {
    const online = state();
    online.history = [];
    const stats = [
      { playerId: 'fox', rounds: 4, correct: 3, victims: 5, trapped: 0 },
      { playerId: 'owl', rounds: 4, correct: 1, victims: 0, trapped: 3 },
    ];
    const titles = getFoxTitles(online, stats);
    assert.deepEqual(titles.find((title) => title.id === 'trap_master')?.playerIds, ['fox']);
    assert.deepEqual(titles.find((title) => title.id === 'never_fooled')?.playerIds, ['fox']);
    assert.deepEqual(titles.find((title) => title.id === 'easy_target')?.playerIds, ['owl']);
  });

  test('never grants no-traps title when match has no recorded rounds', () => {
    const empty = state();
    empty.history = [];
    const titles = getFoxTitles(empty, [
      { playerId: 'fox', rounds: 0, correct: 0, victims: 0, trapped: 0 },
      { playerId: 'owl', rounds: 0, correct: 0, victims: 0, trapped: 0 },
    ]);
    assert.ok(!titles.some((title) => title.id === 'never_fooled'));
  });


});
