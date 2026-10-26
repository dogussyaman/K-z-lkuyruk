import { useEffect, useMemo, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { ensureSupabase } from '@/lib/supabase/client';

interface BotRow {
  player_id: string;
  personality: 'scholar' | 'balanced' | 'trickster';
}

const BOT_PHASES = new Set(['ability_select', 'fake_answer', 'guess']);
const UNSUPPORTED_AUTOMATION_MODES = new Set(['gizli_tilki', 'orman_hazinesi', 'double_trap']);

function delayFor(personality: BotRow['personality'], phase: string) {
  const ranges = personality === 'scholar'
    ? [1700, 4300]
    : personality === 'trickster'
      ? [900, 3900]
      : [1300, 4800];
  const phaseBias = phase === 'guess' ? 350 : phase === 'fake_answer' ? 650 : 150;
  return Math.round(ranges[0] + Math.random() * (ranges[1] - ranges[0]) + phaseBias);
}

export function BotDirector() {
  const { roomCode, roomState, currentPlayer, service } = useGameStore();
  const scheduledKeyRef = useRef<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const me = useMemo(() => {
    if (!currentPlayer || !roomState) return null;
    return roomState.players[currentPlayer.id] ?? currentPlayer;
  }, [currentPlayer, roomState]);

  const mode = roomState?.config.gameMode ?? 'classic';
  const automationSupported = !UNSUPPORTED_AUTOMATION_MODES.has(mode);
  const isHost = !!me?.isHost;
  const isLiveSupabase = service.kind === 'supabase';
  const currentRound = roomState?.currentRound;
  const phase = roomState?.phase;

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    if (!roomCode || !currentRound || !phase || !isHost || !isLiveSupabase || !automationSupported || !BOT_PHASES.has(phase)) {
      scheduledKeyRef.current = null;
      return;
    }

    const phaseKey = `${roomCode}:${currentRound}:${phase}`;
    if (scheduledKeyRef.current === phaseKey) return;
    scheduledKeyRef.current = phaseKey;

    let cancelled = false;
    const scheduleBots = async () => {
      const { data, error } = await ensureSupabase().rpc('list_test_bots_secure', { p_room_code: roomCode });
      if (cancelled || error || !Array.isArray(data)) return;

      for (const row of data as BotRow[]) {
        const timer = setTimeout(() => {
          if (cancelled) return;
          void ensureSupabase().rpc('bot_take_turn_secure', {
            p_room_code: roomCode,
            p_bot_id: row.player_id,
          });
        }, delayFor(row.personality ?? 'balanced', phase));
        timersRef.current.push(timer);
      }
    };

    void scheduleBots();
    return () => {
      cancelled = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [roomCode, currentRound, phase, isHost, isLiveSupabase, automationSupported]);

  return null;
}
