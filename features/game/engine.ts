import type {
  AbilityAction,
  AnswerSubmission,
  GameMode,
  Player,
  PlayerId,
  RoundChoice,
  RoundResultRow,
} from '../../types/game';
import { computeOutcome, POINTS } from './outcomes';
import type { Question } from './questions';

/**
 * Apply Survival-mode life loss after each authoritative round result.
 * Incorrect answers and timeouts cost one life; correct answers and eliminated
 * players remain unchanged. Classic scoring never calls this helper.
 */
export function applySurvivalLives(
  players: Player[],
  rows: Record<PlayerId, RoundResultRow>
): Record<PlayerId, Player> {
  return Object.fromEntries(players.map((player) => {
    const currentLives = Math.max(0, Math.min(3, player.livesRemaining ?? 3));
    const result = rows[player.id];
    const nextLives = currentLives > 0 && result && !result.outcome.correct
      ? Math.max(0, currentLives - 1)
      : currentLives;
    return [player.id, { ...player, livesRemaining: nextLives }];
  }));
}

export interface ZartoRoundInput {
  question: Question;
  players: Player[];
  choices: RoundChoice[];
  picks: Record<PlayerId, number>; // playerId -> choiceIndex
  fakeAnswers?: Record<PlayerId, string>;
  abilityActions?: AbilityAction[];
  gameMode?: GameMode;
  suspectPicks?: Record<PlayerId, PlayerId>;
  pickTimes?: Record<PlayerId, number>;
  phaseStartedAt?: number;
}

export interface ZartoRoundResolution {
  rows: Record<PlayerId, RoundResultRow>;
  rowsList: RoundResultRow[];
  updatedPlayers: Record<PlayerId, Player>;
}

export function applyRoundBlockEffects(
  players: Player[],
  abilityActions: AbilityAction[]
): Record<PlayerId, Player> {
  const shieldedPlayers = new Set(
    abilityActions
      .filter((action) => action.abilityId === 'shield')
      .map((action) => action.playerId)
  );
  const blockersByTarget = new Map<PlayerId, PlayerId[]>();

  for (const action of abilityActions) {
    if (action.abilityId !== 'block' || !action.targetId) continue;
    const blockers = blockersByTarget.get(action.targetId) ?? [];
    blockers.push(action.playerId);
    blockersByTarget.set(action.targetId, blockers);
  }

  const next = Object.fromEntries(players.map((player) => [player.id, { ...player }]));
  for (const [targetId, blockers] of blockersByTarget) {
    if (shieldedPlayers.has(targetId) || !next[targetId]) continue;
    const blockerId = [...blockers].sort()[0];
    next[targetId] = {
      ...next[targetId],
      isBlockedCurrentRound: true,
      blockedByPlayerId: blockerId,
    };
  }
  return next;
}

export function clearRoundBlockState(players: Player[]): Record<PlayerId, Player> {
  return Object.fromEntries(players.map((player) => [
    player.id,
    {
      ...player,
      isBlockedCurrentRound: false,
      isBlockedNextRound: false,
      blockedByPlayerId: null,
    },
  ]));
}

export function normalizeChoiceText(text: string): string {
  return text.trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export type FakeAnswerValidationError = 'correct_answer' | 'duplicate_answer' | null;

/** Validate submitted bluff text against the actual answer and other players' submissions. */
export function validateFakeAnswer(
  question: Question,
  fakeAnswer: string,
  otherFakeAnswers: Iterable<string>
): FakeAnswerValidationError {
  const normalized = normalizeChoiceText(fakeAnswer);
  if (!normalized) return null;
  if (normalized === normalizeChoiceText(question.correctAnswer ?? '')) return 'correct_answer';
  for (const answer of otherFakeAnswers) {
    if (normalizeChoiceText(answer) === normalized) return 'duplicate_answer';
  }
  return null;
}

/**
 * Blend the true answer and player fake answers into a single shuffled choice list.
 */
export function blendChoices(
  question: Question,
  fakeAnswers: Record<PlayerId, string>,
  randomSeed = 42
): RoundChoice[] {
  interface RawChoice {
    text: string;
    authorId: PlayerId | null;
    isCorrect: boolean;
  }

  const rawList: RawChoice[] = [];

  // 1. True answer
  const trueAnswer = question.correctAnswer?.trim();
  if (!trueAnswer) throw new Error('Soru için doğrulanmış doğru cevap bulunamadı.');
  rawList.push({
    text: trueAnswer,
    authorId: null,
    isCorrect: true,
  });

  // 2. Player fake answers
  const seenTexts = new Set<string>([normalizeChoiceText(trueAnswer)]);
  for (const [playerId, fakeText] of Object.entries(fakeAnswers)) {
    const clean = fakeText.trim();
    if (!clean) continue;
    // Don't add if identical to true answer
    const normalized = normalizeChoiceText(clean);
    if (seenTexts.has(normalized)) continue;
    seenTexts.add(normalized);
    rawList.push({
      text: clean,
      authorId: playerId,
      isCorrect: false,
    });
  }

  // Deterministic Fisher-Yates shuffle
  const arr = [...rawList];
  let s = randomSeed * 9301 + 49297;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.map((item, index) => ({
    choiceIndex: index,
    text: item.text,
    authorId: item.authorId,
    isCorrect: item.isCorrect,
  }));
}

/**
 * Authoritative ZARTO Round Resolution
 */
export function resolveZartoRound(input: ZartoRoundInput): ZartoRoundResolution {
  const {
    question,
    players,
    choices,
    picks,
    fakeAnswers = {},
    abilityActions = [],
    gameMode,
    suspectPicks = {},
    pickTimes = {},
    phaseStartedAt,
  } = input;

  const choicesByIndex = new Map<number, RoundChoice>();
  for (const c of choices) {
    choicesByIndex.set(c.choiceIndex, c);
  }

  // 1. Register purchased abilities for this round
  const blocksByTarget = new Map<PlayerId, PlayerId[]>();
  const abilityUsesByPlayer = new Map<PlayerId, Record<string, number>>();

  for (const action of abilityActions) {
    const player = players.find((candidate) => candidate.id === action.playerId);
    if (!player) continue;
    const uses = abilityUsesByPlayer.get(action.playerId) ?? {};
    uses[action.abilityId] = (uses[action.abilityId] ?? 0) + 1;
    abilityUsesByPlayer.set(action.playerId, uses);
    if (action.abilityId === 'block' && action.targetId) {
      const attackers = blocksByTarget.get(action.targetId) ?? [];
      attackers.push(action.playerId);
      blocksByTarget.set(action.targetId, attackers);
    }
  }

  // 2. Calculate picks and fake answer traps
  // Count how many players picked each fake answer author
  const victimCountsByAuthor = new Map<PlayerId, number>();
  for (const p of players) {
    const pickIndex = picks[p.id];
    if (pickIndex === undefined) continue;
    const chosen = choicesByIndex.get(pickIndex);
    if (chosen && !chosen.isCorrect && chosen.authorId && chosen.authorId !== p.id) {
      victimCountsByAuthor.set(
        chosen.authorId,
        (victimCountsByAuthor.get(chosen.authorId) ?? 0) + 1
      );
    }
  }

  const rows: Record<PlayerId, RoundResultRow> = {};
  const rowsList: RoundResultRow[] = [];
  const updatedPlayers: Record<PlayerId, Player> = {};

  for (const p of players) {
    const isBlocked = !!p.isBlockedCurrentRound;

    const pickIndex = picks[p.id];
    const chosen = pickIndex !== undefined ? choicesByIndex.get(pickIndex) : undefined;

    const answeredCorrectly = !!chosen?.isCorrect;
    const choseRivalFake = !!(chosen && !chosen.isCorrect && chosen.authorId && chosen.authorId !== p.id);
    const deceivedByAuthorId = choseRivalFake ? chosen!.authorId : null;
    const victimsCount = pickIndex === undefined
      ? 0
      : victimCountsByAuthor.get(p.id) ?? 0;

    const outcome = computeOutcome({
      answeredCorrectly,
      victimsCount,
      choseRivalFake,
    });

    let suspectBonus = 0;
    let suspectId: PlayerId | null = null;
    if (gameMode === 'suspicious' && suspectPicks[p.id]) {
      const accusedId = suspectPicks[p.id];
      if (accusedId && accusedId !== p.id) {
        suspectId = accusedId;
        const accusedVictims = victimCountsByAuthor.get(accusedId) ?? 0;
        if (accusedVictims > 0) {
          suspectBonus = 1;
        }
      }
    }

    let speedBonus = 0;
    let isFastAnswer = false;
    if (gameMode === 'blitz' && answeredCorrectly && phaseStartedAt && pickTimes[p.id]) {
      const durationMs = pickTimes[p.id] - phaseStartedAt;
      if (durationMs >= 0 && durationMs <= 3000) {
        speedBonus = 1;
        isFastAnswer = true;
      }
    }

    const pointsDelta = outcome.pointsEarned + suspectBonus + speedBonus;
    const penaltyDelta = 0;

    const row: RoundResultRow = {
      playerId: p.id,
      outcome,
      labels: outcome.labels,
      pointsDelta,
      victimsCount,
      deceivedByAuthorId,
      pickedText: chosen?.text,
      ownFakeText: fakeAnswers[p.id],
      isBlocked,
      penaltyDelta,
      suspectId,
      suspectBonus: suspectBonus > 0 ? suspectBonus : undefined,
      speedBonus: speedBonus > 0 ? speedBonus : undefined,
      isFastAnswer: isFastAnswer || undefined,
    };

    rows[p.id] = row;
    rowsList.push(row);

    // Abilities are purchased with credits, not unlocked by score streaks.
    const consecutiveCorrect = answeredCorrectly ? p.consecutiveCorrect + 1 : 0;
    const shieldsAvailable = p.shieldsAvailable;
    const blocksAvailable = p.blocksAvailable;

    const abilityUsedCounts = { ...p.abilityUsedCounts };
    for (const [abilityId, usedCount] of Object.entries(abilityUsesByPlayer.get(p.id) ?? {})) {
      abilityUsedCounts[abilityId as keyof typeof abilityUsedCounts] += usedCount;
    }

    const nextScore = Math.max(0, p.score + pointsDelta);
    const reachedMilestones = nextScore >= 15 ? 3 : nextScore >= 10 ? 2 : nextScore >= 5 ? 1 : 0;
    const milestonesAwarded = p.creditMilestonesAwarded ?? 0;
    updatedPlayers[p.id] = {
      ...p,
      score: nextScore,
      credits: (p.credits ?? 0) + Math.max(0, reachedMilestones - milestonesAwarded),
      creditMilestonesAwarded: Math.max(milestonesAwarded, reachedMilestones),
      abilityUsedCounts,
      consecutiveCorrect,
      shieldsAvailable,
      blocksAvailable,
      isBlockedCurrentRound: p.isBlockedCurrentRound,
      isBlockedNextRound: false,
      blockedByPlayerId: p.isBlockedCurrentRound ? p.blockedByPlayerId ?? null : null,
      lastBlockedPlayerId: p.lastBlockedPlayerId,
    };
  }

  // Legacy penalty/counter action payloads can no longer subtract score.

  for (const [targetId, attackerIds] of blocksByTarget) {
    for (const attackerId of attackerIds) {
      if (updatedPlayers[attackerId]) {
        updatedPlayers[attackerId].lastBlockedPlayerId = targetId;
      }
    }
  }

  return { rows, rowsList, updatedPlayers };
}

// Backward-compatible resolveRound signature for existing tests & UI
export function resolveRound(input: {
  question: Question;
  players: Player[];
  answers: Record<string, AnswerSubmission>;
  abilityActions?: AbilityAction[];
}): { rows: Record<string, RoundResultRow>; rowsList: RoundResultRow[] } {
  const { question, players, answers, abilityActions = [] } = input;

  // Adapt old AnswerSubmission to ZARTO picks / fakeAnswers
  const picks: Record<PlayerId, number> = {};
  const fakeAnswers: Record<PlayerId, string> = {};

  for (const [pid, sub] of Object.entries(answers)) {
    if (sub.choiceIndex !== undefined) {
      picks[pid] = sub.choiceIndex;
    } else if (sub.selectedIndex !== undefined) {
      picks[pid] = sub.selectedIndex;
    }
    if (sub.fakeAnswer) {
      fakeAnswers[pid] = sub.fakeAnswer;
    }
  }

  // Generate choices if not supplied
  const choices = blendChoices(question, fakeAnswers);

  const res = resolveZartoRound({
    question,
    players,
    choices,
    picks,
    fakeAnswers,
    abilityActions,
  });

  return { rows: res.rows, rowsList: res.rowsList };
}

export function applyRoundToPlayers(
  players: Record<string, Player>,
  rows: Record<string, RoundResultRow>
): Record<string, Player> {
  const next: Record<string, Player> = {};
  for (const id of Object.keys(players)) {
    const p = players[id];
    const delta = rows[id]?.pointsDelta ?? 0;
    const score = Math.max(0, p.score + delta);
    const reachedMilestones = score >= 15 ? 3 : score >= 10 ? 2 : score >= 5 ? 1 : 0;
    const milestonesAwarded = p.creditMilestonesAwarded ?? 0;
    next[id] = {
      ...p,
      score,
      credits: (p.credits ?? 0) + Math.max(0, reachedMilestones - milestonesAwarded),
      creditMilestonesAwarded: Math.max(milestonesAwarded, reachedMilestones),
    };
  }
  return next;
}

export function applyAbilityActionsToPlayers(
  players: Record<string, Player>,
  actions: AbilityAction[]
): Record<string, Player> {
  const next: Record<string, Player> = {};
  for (const id of Object.keys(players)) next[id] = { ...players[id] };
  for (const a of actions) {
    const p = next[a.playerId];
    if (!p) continue;
    next[a.playerId] = {
      ...p,
      abilityUsedCounts: {
        ...p.abilityUsedCounts,
        [a.abilityId]: (p.abilityUsedCounts?.[a.abilityId] ?? 0) + 1,
      },
    };
  }
  return next;
}

export { POINTS };
