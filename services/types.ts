import type {
  RoomConfig,
  Player,
  GameState,
  AbilityAction,
  AnswerSubmission,
  Nudge,
  RoomPhase,
  RoundChoice,
  RoundProgress,
  GameMode,
} from '../types/game';
import type { CategoryId } from '../features/game/categories';
import type { Question } from '../features/game/questions';

export interface RoomSummary {
  code: string;
  playerCount: number;
  maxPlayers: number;
  phase: RoomPhase;
  categoryIds: CategoryId[];
  categoryStatus: 'selected' | 'not_selected' | 'selecting';
  createdAt: number;
}

export type RoomAccessPreflight = 'open' | 'password_required';

export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'error';
export type RelationshipStatus =
  | 'none'
  | 'outgoing_pending'
  | 'incoming_pending'
  | 'friends'
  | 'blocked';

export type LeaderboardScope = 'all' | 'weekly' | 'friends';

export interface SocialPlayer {
  id: string;
  name: string;
  avatarKey: string;
  avatarUrl?: string | null;
  relationshipStatus: RelationshipStatus;
}

export interface FriendRequest extends SocialPlayer {
  requestId: string;
  createdAt: number;
}

export interface EmailSignUpResult {
  player: Player | null;
  needsEmailConfirmation: boolean;
}

export interface ServiceEvent {
  type:
    | 'state'
    | 'player_joined'
    | 'player_left'
    | 'player_ready'
    | 'nudge'
    | 'phase_changed'
    | 'fake_submitted'
    | 'choices_ready'
    | 'pick_submitted'
    | 'answer_submitted'
    | 'ability_used'
    | 'round_resolved'
    | 'game_over'
    | 'connection'
    | 'auth_state'
    | 'error';
  payload?: unknown;
}

export type ServiceEventHandler = (event: ServiceEvent) => void;

export interface RoundRevealChoice { choiceIndex: number; text: string; authorId: string | null; isCorrect: boolean; pickedBy: string[]; }

export interface GameService {
  readonly kind: 'demo' | 'supabase';

  connect(): Promise<void>;
  disconnect(): void;
  subscribe(handler: ServiceEventHandler): () => void;

  getConnectionState(): ConnectionState;
  listTakenPresetCharacters(): Promise<string[]>;

  // Auth
  signInAnonymously(name: string, avatarKey: string): Promise<Player>;
  signUpWithEmail(email: string, password: string, name: string): Promise<EmailSignUpResult>;
  signInWithEmail(email: string, password: string): Promise<Player>;
  signInWithGoogle(): Promise<Player>;
  completeOAuthCallback(code: string): Promise<Player>;
  sendPasswordResetEmail(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  refreshSession(): Promise<void>;
  getCurrentPlayer(): Player | null;
  updatePlayerProfile(name: string, avatarKey: string): Promise<Player>;
  uploadAvatar(base64: string, mimeType: string): Promise<string>;
  signOut(): Promise<void>;

  // Rooms
  createRoom(config: {
    hostName: string;
    avatarKey: string;
    totalRounds: number;
    roundSeconds: number;
    categories: CategoryId[];
    gameMode?: GameMode;
    isPrivate?: boolean;
    password?: string;
  }): Promise<{ code: string; playerId: string }>;
  joinRoom(
    code: string,
    name: string,
    avatarKey: string,
    password?: string,
    inviteToken?: string
  ): Promise<{ playerId: string }>;
  checkRoomAccess(code: string): Promise<RoomAccessPreflight>;
  createRoomInvite(code: string): Promise<string>;
  leaveRoom(code: string): Promise<void>;
  kickPlayer(code: string, playerId: string): Promise<void>;
  setRoomPaused(code: string, paused: boolean): Promise<void>;
  getRoomState(code: string): Promise<GameState | null>;
  restoreRoom(code: string, subscribe?: boolean): Promise<GameState | null>;
  getCurrentQuestion(code: string): Promise<Question | null>;
  listOpenRooms(): Promise<RoomSummary[]>;

  // Lobby
  setReady(code: string, ready: boolean): Promise<void>;
  nudgePlayer(code: string, toId: string): Promise<Nudge>;
  startGame(code: string): Promise<void>;
  markCurrentQuestionSeen(code: string): Promise<void>;

  // ZARTO Bluff Game flow
  submitFakeAnswer(code: string, fakeAnswer: string): Promise<void>;
  getRoundChoices(code: string): Promise<RoundChoice[]>;
  getRoundReveal(code: string): Promise<RoundRevealChoice[]>;
  submitPick(code: string, choiceIndex: number): Promise<void>;
  submitSuspectPick(code: string, suspectPlayerId: string): Promise<void>;
  useAbility(code: string, action: AbilityAction): Promise<void>;
  confirmAbilitySelection(code: string): Promise<void>;
  advancePhase(code: string): Promise<void>;
  rematch(code: string): Promise<void>;
  advanceExpiredPhase(code: string): Promise<boolean>;
  getRoomProgress(code: string): Promise<RoundProgress>;

  // Backward-compatible submit
  submitAnswer(code: string, submission: AnswerSubmission): Promise<void>;

  // Profile / leaderboard
  getLeaderboard(scope?: LeaderboardScope): Promise<Player[]>;
  searchPlayers(query: string): Promise<SocialPlayer[]>;
  getProfile(playerId: string): Promise<Player | null>;
  getRelationshipStatus(playerId: string): Promise<RelationshipStatus>;
  sendFriendRequest(playerId: string): Promise<RelationshipStatus>;
  respondFriendRequest(requestId: string, accept: boolean): Promise<RelationshipStatus>;
  cancelFriendRequest(requestId: string): Promise<void>;
  removeFriend(playerId: string): Promise<void>;
  blockUser(playerId: string): Promise<void>;
  unblockUser(playerId: string): Promise<void>;
  listFriends(): Promise<SocialPlayer[]>;
  listFriendRequests(): Promise<FriendRequest[]>;
}

export class ServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ServiceError';
  }
}
