import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, ChevronDown, Flag, RotateCcw } from 'lucide-react-native';
import {
  Screen,
  Button,
  Card,
  Avatar,
  StaggerRow,
  StickyActionBar,
} from '@/components/ui';
import { spacing, typography, radii } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import { QUESTIONS, type Question } from '@/features/game/questions';
import { resolveZartoRound } from '@/features/game/engine';
import type { RoundRevealChoice } from '@/services/types';
import { soundService } from '@/services/soundService';
import { buildRevealedChoices } from '@/features/game/revealPresentation';
import { RoundChoiceReveal } from '@/components/game/RoundChoiceReveal';
import { RoundCompactOutcome } from '@/components/game/RoundCompactOutcome';

export default function ResultScreen() {
  const { colors, mode } = useTheme();
  const styles = useThemeStyles((themeColors) => createStyles(themeColors, mode));
  const { roomState, currentPlayer, roomCode, service } = useGameStore();
  const params = useLocalSearchParams<{ round?: string | string[]; questionId?: string | string[] }>();
  const [initialResult] = useState(() => ({
    round: roomState?.currentRound ?? 1,
    questionId: roomState?.currentQuestionId ?? null,
  }));
  const rawRound = Array.isArray(params.round) ? params.round[0] : params.round;
  const rawQuestionId = Array.isArray(params.questionId) ? params.questionId[0] : params.questionId;
  const parsedRound = rawRound ? Number(rawRound) : Number.NaN;
  const resultRound = Number.isInteger(parsedRound) && parsedRound > 0
    ? parsedRound
    : initialResult.round;
  const resultQuestionId = rawQuestionId || initialResult.questionId;
  const isStaleResult = !roomState || (
    roomState.currentRound !== resultRound ||
    (resultQuestionId !== null && roomState.currentQuestionId !== resultQuestionId) ||
    !['reveal', 'scoreboard', 'game_over'].includes(roomState.phase)
  );
  const { trigger } = useHaptics();
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [loadedQuestion, setLoadedQuestion] = useState<Question | null>(null);
  const [revealChoices, setRevealChoices] = useState<RoundRevealChoice[] | null>(null);
  const [revealLoadError, setRevealLoadError] = useState<string | null>(null);
  const [revealRetry, setRevealRetry] = useState(0);
  const playedResultSound = useRef<string | null>(null);

  const currentQId = resultQuestionId || roomState?.currentQuestionId || QUESTIONS[0].id;
  const localQuestion = QUESTIONS.find((q) => q.id === currentQId);
  const question: Question = loadedQuestion?.id === currentQId
    ? loadedQuestion
    : localQuestion || QUESTIONS[0];
  const currentRoomPhase = roomState?.phase;

  useEffect(() => {
    if (!isStaleResult || !roomState) return;
    switch (roomState.phase) {
      case 'ability_select':
        router.replace('/ability-select');
        break;
      case 'fake_answer':
      case 'guess':
        router.replace('/question');
        break;
      case 'scoreboard':
        router.replace('/scoreboard');
        break;
      case 'game_over':
        router.replace('/game-over');
        break;
      case 'lobby':
        router.replace('/lobby');
        break;
      default:
        router.replace('/waiting');
    }
  }, [isStaleResult, roomState]);

  useEffect(() => {
    if (!roomCode || !['reveal', 'scoreboard', 'game_over'].includes(currentRoomPhase ?? '')) {
      return;
    }
    let cancelled = false;
    void service.getRoundReveal(roomCode)
      .then((rows) => {
        if (!cancelled) {
          setRevealChoices(rows);
          setRevealLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRevealChoices(null);
          setRevealLoadError(error instanceof Error ? error.message : 'Tur özeti yüklenemedi.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentRoomPhase, roomCode, service, revealRetry]);

  useEffect(() => {
    if (!roomCode || !currentRoomPhase || currentRoomPhase === 'lobby') return;
    let cancelled = false;
    void service.getCurrentQuestion(roomCode).then((nextQuestion) => {
      if (!cancelled && nextQuestion?.id === currentQId) setLoadedQuestion(nextQuestion);
    }).catch((error: unknown) => {
      if (!cancelled) setAdvanceError(error instanceof Error ? error.message : 'Soru yüklenemedi.');
    });
    return () => {
      cancelled = true;
    };
  }, [currentQId, currentRoomPhase, roomCode, service]);

  const playersList = roomState ? Object.values(roomState.players) : [];
  const me = playersList.find((p) => p.id === currentPlayer?.id) || currentPlayer;
  const isHost = me?.isHost ?? false;

  const resolvedRound = roomState && playersList.some((player) => !roomState.roundResults?.[player.id])
    ? resolveZartoRound({
      question,
      players: playersList,
      choices: roomState.choices || [],
      picks: roomState.picks || {},
      fakeAnswers: roomState.fakeAnswers || {},
      abilityActions: roomState.abilityActions || [],
    })
    : null;
  const roundResults = { ...resolvedRound?.rows, ...roomState?.roundResults };
  const myResult = me ? roundResults[me.id] : undefined;
  const revealed = revealChoices ? buildRevealedChoices(revealChoices, playersList, me?.id) : [];
  const myPicked = revealed.find((r) => r.isMyPick);
  const myTrappedPlayers = revealed.filter((r) => r.isMyTrap).flatMap((r) => r.voters);
  const correctAnswerText = revealChoices?.find((c) => c.isCorrect)?.text
    ?? roomState?.choices?.find((c) => c.isCorrect)?.text ?? question.correctAnswer;
  const outcome = myResult?.outcome;
  const pointsDelta = myResult?.pointsDelta ?? 0;
  const victimsCount = myResult?.victimsCount ?? outcome?.victimsCount ?? myTrappedPlayers.length;
  const isCorrect = !!outcome?.correct || !!myPicked?.choice.isCorrect;
  const zartaladın = !!outcome?.zartaladın || victimsCount > 0 || myTrappedPlayers.length > 0;
  const myDeception = myPicked && !myPicked.choice.isCorrect && !!myPicked.choice.authorId ? myPicked.choice : null;
  const zartalandın = !!outcome?.zartalandın || !!myDeception;
  const myChoiceText = myPicked?.choice.text ?? myResult?.pickedText ?? null;
  const didPick = !!myChoiceText;
  const myDeceptionAuthor = playersList.find((p) => p.id === (myDeception?.authorId ?? myResult?.deceivedByAuthorId));
  const positiveScoreColor = mode === 'light' ? '#435B17' : colors.lime;
  const negativeScoreColor = mode === 'light' ? '#B42318' : colors.dangerSoft;

  useEffect(() => {
    if (isStaleResult || !myResult) return;
    const resultSoundKey = `${roomCode ?? 'local'}:${resultRound}:${me?.id ?? 'unknown'}`;
    if (playedResultSound.current === resultSoundKey) return;
    playedResultSound.current = resultSoundKey;

    if (zartalandın) {
      soundService.play('zartalanma');
      trigger('heavy');
    } else if (isCorrect) {
      soundService.play('true');
      trigger(zartaladın ? 'success' : 'light');
    } else if (zartaladın) {
      soundService.play('true');
      trigger('success');
    } else {
      trigger('warning');
    }
  }, [myResult, isCorrect, zartaladın, zartalandın, trigger, roomCode, resultRound, isStaleResult, me?.id]);

  const handleNext = async () => {
    trigger('medium');
    setAdvanceError(null);
    if (isHost && roomCode) {
      setAdvancing(true);
      try {
        await service.advancePhase(roomCode);
      } catch (error) {
        setAdvanceError((error as Error).message || 'Aşama ilerletilemedi.');
        setAdvancing(false);
        return;
      }
      setAdvancing(false);
    }
    router.replace('/scoreboard');
  };

  if (isStaleResult) {
    return (
      <Screen gradient diagonalSlice>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: colors.textPrimary, textAlign: 'center', fontFamily: 'Poppins-SemiBold', fontSize: 16 }}>
            {roomState ? 'Bu turun sonucu kapandı. Güncel oyun aşamasına yönlendiriliyorsun…' : 'Tur bilgileri eşitleniyor…'}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen gradient diagonalSlice>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <RoundCompactOutcome
          round={resultRound}
          totalRounds={roomState?.config.totalRounds ?? 5}
          points={pointsDelta}
          trappedCount={zartaladın ? victimsCount : 0}
          correct={isCorrect}
          tricked={zartalandın}
          answered={didPick}
          pickedAnswer={myChoiceText}
          correctAnswer={correctAnswerText}
          trickedBy={myDeceptionAuthor?.name}
        />

        {revealLoadError ? (
          <Card variant="surface" style={styles.revealStatusCard}>
            <Text accessibilityRole="alert" style={styles.summaryMessage}>Seçimler alınamadı: {revealLoadError}</Text>
            <Text style={styles.summaryMessage}>Gerçek cevap: {correctAnswerText}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Seçimleri yeniden yükle"
              style={styles.revealRetryButton}
              onPress={() => {
                setRevealChoices(null);
                setRevealLoadError(null);
                setRevealRetry((n) => n + 1);
              }}
            >
              <RotateCcw size={14} color="#FFFFFF" />
              <Text style={styles.revealRetryText}>Tekrar Dene</Text>
            </Pressable>
          </Card>
        ) : revealChoices === null ? (
          <Card variant="surface" style={styles.revealStatusCard}>
            <Text style={styles.summaryMessage}>Seçimler yükleniyor…</Text>
          </Card>
        ) : revealChoices.length === 0 ? (
          <Card variant="surface" style={styles.revealStatusCard}>
            <Text style={styles.summaryMessage}>Bu tur için seçenek dağılımı bulunamadı.</Text>
            <Text style={styles.summaryMessage}>Gerçek cevap: {correctAnswerText}</Text>
          </Card>
        ) : (
          <RoundChoiceReveal choices={revealChoices} players={playersList} currentPlayerId={me?.id} />
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          onPress={() => setShowDetails((previous) => !previous)}
          style={[styles.moreDetails, { borderColor: colors.borderStrong, backgroundColor: colors.bgCard }]}
        >
          <Text style={[styles.moreDetailsText, { color: colors.textPrimary }]}>
            Tur puanları ve diğer ayrıntılar
          </Text>
          <ChevronDown
            color={colors.purpleSoft}
            size={17}
            style={{ transform: [{ rotate: showDetails ? '180deg' : '0deg' }] }}
          />
        </Pressable>

        {showDetails ? (
          <View style={styles.detailsContent}>
        {roomState?.config.gameMode === 'suspicious' ? (
          <>
            <Text style={styles.sectionTitle}>DEDEKTİF ŞÜPHE RAPORU</Text>
            <Card variant="surface" style={styles.summaryCard}>
              {playersList.filter((p) => roundResults[p.id]?.suspectId).length > 0 ? (
                playersList
                  .filter((p) => roundResults[p.id]?.suspectId)
                  .map((player) => {
                    const row = roundResults[player.id];
                    const suspected = playersList.find((cand) => cand.id === row?.suspectId);
                    const wasCorrect = !!row?.suspectBonus;
                    return (
                      <View key={player.id} style={styles.deductionRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <Avatar avatarKey={player.avatarUrl ?? player.avatarKey} userId={player.id} size={26} />
                          <Text style={styles.deductionPlayerName} numberOfLines={1}>{player.name}</Text>
                          <ArrowRight size={13} color={colors.textSecondary} />
                          <Avatar avatarKey={suspected?.avatarUrl ?? suspected?.avatarKey ?? 'fox'} userId={suspected?.id} size={26} />
                          <Text style={styles.deductionSuspectName} numberOfLines={1}>{suspected?.name}</Text>
                        </View>
                        <View style={[styles.deductionBadge, wasCorrect ? styles.deductionBadgeCorrect : styles.deductionBadgeWrong]}>
                          <Text style={[styles.deductionBadgeText, wasCorrect ? styles.deductionBadgeTextCorrect : styles.deductionBadgeTextWrong]}>
                            {wasCorrect ? '+1 DEDEKTİF' : 'YANILDI'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
              ) : (
                <Text style={styles.summaryMessage}>Bu tur kimse dedektif şüphesi göndermedi.</Text>
              )}
            </Card>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>TUR PUANLARI</Text>
        <View style={styles.playersListWrap}>
          {playersList
            .slice()
            .sort((first, second) =>
              (roundResults[second.id]?.pointsDelta ?? 0) - (roundResults[first.id]?.pointsDelta ?? 0)
            )
            .map((player, idx) => {
              const result = roundResults[player.id];
              const delta = result?.pointsDelta ?? 0;
              const deltaColor = delta > 0
                ? positiveScoreColor
                : delta < 0
                ? negativeScoreColor
                : colors.textSecondary;
              return (
                <StaggerRow key={player.id} index={idx} delay={50}>
                  <View style={[styles.playerRow, player.id === me?.id && styles.currentPlayerRow]}>
                    <Avatar avatarKey={player.avatarUrl ?? player.avatarKey} userId={player.id} size={38} />
                    <View style={styles.playerDetails}>
                      <View style={styles.playerNameRow}>
                        <Text style={styles.playerName} numberOfLines={1}>
                          {player.name}{player.id === me?.id ? ' (Sen)' : ''}
                        </Text>
                        {service.kind === 'supabase' && roomCode && player.id !== me?.id && !player.isBot ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${player.name} oyuncusunu bildir`}
                            style={styles.reportButton}
                            onPress={() => router.push({
                              pathname: '/report-player',
                              params: { playerId: player.id, roomCode },
                            })}
                          >
                            <Flag size={13} color={colors.textSecondary} />
                            <Text style={styles.reportText}>Bildir</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {result?.victimsCount ? (
                        <Text style={styles.playerPointsHint}>
                          {result.victimsCount} oyuncuyu tuzağa düşürdü
                        </Text>
                      ) : result?.deceivedByAuthorId ? (
                        <Text style={styles.playerPointsHint}>
                          {playersList.find((candidate) => candidate.id === result.deceivedByAuthorId)?.name ?? 'Bir oyuncunun'} tuzağına düştü
                        </Text>
                      ) : null}
                      {result?.suspectBonus ? (
                        <Text style={[styles.playerPointsHint, { color: colors.purpleSoft }]}>
                          🕵️ Dedektif: Doğru tuzakçıyı bildi (+1)
                        </Text>
                      ) : null}
                      {result?.speedBonus ? (
                        <Text style={[styles.playerPointsHint, { color: colors.yellow }]}>
                          ⚡ Yıldırım Hızı: İlk 3 saniyede bildi (+1)
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.playerPoints, { color: deltaColor }]}>
                      {delta > 0 ? '+' : ''}{delta} P
                    </Text>
                  </View>
                </StaggerRow>
              );
            })}
        </View>
          </View>
        ) : null}

      </ScrollView>
      <StickyActionBar>
        {advanceError ? (
          <Text accessibilityRole="alert" style={styles.advanceError}>{advanceError}</Text>
        ) : null}
        <Button
          label={isHost ? 'Skor Tablosuna Geç' : 'Sonuç Tablosunu Gör'}
          onPress={handleNext}
          variant="orange"
          fullWidth
          loading={advancing}
          disabled={advancing}
          icon={<ArrowRight color="#FFF" size={20} />}
        />
      </StickyActionBar>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors, mode: 'dark' | 'light') => StyleSheet.create({
  moreDetails: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 13, minHeight: 41, paddingHorizontal: 12, marginTop: 3,
  },
  moreDetailsText: { fontFamily: 'Poppins-SemiBold', fontSize: 11.5 },
  detailsContent: { paddingTop: 9 },

  resultHero: { borderWidth: 2.5, borderRadius: 26, padding: 17, paddingBottom: 22, gap: 8, alignItems: 'center', marginBottom: 13, overflow: 'hidden' },
  resultMascot: { width: 160, height: 64 },
  heroIconBadge: { width: 55, height: 55, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  resultHeroTitle: { fontFamily: 'Poppins-Bold', fontSize: 20, lineHeight: 27, textAlign: 'center' },
  resultHeroDescription: { fontFamily: 'Poppins-Medium', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  resultHeroPoints: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 99 },
  resultHeroPointsText: { fontFamily: 'Poppins-Bold', fontSize: 16 },
  heroVictimGroup: { width: '100%', gap: 6, marginTop: 4, alignItems: 'center' },
  heroVictimLabel: { fontFamily: 'Poppins-Bold', fontSize: 10, letterSpacing: 0.5 },
  heroVictimList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  heroVictim: { gap: 3, alignItems: 'center', maxWidth: 90 },
  heroVictimName: { fontFamily: 'Poppins-SemiBold', fontSize: 10, textAlign: 'center' },
  doubleSuccess: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(6,28,33,0.42)', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 6 },
  doubleSuccessText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 11 },
  personalPick: { borderWidth: 2, borderRadius: 18, padding: 14, gap: 5, marginBottom: 11 },
  personalPickLabel: { fontFamily: 'Poppins-Bold', fontSize: 10, letterSpacing: 0.7 },
  personalPickText: { fontFamily: 'Poppins-Bold', fontSize: 18, lineHeight: 25 },
  personalPickExplanation: { fontFamily: 'Poppins-SemiBold', fontSize: 12, lineHeight: 18 },
  correctAnswerStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, borderColor: '#36C96B', borderWidth: 1.5, padding: 12, marginBottom: 16 },
  correctStripLabel: { fontFamily: 'Poppins-Bold', fontSize: 10, letterSpacing: 0.5 },
  correctStripText: { fontFamily: 'Poppins-Bold', fontSize: 14, lineHeight: 21 },
  revealStatusCard: { padding: 14, alignItems: 'center', marginBottom: 14 },
  revealRetryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6D35B6', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 8, marginTop: 9 },
  revealRetryText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 12 },

  advanceError: {
    ...typography.caption,
    color: colors.dangerSoft,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  scroll: {
    paddingBottom: spacing.md,
    paddingTop: 4,
  },
  topHeader: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  mascotImage: {
    width: 230,
    height: 82,
    marginBottom: spacing.sm,
  },
  roundBadge: {
    backgroundColor: colors.bgSurfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  roundText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: 'Poppins-Bold',
  },
  headerTitleText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  scorePill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 2,
    marginTop: 8,
  },
  scorePillPos: {
    backgroundColor: mode === 'light' ? 'rgba(122, 164, 36, 0.13)' : 'rgba(198, 243, 107, 0.15)',
    borderColor: mode === 'light' ? '#7AA424' : colors.lime,
  },
  scorePillNeg: {
    backgroundColor: mode === 'light' ? 'rgba(180, 35, 24, 0.08)' : 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.danger,
  },
  scorePillZero: {
    backgroundColor: colors.bgCard,
    borderColor: colors.borderStrong,
  },
  mainScoreText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 22,
    letterSpacing: 1,
  },
  sectionTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  personalTrapCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: mode === 'light' ? 'rgba(239, 68, 68, 0.07)' : 'rgba(239, 68, 68, 0.11)',
    borderWidth: 1,
    borderColor: mode === 'light' ? '#E8A7A7' : 'rgba(239, 68, 68, 0.5)',
    gap: 6,
  },
  personalTrapLabel: { ...typography.caption, color: colors.dangerSoft, fontFamily: 'Poppins-Bold' },
  personalTrapAnswer: { fontFamily: 'Poppins-Bold', fontSize: 17, color: colors.textPrimary, lineHeight: 24 },
  personalTrapAuthor: { ...typography.small, color: colors.textSecondary },
  summaryCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  correctAnswerBox: {
    backgroundColor: mode === 'light' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: mode === 'light' ? 'rgba(21, 128, 61, 0.35)' : 'rgba(74, 222, 128, 0.35)',
    borderRadius: radii.md,
    paddingVertical: spacing.xs + 3,
    paddingHorizontal: spacing.sm + 2,
    gap: 4,
  },
  correctAnswerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  correctBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: mode === 'light' ? 'rgba(34, 197, 94, 0.18)' : 'rgba(34, 197, 94, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  correctBadgeText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 9.5,
    color: mode === 'light' ? '#15803D' : '#4ADE80',
    letterSpacing: 0.5,
  },
  correctSolversText: {
    ...typography.caption,
    fontFamily: 'Poppins-Medium',
    fontSize: 10.5,
    color: mode === 'light' ? '#166534' : '#86EFAC',
  },
  correctAnswerText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 19,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.borderStrong,
    marginVertical: spacing.sm,
  },
  summaryMessage: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  trapList: {
    gap: spacing.sm,
  },
  trapRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radii.md,
  },
  trapMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trapAnswerBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 5,
    gap: 2,
  },
  trapAnswerLabel: { fontFamily: 'Poppins-Bold', fontSize: 10, color: colors.textMuted },
  trapAnswerText: { fontFamily: 'Poppins-SemiBold', fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  trapRowMyTrap: {
    backgroundColor: mode === 'light' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.14)',
    borderWidth: 1.5,
    borderColor: mode === 'light' ? 'rgba(21, 128, 61, 0.5)' : 'rgba(74, 222, 128, 0.5)',
  },
  trapAuthor: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trapAuthorDetails: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  trapPlayerName: {
    ...typography.caption,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  trapRoleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: mode === 'light' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.20)',
    borderColor: mode === 'light' ? 'rgba(21, 128, 61, 0.4)' : 'rgba(34, 197, 94, 0.4)',
    borderWidth: 1,
    borderRadius: radii.xs,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  trapRoleBadgeMine: {
    backgroundColor: mode === 'light' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.35)',
    borderColor: '#22C55E',
  },
  trapRole: {
    fontFamily: 'Poppins-Bold',
    fontSize: 9,
    color: mode === 'light' ? '#15803D' : '#4ADE80',
    letterSpacing: 0.5,
  },
  trapRoleMine: {
    color: mode === 'light' ? '#166534' : '#86EFAC',
  },
  trapVictims: {
    flex: 1.3,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  trapVictim: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: mode === 'light' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: mode === 'light' ? 'rgba(220, 38, 38, 0.45)' : 'rgba(239, 68, 68, 0.5)',
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  trapVictimMe: {
    backgroundColor: mode === 'light' ? 'rgba(220, 38, 38, 0.22)' : 'rgba(239, 68, 68, 0.32)',
    borderColor: '#EF4444',
  },
  trapVictimName: {
    ...typography.caption,
    color: mode === 'light' ? '#991B1B' : '#FCA5A5',
    fontFamily: 'Poppins-Medium',
    maxWidth: 90,
  },
  playersListWrap: {
    gap: 8,
    marginBottom: spacing.lg,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  currentPlayerRow: {
    borderColor: colors.borderAccent,
    backgroundColor: colors.orangeSurface,
  },
  playerDetails: {
    flex: 1,
    minWidth: 0,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reportText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: 'Poppins-Medium',
  },
  playerName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  playerPointsHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  playerPoints: {
    ...typography.bodyMedium,
    fontFamily: 'Poppins-Bold',
    minWidth: 54,
    textAlign: 'right',
  },
  deductionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  deductionPlayerName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: colors.textPrimary,
    maxWidth: 80,
  },
  deductionSuspectName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: colors.textSecondary,
    maxWidth: 80,
  },
  deductionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  deductionBadgeCorrect: {
    backgroundColor: mode === 'light' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.25)',
  },
  deductionBadgeWrong: {
    backgroundColor: mode === 'light' ? 'rgba(100, 100, 120, 0.12)' : 'rgba(255, 255, 255, 0.08)',
  },
  deductionBadgeText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 9.5,
    letterSpacing: 0.5,
  },
  deductionBadgeTextCorrect: {
    color: mode === 'light' ? '#15803D' : '#4ADE80',
  },
  deductionBadgeTextWrong: {
    color: colors.textMuted,
  },
});
