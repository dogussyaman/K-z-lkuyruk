import { ensureSupabase } from '@/lib/supabase/client';
import type { ArcadeAction, ArcadeState } from './types';
import type { ArcadeGameMode } from './catalog';

export async function getArcadeState(roomCode: string): Promise<ArcadeState | null> {
  const { data, error } = await ensureSupabase().rpc('arcade_state_secure', {
    p_room_code: roomCode,
  });
  if (error) throw error;
  return data ? (data as ArcadeState) : null;
}

export async function startArcadeGame(roomCode: string, mode: ArcadeGameMode): Promise<void> {
  const { error } = await ensureSupabase().rpc('arcade_start_secure', {
    p_room_code: roomCode,
    p_expected_mode: mode,
  });
  if (error) throw error;
}

export async function submitArcadeAction(roomCode: string, action: ArcadeAction): Promise<void> {
  const { error } = await ensureSupabase().rpc('arcade_action_secure', {
    p_room_code: roomCode,
    p_step: Number(action.step ?? -1),
    p_payload: action,
  });
  if (error) throw error;
}

export async function advanceArcadeGame(roomCode: string, step: number): Promise<void> {
  const { error } = await ensureSupabase().rpc('arcade_advance_secure', {
    p_room_code: roomCode,
    p_step: step,
  });
  if (error) throw error;
}
