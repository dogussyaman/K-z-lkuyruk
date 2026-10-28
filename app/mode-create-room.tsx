import { goBackOrReplace } from '@/lib/backNavigation';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, Clock3, Gamepad2, Sparkles, Users } from 'lucide-react-native';
import { gameModeImages } from '../assets/game-modes';
import { CATEGORIES } from '../features/game/categories';
import { GAME_MODES, getGameMode } from '../features/game/modes';
import { getGameModeTheme } from '../features/game/themes';
import { useGameStore } from '../store/gameStore';
import type { GameMode } from '../types/game';

const CALLOUTS: Partial<Record<GameMode, string>> = {
  gizli_tilki: '4–10 oyuncu gerekir. Gizli roller, ortak operasyon ekibi ve kaynak yönetimiyle sabotajcıları bulmaya çalış; oda açıldıktan sonra herkes hazır olunca ev sahibi başlatır.',
  orman_hazinesi: '4–10 oyuncu. Soru-cevap yok: iki takım sırayla keşif hamlesi yapar, erzak toplar, harita parçalarını bulur ve ekipman kullanarak engelleri aşar. İlk hazineyi bulan kazanır; rakip takım da son ana kadar yarışta kalır.',
  team_battle: 'Takımlar maç başlarken güvenli biçimde otomatik dengelenir. Dost tuzakları puan kazandırmaz.',
  secret_missions: 'Gizli görev yalnız sana gösterilir; maç boyunca davranışına göre ekstra bonus kazanırsın.',
  double_trap: 'Her oyuncunun normal blöfüne ek olarak sunucu ikinci bir gölge tuzak üretir.',
  golden_question: 'Her 3. tur Altın Tur olur. Doğru cevap puanı x3 değerindedir.',
  detective_fox: 'Dedektif rolü her tur sıradaki oyuncuya geçer. Başarılı blöfçüyü bulursan +2.',
  blitz: 'Sadece 7 saniyen var. İlk 3 saniyede doğru cevap ekstra hız puanı getirir.',
  survival: '3 canla başlarsın. Yanlış cevap veya süre aşımı bir can götürür.',
  suspicious: 'Doğru cevabın yanında başarılı blöfçüyü de tahmin ederek dedektif bonusu kazan.',
};

export default function ModeCreateRoomScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { currentPlayer, service, setRoomCode, setRoomState } = useGameStore();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = useMemo(() => {
    const requested = Array.isArray(params.mode) ? params.mode[0] : params.mode;
    return getGameMode(GAME_MODES.some((item) => item.id === requested) ? requested : 'classic');
  }, [params.mode]);
  const theme = getGameModeTheme(mode.id);
  const categories = CATEGORIES.map((category) => category.id);

  const createRoom = async () => {
    if (!currentPlayer) {
      router.replace('/onboarding');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await service.createRoom({
        hostName: currentPlayer.name,
        avatarKey: currentPlayer.avatarKey,
        totalRounds: mode.rules.defaultRounds,
        roundSeconds: mode.rules.defaultRoundSeconds,
        categories: [...categories],
        gameMode: mode.id,
      });
      setRoomCode(result.code);
      const state = await service.getRoomState(result.code);
      setRoomState(state);
      router.replace('/lobby');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Oda oluşturulamadı.');
      setCreating(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <LinearGradient pointerEvents="none" colors={[theme.background, theme.surface, theme.background]} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.glow, { backgroundColor: theme.glow }]} />
      <ScrollView
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Geri dön" hitSlop={12} onPress={() => goBackOrReplace(router, '/game-modes')} style={styles.iconButton}><ChevronLeft color="#FFF" size={22} /></Pressable>
          <Text style={styles.topTitle}>Oyun Modu</Text>
          <View style={styles.iconButton}><Gamepad2 color={theme.accent} size={20} /></View>
        </View>

        <View style={[styles.hero, { borderColor: theme.accent }]}>
          <Image source={gameModeImages[mode.illustrationKey]} style={styles.heroImage} resizeMode="cover" />
          <LinearGradient colors={['transparent', theme.background]} style={styles.heroShade} />
          <View style={styles.heroText}>
            <Text style={[styles.badge, { color: theme.accent }]}>{mode.badge}</Text>
            <Text style={styles.title}>{mode.name}</Text>
            <Text style={styles.tagline}>{mode.tagline}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Stat icon={<Users color={theme.accent} size={17} />} label={mode.playerCountLabel} />
          <Stat icon={<Clock3 color={theme.accentSecondary} size={17} />} label={mode.estimatedDurationLabel} />
          <Stat icon={<Sparkles color={theme.accent} size={17} />} label={`${mode.rules.defaultRounds} tur`} />
        </View>

        <View style={[styles.panel, { borderColor: theme.glow }]}>
          <Text style={styles.panelTitle}>{theme.lobbyTitle}</Text>
          <Text style={styles.description}>{mode.description}</Text>
          {mode.features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <View style={[styles.dot, { backgroundColor: theme.accent }]} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {CALLOUTS[mode.id] ? (
          <View style={[styles.callout, { backgroundColor: theme.glow, borderColor: theme.accent }]}>
            <Text style={[styles.calloutTitle, { color: theme.accent }]}>Bu modun farkı</Text>
            <Text style={styles.calloutText}>{CALLOUTS[mode.id]}</Text>
          </View>
        ) : null}

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>{mode.rules.defaultRoundSeconds} sn / tur</Text>
          <Text style={styles.summaryText}>{categories.length} kategori</Text>
          <Text style={styles.summaryText}>{mode.difficultyLabel}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={creating} onPress={() => void createRoom()} style={({ pressed }) => [styles.createButton, { backgroundColor: theme.accent }, (pressed || creating) && styles.pressed]}>
          {creating ? <ActivityIndicator color="#FFF" /> : <><Text style={styles.createText}>{theme.heroEmoji} {mode.name} Odası Aç</Text><Text style={styles.createSub}>Varsayılan mod ayarlarıyla hemen başla</Text></>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Stat({ icon, label }: { icon: ReactNode; label: string }) {
  return <View style={styles.stat}><View>{icon}</View><Text style={styles.statText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollView: { flex: 1 },
  content: { flexGrow: 1, padding: 18, paddingTop: 54, paddingBottom: 42, gap: 16 },
  glow: { position: 'absolute', width: 340, height: 340, borderRadius: 999, top: -150, right: -130 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  topTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  hero: { height: 300, overflow: 'hidden', borderRadius: 30, borderWidth: 1.2, backgroundColor: 'rgba(255,255,255,0.05)' },
  heroImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  heroShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  heroText: { position: 'absolute', left: 22, right: 22, bottom: 22 },
  badge: { fontSize: 12, fontWeight: '900', letterSpacing: 1.6, marginBottom: 6 },
  title: { color: '#FFF', fontSize: 31, fontWeight: '900' },
  tagline: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 20, marginTop: 5 },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minHeight: 74, borderRadius: 20, padding: 11, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', gap: 7 },
  statText: { color: '#FFF', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  panel: { borderRadius: 24, padding: 19, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.055)' },
  panelTitle: { color: '#FFF', fontSize: 19, fontWeight: '900', marginBottom: 7 },
  description: { color: 'rgba(255,255,255,0.68)', lineHeight: 20, fontSize: 13, marginBottom: 15 },
  featureRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 9 },
  dot: { width: 7, height: 7, borderRadius: 99 },
  featureText: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '600', flex: 1 },
  callout: { borderWidth: 1, padding: 17, borderRadius: 22 },
  calloutTitle: { fontWeight: '900', fontSize: 13, marginBottom: 5 },
  calloutText: { color: '#FFF', lineHeight: 19, fontSize: 13 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  summaryText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700' },
  error: { color: '#FF9A9A', textAlign: 'center', fontWeight: '700' },
  createButton: { minHeight: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  createText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  createSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
