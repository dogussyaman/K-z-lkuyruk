import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bot, Plus, Sparkles } from 'lucide-react-native';
import { usePathname } from 'expo-router';
import { useGameStore } from '@/store/gameStore';
import { ensureSupabase } from '@/lib/supabase/client';

interface BotRow {
  player_id: string;
  personality: 'scholar' | 'balanced' | 'trickster';
}

const BOT_PHASES = new Set(['ability_select', 'fake_answer', 'guess']);
const UNSUPPORTED_MODES = new Set(['gizli_tilki', 'orman_hazinesi']);

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
  const pathname = usePathname();
  const { roomCode, roomState, currentPlayer, service } = useGameStore();
  const scheduledKeyRef = useRef<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const me = useMemo(() => {
    if (!currentPlayer || !roomState) return null;
    return roomState.players[currentPlayer.id] ?? currentPlayer;
  }, [currentPlayer, roomState]);

  const mode = roomState?.config.gameMode ?? 'classic';
  const supported = !UNSUPPORTED_MODES.has(mode);
  const isHost = !!me?.isHost;
  const isLiveSupabase = service.kind === 'supabase';
  const isLobby = pathname === '/lobby';
  const activeCount = roomState ? Object.values(roomState.players).filter((player) => player.isOnline).length : 0;
  const roomFull = !!roomState && activeCount >= roomState.config.maxPlayers;

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    if (!roomCode || !roomState || !isHost || !isLiveSupabase || !supported || !BOT_PHASES.has(roomState.phase)) {
      scheduledKeyRef.current = null;
      return;
    }

    const phaseKey = `${roomCode}:${roomState.currentRound}:${roomState.phase}`;
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
        }, delayFor(row.personality ?? 'balanced', roomState.phase));
        timersRef.current.push(timer);
      }
    };

    void scheduleBots();
    return () => {
      cancelled = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [roomCode, roomState?.currentRound, roomState?.phase, isHost, isLiveSupabase, supported]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2800);
    return () => clearTimeout(timer);
  }, [message]);

  const addBot = async () => {
    if (!roomCode || adding || roomFull || !supported) return;
    setAdding(true);
    setMessage(null);
    try {
      const { data, error } = await ensureSupabase().rpc('add_test_bot_secure', {
        p_room_code: roomCode,
        p_personality: null,
      });
      if (error) throw error;
      const bot = Array.isArray(data) ? data[0] as { bot_name?: string } | undefined : undefined;
      setMessage(bot?.bot_name ? `${bot.bot_name} odaya katıldı` : 'Bot odaya katıldı');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Bot eklenemedi');
    } finally {
      setAdding(false);
    }
  };

  if (!isLobby || !isHost || !isLiveSupabase) return null;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View style={styles.wrap}>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          onPress={() => void addBot()}
          disabled={adding || roomFull || !supported}
          style={({ pressed }) => [
            styles.button,
            (pressed || adding) && styles.pressed,
            (roomFull || !supported) && styles.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Test botu ekle"
        >
          <View style={styles.iconWrap}>
            {adding ? <ActivityIndicator size="small" color="#120D20" /> : <Bot size={18} color="#120D20" strokeWidth={2.6} />}
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{roomFull ? 'Oda dolu' : supported ? 'Bot Ekle' : 'Bot kapalı'}</Text>
              {supported && !roomFull ? <Plus size={14} color="#FFF" strokeWidth={3} /> : null}
            </View>
            <View style={styles.subRow}>
              <Sparkles size={11} color="#F5D6FF" />
              <Text style={styles.sub}>İnsan gibi test oyuncusu</Text>
            </View>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 999,
  },
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: 112,
    alignItems: 'flex-end',
    gap: 8,
  },
  message: {
    maxWidth: 250,
    color: '#FFF',
    backgroundColor: 'rgba(18,13,32,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 11,
  },
  button: {
    minWidth: 166,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#7CFF92',
    borderRadius: 19,
    paddingHorizontal: 11,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  copy: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { color: '#120D20', fontFamily: 'Poppins-Bold', fontSize: 13 },
  subRow: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  sub: { color: '#38294A', fontFamily: 'Poppins-Medium', fontSize: 9 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.82 },
  disabled: { opacity: 0.45 },
});
