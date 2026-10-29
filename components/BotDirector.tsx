import { isPartyMode } from '@/features/party/catalog';
import { useEffect, useMemo } from 'react';
import { useGameStore } from '@/store/gameStore';
import { ensureSupabase } from '@/lib/supabase/client';

import { startBotPhase, type TestBot } from '@/services/botAutomation';
import { getServerNowMs } from '@/services/serverClock';

const BOT_PHASES = new Set(['ability_select', 'fake_answer', 'guess']);
const UNSUPPORTED_AUTOMATION_MODES = new Set(['gizli_tilki', 'orman_hazinesi', 'double_trap']);

function delayFor(personality: TestBot['personality'], phase: string) {
  const ranges = personality === 'scholar'
    ? [1700, 4300]
    : personality === 'trickster'
      ? [900, 3900]
      : [1300, 4800];
  const phaseBias = phase === 'guess' ? 350 : phase === 'fake_answer' ? 650 : 150;
  return Math.round(ranges[0] + Math.random() * (ranges[1] - ranges[0]) + phaseBias);
}

export function BotDirector() {
  const { roomCode, roomState, currentPlayer, service, refreshRoom } = useGameStore();
  const me = useMemo(() => {
    if (!currentPlayer || !roomState) return null;
    return roomState.players[currentPlayer.id] ?? currentPlayer;
  }, [currentPlayer, roomState]);

  const mode = roomState?.config.gameMode ?? 'classic';
  const automationSupported = !isPartyMode(mode) && !UNSUPPORTED_AUTOMATION_MODES.has(mode);
  const isHost = !!me?.isHost;
  const isLiveSupabase = service.kind === 'supabase';
  const currentRound = roomState?.currentRound;
  const phase = roomState?.phase;

  const phaseStartedAt = roomState?.phaseStartedAt;
  const deadline = roomState?.phaseDeadlineAt;
  const paused = roomState?.pausedAt != null;

  useEffect(() => {
    if (!roomCode || !currentRound || !phase || !isHost || !isLiveSupabase || !automationSupported || paused || !BOT_PHASES.has(phase)) return;
    const sb = ensureSupabase();
    return startBotPhase({
      loadBots: async () => {
        const { data, error } = await sb.rpc('list_test_bots_secure', { p_room_code: roomCode });
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Bot listesi alınamadı.');
        return data as TestBot[];
      },
      takeTurn: async (botId) => {
        const { error } = await sb.rpc('bot_take_turn_secure', {
          p_room_code: roomCode,
          p_bot_id: botId,
        });
        if (error) throw error;
        await refreshRoom();
      },
      delayFor: (bot) => {
        const preferred = delayFor(bot.personality ?? 'balanced', phase);
        // Leave room for a retry, especially in seven-second Blitz rounds.
        return deadline == null ? preferred : Math.min(preferred, Math.max(0, (deadline - getServerNowMs() - 300) / 2));
      },
      isExpired: () => deadline != null && getServerNowMs() >= deadline,
      onError: (error) => console.warn('[BotDirector] Bot hamlesi tamamlanamadı:', error),
    });
  }, [roomCode, currentRound, phase, phaseStartedAt, deadline, paused, isHost, isLiveSupabase, automationSupported, refreshRoom]);

  return null;
}
