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
import {
  countsAsTrapVictim,
  detectiveForRound,
  isGoldenRound,
  missionBonusForRound,
} from './modeRules';

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
  picks: Record<PlayerId, number>;
  fakeAnswers?: Record<PlayerId, string>;
  abilityActions?: AbilityAction[];
  gameMode?: GameMode;
  suspectPicks?: Record<PlayerId, PlayerId>;
  pickTimes?: Record<PlayerId, number>;
  phaseStartedAt?: number;
  currentRound?: number;
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
    abilityActions.filter((a) => a.abilityId === 'shield').map((a) => a.playerId)
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
    next[targetId] = { ...next[targetId], isBlockedCurrentRound: true, blockedByPlayerId: blockerId };
  }
  return next;
}

export function clearRoundBlockState(players: Player[]): Record<PlayerId, Player> {
  return Object.fromEntries(players.map((player) => [player.id, {
    ...player,
    isBlockedCurrentRound: false,
    isBlockedNextRound: false,
    blockedByPlayerId: null,
  }]));
}

export function normalizeChoiceText(text: string): string {
  return text.trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export type FakeAnswerValidationError = 'correct_answer' | 'duplicate_answer' | null;

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

export function blendChoices(
  question: Question,
  fakeAnswers: Record<PlayerId, string>,
  randomSeed = 42
): RoundChoice[] {
  const trueAnswer = question.correctAnswer?.trim();
  if (!trueAnswer) throw new Error('Soru için doğrulanmış doğru cevap bulunamadı.');
  const rawList: Array<{ text: string; authorId: PlayerId | null; isCorrect: boolean }> = [
    { text: trueAnswer, authorId: null, isCorrect: true },
  ];
  const seenTexts = new Set<string>([normalizeChoiceText(trueAnswer)]);
  for (const [playerId, fakeText] of Object.entries(fakeAnswers)) {
    const clean = fakeText.trim();
    if (!clean) continue;
    const normalized = normalizeChoiceText(clean);
    if (seenTexts.has(normalized)) continue;
    seenTexts.add(normalized);
    rawList.push({ text: clean, authorId: playerId, isCorrect: false });
  }
  const arr = [...rawList];
  let s = randomSeed * 9301 + 49297;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.map((item, index) => ({ choiceIndex: index, ...item }));
}

export function resolveZartoRound(input: ZartoRoundInput): ZartoRoundResolution {
  const {
    players,
    choices,
    picks,
    fakeAnswers = {},
    abilityActions = [],
    gameMode,
    suspectPicks = {},
    pickTimes = {},
    phaseStartedAt,
    currentRound = 1,
  } = input;

  const choicesByIndex = new Map<number, RoundChoice>(choices.map((c) => [c.choiceIndex, c]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const blocksByTarget = new Map<PlayerId, PlayerId[]>();
  const abilityUsesByPlayer = new Map<PlayerId, Record<string, number>>();
  for (const action of abilityActions) {
    const player = playerById.get(action.playerId);
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

  const victimCountsByAuthor = new Map<PlayerId, number>();
  for (const picker of players) {
    const pickIndex = picks[picker.id];
    if (pickIndex === undefined) continue;
    const chosen = choicesByIndex.get(pickIndex);
    const author = chosen?.authorId ? playerById.get(chosen.authorId) : undefined;
    if (chosen && !chosen.isCorrect && author && countsAsTrapVictim(picker, author, gameMode)) {
      victimCountsByAuthor.set(author.id, (victimCountsByAuthor.get(author.id) ?? 0) + 1);
    }
  }

  const detectiveId = detectiveForRound(players, gameMode, currentRound);
  const golden = isGoldenRound(gameMode, currentRound);
  const rows: Record<PlayerId, RoundResultRow> = {};
  const rowsList: RoundResultRow[] = [];
  const updatedPlayers: Record<PlayerId, Player> = {};

  for (const p of players) {
    const pickIndex = picks[p.id];
    const hasPick = pickIndex !== undefined;
    const chosen = hasPick ? choicesByIndex.get(pickIndex) : undefined;
    const chosenAuthor = chosen?.authorId ? playerById.get(chosen.authorId) : undefined;
    const answeredCorrectly = !!chosen?.isCorrect;
    const choseRivalFake = !!(chosen && !chosen.isCorrect && chosenAuthor && countsAsTrapVictim(p, chosenAuthor, gameMode));
    const deceivedByAuthorId = choseRivalFake ? chosenAuthor!.id : null;
    const victimsCount = hasPick ? (victimCountsByAuthor.get(p.id) ?? 0) : 0;
    const outcome = computeOutcome({ answeredCorrectly, victimsCount, choseRivalFake });

    let suspectBonus = 0;
    let suspectId: PlayerId | null = null;
    if (hasPick && (gameMode === 'suspicious' || (gameMode === 'detective_fox' && detectiveId === p.id)) && suspectPicks[p.id]) {
      const accusedId = suspectPicks[p.id];
      if (accusedId && accusedId !== p.id) {
        suspectId = accusedId;
        const accusedVictims = victimCountsByAuthor.get(accusedId) ?? 0;
        if (accusedVictims > 0) suspectBonus = gameMode === 'detective_fox' ? 2 : 1;
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

    const missionBonus = hasPick
      ? missionBonusForRound({ mode: gameMode, player: p, chosen, victimsCount, round: currentRound })
      : 0;
    const basePoints = outcome.pointsEarned + suspectBonus + speedBonus + missionBonus;
    const goldenMultiplier = golden && answeredCorrectly ? 3 : 1;
    const pointsDelta = golden && answeredCorrectly
      ? basePoints + Math.max(0, outcome.pointsEarned * (goldenMultiplier - 1))
      : basePoints;

    const row: RoundResultRow = {
      playerId: p.id,
      outcome,
      labels: outcome.labels,
      pointsDelta,
      victimsCount,
      deceivedByAuthorId,
      pickedText: chosen?.text,
      ownFakeText: fakeAnswers[p.id],
      isBlocked: !!p.isBlockedCurrentRound,
      penaltyDelta: 0,
      suspectId,
      suspectBonus: suspectBonus || undefined,
      detectiveBonus: gameMode === 'detective_fox' ? suspectBonus || undefined : undefined,
      speedBonus: speedBonus || undefined,
      isFastAnswer: isFastAnswer || undefined,
      teamId: gameMode === 'team_battle' ? p.teamId ?? null : undefined,
      missionBonus: missionBonus || undefined,
      goldenMultiplier: golden && answeredCorrectly ? goldenMultiplier : undefined,
    };
    rows[p.id] = row;
    rowsList.push(row);

    const consecutiveCorrect = answeredCorrectly ? p.consecutiveCorrect + 1 : 0;
    const abilityUsedCounts = { ...p.abilityUsedCounts };
    for (const [abilityId, usedCount] of Object.entries(abilityUsesByPlayer.get(p.id) ?? {})) {
      abilityUsedCounts[abilityId as keyof typeof abilityUsedCounts] += usedCount;
    }
    const nextScore = Math.max(0, p.score + pointsDelta);
    const reachedMilestones = nextScore >= 15 ? 3 : nextScore >= 10 ? 2 : nextScore >= 5 ? 1 : 0;
    const milestonesAwarded = p.creditMilestonesAwarded ?? 0;
    const newMilestones = Math.max(0, reachedMilestones - milestonesAwarded);
    updatedPlayers[p.id] = {
      ...p,
      score: nextScore,
      credits: (p.credits ?? 0) + newMilestones * (golden && answeredCorrectly ? 2 : 1),
      creditMilestonesAwarded: Math.max(milestonesAwarded, reachedMilestones),
      abilityUsedCounts,
      consecutiveCorrect,
      isBlockedNextRound: false,
      blockedByPlayerId: p.isBlockedCurrentRound ? p.blockedByPlayerId ?? null : null,
    };
  }

  for (const [targetId, attackerIds] of blocksByTarget) {
    for (const attackerId of attackerIds) {
      if (updatedPlayers[attackerId]) updatedPlayers[attackerId].lastBlockedPlayerId = targetId;
    }
  }
  return { rows, rowsList, updatedPlayers };
}

export function resolveRound(input: {
  question: Question;
  players: Player[];
  answers: Record<string, AnswerSubmission>;
  abilityActions?: AbilityAction[];
}): { rows: Record<string, RoundResultRow>; rowsList: RoundResultRow[] } {
  const { question, players, answers, abilityActions = [] } = input;
  const picks: Record<PlayerId, number> = {};
  const fakeAnswers: Record<PlayerId, string> = {};
  for (const [pid, sub] of Object.entries(answers)) {
    if (sub.choiceIndex !== undefined) picks[pid] = sub.choiceIndex;
    else if (sub.selectedIndex !== undefined) picks[pid] = sub.selectedIndex;
    if (sub.fakeAnswer) fakeAnswers[pid] = sub.fakeAnswer;
  }
  const choices = blendChoices(question, fakeAnswers);
  const res = resolveZartoRound({ question, players, choices, picks, fakeAnswers, abilityActions });
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
      abilityUsedCounts: { ...p.abilityUsedCounts, [a.abilityId]: (p.abilityUsedCounts?.[a.abilityId] ?? 0) + 1 },
    };
  }
  return next;
}

export { POINTS };
