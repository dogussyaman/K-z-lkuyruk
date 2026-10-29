import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft, ArrowUpRight } from 'lucide-react-native';
import { FEATURED_GAMES } from '@/features/game/modes';
import { getGameModeTheme } from '@/features/game/themes';
import { goBackOrReplace } from '@/lib/backNavigation';
const groups = [
  ['all', 'Hepsi'],
  ['bluff', 'Blöf'],
  ['coop', 'İş birliği'],
  ['social', 'Gizli roller'],
  ['market', 'Pazarlık'],
] as const;
const ids: Record<string, string[]> = {
  bluff: ['classic', 'tilki_soygunu', 'kayip_kare'],
  coop: ['kilit_altinda'],
  social: ['kizil_pakt'],
  market: ['gece_pazari'],
};
export default function GameModesScreen() {
  const [filter, setFilter] = useState('all');
  const games = FEATURED_GAMES.filter(
    (g) => filter === 'all' || ids[filter]?.includes(g.id),
  );
  return (
    <View style={s.root}>
      <LinearGradient
        pointerEvents="none"
        colors={['#20162F', '#10151F', '#18101E']}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.top}>
          <Pressable
            accessibilityLabel="Geri dön"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => goBackOrReplace(router, '/(tabs)')}
          >
            <ChevronLeft color="#fff" />
          </Pressable>
          <Text style={s.eyebrow}>KIZILKUYRUK · OYUN EVRENİ</Text>
        </View>
        <Text style={s.title}>{'Aynı ekip.\nBaşka bir oyun.'}</Text>
        <Text style={s.lead}>
          Bir gece güvenini riske at. Bir gece birlikte kaç. Herkes kendi
          cihazında; aynı odada olmanız gerekmez.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filters}
        >
          {groups.map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setFilter(id)}
              style={[s.filter, filter === id && s.active]}
            >
              <Text style={s.text}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {games.map((g, i) => {
          const t = getGameModeTheme(g.id);
          return (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              onPress={() =>
                g.id === 'classic'
                  ? router.push('/create-room')
                  : router.push({
                      pathname: '/mode-create-room',
                      params: { mode: g.id },
                    })
              }
              style={({ pressed }) => [
                s.card,
                { backgroundColor: t.surface, borderColor: t.accent + '55' },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={s.row}>
                <Text style={[s.badge, { color: t.accent }]}>
                  {g.id === 'classic' ? 'BİLGİ & BLÖF · MAÇ AYARLARI' : g.badge}
                </Text>
                <ArrowUpRight size={21} color={t.accent} />
              </View>
              <View style={s.cardHeading}>
                <Text style={s.symbol}>{t.heroEmoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{g.name}</Text>
                  <Text style={[s.tag, { color: t.accent }]}>{g.tagline}</Text>
                </View>
              </View>
              <Text style={s.description}>
                {g.id === 'classic'
                  ? 'Klasik, hızlı, takım, can ve özel tur kurallarını tek yerden seç. Diğer oyunlardan bağımsız soru–blöf deneyimi.'
                  : g.description}
              </Text>
              <View style={s.row}>
                <Text style={s.meta}>
                  {g.playerCountLabel} · {g.estimatedDurationLabel}
                </Text>
                <Text style={[s.cta, { color: t.accent }]}>EKİBİ TOPLA →</Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/tilki-aramizda')}
          style={s.local}
        >
          <Text style={s.text}>
            Aynı yerde misiniz? Tek telefonla Tilki Aramızda ↗
          </Text>
          <Text style={s.small}>
            Yerel parti oyunu · çevrim içi oda gerektirmez
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#15101e' },
  content: {
    padding: 20,
    paddingTop: 54,
    paddingBottom: 50,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
    gap: 18,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  eyebrow: {
    color: '#c6b1dd',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
  },
  title: {
    color: '#fff',
    fontSize: 39,
    lineHeight: 43,
    fontWeight: '900',
    marginTop: 20,
  },
  lead: { color: '#c5bdcf', fontSize: 15, lineHeight: 23, maxWidth: 570 },
  filters: { gap: 8, paddingVertical: 8 },
  filter: {
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#ffffff25',
  },
  active: { backgroundColor: '#7049a0', borderColor: '#b998e4' },
  text: { color: '#eee7f6', fontSize: 12, fontWeight: '700' },
  card: { padding: 22, borderRadius: 27, borderWidth: 1, gap: 17 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  badge: { fontSize: 10, letterSpacing: 1, fontWeight: '900' },
  cardHeading: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  symbol: { fontSize: 46 },
  name: { color: '#fff', fontSize: 25, fontWeight: '900' },
  tag: { fontSize: 13, lineHeight: 19, marginTop: 5, fontWeight: '700' },
  description: { color: '#d7cedf', fontSize: 14, lineHeight: 22 },
  meta: { color: '#a99db7', fontSize: 11 },
  cta: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  local: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffffff20',
    gap: 7,
  },
  small: { color: '#9e92ad', fontSize: 11 },
});
