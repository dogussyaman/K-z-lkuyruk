import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  computeOutcome,
  POINTS,
} from '../features/game/outcomes';
import {
  blendChoices,
  applySurvivalLives,
  normalizeChoiceText,
  validateFakeAnswer,
  resolveZartoRound,
  applyRoundToPlayers,
  applyRoundBlockEffects,
  clearRoundBlockState,
} from '../features/game/engine';
import {
  canUseAbility,
  freshAbilityState,
} from '../features/game/abilities';
import { DemoGameService } from '../services/demoAdapter';
import { estimateServerClockOffsetMs, getRemainingSeconds } from '../services/serverClock';
import { pickQuestions, questionsForCategory } from '../features/game/questions';
import type { Player, RoundChoice } from '../types/game';
import type { Question } from '../features/game/questions';
import { getPlayerAchievements } from '../features/game/achievements';
import './soundService.test';
import './avatar.test';

test('server clock offset corrects client clock skew using request midpoint', () => {
  // Client clock is 8.5 seconds behind server; request RTT is 1 second.
  assert.equal(estimateServerClockOffsetMs(10_000, 1_000, 2_000), 8_500);
  assert.equal(estimateServerClockOffsetMs(10_000, 2_000, 1_000), null);
  assert.equal(getRemainingSeconds(20_000, 15_001), 5);
  assert.equal(getRemainingSeconds(20_000, 20_001), 0);
});

const sampleQuestion: Question = {
  id: 'test-q1',
  categoryId: 'genel-kultur',
  prompt: 'Türkiye Cumhuriyeti hangi yıl ilan edildi?',
  correctAnswer: '1923',
  explanation: '29 Ekim 1923',
};

function createPlayer(id: string, name: string, score = 0): Player {
  return {
    id,
    name,
    avatarKey: 'fox',
    isHost: false,
    isReady: true,
    isOnline: true,
    score,
    abilityUsedCounts: { block: 0, shield: 0, penalty: 0, counter: 0 },
    consecutiveCorrect: 0,
    shieldsAvailable: 0,
    blocksAvailable: 0,
    isBlockedCurrentRound: false,
    isBlockedNextRound: false,
    lastBlockedPlayerId: null,
  };
}

async function createDemoBlockRound(roundSeconds = 30) {
  const host = new DemoGameService();
  await host.connect();
  const room = await host.createRoom({
    hostName: 'Host',
    avatarKey: 'fox',
    totalRounds: 2,
    roundSeconds,
    categories: ['genel-kultur'],
  });
  await host.startGame(room.code);

  const state = await host.getRoomState(room.code);
  assert.ok(state);
  const targetId = Object.keys(state.players).find((id) => id !== room.playerId);
  assert.ok(targetId);
  state.players[room.playerId].blocksAvailable = 1;
  state.players[room.playerId].credits = 1;
  await host.useAbility(room.code, {
    playerId: room.playerId,
    abilityId: 'block',
    targetId,
  });

  return { host, roomCode: room.code, targetId };
}

describe('Survival mode life rules', () => {
  test('deducts a life for a wrong answer, preserves correct answers and clamps eliminated players at zero', () => {
    const players = [
      { ...createPlayer('alive-correct', 'Doğru'), livesRemaining: 2 },
      { ...createPlayer('alive-wrong', 'Yanlış'), livesRemaining: 1 },
      { ...createPlayer('eliminated', 'Elendi'), livesRemaining: 0 },
    ];
    const choices: RoundChoice[] = [
      { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
      { choiceIndex: 1, text: '1881', authorId: 'alive-correct', isCorrect: false },
    ];
    const resolution = resolveZartoRound({
      question: sampleQuestion,
      players,
      choices,
      picks: { 'alive-correct': 0, 'alive-wrong': 1 },
    });
    const next = applySurvivalLives(players, resolution.rows);
    assert.equal(next['alive-correct'].livesRemaining, 2);
    assert.equal(next['alive-wrong'].livesRemaining, 0);
    assert.equal(next.eliminated.livesRemaining, 0);
  });
});

describe('TUZAK Game Engine — Bluff & Scoring Tests', () => {
  test('Normalizes Turkish casing and compatibility characters without stripping punctuation', () => {
    assert.equal(normalizeChoiceText('  İSTANBUL  '), normalizeChoiceText('İstanbul'));
    assert.equal(normalizeChoiceText('Ａ'), normalizeChoiceText('A'));
    assert.notEqual(normalizeChoiceText('1.000'), normalizeChoiceText('1000'));
  });

  test('Rejects the real answer as a fake answer after normalization', () => {
    assert.equal(validateFakeAnswer(sampleQuestion, '  1923  ', []), 'correct_answer');
  });

  test('Rejects another player’s duplicate fake answer case- and whitespace-insensitively', () => {
    assert.equal(
      validateFakeAnswer(sampleQuestion, ' İSTANBUL   ', ['İstanbul']),
      'duplicate_answer'
    );
  });

  test('Allows a unique fake answer', () => {
    assert.equal(validateFakeAnswer(sampleQuestion, '1881', ['1920', '1938']), null);
  });

  describe('Question selection history', () => {
    test('Returns distinct unseen questions and allows another player to see the same question', () => {
      const firstPlayer = pickQuestions(['genel-kultur'], 2, 1);
      const secondPlayer = pickQuestions(['genel-kultur'], 2, 1);

      assert.equal(new Set(firstPlayer.map((question) => question.id)).size, 2);
      assert.deepEqual(
        firstPlayer.map((question) => question.id),
        secondPlayer.map((question) => question.id)
      );
    });

    test('Skips a player’s previously seen questions on later games', () => {
      const firstGame = pickQuestions(['genel-kultur'], 2, 1);
      const nextGame = pickQuestions(
        ['genel-kultur'],
        2,
        2,
        firstGame.map((question) => question.id)
      );

      assert.equal(new Set(nextGame.map((question) => question.id)).size, 2);
      assert.ok(nextGame.every((question) =>
        !firstGame.some((seenQuestion) => seenQuestion.id === question.id)
      ));
    });

    test('Fails rather than repeating when the unseen category pool is exhausted', () => {
      const categoryQuestions = questionsForCategory('genel-kultur');
      assert.throws(
        () => pickQuestions(
          ['genel-kultur'],
          1,
          1,
          categoryQuestions.map((question) => question.id)
        ),
        /daha önce görülmemiş/
      );
    });
  });

  describe('1. Blend Choices (True Answer + Fake Answers)', () => {
    test('Blends true answer and player fake answers, deduplicates and keeps author tags', () => {
      const fakeAnswers = {
        p1: '1920',
        p2: '1881', // novel fake
        p3: '1938', // novel fake
      };

      const choices = blendChoices(sampleQuestion, fakeAnswers, 123);
      assert.equal(choices.length, 4, 'Should contain only the correct answer and submitted fakes');
      assert.deepEqual(
        new Set(choices.map((choice) => choice.text)),
        new Set(['1923', '1920', '1881', '1938'])
      );

      // Must contain real answer
      const real = choices.find((c) => c.text === '1923');
      assert.ok(real, 'Real answer must be present');
      assert.equal(real.isCorrect, true);
      assert.equal(real.authorId, null);

      // Must contain p2 and p3 fake answers
      const p2Choice = choices.find((c) => c.text === '1881');
      assert.ok(p2Choice);
      assert.equal(p2Choice.authorId, 'p2');
      assert.equal(p2Choice.isCorrect, false);

      const p3Choice = choices.find((c) => c.text === '1938');
      assert.ok(p3Choice);
      assert.equal(p3Choice.authorId, 'p3');
      assert.equal(p3Choice.isCorrect, false);
    });

    test('Does not add question distractors when no players submitted fake answers', () => {
      const choices = blendChoices(sampleQuestion, {});
      assert.equal(choices.length, 1);
      assert.equal(choices[0].text, '1923');
      assert.equal(choices[0].isCorrect, true);
    });

    test('Rejects a question without a verified correct answer', () => {
      const questionWithoutAnswer: Question = {
        id: 'test-q2',
        categoryId: 'genel-kultur',
        prompt: 'Cevabı eksik soru',
      };
      assert.throws(
        () => blendChoices(questionWithoutAnswer, {}),
        /doğrulanmış doğru cevap/
      );
    });
  });

  describe('2. TUZAK Core Scoring Rules (+2, +1, no penalty)', () => {
    test('Correct answer earns +2 points and DOĞRU BİLDİN label', () => {
      const outcome = computeOutcome({
        answeredCorrectly: true,
        victimsCount: 0,
        choseRivalFake: false,
      });

      assert.equal(outcome.pointsEarned, 2);
      assert.equal(outcome.correct, true);
      assert.equal(outcome.zartaladın, false);
      assert.equal(outcome.zartalandın, false);
      assert.equal(outcome.labels.length, 1);
      assert.equal(outcome.labels[0].kind, 'correct');
    });

    test('Each rival choosing your fake answer gives +1 and TUZAĞA DÜŞÜRDÜN label', () => {
      const outcome = computeOutcome({
        answeredCorrectly: false,
        victimsCount: 2, // 2 rivals tricked
        choseRivalFake: false,
      });

      assert.equal(outcome.pointsEarned, 2); // two successful traps = two points
      assert.equal(outcome.correct, false);
      assert.equal(outcome.zartaladın, true);
      assert.equal(outcome.victimsCount, 2);
      assert.equal(outcome.labels.length, 1);
      assert.equal(outcome.labels[0].kind, 'zartaladın');
      assert.equal(outcome.labels[0].text, 'TUZAĞA DÜŞÜRDÜN');
    });

    test('Choosing another player fake answer causes no score loss', () => {
      const outcome = computeOutcome({
        answeredCorrectly: false,
        victimsCount: 0,
        choseRivalFake: true,
      });

      assert.equal(outcome.pointsEarned, 0);
      assert.equal(outcome.correct, false);
      assert.equal(outcome.zartalandın, true);
      assert.equal(outcome.labels.length, 1);
      assert.equal(outcome.labels[0].kind, 'zartalandın');
      assert.equal(outcome.labels[0].text, 'TUZAĞA DÜŞTÜN');
    });

    test('Correct answer plus two rivals tricked gives +4', () => {
      const outcome = computeOutcome({
        answeredCorrectly: true,
        victimsCount: 2,
        choseRivalFake: false,
      });

      assert.equal(outcome.pointsEarned, 4); // two base points + two trap points
      assert.equal(outcome.correct, true);
      assert.equal(outcome.zartaladın, true);
      assert.equal(outcome.labels.length, 2);
      assert.equal(outcome.labels[0].kind, 'correct');
      assert.equal(outcome.labels[1].kind, 'zartaladın');
      assert.equal(outcome.labels[1].text, 'TUZAĞA DÜŞÜRDÜN');
    });
  });

  describe('3. Full Round Resolution with Multiple Players', () => {
    test('Resolves full round: true answer, victims tricked, and fell for fake', () => {
      const p1 = createPlayer('p1', 'Ali', 50);
      const p2 = createPlayer('p2', 'Ayşe', 100);
      const p3 = createPlayer('p3', 'Mehmet', 80);

      // Choices:
      // index 0: "1923" (Real, null author)
      // index 1: "1881" (Fake by p1)
      // index 2: "1938" (Fake by p2)
      // index 3: "1919" (Decoy)
      const choices: RoundChoice[] = [
        { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
        { choiceIndex: 1, text: '1881', authorId: 'p1', isCorrect: false },
        { choiceIndex: 2, text: '1938', authorId: 'p2', isCorrect: false },
        { choiceIndex: 3, text: '1919', authorId: null, isCorrect: false },
      ];

      // Picks:
      // p1 picks 0 (Correct -> +2)
      // p2 picks p1's fake answer (0 points for p2, +1 for p1)
      // p3 picks p1's fake answer (0 points for p3, +1 for p1)
      const picks = {
        p1: 0,
        p2: 1,
        p3: 1,
      };

      const res = resolveZartoRound({
        question: sampleQuestion,
        players: [p1, p2, p3],
        choices,
        picks,
        fakeAnswers: { p1: '1881', p2: '1938' },
      });

      // p1: +2 (correct) + 2 (two rivals tricked) = +4
      assert.equal(res.rows['p1'].pointsDelta, 4);
      assert.equal(res.rows['p1'].outcome.correct, true);
      assert.equal(res.rows['p1'].victimsCount, 2);
      assert.equal(res.updatedPlayers['p1'].score, 54); // 50 + 4

      // p2 chose p1's fake answer but loses no points
      assert.equal(res.rows['p2'].pointsDelta, 0);
      assert.equal(res.rows['p2'].outcome.zartalandın, true);
      assert.equal(res.updatedPlayers['p2'].score, 100);

      // p3 chose p1's fake answer but loses no points
      assert.equal(res.rows['p3'].pointsDelta, 0);
      assert.equal(res.updatedPlayers['p3'].score, 80);
    });

    test('Clamps score to 0 when penalty exceeds player current score', () => {
      const p1 = createPlayer('p1', 'Yeni', 20);
      const choices: RoundChoice[] = [
        { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
        { choiceIndex: 1, text: '1881', authorId: 'p2', isCorrect: false },
      ];
      const picks = { p1: 1 }; // picks rival fake -> 0 points

      const res = resolveZartoRound({
        question: sampleQuestion,
        players: [p1],
        choices,
        picks,
      });

      assert.equal(res.rows['p1'].pointsDelta, 0);
      assert.equal(res.updatedPlayers['p1'].score, 20); // wrong picks do not subtract points
    });
  });

  describe('4. Match Credit Economy & Ability Rules', () => {
    test('Crossing each score milestone awards a match credit only once', () => {
      const player = createPlayer('milestone', 'Milestone', 4);
      const result = resolveZartoRound({
        question: sampleQuestion,
        players: [player],
        choices: [
          { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
        ],
        picks: { milestone: 0 },
      });

      assert.equal(result.updatedPlayers.milestone.score, 6);
      assert.equal(result.updatedPlayers.milestone.credits, 1);
      assert.equal(result.updatedPlayers.milestone.creditMilestonesAwarded, 1);

      const applied = applyRoundToPlayers({ milestone: player }, result.rows);
      assert.equal(applied.milestone.score, 6);
      assert.equal(applied.milestone.credits, 1);
      assert.equal(applied.milestone.creditMilestonesAwarded, 1);

      const next = resolveZartoRound({
        question: sampleQuestion,
        players: [result.updatedPlayers.milestone],
        choices: [
          { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
        ],
        picks: { milestone: 0 },
      });
      assert.equal(next.updatedPlayers.milestone.credits, 1);
      assert.equal(next.updatedPlayers.milestone.creditMilestonesAwarded, 1);
    });


    test('Score streaks no longer grant free shields', () => {
      const p1 = createPlayer('p1', 'Dahi', 0);
      p1.consecutiveCorrect = 2; // already 2 correct in previous rounds

      const choices: RoundChoice[] = [
        { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
      ];
      const picks = { p1: 0 }; // 3rd correct answer!

      const res = resolveZartoRound({
        question: sampleQuestion,
        players: [p1],
        choices,
        picks,
      });

      assert.equal(res.updatedPlayers['p1'].shieldsAvailable, 0);
      assert.equal(res.updatedPlayers['p1'].consecutiveCorrect, 3); // streak remains informational
    });

    test('Tricking rivals no longer grants free blocks', () => {
      const p1 = createPlayer('p1', 'Blöfçü', 0);
      const p2 = createPlayer('p2', 'Kurban1', 100);
      const p3 = createPlayer('p3', 'Kurban2', 100);
      const p4 = createPlayer('p4', 'Kurban3', 100);

      const choices: RoundChoice[] = [
        { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
        { choiceIndex: 1, text: '1881', authorId: 'p1', isCorrect: false },
      ];

      const picks = {
        p1: 0,
        p2: 1,
        p3: 1,
        p4: 1, // 3 rivals picked p1's fake!
      };

      const res = resolveZartoRound({
        question: sampleQuestion,
        players: [p1, p2, p3, p4],
        choices,
        picks,
      });

      assert.equal(res.updatedPlayers['p1'].blocksAvailable, 0);
    });

    test('Block applies before fake answers, while a same-round shield protects its user', () => {
      const p1 = createPlayer('p1', 'Attacker', 0);
      const p2 = createPlayer('p2', 'Defender', 0);
      const p3 = createPlayer('p3', 'ShieldedDefender', 0);
      const p4 = createPlayer('p4', 'SecondAttacker', 0);
      p1.blocksAvailable = 1;
      p4.blocksAvailable = 1;
      p3.shieldsAvailable = 1;

      const choices: RoundChoice[] = [
        { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
      ];
      const picks = { p1: 0, p2: 0, p3: 0, p4: 0 };

      const abilityActions = [
        { playerId: 'p1', abilityId: 'block' as const, targetId: 'p2' },
        { playerId: 'p4', abilityId: 'block' as const, targetId: 'p3' },
        { playerId: 'p3', abilityId: 'shield' as const },
      ];
      const selectionPlayers = applyRoundBlockEffects(
        [p1, p2, p3, p4],
        abilityActions
      );

      assert.equal(selectionPlayers.p2.isBlockedCurrentRound, true);
      assert.equal(selectionPlayers.p2.isBlockedNextRound, false);
      assert.equal(selectionPlayers.p2.blockedByPlayerId, 'p1');
      assert.equal(selectionPlayers.p3.isBlockedCurrentRound, false);

      const res = resolveZartoRound({
        question: sampleQuestion,
        players: Object.values(selectionPlayers),
        choices,
        picks,
        abilityActions,
      });
      assert.equal(res.updatedPlayers.p2.isBlockedCurrentRound, true);
      assert.equal(res.updatedPlayers.p2.isBlockedNextRound, false);
      assert.equal(res.rows.p2.pointsDelta, 2);
      assert.equal(res.updatedPlayers.p2.score, 2);
      assert.equal(res.updatedPlayers.p3.isBlockedCurrentRound, false);
      assert.equal(res.updatedPlayers.p3.shieldsAvailable, 1);
      assert.equal(res.updatedPlayers.p1.blocksAvailable, 1);
      assert.equal(res.updatedPlayers.p4.blocksAvailable, 1);

      const nextRoundPlayers = clearRoundBlockState(Object.values(res.updatedPlayers));
      assert.equal(nextRoundPlayers.p2.isBlockedCurrentRound, false);
      assert.equal(nextRoundPlayers.p2.blockedByPlayerId, null);
    });

    test('Multiple blocks prevent fake answers once and choose a stable blocker', () => {
      const players = [
        createPlayer('player-a', 'A'),
        createPlayer('player-b', 'B'),
        createPlayer('target', 'Target'),
      ];
      const result = applyRoundBlockEffects(players, [
        { playerId: 'player-b', abilityId: 'block', targetId: 'target' },
        { playerId: 'player-a', abilityId: 'block', targetId: 'target' },
      ]);

      assert.equal(result.target.isBlockedCurrentRound, true);
      assert.equal(result.target.blockedByPlayerId, 'player-a');
      assert.equal(result.target.isBlockedNextRound, false);
    });

    test('A player who does not pick earns no points or ability unlocks', () => {
      const unanswered = createPlayer('unanswered', 'Unanswered');
      const picker = createPlayer('picker', 'Picker');
      const result = resolveZartoRound({
        question: sampleQuestion,
        players: [unanswered, picker],
        choices: [
          { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
          { choiceIndex: 1, text: 'Blöf', authorId: 'unanswered', isCorrect: false },
        ],
        picks: { picker: 1 },
      });

      assert.equal(result.rows.unanswered.victimsCount, 0);
      assert.equal(result.rows.unanswered.pointsDelta, 0);
      assert.equal(result.updatedPlayers.unanswered.score, 0);
      assert.equal(result.updatedPlayers.unanswered.blocksAvailable, 0);
    });

    test('Legacy penalty/counter actions never subtract points', () => {
      const attacker = createPlayer('attacker', 'Attacker', 100);
      const target = createPlayer('target', 'Target', 100);
      const choices: RoundChoice[] = [
        { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
        { choiceIndex: 1, text: 'Yanlış', authorId: null, isCorrect: false },
      ];
      const picks = { attacker: 0, target: 1 };
      const penalty = resolveZartoRound({
        question: sampleQuestion,
        players: [attacker, target],
        choices,
        picks,
        abilityActions: [{ playerId: 'attacker', abilityId: 'penalty', targetId: 'target' }],
      });
      assert.equal(penalty.rows.target.pointsDelta, 0);
      assert.equal(penalty.rows.target.penaltyDelta, 0);
      assert.equal(penalty.updatedPlayers.target.score, 100);

      const counter = resolveZartoRound({
        question: sampleQuestion,
        players: [attacker, target],
        choices,
        picks,
        abilityActions: [
          { playerId: 'attacker', abilityId: 'penalty', targetId: 'target' },
          { playerId: 'target', abilityId: 'counter' },
        ],
      });
      assert.equal(counter.rows.target.pointsDelta, 0);
      assert.equal(counter.rows.attacker.pointsDelta, 2);
      assert.equal(counter.rows.attacker.penaltyDelta, 0);
      assert.equal(counter.updatedPlayers.attacker.score, 102);
      assert.equal(counter.updatedPlayers.target.score, 100);
    });

    test('A wrong fake pick does not subtract score when a legacy penalty action is present', () => {
      const attacker = createPlayer('attacker', 'Attacker', 100);
      const target = createPlayer('target', 'Target', 100);
      target.shieldsAvailable = 1;
      target.credits = 1;
      const result = resolveZartoRound({
        question: sampleQuestion,
        players: [attacker, target],
        choices: [
          { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
          { choiceIndex: 1, text: 'Yanlış', authorId: 'attacker', isCorrect: false },
        ],
        picks: { attacker: 0, target: 1 },
        abilityActions: [
          { playerId: 'attacker', abilityId: 'penalty', targetId: 'target' },
          { playerId: 'target', abilityId: 'shield' },
        ],
      });

      assert.equal(result.rows.target.pointsDelta, 0);
      assert.equal(result.rows.target.penaltyDelta, 0);
      assert.equal(result.updatedPlayers.target.score, 100);
      assert.equal(result.updatedPlayers.target.shieldsAvailable, 1);
    });

    test('Legacy multiple penalties never subtract points', () => {
      const target = createPlayer('target', 'Target', 200);
      const result = resolveZartoRound({
        question: sampleQuestion,
        players: [
          createPlayer('attacker-1', 'Attacker 1', 100),
          createPlayer('attacker-2', 'Attacker 2', 100),
          target,
        ],
        picks: { 'attacker-1': 0, 'attacker-2': 0, target: 1 },
        choices: [
          { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
          { choiceIndex: 1, text: 'Yanlış', authorId: 'attacker-1', isCorrect: false },
        ],
        abilityActions: [
          { playerId: 'attacker-1', abilityId: 'penalty', targetId: 'target' },
          { playerId: 'attacker-2', abilityId: 'penalty', targetId: 'target' },
        ],
      });

      assert.equal(result.rows.target.pointsDelta, 0);
      assert.equal(result.rows.target.penaltyDelta, 0);
      assert.equal(result.updatedPlayers.target.score, 200);
    });

    test('Blocked player can guess correctly but cannot submit a fake answer', () => {
      const p1 = createPlayer('p1', 'BlockedGuy', 100);
      p1.isBlockedCurrentRound = true;
      p1.blockedByPlayerId = 'attacker';

      const choices: RoundChoice[] = [
        { choiceIndex: 0, text: '1923', authorId: null, isCorrect: true },
      ];
      const picks = { p1: 0 };

      const res = resolveZartoRound({
        question: sampleQuestion,
        players: [p1],
        choices,
        picks,
      });

      assert.equal(res.rows['p1'].isBlocked, true);
      assert.equal(res.rows['p1'].outcome.correct, true);
      assert.equal(res.rows['p1'].pointsDelta, 2);
      assert.equal(res.updatedPlayers['p1'].score, 102);
      assert.equal(res.updatedPlayers['p1'].consecutiveCorrect, 1);
      assert.equal(res.updatedPlayers['p1'].isBlockedCurrentRound, true);
      assert.equal(res.updatedPlayers['p1'].blockedByPlayerId, 'attacker');
    });

    test('canUseAbility enforces constraints (cannot block self, cannot block same target consecutively)', () => {
      const state = freshAbilityState('p1');
      state.blocksAvailable = 1;
      state.credits = 1;

      // Cannot block self
      const selfBlock = canUseAbility(state, 'block', 'p1');
      assert.equal(selfBlock.allowed, false);

      // Valid rival block
      const validBlock = canUseAbility(state, 'block', 'p2');
      assert.equal(validBlock.allowed, true);

      state.isBlockedCurrentRound = true;
      state.shieldsAvailable = 1;
      const shieldWhileBlocked = canUseAbility(state, 'shield');
      assert.equal(shieldWhileBlocked.allowed, true);

      // Cannot block same target consecutively
      state.lastBlockedPlayerId = 'p2';
      const repeatBlock = canUseAbility(state, 'block', 'p2');
      assert.equal(repeatBlock.allowed, false);
    });

      test('Starting a new demo match resets score, credits and milestone progress', async () => {
        const host = new DemoGameService();
        await host.connect();
        const room = await host.createRoom({
          hostName: 'Host',
          avatarKey: 'fox',
          totalRounds: 2,
          roundSeconds: 30,
          categories: ['genel-kultur'],
        });
        const lobby = await host.getRoomState(room.code);
        assert.ok(lobby);
        lobby.players[room.playerId].score = 17;
        lobby.players[room.playerId].credits = 4;
        lobby.players[room.playerId].creditMilestonesAwarded = 3;

        await host.startGame(room.code);
        const started = await host.getRoomState(room.code);
        assert.equal(started?.players[room.playerId].score, 0);
        assert.equal(started?.players[room.playerId].credits, 0);
        assert.equal(started?.players[room.playerId].creditMilestonesAwarded, 0);
      });

    describe('Block phase integration in demo mode', () => {
      test('Pauses the shared round timer and resumes with the remaining time intact', async () => {
        const { host, roomCode, targetId } = await createDemoBlockRound(30);
        const beforePause = await host.getRoomState(roomCode);
        const originalDeadline = beforePause?.phaseDeadlineAt;

        await host.setRoomPaused(roomCode, true);
        const pausedState = await host.getRoomState(roomCode);
        assert.ok(pausedState?.pausedAt);
        assert.equal(await host.advanceExpiredPhase(roomCode), false);
        await assert.rejects(
          host.useAbility(roomCode, {
            playerId: beforePause!.config.hostId,
            abilityId: 'block',
            targetId,
          }),
          /duraklatıldı/
        );

        await new Promise((resolve) => setTimeout(resolve, 20));
        await host.setRoomPaused(roomCode, false);
        const resumedState = await host.getRoomState(roomCode);
        assert.equal(resumedState?.pausedAt, null);
        assert.ok((resumedState?.phaseDeadlineAt ?? 0) > (originalDeadline ?? 0));
      });

      test('Charges credits once and makes ability purchase retries idempotent', async () => {
        const { host, roomCode, targetId } = await createDemoBlockRound();
        const before = await host.getRoomState(roomCode);
        assert.equal(before?.players[before.config.hostId].credits, 0);

        await host.useAbility(roomCode, {
          playerId: before!.config.hostId,
          abilityId: 'block',
          targetId,
        });

        const after = await host.getRoomState(roomCode);
        assert.equal(after?.players[after.config.hostId].credits, 0);
        assert.equal(after?.abilityActions.filter((action) => action.playerId === before!.config.hostId).length, 1);
      });

      test('Confirms the block before the fake-answer phase begins', async () => {
        const { host, roomCode, targetId } = await createDemoBlockRound();
        await host.confirmAbilitySelection(roomCode);

        const fakeAnswerState = await host.getRoomState(roomCode);
        assert.equal(fakeAnswerState?.phase, 'fake_answer');
        assert.equal(fakeAnswerState?.players[targetId].isBlockedCurrentRound, true);
        assert.equal(fakeAnswerState?.players[targetId].isBlockedNextRound, false);
      });

      test('Applies a block once on ability timeout and gives no points for unanswered guesses', async () => {
        const { host, roomCode, targetId } = await createDemoBlockRound(1);
        const waitForPhaseTimeout = () => new Promise((resolve) => setTimeout(resolve, 1200));

        await waitForPhaseTimeout();
        assert.equal(await host.advanceExpiredPhase(roomCode), true);
        assert.equal(await host.advanceExpiredPhase(roomCode), false);
        let state = await host.getRoomState(roomCode);
        assert.equal(state?.phase, 'fake_answer');
        assert.equal(state?.players[targetId].isBlockedCurrentRound, true);

        await waitForPhaseTimeout();
        assert.equal(await host.advanceExpiredPhase(roomCode), true);
        state = await host.getRoomState(roomCode);
        assert.equal(state?.phase, 'guess');

        await waitForPhaseTimeout();
        assert.equal(await host.advanceExpiredPhase(roomCode), true);
        state = await host.getRoomState(roomCode);
        assert.equal(state?.phase, 'reveal');
        assert.ok(Object.values(state?.roundResults ?? {}).every((row) => row.pointsDelta === 0));
      });
    });
  });
});


describe('Player achievements', () => {
  test('starts locked and shows zero progress when player stats are missing', () => {
    const achievements = getPlayerAchievements(undefined);

    assert.equal(achievements.length, 10);
    assert.ok(achievements.every((achievement) => !achievement.unlocked));
    assert.ok(achievements.every((achievement) => achievement.progress === 0));
    assert.ok(achievements.every((achievement) => achievement.progressPercent === 0));
  });

  test('unlocks milestones from persisted player stats and caps displayed progress', () => {
    const achievements = getPlayerAchievements({
      gamesPlayed: 75,
      gamesWon: 8,
      successfulTraps: 30,
      correctAnswers: 140,
    });

    assert.ok(achievements.every((achievement) => achievement.unlocked));
    assert.ok(achievements.every((achievement) => achievement.progressPercent === 100));
    assert.ok(achievements.every((achievement) => achievement.progress === achievement.target));
  });

  test('does not allow negative, fractional, or non-finite statistics to inflate progress', () => {
    const achievements = getPlayerAchievements({
      gamesPlayed: -2,
      gamesWon: 1.9,
      successfulTraps: Number.NaN,
      correctAnswers: Number.POSITIVE_INFINITY,
    });
    const byId = Object.fromEntries(achievements.map((achievement) => [achievement.id, achievement]));

    assert.equal(byId['first-match'].progress, 0);
    assert.equal(byId['first-win'].progress, 1);
    assert.equal(byId['first-win'].unlocked, true);
    assert.equal(byId['first-trap'].progress, 0);
    assert.equal(byId['sharp-mind'].progress, 0);
    assert.equal(byId['wise-fox'].progressPercent, 0);
  });
});
