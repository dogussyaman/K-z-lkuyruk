import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, Crown, Users } from 'lucide-react-native';
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

/**
 * Compact answer distribution: the primary facts fit into one glance.
 * Tap an answer for its author and voters instead of forcing everyone to
 * scroll through expanded voter lists by default.
 */
export function RoundChoiceReveal({ choices, players, currentPlayerId }: Props) {
  const { colors, mode } = useTheme();
  const [expandedChoice, setExpandedChoice] = useState<number | null>(null);
  const rows = buildRevealedChoices(choices, players, currentPlayerId);
  const totalVotes = rows.reduce((total, row) => total + row.voteCount, 0);
  const isLight = mode === 'light';

  return (
    <View style={styles.wrapper}>
      <View style={styles.heading}>
        <Text style={[styles.headingText, { color: colors.textPrimary }]}>Kim hangi cevabı seçti?</Text>
        <View style={[styles.totalBadge, { backgroundColor: colors.purpleSurface }]}>
          <Users color={colors.purpleSoft} size={12} />
          <Text style={[styles.totalBadgeText, { color: colors.textPrimary }]}>{totalVotes} oy</Text>
        </View>
      </View>
      {rows.map((row) => {
        const isExpanded = expandedChoice === row.choice.choiceIndex;
        const isWinningTrap = row.isMostConvincingFake;
        const isCorrect = row.choice.isCorrect;
        const isTricked = row.isMyPick && !isCorrect;
        const background = isCorrect ? (isLight ? '#D9F7D7' : '#125134')
          : isWinningTrap ? (isLight ? '#FFF0BD' : '#6B410E')
          : isTricked ? (isLight ? '#FBE4EC' : '#52263F')
          : (isLight ? '#E8F2FF' : '#1A3975');
        const border = isCorrect ? '#55D64A'
          : isWinningTrap ? '#F9B52F'
          : isTricked ? '#EF83A8' : (isLight ? '#A3C6FA' : '#3577D1');
        const ink = isLight ? '#173459' : '#FFFFFF';
        const authorText = isCorrect ? 'Gerçek cevap'
          : row.author ? (row.isMyTrap ? 'Senin blöfün' : row.author.name + ' yazdı')
          : 'Sahte cevap';
        const names = row.voters.map((voter) =>
          voter.id === currentPlayerId ? 'Sen' : voter.name
        );

        return (
          <Pressable
            key={row.choice.choiceIndex}
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            accessibilityLabel={row.choice.text + ', ' + row.voteCount + ' kişi seçti' + (isCorrect ? ', doğru cevap' : '')}
            accessibilityHint="Cevabı yazanı ve bu cevabı seçen oyuncuları görmek için dokun"
            onPress={() => setExpandedChoice(isExpanded ? null : row.choice.choiceIndex)}
            style={({ pressed }) => [
              styles.choiceCard,
              { backgroundColor: background, borderColor: border, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <View style={styles.choiceRow}>
              <View style={[styles.authorAvatar, { borderColor: border }]}>
                {row.author ? (
                  <Avatar avatarKey={row.author.avatarUrl ?? row.author.avatarKey} userId={row.author.id} size={25} />
                ) : (
                  <Check size={18} strokeWidth={3} color={isCorrect ? '#4ADE80' : ink} />
                )}
              </View>
              <View style={styles.choiceCopy}>
                <View style={styles.answerLine}>
                  <Text style={[styles.answerText, { color: ink }]} numberOfLines={2}>
                    {row.choice.text}
                  </Text>
                  {isCorrect ? <Check color={isLight ? '#166534' : '#86EFAC'} size={15} strokeWidth={3} />
                    : isWinningTrap ? <Crown color="#FFD76F" size={16} fill="#FFD76F" />
                    : null}
                </View>
                <View style={styles.statusLine}>
                  <Text style={[styles.authorLabel, { color: ink }]} numberOfLines={1}>{authorText}</Text>
                  {row.isMyPick ? (
                    <View style={[styles.meBadge, { backgroundColor: isTricked ? '#C03569' : '#18834D' }]}>
                      <Text style={styles.meBadgeText}>SENİN SEÇİMİN</Text>
                    </View>
                  ) : row.isMyTrap ? (
                    <View style={[styles.meBadge, { backgroundColor: '#B87918' }]}>
                      <Text style={styles.meBadgeText}>SENİN TUZAĞIN</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.voteColumn}>
                <View style={styles.avatarStack}>
                  {row.voters.slice(0, 4).map((voter, i) => (
                    <View
                      key={voter.id}
                      style={[styles.voterAvatar, {
                        marginLeft: i ? -8 : 0,
                        zIndex: 5 - i,
                        borderColor: voter.id === currentPlayerId ? '#F8AD37' : border,
                      }]}
                    >
                      <Avatar avatarKey={voter.avatarUrl ?? voter.avatarKey} userId={voter.id} size={22} />
                    </View>
                  ))}
                  {row.voteCount > 4 ? (
                    <View style={[styles.moreAvatar, { marginLeft: -8, borderColor: border }]}>
                      <Text style={styles.moreText}>+{row.voteCount - 4}</Text>
                    </View>
                  ) : null}
                  {row.voteCount === 0 ? <Text style={[styles.zeroText, { color: ink }]}>—</Text> : null}
                </View>
                <View style={styles.voteCountLine}>
                  <Text style={[styles.voteCountText, { color: ink }]}>{row.voteCount} kişi</Text>
                  <ChevronDown
                    color={ink}
                    size={12}
                    style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                  />
                </View>
              </View>
            </View>
            {isExpanded ? (
              <View style={[styles.details, { borderTopColor: isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.25)' }]}>
                <Text style={[styles.detailText, { color: ink }]}>
                  {isCorrect ? '✓ Bu turun gerçek doğru cevabı' : 'Blöfü yazan: ' + (row.author?.name ?? 'Bilinmeyen oyuncu')}
                </Text>
                <Text style={[styles.detailText, { color: ink }]}>
                  {names.length ? 'Seçenler: ' + names.join(', ') : row.voteCount > 0 ? row.voteCount + ' kişi seçti' : 'Bu cevabı kimse seçmedi'}
                </Text>
                {isWinningTrap ? (
                  <Text style={[styles.detailEmphasis, { color: ink }]}>👑 En çok seçilen sahte cevap</Text>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <Text style={[styles.tapHint, { color: colors.textMuted }]}>
        Ayrıntılar için cevap kartına dokun.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 7, marginBottom: 9 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 },
  headingText: { fontFamily: 'Poppins-Bold', fontSize: 13.5, flex: 1 },
  totalBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 99 },
  totalBadgeText: { fontFamily: 'Poppins-Bold', fontSize: 10 },
  choiceCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 60,
    justifyContent: 'center',
  },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authorAvatar: {
    width: 31, height: 31, borderRadius: 16, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  choiceCopy: { flex: 1, minWidth: 0, gap: 1 },
  answerLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  answerText: { fontFamily: 'Poppins-Bold', fontSize: 13, lineHeight: 18, flexShrink: 1 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0, flexWrap: 'wrap' },
  authorLabel: { fontFamily: 'Poppins-Medium', fontSize: 9, opacity: 0.8, maxWidth: '100%', flexShrink: 1 },
  meBadge: { borderRadius: 5, paddingVertical: 1.5, paddingHorizontal: 5 },
  meBadgeText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 7.5 },
  voteColumn: { minWidth: 64, maxWidth: 104, alignItems: 'flex-end', gap: 2 },
  avatarStack: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 27 },
  voterAvatar: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  moreAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, backgroundColor: '#2D1D4B', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 9 },
  zeroText: { fontFamily: 'Poppins-Bold', fontSize: 14 },
  voteCountLine: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  voteCountText: { fontFamily: 'Poppins-SemiBold', fontSize: 9.5 },
  details: { borderTopWidth: 1, paddingTop: 6, marginTop: 7, gap: 3 },
  detailText: { fontFamily: 'Poppins-Medium', fontSize: 10.5, lineHeight: 16 },
  detailEmphasis: { fontFamily: 'Poppins-Bold', fontSize: 10 },
  tapHint: { fontFamily: 'Poppins-Medium', fontSize: 9.5, textAlign: 'center', marginTop: 2 },
});
