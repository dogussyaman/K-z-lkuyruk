import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, RotateCcw } from 'lucide-react-native';
import { Screen, Button, StickyActionBar } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import { QUESTIONS, type Question } from '@/features/game/questions';
import { resolveZartoRound } from '@/features/game/engine';
import { buildRevealedChoices } from '@/features/game/revealPresentation';
import type { RoundRevealChoice } from '@/services/types';
import { soundService } from '@/services/soundService';
import { RoundChoiceReveal } from '@/components/game/RoundChoiceReveal';
import { RoundCompactOutcome } from '@/components/game/RoundCompactOutcome';

type ResultStage = 'celebration' | 'answers';

export default function ResultScreen() {
  const { colors } = useTheme();
  const { trigger } = useHaptics();
  const { roomState, currentPlayer, roomCode, service, refreshRoom } = useGameStore();
  const params = useLocalSearchParams<{ round?: string | string[]; questionId?: string | string[] }>();
  const [initialResult] = useState(() => ({
    round: roomState?.currentRound ?? 1,
    questionId: roomState?.currentQuestionId ?? null,
  }));
  const roundValue = Array.isArray(params.round) ? params.round[0] : params.round;
  const questionValue = Array.isArray(params.questionId) ? params.questionId[0] : params.questionId;
  const parsedRound = roundValue ? Number(roundValue) : Number.NaN;
  const resultRound = Number.isInteger(parsedRound) && parsedRound > 0 ? parsedRound : initialResult.round;
  const resultQuestionId = questionValue || initialResult.questionId;
  const [stage, setStage] = useState<ResultStage>('celebration');
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [loadedQuestion, setLoadedQuestion] = useState<Question | null>(null);
  const [revealChoices, setRevealChoices] = useState<RoundRevealChoice[] | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const playedSound = useRef<string | null>(null);
  const phase = roomState?.phase;
  const isStaleResult = !roomState || (
    roomState.currentRound !== resultRound ||
    (resultQuestionId !== null && roomState.currentQuestionId !== resultQuestionId) ||
    !['reveal', 'scoreboard', 'game_over'].includes(roomState.phase)
  );

  const currentQId = resultQuestionId || roomState?.currentQuestionId || QUESTIONS[0].id;
  const question = loadedQuestion?.id === currentQId
    ? loadedQuestion
    : QUESTIONS.find((item) => item.id === currentQId) ?? QUESTIONS[0];

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
    if (!roomCode || !['reveal', 'scoreboard', 'game_over'].includes(phase ?? '')) return;
    let cancelled = false;
    void service.getRoundReveal(roomCode).then((choices) => {
      if (cancelled) return;
      setRevealChoices(choices);
      setRevealError(null);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setRevealError(error instanceof Error ? error.message : 'Cevaplar alınamadı.');
    });
    return () => { cancelled = true; };
  }, [roomCode, phase, service, retryKey]);

  useEffect(() => {
    if (!roomCode || !phase || phase === 'lobby') return;
    let cancelled = false;
    void service.getCurrentQuestion(roomCode).then((nextQuestion) => {
      if (!cancelled && nextQuestion?.id === currentQId) setLoadedQuestion(nextQuestion);
    }).catch(() => {
      // The locally bundled question remains available in demo mode.
    });
    return () => { cancelled = true; };
  }, [roomCode, phase, service, currentQId]);

  const players = roomState ? Object.values(roomState.players) : [];
  const me = players.find((player) => player.id === currentPlayer?.id) || currentPlayer;
  const isHost = !!me?.isHost;
  // Live points must come from the authoritative server, not a client-side
  // estimate using possibly hidden choices or a stale room snapshot.
  const fallbackResults = service.kind === 'demo' && roomState && players.some((player) => !roomState.roundResults?.[player.id])
    ? resolveZartoRound({
      question,
      players,
      choices: roomState.choices || [],
      picks: roomState.picks || {},
      fakeAnswers: roomState.fakeAnswers || {},
      abilityActions: roomState.abilityActions || [],
      gameMode: roomState.config.gameMode,
      currentRound: roomState.currentRound,
      suspectPicks: roomState.suspectPicks || {},
      pickTimes: roomState.pickTimes || {},
      phaseStartedAt: roomState.phaseStartedAt,
    })
    : null;
  const results = { ...fallbackResults?.rows, ...roomState?.roundResults };
  const myResult = me ? results[me.id] : undefined;
  const revealRows = revealChoices ? buildRevealedChoices(revealChoices, players, me?.id) : [];
  const myPick = revealRows.find((row) => row.isMyPick);
  const trappedPlayers = revealRows.filter((row) => row.isMyTrap).flatMap((row) => row.voters);
  const trappedCount = myResult?.victimsCount ?? myResult?.outcome?.victimsCount ?? trappedPlayers.length;
  const correct = !!myResult?.outcome?.correct || !!myPick?.choice.isCorrect;
  const tricked = !!myResult?.outcome?.zartalandın
    || !!(myPick && !myPick.choice.isCorrect && myPick.choice.authorId);
  const answered = !!(myPick || myResult?.pickedText);

  useEffect(() => {
    if (service.kind !== 'supabase' || isStaleResult || myResult) return;
    const id = setTimeout(() => { void refreshRoom().catch(() => {}); }, 1300);
    return () => clearTimeout(id);
  }, [service.kind, isStaleResult, myResult, refreshRoom]);

  useEffect(() => {
    if (isStaleResult || !myResult) return;
    const key = (roomCode || 'demo') + ':' + resultRound + ':' + (me?.id || 'unknown');
    if (playedSound.current === key) return;
    playedSound.current = key;
    if (tricked) {
      soundService.play('zartalanma');
      trigger('heavy');
    } else if (correct || trappedCount > 0) {
      soundService.play('true');
      trigger('success');
    } else {
      trigger('warning');
    }
  }, [isStaleResult, myResult, resultRound, me?.id, roomCode, tricked, correct, trappedCount, trigger]);

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
        <View style={styles.loading}>
          <Text style={[styles.status, { color: colors.textPrimary }]}>Oyun aşaması güncelleniyor…</Text>
        </View>
      </Screen>
    );
  }

  if (service.kind === 'supabase' && !myResult) {
    return (
      <Screen gradient diagonalSlice>
        <View style={styles.loading}>
          <Text style={[styles.status, { color: colors.textPrimary }]}>
            Turun puanları sunucudan doğrulanıyor…
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => { void refreshRoom().catch(() => {}); }}
            style={[styles.retry, { backgroundColor: colors.purple }]}
          >
            <RotateCcw color="#FFFFFF" size={16} />
            <Text style={styles.retryText}>Yeniden kontrol et</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen gradient diagonalSlice padded={stage !== 'celebration'}>
      {stage === 'celebration' ? (
        <RoundCompactOutcome
          trappedPlayers={trappedPlayers}
          trappedCount={trappedCount}
          correct={correct}
          tricked={tricked}
          answered={answered}
          result={myResult}
        />
      ) : revealError ? (
        <View style={styles.loading}>
          <Text accessibilityRole="alert" style={[styles.status, { color: colors.textPrimary }]}>{revealError}</Text>
          <Pressable
            accessibilityRole="button"
            style={[styles.retry, { backgroundColor: colors.purple }]}
            onPress={() => {
              setRevealError(null);
              setRevealChoices(null);
              setRetryKey((count) => count + 1);
            }}
          >
            <RotateCcw color="#FFFFFF" size={16} />
            <Text style={styles.retryText}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : revealChoices === null ? (
        <View style={styles.loading}>
          <Text style={[styles.status, { color: colors.textPrimary }]}>Cevaplar açıklanıyor…</Text>
        </View>
      ) : revealChoices.length === 0 ? (
        <View style={styles.loading}>
          <Text style={[styles.status, { color: colors.textPrimary }]}>Bu tur için seçim kaydı yok.</Text>
        </View>
      ) : (
        <RoundChoiceReveal
          choices={revealChoices}
          players={players}
          currentPlayerId={me?.id}
          onReportPlayer={service.kind === 'supabase' && roomCode
            ? (playerId) => router.push({ pathname: '/report-player', params: { playerId, roomCode } })
            : undefined}
        />
      )}

      <StickyActionBar style={stage === 'celebration' ? styles.celebrationActionBar : undefined}>
        {advanceError ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.dangerSoft }]}>{advanceError}</Text>
        ) : null}
        <Button
          label={stage === 'celebration' ? 'Kim Neyi Seçti?' : 'Skor Tablosuna Geç'}
          icon={<ArrowRight color="#FFFFFF" size={20} />}
          onPress={stage === 'celebration'
            ? () => { trigger('light'); setStage('answers'); }
            : handleNext}
          variant="orange"
          fullWidth
          loading={advancing}
          disabled={advancing}
        />
      </StickyActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  celebrationActionBar: { paddingHorizontal: 18 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 12 },
  status: { fontFamily: 'Poppins-SemiBold', fontSize: 13, textAlign: 'center' },
  error: { textAlign: 'center', fontFamily: 'Poppins-Medium', fontSize: 11, marginBottom: 5 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 18, paddingHorizontal: 17, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 12 },
});
