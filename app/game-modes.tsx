import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, Clock3, Flame, Gamepad2, Sparkles, Users } from 'lucide-react-native';
import { gameModeImages } from '../assets/game-modes';
import { GAME_MODES, type GameModeDefinition } from '../features/game/modes';
import { getGameModeTheme } from '../features/game/themes';

type FilterId = 'all' | 'fast' | 'competitive' | 'social' | 'chaos';

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'Tümü' },
  { id: 'fast', label: 'Hızlı' },
  { id: 'competitive', label: 'Rekabetçi' },
  { id: 'social', label: 'Sosyal' },
  { id: 'chaos', label: 'Kaos' },
];

const GROUPS: Record<Exclude<FilterId, 'all'>, string[]> = {
  fast: ['blitz', 'golden_question'],
  competitive: ['survival', 'blitz', 'team_battle', 'golden_question'],
  social: ['suspicious', 'secret_missions', 'detective_fox', 'team_battle'],
  chaos: ['double_trap', 'golden_question', 'suspicious'],
};

export default function GameModesScreen() {
  const [filter, setFilter] = useState<FilterId>('all');
  const visible = useMemo(() => filter === 'all' ? GAME_MODES : GAME_MODES.filter((mode) => GROUPS[filter].includes(mode.id)), [filter]);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#100B18', '#191026', '#0D111B']} style={StyleSheet.absoluteFill} />
      <View style={styles.orangeGlow} />
      <View style={styles.blueGlow} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}><ChevronLeft color="#FFF" size={22} /></Pressable>
          <View style={styles.topCenter}><Text style={styles.eyebrow}>KIZILKUYRUK EVRENİ</Text><Text style={styles.headerTitle}>Oyun Modları</Text></View>
          <View style={styles.playablePill}><Flame color="#FF7A45" size={14} /><Text style={styles.playableText}>9 OYNANABİLİR</Text></View>
        </View>

        <View style={styles.hero}>
          <LinearGradient colors={['rgba(255,101,77,0.32)', 'rgba(53,184,255,0.20)', 'rgba(16,11,24,0.86)']} style={StyleSheet.absoluteFill} />
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>9 FARKLI OYUN STİLİ</Text>
            <Text style={styles.heroTitle}>Her gece başka bir oyun.</Text>
            <Text style={styles.heroText}>Blöf, hayatta kalma, takım savaşı, gizli görev, dedektiflik, hız ve kaos aynı parti evreninde.</Text>
          </View>
          <Text style={styles.heroFox}>🦊</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((item) => (
            <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.filterActive]}>
              <Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>{filter === 'all' ? 'Tüm Modlar' : FILTERS.find((item) => item.id === filter)?.label}</Text><Text style={styles.sectionSub}>{visible.length} oyun modu</Text></View>
          <Gamepad2 color="rgba(255,255,255,0.34)" size={22} />
        </View>

        <View style={styles.grid}>
          {visible.map((mode) => <ModeCard key={mode.id} mode={mode} />)}
        </View>
      </ScrollView>
    </View>
  );
}

function ModeCard({ mode }: { mode: GameModeDefinition }) {
  const theme = getGameModeTheme(mode.id);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/mode-create-room', params: { mode: mode.id } })}
      style={({ pressed }) => [styles.card, { borderColor: theme.glow }, pressed && styles.cardPressed]}
    >
      <View style={styles.imageWrap}>
        <Image source={gameModeImages[mode.illustrationKey]} style={styles.image} resizeMode="cover" />
        <LinearGradient colors={['transparent', theme.background]} style={StyleSheet.absoluteFill} />
        <View style={[styles.badge, { backgroundColor: theme.accent }]}><Text style={styles.badgeText}>{mode.badge}</Text></View>
        <Text style={styles.atmosphereEmoji}>{theme.heroEmoji}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{mode.name}</Text>
        <Text style={[styles.cardTagline, { color: theme.accent }]} numberOfLines={2}>{mode.tagline}</Text>
        <Text style={styles.cardDescription} numberOfLines={3}>{mode.description}</Text>
        <View style={styles.metaRow}>
          <Meta icon={<Users color="rgba(255,255,255,0.62)" size={14} />} text={mode.playerCountLabel.replace(' Oyuncu', '')} />
          <Meta icon={<Clock3 color="rgba(255,255,255,0.62)" size={14} />} text={mode.estimatedDurationLabel} />
          <Meta icon={<Sparkles color="rgba(255,255,255,0.62)" size={14} />} text={mode.difficultyLabel} />
        </View>
        <View style={[styles.playButton, { backgroundColor: theme.accent }]}><Text style={styles.playButtonText}>Bu Modu Oyna</Text></View>
      </View>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <View style={styles.meta}><View>{icon}</View><Text style={styles.metaText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#100B18' },
  content: { paddingHorizontal: 16, paddingTop: 54, paddingBottom: 52 },
  orangeGlow: { position: 'absolute', width: 360, height: 360, borderRadius: 999, backgroundColor: 'rgba(255,101,77,0.12)', top: -170, left: -140 },
  blueGlow: { position: 'absolute', width: 350, height: 350, borderRadius: 999, backgroundColor: 'rgba(53,184,255,0.10)', top: 220, right: -220 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  topCenter: { alignItems: 'center' },
  eyebrow: { color: '#FF7A45', fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  headerTitle: { color: '#FFF', fontSize: 19, fontWeight: '900', marginTop: 2 },
  playablePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,122,69,0.10)', borderRadius: 14, paddingHorizontal: 9, height: 34 },
  playableText: { color: '#FF9A6F', fontSize: 9, fontWeight: '900' },
  hero: { minHeight: 190, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 17, justifyContent: 'center' },
  heroCopy: { padding: 22, paddingRight: 104 },
  heroKicker: { color: '#FFD166', fontWeight: '900', letterSpacing: 1.5, fontSize: 10 },
  heroTitle: { color: '#FFF', fontSize: 26, lineHeight: 30, fontWeight: '900', marginTop: 7 },
  heroText: { color: 'rgba(255,255,255,0.67)', fontSize: 13, lineHeight: 19, marginTop: 8 },
  heroFox: { position: 'absolute', right: 20, bottom: 18, fontSize: 70, transform: [{ rotate: '-8deg' }] },
  filters: { gap: 8, paddingBottom: 18 },
  filter: { paddingHorizontal: 15, height: 38, borderRadius: 14, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.055)' },
  filterActive: { backgroundColor: '#FFF' },
  filterText: { color: 'rgba(255,255,255,0.62)', fontWeight: '800', fontSize: 12 },
  filterTextActive: { color: '#17101F' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  sectionSub: { color: 'rgba(255,255,255,0.42)', fontSize: 11, marginTop: 2 },
  grid: { gap: 14 },
  card: { borderRadius: 26, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1 },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  imageWrap: { height: 180, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 13, left: 13, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  atmosphereEmoji: { position: 'absolute', right: 14, top: 12, fontSize: 30 },
  cardBody: { padding: 17 },
  cardTitle: { color: '#FFF', fontSize: 21, fontWeight: '900' },
  cardTagline: { fontSize: 12, fontWeight: '800', marginTop: 4 },
  cardDescription: { color: 'rgba(255,255,255,0.60)', fontSize: 12, lineHeight: 18, marginTop: 8 },
  metaRow: { flexDirection: 'row', gap: 7, marginTop: 14 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.055)' },
  metaText: { color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: '700' },
  playButton: { minHeight: 46, marginTop: 15, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  playButtonText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
});
