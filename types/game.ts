import type { AbilityId } from '../features/game/abilities';
import type { CategoryId } from '../features/game/categories';
import type { OutcomeLabel, RoundOutcome } from '../features/game/outcomes';

export type PlayerId = string;

export type GameMode = 'classic' | 'survival' | 'suspicious' | 'blitz';

export interface Player {
  id: PlayerId;
  name: string;
  avatarKey: string; // Persistent avatar selection key or public image URL
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  score: number;
  /** Current match lives. Only used by Survival mode. */
  livesRemaining?: number;
  /** Spendable wallet for this match; resets when the next match starts. */
  credits?: number;
  creditMilestonesAwarded?: number;
  avatarUrl?: string | null;
  gamesPlayed?: number;
  gamesWon?: number;
  correctAnswers?: number;
  successfulTraps?: number;
  timesTrapped?: number;
  abilityUsedCounts: Record<AbilityId, number>;
  consecutiveCorrect: number;
  shieldsAvailable: number;
  blocksAvailable: number;
  isBlockedCurrentRound: boolean;
  isBlockedNextRound: boolean;
  blockedByPlayerId?: PlayerId | null;
  lastBlockedPlayerId?: PlayerId | null;
}

export type RoomPhase =
  | 'lobby'
  | 'category_select'
  | 'ability_select'
  | 'fake_answer'
  | 'guess'
  | 'question'
  | 'submitting'
  | 'waiting'
  | 'reveal'
  | 'scoreboard'
  | 'game_over';

export interface RoomConfig {
  code: string;
  hostId: PlayerId;
  maxPlayers: number;
  minPlayers: number;
  totalRounds: number;
  roundSeconds: number;
  selectedCategoryIds: CategoryId[];
  /** Defaults to Classic for older clients and rooms. */
  gameMode?: GameMode;
}

export interface AbilityAction {
  playerId: PlayerId;
  abilityId: AbilityId;
  targetId?: PlayerId;
}

export interface FakeAnswerSubmission {
  playerId: PlayerId;
  fakeAnswer: string;
}

export interface PickSubmission {
  playerId: PlayerId;
  choiceIndex: number;
}

export interface SuspectSubmission {
  playerId: PlayerId;
  suspectPlayerId: PlayerId;
}

// Backward-compatible with previous submission shape
export interface AnswerSubmission {
  playerId: PlayerId;
  questionId: string;
  selectedIndex?: number;
  choiceIndex?: number;
  fakeAnswer?: string;
  zartalTargetId?: PlayerId;
}

export interface RoundChoice {
  choiceIndex: number;
  text: string;
  authorId?: PlayerId | null; // NULL if correct answer or system decoy
  isCorrect?: boolean;
  isOwnFake?: boolean; // Client flag
}

export interface RoundResultRow {
  playerId: PlayerId;
  outcome: RoundOutcome;
  labels: OutcomeLabel[];
  pointsDelta: number;
  victimsCount: number;
  deceivedByAuthorId?: PlayerId | null;
  pickedText?: string;
  ownFakeText?: string;
  isBlocked?: boolean;
  penaltyDelta?: number;
  /** In Herkes Şüpheli mode: the rival player suspected of bluffing. */
  suspectId?: PlayerId | null;
  /** In Herkes Şüpheli mode: bonus awarded for correctly identifying a bluffer (+1). */
  suspectBonus?: number;
  /** In Fırtına Turu mode: speed bonus for answering correctly within the early window (+1). */
  speedBonus?: number;
  isFastAnswer?: boolean;
}

export interface GameState {
  config: RoomConfig;
  players: Record<PlayerId, Player>;
  phase: RoomPhase;
  currentRound: number;
  currentQuestionId: string | null;
  fakeAnswers: Record<PlayerId, string>;
  choices: RoundChoice[];
  picks: Record<PlayerId, number>;
  answers: Record<PlayerId, AnswerSubmission>;
  abilityActions: AbilityAction[];
  roundResults: Record<PlayerId, RoundResultRow>;
  history: RoundResultRow[][];
  suspectPicks?: Record<PlayerId, PlayerId>;
  pickTimes?: Record<PlayerId, number>;
  phaseStartedAt?: number;
  phaseDeadlineAt?: number | null;
  pausedAt?: number | null;
  stateVersion?: number;
  progress?: RoundProgress;
}

export interface RoundProgress {
  submittedCount: number;
  totalCount: number;
  completed: boolean;
  submissionStatus: Record<PlayerId, boolean>;
}

export interface Nudge {
  fromId: PlayerId;
  toId: PlayerId;
  at: number;
  roundNumber?: number;
  phase?: RoomPhase;
}
