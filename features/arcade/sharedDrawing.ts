import type { ArcadeState } from './types';
import type { DrawingStrokes } from './drawingSync';
export type SharedDrawing = { step: number; strokes: DrawingStrokes; receivedAt: number };

// Viewing is room-wide. Team membership only controls submitting guesses.
export function selectSharedDrawing(state: ArcadeState, draft: DrawingStrokes, remote: SharedDrawing | null, now = Date.now()): DrawingStrokes {
  if (state.phase === 'draw' && state.canAct) return draft;
  if (state.phase === 'draw' && remote?.step === state.step && now - remote.receivedAt < 1500) return remote.strokes;
  return (state.public.strokes ?? state.me.strokes ?? []) as DrawingStrokes;
}
