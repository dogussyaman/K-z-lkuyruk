import type { AbilityId } from '../features/game/abilities';
import type { CategoryId } from '../features/game/categories';
import type { OutcomeLabel, RoundOutcome } from '../features/game/outcomes';

export type PlayerId = string;
export type TeamId = 'A' | 'B';

export type GameMode =
  | 'classic'
  | 'survival'
  | 'suspicious'
  | 'blitz'
  | 'team_battle'
  | 'secret_missions'
  | 'double_trap'
  | 'golden_question'
  | 'detective_fox';

export interface Player {
  id: PlayerId;
  name: string;
  avatarKey: string;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  score: number;
  teamId?: TeamId | null;
  livesRemaining?: number;
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
  authorId?: PlayerId | null;
  isCorrect?: boolean;
  isOwnFake?: boolean;
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
  suspectId?: PlayerId | null;
  suspectBonus?: number;
  speedBonus?: number;
  isFastAnswer?: boolean;
  teamId?: TeamId | null;
  missionBonus?: number;
  goldenMultiplier?: number;
  detectiveBonus?: number;
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
  teamScores?: Partial<Record<TeamId, number>>;
  pickTimes?: Record<PlayerId, number>;
  phaseStartedAt?: number;
  phaseDeadlineAt?: number | null;
  pausedAt?: number | null;
  stateVersion?: number;
  progress?: RoundProgress;
  modeMeta?: {
    isGoldenRound?: boolean;
    detectivePlayerId?: PlayerId | null;
    secretMissionHint?: string | null;
  };
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
