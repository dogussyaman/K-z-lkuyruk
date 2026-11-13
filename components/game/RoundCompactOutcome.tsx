import { useWindowDimensions, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { Check, Crown, Gem, X } from 'lucide-react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { Avatar } from '@/components/ui/Avatar';
import type { Player } from '@/types/game';
import { describeRoundAwards, headlineForRound } from '@/features/game/roundAwards';
import type { RoundResultRow } from '@/types/game';

interface Props {
  trappedPlayers: Player[];
  trappedCount: number;
  correct: boolean;
  tricked: boolean;
  answered: boolean;
  result?: RoundResultRow;
}

const CONFETTI = Array.from({ length: 38 }, (_, index) => ({
  left: (index * 43 + (index % 5) * 11) % 100,
  top: (index * 17 + (index % 3) * 7) % 37,
  width: index % 4 === 0 ? 7 : 4,
  height: index % 3 === 0 ? 3 : 6,
  color: ['#FCE66A', '#FF6A36', '#F94875', '#31BEF4', '#E3ADFF'][index % 5],
  rotate: (index * 47) % 155,
}));

/** Celebratory round summary, kept separate from the answer reveal. */
export function RoundCompactOutcome({
  trappedPlayers, trappedCount, correct, tricked, answered, result,
}: Props) {
  const { width, height } = useWindowDimensions();
  const frameWidth = Math.min(width - 48, 440);
  const frameHeight = Math.min(height * 0.7, 580);
  const awards = describeRoundAwards(result, correct, trappedCount);
  const fakePoints = awards.trapPoints;
  const correctPoints = awards.correctPoints;
  const achievementTitle = headlineForRound(correct, trappedCount);
  const achievementDescription = trappedCount > 0
    ? String(trappedCount) + ' Kişiyi\nZartlattın!'
    : 'Bu tur kimse\nsahte cevabına kanmadı';
  const guessDescription = correct ? 'Doğru Cevap\nVerdin'
    : tricked ? 'Tuzağa\nDüştün'
    : answered ? 'Bu Tur\nYanlış Bildin'
    : 'Bu Tur\nCevap Vermedin';

  return (
    <View style={styles.scene} accessibilityLabel="Turun kişisel sonuçları">
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {CONFETTI.map((item, i) => (
          <View key={i} style={[styles.confetti, {
            left: (item.left + '%') as DimensionValue,
            top: (item.top + '%') as DimensionValue,
            width: item.width,
            height: item.height,
            backgroundColor: item.color,
            transform: [{ rotate: item.rotate + 'deg' }],
          }]} />
        ))}
      </View>
      <View style={[styles.card, { width: frameWidth, height: frameHeight }]}>
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <SvgGradient id="outcomeTop" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#344B9D" />
              <Stop offset="100%" stopColor="#493A84" />
            </SvgGradient>
            <SvgGradient id="outcomeBottom" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#302344" />
              <Stop offset="100%" stopColor="#241A35" />
            </SvgGradient>
          </Defs>
          <Path d="M0 0 H100 V59 L0 57 Z" fill="url(#outcomeTop)" />
          <Path d="M0 57 L100 59 V100 H0 Z" fill="url(#outcomeBottom)" />
          <Path d="M0 57 L100 59" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="0.3" />
        </Svg>
        <View style={styles.upper}>
          <View style={styles.crownTab}>
            <Crown color="#FFB84D" size={23} fill="#FFB84D" strokeWidth={2.4} />
          </View>
          <Text style={styles.eyebrow} numberOfLines={1}>TUR SONUCU</Text>
          <View style={styles.ribbon}>
            <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit>
              {achievementTitle}
            </Text>
          </View>
          {trappedCount > 0 ? (
            <View style={styles.avatarCluster}>
              {trappedPlayers.slice(0, 6).map((player, index) => (
                <View key={player.id} style={[styles.avatarRound, { marginLeft: index ? -10 : 0, zIndex: 6 - index }]}>
                  <Avatar avatarKey={player.avatarUrl ?? player.avatarKey} userId={player.id} size={36} />
                </View>
              ))}
              {trappedCount > trappedPlayers.length ? (
                <View style={[styles.avatarRound, styles.avatarOverflow, { marginLeft: trappedPlayers.length ? -10 : 0 }]}>
                  <Text style={styles.overflowText}>+{trappedCount - trappedPlayers.length}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyAvatar}><Crown color="#FFE070" size={27} /></View>
          )}
          <Text style={styles.trapCount} numberOfLines={3} adjustsFontSizeToFit>
            {achievementDescription}
          </Text>
          <View style={styles.pointsPill}>
            <Gem color="#FF8A71" size={14} fill="#FF5575" />
            <Text style={styles.pointsText}>{trappedCount > 0 ? '+' + fakePoints : '0'} PUAN</Text>
          </View>
        </View>

        <View style={styles.lower}>
          <View style={[styles.medal, correct && styles.medalCorrect]}>
            {correct
              ? <Check size={30} strokeWidth={3.5} color="#17251E" />
              : <X size={29} strokeWidth={3.5} color="#322044" />}
          </View>
          <Text style={styles.correctLabel} numberOfLines={3} adjustsFontSizeToFit>
            {guessDescription}
          </Text>
          <View style={styles.pointsPill}>
            <Gem color="#FF8A71" size={14} fill="#FF5575" />
            <Text style={styles.pointsText}>{correct ? '+' + correctPoints : '0'} PUAN</Text>
          </View>
          {awards.otherPoints !== 0 && (
            <Text style={styles.extraPoints}>
              {awards.otherPoints > 0 ? '+' : ''}{awards.otherPoints} ek tur puanı
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center',
    paddingTop: 16, paddingBottom: 10, overflow: 'hidden',
  },
  confetti: { position: 'absolute', borderRadius: 1 },
  card: {
    flexShrink: 1,
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: '#302344',
    shadowColor: '#080311',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  crownTab: {
    width: 46, height: 46, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 3,
  },
  upper: {
    flex: 1.16, alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24,
  },
  ribbon: {
    maxWidth: '100%',
    backgroundColor: 'rgba(133, 230, 115, 0.16)',
    borderWidth: 1, borderColor: 'rgba(169, 255, 142, 0.34)',
    paddingVertical: 6, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center',
  },
  eyebrow: { fontSize: 10, fontFamily: 'Poppins-Bold', color: 'rgba(255,255,255,0.62)', letterSpacing: 1.6 },
  ribbonText: { fontSize: 11, fontFamily: 'Poppins-Bold', color: '#BFF6A7', letterSpacing: 0.55 },
  avatarCluster: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 42, marginVertical: 1 },
  avatarRound: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: '#F6C66B',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#302344', overflow: 'hidden',
  },
  avatarOverflow: { borderColor: '#B99AF4', backgroundColor: '#61478A' },
  overflowText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 11 },
  emptyAvatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginVertical: 1 },
  trapCount: {
    fontSize: 19, lineHeight: 25, fontFamily: 'Poppins-Bold', color: '#FFFFFF',
    width: '100%', flexShrink: 1,
    textAlign: 'center', letterSpacing: -0.3,
  },
  pointsPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(12,7,24,0.28)', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', flexShrink: 0,
  },
  pointsText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 11, letterSpacing: 0.2 },
  extraPoints: { color: '#D9F8A6', fontFamily: 'Poppins-SemiBold', fontSize: 10, textAlign: 'center' },
  lower: {
    flex: 0.84, alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20,
    backgroundColor: 'transparent',
  },
  medal: {
    backgroundColor: '#F5C85D', width: 58, height: 58, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#E8B942', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },
  medalCorrect: { backgroundColor: '#7DE1AA', shadowColor: '#68D696' },
  correctLabel: {
    color: '#FFFFFF', fontFamily: 'Poppins-Bold', textAlign: 'center',
    width: '100%', flexShrink: 1, fontSize: 17, lineHeight: 22, letterSpacing: -0.2,
  },
});
