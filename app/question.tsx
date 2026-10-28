import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Clock, Send, Sparkles, AlertCircle, CheckCircle2, Lock, Pause, Play, LogOut, Info, Search, Zap } from 'lucide-react-native';
import {
  Screen,
  Button,
  Card,
  Avatar,
  Badge,
  StaggerRow,
  PopView,
  PulseView,
  StickyActionBar,
  Input,
  FloatingToast,
} from '@/components/ui';
import { colors, spacing, typography, radii, shadows } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import { QUESTIONS, type Question } from '@/features/game/questions';
import type { RoundChoice } from '@/types/game';
import { mascotImages } from '@/assets/illustrations';
import { soundService } from '@/services/soundService';
import { usePrototype } from '@/features/prototype/PrototypeProvider';
import { useSound } from '@/hooks/useSound';
import { getRemainingSeconds, getServerNowMs } from '@/services/serverClock';

export default function QuestionScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const {
    roomCode,
    roomState,
    currentPlayer,
    service,
    refreshRoom,
    isLive,
    setRoomCode,
    setRoomState,
  } = useGameStore();
  const prototype = usePrototype();
  const { trigger } = useHaptics();
  const { enabled: soundEnabled, ready: soundPreferenceReady } = useSound();

  const totalTime = roomState?.config.roundSeconds ?? 20;
  const [secondsLeft, setSecondsLeft] = useState(totalTime);
  const [deadlineCountdown, setDeadlineCountdown] = useState<{
    deadline: number;
    secondsLeft: number;
  } | null>(null);
  const deadline = roomState?.phaseDeadlineAt;
  const pausedAt = roomState?.pausedAt;
  const displayedSecondsLeft =
    isLive && deadline !== null && deadline !== undefined
      ? pausedAt !== null && pausedAt !== undefined
        ? Math.max(0, Math.ceil((deadline - pausedAt) / 1000))
        : deadlineCountdown?.deadline === deadline
          ? deadlineCountdown.secondsLeft
          : getRemainingSeconds(deadline, getServerNowMs())
      : secondsLeft;
  const [fakeAnswerText, setFakeAnswerText] = useState('');
  const [fakeSubmitted, setFakeSubmitted] = useState(false);
  const [choices, setChoices] = useState<RoundChoice[]>([]);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topToast, setTopToast] = useState<{ title: string; message: string; tone?: 'warning' | 'danger' } | null>(null);
  const [blockedPrankRevealed, setBlockedPrankRevealed] = useState(false);
  const [blockedPrankSending, setBlockedPrankSending] = useState(false);
  const [pauseUpdating, setPauseUpdating] = useState(false);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [leavingGame, setLeavingGame] = useState(false);
  const [loadedQuestion, setLoadedQuestion] = useState<Question | null>(null);
  const [suspectedRivalId, setSuspectedRivalId] = useState<string | null>(null);
  const isGamePaused = roomState?.pausedAt != null;

  const handleSelectSuspect = async (rivalId: string) => {
    if (!roomCode || hasSubmittedPick || pickCommitted.current) return;
    soundService.play('click');
    trigger('light');
    try {
      await service.submitSuspectPick(roomCode, rivalId);
      setSuspectedRivalId(rivalId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Şüpheli seçimi kaydedilemedi.');
    }
  };

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockedPrankTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockedFeedbackRoundRef = useRef<string | null>(null);
  const showTopToast = useCallback((message: string, title = 'Dikkat', tone: 'warning' | 'danger' = 'danger') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setTopToast({ title, message, tone });
    toastTimeoutRef.current = setTimeout(() => {
      setTopToast(null);
    }, 5000);
  }, []);

  const pickSubmissionInProgress = useRef(false);
  const pickCommitted = useRef(false);
  const clockPlayedFake = useRef(false);
  const clockPlayedGuess = useRef(false);
  const clockAttemptedFake = useRef(false);
  const clockAttemptedGuess = useRef(false);
  const clockRequestId = useRef(0);
  const prevIsGuessPhase = useRef(false);
  const isFirstMount = useRef(true);
  const expirationRequested = useRef<string | null>(null);
  const acknowledgedQuestion = useRef<string | null>(null);
  const choicesRequestId = useRef(0);

  useEffect(() => {
    if (!isLive || deadline === null || deadline === undefined) return;
    const updateCountdown = () => {
      setDeadlineCountdown({
        deadline,
        secondsLeft: getRemainingSeconds(deadline, pausedAt ?? getServerNowMs()),
      });
    };
    const initialUpdate = setTimeout(updateCountdown, 0);
    const timer = setInterval(() => {
      updateCountdown();
    }, 1000);
    return () => {
      clearTimeout(initialUpdate);
      clearInterval(timer);
    };
  }, [isLive, deadline, pausedAt]);

  // Active question
  const currentQId = roomState?.currentQuestionId || QUESTIONS[0].id;
  const localQuestion = QUESTIONS.find((q) => q.id === currentQId);
  const question: Question = loadedQuestion?.id === currentQId
    ? loadedQuestion
    : localQuestion || QUESTIONS[0];
  const currentRoomRound = roomState?.currentRound;
  const currentRoomPhase = roomState?.phase;

  useEffect(() => {
    if (!roomCode || currentRoomRound === undefined || !currentRoomPhase || currentRoomPhase === 'lobby') return;
    let cancelled = false;
    void service.getCurrentQuestion(roomCode).then((nextQuestion) => {
      if (!cancelled && nextQuestion?.id === currentQId) setLoadedQuestion(nextQuestion);
    }).catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : 'Soru yüklenemedi.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentQId, currentRoomPhase, currentRoomRound, roomCode, service]);

  useEffect(() => {
    if (!roomCode || currentRoomRound === undefined || question.id !== currentQId
      || !currentRoomPhase || !['ability_select', 'fake_answer', 'guess'].includes(currentRoomPhase)) {
      return;
    }
    const questionKey = `${roomCode}:${currentRoomRound}:${currentQId}`;
    if (acknowledgedQuestion.current === questionKey) return;

    acknowledgedQuestion.current = questionKey;
    setError(null);
    void service.markCurrentQuestionSeen(roomCode).catch((cause: unknown) => {
      acknowledgedQuestion.current = null;
      setError(cause instanceof Error ? cause.message : 'Soru geçmişi kaydedilemedi.');
    });
  }, [currentQId, currentRoomPhase, currentRoomRound, question.id, roomCode, service]);

  const playersList = roomState ? Object.values(roomState.players) : [];
  const me = playersList.find((p) => p.id === currentPlayer?.id) || currentPlayer;
  const isBlocked = !!me?.isBlockedCurrentRound;
  const isEliminated = roomState?.config.gameMode === 'survival' && (me?.livesRemaining ?? 3) <= 0;
  const hasSubmittedFake = fakeSubmitted || (
    roomState?.phase === 'fake_answer'
    && currentPlayer !== null
    && roomState.progress?.submissionStatus[currentPlayer.id] === true
  );
  const hasSubmittedPick = roomState?.phase === 'guess'
    && currentPlayer !== null
    && roomState.progress?.submissionStatus[currentPlayer.id] === true;

  // Determine sub-phase: 'fake_answer' or 'guess'
  // Render the answer-choice stage only after the authoritative room phase says `guess`.
  // A stale/late choices response must never advance the player out of the answer-entry stage.
  const isGuessPhase = roomState?.phase === 'guess';

  // Reset timer & clock state when new question begins
  useEffect(() => {
    clockRequestId.current += 1;
    if (isFirstMount.current) {
      isFirstMount.current = false;
      prevIsGuessPhase.current = isGuessPhase;
      return;
    }
    clockPlayedFake.current = false;
    clockPlayedGuess.current = false;
    clockAttemptedFake.current = false;
    clockAttemptedGuess.current = false;
    setFakeSubmitted(false);
    setFakeAnswerText('');
    setBlockedPrankRevealed(false);
    setBlockedPrankSending(false);
    setSuspectedRivalId(null);
    blockedFeedbackRoundRef.current = null;
    if (blockedPrankTimeoutRef.current) clearTimeout(blockedPrankTimeoutRef.current);
    setChoices([]);
    setSelectedChoiceIndex(null);
    pickCommitted.current = false;
    setSecondsLeft(totalTime);
    expirationRequested.current = null;
    soundService.stop('clock');
  }, [currentQId, currentRoomRound, totalTime]);

  useEffect(() => {
    if (
      currentPlayer
      && roomState?.phase === 'guess'
      && roomState.progress?.submissionStatus[currentPlayer.id] === true
    ) {
      router.replace('/waiting');
    }
  }, [currentPlayer?.id, roomState?.phase, roomState?.progress]);

  // If the blocked player lets the bluff timer expire, reveal why no answer was submitted.
  useEffect(() => {
    if (!isBlocked || !isGuessPhase || !roomCode) return;
    const roundKey = `${roomCode}:${roomState?.currentRound ?? 1}`;
    if (blockedFeedbackRoundRef.current === roundKey) return;
    blockedFeedbackRoundRef.current = roundKey;
    setBlockedPrankRevealed(true);
    showTopToast(
      'Süre doldu! Aynen aynen, bu tur bloklandığın için blöfün gönderilmedi. Şimdi gerçek cevabı seçebilirsin.',
      'Tilki seni işletti! 🦊',
      'danger',
    );
  }, [isBlocked, isGuessPhase, roomCode, roomState?.currentRound, showTopToast]);

  // Transition from fake_answer to guess phase: stop previous clock & reset timer
  useEffect(() => {
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    if (prevIsGuessPhase.current !== isGuessPhase) {
      clockRequestId.current += 1;
      soundService.stop('clock');
      clockPlayedFake.current = false;
      clockAttemptedFake.current = false;
      clockPlayedGuess.current = false;
      clockAttemptedGuess.current = false;
      if (isGuessPhase) {
        resetTimer = setTimeout(() => setSecondsLeft(totalTime), 0);
      }
    }
    prevIsGuessPhase.current = isGuessPhase;
    return () => {
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [isGuessPhase, totalTime]);

  // Stop clock sound when unmounting
  useEffect(() => {
    return () => {
      clockRequestId.current += 1;
      soundService.stop('clock');
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (blockedPrankTimeoutRef.current) clearTimeout(blockedPrankTimeoutRef.current);
    };
  }, []);

  // Clock sound playback: 9-second countdown audio starts once when secondsLeft < 10
  useEffect(() => {
    if (!soundPreferenceReady || !soundEnabled) {
      if (!clockPlayedFake.current) clockAttemptedFake.current = false;
      if (!clockPlayedGuess.current) clockAttemptedGuess.current = false;
      soundService.stop('clock');
      return;
    }
    if (isGamePaused) {
      clockRequestId.current += 1;
      soundService.stop('clock');
      return;
    }
    if (isBlocked && !isGuessPhase) {
      clockRequestId.current += 1;
      soundService.stop('clock');
      return;
    }
    if (hasSubmittedFake || submitting) {
      clockRequestId.current += 1;
      soundService.stop('clock');
      return;
    }
    if (displayedSecondsLeft < 10 && displayedSecondsLeft > 0) {
      if (!isGuessPhase) {
        if (!hasSubmittedFake && !submitting && !clockAttemptedFake.current) {
          clockAttemptedFake.current = true;
          const requestId = clockRequestId.current;
          void soundService.play('clock').then((started) => {
            if (started && requestId === clockRequestId.current) clockPlayedFake.current = true;
          }).catch((error: unknown) => {
            if (__DEV__) console.warn('[QuestionScreen] Could not start fake-answer countdown audio.', error);
          });
        }
      } else {
        if (!submitting && !clockAttemptedGuess.current) {
          clockAttemptedGuess.current = true;
          const requestId = clockRequestId.current;
          void soundService.play('clock').then((started) => {
            if (started && requestId === clockRequestId.current) clockPlayedGuess.current = true;
          }).catch((error: unknown) => {
            if (__DEV__) console.warn('[QuestionScreen] Could not start guess countdown audio.', error);
          });
        }
      }
    }
  }, [displayedSecondsLeft, isGuessPhase, isBlocked, hasSubmittedFake, submitting, isGamePaused, soundEnabled, soundPreferenceReady]);

  // Keep answer choices strictly scoped to the authoritative guess phase.
  // Invalidate in-flight requests when the phase changes so late responses cannot
  // leak choices into the next question/answer-entry screen.
  useEffect(() => {
    const requestId = ++choicesRequestId.current;
    if (roomState?.phase === 'reveal') {
      soundService.stop('clock');
      router.replace({
        pathname: '/result',
        params: {
          round: String(roomState.currentRound),
          questionId: String(roomState.currentQuestionId),
        },
      });
      return;
    }
    if (roomState?.phase === 'scoreboard') {
      soundService.stop('clock');
      router.replace('/scoreboard');
      return;
    }
    if (roomState?.phase !== 'guess' || !roomCode) {
      setChoices([]);
      setSelectedChoiceIndex(null);
      pickCommitted.current = false;
      return;
    }

    setChoices([]);
    setSelectedChoiceIndex(null);
    pickCommitted.current = false;
    void service.getRoundChoices(roomCode).then((list) => {
      if (choicesRequestId.current !== requestId || roomState?.phase !== 'guess') return;
      setChoices(list);
    }).catch((e) => {
      if (choicesRequestId.current === requestId) {
        setError((e as Error).message);
      }
    });
    return () => {
      if (choicesRequestId.current === requestId) choicesRequestId.current += 1;
    };
  }, [roomState?.phase, roomCode, service]);

  const handleTimeExpire = useCallback(() => {
    soundService.stop('clock');
    const stage = `${roomCode ?? ''}:${roomState?.currentRound ?? 0}:${roomState?.phase ?? ''}:${roomState?.phaseDeadlineAt ?? ''}`;
    if (submitting || !roomCode || expirationRequested.current === stage) return;
    expirationRequested.current = stage;
    setSubmitting(true);
    service.advanceExpiredPhase(roomCode)
      .then(() => refreshRoom())
      .catch((e) => {
        // Allow another attempt if the timeout RPC failed. Keeping the stage
        // latched here would permanently suppress recovery for this deadline.
        if (expirationRequested.current === stage) {
          expirationRequested.current = null;
        }
        setError((e as Error).message || 'Tur süresi tamamlanamadı. Yeniden deneniyor.');
      })
      .finally(() => setSubmitting(false));
  }, [roomCode, roomState?.currentRound, roomState?.phase, roomState?.phaseDeadlineAt, submitting, service, refreshRoom]);

  // Countdown timer (pauses when isPaused is true)
  useEffect(() => {
    if (isGamePaused) {
      soundService.stop('clock');
      return;
    }
    if (displayedSecondsLeft <= 0) {
      clockRequestId.current += 1;
      soundService.stop('clock');
      handleTimeExpire();
      return;
    }
    // Live rooms use the shared server deadline; never run a second client-local countdown.
    if (isLive) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === 4) trigger('warning');
        if (prev <= 3 && prev > 0) trigger('light');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [displayedSecondsLeft, isGuessPhase, isGamePaused, isLive, handleTimeExpire, trigger]);

  const handleTogglePause = async () => {
    soundService.play('click');
    trigger('medium');
    if (!roomCode || !me?.isHost || pauseUpdating) return;
    setPauseUpdating(true);
    setError(null);
    try {
      await service.setRoomPaused(roomCode, !isGamePaused);
      await refreshRoom();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Oyun duraklatılamadı.');
    } finally {
      setPauseUpdating(false);
    }
  };

  const handleLeaveGame = async () => {
    soundService.stop('clock');
    setLeavingGame(true);
    if (roomCode) {
      try {
        await service.leaveRoom(roomCode);
        setRoomCode(null);
        setRoomState(null);
      } catch (e) {
        setError((e as Error).message);
        setLeavingGame(false);
        return;
      }
    }
    setShowExitConfirmation(false);
    router.replace('/create-room');
  };

  const handleFakeSubmit = () => {
    const clean = fakeAnswerText.trim();
    if (!clean) {
      const emptyMsg = 'Lütfen inandırıcı bir sahte cevap yaz.';
      setError(emptyMsg);
      showTopToast(emptyMsg, 'Cevap Boş Olamaz', 'warning');
      return;
    }
    soundService.stop('clock');
    trigger('medium');

    // A blocked player can type normally, but the bluff is never sent to the server.
    // Briefly imitate a successful send, then reveal the playful block message.
    if (isBlocked) {
      const roundKey = `${roomCode ?? ''}:${roomState?.currentRound ?? 1}`;
      if (blockedFeedbackRoundRef.current === roundKey) return;
      blockedFeedbackRoundRef.current = roundKey;
      setError(null);
      setBlockedPrankSending(true);
      showTopToast('Cevabın havuza gidiyor… gözünü kırpma! 🙈', 'Cevap gönderiliyor', 'warning');
      if (blockedPrankTimeoutRef.current) clearTimeout(blockedPrankTimeoutRef.current);
      blockedPrankTimeoutRef.current = setTimeout(() => {
        setBlockedPrankSending(false);
        setBlockedPrankRevealed(true);
        showTopToast(
          'Aynen aynen… cevap gitti sandın 😏 Bu tur bloklandın; blöfün sunucuya gönderilmedi.',
          'Tilki seni işletti! 🦊',
          'danger',
        );
      }, 950);
      return;
    }

    submitFake(clean);
  };

  const submitFake = async (text: string) => {
    if (!roomCode || submitting) return;
    soundService.stop('clock');
    setSubmitting(true);
    setError(null);
    try {
      await service.submitFakeAnswer(roomCode, text);
      setFakeSubmitted(true);
      const stageId = `${roomCode}:${roomState?.currentRound ?? 1}:fake_answer`;
      if (isLive) await refreshRoom();
      else if (currentPlayer) prototype.beginWaiting(stageId, 'fake_answer', currentPlayer.id);
      router.replace('/waiting');
    } catch (e) {
      const rawMsg = (e as Error).message || '';
      const normalizedMessage = rawMsg.toLocaleLowerCase('tr-TR');
      let friendlyMsg = rawMsg;
      if (normalizedMessage.includes('bloklan') || normalizedMessage.includes('blöf gönderemez') || normalizedMessage.includes('bu tur cevap gönderemezsiniz')) {
        friendlyMsg = 'Aynen aynen, cevap gitti sandın 😏 Bu tur bloklandın; blöfün gönderilmedi. Gerçek cevabı seçme aşamasında devam edebilirsin.';
        setBlockedPrankRevealed(true);
        showTopToast(friendlyMsg, 'Tilki seni işletti! 🦊', 'danger');
      } else if (
        rawMsg.includes('başka bir oyuncu') ||
        rawMsg.includes('Gerçek cevabı') ||
        rawMsg.includes('uyuşuyor') ||
        rawMsg.includes('FAKE_ANSWER')
      ) {
        friendlyMsg = 'Cevabın gerçek cevapla veya başka bir oyuncunun blöfüyle çakıştı. Farklı bir cevap dene.';
        setError(friendlyMsg);
        showTopToast(friendlyMsg, 'Farklı Bir Cevap Yaz', 'danger');
      } else {
        setError(friendlyMsg);
        showTopToast(friendlyMsg, 'Cevap Gönderilemedi', 'danger');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickSubmit = () => {
    if (selectedChoiceIndex === null) return;
    soundService.stop('clock');
    trigger('medium');
    submitPick(selectedChoiceIndex);
  };

  const submitPick = async (choiceIndex: number) => {
    if (!roomCode || submitting || pickSubmissionInProgress.current) return;
    pickSubmissionInProgress.current = true;
    soundService.stop('clock');
    setSubmitting(true);
    setError(null);
    try {
      await service.submitPick(roomCode, choiceIndex);
      const stageId = `${roomCode}:${roomState?.currentRound ?? 1}:guess`;
      if (isLive) await refreshRoom();
      else if (currentPlayer) prototype.beginWaiting(stageId, 'guess', currentPlayer.id);
      router.replace('/waiting');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pickSubmissionInProgress.current = false;
      setSubmitting(false);
    }
  };

  const handleChoiceSelect = (choice: RoundChoice) => {
    if (choice.isOwnFake || hasSubmittedPick || pickCommitted.current) return;
    soundService.play('click');
    trigger('light');
    pickCommitted.current = true;
    setSelectedChoiceIndex(choice.choiceIndex);
    void submitPick(choice.choiceIndex);
  };

  const blockerName = playersList.find((player) => player.id === me?.blockedByPlayerId)?.name;

  return (
    <Screen gradient diagonalSlice>
      {topToast ? (
        <FloatingToast
          title={topToast.title}
          message={topToast.message}
          tone={topToast.tone}
        />
      ) : null}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Game HUD Bar */}
        <View style={styles.hudBar}>
          <View style={styles.hudTopRow}>
            <View style={styles.roundBadge}>
              <Text style={styles.roundText}>
                Tur {roomState?.currentRound ?? 1} / {roomState?.config.totalRounds ?? 5}
              </Text>
            </View>

            <View style={styles.stageIndicator}>
              <Text style={styles.stageIndicatorText}>
                {isGuessPhase
                  ? '2. ADIM: GERÇEK CEVABI BUL'
                  : isBlocked
                  ? '1. ADIM: BLÖF AŞAMASI'
                  : '1. ADIM: BLÖFÜNÜ YAZ'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {displayedSecondsLeft <= 4 ? (
                <PulseView minScale={0.92} maxScale={1.08} duration={600}>
                  <View style={[styles.timerWrap, styles.timerWrapUrgent]}>
                    <Clock color={colors.danger} size={15} />
                    <Text style={[styles.timerText, { color: colors.dangerSoft }]}>
                      {displayedSecondsLeft}s
                    </Text>
                  </View>
                </PulseView>
              ) : (
                <View style={styles.timerWrap}>
                  <Clock color={colors.yellow} size={15} />
                  <Text style={styles.timerText}>{displayedSecondsLeft}s</Text>
                </View>
              )}

              {me?.isHost ? (
                <Pressable
                  onPress={handleTogglePause}
                  style={({ pressed }) => [
                    styles.pauseBtn,
                    { transform: [{ scale: pressed ? 0.94 : 1 }] },
                  ]}
                  hitSlop={8}
                  disabled={pauseUpdating}
                  accessibilityRole="button"
                  accessibilityLabel={isGamePaused ? 'Oyuna devam et' : 'Oyunu duraklat'}
                >
                  {isGamePaused
                    ? <Play color={colors.textPrimary} size={15} />
                    : <Pause color={colors.textPrimary} size={15} />}
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setShowExitConfirmation(true)}
                style={({ pressed }) => [
                  styles.pauseBtn,
                  { transform: [{ scale: pressed ? 0.94 : 1 }] },
                ]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Oyundan çık"
              >
                <LogOut color={colors.textPrimary} size={15} />
              </Pressable>
            </View>
          </View>

        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {roomState?.config.gameMode === 'survival' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 6 }}>
              <Text style={{ color: colors.textPrimary, fontFamily: 'Poppins-Bold', fontSize: 13 }}>
                ❤️ Can: {Array.from({ length: 3 }, (_, index) => index < (me?.livesRemaining ?? 3) ? '❤️' : '🖤').join(' ')}
              </Text>
              <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins-Medium', fontSize: 12 }}>
                {playersList.filter((player) => (player.livesRemaining ?? 3) > 0).length} hayatta
              </Text>
            </View>
          ) : roomState?.config.gameMode === 'blitz' ? (
            <View style={styles.modeNoticeBarBlitz}>
              <Zap size={14} color={colors.yellow} />
              <Text style={styles.modeNoticeTextBlitz}>
                ⚡ Fırtına Turu: İlk 3 saniyede bil, +1 Hız Bonusu kazan!
              </Text>
            </View>
          ) : roomState?.config.gameMode === 'suspicious' ? (
            <View style={styles.modeNoticeBarSuspicious}>
              <Search size={14} color={colors.purpleSoft} />
              <Text style={styles.modeNoticeTextSuspicious}>
                🕵️ Herkes Şüpheli: Doğruyu bul, tuzakçıyı tahmin et ve dedektif bonusu kap!
              </Text>
            </View>
          ) : null}
          {/* Question Prompt Card */}
          <Card variant="surface" glow="purple" style={styles.promptCard}>
            <View style={styles.questionIconRow}>
              <Text style={styles.questionKicker}>TUZAK SORUSU</Text>
            </View>
            <Text style={styles.promptText}>{question.prompt}</Text>
          </Card>

          {/* STAGE 1: ENTER FAKE ANSWER */}
          {isEliminated ? (
            <Card variant="surface" glow="orange" style={styles.stageWrap}>
              <Text style={styles.blockNoticeTitle}>Bu maçta elendin 🦊</Text>
              <Text style={styles.blockNoticeText}>Canların bitti. Maç tamamlanana kadar sonuçları izleyebilirsin; bu maçta artık cevap gönderemezsin.</Text>
            </Card>
          ) : !isGuessPhase ? (
            <View style={styles.stageWrap}>
              {isBlocked ? (
                <View style={styles.blockedStage}>
                  <Image
                    source={mascotImages.shocked}
                    style={styles.blockedMascot}
                    resizeMode="contain"
                    accessibilityLabel="Bloklandığı için şaşırmış tilki"
                  />
                  <View style={styles.blockedStageCopy}>
                    <Text style={styles.blockNoticeTitle}>Bu Tur Bloklandın! 🦊</Text>
                    <Text style={styles.blockNoticeText}>
                      {blockerName ? `${blockerName} seni blokladı. ` : ''}Bu tur sahte cevap gönderemezsin. Diğer oyuncuların cevapları bekleniyor; şıklar açıldığında doğru cevabı seçerek +2 puan kazanabilirsin.
                    </Text>
                  </View>
                </View>
              ) : !hasSubmittedFake ? (
                <>
                  <View style={styles.inputContainer}>
                    <Text style={styles.answerInputLabel}>CEVABINI YAZ</Text>
                    <Input
                      value={fakeAnswerText}
                      onChangeText={(t) => {
                        setFakeAnswerText(t);
                        if (error) setError(null);
                        if (topToast) setTopToast(null);
                      }}
                      placeholder="Bu soruya vereceğin sahte cevap..."
                      placeholderTextColor={colors.textMuted}
                      style={styles.fakeInput}
                      maxLength={48}
                      returnKeyType="done"
                      onSubmitEditing={handleFakeSubmit}
                      focusedBorderColor={colors.purple}
                    />
                  </View>
                </>
              ) : (
                <PopView delay={80} duration={350}>
                  <Card variant="accent" style={styles.submittedCard}>
                    <CheckCircle2 color={colors.lime} size={32} />
                    <Text style={styles.submittedTitle}>Cevabın Havuzda Kilitlendi!</Text>
                    <Text style={styles.submittedText}>
                      Cevabın sunucuya kaydedildi ve bu tur yeniden gönderilmeyecek. Diğer oyuncular bekleniyor...
                    </Text>
                  </Card>
                </PopView>
              )}
            </View>
          ) : (
            /* STAGE 2: GUESS FROM BLENDED CHOICES */
            <View style={styles.stageWrap}>
              <View style={styles.choicesList}>
                {choices.map((choice, idx) => {
                  const letter = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][idx] || `${idx + 1}`;
                  const isSelected = selectedChoiceIndex === choice.choiceIndex;
                  const isOwn = !!choice.isOwnFake;

                  return (
                    <StaggerRow key={choice.choiceIndex} index={idx} delay={90}>
                      <Pressable
                        onPress={() => handleChoiceSelect(choice)}
                        disabled={isOwn || hasSubmittedPick || submitting || selectedChoiceIndex !== null}
                        style={({ pressed }) => [
                          styles.choiceCard,
                          isSelected && styles.choiceCardSelected,
                          isOwn && styles.choiceCardOwn,
                          {
                            transform: [
                              { scale: pressed ? 0.99 : 1 },
                            ],
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.letterCircle,
                            isSelected && styles.letterCircleSelected,
                            isOwn && styles.letterCircleOwn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.letterText,
                              isSelected && styles.letterTextSelected,
                              isOwn && styles.letterTextOwn,
                            ]}
                          >
                            {letter}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.choiceText,
                            isSelected && styles.choiceTextSelected,
                            isOwn && styles.choiceTextOwn,
                          ]}
                        >
                          {choice.text}
                        </Text>

                        {isOwn ? (
                          <Badge tone="yellow" sticker>SENİN BLÖFÜN</Badge>
                        ) : isSelected ? (
                          <View style={styles.selectedTick}>
                            <Lock color="#171026" size={14} strokeWidth={2.5} />
                          </View>
                        ) : null}
                      </Pressable>
                    </StaggerRow>
                  );
                })}
              </View>

              {/* Herkes Şüpheli: Suspect Deduction Picker */}
              {roomState?.config.gameMode === 'suspicious' ? (
                <View style={styles.suspectSection}>
                  <View style={styles.suspectHeader}>
                    <Search size={14} color={colors.purpleSoft} />
                    <Text style={styles.suspectTitle}>DEDEKTİF TAHMİNİ: KİM TUZAK KURDU?</Text>
                  </View>
                  <Text style={styles.suspectSub}>
                    Kimin blöf yaptığını tahmin et. Seçtiğin rakip bu tur birini kandırırsa +1 Dedektif Bonusu kazanırsın!
                  </Text>
                  <View style={styles.suspectList}>
                    {playersList
                      .filter((p) => p.id !== me?.id)
                      .map((rival) => {
                        const isSuspected = (suspectedRivalId ?? roomState?.suspectPicks?.[me?.id ?? '']) === rival.id;
                        return (
                          <Pressable
                            key={rival.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Şüpheli olarak seç: ${rival.name}`}
                            onPress={() => handleSelectSuspect(rival.id)}
                            style={[
                              styles.suspectCard,
                              isSuspected && styles.suspectCardActive,
                            ]}
                          >
                            <Avatar avatarKey={rival.avatarKey} size={28} />
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.suspectName,
                                isSuspected && styles.suspectNameActive,
                              ]}
                            >
                              {rival.name}
                            </Text>
                            {isSuspected ? (
                              <Badge tone="purple" style={styles.suspectBadge}>ŞÜPHELİ</Badge>
                            ) : null}
                          </Pressable>
                        );
                      })}
                  </View>
                </View>
              ) : null}

            </View>
          )}
        </ScrollView>
        {isGuessPhase ? (
          <StickyActionBar>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Button
              label={
                error && selectedChoiceIndex !== null
                  ? 'Tekrar dene'
                  : submitting
                    ? 'Cevabın gönderiliyor...'
                    : 'Bir Seçenek Seç'
              }
              onPress={handlePickSubmit}
              variant="orange"
              disabled={selectedChoiceIndex === null || submitting}
              loading={submitting}
              fullWidth
              icon={<CheckCircle2 color="#FFF" size={20} />}
            />
          </StickyActionBar>
        ) : !isBlocked && !hasSubmittedFake ? (
          <StickyActionBar>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Button
              label={submitting ? 'Cevabın gönderiliyor…' : 'Sahte Cevabını Kilitle!'}
              onPress={handleFakeSubmit}
              variant="orange"
              loading={submitting}
              disabled={submitting || fakeAnswerText.trim().length === 0}
              fullWidth
              icon={<Send color="#FFF" size={18} />}
            />
          </StickyActionBar>
        ) : null}
      </KeyboardAvoidingView>

      {/* Pause Modal */}
      <Modal
        visible={!!isGamePaused}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (me?.isHost) void handleTogglePause();
        }}
      >
        <View style={styles.pauseBackdrop}>
          <Card variant="surface" glow="orange" style={styles.pauseModalCard}>
            <View style={styles.pauseHeaderRow}>
              <View style={styles.pauseIconCircle}>
                <Pause color={colors.orange} size={28} />
              </View>
              <Text style={styles.pauseModalTitle}>Oyun Duraklatıldı</Text>
              <Text style={styles.pauseModalSubtitle}>
                {!me?.isHost
                  ? 'Oda sahibi oyunu devam ettirdiğinde sayaç kaldığı yerden sürecek.'
                  : 'Süre durduruldu. Hazır olduğunuzda devam edebilirsiniz.'}
              </Text>
            </View>

            <View style={styles.pauseInfoBox}>
              <View style={styles.pauseInfoItem}>
                <Text style={styles.pauseInfoLabel}>Mevcut Tur</Text>
                <Text style={styles.pauseInfoValue}>
                  {roomState?.currentRound ?? 1} / {roomState?.config.totalRounds ?? 5}
                </Text>
              </View>
              <View style={styles.pauseInfoDivider} />
              <View style={styles.pauseInfoItem}>
                <Text style={styles.pauseInfoLabel}>Kalan Süre</Text>
                <Text style={styles.pauseInfoValue}>{displayedSecondsLeft} sn</Text>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.pauseActions}>
              {me?.isHost ? (
                <Button
                  label={pauseUpdating ? 'Güncelleniyor...' : 'Oyuna Devam Et'}
                  onPress={() => void handleTogglePause()}
                  variant="lime"
                  fullWidth
                  disabled={pauseUpdating}
                  icon={<Play color="#171026" size={18} fill="#171026" />}
                  style={{ marginBottom: 10 }}
                />
              ) : null}
              <Button
                label="Oyundan Çık"
                onPress={() => setShowExitConfirmation(true)}
                variant="secondary"
                fullWidth
                icon={<LogOut color={colors.textSecondary} size={18} />}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal
        visible={showExitConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExitConfirmation(false)}
      >
        <View style={styles.pauseBackdrop}>
          <Card variant="surface" style={styles.pauseModalCard}>
            <Text style={styles.pauseModalTitle}>Oyundan çıkılsın mı?</Text>
            <Text style={styles.pauseModalSubtitle}>
              Odadan ayrılacak ve lobi ekranına döneceksin.
            </Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.pauseActions}>
              <Button
                label={leavingGame ? 'Çıkılıyor...' : 'Evet, oyundan çık'}
                onPress={() => void handleLeaveGame()}
                variant="orange"
                fullWidth
                disabled={leavingGame}
                loading={leavingGame}
                icon={<LogOut color="#FFF" size={18} />}
                style={{ marginBottom: 10 }}
              />
              <Button
                label="Oyunda kal"
                onPress={() => {
                  setError(null);
                  setShowExitConfirmation(false);
                }}
                variant="secondary"
                fullWidth
                disabled={leavingGame}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  hudBar: {
    paddingVertical: 10,
  },
  hudTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  roundBadge: {
    backgroundColor: colors.bgSurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  stageIndicator: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 6,
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.orange,
    backgroundColor: colors.bgCard,
  },
  stageIndicatorText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 9,
    lineHeight: 12,
    color: colors.orange,
    textAlign: 'center',
  },
  roundText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgSurface,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  timerWrapUrgent: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  timerText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    color: colors.yellow,
  },
  scroll: {
    paddingBottom: spacing.md,
  },
  promptCard: {
    marginVertical: spacing.md,
    padding: spacing.xl,
    borderWidth: 2,
    borderColor: colors.purple,
    ...shadows.glow,
  },
  questionIconRow: {
    marginBottom: 6,
  },
  questionKicker: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.purpleSoft,
    letterSpacing: 1.5,
  },
  promptText: {
    ...typography.h3,
    color: colors.textPrimary,
    lineHeight: 28,
    fontFamily: 'Poppins-Bold',
  },
  stageWrap: {
    marginTop: spacing.sm,
  },
  cunningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.orange,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cunningTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  cunningDesc: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    marginTop: 4,
  },
  inputContainer: {
    marginTop: spacing.xs,
  },
  answerInputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: 'Poppins-Bold',
    marginBottom: spacing.xs,
  },
  blockedStage: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  blockedMascot: {
    width: 260,
    height: 260,
    maxWidth: '100%',
    marginBottom: spacing.sm,
  },
  blockedStageCopy: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
  },
  blockNoticeTitle: {
    ...typography.bodyMedium,
    color: colors.orange,
    fontFamily: 'Poppins-Bold',
    textAlign: 'center',
  },
  blockNoticeText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 19,
    textAlign: 'center',
  },
  fakeInput: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    paddingHorizontal: 18,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 17,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  submittedCard: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: 8,
    marginTop: spacing.md,
  },
  submittedTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 18,
    color: colors.lime,
    textAlign: 'center',
  },
  submittedText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  choicesList: {
    gap: 10,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 12,
    ...shadows.card,
  },
  choiceCardSelected: {
    borderColor: colors.orange,
    borderWidth: 2.5,
    backgroundColor: 'rgba(255, 113, 59, 0.15)',
    ...shadows.glowOrange,
  },
  choiceCardOwn: {
    opacity: 0.5,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderColor: 'rgba(255, 209, 102, 0.25)',
  },
  letterCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgSurfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterCircleSelected: {
    backgroundColor: colors.orange,
  },
  letterCircleOwn: {
    backgroundColor: 'rgba(255, 209, 102, 0.2)',
  },
  letterText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    color: colors.textSecondary,
  },
  letterTextSelected: {
    color: '#FFF',
  },
  letterTextOwn: {
    color: colors.yellow,
  },
  choiceText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  choiceTextSelected: {
    color: colors.orange,
  },
  choiceTextOwn: {
    color: colors.textMuted,
  },
  selectedTick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    ...typography.small,
    color: colors.dangerSoft,
    marginTop: spacing.sm,
    textAlign: 'center',
    fontFamily: 'Poppins-SemiBold',
  },
  pauseBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 6, 20, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pauseModalCard: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.xl,
    borderRadius: radii.xl,
    alignItems: 'center',
  },
  pauseHeaderRow: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  pauseIconCircle: {
    width: 60,
    height: 60,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 113, 59, 0.15)',
    borderWidth: 1.5,
    borderColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pauseModalTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 22,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  pauseModalSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  pauseInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pauseInfoItem: {
    alignItems: 'center',
  },
  pauseInfoLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: colors.textMuted,
  },
  pauseInfoValue: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    color: colors.orange,
    marginTop: 2,
  },
  pauseInfoDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  pauseActions: {
    width: '100%',
  },
  noFakeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 113, 59, 0.12)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 113, 59, 0.3)',
    padding: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  noFakeNoticeText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  modeNoticeBarBlitz: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.35)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginHorizontal: 18,
    marginBottom: spacing.xs,
  },
  modeNoticeTextBlitz: {
    ...typography.caption,
    fontFamily: 'Poppins-SemiBold',
    color: colors.yellow,
    flex: 1,
  },
  modeNoticeBarSuspicious: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(161, 107, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(161, 107, 255, 0.35)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginHorizontal: 18,
    marginBottom: spacing.xs,
  },
  modeNoticeTextSuspicious: {
    ...typography.caption,
    fontFamily: 'Poppins-SemiBold',
    color: colors.purpleSoft,
    flex: 1,
  },
  suspectSection: {
    marginTop: spacing.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: 'rgba(161, 107, 255, 0.3)',
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  suspectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suspectTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.purpleSoft,
    letterSpacing: 0.5,
  },
  suspectSub: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
  suspectList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  suspectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.md,
    backgroundColor: colors.bgDarkest,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suspectCardActive: {
    borderColor: colors.purple,
    backgroundColor: 'rgba(161, 107, 255, 0.18)',
  },
  suspectName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11.5,
    color: colors.textPrimary,
  },
  suspectNameActive: {
    fontFamily: 'Poppins-Bold',
    color: colors.purpleSoft,
  },
  suspectBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
});
