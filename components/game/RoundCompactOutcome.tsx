import { Image, StyleSheet, Text, View } from 'react-native';
import { Check, Crown, Sparkles } from 'lucide-react-native';
import { mascotImages } from '@/assets/illustrations';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  round: number;
  totalRounds: number;
  points: number;
  trappedCount: number;
  correct: boolean;
  tricked: boolean;
  answered: boolean;
  pickedAnswer: string | null;
  correctAnswer: string;
  trickedBy?: string | null;
}

/** The entire personal result stays in a small strip above the answer list. */
export function RoundCompactOutcome({
  round, totalRounds, points, trappedCount, correct, tricked,
  answered, pickedAnswer, correctAnswer, trickedBy,
}: Props) {
  const { colors, mode } = useTheme();
  const light = mode === 'light';
  const guessLabel = correct ? 'DOĞRU BİLDİN!'
    : tricked ? 'TUZAĞA DÜŞTÜN!'
    : answered ? 'YANLIŞ TAHMİN' : 'CEVAP VERMEDİN';
  const guessDetail = correct ? pickedAnswer ?? correctAnswer
    : tricked ? (trickedBy ?? 'Bir oyuncu') + ' kandırdı'
    : answered ? pickedAnswer ?? 'Yanlış cevap'
    : 'Bu tur cevap yok';
  const guessAccent = correct ? '#4FCF5B' : tricked ? '#EE7B9E' : colors.borderStrong;
  const guessBg = correct
    ? (light ? '#E1F7D8' : '#15543B')
    : tricked ? (light ? '#FFE8EF' : '#522B47')
    : colors.bgSurfaceAlt;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Image source={mascotImages.brand} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={[styles.kicker, { color: colors.textMuted }]}>TUR {round} / {totalRounds}</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Tur sonuçları</Text>
          </View>
        </View>
        <View style={[styles.points, { backgroundColor: points > 0 ? colors.goldSurface : colors.bgSurfaceAlt }]}>
          <Text style={[styles.pointsText, {
            color: points > 0 ? (light ? '#6E4104' : colors.yellow)
              : points < 0 ? colors.dangerSoft : colors.textPrimary,
          }]}>{points > 0 ? '+' : ''}{points} P</Text>
        </View>
      </View>

      <View style={styles.outcomes}>
        {trappedCount > 0 ? (
          <View style={[styles.outcome, { backgroundColor: light ? '#FFF1C6' : '#513181', borderColor: '#F9BF42' }]}>
            <View style={[styles.icon, { backgroundColor: '#F9BF42' }]}>
              <Crown color="#4B2A13" fill="#4B2A13" size={17} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.outcomeTitle, { color: light ? '#7B4000' : '#FFE7AC' }]}>ZARTLATTIN!</Text>
              <Text style={[styles.outcomeDetail, { color: colors.textPrimary }]}>{trappedCount} kişi kandı</Text>
            </View>
          </View>
        ) : null}
        <View style={[styles.outcome, { backgroundColor: guessBg, borderColor: guessAccent }]}>
          <View style={[styles.icon, { backgroundColor: guessAccent }]}>
            {correct
              ? <Check color="#1C4320" size={18} strokeWidth={3} />
              : <Sparkles color={tricked ? '#662040' : colors.textPrimary} size={17} />}
          </View>
          <View style={styles.copy}>
            <Text style={[styles.outcomeTitle, {
              color: correct ? (light ? '#166534' : '#C5FAC1')
                : tricked ? (light ? '#9F1239' : '#FBC8DB') : colors.textPrimary,
            }]}>{guessLabel}</Text>
            <Text style={[styles.outcomeDetail, { color: colors.textPrimary }]} numberOfLines={1}>
              {guessDetail}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 10, gap: 9 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 41 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  logo: { width: 47, height: 31 },
  kicker: { fontFamily: 'Poppins-Bold', fontSize: 9, letterSpacing: 0.6 },
  title: { fontFamily: 'Poppins-Bold', fontSize: 16, lineHeight: 22 },
  points: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  pointsText: { fontFamily: 'Poppins-Bold', fontSize: 16 },
  outcomes: { flexDirection: 'row', gap: 7 },
  outcome: { flex: 1, minWidth: 0, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 8, paddingVertical: 8 },
  icon: { width: 28, height: 28, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  outcomeTitle: { fontFamily: 'Poppins-Bold', fontSize: 10, lineHeight: 14 },
  outcomeDetail: { fontFamily: 'Poppins-Medium', fontSize: 10, lineHeight: 14 },
});
