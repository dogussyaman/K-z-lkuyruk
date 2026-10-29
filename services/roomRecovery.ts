import { isPartyMode } from '../features/party/catalog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameState, RoomPhase } from '@/types/game';

const STORAGE_KEY = 'kizilkuyruk.room-recovery';
const CURRENT_VERSION = 1;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface RoomRecoveryRecord {
  version: 1;
  roomCode: string;
  playerId: string;
  updatedAt: number;
}

export type RoomRecoveryRoute =
  | '/party-game'
  | '/lobby'
  | '/category-select'
  | '/ability-select'
  | '/question'
  | '/waiting'
  | '/result'
  | '/scoreboard'
  | '/game-over';

export type RecoveryState = Pick<GameState, 'phase' | 'progress'> & Partial<Pick<GameState,'config'>>;

export function getRoomRecoveryRoute(state: RecoveryState, playerId: string): RoomRecoveryRoute {
  if (isPartyMode(state.config?.gameMode) && state.phase!=='lobby') return '/party-game';
  const submitted = state.progress?.submissionStatus[playerId] === true;
  const phaseRoutes: Partial<Record<RoomPhase, RoomRecoveryRoute>> = {
    lobby: '/lobby',
    category_select: '/category-select',
    ability_select: '/ability-select',
    fake_answer: submitted ? '/waiting' : '/question',
    guess: submitted ? '/waiting' : '/question',
    question: '/question',
    submitting: submitted ? '/waiting' : '/question',
    waiting: submitted ? '/waiting' : '/question',
    reveal: '/result',
    scoreboard: '/scoreboard',
    game_over: '/game-over',
  };
  return phaseRoutes[state.phase] ?? '/lobby';
}

interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function isRecord(value: unknown): value is RoomRecoveryRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RoomRecoveryRecord>;
  return record.version === CURRENT_VERSION
    && typeof record.roomCode === 'string'
    && /^[A-Z0-9]{5,6}$/.test(record.roomCode)
    && typeof record.playerId === 'string'
    && record.playerId.length > 0
    && typeof record.updatedAt === 'number'
    && Number.isFinite(record.updatedAt)
    && record.updatedAt <= Date.now()
    && Date.now() - record.updatedAt <= MAX_AGE_MS;
}

export async function readRoomRecovery(
  storage: KeyValueStorage = AsyncStorage,
): Promise<RoomRecoveryRecord | null> {
  const raw = await storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Invalid local data is discarded; it is never authoritative game state.
  }
  await storage.removeItem(STORAGE_KEY);
  return null;
}

export async function saveRoomRecovery(
  roomCode: string,
  playerId: string,
  storage: KeyValueStorage = AsyncStorage,
): Promise<void> {
  const code = roomCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{5,6}$/.test(code) || !playerId) {
    throw new Error('Oda kurtarma bilgisi geçersiz.');
  }
  const record: RoomRecoveryRecord = {
    version: CURRENT_VERSION,
    roomCode: code,
    playerId,
    updatedAt: Date.now(),
  };
  await storage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export async function clearRoomRecovery(
  storage: KeyValueStorage = AsyncStorage,
): Promise<void> {
  await storage.removeItem(STORAGE_KEY);
}
