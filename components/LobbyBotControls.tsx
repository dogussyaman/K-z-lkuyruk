import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bot, Plus, Sparkles } from 'lucide-react-native';
import { useGameStore } from '@/store/gameStore';
import { ensureSupabase } from '@/lib/supabase/client';

const UNSUPPORTED_BOT_MODES = new Set(['gizli_tilki', 'double_trap']);

export function LobbyBotControls() {
  const { roomCode, roomState, currentPlayer, service, setRoomState } = useGameStore();
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  if (!roomCode || !roomState || roomState.phase !== 'lobby' || service.kind !== 'supabase') return null;

  const me = currentPlayer ? roomState.players[currentPlayer.id] ?? currentPlayer : null;
  if (!me?.isHost) return null;

  const activePlayers = Object.values(roomState.players).filter((player) => player.isOnline);
  const roomFull = activePlayers.length >= roomState.config.maxPlayers;
  const isModeUnsupported = roomState.config.gameMode
    ? UNSUPPORTED_BOT_MODES.has(roomState.config.gameMode)
    : false;

  const addBot = async () => {
    if (adding || roomFull || isModeUnsupported) return;
    setAdding(true);
    setFeedback(null);
    try {
      const { data, error } = await ensureSupabase().rpc('add_test_bot_secure', {
        p_room_code: roomCode,
        p_personality: null,
      });
      if (error) {
        setFeedback({ message: error.message || 'Bot eklenemedi', isError: true });
        return;
      }

      const bot = Array.isArray(data) ? data[0] as { bot_name?: string } | undefined : undefined;
      const freshState = await service.getRoomState(roomCode);
      setRoomState(freshState);
      setFeedback({
        message: bot?.bot_name ? `${bot.bot_name} hazır olarak katıldı` : 'Bot hazır olarak katıldı',
        isError: false,
      });
    } catch (cause: any) {
      const errMsg = cause?.message || (cause instanceof Error ? cause.message : null) || 'Bot eklenemedi';
      setFeedback({ message: errMsg, isError: true });
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <View style={styles.iconWrap}>
            <Bot size={18} color="#A9FFB6" strokeWidth={2.5} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title}>Test Botları</Text>
            <Text style={styles.subtitle}>
              {isModeUnsupported
                ? 'Bu oyun modu test botlarını henüz desteklemiyor.'
                : 'Tek başına test etmek için hazır oyuncu ekle.'}
            </Text>
          </View>
        </View>
        {feedback?.message ? (
          <Text style={[styles.message, feedback.isError && styles.errorMessage]}>
            {feedback.message}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => void addBot()}
        disabled={adding || roomFull || isModeUnsupported}
        accessibilityRole="button"
        accessibilityLabel="Hazır test botu ekle"
        style={({ pressed }) => [
          styles.button,
          pressed && !adding && !roomFull && !isModeUnsupported && styles.pressed,
          (roomFull || isModeUnsupported) && styles.disabled,
        ]}
      >
        {adding ? (
          <ActivityIndicator size="small" color="#102016" />
        ) : (
          <>
            <Plus size={16} color="#102016" strokeWidth={3} />
            <Text style={styles.buttonText}>
              {roomFull ? 'Oda Dolu' : isModeUnsupported ? 'Mod Desteklenmiyor' : 'Bot Ekle'}
            </Text>
          </>
        )}
      </Pressable>

      {!roomFull && !isModeUnsupported ? (
        <View style={styles.readyHint}>
          <Sparkles size={11} color="#A9FFB6" />
          <Text style={styles.readyHintText}>Eklenen bot doğrudan HAZIR olur</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(124,255,146,0.30)',
    backgroundColor: 'rgba(32,63,42,0.42)',
    padding: 13,
    gap: 10,
  },
  copy: { gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(124,255,146,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { color: '#FFF', fontFamily: 'Poppins-Bold', fontSize: 14 },
  subtitle: { color: 'rgba(255,255,255,0.58)', fontFamily: 'Poppins-Regular', fontSize: 10, lineHeight: 15 },
  message: { color: '#A9FFB6', fontFamily: 'Poppins-SemiBold', fontSize: 11, marginLeft: 48 },
  errorMessage: { color: '#FFAAA6' },
  button: {
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: '#7CFF92',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  buttonText: { color: '#102016', fontFamily: 'Poppins-Bold', fontSize: 13 },
  readyHint: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 },
  readyHintText: { color: 'rgba(255,255,255,0.54)', fontFamily: 'Poppins-Medium', fontSize: 9 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
