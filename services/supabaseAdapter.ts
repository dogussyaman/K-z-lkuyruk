import { supabase, supabaseConfigured, ensureSupabase } from '../lib/supabase/client';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type {
  ConnectionState,
  EmailSignUpResult,
  FriendRequest,
  GameService,
  LeaderboardScope,
  RelationshipStatus,
  RoomSummary,
  RoundRevealChoice,
  RoomAccessPreflight,
  SocialPlayer,
  ServiceEvent,
  ServiceEventHandler,
} from './types';
import { ServiceError } from './types';
import type {
  AbilityAction,
  AnswerSubmission,
  GameState,
  Nudge,
  Player,
  PlayerId,
  RoundChoice,
  RoundProgress,
  RoundResultRow,
  GameMode,
} from '../types/game';
import { isCategoryId, type CategoryId } from '../features/game/categories';
import { defaultDiceBearAvatarKey } from '../features/game/players';
import type { Question } from '../features/game/questions';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getWebAppUrl } from '../lib/webAppUrl';
import { syncServerClockFromRoundTrip } from './serverClock';

interface ProfilePayload {
  id: string;
  display_name: string;
  avatar_key?: string | null;
  avatar_url?: string | null;
  stats?: {
    games_played?: number;
    games_won?: number;
    correct_answers?: number;
    successful_traps?: number;
    times_trapped?: number;
    total_score?: number;
  };
}

interface OpenRoomRow {
  code: string;
  player_count: number;
  max_players: number;
  phase: GameState['phase'];
  selected_categories: string[];
  created_at: string;
}

interface LeaderboardRow {
  player_id: string;
  name: string;
  avatar_key?: string | null;
  avatar_url?: string | null;
  score: number;
  games_played: number;
  games_won: number;
  correct_answers: number | null;
  successful_traps: number | null;
  times_trapped: number | null;
}

interface SocialPlayerRow {
  user_id: string;
  display_name: string;
  avatar_key?: string | null;
  avatar_url?: string | null;
  relationship_status: RelationshipStatus;
}

interface FriendRequestRow {
  request_id: string;
  user_id: string;
  display_name: string;
  avatar_key?: string | null;
  created_at: string;
}

function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const output = new Uint8Array(Math.ceil((value.length * 3) / 4));
  let outputIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (const character of value) {
    if (character === '=') break;
    const digit = alphabet.indexOf(character);
    if (digit < 0) continue;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[outputIndex++] = (buffer >> bits) & 0xff;
    }
  }

  return output.subarray(0, outputIndex);
}

function resolveAvatarKey(value: unknown, userId: string): string {
  return typeof value === 'string' && value ? value : defaultDiceBearAvatarKey(userId);
}

function resolveAvatarUrl(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function decodeTimestamp(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  const timestamp = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(timestamp)) {
    throw new ServiceError('ROOM_STATE_INVALID', `Oda durumundaki ${field} zamanı geçersiz.`);
  }
  return timestamp;
}

export class SupabaseGameService implements GameService {
  readonly kind = 'supabase' as const;

  private connection: ConnectionState = 'offline';
  private handlers = new Set<ServiceEventHandler>();
  private cachedPlayer: Player | null = null;
  private currentChannel: RealtimeChannel | null = null;
  private currentRoomCode: string | null = null;
  private stateSyncSequence = 0;
  private authSubscription: { unsubscribe: () => void } | null = null;

  async connect(): Promise<void> {
    if (!supabaseConfigured) {
      this.connection = 'offline';
      throw new ServiceError('SUPABASE_NOT_CONFIGURED', 'Supabase yapılandırılmamış.');
    }

    const sb = ensureSupabase();
    if (!this.authSubscription) {
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return;
        setTimeout(() => {
          void (async () => {
            try {
              const player = session?.user ? await this.loadProfile(session.user.id) : null;
              this.cachedPlayer = player;
              this.emit({
                type: 'auth_state',
                payload: { player, isAnonymous: session?.user.is_anonymous ?? false },
              });
            } catch (error) {
              this.emit({ type: 'error', payload: { message: (error as Error).message } });
            }
          })();
        }, 0);
      });
      this.authSubscription = data.subscription;
    }
    const { data, error } = await sb.auth.getSession();
    if (error) throw new ServiceError('AUTH_SESSION_FAILED', error.message);
    if (data.session?.user) {
      this.cachedPlayer = await this.loadProfile(data.session.user.id);
      if (!this.cachedPlayer) {
        throw new ServiceError('PROFILE_NOT_FOUND', 'Oturum profili bulunamadı.');
      }
      this.emit({
        type: 'auth_state',
        payload: { player: this.cachedPlayer, isAnonymous: data.session.user.is_anonymous },
      });
    } else {
      this.cachedPlayer = null;
      this.emit({ type: 'auth_state', payload: { player: null, isAnonymous: false } });
    }
    this.connection = 'online';
    this.emit({ type: 'connection', payload: { state: 'online' } });
  }

  disconnect(): void {
    if (this.currentChannel) {
      const sb = ensureSupabase();
      sb.removeChannel(this.currentChannel);
      this.currentChannel = null;
    }
    this.connection = 'offline';
    this.currentRoomCode = null;
  }

  subscribe(handler: ServiceEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  getConnectionState(): ConnectionState {
    return this.connection;
  }

  async listTakenPresetCharacters(): Promise<string[]> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('list_taken_preset_characters');
    if (error) {
      const missingFunction = error.message.toLowerCase().includes('list_taken_preset_characters')
        || error.code === 'PGRST202';
      throw new ServiceError(
        'PRESET_AVAILABILITY_FAILED',
        missingFunction
          ? 'Karakter kataloğu henüz veritabanına kurulmamış. Karakter güncellemesini uyguladıktan sonra tekrar dene.'
          : `Karakterlerin uygunluğu kontrol edilemedi: ${error.message}`
      );
    }
    if (!Array.isArray(data)) {
      throw new ServiceError('PRESET_AVAILABILITY_INVALID', 'Karakter kullanılabilirlik bilgisi geçersiz.');
    }
    return data
      .map((row: { avatar_key?: unknown }) => row.avatar_key)
      .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
  }

  private emit(event: ServiceEvent) {
    for (const h of this.handlers) h(event);
  }

  private async loadProfile(userId: string): Promise<Player | null> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('get_profile_secure', { p_user_id: userId });
    if (error) throw new ServiceError('PROFILE_LOAD_FAILED', error.message);
    if (!data || typeof data !== 'object') return null;
    const profile = data as ProfilePayload;
    if (
      typeof profile.id !== 'string' ||
      typeof profile.display_name !== 'string'
    ) {
      throw new ServiceError('PROFILE_INVALID', 'Sunucudan geçersiz profil bilgisi alındı.');
    }
    const stats = profile.stats ?? {};
    return {
      id: profile.id,
      name: profile.display_name,
      avatarKey: resolveAvatarKey(profile.avatar_key, profile.id),
      avatarUrl: resolveAvatarUrl(profile.avatar_url),
      isHost: false,
      isReady: false,
      isOnline: true,
      score: Number(stats.total_score ?? 0),
      gamesPlayed: Number(stats.games_played ?? 0),
      gamesWon: Number(stats.games_won ?? 0),
      correctAnswers: Number(stats.correct_answers ?? 0),
      successfulTraps: Number(stats.successful_traps ?? 0),
      timesTrapped: Number(stats.times_trapped ?? 0),
      abilityUsedCounts: { block: 0, shield: 0, penalty: 0, counter: 0 },
      consecutiveCorrect: 0,
      shieldsAvailable: 0,
      blocksAvailable: 0,
      isBlockedCurrentRound: false,
      isBlockedNextRound: false,
      lastBlockedPlayerId: null,
    };
  }

  async signInAnonymously(name: string, avatarKey: string): Promise<Player> {
    const sb = ensureSupabase();
    void name; // The server owns the canonical display name for each preset.

    // Reuse persisted sessions, including a pending session from a failed claim.
    // Never create a new auth user just because a character was already taken.
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw new ServiceError('AUTH_SESSION_FAILED', sessionError.message);

    let user = sessionData.session?.user ?? null;
    if (user && !user.is_anonymous) {
      const registeredProfile = await this.loadProfile(user.id);
      if (!registeredProfile) {
        throw new ServiceError('PROFILE_NOT_FOUND', 'Mevcut hesabın profili bulunamadı.');
      }
      this.cachedPlayer = registeredProfile;
      return registeredProfile;
    }

    if (!user) {
      const { data, error } = await sb.auth.signInAnonymously({
        options: {
          data: {
            name: 'Karakter seçilmedi',
            avatarKey: 'pending_character',
            accountType: 'pending_character',
          },
        },
      });
      if (error) throw new ServiceError('AUTH_FAILED', error.message);
      user = data.user ?? null;
    }

    if (!user) throw new ServiceError('AUTH_FAILED', 'Anonim oturum açılamadı.');

    // The server enforces the unique claim atomically even if two browsers race.
    const { data: claimData, error: claimError } = await sb.rpc(
      'claim_preset_character_secure',
      { p_avatar_key: avatarKey }
    );
    if (claimError) {
      const missingFunction = claimError.message.toLowerCase().includes('claim_preset_character_secure')
        || claimError.code === 'PGRST202';
      throw new ServiceError(
        'PRESET_CHARACTER_CLAIM_FAILED',
        missingFunction
          ? 'Karakter rezervasyon güncellemesi veritabanına henüz uygulanmamış.'
          : `Karakter seçimi kaydedilemedi: ${claimError.message}`
      );
    }

    const claim = claimData as { success?: boolean; reason?: string } | null;
    if (!claim?.success) {
      if (claim?.reason === 'taken') {
        throw new ServiceError(
          'PRESET_CHARACTER_TAKEN',
          'Bu karakter az önce başka bir oyuncu tarafından seçildi. Lütfen boş bir karakter seç.'
        );
      }
      if (claim?.reason === 'already_claimed') {
        throw new ServiceError(
          'PRESET_CHARACTER_ALREADY_CLAIMED',
          'Bu oturumun zaten başka bir karakteri var. Mevcut karakterinle devam et.'
        );
      }
      throw new ServiceError('PRESET_CHARACTER_CLAIM_FAILED', 'Karakter seçimi tamamlanamadı. Tekrar dene.');
    }

    const profile = await this.loadProfile(user.id);
    if (!profile) throw new ServiceError('PROFILE_NOT_FOUND', 'Karakter profili oluşturulamadı.');
    this.cachedPlayer = profile;
    return profile;
  }

  async signUpWithEmail(email: string, password: string, name: string): Promise<EmailSignUpResult> {
    const sb = ensureSupabase();
    const { data, error } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim().slice(0, 32) || 'Oyuncu' } },
    });
    if (error) throw new ServiceError('AUTH_SIGNUP_FAILED', this.authErrorMessage(error.message));
    if (!data.user) {
      throw new ServiceError('AUTH_SIGNUP_FAILED', 'Kayıt tamamlanamadı. Bilgileri kontrol edip tekrar dene.');
    }
    if (!data.session) return { player: null, needsEmailConfirmation: true };
    const player = await this.loadProfile(data.user.id);
    if (!player) throw new ServiceError('PROFILE_NOT_FOUND', 'Hesap oluşturuldu ancak oyuncu profili bulunamadı.');
    this.cachedPlayer = player;
    return { player, needsEmailConfirmation: false };
  }

  async signInWithEmail(email: string, password: string): Promise<Player> {
    const sb = ensureSupabase();
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new ServiceError('AUTH_LOGIN_FAILED', this.authErrorMessage(error.message));
    if (!data.user) throw new ServiceError('AUTH_LOGIN_FAILED', 'Giriş yapılamadı. Bilgileri kontrol et.');
    const player = await this.loadProfile(data.user.id);
    if (!player) throw new ServiceError('PROFILE_NOT_FOUND', 'Oyuncu profili bulunamadı.');
    this.cachedPlayer = player;
    return player;
  }

  async signInWithGoogle(): Promise<Player> {
    const sb = ensureSupabase();
    const redirectTo = Platform.OS === 'web'
      ? getWebAppUrl('auth/callback')
      : Linking.createURL('auth/callback');
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw new ServiceError('GOOGLE_AUTH_FAILED', this.authErrorMessage(error.message));
    if (!data.url) throw new ServiceError('GOOGLE_AUTH_FAILED', 'Google giriş bağlantısı oluşturulamadı.');

    if (Platform.OS === 'web') {
      window.location.assign(data.url);
      return new Promise<Player>(() => {});
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new ServiceError('AUTH_CANCELLED', 'Google girişi iptal edildi.');
    }
    if (result.type !== 'success' || !result.url) {
      throw new ServiceError('GOOGLE_AUTH_FAILED', 'Google giriş akışı tamamlanamadı.');
    }
    const params = new URL(result.url).searchParams;
    const oauthError = params.get('error_description') ?? params.get('error');
    if (oauthError) throw new ServiceError('GOOGLE_AUTH_FAILED', this.authErrorMessage(oauthError));
    const code = params.get('code');
    if (!code) throw new ServiceError('GOOGLE_AUTH_FAILED', 'Google yanıtında oturum kodu bulunamadı.');
    return this.exchangeOAuthCode(code);
  }

  async completeOAuthCallback(code: string): Promise<Player> {
    return this.exchangeOAuthCode(code);
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    const sb = ensureSupabase();
    const redirectTo = Platform.OS === 'web'
      ? getWebAppUrl('auth/callback')
      : Linking.createURL('auth/callback');
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (error) throw new ServiceError('PASSWORD_RESET_FAILED', this.authErrorMessage(error.message));
  }

  async updatePassword(password: string): Promise<void> {
    if (password.length < 6) {
      throw new ServiceError('PASSWORD_INVALID', 'Şifre en az 6 karakter olmalıdır.');
    }
    const { error } = await ensureSupabase().auth.updateUser({ password });
    if (error) throw new ServiceError('PASSWORD_UPDATE_FAILED', this.authErrorMessage(error.message));
  }

  private async exchangeOAuthCode(code: string): Promise<Player> {
    const sb = ensureSupabase();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (error) throw new ServiceError('GOOGLE_AUTH_FAILED', this.authErrorMessage(error.message));
    if (!data.user) throw new ServiceError('GOOGLE_AUTH_FAILED', 'Google oturumu oluşturulamadı.');
    const player = await this.loadProfile(data.user.id);
    if (!player) throw new ServiceError('PROFILE_NOT_FOUND', 'Google hesabı için oyuncu profili bulunamadı.');
    this.cachedPlayer = player;
    return player;
  }

  async refreshSession(): Promise<void> {
    const sb = ensureSupabase();
    const { data, error } = await sb.auth.refreshSession();
    if (error) throw new ServiceError('AUTH_REFRESH_FAILED', this.authErrorMessage(error.message));
    this.cachedPlayer = data.user ? await this.loadProfile(data.user.id) : null;
  }

  private authErrorMessage(message: string): string {
    const normalized = message.toLowerCase();
    if (normalized.includes('access_denied') || normalized.includes('cancelled') || normalized.includes('canceled')) {
      return 'Giriş işlemi iptal edildi.';
    }
    if (normalized.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
    if (normalized.includes('password') && (normalized.includes('short') || normalized.includes('least'))) {
      return 'Şifre en az 6 karakter olmalıdır.';
    }
    if (normalized.includes('invalid email')) return 'Geçerli bir e-posta adresi gir.';
    if (normalized.includes('already registered') || normalized.includes('already been registered')) {
      return 'Bu e-posta zaten kayıtlı. Giriş yap veya hesabını kullandığın sağlayıcıyla aç; hesaplar yalnızca e-posta eşleşti diye birleştirilmez.';
    }
    if (normalized.includes('email not confirmed')) return 'E-posta adresini doğruladıktan sonra giriş yapabilirsin.';
    if (normalized.includes('provider is not enabled') || normalized.includes('unsupported provider')) {
      return 'Google girişi Supabase projesinde etkin değil.';
    }
    if (normalized.includes('network') || normalized.includes('fetch')) {
      return 'Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.';
    }
    return `Kimlik doğrulama başarısız oldu: ${message}`;
  }

  getCurrentPlayer(): Player | null {
    return this.cachedPlayer;
  }

  async updatePlayerProfile(name: string, avatarKey: string): Promise<Player> {
    if (!this.cachedPlayer) {
      throw new ServiceError('PROFILE_NOT_FOUND', 'Profil bilgisi bulunamadı.');
    }

    const sb = ensureSupabase();
    const { error: profileError } = await sb.rpc('update_profile_secure', {
      p_display_name: name.trim().slice(0, 32) || 'Oyuncu',
      p_avatar_key: /^https:\/\//i.test(avatarKey) ? 'fox' : avatarKey,
      p_avatar_url: /^https:\/\//i.test(avatarKey) ? avatarKey : '',
    });
    if (profileError) {
      throw new ServiceError('PROFILE_UPDATE_FAILED', profileError.message);
    }

    const nextPlayer = await this.loadProfile(this.cachedPlayer.id);
    if (!nextPlayer) throw new ServiceError('PROFILE_NOT_FOUND', 'Güncellenen profil alınamadı.');
    this.cachedPlayer = nextPlayer;
    if (this.currentRoomCode) {
      const roomState = await this.getRoomState(this.currentRoomCode);
      if (roomState) this.emit({ type: 'state', payload: roomState });
    }
    return nextPlayer;
  }

  async uploadAvatar(base64: string, mimeType: string): Promise<string> {
    if (!this.cachedPlayer) {
      throw new ServiceError('PROFILE_NOT_FOUND', 'Fotoğraf yüklemek için oturum açmalısın.');
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw new ServiceError('AVATAR_INVALID_TYPE', 'JPG, PNG veya WebP formatında bir fotoğraf seç.');
    }
    const bytes = decodeBase64(base64);
    if (bytes.byteLength > 5 * 1024 * 1024) {
      throw new ServiceError('AVATAR_TOO_LARGE', 'Fotoğraf boyutu 5 MB sınırını aşamaz.');
    }

    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
    const sb = ensureSupabase();
    const { error } = await sb.storage
      .from('avatars')
      .upload(`${this.cachedPlayer.id}/avatar.${extension}`, bytes, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: true,
      });
    if (error) {
      throw new ServiceError('AVATAR_UPLOAD_FAILED', error.message);
    }

    const { data } = sb.storage
      .from('avatars')
      .getPublicUrl(`${this.cachedPlayer.id}/avatar.${extension}`);
    const avatarUrl = data.publicUrl;
    const { error: profileError } = await sb.rpc('update_profile_secure', {
      p_display_name: this.cachedPlayer.name,
      p_avatar_key: this.cachedPlayer.avatarKey,
      p_avatar_url: avatarUrl,
    });
    if (profileError) throw new ServiceError('AVATAR_PROFILE_UPDATE_FAILED', profileError.message);
    this.cachedPlayer = { ...this.cachedPlayer, avatarUrl };
    return `${avatarUrl}?v=${Date.now()}`;
  }

  async signOut(): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.auth.signOut();
    if (error) throw new ServiceError('SIGN_OUT_FAILED', error.message);
    this.cachedPlayer = null;
    this.emit({ type: 'auth_state', payload: { player: null, isAnonymous: false } });
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
    const sb = ensureSupabase();
    if (!this.cachedPlayer) {
      throw new ServiceError('AUTH_REQUIRED', 'Oda oluşturmak için önce giriş yapmalısın.');
    }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];

    const { data, error } = await sb.rpc('create_room_with_mode_secure', {
      p_code: code,
      p_name: config.hostName.trim() || 'Ev Sahibi',
      p_avatar_key: config.avatarKey,
      p_total_rounds: config.totalRounds,
      p_round_seconds: config.roundSeconds,
      p_categories: config.categories,
      p_is_private: config.isPrivate ?? false,
      p_password: config.isPrivate ? config.password : null,
      p_game_mode: config.gameMode ?? 'classic',
    });

    if (error) {
      throw new ServiceError('CREATE_ROOM_FAILED', error.message);
    }

    const hostId = this.cachedPlayer!.id;
    this.cachedPlayer = {
      ...this.cachedPlayer!,
      isHost: true,
      isReady: true,
    };

    await this.setupRealtimeSubscription(code);
    return { code, playerId: hostId };
  }

  async joinRoom(
    code: string,
    name: string,
    avatarKey: string,
    password?: string,
    inviteToken?: string
  ): Promise<{ playerId: string }> {
    const sb = ensureSupabase();
    const cleanCode = code.trim().toUpperCase();
    if (!this.cachedPlayer) {
      throw new ServiceError('AUTH_REQUIRED', 'Odaya katılmak için önce giriş yapmalısın.');
    }

    const { data, error } = inviteToken
      ? await sb.rpc('join_room_invite_secure', {
          p_code: cleanCode,
          p_name: name.trim() || 'Oyuncu',
          p_avatar_key: avatarKey,
          p_invite_token: inviteToken,
        })
      : await sb.rpc('join_room_secure', {
          p_code: cleanCode,
          p_name: name.trim() || 'Oyuncu',
          p_avatar_key: avatarKey,
          p_password: password || null,
        });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('oda dolu')) {
        throw new ServiceError('ROOM_FULL', 'Oda dolu.');
      }
      if (message.includes('oyun çoktan başladı')) {
        throw new ServiceError('GAME_ALREADY_STARTED', 'Oyun çoktan başladı.');
      }
      if (inviteToken) {
        throw new ServiceError('INVITE_INVALID', 'Davet bağlantısı geçersiz, süresi dolmuş veya kullanılamıyor.');
      }
      throw new ServiceError('JOIN_ROOM_FAILED', error.message);
    }

    const joined = Array.isArray(data) ? data[0] : data;
    if (!joined || typeof joined !== 'object' || !('player_id' in joined)) {
      if (inviteToken) {
        throw new ServiceError('INVITE_INVALID', 'Davet bağlantısı geçersiz, süresi dolmuş veya kullanılamıyor.');
      }
      throw new ServiceError(
        'ROOM_ACCESS_DENIED',
        'Oda kodu veya şifre hatalı ya da katılım geçici olarak sınırlandı.'
      );
    }
    const playerId = this.cachedPlayer!.id;
    await this.setupRealtimeSubscription(cleanCode);
    return { playerId };
  }

  async checkRoomAccess(code: string): Promise<RoomAccessPreflight> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('room_join_preflight_secure', {
      p_code: code.trim().toUpperCase(),
    });
    if (error) throw new ServiceError('ROOM_PREFLIGHT_FAILED', error.message);
    if (data === 'open' || data === 'password_required') return data;
    if (data === 'full') {
      throw new ServiceError('ROOM_FULL', 'Oda dolu. Başka bir odayı deneyebilirsin.');
    }
    if (data === 'closed') {
      throw new ServiceError('GAME_ALREADY_STARTED', 'Oyun başladı; yeni oyuncu kabul edilmiyor.');
    }
    throw new ServiceError('ROOM_UNAVAILABLE', 'Oda bulunamadı veya yeni katılıma açık değil.');
  }

  async createRoomInvite(code: string): Promise<string> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('create_room_invite_secure', {
      p_room_code: code.trim().toUpperCase(),
    });
    if (error) throw new ServiceError('INVITE_CREATE_FAILED', error.message);
    if (typeof data !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data)) {
      throw new ServiceError('INVITE_INVALID_RESPONSE', 'Sunucudan geçersiz davet bağlantısı alındı.');
    }
    return data;
  }

  async leaveRoom(code: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('leave_room_secure', { p_room_code: code.toUpperCase() });
    if (error) throw new ServiceError('LEAVE_ROOM_FAILED', error.message);
    if (this.currentChannel) {
      sb.removeChannel(this.currentChannel);
      this.currentChannel = null;
    }
    this.currentRoomCode = null;
    this.emit({ type: 'player_left', payload: { code } });
  }

  async kickPlayer(code: string, playerId: string): Promise<void> {
    const { error } = await ensureSupabase().rpc('kick_room_player_secure', {
      p_room_code: code.trim().toUpperCase(),
      p_target_id: playerId,
    });
    if (error) throw new ServiceError('KICK_PLAYER_FAILED', error.message);
  }

  async setRoomPaused(code: string, paused: boolean): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('set_room_paused_secure', {
      p_room_code: code.toUpperCase(),
      p_paused: paused,
    });
    if (error) throw new ServiceError('ROOM_PAUSE_FAILED', error.message);
  }

  async getRoomState(code: string): Promise<GameState | null> {
    const sb = ensureSupabase();
    const clockRequestStartedAt = Date.now();
    const clockPromise = sb.rpc('get_server_time_secure').then((response) => ({
      ...response,
      receivedAt: Date.now(),
    }));
    const [roomResponse, clockResponse] = await Promise.all([
      sb.rpc('get_room_state_secure', {
        p_room_code: code.trim().toUpperCase(),
      }),
      clockPromise,
    ]);
    if (!clockResponse.error && clockResponse.data !== null) {
      syncServerClockFromRoundTrip(
        clockResponse.data,
        clockRequestStartedAt,
        clockResponse.receivedAt,
      );
    }
    const { data, error } = roomResponse;
    if (error) {
      if (error.message.toLowerCase().includes('oda bulunamadı veya erişim izniniz yok')) {
        throw new ServiceError('ROOM_MEMBERSHIP_INVALID', 'Kayıtlı oda artık hesabına açık değil.');
      }
      throw new ServiceError('ROOM_STATE_FAILED', error.message);
    }
    if (!data) return null;
    const state = data as Record<string, unknown>;
    if (
      typeof state.phase !== 'string' ||
      typeof state.currentRound !== 'number' ||
      typeof state.config !== 'object' ||
      state.config === null ||
      typeof state.players !== 'object' ||
      state.players === null
    ) {
      throw new ServiceError('ROOM_STATE_INVALID', 'Sunucudan geçersiz oda durumu alındı.');
    }
    const startedAt = decodeTimestamp(state.phaseStartedAt, 'başlangıç');
    const deadlineAt = decodeTimestamp(state.phaseDeadlineAt, 'bitiş');
    const pausedAt = decodeTimestamp(state.pausedAt, 'duraklatma');
    return {
      ...state,
      phaseStartedAt: startedAt ?? undefined,
      phaseDeadlineAt: deadlineAt,
      pausedAt,
    } as unknown as GameState;
  }

  async getCurrentQuestion(code: string): Promise<Question | null> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('get_current_question_secure', {
      p_room_code: code.trim().toUpperCase(),
    });
    if (error) throw new ServiceError('QUESTION_LOAD_FAILED', error.message);
    if (!data || typeof data !== 'object') return null;

    const row = data as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.categoryId !== 'string' ||
      !isCategoryId(row.categoryId) ||
      typeof row.prompt !== 'string'
    ) {
      throw new ServiceError('QUESTION_INVALID', 'Sunucudan geçersiz soru bilgisi alındı.');
    }
    return {
      id: row.id,
      categoryId: row.categoryId,
      prompt: row.prompt,
      correctAnswer: typeof row.correctAnswer === 'string' ? row.correctAnswer : undefined,
      difficulty: row.difficulty === 'easy' || row.difficulty === 'medium' || row.difficulty === 'hard'
        ? row.difficulty
        : undefined,
      subcategory: typeof row.subcategory === 'string' ? row.subcategory : undefined,
      explanation: typeof row.explanation === 'string' ? row.explanation : undefined,
      sourceUrl: typeof row.sourceUrl === 'string' ? row.sourceUrl : undefined,
      status: row.status === 'draft' || row.status === 'approved' || row.status === 'archived'
        ? row.status
        : undefined,
    };
  }

  async restoreRoom(code: string, subscribe = true): Promise<GameState | null> {
    const cleanCode = code.trim().toUpperCase();
    const state = await this.getRoomState(cleanCode);
    if (!state || !this.cachedPlayer || !state.players[this.cachedPlayer.id]) return null;
    if (subscribe && state.phase !== 'game_over') {
      await this.setupRealtimeSubscription(cleanCode);
    }
    return state;
  }

  async getRoomProgress(code: string): Promise<RoundProgress> {
    const state = await this.getRoomState(code);
    if (!state?.progress) {
      throw new ServiceError('ROOM_PROGRESS_UNAVAILABLE', 'Oda ilerleme bilgisi alınamadı.');
    }
    return state.progress;
  }

  async listOpenRooms(): Promise<RoomSummary[]> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('list_open_rooms_secure');
    if (error) throw new ServiceError('ROOM_LIST_FAILED', error.message);
    if (!Array.isArray(data)) {
      throw new ServiceError('ROOM_LIST_INVALID', 'Sunucudan geçersiz açık oda listesi alındı.');
    }

    return data.map((row: OpenRoomRow) => {
      if (
        typeof row.code !== 'string' ||
        !Number.isInteger(row.player_count) ||
        !Number.isInteger(row.max_players) ||
        typeof row.phase !== 'string' ||
        !Array.isArray(row.selected_categories) ||
        !row.selected_categories.every(isCategoryId) ||
        typeof row.created_at !== 'string'
      ) {
        throw new ServiceError('ROOM_LIST_INVALID', 'Açık oda listesinde geçersiz oda bilgisi var.');
      }
      const categoryIds = row.selected_categories;
      return {
        code: row.code,
        playerCount: row.player_count,
        maxPlayers: row.max_players,
        phase: row.phase,
        categoryIds,
        categoryStatus: row.phase === 'category_select'
          ? 'selecting'
          : categoryIds.length > 0 ? 'selected' : 'not_selected',
        createdAt: new Date(row.created_at).getTime(),
      };
    });
  }

  async setReady(code: string, ready: boolean): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('set_player_ready_secure', {
      p_room_code: code.toUpperCase(),
      p_ready: ready,
    });
    if (error) throw new ServiceError('SET_READY_FAILED', error.message);
  }

  async nudgePlayer(code: string, toId: string): Promise<Nudge> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('nudge_player_secure', {
      p_room_code: code.toUpperCase(),
      p_target_id: toId,
    });
    if (error) throw new ServiceError('NUDGE_FAILED', error.message);
    const nudge = data?.[0];
    if (!nudge) throw new ServiceError('NUDGE_FAILED', 'Dürtme kaydı oluşturulamadı.');
    return {
      fromId: nudge.from_id,
      toId: nudge.to_id,
      at: new Date(nudge.created_at).getTime(),
      roundNumber: nudge.round_number,
      phase: nudge.phase,
    };
  }

  async startGame(code: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('start_game_secure', {
      p_room_code: code.toUpperCase(),
    });
    if (error) throw new ServiceError('START_GAME_FAILED', error.message);
  }

  async markCurrentQuestionSeen(code: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('mark_current_question_seen_secure', {
      p_room_code: code.toUpperCase(),
    });
    if (error) throw new ServiceError('QUESTION_SEEN_FAILED', error.message);
  }

  async submitFakeAnswer(code: string, fakeAnswer: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('submit_fake_answer_secure', {
      p_room_code: code.toUpperCase(),
      p_fake_answer: fakeAnswer.trim(),
    });
    if (error) throw new ServiceError('SUBMIT_FAKE_FAILED', error.message);
  }

  async getRoundChoices(code: string): Promise<RoundChoice[]> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('get_round_choices_secure', {
      p_room_code: code.toUpperCase(),
    });
    if (error) throw new ServiceError('ROUND_CHOICES_FAILED', error.message);
    if (!data) return [];
    return data.map((d: { choice_index: number; choice_text: string; is_own_fake: boolean }) => ({
      choiceIndex: d.choice_index,
      text: d.choice_text,
      isOwnFake: d.is_own_fake,
    }));
  }

  async getRoundReveal(code: string): Promise<RoundRevealChoice[]> {
    const { data, error } = await ensureSupabase().rpc('get_round_reveal_secure', { p_room_code: code.toUpperCase() });
    if (error) throw new ServiceError('ROUND_REVEAL_FAILED', error.message);
    return (data ?? []).map((r: {choice_index:number;choice_text:string;author_id:string|null;is_correct:boolean;picked_by:string[]|null}) => ({
      choiceIndex:r.choice_index,text:r.choice_text,authorId:r.author_id,isCorrect:r.is_correct,pickedBy:r.picked_by ?? [],
    }));
  }

  async submitPick(code: string, choiceIndex: number): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('submit_pick_secure', {
      p_room_code: code.toUpperCase(),
      p_choice_index: choiceIndex,
    });
    if (error) throw new ServiceError('SUBMIT_PICK_FAILED', error.message);
  }

  async submitSuspectPick(code: string, suspectPlayerId: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('submit_suspect_pick_secure', {
      p_room_code: code.toUpperCase(),
      p_suspect_id: suspectPlayerId,
    });
    if (error) {
      if (__DEV__) console.warn('[SupabaseAdapter] submit_suspect_pick_secure:', error.message);
    }
  }

  async useAbility(code: string, action: AbilityAction): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('use_ability_secure', {
      p_room_code: code.toUpperCase(),
      p_ability: action.abilityId,
      p_target_id: action.targetId || null,
    });
    if (error) throw new ServiceError('USE_ABILITY_FAILED', error.message);
  }

  async confirmAbilitySelection(code: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('confirm_ability_selection_secure', {
      p_room_code: code.toUpperCase(),
    });
    if (error) throw new ServiceError('ABILITY_CONFIRM_FAILED', error.message);
  }

  async advancePhase(code: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('advance_round_secure', {
      p_room_code: code.toUpperCase(),
    });
    if (error) throw new ServiceError('ADVANCE_FAILED', error.message);
  }

  async advanceExpiredPhase(code: string): Promise<boolean> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('advance_expired_room_phase_secure', {
      p_room_code: code.toUpperCase(),
    });
    if (error) throw new ServiceError('PHASE_TIMEOUT_FAILED', error.message);
    return data === true;
  }

  async rematch(code: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('rematch_room_secure', {
      p_room_code: code.toUpperCase(),
    });
    if (error) throw new ServiceError('REMATCH_FAILED', error.message);
  }

  async submitAnswer(code: string, submission: AnswerSubmission): Promise<void> {
    if (submission.fakeAnswer) {
      await this.submitFakeAnswer(code, submission.fakeAnswer);
    } else if (submission.choiceIndex !== undefined) {
      await this.submitPick(code, submission.choiceIndex);
    } else if (submission.selectedIndex !== undefined) {
      await this.submitPick(code, submission.selectedIndex);
    }
  }

  async getLeaderboard(scope: LeaderboardScope = 'all'): Promise<Player[]> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('get_leaderboard_scoped_secure', {
      p_scope: scope,
    });
    if (error) throw new ServiceError('LEADERBOARD_FAILED', error.message);
    if (!data) return [];
    return data.map((d: LeaderboardRow) => ({
      id: d.player_id,
      name: d.name,
      avatarKey: resolveAvatarKey(d.avatar_key, d.player_id),
      avatarUrl: resolveAvatarUrl(d.avatar_url),
      score: Number(d.score),
      gamesPlayed: d.games_played,
      gamesWon: d.games_won,
      correctAnswers: d.correct_answers === null ? undefined : d.correct_answers,
      successfulTraps: d.successful_traps === null ? undefined : d.successful_traps,
      timesTrapped: d.times_trapped === null ? undefined : d.times_trapped,
      isHost: false,
      isReady: false,
      isOnline: true,
      abilityUsedCounts: { block: 0, shield: 0, penalty: 0, counter: 0 },
      consecutiveCorrect: 0,
      shieldsAvailable: 0,
      blocksAvailable: 0,
      isBlockedCurrentRound: false,
      isBlockedNextRound: false,
      lastBlockedPlayerId: null,
    }));
  }

  async searchPlayers(query: string): Promise<SocialPlayer[]> {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2 || cleanQuery.length > 32) {
      throw new ServiceError('PLAYER_SEARCH_INVALID', 'Oyuncu araması 2-32 karakter arasında olmalıdır.');
    }
    const { data, error } = await ensureSupabase().rpc('search_players_secure', {
      p_query: cleanQuery,
    });
    if (error) throw new ServiceError('PLAYER_SEARCH_FAILED', error.message);
    if (!data) return [];
    return data.map((row: SocialPlayerRow) => ({
      id: row.user_id,
      name: row.display_name,
      avatarKey: resolveAvatarKey(row.avatar_key, row.user_id),
      avatarUrl: resolveAvatarUrl(row.avatar_url),
      relationshipStatus: row.relationship_status,
    }));
  }

  async getProfile(playerId: string): Promise<Player | null> {
    const profile = await this.loadProfile(playerId);
    if (profile?.id === this.cachedPlayer?.id) this.cachedPlayer = profile;
    return profile;
  }

  async getRelationshipStatus(playerId: string): Promise<RelationshipStatus> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('get_friendship_status_secure', {
      p_other_id: playerId,
    });
    if (error) throw new ServiceError('RELATIONSHIP_LOAD_FAILED', error.message);
    const allowed: RelationshipStatus[] = [
      'none',
      'outgoing_pending',
      'incoming_pending',
      'friends',
      'blocked',
    ];
    if (typeof data !== 'string' || !allowed.includes(data as RelationshipStatus)) {
      throw new ServiceError('RELATIONSHIP_INVALID', 'İlişki durumu tanınmıyor.');
    }
    return data as RelationshipStatus;
  }

  async sendFriendRequest(playerId: string): Promise<RelationshipStatus> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('send_friend_request_secure', {
      p_recipient_id: playerId,
    });
    if (error) throw new ServiceError('FRIEND_REQUEST_FAILED', error.message);
    return this.parseRelationshipStatus(data);
  }

  async respondFriendRequest(requestId: string, accept: boolean): Promise<RelationshipStatus> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('respond_friend_request_secure', {
      p_request_id: requestId,
      p_accept: accept,
    });
    if (error) throw new ServiceError('FRIEND_REQUEST_RESPONSE_FAILED', error.message);
    return this.parseRelationshipStatus(data);
  }

  async cancelFriendRequest(requestId: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('cancel_friend_request_secure', {
      p_request_id: requestId,
    });
    if (error) throw new ServiceError('FRIEND_REQUEST_CANCEL_FAILED', error.message);
  }

  async removeFriend(playerId: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('remove_friend_secure', { p_other_id: playerId });
    if (error) throw new ServiceError('FRIEND_REMOVE_FAILED', error.message);
  }

  async blockUser(playerId: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('block_user_secure', { p_other_id: playerId });
    if (error) throw new ServiceError('USER_BLOCK_FAILED', error.message);
  }

  async unblockUser(playerId: string): Promise<void> {
    const sb = ensureSupabase();
    const { error } = await sb.rpc('unblock_user_secure', { p_other_id: playerId });
    if (error) throw new ServiceError('USER_UNBLOCK_FAILED', error.message);
  }

  async listFriends(): Promise<SocialPlayer[]> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('list_friends_secure');
    if (error) throw new ServiceError('FRIENDS_LOAD_FAILED', error.message);
    return (data ?? [])
      .filter((row: SocialPlayerRow) => row.relationship_status === 'friends')
      .map((row: SocialPlayerRow) => ({
        id: row.user_id,
        name: row.display_name,
        avatarKey: resolveAvatarKey(row.avatar_key, row.user_id),
        avatarUrl: resolveAvatarUrl(row.avatar_url),
        relationshipStatus: 'friends',
      }));
  }

  async listFriendRequests(): Promise<FriendRequest[]> {
    const sb = ensureSupabase();
    const { data, error } = await sb.rpc('get_pending_friend_requests_secure');
    if (error) throw new ServiceError('FRIEND_REQUESTS_LOAD_FAILED', error.message);
    return (data ?? []).map((row: FriendRequestRow) => ({
      requestId: row.request_id,
      id: row.user_id,
      name: row.display_name,
      avatarKey: resolveAvatarKey(row.avatar_key, row.user_id),
      relationshipStatus: 'incoming_pending',
      createdAt: new Date(row.created_at).getTime(),
    }));
  }

  private parseRelationshipStatus(value: unknown): RelationshipStatus {
    const allowed: RelationshipStatus[] = [
      'none',
      'outgoing_pending',
      'incoming_pending',
      'friends',
      'blocked',
    ];
    if (typeof value !== 'string' || !allowed.includes(value as RelationshipStatus)) {
      throw new ServiceError('RELATIONSHIP_INVALID', 'İşlem sonucu tanınmayan ilişki durumu döndürdü.');
    }
    return value as RelationshipStatus;
  }

  private async setupRealtimeSubscription(code: string): Promise<void> {
    if (this.currentRoomCode === code && this.currentChannel) return;

    const sb = ensureSupabase();
    const { data: room, error } = await sb
      .from('rooms')
      .select('id')
      .eq('code', code)
      .single();
    if (error) throw new ServiceError('ROOM_SUBSCRIPTION_FAILED', error.message);
    if (this.currentChannel) {
      sb.removeChannel(this.currentChannel);
    }
    this.currentRoomCode = code;
    this.stateSyncSequence += 1;

    const channel = sb.channel(`room:${code}`, {
      config: { broadcast: { self: true } },
    });
    const syncState = async (includeResolution = false) => {
      const sequence = ++this.stateSyncSequence;
      try {
        const state = await this.getRoomState(code);
        if (sequence !== this.stateSyncSequence || this.currentRoomCode !== code || !state) return;
        if (includeResolution) {
          this.emit({ type: 'round_resolved', payload: { code, rows: state.roundResults } });
        }
        this.emit({ type: 'phase_changed', payload: { code, phase: state.phase } });
        this.emit({ type: 'state', payload: state });
      } catch (error) {
        this.emit({
          type: 'error',
          payload: {
            message: error instanceof Error ? error.message : 'Oda durumu yenilenemedi.',
            code: error instanceof ServiceError ? error.code : undefined,
          },
        });
      }
    };

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        () => { void syncState(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${room.id}` },
        () => { void syncState(); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'round_results', filter: `room_id=eq.${room.id}` },
        () => { void syncState(true); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nudges', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const n = payload.new as {
            from_id: string;
            to_id: string;
            created_at: string;
            round_number: number;
            phase: GameState['phase'];
          };
          this.emit({
            type: 'nudge',
            payload: {
              code,
              nudge: {
                fromId: n.from_id,
                toId: n.to_id,
                at: new Date(n.created_at).getTime(),
                roundNumber: n.round_number,
                phase: n.phase,
              },
            },
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.connection = 'online';
          this.emit({ type: 'connection', payload: { state: 'online' } });
          void syncState();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.connection = 'reconnecting';
          this.emit({ type: 'connection', payload: { state: 'reconnecting' } });
        }
      });

    this.currentChannel = channel;
  }
}
