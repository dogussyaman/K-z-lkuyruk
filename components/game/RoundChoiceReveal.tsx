import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, Crown, Flag, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { buildRevealedChoices, orderRevealedChoices, type RevealedChoiceView } from '@/features/game/revealPresentation';
import { useTheme } from '@/theme/ThemeProvider';
import type { Player } from '@/types/game';
import type { RoundRevealChoice } from '@/services/types';

interface Props {
  choices: RoundRevealChoice[];
  players: Player[];
  currentPlayerId?: string | null;
  onReportPlayer?: (playerId: string) => void;
}

const BAR_COLORS = {
  winner: {
    top: '#FFE21B', bottom: '#FFB600', border: '#F7A900',
    shadow: '#C77C08', text: '#472400', detail: '#5D3708',
  },
  correct: {
    top: '#8BF20B', bottom: '#43D000', border: '#39B900',
    shadow: '#258A00', text: '#174100', detail: '#24520B',
  },
  other: {
    top: '#ECF4FF', bottom: '#B5D2FF', border: '#A1C4F5',
    shadow: '#6395DC', text: '#15366E', detail: '#334F7A',
  },
};

/**
 * Reference-matched, answer-only reveal screen.
 * Author avatar overlaps the left edge; voters overlap the bottom edge.
 * Details open in an overlay,
 * never expand the rows or push the next answer below the fold.
 */
export function RoundChoiceReveal({ choices, players, currentPlayerId, onReportPlayer }: Props) {
  const { colors } = useTheme();
  const [selectedRow, setSelectedRow] = useState<RevealedChoiceView | null>(null);
  const rows = orderRevealedChoices(buildRevealedChoices(choices, players, currentPlayerId));
  const winner = rows.find((row) => row.isMostConvincingFake && !row.choice.isCorrect);
  const winnerIndex = winner?.choice.choiceIndex;
  const authorName = selectedRow?.choice.isCorrect
    ? 'Gerçek doğru cevap'
    : selectedRow?.author?.name ?? 'Sahte cevap yazarı bilinmiyor';
  const voters = selectedRow?.voters ?? [];
  const canReport = !!selectedRow?.author && !selectedRow.author.isBot
    && selectedRow.author.id !== currentPlayerId && !!onReportPlayer;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row, index) => {
          const isWinner = row.choice.choiceIndex === winnerIndex;
          const palette = row.choice.isCorrect ? BAR_COLORS.correct
            : isWinner ? BAR_COLORS.winner : BAR_COLORS.other;
          const votersInView = row.voters.slice(0, 4);
          return (
            <Pressable
              key={row.choice.choiceIndex}
              accessibilityRole="button"
              accessibilityLabel={
                row.choice.text + '. ' + (row.choice.isCorrect ? 'Doğru cevap. ' : '') +
                (row.author?.name ? row.author.name + ' yazdı. ' : '') +
                row.voteCount + ' kişi seçti: ' +
                (row.voters.map((player) => player.name).join(', ') || 'kimse')
              }
              accessibilityHint="Seçen oyuncuların adlarını görmek için dokun"
              onPress={() => setSelectedRow(row)}
              style={({ pressed }) => [
                styles.barWrap,
                isWinner && styles.barWinner,
                { opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] },
              ]}
            >
              {isWinner ? (
                <View pointerEvents="none" style={styles.winnerHeading}>
                  <Crown color="#FFD27A" size={15} fill="#FFD27A" strokeWidth={2} />
                  <View style={styles.ribbon}>
                    <Text style={styles.ribbonText}>EN ZARTALAYAN!</Text>
                  </View>
                </View>
              ) : null}

              <View style={[styles.barShadow, { backgroundColor: palette.shadow, borderColor: palette.border }]}>
                <LinearGradient
                  colors={[palette.top, palette.bottom]}
                  style={styles.bar}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                >
                  <View style={styles.answerContent}>
                    <Text
                      style={[styles.answer, { color: palette.text }]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {row.choice.text}
                    </Text>
                    <Text style={[styles.answerDetail, { color: palette.detail }]}>
                      {row.choice.isCorrect ? 'DOĞRU CEVAP' : `${row.voteCount} kişi seçti`}
                    </Text>
                    <Text style={[styles.voterNames, { color: palette.detail }]}>
                      {row.choice.isCorrect ? 'Doğruyu bulanlar: ' : 'Tuzağa düşenler: '}
                      {row.voters.map((player) => player.name).join(', ') || 'Kimse'}
                    </Text>
                  </View>
                  {row.isMyPick ? (
                    <View style={styles.yourPickDot}>
                      <Check color="#FFFFFF" size={11} strokeWidth={3} />
                    </View>
                  ) : null}
                </LinearGradient>
              </View>

              {row.voteCount > 0 ? (
                <View style={styles.voters}>
                  {row.voteCount > votersInView.length ? (
                    <View style={styles.extraVotes}>
                      <Text style={styles.extraVotesText}>+{row.voteCount - votersInView.length}</Text>
                    </View>
                  ) : null}
                  {votersInView.map((voter, voteIndex) => (
                    <View
                      key={voter.id}
                      style={[styles.voter, {
                        marginLeft: voteIndex > 0 ? -8 : 0,
                        zIndex: votersInView.length - voteIndex,
                        borderColor: voter.id === currentPlayerId ? '#FF8B5C' : '#BDA6D6',
                      }]}
                    >
                      <Avatar avatarKey={voter.avatarUrl ?? voter.avatarKey} userId={voter.id} size={23} />
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={[styles.author, { borderColor: palette.border }]}>
                {row.author ? (
                  <Avatar
                    avatarKey={row.author.avatarUrl ?? row.author.avatarKey}
                    userId={row.author.id}
                    size={33}
                  />
                ) : (
                  <View style={styles.correctOwner}>
                    {row.choice.isCorrect
                      ? <Check color="#FFFFFF" size={18} strokeWidth={3} />
                      : <Text style={styles.unknownOwner}>?</Text>}
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal
        visible={!!selectedRow}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRow(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedRow(null)}>
          <Pressable
            accessibilityRole="none"
            onPress={() => {}}
            style={[styles.modalSheet, { backgroundColor: colors.bgCard, borderColor: colors.borderAccent }]}
          >
            <View style={styles.modalTitle}>
              <Text style={[styles.modalQuestion, { color: colors.textPrimary }]}>
                {selectedRow?.choice.text}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kapat"
                onPress={() => setSelectedRow(null)}
                style={styles.modalClose}
              >
                <X size={19} color={colors.textPrimary} />
              </Pressable>
            </View>
            <Text style={[styles.modalAuthor, { color: colors.textSecondary }]}>
              {selectedRow?.choice.isCorrect ? '✓ ' : 'Yazan: '}{authorName}
            </Text>
            <Text style={[styles.modalVotersLabel, { color: colors.textPrimary }]}>
              Seçenler ({selectedRow?.voteCount ?? 0})
            </Text>
            <View style={styles.modalVoters}>
              {voters.length ? voters.map((player) => (
                <View key={player.id} style={[styles.playerChip, { backgroundColor: colors.bgSurfaceAlt }]}>
                  <Avatar avatarKey={player.avatarUrl ?? player.avatarKey} userId={player.id} size={24} />
                  <Text style={[styles.playerName, { color: colors.textPrimary }]}>
                    {player.id === currentPlayerId ? 'Sen' : player.name}
                  </Text>
                </View>
              )) : (
                <Text style={{ color: colors.textMuted }}>Bu cevabı kimse seçmedi.</Text>
              )}
            </View>
            {canReport && selectedRow?.author ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const id = selectedRow.author!.id;
                  setSelectedRow(null);
                  onReportPlayer?.(id);
                }}
                style={styles.report}
              >
                <Flag size={12} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Oyuncuyu bildir</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%' },
  scroller: { flex: 1 },
  list: { flexGrow: 1, paddingTop: 38, paddingBottom: 18, paddingHorizontal: 16, justifyContent: 'center', gap: 12 },
  barWrap: { position: 'relative', marginHorizontal: 10, paddingBottom: 13 },
  barWinner: { marginTop: 20 },
  barShadow: {
    borderRadius: 21, borderWidth: 1.5, paddingBottom: 4, overflow: 'hidden',
    shadowColor: '#080311', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22, shadowRadius: 11, elevation: 4,
  },
  bar: { minHeight: 82, borderRadius: 19, flexDirection: 'row', alignItems: 'center', paddingLeft: 50, paddingRight: 16, gap: 8 },
  answerContent: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 4, paddingVertical: 13 },
  answer: { textAlign: 'left', fontFamily: 'Poppins-Bold', fontSize: 15, lineHeight: 21 },
  answerDetail: { fontFamily: 'Poppins-Bold', fontSize: 10, lineHeight: 14, letterSpacing: 0.7 },
  voterNames: { fontFamily: 'Poppins-SemiBold', fontSize: 11, lineHeight: 16 },
  author: {
    position: 'absolute', left: -13, top: 15, width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, backgroundColor: '#382C4B', justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  correctOwner: { width: 33, height: 33, borderRadius: 17, backgroundColor: '#31966C', alignItems: 'center', justifyContent: 'center' },
  unknownOwner: { color: '#FFFFFF', fontFamily: 'Poppins-Bold' },
  voters: {
    position: 'absolute', right: 12, bottom: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 4, paddingVertical: 2, borderRadius: 99,
    backgroundColor: '#342844', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  voter: {
    width: 27, height: 27, borderRadius: 14, overflow: 'hidden', justifyContent: 'center',
    alignItems: 'center', borderWidth: 2, backgroundColor: '#302044',
  },
  extraVotes: { zIndex: 5, borderRadius: 12, paddingHorizontal: 4, backgroundColor: '#7650A5', alignItems: 'center', justifyContent: 'center', minWidth: 23, height: 23, marginRight: 3 },
  extraVotesText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 9 },
  winnerHeading: {
    position: 'absolute', top: -24, alignSelf: 'center', zIndex: 5,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 3, borderRadius: 4,
    backgroundColor: '#B51DE5', borderBottomWidth: 3, borderBottomColor: '#7711AB',
  },
  ribbon: { alignItems: 'center' },
  ribbonText: { fontFamily: 'Poppins-Bold', fontSize: 8, color: '#FFFFFF', letterSpacing: 0.35 },
  yourPickDot: { position: 'absolute', top: 6, right: 6, width: 17, height: 17, borderRadius: 9, backgroundColor: '#A84572', borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(5,5,18,0.72)', justifyContent: 'center', padding: 20 },
  modalSheet: { borderRadius: 21, padding: 17, borderWidth: 1.5, gap: 10, maxHeight: '80%' },
  modalTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  modalQuestion: { fontFamily: 'Poppins-Bold', fontSize: 18, lineHeight: 24, flex: 1 },
  modalClose: { padding: 5, borderRadius: 15 },
  modalAuthor: { fontFamily: 'Poppins-Medium', fontSize: 12 },
  modalVotersLabel: { fontFamily: 'Poppins-Bold', fontSize: 12, marginTop: 5 },
  modalVoters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  playerChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 16, padding: 5 },
  playerName: { fontFamily: 'Poppins-Medium', fontSize: 11 },
  report: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 7 },
});
