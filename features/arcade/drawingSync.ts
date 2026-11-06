import { ensureSupabase } from '@/lib/supabase/client';

export type DrawingStroke = number[][];
export type DrawingStrokes = DrawingStroke[];

export interface ArcadeDrawingDraft {
  step: number;
  playerId: string;
  sequence: number;
  strokes: DrawingStrokes;
}

function isDrawingStrokes(value: unknown): value is DrawingStrokes {
  return Array.isArray(value) && value.length <= 80 && value.every((stroke) =>
    Array.isArray(stroke) && stroke.every((point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
    ),
  );
}

function isArcadeDrawingDraft(value: unknown): value is ArcadeDrawingDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return Number.isInteger(draft.step) &&
    typeof draft.playerId === 'string' &&
    Number.isInteger(draft.sequence) &&
    isDrawingStrokes(draft.strokes);
}

export function subscribeToArcadeDrawingDraft(
  roomCode: string,
  onDraft: (draft: ArcadeDrawingDraft) => void,
  onError: (message: string) => void,
) {
  const supabase = ensureSupabase();
  const channel = supabase.channel(`arcade-drawing:${roomCode}`, {
    config: { broadcast: { self: false } },
  });
  let ready = false;
  let disposed = false;
  let sequence = 0;
  let lastSentAt = 0;
  let pending: ArcadeDrawingDraft | null = null;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    sendTimer = null;
    if (!ready || disposed || !pending) return;
    const draft = pending;
    pending = null;
    lastSentAt = Date.now();
    void channel.send({ type: 'broadcast', event: 'drawing-draft', payload: draft }).then((status) => {
      if (status !== 'ok' && !disposed) onError('Canlı çizim diğer oyunculara gönderilemedi.');
    }).catch((cause: unknown) => {
      if (!disposed) onError(cause instanceof Error ? cause.message : 'Canlı çizim gönderilemedi.');
    });
  };

  channel
    .on('broadcast', { event: 'drawing-draft' }, ({ payload }) => {
      if (isArcadeDrawingDraft(payload)) onDraft(payload);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ready = true;
        if (pending) flush();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError('Canlı çizim bağlantısı kurulamadı.');
      }
    });

  return {
    publish(step: number, playerId: string, strokes: DrawingStrokes) {
      sequence = Math.max(sequence + 1, Date.now());
      pending = { step, playerId, sequence, strokes };
      if (!ready || disposed || sendTimer) return;
      const delay = Math.max(0, 100 - (Date.now() - lastSentAt));
      if (delay === 0) flush();
      else sendTimer = setTimeout(flush, delay);
    },
    dispose() {
      disposed = true;
      ready = false;
      pending = null;
      if (sendTimer) clearTimeout(sendTimer);
      void supabase.removeChannel(channel);
    },
  };
}
