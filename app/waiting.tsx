import { getLiveWaitingDestination } from '@/services/roomSync';
import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Image, Pressable, Modal } from 'react-native';
import { router } from 'expo-router';
import { Clock, Sparkles, CheckCircle2, Vibrate, FlaskConical, Pause, Play, LogOut } from 'lucide-react-native';
import {
  Screen,
  Card,
  Badge,
  Avatar,
  MascotFloat,
  FloatingToast,
  PopView,
  StaggerRow,
  StickyActionBar,
} from '@/components/ui';
import { colors, spacing, typography, radii, shadows } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import { mascotImages } from '@/assets/illustrations';
import { usePrototype } from '@/features/prototype/PrototypeProvider';
import { PlayerProfileSheet } from '@/components/PlayerProfileSheet';
import type { Player } from '@/types/game';

export default function WaitingScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const {
    roomState,
    currentPlayer,
    roomCode,
    isLive,
    service,
    refreshRoom,
    setRoomCode,
    setRoomState,
  } = useGameStore();
  const prototype = usePrototype();
  const { trigger } = useHaptics();
  const [testMode, setTestMode] = useState(!isLive);
  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);
  const [nudgeError, setNudgeError] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [pauseUpdating, setPauseUpdating] = useState(false);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [leavingGame, setLeavingGame] = useState(false);
  const completedStageRef = useRef<string | null>(null);

  const playersList = roomState ? Object.values(roomState.players) : [];
  const me = playersList.find((p) => p.id === currentPlayer?.id) || currentPlayer;
  const isPaused = roomState?.pausedAt != null;
  const waitingStage = isLive ? null : prototype.waitingStage;
  const isGuessPhase = (waitingStage?.phase ?? roomState?.phase) === 'guess';
  const phase = isGuessPhase ? 'guess' : 'fake_answer';
  const stageId = waitingStage?.id
    ?? `${roomCode ?? 'demo'}:${roomState?.currentRound ?? 1}:${phase}`;

  useEffect(() => {
    if (!isLive || !roomState || !currentPlayer) return;
    const destination = getLiveWaitingDestination(roomState, currentPlayer.id);
    if (destination === '/result') {
      trigger('success');
      router.replace({ pathname: '/result', params: { round: String(roomState.currentRound), questionId: String(roomState.currentQuestionId) } });
    } else if (destination) {
      router.replace(destination);
    }
  }, [isLive, roomState, currentPlayer?.id, trigger]);

  useEffect(() => {
    if (isLive) return;
    if (roomState?.phase === 'reveal') {
      trigger('success');
      router.replace({
        pathname: '/result',
        params: {
          round: String(roomState.currentRound),
          questionId: String(roomState.currentQuestionId),
        },
      });
    } else if (roomState?.phase === 'scoreboard') {
      router.replace('/scoreboard');
    }
  }, [roomState?.phase, trigger, prototype.waitingStage, isLive]);

  useEffect(() => {
    const waitingPhase = waitingStage?.phase;
    if (!waitingPhase || !roomState || roomState.phase === waitingPhase) return;
    prototype.finishWaiting(waitingStage!.id);
    if (roomState.phase === 'reveal') {
      router.replace({
        pathname: '/result',
        params: {
          round: String(roomState.currentRound),
          questionId: String(roomState.currentQuestionId),
        },
      });
    } else if (roomState.phase === 'game_over' || roomState.phase === 'scoreboard') {
      router.replace('/scoreboard');
    } else if (roomState.phase === 'guess' || roomState.phase === 'fake_answer') {
      router.replace('/question');
    }
  }, [roomState?.phase, waitingStage, prototype.finishWaiting]);

  const picks = roomState?.picks ?? {};
  const fakeAnswers = roomState?.fakeAnswers ?? {};
  const hasAnswered = (player: Player) => isLive
    ? roomState?.progress?.submissionStatus[player.id] ?? false
    : prototype.isAnswered(stageId, player.id, testMode
      ? player.id === me?.id
      : isGuessPhase ? picks[player.id] !== undefined : !!fakeAnswers[player.id]);
  const submittedCount = isLive
    ? roomState?.progress?.submittedCount ?? 0
    : playersList.filter(hasAnswered).length;
  const totalCount = isLive
    ? roomState?.progress?.totalCount ?? playersList.length
    : playersList.length;
  const allSubmitted = isLive
    ? roomState?.progress?.completed ?? false
    : totalCount > 0 && submittedCount === totalCount;

  useEffect(() => {
    if (isLive || isPaused || !allSubmitted || completedStageRef.current === stageId) return;
    completedStageRef.current = stageId;
    const timer = setTimeout(() => {
      prototype.finishWaiting(stageId);
      router.replace(isGuessPhase ? '/result' : '/question');
    }, 800);
    return () => clearTimeout(timer);
  }, [allSubmitted, stageId, isGuessPhase, prototype.finishWaiting, isLive, isPaused]);

  const nudgePlayer = async (player: Player) => {
    if (!roomCode) return;
    trigger('light');
    setNudgeError(null);
    try {
      await service.nudgePlayer(roomCode, player.id);
      if (!isLive) {
        prototype.nudge(stageId, player.id, me?.name ?? 'Sen', player.name);
      }
    } catch (error) {
      setNudgeError((error as Error).message);
    }
  };

  const handleTogglePause = async () => {
    if (!roomCode || !me?.isHost || pauseUpdating) return;
    setPauseUpdating(true);
    setControlError(null);
    try {
      await service.setRoomPaused(roomCode, !isPaused);
      await refreshRoom();
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Oyun duraklatılamadı.');
    } finally {
      setPauseUpdating(false);
    }
  };

  const handleLeaveGame = async () => {
    if (!roomCode || leavingGame) return;
    setLeavingGame(true);
    setControlError(null);
    try {
      await service.leaveRoom(roomCode);
      setRoomCode(null);
      setRoomState(null);
      setShowExitConfirmation(false);
      router.replace('/create-room');
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Odadan çıkılamadı.');
      setLeavingGame(false);
    }
  };

  return (
    <Screen gradient diagonalSlice>
      {prototype.toast ? (
        <FloatingToast title="Dürtme!" message={prototype.toast.message} />
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Mascot Banner */}
        <View style={styles.topBanner}>
          <MascotFloat floatDistance={5} duration={2400}>
            <Image
              source={mascotImages.brand}
              style={styles.mascotImage}
              resizeMode="contain"
            />
          </MascotFloat>
          <Text style={styles.title}>Oyuncular bekleniyor</Text>
          <Text style={styles.subtitle}>
            Diğer oyuncular cevaplarını tamamladığında otomatik devam edeceğiz.
          </Text>
        </View>

        {/* Status Card with Neon Progress */}
        <Card variant="surface" glow="orange" style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Cevap ilerlemesi</Text>
            <Badge tone={submittedCount === totalCount ? 'lime' : 'orange'} sticker>
              {submittedCount}/{totalCount} cevapladı
            </Badge>
          </View>
        </Card>

        {/* Player Status List */}
        <Text style={styles.listTitle}>OYUNCU DURUMLARI</Text>
        <View style={styles.playersListWrap}>
          {playersList.map((player, idx) => {
            const hasDone = hasAnswered(player);
            const isSelf = player.id === me?.id;
            return (
              <StaggerRow key={player.id} index={idx} delay={60}>
                <Card
                  variant={isSelf ? 'accent' : 'surface'}
                  style={[
                    styles.playerRow,
                    isSelf && styles.playerRowSelf,
                    prototype.toast?.targetId === player.id && styles.playerRowNudged,
                  ]}
                >
                  <Pressable onPress={() => setProfilePlayer(player)} style={styles.playerIdentity}>
                    <Avatar avatarKey={player.avatarUrl ?? player.avatarKey} userId={player.id} size={42} ring={isSelf} />
                    <View style={styles.playerIdentityText}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.playerName, isSelf && { color: colors.orange }]}>
                          {player.name}
                        </Text>
                        {isSelf && <Badge tone="neutral">SEN</Badge>}
                      </View>
                      <Text style={styles.playerScore}>{player.score} Puan</Text>
                    </View>
                  </Pressable>

                  {hasDone ? (
                    <PopView duration={300}>
                      <View style={styles.answeredBadge}>
                        <CheckCircle2 color="#171026" size={14} strokeWidth={2.5} />
                        <Text style={styles.answeredText}>Tamamlandı</Text>
                      </View>
                    </PopView>
                  ) : (
                    <View style={styles.pendingWrap}>
                      <View style={styles.pendingBadge}>
                        <Clock color={colors.yellow} size={14} />
                        <Text style={styles.pendingText}>Cevap Bekleniyor</Text>
                      </View>
                      {!isSelf ? (
                        <Pressable
                          disabled={!prototype.canNudge(stageId, player.id)}
                          onPress={() => void nudgePlayer(player)}
                          style={[
                            styles.nudgeBtn,
                            !prototype.canNudge(stageId, player.id) && styles.nudgeBtnUsed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${player.name} oyuncusunu dürt`}
                        >
                          <Vibrate
                            color={prototype.canNudge(stageId, player.id) ? colors.orange : colors.textMuted}
                            size={18}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </Card>
              </StaggerRow>
            );
          })}
        </View>

        {!isLive && <>
        <Pressable
          onPress={() => {
            if (testMode) prototype.clearAnswers(stageId);
            setTestMode((value) => !value);
          }}
          style={styles.testToggle}
          accessibilityRole="button"
        >
          <FlaskConical color={colors.purpleSoft} size={16} />
          <Text style={styles.testToggleText}>
            {testMode ? 'Test simülasyonunu gizle' : 'Geliştirici test simülasyonu'}
          </Text>
        </Pressable>
        {testMode ? (
          <Card variant="surface" style={styles.testPanel}>
            <Text style={styles.testTitle}>Oyuncu cevaplarını simüle et</Text>
            <Text style={styles.testDescription}>
              Durumları değiştir; tüm oyuncular tamamladığında sonraki aşama otomatik açılır.
            </Text>
            {playersList.map((player) => {
              const answered = hasAnswered(player);
              return (
                <Pressable
                  key={`simulate-${player.id}`}
                  onPress={() => prototype.setAnswered(stageId, player.id, !answered)}
                  style={styles.testPlayer}
                >
                  <Text style={styles.testPlayerName}>{player.name}</Text>
                  <Badge tone={answered ? 'lime' : 'yellow'}>
                    {answered ? 'Tamamlandı' : 'Bekliyor'}
                  </Badge>
                </Pressable>
              );
            })}
          </Card>
        ) : null}

        </>}

        {/* Tactical party tip */}
        <Card variant="comic" style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Sparkles color={colors.yellow} size={18} />
            <Text style={styles.tipTitle}>Kızılkuyruk Taktik İpucu</Text>
          </View>
          <Text style={styles.tipBody}>
            Ne kadar çok rakibi kendi uydurduğun cevaba inandırırsan, kişi başı +1 puan kaparsın! Puan topladıkça maçlık kredi kazanıp Blok ve Kalkan yeteneklerini kullanabilirsin.
          </Text>
        </Card>

      </ScrollView>
      <StickyActionBar>
        <View style={styles.waitingFooterRow}>
          <View style={styles.waitingNotice}>
            <Text style={styles.waitingNoticeText}>
              {nudgeError ?? (allSubmitted ? 'Herkes tamamladı! Sonraki aşama açılıyor…' : 'Cevaplar geldikçe otomatik devam edeceğiz.')}
            </Text>
          </View>
          <View style={styles.footerControls}>
            {me?.isHost ? (
              <Pressable
                onPress={() => void handleTogglePause()}
                style={styles.gameControlButton}
                disabled={pauseUpdating}
                accessibilityRole="button"
                accessibilityLabel={isPaused ? 'Oyuna devam et' : 'Oyunu duraklat'}
              >
                {isPaused
                  ? <Play color={colors.textPrimary} size={17} />
                  : <Pause color={colors.textPrimary} size={17} />}
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                setControlError(null);
                setShowExitConfirmation(true);
              }}
              style={styles.gameControlButton}
              accessibilityRole="button"
              accessibilityLabel="Oyundan çık"
            >
              <LogOut color={colors.textPrimary} size={17} />
            </Pressable>
          </View>
        </View>
      </StickyActionBar>
      <PlayerProfileSheet
        player={profilePlayer}
        isSelf={profilePlayer?.id === me?.id}
        visible={profilePlayer !== null}
        onClose={() => setProfilePlayer(null)}
      />
      <Modal
        visible={isPaused}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (me?.isHost) void handleTogglePause();
        }}
      >
        <View style={styles.controlModalBackdrop}>
          <Card variant="surface" glow="orange" style={styles.controlModalCard}>
            <View style={styles.controlIconCircle}>
              <Pause color={colors.orange} size={26} />
            </View>
            <Text style={styles.controlModalTitle}>Oyun Duraklatıldı</Text>
            <Text style={styles.controlModalText}>
              {me?.isHost
                ? 'Tüm oyuncular için sayaç durdu.'
                : 'Oda sahibi oyuna devam ettiğinde bekleme süreci sürecek.'}
            </Text>
            {controlError ? <Text style={styles.controlError}>{controlError}</Text> : null}
            <View style={styles.controlModalActions}>
              {me?.isHost ? (
                <Pressable
                  onPress={() => void handleTogglePause()}
                  disabled={pauseUpdating}
                  style={[styles.controlActionButton, styles.resumeButton]}
                >
                  <Play color="#171026" size={17} fill="#171026" />
                  <Text style={styles.resumeButtonText}>
                    {pauseUpdating ? 'Güncelleniyor...' : 'Oyuna Devam Et'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setControlError(null);
                  setShowExitConfirmation(true);
                }}
                style={styles.controlActionButton}
              >
                <LogOut color={colors.textSecondary} size={17} />
                <Text style={styles.controlActionText}>Oyundan Çık</Text>
              </Pressable>
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
        <View style={styles.controlModalBackdrop}>
          <Card variant="surface" style={styles.controlModalCard}>
            <Text style={styles.controlModalTitle}>Oyundan çıkılsın mı?</Text>
            <Text style={styles.controlModalText}>
              Odadan ayrılacak ve lobi ekranına döneceksin.
            </Text>
            {controlError ? <Text style={styles.controlError}>{controlError}</Text> : null}
            <View style={styles.controlModalActions}>
              <Pressable
                onPress={() => void handleLeaveGame()}
                disabled={leavingGame}
                style={[styles.controlActionButton, styles.leaveButton]}
              >
                <LogOut color="#FFF" size={17} />
                <Text style={styles.leaveButtonText}>
                  {leavingGame ? 'Çıkılıyor...' : 'Evet, oyundan çık'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowExitConfirmation(false)}
                disabled={leavingGame}
                style={styles.controlActionButton}
              >
                <Text style={styles.controlActionText}>Oyunda kal</Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  scroll: {
    paddingBottom: spacing.md,
    paddingTop: 8,
  },
  waitingFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  gameControlButton: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBanner: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  mascotImage: {
    width: 220,
    height: 80,
    marginBottom: 8,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    fontFamily: 'Poppins-Bold',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
    fontSize: 13,
    lineHeight: 18,
  },
  statusCard: {
    marginVertical: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  listTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  playersListWrap: {
    gap: 8,
    marginBottom: spacing.lg,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  playerRowSelf: {
    borderColor: colors.orange,
    borderWidth: 1.5,
  },
  playerName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  playerScore: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  answeredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.lime,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.md,
  },
  answeredText: {
    fontSize: 10,
    color: '#171026',
    fontFamily: 'Poppins-Bold',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.3)',
  },
  pendingText: {
    ...typography.caption,
    color: colors.yellow,
    fontFamily: 'Poppins-Medium',
  },
  tipCard: {
    marginBottom: spacing.lg,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  tipTitle: {
    ...typography.caption,
    color: colors.yellow,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.5,
  },
  tipBody: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  waitingNotice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  footerControls: {
    flexDirection: 'row',
    gap: 8,
  },
  waitingNoticeText: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  playerRowNudged: {
    borderColor: colors.orange,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255, 113, 59, 0.12)',
  },
  playerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  playerIdentityText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  pendingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nudgeBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 113, 59, 0.18)',
    borderWidth: 1,
    borderColor: colors.orange,
  },
  nudgeBtnUsed: {
    opacity: 0.45,
    borderColor: colors.border,
    backgroundColor: colors.bgSurfaceAlt,
  },
  testToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  testToggleText: {
    ...typography.small,
    color: colors.purpleSoft,
    fontFamily: 'Poppins-SemiBold',
  },
  testPanel: {
    marginBottom: spacing.lg,
    gap: 8,
  },
  testTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  testDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  testPlayer: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  testPlayerName: {
    ...typography.small,
    color: colors.textPrimary,
  },
  controlModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 6, 20, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  controlModalCard: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.xl,
    borderRadius: radii.xl,
    alignItems: 'center',
  },
  controlIconCircle: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 113, 59, 0.15)',
    borderWidth: 1.5,
    borderColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  controlModalTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 21,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  controlModalText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 5,
  },
  controlError: {
    ...typography.small,
    color: colors.dangerSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  controlModalActions: {
    width: '100%',
    gap: 10,
    marginTop: spacing.lg,
  },
  controlActionButton: {
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  resumeButton: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  resumeButtonText: {
    fontFamily: 'Poppins-Bold',
    color: '#171026',
  },
  leaveButton: {
    backgroundColor: colors.orange,
    borderColor: colors.orange,
  },
  leaveButtonText: {
    fontFamily: 'Poppins-Bold',
    color: '#FFF',
  },
  controlActionText: {
    fontFamily: 'Poppins-SemiBold',
    color: colors.textSecondary,
  },
});
