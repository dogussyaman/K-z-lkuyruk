import type { GameState } from '../types/game';

const TIMED_PHASES = new Set(['ability_select', 'fake_answer', 'guess']);

interface RoomSyncOptions {
  readState: () => Promise<GameState | null>;
  applyState: (state: GameState | null) => void;
  advanceExpired: () => Promise<unknown>;
  now: () => number;
  onError: (error: unknown) => void;
  schedule?: (callback: () => void, interval: number) => ReturnType<typeof setInterval>;
  cancel?: (timer: ReturnType<typeof setInterval>) => void;
}

// Realtime is an optimization, not the only way a waiting client can progress.
// Inspect a fresh server snapshot before advancing: a cached deadline may belong
// to the preceding phase, or the host may have paused the room elsewhere.
export function startRoomSync({
  readState, applyState, advanceExpired, now, onError,
  schedule = setInterval, cancel = clearInterval,
}: RoomSyncOptions): () => void {
  let stopped = false;
  let inFlight = false;
  const sync = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const state = await readState();
      if (stopped) return;
      applyState(state);
      if (state && TIMED_PHASES.has(state.phase) && state.pausedAt == null
        && state.phaseDeadlineAt != null && state.phaseDeadlineAt <= now()) {
        await advanceExpired();
        if (stopped) return;
        const next = await readState();
        if (!stopped) applyState(next);
      }
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      inFlight = false;
    }
  };
  const timer = schedule(() => { void sync(); }, 2000);
  void sync();
  return () => { stopped = true; cancel(timer); };
}

export function selectRoomSnapshot(previous: GameState | null, next: GameState | null): GameState | null {
  if (next && previous?.config.code === next.config.code && previous.stateVersion !== undefined
    && (next.stateVersion === undefined || next.stateVersion < previous.stateVersion)) return previous;
  return next;
}

type WaitingDestination = '/ability-select' | '/question' | '/result' | '/scoreboard' | '/game-over' | '/lobby';

export function getLiveWaitingDestination(state: GameState, playerId: string): WaitingDestination | null {
  if (state.phase === 'ability_select') return '/ability-select';
  if (state.phase === 'fake_answer' || state.phase === 'guess') {
    return state.progress?.submissionStatus[playerId] ? null : '/question';
  }
  const routes: Partial<Record<GameState['phase'], WaitingDestination>> = {
    reveal: '/result', scoreboard: '/scoreboard', game_over: '/game-over', lobby: '/lobby',
  };
  return routes[state.phase] ?? null;
}
