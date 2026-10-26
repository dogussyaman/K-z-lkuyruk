import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { GAME_MODES, getActiveGameModes, getComingSoonGameModes, isGameModeActive } from '../features/game/modes';
import { GAME_MODE_THEMES } from '../features/game/themes';
import { resolveZartoRound } from '../features/game/engine';
import { detectiveForRound, isGoldenRound } from '../features/game/modeRules';
import type { Player, RoundChoice } from '../types/game';
import type { Question } from '../features/game/questions';

const sampleQuestion: Question = {
  id: 'test-q1',
  categoryId: 'genel-kultur',
  prompt: 'Türkiye Cumhuriyeti hangi yılda kuruldu?',
  correctAnswer: '1923',
};

function createPlayer(id: string, teamId?: 'A' | 'B'): Player {
  return {
    id,
    name: `Tilki ${id}`,
    avatarKey: 'fox',
    isHost: id === 'p1',
    isReady: true,
    isOnline: true,
    score: 0,
    teamId: teamId ?? null,
    consecutiveCorrect: 0,
    shieldsAvailable: 0,
    blocksAvailable: 0,
    isBlockedCurrentRound: false,
    isBlockedNextRound: false,
    abilityUsedCounts: { shield: 0, block: 0, penalty: 0, counter: 0 },
  };
}

const choices: RoundChoice[] = [
  { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
  { choiceIndex: 1, text: '1920', authorId: 'p2', isCorrect: false },
  { choiceIndex: 2, text: '1938', authorId: 'p1', isCorrect: false },
];

describe('complete game mode registry', () => {
  it('exposes all nine modes as active with a theme and local illustration', () => {
    assert.equal(GAME_MODES.length, 10);
    assert.equal(getActiveGameModes().length, 9);
    assert.equal(getComingSoonGameModes().length, 1);
    assert.equal(isGameModeActive('gizli_tilki'), false);

    for (const mode of GAME_MODES) {
      assert.equal(isGameModeActive(mode.id), true);
      assert.ok(GAME_MODE_THEMES[mode.id]);
      const filePath = resolve(process.cwd(), `assets/game-modes/${mode.illustrationKey}.jpg`);
      assert.ok(existsSync(filePath), `${mode.id} illustration must exist`);
      assert.ok(statSync(filePath).size > 10000, `${mode.id} illustration must not be empty`);
    }
  });
});

describe('mode-specific scoring', () => {
  it('does not award Team Battle trap points for a teammate pick', () => {
    const p1 = createPlayer('p1', 'A');
    const p2 = createPlayer('p2', 'A');
    const p3 = createPlayer('p3', 'B');

    const friendly = resolveZartoRound({ question: sampleQuestion, players: [p1, p2, p3], choices, picks: { p1: 1, p2: 0, p3: 0 }, gameMode: 'team_battle' });
    assert.equal(friendly.rows.p2.victimsCount, 0);

    const enemy = resolveZartoRound({ question: sampleQuestion, players: [p1, p2, p3], choices, picks: { p1: 0, p2: 0, p3: 1 }, gameMode: 'team_battle' });
    assert.equal(enemy.rows.p2.victimsCount, 1);
  });

  it('makes every third Golden Question round worth triple correct-answer points', () => {
    assert.equal(isGoldenRound('golden_question', 3), true);
    const result = resolveZartoRound({ question: sampleQuestion, players: [createPlayer('p1'), createPlayer('p2')], choices, picks: { p1: 0, p2: 0 }, gameMode: 'golden_question', currentRound: 3 });
    assert.equal(result.rows.p1.goldenMultiplier, 3);
    assert.equal(result.rows.p1.pointsDelta, 6);
  });

  it('rotates Detective Fox and awards the detective bonus', () => {
    const players = [createPlayer('p1'), createPlayer('p2'), createPlayer('p3')];
    assert.equal(detectiveForRound(players, 'detective_fox', 1), 'p1');
    const result = resolveZartoRound({ question: sampleQuestion, players, choices, picks: { p1: 0, p2: 0, p3: 1 }, gameMode: 'detective_fox', currentRound: 1, suspectPicks: { p1: 'p2' } });
    assert.equal(result.rows.p1.detectiveBonus, 2);
    assert.equal(result.rows.p1.pointsDelta, 4);
  });

  it('keeps Blitz speed bonus intact', () => {
    const result = resolveZartoRound({ question: sampleQuestion, players: [createPlayer('p1'), createPlayer('p2')], choices, picks: { p1: 0, p2: 0 }, gameMode: 'blitz', phaseStartedAt: 1000, pickTimes: { p1: 2500, p2: 6000 } });
    assert.equal(result.rows.p1.speedBonus, 1);
    assert.equal(result.rows.p1.pointsDelta, 3);
    assert.equal(result.rows.p2.speedBonus, undefined);
  });
});
