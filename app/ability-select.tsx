import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Sparkles, Check, Clock } from 'lucide-react-native';
import { Screen, Button, Badge, Avatar, StaggerRow, StickyActionBar } from '@/components/ui';
import { colors, spacing, typography, radii, shadows } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import { getRemainingSeconds, getServerNowMs } from '@/services/serverClock';
import { ABILITIES, type AbilityId, canUseAbility } from '@/features/game/abilities';
import { MATCH_CREDIT_THRESHOLDS, MATCH_STARTING_CREDITS } from '@/features/game/credits';

export default function AbilitySelectScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { roomCode, roomState, currentPlayer, service, refreshRoom } = useGameStore();
  const { trigger } = useHaptics();

  const [selectedAbility, setSelectedAbility] = useState<AbilityId | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const submitting = useRef(false);

  // Transition to question screen once room enters 'fake_answer' or 'question' phase
  useEffect(() => {
    if (roomState?.phase === 'fake_answer' || roomState?.phase === 'guess' || roomState?.phase === 'question') {
      router.replace('/question');
    }
  }, [roomState?.phase]);

  useEffect(() => {
    const deadline = roomState?.phaseDeadlineAt;
    if (deadline === null || deadline === undefined) return;
    const updateCountdown = () => {
      setSecondsLeft(getRemainingSeconds(deadline));
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [roomState?.phaseDeadlineAt]);

  // Reconcile from the server while this screen is open. Realtime can miss an event
  // during a temporary disconnect; polling prevents one player being stranded on a
  // stale phase after the other players have already moved on.
  useEffect(() => {
    if (roomState?.phase !== 'ability_select' || !roomCode) return;

    let disposed = false;
    let requestInFlight = false;

    const reconcileAbilityPhase = async () => {
      if (requestInFlight || disposed) return;
      requestInFlight = true;
      let phaseAdvanceFailed = false;

      try {
        const deadline = roomState.phaseDeadlineAt;
        if (deadline !== null && deadline !== undefined && getServerNowMs() >= deadline) {
          try {
            // This RPC is idempotent against concurrent clients and checks the
            // current server phase/deadline under a row lock.
            await service.advanceExpiredPhase(roomCode);
          } catch (cause) {
            phaseAdvanceFailed = true;
            if (!disposed) {
              setError((cause as Error).message || 'Tur süresi tamamlanamadı. Sunucu yeniden kontrol ediliyor.');
            }
          }
        }

        try {
          await refreshRoom();
          if (!disposed && !phaseAdvanceFailed) setError(null);
        } catch (cause) {
          if (!disposed) {
            setError((cause as Error).message || 'Oyun durumu eşitlenemedi. Yeniden deneniyor.');
          }
        }
      } finally {
        requestInFlight = false;
      }
    };

    void reconcileAbilityPhase();
    const timer = setInterval(() => {
      void reconcileAbilityPhase();
    }, 3500);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [roomState?.phase, roomState?.phaseDeadlineAt, roomCode, service, refreshRoom]);

  const playersList = roomState ? Object.values(roomState.players) : [];
  const me = playersList.find((p) => p.id === currentPlayer?.id) || currentPlayer;
  const isEliminated = roomState?.config.gameMode === 'survival' && (me?.livesRemaining ?? 3) <= 0;
  const opponents = playersList.filter((p) => p.id !== me?.id
    && (roomState?.config.gameMode !== 'survival' || (p.livesRemaining ?? 3) > 0));
  const defaultTargetId = opponents.find((player) =>
    player.id !== me?.lastBlockedPlayerId
  )?.id;

  const abilityState = {
    playerId: me?.id ?? '',
    credits: me?.credits ?? 0,
    usedCounts: me?.abilityUsedCounts ?? { block: 0, shield: 0, penalty: 0, counter: 0 },
    shieldsAvailable: me?.shieldsAvailable ?? 0,
    blocksAvailable: me?.blocksAvailable ?? 0,
    isBlockedCurrentRound: me?.isBlockedCurrentRound ?? false,
    isBlockedNextRound: me?.isBlockedNextRound ?? false,
    lastBlockedPlayerId: me?.lastBlockedPlayerId ?? null,
  };
  const score = me?.score ?? 0;
  const nextCreditIndex = MATCH_CREDIT_THRESHOLDS.findIndex((threshold) => score < threshold);
  const nextCreditScore = nextCreditIndex >= 0 ? MATCH_CREDIT_THRESHOLDS[nextCreditIndex] : null;
  const previousCreditScore = nextCreditIndex > 0 ? MATCH_CREDIT_THRESHOLDS[nextCreditIndex - 1] : 0;
  const creditProgress = nextCreditScore === null
    ? 1
    : Math.min(1, Math.max(0, (score - previousCreditScore) / (nextCreditScore - previousCreditScore)));

  const handleSelectAbility = (id: AbilityId) => {
    const check = canUseAbility(
      abilityState,
      id,
      targetId ?? (id === 'block' ? defaultTargetId : undefined)
    );
    if (!check.allowed) {
      trigger('heavy');
      setError(check.reason ?? 'Bu yetenek şu anda kullanılamıyor.');
      return;
    }
    trigger('light');
    setError(null);
    if (selectedAbility === id) {
      setSelectedAbility(null);
      setTargetId(null);
    } else {
      setSelectedAbility(id);
      const ab = ABILITIES.find((a) => a.id === id);
      if (!ab?.targetRequired) {
        setTargetId(null);
      } else if (defaultTargetId && !targetId) {
        setTargetId(defaultTargetId);
      }
    }
  };

  const handleConfirm = async () => {
    if (!roomCode || !me || submitting.current) return;
    submitting.current = true;
    trigger('medium');
    setLoading(true);
    setError(null);
    try {
      if (selectedAbility) {
        await service.useAbility(roomCode, {
          playerId: me.id,
          abilityId: selectedAbility,
          targetId: targetId || undefined,
        });
      }
      await service.confirmAbilitySelection(roomCode);
      setConfirmed(true);
      // Force a fresh authoritative read even if this client's Realtime event is missed.
      await refreshRoom();
      // Do not rely exclusively on the Realtime event to navigate this player.
      await refreshRoom();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!roomCode || submitting.current) return;
    submitting.current = true;
    trigger('light');
    setLoading(true);
    setError(null);
    try {
      await service.confirmAbilitySelection(roomCode);
      setConfirmed(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const currentAbilityObj = ABILITIES.find((a) => a.id === selectedAbility);

  return (
    <Screen gradient diagonalSlice>
      <View style={styles.header}>
        <View style={styles.roundBadge}>
          <Text style={styles.roundText}>
            Tur {roomState?.currentRound ?? 1} / {roomState?.config.totalRounds ?? 5}
          </Text>
        </View>
        <Text style={styles.screenTitle}>Strateji & Yetenek</Text>
        <Text style={styles.subtitle}>
          {isEliminated
            ? 'Bu maçta elendin. Canlı oyuncular devam ederken sonuçları izleyebilirsin.'
            : `Maça ${MATCH_STARTING_CREDITS} krediyle başlarsın. 4, 8 ve 12 puanda yeni hamle hakkı kazanırsın.`}
        </Text>
        {roomState?.phaseDeadlineAt ? (
          <View style={styles.timer}>
            <Clock color={colors.yellow} size={14} />
            <Text style={styles.timerText}>{secondsLeft}s</Text>
          </View>
        ) : null}
        <View style={styles.creditBalance}>
          <Sparkles color={colors.lime} size={16} />
          <Text style={styles.creditBalanceText}>{me?.credits ?? 0} KREDİ</Text>
          <Text style={styles.creditBalanceHint}>· Blok veya kalkan 1 kredi</Text>
        </View>
        {!isEliminated ? (
          <Text style={styles.creditGuidance}>1. Yetenek seç  ·  2. Gerekirse rakip seç  ·  3. Hamleni onayla</Text>
        ) : null}
        {!isEliminated && nextCreditScore !== null ? (
          <View style={styles.creditProgressWrap}>
            <View style={styles.creditProgressCopy}>
              <Text style={styles.creditProgressLabel}>
                Sonraki kredi: {nextCreditScore} puan
              </Text>
              <Text style={styles.creditProgressValue}>{score}/{nextCreditScore}</Text>
            </View>
            <View style={styles.creditProgressTrack}>
              <View style={[styles.creditProgressFill, { width: `${creditProgress * 100}%` }]} />
            </View>
          </View>
        ) : !isEliminated ? (
          <Text style={styles.creditProgressLabel}>Bu maçın kredi eşikleri tamamlandı · 4 / 8 / 12 puan</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.abilitiesList}>
          {ABILITIES.map((ab, idx) => {
            const check = canUseAbility(
              abilityState,
              ab.id,
              targetId ?? (ab.targetRequired ? defaultTargetId : undefined)
            );
            const isSelected = selectedAbility === ab.id;

            return (
              <StaggerRow key={ab.id} index={idx} delay={70}>
                <Pressable
                  onPress={() => handleSelectAbility(ab.id)}
                  disabled={isEliminated || confirmed || loading}
                  accessibilityState={{ disabled: isEliminated || confirmed || loading }}
                  style={({ pressed }) => [
                    styles.abilityCard,
                    isSelected && styles.abilityCardSelected,
                    !check.allowed && styles.abilityCardUnavailable,
                    {
                      transform: [
                        { scale: pressed ? 0.99 : 1 },
                      ],
                    },
                  ]}
                >
                  <View style={styles.abilityTopRow}>
                    <View style={styles.nameRow}>
                      <Text style={styles.emoji}>{ab.emoji}</Text>
                      <Text style={styles.name}>{ab.name}</Text>
                    </View>
                    <Badge tone={check.allowed ? (isSelected ? 'orange' : 'lime') : 'neutral'} sticker>
                      {check.allowed
                        ? (isSelected ? 'SEÇİLDİ' : '1 KREDİ · HAZIR')
                        : abilityState.credits < ab.creditCost
                          ? 'KREDİ YOK'
                          : 'UYGUN DEĞİL'}
                    </Badge>
                  </View>
                  <Text style={styles.desc}>{ab.description}</Text>
                  <Text style={styles.unlockDesc}>
                    {ab.id === 'block' ? 'Hedef: bir rakip' : 'Hedef seçimi gerekmez'} · {ab.unlockRule}
                  </Text>
                  {!check.allowed ? (
                    <Text style={styles.disabledReason}>{check.reason}</Text>
                  ) : (
                    <Text style={styles.usesRemaining}>Bu tur satın alınır · {ab.creditCost} kredi</Text>
                  )}
                </Pressable>
              </StaggerRow>
            );
          })}
        </View>

        {/* Target selection if needed */}
        {selectedAbility && currentAbilityObj?.targetRequired && opponents.length > 0 && (
          <View style={styles.targetSection}>
            <Text style={styles.targetTitle}>2. ADIM · KİMİ BLOKLAYACAKSIN?</Text>
            <View style={styles.targetsRow}>
              {opponents.map((opp) => {
                const isTarget = targetId === opp.id;
                return (
                  <Pressable
                    key={opp.id}
                    onPress={() => {
                      trigger('light');
                      setTargetId(opp.id);
                    }}
                    style={[styles.targetChip, isTarget && styles.targetChipActive]}
                  >
                    <Avatar avatarKey={opp.avatarUrl ?? opp.avatarKey} userId={opp.id} size={36} ring={isTarget} />
                    <Text style={[styles.targetName, isTarget && styles.targetNameActive]}>
                      {opp.name}
                    </Text>
                    {isTarget && <Check color="#FFF" size={14} strokeWidth={2.5} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

      </ScrollView>
      <StickyActionBar>
        {confirmed ? (
          <Text style={styles.confirmedText}>Hamlen kaydedildi. Diğer oyuncular bekleniyor.</Text>
        ) : null}
        <Button
          label={
            selectedAbility
              ? (selectedAbility === 'shield' ? 'Kalkanı Etkinleştir' : 'Rakibi Blokla')
              : 'Hamle Yapmadan Geç'
          }
          onPress={selectedAbility ? handleConfirm : handleSkip}
          variant={selectedAbility ? 'orange' : 'secondary'}
          loading={loading}
          disabled={confirmed || isEliminated}
          fullWidth
          icon={selectedAbility ? <Sparkles color="#FFF" size={18} /> : undefined}
        />
      </StickyActionBar>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    paddingVertical: 10,
  },
  creditBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    marginTop: 10,
  },
  creditGuidance: { ...typography.caption, color: colors.textSecondary, marginTop: 8, lineHeight: 18 },
  creditBalanceText: { ...typography.caption, color: colors.lime, fontFamily: 'Poppins-Bold' },
  creditBalanceHint: { ...typography.caption, color: colors.textSecondary },
  creditProgressWrap: {
    marginTop: 9,
    maxWidth: 330,
  },
  creditProgressCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  creditProgressLabel: { ...typography.caption, color: colors.textSecondary },
  creditProgressValue: { ...typography.caption, color: colors.yellow, fontFamily: 'Poppins-Bold' },
  creditProgressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.bgSurfaceAlt,
  },
  creditProgressFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.lime,
  },
  roundBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgSurface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  roundText: {
    ...typography.caption,
    color: colors.orange,
    fontFamily: 'Poppins-Bold',
  },
  screenTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
    fontSize: 13,
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  timerText: {
    ...typography.caption,
    color: colors.yellow,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  confirmedText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  scroll: {
    paddingBottom: spacing.md,
  },
  abilitiesList: {
    gap: 12,
    marginVertical: spacing.md,
  },
  abilityCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.card,
  },
  abilityCardSelected: {
    borderColor: colors.orange,
    backgroundColor: 'rgba(255, 113, 59, 0.15)',
    ...shadows.glowOrange,
  },
  abilityCardUnavailable: {
    opacity: 0.82,
  },
  abilityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emoji: {
    fontSize: 22,
  },
  name: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  desc: {
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  unlockDesc: {
    ...typography.caption,
    color: colors.yellow,
    marginTop: 6,
    fontStyle: 'italic',
  },
  disabledReason: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 5,
  },
  usesRemaining: {
    ...typography.caption,
    color: colors.lime,
    marginTop: 5,
  },
  targetSection: {
    marginTop: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  targetTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
  },
  targetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.bgSurfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  targetChipActive: {
    backgroundColor: colors.orange,
    borderColor: '#FFA07A',
  },
  targetName: {
    ...typography.caption,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  targetNameActive: {
    color: '#FFF',
  },
});
