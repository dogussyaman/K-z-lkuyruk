import { useWindowDimensions, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { Check, Crown, Gem, X } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { Avatar } from '@/components/ui/Avatar';
import type { Player } from '@/types/game';
import { POINTS } from '@/features/game/outcomes';

interface Props {
  trappedPlayers: Player[];
  trappedCount: number;
  correct: boolean;
  tricked: boolean;
  answered: boolean;
  points: number;
  goldenMultiplier?: number;
}

const CONFETTI = Array.from({ length: 54 }, (_, index) => ({
  left: (index * 43 + (index % 5) * 11) % 100,
  top: (index * 17 + (index % 3) * 7) % 37,
  width: index % 4 === 0 ? 9 : 5,
  height: index % 3 === 0 ? 4 : 8,
  color: ['#FCE66A', '#FF6A36', '#F94875', '#31BEF4', '#E3ADFF'][index % 5],
  rotate: (index * 47) % 155,
}));

/** Screenshot-inspired full-screen phone celebration, without any answer list. */
export function RoundCompactOutcome({
  trappedPlayers, trappedCount, correct, tricked, answered, points, goldenMultiplier = 1,
}: Props) {
  const { width, height } = useWindowDimensions();
  const frameWidth = Math.min(width * 0.72, 282);
  const frameHeight = Math.min(height * 0.61, 475);
  const fakePoints = trappedCount * POINTS.fakeChosenBonus * (correct ? goldenMultiplier : 1);
  const correctPoints = correct ? POINTS.correct * goldenMultiplier : 0;
  const achievementTitle = trappedCount > 0 ? 'HARİKASIN!' : 'BİR SONRAKİ TURDA!';
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
      <View style={[styles.phone, { width: frameWidth, height: frameHeight }]}>
        <Svg width="100%" height="100%" viewBox="0 0 280 470" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Path d="M 0 0 H 280 V 248 L 0 283 Z" fill="#0758B4" />
          <Path d="M 0 283 L 280 248 V 470 H 0 Z" fill="#5713B7" />
          <Path d="M 0 0 H 280 V 62 L 0 82 Z" fill="#0B6AC5" opacity={0.5} />
          <Path d="M 0 308 L 280 275 V 350 L 0 375 Z" fill="#7C26DC" opacity={0.4} />
        </Svg>
        <View style={styles.phoneConfetti} pointerEvents="none">
          {CONFETTI.slice(0, 24).map((item, i) => (
            <View key={i} style={[styles.confetti, {
              left: (item.left + '%') as DimensionValue,
              top: (item.top + '%') as DimensionValue,
              width: item.width,
              height: item.height,
              backgroundColor: item.color,
              transform: [{ rotate: item.rotate + 'deg' }],
              opacity: 0.92,
            }]} />
          ))}
        </View>
        <View style={styles.crownTab}>
          <Crown color="#FF6F00" size={34} fill="#FFB528" strokeWidth={2.8} />
        </View>
        <View style={styles.upper}>
          <View style={styles.ribbon}>
            <Text style={styles.ribbonText}>{achievementTitle}</Text>
          </View>
          {trappedCount > 0 ? (
            <View style={styles.avatarCluster}>
              {trappedPlayers.slice(0, 6).map((player, index) => (
                <View key={player.id} style={[styles.avatarRound, { marginLeft: index ? -10 : 0, zIndex: 6 - index }]}>
                  <Avatar avatarKey={player.avatarUrl ?? player.avatarKey} userId={player.id} size={34} />
                </View>
              ))}
              {trappedCount > trappedPlayers.length ? (
                <View style={[styles.avatarRound, styles.avatarOverflow, { marginLeft: trappedPlayers.length ? -10 : 0 }]}>
                  <Text style={styles.overflowText}>+{trappedCount - trappedPlayers.length}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyAvatar}><Crown color="#FFE070" size={29} /></View>
          )}
          <Text style={styles.trapCount}>{achievementDescription}</Text>
          <View style={styles.pointsPill}>
            <Gem color="#FF6437" size={13} fill="#ED225D" />
            <Text style={styles.pointsText}>{trappedCount > 0 ? '+' + fakePoints : '0'} PUAN</Text>
          </View>
        </View>
        <View style={styles.lower}>
          <View style={styles.medal}>
            {correct
              ? <Check size={40} strokeWidth={4.5} color="#7833D0" />
              : <X size={35} strokeWidth={4} color="#7833D0" />}
          </View>
          <Text style={styles.correctLabel}>{guessDescription}</Text>
          <View style={styles.pointsPill}>
            <Gem color="#FF6437" size={13} fill="#ED225D" />
            <Text style={styles.pointsText}>{correct ? '+' + correctPoints : '0'} PUAN</Text>
          </View>
        </View>
      </View>
      {points !== fakePoints + correctPoints && points > 0 ? (
        <Text style={styles.totalPoints}>Toplam tur puanın: +{points}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 28, paddingBottom: 8, overflow: 'hidden' },
  confetti: { position: 'absolute', borderRadius: 1 },
  phoneConfetti: { ...StyleSheet.absoluteFillObject, borderRadius: 22, overflow: 'hidden' },
  phone: {
    position: 'relative', borderColor: '#F7F9FF', borderWidth: 8, borderRadius: 31,
    backgroundColor: '#0B4DAA', overflow: 'visible',
    shadowColor: '#070225', shadowOpacity: 0.35, shadowRadius: 14, elevation: 12,
  },
  crownTab: {
    position: 'absolute', top: -35, alignSelf: 'center', zIndex: 10,
    width: 67, height: 49, backgroundColor: '#FBFAFF', borderRadius: 15,
    justifyContent: 'center', alignItems: 'center', elevation: 3,
  },
  upper: {
    position: 'absolute', top: '6%', left: 0, right: 0, height: '49%',
    alignItems: 'center', justifyContent: 'center', gap: 11, paddingHorizontal: 16,
  },
  ribbon: {
    backgroundColor: '#45CB19', borderBottomColor: '#15930E', borderBottomWidth: 5,
    paddingVertical: 5, paddingHorizontal: 19, minWidth: 120, alignItems: 'center',
    transform: [{ rotate: '-1deg' }],
  },
  ribbonText: { fontSize: 11, fontFamily: 'Poppins-Bold', color: '#FFFFFF', letterSpacing: 0.3 },
  avatarCluster: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  avatarRound: {
    width: 39, height: 39, borderRadius: 20, borderWidth: 3, borderColor: '#FFC345',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#260F4F', overflow: 'hidden',
  },
  avatarOverflow: { borderColor: '#FFD86E', backgroundColor: '#9C48C9' },
  overflowText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 10 },
  emptyAvatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  trapCount: {
    fontSize: 16, lineHeight: 20, fontFamily: 'Poppins-Bold', color: '#FFFFFF',
    textAlign: 'center', textShadowColor: 'rgba(2,18,65,0.65)', textShadowRadius: 3,
  },
  pointsPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#24055D', paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  pointsText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 11 },
  lower: {
    position: 'absolute', top: '58%', bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  medal: {
    backgroundColor: '#FFD234', width: 71, height: 71, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', elevation: 3,
  },
  correctLabel: {
    color: '#FFFFFF', fontFamily: 'Poppins-Bold', textAlign: 'center',
    fontSize: 17, lineHeight: 20, textShadowColor: '#220660', textShadowRadius: 3,
  },
  totalPoints: { marginTop: 12, fontFamily: 'Poppins-Bold', fontSize: 11, color: '#FFD166' },
});
