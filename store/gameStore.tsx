import { selectRoomSnapshot, startRoomSync } from '@/services/roomSync';
import { getServerNowMs } from '@/services/serverClock';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { createGameService, supabaseConfigured } from '@/services';
import type { ConnectionState, GameService, ServiceEvent } from '@/services/types';
import type { GameState, Nudge, Player } from '@/types/game';
import {
  clearRoomRecovery,
  readRoomRecovery,
  saveRoomRecovery,
} from '@/services/roomRecovery';
import type { RoomRecoveryRecord } from '@/services/roomRecovery';

export type AuthStatus = 'loading' | 'signed_in' | 'signed_out';

interface GameStoreValue {
  service: GameService;
  isLive: boolean;
  isInitialized: boolean;
  authStatus: AuthStatus;
  isAnonymous: boolean;
  currentPlayer: Player | null;
  connection: ConnectionState;
  roomCode: string | null;
  roomState: GameState | null;
  lastNudge: Nudge | null;
  error: string | null;
  recoveryStatus: 'loading' | 'none' | 'available';
  recoveryCode: string | null;
  recoveryRoom: GameState | null;
  init: () => Promise<void>;
  setCurrentPlayer: (p: Player | null) => void;
  setRoomCode: (code: string | null) => void;
  setRoomState: (state: GameState | null) => void;
  setError: (e: string | null) => void;
  refreshRoom: () => Promise<void>;
  continueSavedRoom: () => Promise<GameState>;
  dismissRecoveryOffer: () => void;
}

const GameStoreContext = createContext<GameStoreValue | null>(null);

export function GameStoreProvider({ children }: { children: ReactNode }) {
  const [service] = useState<GameService>(() => createGameService());
  const isLive = supabaseConfigured;

  const [currentPlayer, setPlayer] = useState<Player | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(isLive ? 'loading' : 'signed_in');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [roomCode, setRoomCodeState] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<GameState | null>(null);
  const [lastNudge, setLastNudge] = useState<GameStoreValue['lastNudge']>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<GameStoreValue['recoveryStatus']>('loading');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryRoom, setRecoveryRoom] = useState<GameState | null>(null);
  const initFlight = useRef<Promise<void> | null>(null);
  const initCompleted = useRef(false);
  const currentPlayerId = useRef<string | null>(null);
  const roomOwnerId = useRef<string | null>(null);
  const activeRoomCode = useRef<string | null>(null);
  const applyRoomState = useCallback((state: GameState | null) => {
    if (state && activeRoomCode.current && state.config.code !== activeRoomCode.current) return;
    setRoomState(previous => selectRoomSnapshot(previous, state));
  }, []);
  const updateRoomCode = useCallback((code: string | null) => {
    activeRoomCode.current = code;
    setRoomCodeState(code);
    if (code) {
      roomOwnerId.current = currentPlayer?.id ?? service.getCurrentPlayer()?.id ?? null;
    } else {
      roomOwnerId.current = null;
      void clearRoomRecovery().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Oda kurtarma bilgisi temizlenemedi.');
      });
    }
  }, [currentPlayer?.id, service]);

  useEffect(() => {
    const unsub = service.subscribe((event: ServiceEvent) => {
      switch (event.type) {
        case 'connection': {
          const s = (event.payload as { state: ConnectionState })?.state;
          if (s) setConnection(s);
          break;
        }
        case 'state': {
          const snap = event.payload as GameState | null;
          if (snap) applyRoomState(snap);
          break;
        }
        case 'auth_state': {
          const payload = event.payload as { player: Player | null; isAnonymous: boolean };
          if (currentPlayerId.current && currentPlayerId.current !== payload.player?.id) {
            updateRoomCode(null);
            setRoomState(null);
            setRecoveryCode(null);
            setRecoveryRoom(null);
            setRecoveryStatus('none');
            void clearRoomRecovery().catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : 'Kayıtlı oda bilgisi temizlenemedi.');
            });
          }
          currentPlayerId.current = payload.player?.id ?? null;
          setPlayer(payload.player);
          setIsAnonymous(payload.isAnonymous);
          setAuthStatus(payload.player ? 'signed_in' : 'signed_out');
          break;
        }
        case 'phase_changed': {
          break;
        }
        case 'nudge': {
          const p = event.payload as { nudge: GameStoreValue['lastNudge'] };
          if (p?.nudge) setLastNudge(p.nudge);
          break;
        }
        case 'error': {
          const p = event.payload as { message: string; code?: string };
          if (p?.code === 'ROOM_MEMBERSHIP_INVALID') {
            updateRoomCode(null);
            applyRoomState(null);
          } else if (p?.message) {
            setError(p.message);
          }
          break;
        }
      }
    });
    return unsub;
  }, [service, applyRoomState, updateRoomCode]);

  useEffect(() => {
    if (roomState?.phase === 'game_over') {
      void clearRoomRecovery().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Oda kurtarma bilgisi temizlenemedi.');
      });
    } else if (roomCode && currentPlayer?.id && roomOwnerId.current === currentPlayer.id) {
      void saveRoomRecovery(roomCode, currentPlayer.id).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Oda kurtarma bilgisi kaydedilemedi.');
      });
    }
  }, [roomCode, currentPlayer?.id, roomState?.phase]);

  // Realtime reconnects and foreground transitions both re-read server-authoritative state.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && roomCode) {
        service.restoreRoom(roomCode).then((snap) => {
          if (snap) applyRoomState(snap);
        }).catch((cause: unknown) => {
          if ((cause as { code?: string })?.code === 'ROOM_MEMBERSHIP_INVALID') {
            updateRoomCode(null);
            applyRoomState(null);
          } else {
            setError(cause instanceof Error ? cause.message : 'Oda durumu yenilenemedi.');
          }
        });
      }
    });
    return () => subscription.remove();
  }, [roomCode, service, applyRoomState, updateRoomCode]);

  const init = useCallback(async () => {
    if (initCompleted.current) return;
    if (initFlight.current) return initFlight.current;
    initFlight.current = (async () => {
    try {
      await service.connect();
      setConnection(service.getConnectionState());
      const player = service.getCurrentPlayer();
      setPlayer(player);
      currentPlayerId.current = player?.id ?? null;
      setAuthStatus(isLive && !player ? 'signed_out' : 'signed_in');
      let savedRoom: RoomRecoveryRecord | null = null;
      try {
        savedRoom = await readRoomRecovery();
      } catch (storageError) {
        setError(storageError instanceof Error ? storageError.message : 'Kayıtlı oda bilgisi okunamadı.');
      }
      if (!savedRoom) {
        setRecoveryCode(null);
        setRecoveryRoom(null);
        setRecoveryStatus('none');
        return;
      }
      if (!player || savedRoom.playerId !== player.id) {
        await clearRoomRecovery();
        setRecoveryCode(null);
        setRecoveryRoom(null);
        setRecoveryStatus('none');
        return;
      }
      try {
        setRecoveryCode(savedRoom.roomCode);
        const restored = await service.restoreRoom(savedRoom.roomCode, false);
        if (!restored || !restored.players[player.id] || restored.phase === 'game_over') {
          await clearRoomRecovery();
          setRecoveryCode(null);
          setRecoveryRoom(null);
          setRecoveryStatus('none');
          if (restored?.phase === 'game_over') {
            setError('Önceki maç tamamlandı. Yeni bir oyun başlatabilir veya odaya katılabilirsin.');
          }
          return;
        }
        setRecoveryRoom(restored);
        setRecoveryStatus('available');
      } catch (restoreError) {
        const code = (restoreError as { code?: string })?.code;
        if (code === 'ROOM_MEMBERSHIP_INVALID') {
          await clearRoomRecovery();
          setRecoveryCode(null);
          setRecoveryRoom(null);
          setRecoveryStatus('none');
        } else {
          setError(restoreError instanceof Error ? restoreError.message : 'Oyun durumu yenilenemedi.');
          setRecoveryStatus('available');
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setConnection('error');
      setAuthStatus(isLive ? 'signed_out' : 'signed_in');
      setRecoveryCode(null);
      setRecoveryStatus('none');
    }
    })();
    try {
      await initFlight.current;
    } finally {
      initCompleted.current = true;
      initFlight.current = null;
      setIsInitialized(true);
    }
  }, [service, isLive]);

  useEffect(() => {
    void init();
  }, [init]);

  const setCurrentPlayer = useCallback((player: Player | null) => {
    setPlayer(player);
    setAuthStatus(player ? 'signed_in' : (isLive ? 'signed_out' : 'signed_in'));
  }, [isLive]);

  const refreshRoom = useCallback(async () => {
    if (!roomCode) return;
    const snap = await service.getRoomState(roomCode);
    applyRoomState(snap);
  }, [roomCode, service, applyRoomState]);

  // Keep expiry/recovery alive even after the player leaves the question screen.
  useEffect(() => {
    if (!isLive || !roomCode) return;
    return startRoomSync({
      readState: () => service.getRoomState(roomCode),
      applyState: applyRoomState,
      advanceExpired: () => service.advanceExpiredPhase(roomCode),
      now: getServerNowMs,
      onError: (cause) => {
        if ((cause as { code?: string })?.code === 'ROOM_MEMBERSHIP_INVALID') {
          updateRoomCode(null);
          applyRoomState(null);
        } else {
          setError(cause instanceof Error ? cause.message : 'Oyun durumu yenilenemedi; tekrar deneniyor.');
        }
      },
    });
  }, [roomCode, isLive, service, applyRoomState, updateRoomCode]);

  const continueSavedRoom = useCallback(async () => {
    if (!recoveryCode || !currentPlayer) {
      throw new Error('Devam edilecek kayıtlı oyun bulunamadı.');
    }
    let state: GameState | null;
    try {
      state = await service.restoreRoom(recoveryCode);
    } catch (cause) {
      if ((cause as { code?: string })?.code === 'ROOM_MEMBERSHIP_INVALID') {
        await clearRoomRecovery();
        setRecoveryCode(null);
        setRecoveryRoom(null);
        setRecoveryStatus('none');
        throw new Error('Bu oyuna artık erişilemiyor. Yeni bir oda oluşturabilir veya katılabilirsin.');
      }
      throw cause;
    }
    if (!state || !state.players[currentPlayer.id] || state.phase === 'game_over') {
      await clearRoomRecovery();
      setRecoveryCode(null);
      setRecoveryRoom(null);
      setRecoveryStatus('none');
      throw new Error('Bu oyuna artık devam edilemiyor. Yeni bir oda oluşturabilir veya katılabilirsin.');
    }
    updateRoomCode(state.config.code);
    applyRoomState(state);
    setRecoveryCode(null);
    setRecoveryRoom(null);
    setRecoveryStatus('none');
    return state;
  }, [applyRoomState, currentPlayer, recoveryCode, service, updateRoomCode]);

  const dismissRecoveryOffer = useCallback(() => {
    setRecoveryCode(null);
    setRecoveryRoom(null);
    setRecoveryStatus('none');
  }, []);

  const value = useMemo<GameStoreValue>(
    () => ({
      service,
      isLive,
      isInitialized,
      authStatus,
      isAnonymous,
      currentPlayer,
      connection,
      roomCode,
      roomState,
      lastNudge,
      error,
      recoveryStatus,
      recoveryCode,
      recoveryRoom,
      init,
      setCurrentPlayer,
      setRoomCode: updateRoomCode,
      setRoomState: applyRoomState,
      setError,
      refreshRoom,
      continueSavedRoom,
      dismissRecoveryOffer,
    }),
    [service, isLive, isInitialized, authStatus, isAnonymous, currentPlayer, connection, roomCode, roomState, lastNudge, error, recoveryStatus, recoveryCode, recoveryRoom, init, setCurrentPlayer, updateRoomCode, applyRoomState, refreshRoom, continueSavedRoom, dismissRecoveryOffer]
  );

  return <GameStoreContext.Provider value={value}>{children}</GameStoreContext.Provider>;
}

export function useGameStore() {
  const ctx = useContext(GameStoreContext);
  if (!ctx) throw new Error('useGameStore must be used within GameStoreProvider');
  return ctx;
}
