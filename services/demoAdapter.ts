import type { CategoryId } from '../features/game/categories';
import { pickQuestions, QUESTIONS } from '../features/game/questions';
import { canUseAbility } from '../features/game/abilities';
import { BLITZ_ROUND_SECONDS } from '../features/game/modes';
import {
  applyRoundBlockEffects,
  applySurvivalLives,
  blendChoices,
  validateFakeAnswer,
  clearRoundBlockState,
  resolveZartoRound,
} from '../features/game/engine';
import type {
  AbilityAction,
  AnswerSubmission,
  GameState,
  Nudge,
  Player,
  PlayerId,
  RoomConfig,
  RoomPhase,
  RoundChoice,
  RoundResultRow,
  GameMode,
} from '../types/game';
import { makeSamplePlayers, pickAvatarKey } from '../features/game/players';
import type {
  ConnectionState,
  GameService,
  RoomSummary,
  RoomAccessPreflight,
  FriendRequest,
  RelationshipStatus,
  SocialPlayer,
  ServiceEvent,
  ServiceEventHandler,
} from './types';
import { ServiceError } from './types';


function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

interface DemoRoom {
  config: RoomConfig;
  password?: string;
  players: Record<string, Player>;
  phase: RoomPhase;
  currentRound: number;
  currentQuestionId: string | null;
  fakeAnswers: Record<string, string>;
  choices: RoundChoice[];
  picks: Record<string, number>;
  answers: Record<string, AnswerSubmission>;
  abilityActions: AbilityAction[];
  roundResults: Record<string, RoundResultRow>;
  nudges: Nudge[];
  createdAt: number;
  questionQueue: string[];
  phaseStartedAt: number;
  phaseDeadlineAt: number | null;
  pausedAt: number | null;
  abilityReadyRound: Record<string, number>;
  kickedPlayerIds: Set<string>;
  survivalFinished: boolean;
  suspectPicks: Record<string, string>;
  pickTimes: Record<string, number>;
}

export class DemoGameService implements GameService {
  readonly kind = 'demo' as const;

  private connection: ConnectionState = 'offline';
  private handlers = new Set<ServiceEventHandler>();
  private rooms = new Map<string, DemoRoom>();
  private currentPlayer: Player | null = null;
  private playerSequence = 0;
  private leaderboard: Player[] = [];
  private relationships = new Map<string, RelationshipStatus>();
  private friendRequests = new Map<string, FriendRequest>();
  private seenQuestionIdsByPlayer = new Map<string, Set<string>>();

  async connect(): Promise<void> {
    this.connection = 'online';
    this.emit({ type: 'connection', payload: { state: 'online' } });
  }

  disconnect(): void {
    this.connection = 'offline';
  }

  subscribe(handler: ServiceEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  getConnectionState(): ConnectionState {
    return this.connection;
  }

  async listTakenPresetCharacters(): Promise<string[]> {
    // Demo mode has no shared account/database authority. Global uniqueness
    // is enforced by the Supabase adapter and its atomic claim RPC.
    return [];
  }

  private emit(event: ServiceEvent) {
    for (const h of this.handlers) h(event);
  }

  async signInAnonymously(name: string, avatarKey: string): Promise<Player> {
    // Demo mode represents guest switching locally for previews/tests. It does
    // not provide globally shared identities; Supabase owns production claims.
    const player: Player = {
      id: `me-${Date.now()}-${this.playerSequence++}`,
      name: name.trim() || 'Sen',
      avatarKey,
      isHost: false,
      isReady: false,
      isOnline: true,
      score: 0,
      credits: 0,
      creditMilestonesAwarded: 0,
      abilityUsedCounts: { block: 0, shield: 0, penalty: 0, counter: 0 },
      consecutiveCorrect: 0,
      shieldsAvailable: 0,
      blocksAvailable: 0,
      isBlockedCurrentRound: false,
      isBlockedNextRound: false,
      lastBlockedPlayerId: null,
    };
    this.currentPlayer = player;
    return player;
  }

  async signUpWithEmail(): Promise<never> {
    throw new ServiceError('AUTH_UNAVAILABLE', 'E-posta üyeliği için Supabase yapılandırılmalıdır.');
  }

  async signInWithEmail(): Promise<never> {
    throw new ServiceError('AUTH_UNAVAILABLE', 'E-posta girişi için Supabase yapılandırılmalıdır.');
  }

  async signInWithGoogle(): Promise<never> {
    throw new ServiceError('AUTH_UNAVAILABLE', 'Google girişi için Supabase yapılandırılmalıdır.');
  }

  async completeOAuthCallback(): Promise<never> {
    throw new ServiceError('AUTH_UNAVAILABLE', 'Google girişi için Supabase yapılandırılmalıdır.');
  }

  async sendPasswordResetEmail(): Promise<never> {
    throw new ServiceError('AUTH_UNAVAILABLE', 'Şifre yenileme için Supabase yapılandırılmalıdır.');
  }

  async updatePassword(): Promise<never> {
    throw new ServiceError('AUTH_UNAVAILABLE', 'Şifre yenileme için Supabase yapılandırılmalıdır.');
  }

  async refreshSession(): Promise<void> {}

  getCurrentPlayer(): Player | null {
    return this.currentPlayer;
  }

  async updatePlayerProfile(name: string, avatarKey: string): Promise<Player> {
    if (!this.currentPlayer) {
      throw new ServiceError('PROFILE_NOT_FOUND', 'Profil bilgisi bulunamadı.');
    }
    this.currentPlayer = { ...this.currentPlayer, name, avatarKey };
    for (const [code, room] of this.rooms) {
      const player = room.players[this.currentPlayer.id];
      if (player) {
        room.players[this.currentPlayer.id] = { ...player, name, avatarKey };
        this.emit({ type: 'state', payload: this.snapshot(code) });
      }
    }
    return this.currentPlayer;
  }

  async uploadAvatar(): Promise<string> {
    throw new ServiceError('AVATAR_UPLOAD_UNAVAILABLE', 'Fotoğraf yüklemek için canlı oyun modu gerekir.');
  }

  async signOut(): Promise<void> {
    this.currentPlayer = null;
  }

  async createRoom(config: {
    hostName: string;
    avatarKey: string;
    totalRounds: number;
    roundSeconds: number;
    categories: CategoryId[];
    isPrivate?: boolean;
    password?: string;
    gameMode?: GameMode;
  }): Promise<{ code: string; playerId: string }> {
    if (config.isPrivate && (
      !config.password ||
      config.password.length < 8 ||
      config.password.length > 72
    )) {
      throw new ServiceError('ROOM_PASSWORD_INVALID', 'Oda şifresi 8-72 karakter arasında olmalıdır.');
    }
    if (!this.currentPlayer) {
      await this.signInAnonymously(config.hostName, config.avatarKey);
    }
    const me = this.currentPlayer!;
    const code = generateCode();
    const hostId = me.id;
    const hostPlayer: Player = {
      ...me,
      isHost: true,
      isReady: true,
      livesRemaining: 3,
    };
    const samples = makeSamplePlayers(3, -1).map((p) => ({
      ...p,
      id: `${code}-${p.id}`,
      isHost: false,
      isReady: true,
      livesRemaining: 3,
    }));
    const players: Record<string, Player> = { [hostId]: hostPlayer };
    for (const s of samples) players[s.id] = s;

    const selectedGameMode = config.gameMode ?? 'classic';
    const effectiveRoundSeconds = selectedGameMode === 'blitz'
      ? BLITZ_ROUND_SECONDS
      : config.roundSeconds;

    const roomConfig: RoomConfig = {
      code,
      hostId,
      maxPlayers: 10,
      minPlayers: 2,
      totalRounds: config.totalRounds,
      roundSeconds: effectiveRoundSeconds,
      selectedCategoryIds: config.categories,
      gameMode: selectedGameMode,
    };

    const room: DemoRoom = {
      config: roomConfig,
      password: config.isPrivate ? config.password : undefined,
      players,
      phase: 'lobby',
      currentRound: 1,
      currentQuestionId: null,
      fakeAnswers: {},
      choices: [],
      picks: {},
      answers: {},
      abilityActions: [],
      roundResults: {},
      nudges: [],
      createdAt: Date.now(),
      questionQueue: [],
      phaseStartedAt: Date.now(),
      phaseDeadlineAt: null,
      pausedAt: null,
      abilityReadyRound: {},
      kickedPlayerIds: new Set(),
      survivalFinished: false,
      suspectPicks: {},
      pickTimes: {},
    };
    this.rooms.set(code, room);
    this.currentPlayer = hostPlayer;
    this.emit({ type: 'state', payload: this.snapshot(code) });
    return { code, playerId: hostId };
  }

  async joinRoom(code: string, name: string, avatarKey: string, password?: string, inviteToken?: string): Promise<{ playerId: string }> {
    const cleanCode = code.trim().toUpperCase();
    const room = this.rooms.get(cleanCode);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    if (this.currentPlayer && room.kickedPlayerIds.has(this.currentPlayer.id)) {
      throw new ServiceError('ROOM_PLAYER_KICKED', 'Oda sahibi seni bu lobiden çıkardı.');
    }
    if (inviteToken) {
      throw new ServiceError('INVITE_UNAVAILABLE', 'Bu davet canlı oyun odasına ait; demo modunda kullanılamaz.');
    }
    const existingPlayerId = this.currentPlayer?.id;
    const isExistingMember = !!existingPlayerId && !!room.players[existingPlayerId];
    if (room.password && !isExistingMember && room.password !== password) {
      throw new ServiceError('ROOM_ACCESS_DENIED', 'Oda şifresi hatalı.');
    }
    if (!isExistingMember && room.phase !== 'lobby') {
      throw new ServiceError('GAME_ALREADY_STARTED', 'Oyun çoktan başladı.');
    }
    if (!isExistingMember && Object.keys(room.players).length >= room.config.maxPlayers) {
      throw new ServiceError('ROOM_FULL', 'Oda dolu.');
    }
    const ids = Object.values(room.players).map((p) => p.avatarKey);
    const key = avatarKey || pickAvatarKey(ids);
    if (!this.currentPlayer) await this.signInAnonymously(name, key);
    const me = this.currentPlayer!;
    if (!room.players[me.id]) {
      room.players[me.id] = { ...me, isReady: false, livesRemaining: 3 };
    }
    this.emit({ type: 'player_joined', payload: { code, player: room.players[me.id] } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
    return { playerId: me.id };
  }

  async checkRoomAccess(code: string): Promise<RoomAccessPreflight> {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) {
      throw new ServiceError('ROOM_UNAVAILABLE', 'Oda bulunamadı veya yeni katılıma açık değil.');
    }
    if (room.phase !== 'lobby') {
      throw new ServiceError('GAME_ALREADY_STARTED', 'Oyun başladı; yeni oyuncu kabul edilmiyor.');
    }
    if (Object.keys(room.players).length >= room.config.maxPlayers) {
      throw new ServiceError('ROOM_FULL', 'Oda dolu.');
    }
    const existingMember = !!this.currentPlayer && !!room.players[this.currentPlayer.id];
    return room.password && !existingMember ? 'password_required' : 'open';
  }

  async createRoomInvite(code: string): Promise<string> {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    throw new ServiceError(
      'INVITE_UNAVAILABLE',
      room.password
        ? 'Demo modunda kilitli oda için güvenli davet bağlantısı kullanılamıyor.'
        : 'Demo modunda uygulama dışı davet bağlantısı oluşturulamıyor.'
    );
  }

  async leaveRoom(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) return;
    if (this.currentPlayer) {
      const leavingId = this.currentPlayer.id;
      const wasHost = room.config.hostId === leavingId;
      delete room.players[leavingId];
      if (Object.keys(room.players).length === 0) {
        this.rooms.delete(code);
        return;
      }

      if (wasHost) {
        const nextHost = Object.values(room.players)[0];
        room.config.hostId = nextHost.id;
        for (const player of Object.values(room.players)) {
          player.isHost = player.id === nextHost.id;
          if (player.isHost) player.isReady = true;
        }
      }
    }
    this.emit({ type: 'player_left', payload: { code } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  async kickPlayer(code: string, playerId: string): Promise<void> {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    if (!this.currentPlayer || room.config.hostId !== this.currentPlayer.id) {
      throw new ServiceError('HOST_ONLY', 'Yalnızca oda sahibi oyuncu çıkarabilir.');
    }
    if (room.phase !== 'lobby') {
      throw new ServiceError('WRONG_PHASE', 'Oyuncular yalnızca lobide çıkarılabilir.');
    }
    if (playerId === room.config.hostId) {
      throw new ServiceError('HOST_CANNOT_BE_KICKED', 'Oda sahibi kendini çıkaramaz.');
    }
    if (!room.players[playerId]) {
      throw new ServiceError('ROOM_PLAYER_NOT_FOUND', 'Bu oyuncu artık lobide değil.');
    }
    room.kickedPlayerIds.add(playerId);
    delete room.players[playerId];
    this.emit({ type: 'player_left', payload: { code, playerId, kicked: true } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  async setRoomPaused(code: string, paused: boolean): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    if (!this.currentPlayer || room.config.hostId !== this.currentPlayer.id) {
      throw new ServiceError('HOST_ONLY', 'Oyunu yalnızca oda sahibi duraklatabilir.');
    }
    if (!['ability_select', 'fake_answer', 'guess'].includes(room.phase)) {
      throw new ServiceError('WRONG_PHASE', 'Oyun bu aşamada duraklatılamaz.');
    }
    if (paused === (room.pausedAt !== null)) return;
    if (paused && room.phaseDeadlineAt !== null && room.phaseDeadlineAt <= Date.now()) {
      throw new ServiceError('PHASE_EXPIRED', 'Süre dolduğu için oyun duraklatılamaz.');
    }

    if (paused) {
      room.pausedAt = Date.now();
    } else {
      const pausedDuration = Date.now() - room.pausedAt!;
      room.phaseStartedAt += pausedDuration;
      if (room.phaseDeadlineAt !== null) room.phaseDeadlineAt += pausedDuration;
      room.pausedAt = null;
    }
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  getRoomState(code: string): Promise<GameState | null> {
    const room = this.rooms.get(code);
    if (!room || !this.currentPlayer || !room.players[this.currentPlayer.id]) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.snapshot(code));
  }

  restoreRoom(code: string): Promise<GameState | null> {
    return this.getRoomState(code.trim().toUpperCase());
  }

  listOpenRooms(): Promise<RoomSummary[]> {
    const list: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.password || room.phase !== 'lobby' || Object.keys(room.players).length >= room.config.maxPlayers) {
        continue;
      }
      list.push({
        code: room.config.code,
        playerCount: Object.keys(room.players).length,
        maxPlayers: room.config.maxPlayers,
        phase: room.phase,
        categoryIds: [...room.config.selectedCategoryIds],
        categoryStatus: room.config.selectedCategoryIds.length > 0 ? 'selected' : 'not_selected',
        createdAt: room.createdAt,
      });
    }
    return Promise.resolve(list);
  }

  async setReady(code: string, ready: boolean): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    const player = this.currentPlayer && room.players[this.currentPlayer.id];
    if (!player || room.phase !== 'lobby') {
      throw new ServiceError('ROOM_ACCESS_DENIED', 'Lobideki oda üyeleri hazır durumunu değiştirebilir.');
    }
    room.players[player.id] = { ...player, isReady: ready };
    this.emit({ type: 'player_ready', payload: { code } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  async nudgePlayer(code: string, toId: string): Promise<Nudge> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    const fromId = this.currentPlayer?.id;
    const target = room.players[toId];
    if (!fromId || !room.players[fromId] || !target || fromId === toId) {
      throw new ServiceError('NUDGE_TARGET_INVALID', 'Geçerli bir oda oyuncusu seçmelisin.');
    }
    if (!['lobby', 'fake_answer', 'guess'].includes(room.phase)) {
      throw new ServiceError('NUDGE_PHASE_INVALID', 'Bu aşamada dürtme gönderilemez.');
    }
    const alreadyDone = room.phase === 'lobby'
      ? target.isReady
      : room.phase === 'fake_answer'
        ? target.isBlockedCurrentRound || room.fakeAnswers[toId] !== undefined
        : room.picks[toId] !== undefined;
    if (alreadyDone) {
      throw new ServiceError('NUDGE_PLAYER_DONE', 'Bu oyuncu aşamayı zaten tamamladı.');
    }
    if (room.nudges.some((nudge) =>
      nudge.fromId === fromId &&
      nudge.toId === toId &&
      nudge.roundNumber === room.currentRound &&
      nudge.phase === room.phase
    )) {
      throw new ServiceError('NUDGE_ALREADY_SENT', 'Bu oyuncuyu bu aşamada zaten dürttün.');
    }
    const nudge: Nudge = {
      fromId,
      toId,
      at: Date.now(),
      roundNumber: room.currentRound,
      phase: room.phase,
    };
    room.nudges.push(nudge);
    this.emit({ type: 'nudge', payload: { code, nudge } });
    return nudge;
  }

  async startGame(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    if (!this.currentPlayer || room.config.hostId !== this.currentPlayer.id) {
      throw new ServiceError('HOST_ONLY', 'Yalnızca oda kurucusu oyunu başlatabilir.');
    }
    if (room.phase !== 'lobby') {
      throw new ServiceError('WRONG_PHASE', 'Oyun zaten başladı.');
    }
    const readyCount = Object.values(room.players).filter((p) => p.isReady).length;
    if (readyCount < 2) throw new ServiceError('NOT_ENOUGH_READY', 'En az 2 oyuncu hazır olmalı.');

    room.players = Object.fromEntries(Object.entries(room.players).map(([id, player]) => [
      id,
      { ...player, score: 0, credits: 0, creditMilestonesAwarded: 0, livesRemaining: 3 },
    ]));
    room.survivalFinished = false;
    if (this.currentPlayer && room.players[this.currentPlayer.id]) this.currentPlayer = room.players[this.currentPlayer.id];
    this.prepareRoundQuestions(room);
    this.setPhase(room, 'ability_select', room.config.roundSeconds);
    room.currentRound = 1;
    room.currentQuestionId = room.questionQueue[0] ?? QUESTIONS[0].id;
    this.emit({ type: 'phase_changed', payload: { code, phase: room.phase } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  async markCurrentQuestionSeen(code: string): Promise<void> {
    const room = this.rooms.get(code);
    const playerId = this.currentPlayer?.id;
    if (!room || !playerId || !room.players[playerId] || !room.currentQuestionId
      || !['ability_select', 'fake_answer', 'guess'].includes(room.phase)) {
      throw new ServiceError('QUESTION_SEEN_FAILED', 'Görüntülenen aktif soru bulunamadı.');
    }
    const question = QUESTIONS.find((item) => item.id === room.currentQuestionId);
    if (!question) throw new ServiceError('QUESTION_NOT_FOUND', 'Aktif soru bulunamadı.');
    const key = `${playerId}:${question.categoryId}`;
    const seen = this.seenQuestionIdsByPlayer.get(key) ?? new Set<string>();
    seen.add(question.id);
    this.seenQuestionIdsByPlayer.set(key, seen);
  }

  async getCurrentQuestion(code: string) {
    const room = this.rooms.get(code);
    if (
      !room?.currentQuestionId ||
      !this.currentPlayer ||
      !room.players[this.currentPlayer.id]
    ) return null;
    return QUESTIONS.find((question) => question.id === room.currentQuestionId) ?? null;
  }

  private prepareRoundQuestions(room: DemoRoom) {
    const playerId = this.currentPlayer?.id;
    const seenQuestionIds = playerId
      ? room.config.selectedCategoryIds.flatMap((categoryId) =>
          [...(this.seenQuestionIdsByPlayer.get(`${playerId}:${categoryId}`) ?? [])]
        )
      : [];
    const qs = pickQuestions(
      room.config.selectedCategoryIds,
      room.config.totalRounds,
      room.currentRound,
      seenQuestionIds
    );
    room.questionQueue = qs.map((q) => q.id);
  }

  async useAbility(code: string, action: AbilityAction): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    this.assertRoomActive(room);
    const player = this.currentPlayer;
    if (!player || !room.players[player.id] || action.playerId !== player.id || room.phase !== 'ability_select'
      || (room.config.gameMode === 'survival' && (player.livesRemaining ?? 3) <= 0)) {
      throw new ServiceError('ABILITY_UNAVAILABLE', 'Yetenek bu aşamada kullanılamaz.');
    }
    if (room.phaseDeadlineAt !== null && room.phaseDeadlineAt <= Date.now()) {
      await this.advanceExpiredPhase(code);
      throw new ServiceError('PHASE_EXPIRED', 'Yetenek seçimi süresi doldu.');
    }
    const existingAction = room.abilityActions.find((used) => used.playerId === action.playerId);
    if (existingAction) {
      if (existingAction.abilityId === action.abilityId && (existingAction.targetId ?? null) === (action.targetId ?? null)) {
        return; // Idempotent retry: do not charge the player twice.
      }
      throw new ServiceError('ABILITY_ALREADY_USED', 'Bu tur yalnızca bir yetenek satın alıp kullanabilirsin.');
    }
    const allowance = canUseAbility(
      {
        playerId: player.id,
        usedCounts: player.abilityUsedCounts,
        credits: player.credits ?? 0,
        shieldsAvailable: player.shieldsAvailable,
        blocksAvailable: player.blocksAvailable,
        isBlockedCurrentRound: player.isBlockedCurrentRound,
        isBlockedNextRound: player.isBlockedNextRound,
        lastBlockedPlayerId: player.lastBlockedPlayerId,
      },
      action.abilityId,
      action.targetId
    );
    if (!allowance.allowed) throw new ServiceError('ABILITY_UNAVAILABLE', allowance.reason ?? 'Yetenek kullanılamıyor.');
    if (action.abilityId === 'block' || action.abilityId === 'penalty') {
      if (!action.targetId || !room.players[action.targetId] || action.targetId === player.id
        || (room.config.gameMode === 'survival' && (room.players[action.targetId].livesRemaining ?? 3) <= 0)) {
        throw new ServiceError('ABILITY_TARGET_INVALID', 'Geçerli ve hayatta olan bir rakip seçmelisin.');
      }
    } else if (action.targetId) {
      throw new ServiceError('ABILITY_TARGET_INVALID', 'Bu yetenek hedef kabul etmiyor.');
    }
    const creditCost = action.abilityId === 'block' || action.abilityId === 'shield' ? 1 : 0;
    if ((room.players[player.id].credits ?? 0) < creditCost) {
      throw new ServiceError('INSUFFICIENT_CREDITS', `Bu yetenek için ${creditCost} kredi gerekiyor.`);
    }
    room.players[player.id] = { ...room.players[player.id], credits: (room.players[player.id].credits ?? 0) - creditCost };
    this.currentPlayer = { ...player, credits: room.players[player.id].credits };
    room.abilityActions.push(action);
    this.emit({ type: 'ability_used', payload: { code, action } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  async confirmAbilitySelection(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    this.assertRoomActive(room);
    const playerId = this.currentPlayer?.id;
    if (!playerId || !room.players[playerId] || room.phase !== 'ability_select') {
      throw new ServiceError('ABILITY_PHASE_INVALID', 'Yetenek seçimi aşaması aktif değil.');
    }
    if (room.phaseDeadlineAt !== null && room.phaseDeadlineAt <= Date.now()) {
      await this.advanceExpiredPhase(code);
      return;
    }
    room.abilityReadyRound[playerId] = room.currentRound;
    for (const player of Object.values(room.players)) {
      if (player.id !== playerId) room.abilityReadyRound[player.id] = room.currentRound;
    }
    if (Object.values(room.players).every((player) =>
      room.abilityReadyRound[player.id] === room.currentRound
    )) {
      this.beginFakeAnswerPhase(room);
    }
    this.emit({ type: 'phase_changed', payload: { code, phase: room.phase } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  // Step 1 of round: Submit fake answer
  async submitFakeAnswer(code: string, fakeAnswer: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    this.assertRoomActive(room);
    const player = this.currentPlayer && room.players[this.currentPlayer.id];
    if (!player || player.isBlockedCurrentRound
      || (room.config.gameMode === 'survival' && (player.livesRemaining ?? 3) <= 0)) {
      throw new ServiceError('ROOM_ACCESS_DENIED', 'Bu tur cevap gönderemezsiniz.');
    }
    if (room.phase !== 'fake_answer') throw new ServiceError('WRONG_PHASE', 'Sahte cevap aşaması aktif değil.');
    if (room.phaseDeadlineAt !== null && room.phaseDeadlineAt <= Date.now()) {
      await this.advanceExpiredPhase(code);
      throw new ServiceError('PHASE_EXPIRED', 'Cevap süresi doldu.');
    }
    const meId = player.id;
    const clean = fakeAnswer.trim();
    if (!clean || clean.length > 120) {
      throw new ServiceError('INVALID_FAKE_ANSWER', 'Cevap 1-120 karakter arasında olmalıdır.');
    }
    const question = QUESTIONS.find((q) => q.id === room.currentQuestionId) || QUESTIONS[0];
    const validation = validateFakeAnswer(
      question,
      clean,
      Object.entries(room.fakeAnswers)
        .filter(([playerId]) => playerId !== meId)
        .map(([, answer]) => answer)
    );
    if (validation === 'correct_answer') {
      throw new ServiceError(
        'FAKE_ANSWER_IS_CORRECT',
        'Cevabınız doğru cevap veya arkadaşınızın yazdığı bir cevap ile uyuşuyor, lütfen farklı bir cevap yazınız.'
      );
    }
    if (validation === 'duplicate_answer') {
      throw new ServiceError(
        'FAKE_ANSWER_DUPLICATE',
        'Cevabınız doğru cevap veya arkadaşınızın yazdığı bir cevap ile uyuşuyor, lütfen farklı bir cevap yazınız.'
      );
    }
    if (room.fakeAnswers[meId] !== undefined) {
      if (room.fakeAnswers[meId] !== clean) {
        throw new ServiceError('ANSWER_ALREADY_SUBMITTED', 'Bu tur cevabın zaten gönderildi.');
      }
      return;
    }
    room.fakeAnswers[meId] = clean;

    // Auto-populate clever bot fake answers
    const botAnswers = [
      'Bence bu cevap farklı olmalı',
      'Kaynağa göre başka bir yanıt',
      'Yaklaşık bir tahmin',
    ];

    let decoyIdx = 0;
    for (const p of Object.values(room.players)) {
      if (p.id !== meId && !p.isBlockedCurrentRound && room.fakeAnswers[p.id] === undefined
        && (room.config.gameMode !== 'survival' || (p.livesRemaining ?? 3) > 0)) {
        room.fakeAnswers[p.id] = `${botAnswers[decoyIdx % botAnswers.length]} (${decoyIdx + 1})`;
        decoyIdx++;
      }
    }

    // Blend all fake answers + true answer
    room.choices = blendChoices(question, room.fakeAnswers, room.currentRound * 17);
    this.setPhase(room, 'guess', room.config.roundSeconds);

    this.emit({ type: 'fake_submitted', payload: { code } });
    this.emit({ type: 'phase_changed', payload: { code, phase: 'guess' } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  async getRoundChoices(code: string): Promise<RoundChoice[]> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    const meId = this.currentPlayer?.id;
    if (!meId || !room.players[meId]) {
      throw new ServiceError('ROOM_ACCESS_DENIED', 'Oda erişim izniniz yok.');
    }
    return room.choices.map((c) => ({
      choiceIndex: c.choiceIndex,
      text: c.text,
      isOwnFake: c.authorId === meId,
    }));
  }

  // Step 2 of round: Submit choice / guess
  async getRoundReveal(code: string) {
    const state = this.rooms.get(code.toUpperCase());
    if (!state) return [];
    return (state.choices ?? []).map((c) => ({
      choiceIndex:c.choiceIndex,text:c.text,authorId:c.authorId ?? null,isCorrect:!!c.isCorrect,
      pickedBy:Object.entries(state.picks ?? {}).filter(([,i])=>i===c.choiceIndex).map(([id])=>id),
    }));
  }

  async submitPick(code: string, choiceIndex: number): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    this.assertRoomActive(room);
    const player = this.currentPlayer && room.players[this.currentPlayer.id];
    if (!player) {
      throw new ServiceError('ROOM_ACCESS_DENIED', 'Oda erişim izniniz yok.');
    }
    if (room.config.gameMode === 'survival' && (player.livesRemaining ?? 3) <= 0) {
      throw new ServiceError('PLAYER_ELIMINATED', 'Canların bitti; bu maçta yalnızca izleyebilirsin.');
    }
    if (room.phase !== 'guess') throw new ServiceError('WRONG_PHASE', 'Tahmin aşaması aktif değil.');
    if (room.phaseDeadlineAt !== null && room.phaseDeadlineAt <= Date.now()) {
      await this.advanceExpiredPhase(code);
      throw new ServiceError('PHASE_EXPIRED', 'Tahmin süresi doldu.');
    }
    const meId = player.id;
    const choice = room.choices.find((item) => item.choiceIndex === choiceIndex);
    if (!choice || choice.authorId === meId) {
      throw new ServiceError('INVALID_PICK', 'Bu seçenek geçerli değil.');
    }
    if (room.picks[meId] !== undefined) {
      if (room.picks[meId] !== choiceIndex) {
        throw new ServiceError('PICK_ALREADY_SUBMITTED', 'Bu tur tahminin zaten gönderildi.');
      }
      return;
    }
    room.picks[meId] = choiceIndex;
    room.pickTimes[meId] = Date.now();

    for (const bot of Object.values(room.players)) {
      if (bot.id === meId || room.picks[bot.id] !== undefined
        || (room.config.gameMode === 'survival' && (bot.livesRemaining ?? 3) <= 0)) continue;
      const validChoices = room.choices.filter((item) => item.authorId !== bot.id);
      const botPick = validChoices[Math.floor(Math.random() * validChoices.length)];
      if (botPick) {
        room.picks[bot.id] = botPick.choiceIndex;
        room.pickTimes[bot.id] = Date.now();
      }
      if (room.config.gameMode === 'suspicious' && !room.suspectPicks[bot.id]) {
        const potentialSuspects = Object.values(room.players).filter((p) => p.id !== bot.id);
        const randomSuspect = potentialSuspects[Math.floor(Math.random() * potentialSuspects.length)];
        if (randomSuspect) room.suspectPicks[bot.id] = randomSuspect.id;
      }
    }

    // Resolve round authoritatively
    this.resolveRoundAuthoritatively(code);
  }

  async submitSuspectPick(code: string, suspectPlayerId: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    this.assertRoomActive(room);
    const player = this.currentPlayer && room.players[this.currentPlayer.id];
    if (!player) {
      throw new ServiceError('ROOM_ACCESS_DENIED', 'Oda erişim izniniz yok.');
    }
    if (room.phase !== 'guess') {
      throw new ServiceError('WRONG_PHASE', 'Şüpheli tahmini yalnızca tahmin aşamasında yapılabilir.');
    }
    if (room.phaseDeadlineAt !== null && room.phaseDeadlineAt <= Date.now()) {
      await this.advanceExpiredPhase(code);
      throw new ServiceError('PHASE_EXPIRED', 'Tahmin süresi doldu.');
    }
    if (player.id === suspectPlayerId) {
      throw new ServiceError('INVALID_SUSPECT', 'Kendini şüpheli olarak seçemezsin.');
    }
    if (!room.players[suspectPlayerId]) {
      throw new ServiceError('INVALID_SUSPECT', 'Geçersiz şüpheli oyuncu.');
    }
    if (room.suspectPicks[player.id]) {
      throw new ServiceError('ALREADY_SUBMITTED', 'Bu tur zaten şüpheli tahmininde bulundun.');
    }
    room.suspectPicks[player.id] = suspectPlayerId;
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  // Backward-compatible submitAnswer
  async submitAnswer(code: string, submission: AnswerSubmission): Promise<void> {
    if (submission.fakeAnswer) {
      await this.submitFakeAnswer(code, submission.fakeAnswer);
    } else if (submission.choiceIndex !== undefined) {
      await this.submitPick(code, submission.choiceIndex);
    } else if (submission.selectedIndex !== undefined) {
      await this.submitPick(code, submission.selectedIndex);
    }
  }

  private resolveRoundAuthoritatively(code: string) {
    const room = this.rooms.get(code);
    if (!room || !room.currentQuestionId) return;
    const question = QUESTIONS.find((q) => q.id === room.currentQuestionId) || QUESTIONS[0];

    const playersList = Object.values(room.players);
    const { rows, updatedPlayers } = resolveZartoRound({
      question,
      players: playersList,
      choices: room.choices,
      picks: room.picks,
      fakeAnswers: room.fakeAnswers,
      abilityActions: room.abilityActions,
      gameMode: room.config.gameMode,
      suspectPicks: room.suspectPicks,
      pickTimes: room.pickTimes,
      phaseStartedAt: room.phaseStartedAt,
    });

    room.roundResults = rows;
    room.players = room.config.gameMode === 'survival'
      ? applySurvivalLives(Object.values(updatedPlayers), rows)
      : updatedPlayers;
    if (room.config.gameMode === 'survival') {
      room.survivalFinished = Object.values(room.players)
        .filter((player) => (player.livesRemaining ?? 3) > 0).length <= 1;
    }
    if (this.currentPlayer && room.players[this.currentPlayer.id]) this.currentPlayer = room.players[this.currentPlayer.id];
    this.setPhase(room, 'reveal');

    this.emit({ type: 'round_resolved', payload: { code, rows } });
    this.emit({ type: 'phase_changed', payload: { code, phase: 'reveal' } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  private beginFakeAnswerPhase(room: DemoRoom) {
    if (room.phase !== 'ability_select') return;
    room.players = applyRoundBlockEffects(
      Object.values(room.players),
      room.abilityActions
    );
    this.setPhase(room, 'fake_answer', room.config.roundSeconds);
  }

  advancePhase(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    this.assertRoomActive(room);
    if (!this.currentPlayer || room.config.hostId !== this.currentPlayer.id) {
      throw new ServiceError('HOST_ONLY', 'Yalnızca oda kurucusu aşamayı ilerletebilir.');
    }

    if (room.phase === 'ability_select') {
      this.beginFakeAnswerPhase(room);
    } else if (room.phase === 'fake_answer') {
      this.setPhase(room, 'guess', room.config.roundSeconds);
    } else if (room.phase === 'reveal') {
      this.setPhase(room, 'scoreboard');
    } else if (room.phase === 'scoreboard') {
      if (room.currentRound >= room.config.totalRounds
        || (room.config.gameMode === 'survival' && room.survivalFinished)) {
        this.setPhase(room, 'game_over');
        this.emit({ type: 'game_over', payload: { code } });
      } else {
        room.players = clearRoundBlockState(Object.values(room.players));
        room.currentRound += 1;
        this.setPhase(room, 'ability_select', room.config.roundSeconds);
        room.fakeAnswers = {};
        room.choices = [];
        room.picks = {};
        room.answers = {};
        room.abilityActions = [];
        room.suspectPicks = {};
        room.pickTimes = {};
        room.currentQuestionId = room.questionQueue[room.currentRound - 1] ?? QUESTIONS[0].id;
      }
    }

    this.emit({ type: 'phase_changed', payload: { code, phase: room.phase } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
    return Promise.resolve();
  }

  async rematch(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    if (!this.currentPlayer || room.config.hostId !== this.currentPlayer.id) {
      throw new ServiceError('HOST_ONLY', 'Yalnızca oda kurucusu yeni oyun başlatabilir.');
    }
    if (room.phase !== 'game_over') {
      throw new ServiceError('WRONG_PHASE', 'Oyun henüz tamamlanmadı.');
    }
    this.setPhase(room, 'lobby');
    room.survivalFinished = false;
    room.currentRound = 1;
    room.fakeAnswers = {};
    room.choices = [];
    room.picks = {};
    room.answers = {};
    room.abilityActions = [];
    room.roundResults = {};
    for (const id of Object.keys(room.players)) {
      room.players[id] = {
        ...room.players[id],
        score: 0,
        credits: 0,
        creditMilestonesAwarded: 0,
        livesRemaining: 3,
        isReady: room.players[id].isHost,
        abilityUsedCounts: { block: 0, shield: 0, penalty: 0, counter: 0 },
        consecutiveCorrect: 0,
        shieldsAvailable: 0,
        blocksAvailable: 0,
        isBlockedCurrentRound: false,
        isBlockedNextRound: false,
        lastBlockedPlayerId: null,
      };
    }
    this.prepareRoundQuestions(room);
    this.emit({ type: 'phase_changed', payload: { code, phase: 'lobby' } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
  }

  async getLeaderboard(scope: 'all' | 'weekly' | 'friends' = 'all'): Promise<Player[]> {
    if (this.leaderboard.length === 0) {
      this.leaderboard = makeSamplePlayers(10, 0).map((p, i) => ({
        ...p,
        score: 980 - i * 75,
        name: p.name,
      }));
    }
    if (scope === 'weekly') return [];
    const leaderboard = [...this.leaderboard].sort((a, b) => b.score - a.score);
    if (scope !== 'friends' || !this.currentPlayer) return leaderboard;
    const friends = await this.listFriends();
    const friendIds = new Set(friends.map((friend) => friend.id));
    return leaderboard.filter((player) => friendIds.has(player.id));
  }

  async searchPlayers(query: string): Promise<SocialPlayer[]> {
    const cleanQuery = query.trim().toLocaleLowerCase();
    if (cleanQuery.length < 2 || cleanQuery.length > 32) {
      throw new ServiceError('PLAYER_SEARCH_INVALID', 'Oyuncu araması 2-32 karakter arasında olmalıdır.');
    }
    const players = await this.getLeaderboard();
    const matches: SocialPlayer[] = [];
    for (const player of players) {
      if (
        player.id === this.currentPlayer?.id ||
        !player.name.toLocaleLowerCase().includes(cleanQuery)
      ) continue;
      const relationshipStatus = await this.getRelationshipStatus(player.id);
      if (relationshipStatus === 'blocked') continue;
      matches.push({
        id: player.id,
        name: player.name,
        avatarKey: player.avatarKey,
        avatarUrl: player.avatarUrl,
        relationshipStatus,
      });
      if (matches.length === 20) break;
    }
    return matches;
  }

  async getProfile(playerId: string): Promise<Player | null> {
    if (this.currentPlayer?.id === playerId) return this.currentPlayer;
    const lb = await this.getLeaderboard();
    return lb.find((p) => p.id === playerId) ?? null;
  }

  async advanceExpiredPhase(code: string): Promise<boolean> {
    const room = this.rooms.get(code);
    if (!room) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    if (!this.currentPlayer || !room.players[this.currentPlayer.id]) {
      throw new ServiceError('ROOM_ACCESS_DENIED', 'Oda erişim izniniz yok.');
    }
    if (room.pausedAt !== null) return false;
    if (room.phaseDeadlineAt === null || room.phaseDeadlineAt > Date.now()) return false;
    if (room.phase === 'ability_select') {
      this.beginFakeAnswerPhase(room);
    } else if (room.phase === 'fake_answer') {
      for (const player of Object.values(room.players)) {
        if (!player.isBlockedCurrentRound && room.fakeAnswers[player.id] === undefined) {
          room.fakeAnswers[player.id] = '';
        }
      }
      const question = QUESTIONS.find((item) => item.id === room.currentQuestionId) ?? QUESTIONS[0];
      room.choices = blendChoices(question, room.fakeAnswers, room.currentRound * 17);
      this.setPhase(room, 'guess', room.config.roundSeconds);
    } else if (room.phase === 'guess') {
      this.resolveRoundAuthoritatively(code);
    } else {
      return false;
    }
    this.emit({ type: 'phase_changed', payload: { code, phase: room.phase } });
    this.emit({ type: 'state', payload: this.snapshot(code) });
    return true;
  }

  async getRoomProgress(code: string) {
    const state = this.snapshot(code);
    if (!state) throw new ServiceError('ROOM_NOT_FOUND', 'Oda bulunamadı.');
    return state.progress!;
  }

  private relationshipKey(playerId: string): string {
    return `${this.currentPlayer?.id ?? ''}:${playerId}`;
  }

  async getRelationshipStatus(playerId: string): Promise<RelationshipStatus> {
    return this.relationships.get(this.relationshipKey(playerId)) ?? 'none';
  }

  async sendFriendRequest(playerId: string): Promise<RelationshipStatus> {
    if (!this.currentPlayer || playerId === this.currentPlayer.id) {
      throw new ServiceError('INVALID_FRIEND_REQUEST', 'Kendine arkadaşlık isteği gönderemezsin.');
    }
    const key = this.relationshipKey(playerId);
    const status = this.relationships.get(key) ?? 'none';
    if (status === 'blocked') throw new ServiceError('USER_BLOCKED', 'Engellenen kullanıcıya istek gönderilemez.');
    if (status === 'friends' || status === 'outgoing_pending') return status;
    if (status === 'incoming_pending') {
      this.relationships.set(key, 'friends');
      this.relationships.set(`${playerId}:${this.currentPlayer.id}`, 'friends');
      return 'friends';
    }
    const profile = await this.getProfile(playerId);
    if (!profile) throw new ServiceError('PROFILE_NOT_FOUND', 'Oyuncu bulunamadı.');
    const request: FriendRequest = {
      requestId: `request-${Date.now()}`,
      id: playerId,
      name: profile.name,
      avatarKey: profile.avatarKey,
      relationshipStatus: 'incoming_pending',
      createdAt: Date.now(),
    };
    this.friendRequests.set(request.requestId, request);
    this.relationships.set(key, 'outgoing_pending');
    this.relationships.set(`${playerId}:${this.currentPlayer.id}`, 'incoming_pending');
    return 'outgoing_pending';
  }

  async respondFriendRequest(requestId: string, accept: boolean): Promise<RelationshipStatus> {
    const request = this.friendRequests.get(requestId);
    if (!request) throw new ServiceError('REQUEST_NOT_FOUND', 'Arkadaşlık isteği bulunamadı.');
    const key = this.relationshipKey(request.id);
    this.friendRequests.delete(requestId);
    const status: RelationshipStatus = accept ? 'friends' : 'none';
    this.relationships.set(key, status);
    if (this.currentPlayer) {
      this.relationships.set(`${request.id}:${this.currentPlayer.id}`, status);
    }
    return status;
  }

  async cancelFriendRequest(requestId: string): Promise<void> {
    const request = this.friendRequests.get(requestId);
    if (!request) throw new ServiceError('REQUEST_NOT_FOUND', 'Arkadaşlık isteği bulunamadı.');
    this.friendRequests.delete(requestId);
    this.relationships.set(this.relationshipKey(request.id), 'none');
  }

  async removeFriend(playerId: string): Promise<void> {
    this.relationships.set(this.relationshipKey(playerId), 'none');
    if (this.currentPlayer) this.relationships.set(`${playerId}:${this.currentPlayer.id}`, 'none');
  }

  async blockUser(playerId: string): Promise<void> {
    this.relationships.set(this.relationshipKey(playerId), 'blocked');
    if (this.currentPlayer) this.relationships.set(`${playerId}:${this.currentPlayer.id}`, 'blocked');
  }

  async unblockUser(playerId: string): Promise<void> {
    this.relationships.set(this.relationshipKey(playerId), 'none');
    if (this.currentPlayer) this.relationships.set(`${playerId}:${this.currentPlayer.id}`, 'none');
  }

  async listFriends(): Promise<SocialPlayer[]> {
    const friends: SocialPlayer[] = [];
    for (const player of await this.getLeaderboard()) {
      if (await this.getRelationshipStatus(player.id) === 'friends') {
        friends.push({
          id: player.id,
          name: player.name,
          avatarKey: player.avatarKey,
          relationshipStatus: 'friends',
        });
      }
    }
    return friends;
  }

  async listFriendRequests(): Promise<FriendRequest[]> {
    return [...this.friendRequests.values()];
  }

  private snapshot(code: string): GameState | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const participants = Object.values(room.players).filter((player) => player.isOnline);
    const eligibleParticipants = participants.filter((player) =>
      room.config.gameMode !== 'survival' || (player.livesRemaining ?? 3) > 0
    );
    const submissionStatus: Record<string, boolean> = {};
    for (const player of participants) {
      const isEliminated = room.config.gameMode === 'survival' && (player.livesRemaining ?? 3) <= 0;
      const done = isEliminated || (room.phase === 'lobby'
        ? player.isReady
        : room.phase === 'fake_answer'
          ? player.isBlockedCurrentRound || room.fakeAnswers[player.id] !== undefined
          : room.phase === 'guess'
            ? room.picks[player.id] !== undefined
            : room.roundResults[player.id] !== undefined);
      submissionStatus[player.id] = done;
    }
    const submittedCount = eligibleParticipants.filter((player) => submissionStatus[player.id]).length;
    return {
      config: room.config,
      players: room.players,
      phase: room.phase,
      currentRound: room.currentRound,
      currentQuestionId: room.currentQuestionId,
      fakeAnswers: room.fakeAnswers,
      choices: room.choices,
      picks: room.picks,
      answers: room.answers,
      abilityActions: room.abilityActions,
      roundResults: room.roundResults,
      history: [],
      suspectPicks: { ...room.suspectPicks },
      pickTimes: { ...room.pickTimes },
      phaseStartedAt: room.phaseStartedAt,
      phaseDeadlineAt: room.phaseDeadlineAt,
      pausedAt: room.pausedAt,
      progress: {
        submittedCount,
        totalCount: eligibleParticipants.length,
        completed: eligibleParticipants.length > 0 && submittedCount >= eligibleParticipants.length,
        submissionStatus,
      },
    };
  }

  private setPhase(room: DemoRoom, phase: RoomPhase, deadlineSeconds?: number) {
    room.phase = phase;
    room.phaseStartedAt = Date.now();
    room.phaseDeadlineAt = deadlineSeconds === undefined
      ? null
      : room.phaseStartedAt + deadlineSeconds * 1000;
  }

  private assertRoomActive(room: DemoRoom) {
    if (room.pausedAt !== null) {
      throw new ServiceError('ROOM_PAUSED', 'Oyun duraklatıldı; devam etmesini bekle.');
    }
  }
}
