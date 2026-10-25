import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  GAME_MODES,
  getGameMode,
  isGameModeActive,
  getActiveGameModes,
  getComingSoonGameModes,
  BLITZ_ROUND_SECONDS,
} from '../features/game/modes';
import { resolveZartoRound } from '../features/game/engine';
import { DemoGameService } from '../services/demoAdapter';
import type { Player, RoundChoice } from '../types/game';
import type { Question } from '../features/game/questions';

const sampleQuestion: Question = {
  id: 'test-q1',
  categoryId: 'genel-kultur',
  prompt: 'Türkiye Cumhuriyeti hangi yılda kuruldu?',
  correctAnswer: '1923',
};

function createPlayer(id: string, name: string, isHost = false): Player {
  return {
    id,
    name,
    avatarKey: 'fox',
    isHost,
    isReady: true,
    isOnline: true,
    score: 0,
    consecutiveCorrect: 0,
    shieldsAvailable: 0,
    blocksAvailable: 0,
    isBlockedCurrentRound: false,
    isBlockedNextRound: false,
    abilityUsedCounts: { shield: 0, block: 0, penalty: 0, counter: 0 },
  };
}

describe('Game Modes Registry & Assets', () => {
  it('registers all 9 planned game modes with complete metadata', () => {
    assert.strictEqual(GAME_MODES.length, 9, 'Should have exactly 9 modes defined');

    for (const mode of GAME_MODES) {
      assert.ok(mode.id, 'Mode must have an id');
      assert.ok(mode.name, 'Mode must have a name');
      assert.ok(mode.description, 'Mode must have a description');
      assert.ok(mode.tagline, 'Mode must have a tagline');
      assert.ok(mode.badge, 'Mode must have a badge');
      assert.ok(mode.playerCountLabel, 'Mode must have player count');
      assert.ok(mode.estimatedDurationLabel, 'Mode must have duration');
      assert.ok(mode.rules, 'Mode must have rules');
      assert.ok(mode.illustrationKey, 'Mode must specify an illustration');
      assert.ok(Array.isArray(mode.features) && mode.features.length > 0, 'Mode must have feature bullets');
    }

    assert.strictEqual(getGameMode('suspicious').name, 'Herkes Şüpheli');
    assert.strictEqual(getGameMode('blitz').name, 'Fırtına Turu');
    assert.strictEqual(getGameMode('unknown' as any).id, 'classic');
  });

  it('marks exactly 4 modes as active and 5 modes as coming soon', () => {
    const active = getActiveGameModes();
    const comingSoon = getComingSoonGameModes();

    assert.strictEqual(active.length, 4, 'Should have 4 active playable modes');
    assert.strictEqual(comingSoon.length, 5, 'Should have 5 coming soon modes');

    const activeIds = active.map((m) => m.id);
    assert.deepStrictEqual(
      activeIds.sort(),
      ['blitz', 'classic', 'survival', 'suspicious'].sort(),
      'Active modes must be classic, survival, suspicious, blitz'
    );

    for (const soon of comingSoon) {
      assert.strictEqual(soon.status, 'coming_soon');
      assert.strictEqual(soon.badge, 'YAKINDA');
      assert.strictEqual(isGameModeActive(soon.id), false);
    }
  });

  it('verifies all mode illustration files exist locally with non-empty contents', () => {
    for (const mode of GAME_MODES) {
      const filePath = resolve(process.cwd(), `assets/game-modes/${mode.illustrationKey}.jpg`);
      assert.ok(existsSync(filePath), `Asset file must exist at ${filePath}`);
      const stats = statSync(filePath);
      assert.ok(stats.size > 10000, `Asset file ${filePath} must be non-empty (was ${stats.size} bytes)`);
    }
  });
});

describe('Herkes Şüpheli Mode Mechanics', () => {
  const p1 = createPlayer('p1', 'Tilki Ali');
  const p2 = createPlayer('p2', 'Kurnaz Can');
  const p3 = createPlayer('p3', 'Dedektif Ece');

  const choices: RoundChoice[] = [
    { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
    { choiceIndex: 1, text: '1920', authorId: 'p2', isCorrect: false },
    { choiceIndex: 2, text: '1938', authorId: 'p1', isCorrect: false },
  ];

  it('awards +1 Dedektif Bonusu when player correctly suspects a bluffer who trapped someone', () => {
    // p1 picks p2's bluff (choice 1) -> p2 successfully trapped p1!
    // p3 picks the correct answer (choice 0) AND suspects p2 of bluffing.
    const picks = { p1: 1, p2: 0, p3: 0 };
    const suspectPicks = { p3: 'p2' };

    const { rows } = resolveZartoRound({
      question: sampleQuestion,
      players: [p1, p2, p3],
      choices,
      picks,
      fakeAnswers: { p1: '1938', p2: '1920' },
      gameMode: 'suspicious',
      suspectPicks,
    });

    // p3 got the correct answer (+2) PLUS Dedektif Bonusu (+1) because p2 tricked p1 -> Total +3
    assert.strictEqual(rows.p3.outcome.correct, true);
    assert.strictEqual(rows.p3.suspectBonus, 1);
    assert.strictEqual(rows.p3.suspectId, 'p2');
    assert.strictEqual(rows.p3.pointsDelta, 3);

    // p2 got the correct answer (+2) PLUS tricked p1 (+1) -> Total +3
    assert.strictEqual(rows.p2.victimsCount, 1);
    assert.strictEqual(rows.p2.pointsDelta, 3);

    // p1 fell for p2's fake -> 0 points
    assert.strictEqual(rows.p1.pointsDelta, 0);
  });

  it('awards 0 Dedektif Bonusu when suspected rival failed to trap anyone', () => {
    // No one picked p1's bluff
    const picks = { p1: 0, p2: 0, p3: 0 };
    // p2 suspects p1
    const suspectPicks = { p2: 'p1' };

    const { rows } = resolveZartoRound({
      question: sampleQuestion,
      players: [p1, p2, p3],
      choices,
      picks,
      fakeAnswers: { p1: '1938', p2: '1920' },
      gameMode: 'suspicious',
      suspectPicks,
    });

    assert.strictEqual(rows.p2.suspectBonus, undefined);
    assert.strictEqual(rows.p2.pointsDelta, 2); // only +2 for correct answer
  });

  it('disallows self-suspicion in DemoGameService', async () => {
    const service = new DemoGameService();
    const { code } = await service.createRoom({
      hostName: 'Host',
      avatarKey: 'fox',
      totalRounds: 3,
      roundSeconds: 15,
      categories: ['genel-kultur'],
      gameMode: 'suspicious',
    });

    await service.startGame(code);
    await service.advancePhase(code); // advance from ability_select to fake_answer
    await service.submitFakeAnswer(code, '1919');

    // advance to guess phase
    await service.advancePhase(code);

    const hostId = service.getCurrentPlayer()!.id;
    await assert.rejects(
      async () => {
        await service.submitSuspectPick(code, hostId);
      },
      { message: /Kendini şüpheli olarak seçemezsin/ }
    );
  });

  it('rejects duplicate suspect picks per round', async () => {
    const service = new DemoGameService();
    const { code } = await service.createRoom({
      hostName: 'Host',
      avatarKey: 'fox',
      totalRounds: 3,
      roundSeconds: 15,
      categories: ['genel-kultur'],
      gameMode: 'suspicious',
    });

    await service.startGame(code);
    await service.advancePhase(code); // advance from ability_select to fake_answer
    await service.submitFakeAnswer(code, '1919');
    await service.advancePhase(code);

    const state = await service.getRoomState(code);
    const rivals = Object.keys(state!.players).filter((id) => id !== state!.config.hostId);
    assert.ok(rivals.length > 0);

    const targetRival = rivals[0];
    await service.submitSuspectPick(code, targetRival);

    // Second submission in same round must reject
    await assert.rejects(
      async () => {
        await service.submitSuspectPick(code, targetRival);
      },
      { message: /zaten şüpheli tahmininde bulundun/ }
    );
  });
});

describe('Fırtına Turu (Blitz) Mode Mechanics', () => {
  const p1 = createPlayer('p1', 'Hızlı Tilki');
  const p2 = createPlayer('p2', 'Yavaş Tilki');

  const choices: RoundChoice[] = [
    { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
    { choiceIndex: 1, text: '1920', authorId: 'p2', isCorrect: false },
  ];

  it('awards +1 Hız Bonusu for correct answers within 3 seconds', () => {
    const phaseStartedAt = 10000;
    const pickTimes = {
      p1: 12000, // 2.0s -> fast!
      p2: 15000, // 5.0s -> slow
    };
    const picks = { p1: 0, p2: 0 };

    const { rows } = resolveZartoRound({
      question: sampleQuestion,
      players: [p1, p2],
      choices,
      picks,
      gameMode: 'blitz',
      phaseStartedAt,
      pickTimes,
    });

    // p1 answered correctly within 3s: +2 correct + 1 speed = 3
    assert.strictEqual(rows.p1.speedBonus, 1);
    assert.strictEqual(rows.p1.isFastAnswer, true);
    assert.strictEqual(rows.p1.pointsDelta, 3);

    // p2 answered correctly after 3s: +2 correct + 0 speed = 2
    assert.strictEqual(rows.p2.speedBonus, undefined);
    assert.strictEqual(rows.p2.pointsDelta, 2);
  });

  it('creates room with 7 seconds default round time for blitz mode', async () => {
    const service = new DemoGameService();
    const { code } = await service.createRoom({
      hostName: 'Speedy',
      avatarKey: 'fox',
      totalRounds: 5,
      roundSeconds: 15, // host requested 15, but blitz clamps to BLITZ_ROUND_SECONDS (7)
      categories: ['genel-kultur'],
      gameMode: 'blitz',
    });

    const state = await service.getRoomState(code);
    assert.strictEqual(state?.config.gameMode, 'blitz');
    assert.strictEqual(state?.config.roundSeconds, BLITZ_ROUND_SECONDS);
  });

  it('rejects late picks when phase deadline has expired', async () => {
    const service = new DemoGameService();
    const { code } = await service.createRoom({
      hostName: 'Host',
      avatarKey: 'fox',
      totalRounds: 3,
      roundSeconds: 7,
      categories: ['genel-kultur'],
      gameMode: 'blitz',
    });

    await service.startGame(code);
    await service.advancePhase(code); // advance from ability_select to fake_answer
    await service.submitFakeAnswer(code, '1919');
    await service.advancePhase(code); // into guess phase

    // Artificially expire the deadline
    const internalRoom = (service as any).rooms.get(code);
    internalRoom.phaseDeadlineAt = Date.now() - 100;

    await assert.rejects(
      async () => {
        await service.submitPick(code, 0);
      },
      { message: /Tahmin süresi doldu/ }
    );
  });
});

describe('Backward Compatibility for Classic & Survival Modes', () => {
  it('classic mode preserves standard 15s rounds and standard scoring', async () => {
    const service = new DemoGameService();
    const { code } = await service.createRoom({
      hostName: 'ClassicHost',
      avatarKey: 'fox',
      totalRounds: 5,
      roundSeconds: 15,
      categories: ['genel-kultur'],
      gameMode: 'classic',
    });

    const state = await service.getRoomState(code);
    assert.strictEqual(state?.config.gameMode, 'classic');
    assert.strictEqual(state?.config.roundSeconds, 15);
  });

  it('survival mode preserves 3 lives and eliminates on life loss', async () => {
    const service = new DemoGameService();
    const { code } = await service.createRoom({
      hostName: 'SurvivalHost',
      avatarKey: 'fox',
      totalRounds: 5,
      roundSeconds: 15,
      categories: ['genel-kultur'],
      gameMode: 'survival',
    });

    const state = await service.getRoomState(code);
    assert.strictEqual(state?.config.gameMode, 'survival');
    for (const player of Object.values(state!.players)) {
      assert.strictEqual(player.livesRemaining, 3);
    }
  });
});
