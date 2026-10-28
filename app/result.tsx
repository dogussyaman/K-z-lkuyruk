import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Check, Search, Zap } from 'lucide-react-native';
import {
  Screen,
  Button,
  Card,
  Avatar,
  PopView,
  StaggerRow,
  StickyActionBar,
} from '@/components/ui';
import { spacing, typography, radii } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import { QUESTIONS, type Question } from '@/features/game/questions';
import { resolveZartoRound } from '@/features/game/engine';
import type { RoundRevealChoice } from '@/services/types';
import { mascotImages } from '@/assets/illustrations';
import { soundService } from '@/services/soundService';

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
  const [loadedQuestion, setLoadedQuestion] = useState<Question | null>(null);
  const [revealChoices, setRevealChoices] = useState<RoundRevealChoice[] | null>(null);
  const [revealLoadError, setRevealLoadError] = useState<string | null>(null);
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
          setRevealChoices([]);
          setRevealLoadError(error instanceof Error ? error.message : 'Tur özeti yüklenemedi.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentRoomPhase, roomCode, service]);

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
  const trapSummaries = (revealChoices ?? []).flatMap((choice) => {
    if (!choice.authorId) return [];
    const author = playersList.find((player) => player.id === choice.authorId);
    const victims = choice.pickedBy
      .map((id) => playersList.find((player) => player.id === id))
      .filter((player) => player !== undefined);
    return author && victims.length > 0
      ? [{ choiceIndex: choice.choiceIndex, author, victims }]
      : [];
  });

  const correctRevealChoice = revealChoices?.find((choice) => choice.isCorrect);
  const correctChoice = correctRevealChoice ?? roomState?.choices?.find((choice) => choice.isCorrect);
  const correctAnswerText = correctChoice?.text || question?.correctAnswer;
  const pickedCorrectSolvers = (correctRevealChoice?.pickedBy ?? [])
    .map((id) => playersList.find((player) => player.id === id))
    .filter((player): player is NonNullable<typeof player> => player !== undefined);
  const resultCorrectSolvers = playersList.filter((player) => {
    const res = roundResults[player.id];
    return res?.outcome?.correct;
  });
  const effectiveCorrectSolvers = pickedCorrectSolvers.length > 0
    ? pickedCorrectSolvers
    : resultCorrectSolvers;
  const didMeKnow = effectiveCorrectSolvers.some((p) => p.id === me?.id);
  const solverCount = effectiveCorrectSolvers.length;
  let solversSummaryText = '';
  if (solverCount > 0) {
    if (didMeKnow) {
      solversSummaryText = solverCount === 1 ? 'Sen bildin! 🎯' : `${solverCount} kişi bildi (Sen dahil)`;
    } else {
      solversSummaryText = solverCount === 1 ? `${effectiveCorrectSolvers[0].name} bildi` : `${solverCount} kişi bildi`;
    }
  } else {
    solversSummaryText = 'Bilen çıkmadı';
  }

  const outcome = myResult?.outcome;
  const pointsDelta = myResult?.pointsDelta ?? 0;
  const victimsCount = myResult?.victimsCount ?? outcome?.victimsCount ?? 0;
  const isCorrect = !!outcome?.correct;
  const zartaladın = !!outcome?.zartaladın || victimsCount > 0;
  const zartalandın = !!outcome?.zartalandın;
  const didPick = myResult?.pickedText !== undefined && myResult?.pickedText !== null;
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

  const headerTitle = zartaladın && isCorrect
    ? 'ÇİFTE BAŞARI! HEM BİLDİN HEM TUZAĞA DÜŞÜRDÜN!'
    : zartaladın
    ? 'TUZAĞA DÜŞÜRDÜN! RAKİPLER TUZAĞINA DÜŞTÜ!'
    : zartalandın
    ? 'TUZAĞA DÜŞTÜN! SAHTEYE KANDIN!'
    : isCorrect
    ? 'DOĞRU BİLDİN!'
    : !didPick
    ? 'CEVAP VERMEDİN!'
    : 'YANLIŞ TAHMİN!';

  return (
    <Screen gradient diagonalSlice>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Mascot Hero Banner */}
        <View style={styles.topHeader}>
          <Image source={mascotImages.brand} style={styles.mascotImage} resizeMode="contain" />

          <View style={styles.roundBadge}>
            <Text style={styles.roundText}>
              Tur {resultRound} / {roomState?.config.totalRounds ?? 5} Sonucu
            </Text>
          </View>

          <Text style={styles.headerTitleText}>{headerTitle}</Text>

          <PopView delay={100} duration={350}>
            <View
              style={[
                styles.scorePill,
                pointsDelta > 0
                  ? styles.scorePillPos
                  : pointsDelta < 0
                  ? styles.scorePillNeg
                  : styles.scorePillZero,
              ]}
            >
              <Text
                style={[
                  styles.mainScoreText,
                  pointsDelta > 0
                    ? { color: positiveScoreColor }
                    : pointsDelta < 0
                    ? { color: negativeScoreColor }
                    : { color: colors.textSecondary },
                ]}
              >
                {pointsDelta > 0 ? `+${pointsDelta}` : pointsDelta} PUAN
              </Text>
            </View>
          </PopView>
        </View>

        <Text style={styles.sectionTitle}>KİM KİMİ TUZAĞA DÜŞÜRDÜ?</Text>
        <Card variant="surface" style={styles.summaryCard}>
          {correctAnswerText ? (
            <View style={styles.correctAnswerBox}>
              <View style={styles.correctAnswerHeader}>
                <View style={styles.correctBadge}>
                  <Check size={11} color={mode === 'light' ? '#15803D' : '#4ADE80'} strokeWidth={3} />
                  <Text style={styles.correctBadgeText}>DOĞRU SEÇENEK</Text>
                </View>
                {revealChoices !== null || effectiveCorrectSolvers.length > 0 ? (
                  <Text style={styles.correctSolversText}>
                    {solversSummaryText}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.correctAnswerText} numberOfLines={2}>
                {correctAnswerText}
              </Text>
            </View>
          ) : null}

          {correctAnswerText ? <View style={styles.summaryDivider} /> : null}

          {revealLoadError ? (
            <Text accessibilityRole="alert" style={styles.summaryMessage}>{revealLoadError}</Text>
          ) : revealChoices === null ? (
            <Text style={styles.summaryMessage}>Tur özeti yükleniyor...</Text>
          ) : trapSummaries.length > 0 ? (
            <View style={styles.trapList}>
              {trapSummaries.map(({ choiceIndex, author, victims }) => {
                const isMyTrap = author.id === me?.id;
                return (
                  <View
                    key={choiceIndex}
                    style={[
                      styles.trapRow,
                      isMyTrap && styles.trapRowMyTrap,
                    ]}
                  >
                    <View style={styles.trapAuthor}>
                      <Avatar avatarKey={author.avatarUrl ?? author.avatarKey} userId={author.id} size={38} />
                      <View style={styles.trapAuthorDetails}>
                        <Text style={styles.trapPlayerName} numberOfLines={1}>
                          {author.name}{isMyTrap ? ' (Sen)' : ''}
                        </Text>
                        <View style={[styles.trapRoleBadge, isMyTrap && styles.trapRoleBadgeMine]}>
                          <Text style={[styles.trapRole, isMyTrap && styles.trapRoleMine]}>
                            {isMyTrap ? 'TUZAĞA DÜŞÜRDÜN' : 'TUZAĞI KURDU'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <ArrowRight
                      color={isMyTrap ? '#22C55E' : (mode === 'light' ? '#15803D' : '#4ADE80')}
                      size={18}
                    />
                    <View style={styles.trapVictims}>
                      {victims.map((victim) => {
                        const isMe = victim.id === me?.id;
                        return (
                          <View
                            key={victim.id}
                            style={[
                              styles.trapVictim,
                              isMe && styles.trapVictimMe,
                            ]}
                          >
                            <Avatar
                              avatarKey={victim.avatarUrl ?? victim.avatarKey}
                              userId={victim.id}
                              size={28}
                            />
                            <Text style={styles.trapVictimName} numberOfLines={1}>
                              {victim.name}{isMe ? ' (Sen)' : ''}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.summaryMessage}>Bu tur kimse tuzağa düşmedi.</Text>
          )}
        </Card>

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
                      <Text style={styles.playerName} numberOfLines={1}>
                        {player.name}{player.id === me?.id ? ' (Sen)' : ''}
                      </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radii.md,
  },
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
