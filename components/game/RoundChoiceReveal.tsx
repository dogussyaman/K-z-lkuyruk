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
  winner: { top: '#FFDD30', bottom: '#FFAE00', shadow: '#D97705', text: '#442100' },
  correct: { top: '#B3FF59', bottom: '#36D500', shadow: '#248F00', text: '#164000' },
  other: { top: '#F4F7FF', bottom: '#B4D6FF', shadow: '#6597EB', text: '#18356D' },
};

/**
 * Reference-matched, answer-only reveal screen.
 * Author avatar = left, voters = right. Details open in an overlay,
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
          const votersInView = row.voters.slice(0, 6);
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
                { opacity: pressed ? 0.9 : 1 },
              ]}
            >
              {isWinner ? (
                <View pointerEvents="none" style={styles.winnerHeading}>
                  <Crown color="#FFE066" size={26} fill="#FFE066" strokeWidth={2} />
                  <View style={styles.ribbon}>
                    <Text style={styles.ribbonText}>EN ZARTALAYAN!</Text>
                  </View>
                </View>
              ) : null}

              <View style={[styles.barShadow, { backgroundColor: palette.shadow }]}>
                <LinearGradient
                  colors={[palette.top, palette.bottom]}
                  style={styles.bar}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                >
                  <Text
                    style={[styles.answer, { color: palette.text }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {row.choice.text}
                  </Text>
                  {row.isMyPick ? (
                    <View style={styles.yourPickDot}>
                      <Check color="#FFFFFF" size={11} strokeWidth={3} />
                    </View>
                  ) : null}
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
                            marginLeft: voteIndex > 0 ? -7 : 0,
                            zIndex: votersInView.length - voteIndex,
                            borderColor: voter.id === currentPlayerId ? '#FF6F37' : '#5A276F',
                          }]}
                        >
                          <Avatar avatarKey={voter.avatarUrl ?? voter.avatarKey} userId={voter.id} size={22} />
                        </View>
                      ))}
                    </View>
                  ) : null}
                </LinearGradient>
              </View>

              <View style={[styles.author, { borderColor: isWinner ? '#FFDD58' : '#D2BFFA' }]}>
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
  list: { flexGrow: 1, paddingTop: 34, paddingBottom: 14, paddingHorizontal: 10, justifyContent: 'center', gap: 11 },
  barWrap: { position: 'relative', marginLeft: 13, marginRight: 2 },
  barWinner: { marginTop: 15 },
  barShadow: { borderRadius: 15, paddingBottom: 5, overflow: 'hidden' },
  bar: { minHeight: 51, borderRadius: 15, justifyContent: 'center', paddingLeft: 29, paddingRight: 38, overflow: 'visible' },
  answer: { textAlign: 'center', fontFamily: 'Poppins-Bold', fontSize: 13.2, lineHeight: 18 },
  author: {
    position: 'absolute', left: -14, top: 8, width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, backgroundColor: '#27143B', justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  correctOwner: { width: 33, height: 33, borderRadius: 17, backgroundColor: '#2DA45C', alignItems: 'center', justifyContent: 'center' },
  unknownOwner: { color: '#FFFFFF', fontFamily: 'Poppins-Bold' },
  voters: { position: 'absolute', right: 8, bottom: 3, flexDirection: 'row', alignItems: 'center' },
  voter: {
    width: 26, height: 26, borderRadius: 13, overflow: 'hidden', justifyContent: 'center',
    alignItems: 'center', borderWidth: 2, backgroundColor: '#1D1434',
  },
  extraVotes: { zIndex: 1, borderRadius: 12, paddingHorizontal: 4, backgroundColor: '#E47F20', alignItems: 'center', justifyContent: 'center', minWidth: 23, height: 23 },
  extraVotesText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 9 },
  winnerHeading: { position: 'absolute', top: -37, alignSelf: 'center', zIndex: 5, alignItems: 'center' },
  ribbon: { minWidth: 117, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 3, backgroundColor: '#A226EA', borderBottomWidth: 4, borderBottomColor: '#5913A1', transform: [{ rotate: '-1deg' }] },
  ribbonText: { fontFamily: 'Poppins-Bold', fontSize: 9, color: '#FFFFFF' },
  yourPickDot: { position: 'absolute', top: 4, right: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#B32269', alignItems: 'center', justifyContent: 'center' },
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
