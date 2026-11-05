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
  const rpc = mode === 'drawing_chain' ? 'arcade_drawing_start_secure' : 'arcade_start_secure';
  const { error } = await ensureSupabase().rpc(rpc, {
    p_room_code: roomCode,
    p_expected_mode: mode,
  });
  if (error) throw error;
}

export async function submitArcadeAction(roomCode: string, action: ArcadeAction, mode?: ArcadeGameMode): Promise<void> {
  const rpc = mode === 'drawing_chain' ? 'arcade_drawing_action_secure' : 'arcade_action_secure';
  const { error } = await ensureSupabase().rpc(rpc, {
    p_room_code: roomCode,
    p_step: Number(action.step ?? -1),
    p_payload: action,
  });
  if (error) throw error;
}

export async function advanceArcadeGame(roomCode: string, step: number, mode?: ArcadeGameMode): Promise<void> {
  const rpc = mode === 'drawing_chain' ? 'arcade_drawing_advance_secure' : 'arcade_advance_secure';
  const { error } = await ensureSupabase().rpc(rpc, {
    p_room_code: roomCode,
    p_step: step,
  });
  if (error) throw error;
}
