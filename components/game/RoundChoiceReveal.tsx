import { StyleSheet, Text, View } from 'react-native';
import { Check, Crown, Eye, Users, VenetianMask } from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { buildRevealedChoices } from '@/features/game/revealPresentation';
import { useTheme } from '@/theme/ThemeProvider';
import type { Player } from '@/types/game';
import type { RoundRevealChoice } from '@/services/types';

interface Props {
  choices: RoundRevealChoice[];
  players: Player[];
  currentPlayerId?: string | null;
}

type Accent = 'correct' | 'own' | 'tricked' | 'ordinary';

export function RoundChoiceReveal({ choices, players, currentPlayerId }: Props) {
  const { colors, mode } = useTheme();
  const rows = buildRevealedChoices(choices, players, currentPlayerId);
  const voteTotal = rows.reduce((sum, row) => sum + row.voteCount, 0);
  const light = mode === 'light';

  return (
    <View style={styles.wrapper}>
      <View style={styles.titleRow}>
        <View style={styles.headingBlock}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>TURUN PERDE ARKASI</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Kim hangi cevabı seçti?</Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            Her seçeneğin sahibi ve o seçeneğe oy verenler burada.
          </Text>
        </View>
        <View style={[styles.totalPill, { backgroundColor: colors.purpleSurface, borderColor: colors.borderAccent }]}>
          <Users size={14} color={colors.purpleSoft} />
          <Text style={[styles.totalText, { color: colors.textPrimary }]}>{voteTotal} oy</Text>
        </View>
      </View>

      {rows.map((row, index) => {
        const accent: Accent = row.choice.isCorrect ? 'correct'
          : row.isMyPick ? 'tricked'
          : row.isMyTrap ? 'own' : 'ordinary';
        const palette = {
          correct: { bg: light ? '#E5F9E7' : '#123E2C', border: '#36C96B', foreground: light ? '#14532D' : '#B9FBC6' },
          own: { bg: light ? '#FFF1CB' : '#483011', border: '#F8B92D', foreground: light ? '#78350F' : '#FFE6A0' },
          tricked: { bg: light ? '#FFE8ED' : '#4B2035', border: '#F36B90', foreground: light ? '#9F1239' : '#FFC2D3' },
          ordinary: { bg: light ? '#EBF3FF' : '#193A70', border: light ? '#7BAEF4' : '#3C78CE', foreground: light ? '#1E3A8A' : '#D7E9FF' },
        }[accent];
        const isBest = row.isMostConvincingFake;
        const authorName = row.author ? (row.isMyTrap ? 'Sen' : row.author.name) : 'Bilinmeyen oyuncu';

        return (
          <View
            key={row.choice.choiceIndex}
            accessibilityLabel={row.choice.text + ', ' + row.voteCount + ' oyuncu seçti'}
            style={[
              styles.optionCard,
              {
                backgroundColor: palette.bg,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.optionHeader}>
              <View style={styles.optionBadges}>
                {isBest ? (
                  <View style={[styles.badge, { backgroundColor: '#F7B90B' }]}>
                    <Crown size={12} color="#4B2700" fill="#4B2700" />
                    <Text style={[styles.badgeText, { color: '#4B2700' }]}>EN ÇOK ZARTLATAN</Text>
                  </View>
                ) : null}
                {row.choice.isCorrect ? (
                  <View style={[styles.badge, { backgroundColor: '#4DD96F' }]}>
                    <Check size={12} color="#103B20" strokeWidth={3} />
                    <Text style={[styles.badgeText, { color: '#103B20' }]}>DOĞRU CEVAP</Text>
                  </View>
                ) : null}
                {row.isMyTrap ? (
                  <View style={[styles.badge, { backgroundColor: '#FFCA55' }]}>
                    <VenetianMask size={12} color="#603800" />
                    <Text style={[styles.badgeText, { color: '#603800' }]}>SENİN TUZAĞIN</Text>
                  </View>
                ) : null}
                {row.isMyPick ? (
                  <View style={[styles.badge, { backgroundColor: row.choice.isCorrect ? '#166534' : '#BE2456' }]}>
                    <Eye size={12} color="#FFFFFF" />
                    <Text style={[styles.badgeText, { color: '#FFFFFF' }]}>SENİN SEÇİMİN</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.count, { backgroundColor: light ? '#FFFFFF' : 'rgba(255,255,255,0.14)' }]}>
                <Text style={[styles.countText, { color: palette.foreground }]}>{row.voteCount} kişi</Text>
              </View>
            </View>

            <View style={styles.answerRow}>
              <View style={[styles.optionNumber, { backgroundColor: palette.border }]}>
                <Text style={styles.optionNumberText}>{index + 1}</Text>
              </View>
              <Text style={[styles.answer, { color: palette.foreground }]}>{row.choice.text}</Text>
            </View>

            <View style={[styles.separator, { backgroundColor: palette.border, opacity: 0.35 }]} />
            <View style={styles.authorRow}>
              <View style={styles.authorIdentity}>
                {row.author ? (
                  <Avatar avatarKey={row.author.avatarUrl ?? row.author.avatarKey} userId={row.author.id} size={25} />
                ) : (
                  <View style={[styles.systemIcon, { backgroundColor: light ? '#BCF2C2' : '#235F40' }]}>
                    <Check size={14} color={palette.foreground} strokeWidth={3} />
                  </View>
                )}
                <Text style={[styles.authorText, { color: palette.foreground }]}>
                  {row.choice.isCorrect ? 'Gerçek doğru cevap' : 'Sahte cevabı yazan: ' + authorName}
                </Text>
              </View>
              {row.isMyTrap && row.voteCount > 0 ? (
                <Text style={[styles.trapHint, { color: palette.foreground }]}>Tuzak tuttu!</Text>
              ) : null}
            </View>

            <View style={[styles.votersSection, { backgroundColor: light ? 'rgba(255,255,255,0.66)' : 'rgba(4,13,38,0.23)' }]}>
              <Text style={[styles.votersTitle, { color: palette.foreground }]}>
                {row.voteCount === 0 ? 'Bu cevabı kimse seçmedi' : 'Bu cevabı seçenler (' + row.voteCount + ')'}
              </Text>
              {row.voters.length > 0 ? (
                <View style={styles.votersList}>
                  {row.voters.map((voter) => (
                    <View
                      key={voter.id}
                      style={[styles.voterChip, {
                        borderColor: voter.id === currentPlayerId ? palette.border : (light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.18)'),
                        backgroundColor: voter.id === currentPlayerId
                          ? (light ? '#FFFFFF' : 'rgba(255,255,255,0.16)')
                          : (light ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.08)'),
                      }]}
                    >
                      <Avatar avatarKey={voter.avatarUrl ?? voter.avatarKey} userId={voter.id} size={27} />
                      <Text style={[styles.voterName, { color: palette.foreground }]}>
                        {voter.id === currentPlayerId ? 'Sen' : voter.name}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 12, marginBottom: 18 },
  titleRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', alignItems: 'flex-start' },
  headingBlock: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: 'Poppins-Bold', fontSize: 10, letterSpacing: 1 },
  title: { fontFamily: 'Poppins-Bold', fontSize: 18, lineHeight: 26 },
  subTitle: { fontFamily: 'Poppins-Medium', fontSize: 11, lineHeight: 17 },
  totalPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 9 },
  totalText: { fontFamily: 'Poppins-Bold', fontSize: 11 },
  optionCard: { borderRadius: 21, borderWidth: 2, padding: 13, gap: 9, overflow: 'hidden' },
  optionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  optionBadges: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 8 },
  badgeText: { fontFamily: 'Poppins-Bold', fontSize: 9, letterSpacing: 0.1 },
  count: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  countText: { fontFamily: 'Poppins-Bold', fontSize: 12 },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  optionNumber: { width: 29, height: 29, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  optionNumberText: { fontFamily: 'Poppins-Bold', color: '#142545', fontSize: 13 },
  answer: { flex: 1, fontFamily: 'Poppins-Bold', fontSize: 17, lineHeight: 24 },
  separator: { height: 1, width: '100%' },
  authorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  authorIdentity: { flexDirection: 'row', flex: 1, alignItems: 'center', gap: 6 },
  systemIcon: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  authorText: { flex: 1, fontFamily: 'Poppins-Medium', fontSize: 11, lineHeight: 16 },
  trapHint: { fontFamily: 'Poppins-Bold', fontSize: 10 },
  votersSection: { borderRadius: 13, padding: 9, gap: 7 },
  votersTitle: { fontFamily: 'Poppins-Bold', fontSize: 10 },
  votersList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  voterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, borderWidth: 1, paddingRight: 9, paddingLeft: 3, paddingVertical: 3, maxWidth: '100%' },
  voterName: { fontFamily: 'Poppins-SemiBold', fontSize: 10, flexShrink: 1 },
});
