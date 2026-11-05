import type { ArcadeGameMode } from './catalog';

export type ArcadePhase = 'lobby' | 'play' | 'draw' | 'guess' | 'aim' | 'finished';

export interface ArcadePlayer {
  id: string;
  name: string;
  avatarKey: string;
  isBot: boolean;
  isHost: boolean;
  submitted: boolean;
  score: number;
  team?: number;
}

export interface ArcadeState {
  mode: ArcadeGameMode;
  phase: ArcadePhase;
  step: number;
  stateVersion: number;
  deadline: string | null;
  isHost: boolean;
  canAct: boolean;
  currentPlayerId: string | null;
  public: Record<string, unknown>;
  me: Record<string, unknown>;
  players: ArcadePlayer[];
  winnerIds: string[];
  result: string | null;
}

export type ArcadeAction = Record<string, unknown> & { action: string };
