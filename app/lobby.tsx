import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useEffect, useId, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Share,
  Image,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  ChevronLeft,
  Share2,
  Play,
  CheckCircle2,
  Circle,
  Crown,
  UserPlus,
  UserMinus,
  Flame,
  Vibrate,
  FlaskConical,
} from 'lucide-react-native';
import {
  Screen,
  Button,
  Card,
  Avatar,
  Badge,
  FloatingToast,
  StaggerRow,
  PopView,
  PulseView,
  MascotFloat,
  StickyActionBar,
  ModalSheet,
} from '@/components/ui';
import { spacing, typography, radii } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import { mascotImages } from '@/assets/illustrations';
import { usePrototype } from '@/features/prototype/PrototypeProvider';
import { PlayerProfileSheet } from '@/components/PlayerProfileSheet';
import { LobbyBotControls } from '@/components/LobbyBotControls';
import type { Player } from '@/types/game';
import { getWebAppUrl } from '@/lib/webAppUrl';
import { ensureSupabase } from '@/lib/supabase/client';

export default function LobbyScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const {
    roomCode,
    roomState,
    currentPlayer,
    service,
    lastNudge,
    isLive,
    setRoomCode,
    setRoomState,
  } = useGameStore();
  const prototype = usePrototype();
  const { trigger } = useHaptics();

  const [dismissedNudgeAt, setDismissedNudgeAt] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
  const [kickingPlayer, setKickingPlayer] = useState(false);
  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);
  const [testMode, setTestMode] = useState(!isLive);
  const lobbySessionId = useId();
  const sharingInvite = useRef(false);

  useEffect(() => {
    prototype.clearReadyOverrides();
  }, [prototype.clearReadyOverrides]);

  useEffect(() => {
    if (!roomCode || !['gizli_tilki', 'orman_hazinesi'].includes(roomState?.config.gameMode ?? '')) return;
    let mounted = true;
    const checkModeState = async () => {
      try {
        const isForest = roomState?.config.gameMode === 'orman_hazinesi';
        const { data, error: rpcError } = await ensureSupabase().rpc(isForest ? 'forest_treasure_get_state' : 'gizli_tilki_get_state', { p_room_code: roomCode });
        if (rpcError) throw rpcError;
        if (mounted && data && (data as { phase?: string }).phase && (data as { phase: string }).phase !== 'lobby') {
          router.replace(isForest ? '/orman-hazinesi' : '/gizli-tilki');
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Oyun modu durumu alınamadı.');
      }
    };
    void checkModeState();
    const timer = setInterval(() => { void checkModeState(); }, 2200);
    return () => { mounted = false; clearInterval(timer); };
  }, [roomCode, roomState?.config.gameMode]);

  useEffect(() => {
    if (roomState?.phase === 'ability_select') {
      router.replace('/ability-select');
    } else if (
      roomState?.phase === 'fake_answer' ||
      roomState?.phase === 'guess' ||
      roomState?.phase === 'question'
    ) {
      router.replace('/question');
    }
  }, [roomState?.phase]);

  const isIncomingNudge = !!lastNudge && lastNudge.toId === currentPlayer?.id;
  const nudgeBanner = isIncomingNudge && lastNudge?.at !== dismissedNudgeAt
    ? 'Biri seni dürttü! Lütfen hazır ol!'
    : null;

  useEffect(() => {
    if (!isIncomingNudge || !lastNudge) return;
    trigger('heavy');
    const nudgeAt = lastNudge.at;
    const timer = setTimeout(() => setDismissedNudgeAt(nudgeAt), 4000);
    return () => clearTimeout(timer);
  }, [isIncomingNudge, lastNudge?.at, trigger]);

  const playersList = roomState ? Object.values(roomState.players) : [];
  const me = playersList.find((p) => p.id === currentPlayer?.id) || currentPlayer;
  const isHost = me?.isHost ?? false;
  const getReady = (player: Player) =>
    prototype.getReady(player.id, testMode && player.id !== me?.id ? false : player.isReady);
  const readyCount = playersList.filter(getReady).length;
  const canStart = ['gizli_tilki', 'orman_hazinesi'].includes(roomState?.config.gameMode ?? '')
    ? playersList.length >= 4 && readyCount === playersList.length
    : readyCount >= 2;
  const maxPlayers = roomState?.config.maxPlayers ?? 8;
  const emptySlotsCount = Math.max(0, Math.min(4, maxPlayers - playersList.length));

  const toggleReady = async () => {
    if (!roomCode || !me) return;
    trigger('medium');
    const nextReady = !getReady(me);
    try {
      await service.setReady(roomCode, nextReady);
      prototype.setReady(me.id, nextReady);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const lobbyStageId = `${roomCode ?? 'demo'}:lobby:${lobbySessionId}`;
  const nudgePlayer = async (targetId: string, targetName: string) => {
    trigger('light');
    if (!roomCode) return;
    try {
      await service.nudgePlayer(roomCode, targetId);
      if (!isLive) {
        prototype.nudge(lobbyStageId, targetId, me?.name ?? 'Sen', targetName);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleShare = async () => {
    if (sharingInvite.current) return;
    sharingInvite.current = true;
    trigger('light');
    if (!roomCode) {
      sharingInvite.current = false;
      return;
    }
    try {
      const inviteToken = service.kind === 'supabase'
        ? await service.createRoomInvite(roomCode)
        : undefined;
      const queryParams: Record<string, string> = { code: roomCode };
      if (inviteToken) queryParams.invite = inviteToken;
      const inviteUrl = Platform.OS === 'web'
        ? getWebAppUrl(`join-room?${new URLSearchParams(queryParams).toString()}`)
        : Linking.createURL('join-room', { queryParams });
      await Share.share({
        message: `Kızılkuyruk partisine davetlisin! Tek dokunuşla katıl: ${inviteUrl}`,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Davet bağlantısı paylaşılamadı.');
    } finally {
      sharingInvite.current = false;
    }
  };

  const handleStartGame = async () => {
    if (!roomCode || !canStart) return;
    trigger('medium');
    setStarting(true);
    setError(null);
    try {
      if (roomState?.config.gameMode === 'gizli_tilki' || roomState?.config.gameMode === 'orman_hazinesi') {
        const isForest = roomState.config.gameMode === 'orman_hazinesi';
        const { error: startError } = await ensureSupabase().rpc(isForest ? 'forest_treasure_start' : 'gizli_tilki_start', { p_room_code: roomCode });
        if (startError) throw startError;
        router.replace(isForest ? '/orman-hazinesi' : '/gizli-tilki');
        return;
      }
      await service.startGame(roomCode);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  const handleKickPlayer = async () => {
    if (!roomCode || !playerToKick || kickingPlayer) return;
    setKickingPlayer(true);
    setError(null);
    try {
      await service.kickPlayer(roomCode, playerToKick.id);
      setPlayerToKick(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Oyuncu lobiden çıkarılamadı.');
    } finally {
      setKickingPlayer(false);
    }
  };

  const handleBack = async () => {
    if (roomCode) {
      try {
        await service.leaveRoom(roomCode);
        setRoomCode(null);
        setRoomState(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Odadan ayrılamadın.');
        return;
      }
    }
    router.replace('/create-room');
  };

  return (
    <Screen gradient diagonalSlice>
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <ChevronLeft color={colors.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.screenTitle}>Oyun Lobisi</Text>
        <Pressable onPress={handleShare} style={styles.shareBtn}>
          <Share2 color={colors.orange} size={20} strokeWidth={2.5} />
        </Pressable>
      </View>

      {prototype.toast ? (
        <FloatingToast title="Dürtme!" message={prototype.toast.message} />
      ) : nudgeBanner ? (
        <FloatingToast title="Dürtme Geldi!" message={nudgeBanner} />
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Card variant="surface" glow="orange" style={styles.codeCard}>
          <View style={styles.codeTopRow}>
            <View style={styles.kickerWrap}>
              <Flame color={colors.orange} size={14} />
              <Text style={styles.kickerText}>ODA KODU</Text>
            </View>
            <Pressable onPress={handleShare} style={styles.miniSharePill}>
              <Share2 color="#FFF" size={13} />
              <Text style={styles.miniShareText}>Paylaş</Text>
            </Pressable>
          </View>

          <Text style={styles.codeText}>{roomCode || '-----'}</Text>
          <Text style={styles.codeHint}>Kodu arkadaşlarınla paylaşarak odaya davet et</Text>

          <View style={styles.metaRow}>
            <Badge tone="purple" sticker>{roomState?.config.totalRounds ?? 5} Tur</Badge>
            <Badge tone="yellow" sticker>{roomState?.config.roundSeconds ?? 15} sn Soru</Badge>
            <Badge tone="lime" sticker>{roomState?.config.selectedCategoryIds.length ?? 6} Kategori</Badge>
            {roomState?.config.gameMode === 'survival' ? (
              <Badge tone="danger" sticker>❤️ HAYATTA KALMA</Badge>
            ) : roomState?.config.gameMode === 'suspicious' ? (
              <Badge tone="purple" sticker>🕵️ HERKES ŞÜPHELİ</Badge>
            ) : roomState?.config.gameMode === 'blitz' ? (
              <Badge tone="yellow" sticker>⚡ FIRTINA TURU</Badge>
            ) : (
              <Badge tone="orange" sticker>🦊 KLASİK MOD</Badge>
            )}
          </View>
        </Card>

        <View style={styles.playersHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.sectionTitle}>Oyuncu Bekleme Alanı</Text>
            <Badge tone="purple">{playersList.length} / {maxPlayers}</Badge>
          </View>
          <Badge tone={canStart ? 'lime' : 'yellow'} sticker>
            {readyCount}/{playersList.length} HAZIR
          </Badge>
        </View>

        <LobbyBotControls />

        <View style={styles.playersListWrap}>
          {playersList.map((player, idx) => {
            const isSelf = player.id === me?.id;
            const isReady = getReady(player);
            return (
              <StaggerRow key={player.id} index={idx} delay={70}>
                <Card
                  variant={isSelf ? 'accent' : 'surface'}
                  style={[styles.playerCard, isSelf && styles.playerCardSelf]}
                >
                  <Pressable onPress={() => setProfilePlayer(player)} style={styles.playerIdentity}>
                    <Avatar avatarKey={player.avatarUrl ?? player.avatarKey} userId={player.id} size={46} online={player.isOnline} ring={isSelf} />
                    <View style={styles.playerIdentityText}>
                      <View style={styles.nameWrap}>
                        <Text style={[styles.playerName, isSelf && { color: colors.orange }]}>
                          {player.name}
                        </Text>
                        {player.isHost && (
                          <View style={styles.hostCrownBadge}>
                            <Crown color={colors.yellow} size={12} />
                            <Text style={styles.hostCrownText}>HOST</Text>
                          </View>
                        )}
                        {isSelf && <Badge tone="neutral">SEN</Badge>}
                      </View>
                      <Text style={styles.playerScore}>{player.score} Puan</Text>
                    </View>
                  </Pressable>

                  {isReady ? (
                    <PopView duration={300}>
                      <View style={styles.readyBadge}>
                        <CheckCircle2 color="#171026" size={16} strokeWidth={2.5} />
                        <Text style={styles.readyText}>HAZIR</Text>
                      </View>
                    </PopView>
                  ) : (
                    <View style={styles.unreadyRow}>
                      <View style={styles.notReadyBadge}>
                        <Circle color={colors.textMuted} size={14} />
                        <Text style={styles.notReadyText}>Hazır Değil</Text>
                      </View>
                      {!isSelf && (
                        <Pressable
                          disabled={!isLive && !prototype.canNudge(lobbyStageId, player.id)}
                          onPress={() => void nudgePlayer(player.id, player.name)}
                          style={[
                            styles.nudgeBtn,
                            !isLive && !prototype.canNudge(lobbyStageId, player.id) && styles.nudgeBtnUsed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${player.name} oyuncusunu dürt`}
                        >
                          <Vibrate
                            color={isLive || prototype.canNudge(lobbyStageId, player.id) ? colors.orange : colors.textMuted}
                            size={19}
                            strokeWidth={2.2}
                          />
                        </Pressable>
                      )}
                    </View>
                  )}
                  {isHost && roomState?.phase === 'lobby' && !isSelf ? (
                    <Pressable
                      onPress={() => setPlayerToKick(player)}
                      style={styles.kickButton}
                      accessibilityRole="button"
                      accessibilityLabel={`${player.name} oyuncusunu lobiden çıkar`}
                    >
                      <UserMinus color={colors.dangerSoft} size={18} />
                    </Pressable>
                  ) : null}
                </Card>
              </StaggerRow>
            );
          })}

          {Array.from({ length: emptySlotsCount }).map((_, idx) => (
            <PulseView key={`empty-${idx}`} minScale={0.98} maxScale={1.01} duration={2400}>
              <View style={styles.emptySlotCard}>
                <View style={styles.emptySlotIcon}>
                  <UserPlus color={colors.textMuted} size={18} />
                </View>
                <Text style={styles.emptySlotText}>Arkadaşını veya botunu bekliyor…</Text>
              </View>
            </PulseView>
          ))}
        </View>

        <Pressable
          onPress={() => {
            if (testMode) prototype.clearReadyOverrides();
            setTestMode((value) => !value);
          }}
          style={styles.testToggle}
          accessibilityRole="button"
        >
          <FlaskConical color={colors.purpleSoft} size={16} />
          <Text style={styles.testToggleText}>
            {testMode ? 'Lobi test simülasyonunu gizle' : 'Geliştirici lobi simülasyonu'}
          </Text>
        </Pressable>
        {testMode ? (
          <Card variant="surface" style={styles.testPanel}>
            <Text style={styles.testDescription}>Hazır durumlarını denemek için oyuncu durumuna dokun.</Text>
            {playersList.filter((player) => player.id !== me?.id).map((player) => {
              const ready = getReady(player);
              return (
                <Pressable
                  key={`ready-${player.id}`}
                  onPress={() => prototype.setReady(player.id, !ready)}
                  style={styles.testPlayer}
                >
                  <Text style={styles.testPlayerName}>{player.name}</Text>
                  <Badge tone={ready ? 'lime' : 'yellow'}>
                    {ready ? 'Hazır' : 'Hazır Değil'}
                  </Badge>
                </Pressable>
              );
            })}
          </Card>
        ) : null}

      </ScrollView>
      <StickyActionBar>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button
          label={me && getReady(me) ? 'Hazır Değilim (Beklet)' : 'Hazırım! Oyuna Başla'}
          onPress={toggleReady}
          variant={me && getReady(me) ? 'secondary' : 'lime'}
          fullWidth
          style={{ marginBottom: 12 }}
        />

        {isHost ? (
          <Button
            label={canStart ? 'Oyunu Başlat!' : (['gizli_tilki', 'orman_hazinesi'].includes(roomState?.config.gameMode ?? '') ? 'En az 4 hazır oyuncu bekleniyor' : 'En az 2 hazır oyuncu bekleniyor')}
            onPress={handleStartGame}
            variant="orange"
            disabled={!canStart || starting}
            loading={starting}
            fullWidth
            icon={<Play color="#FFF" size={20} strokeWidth={2.5} />}
          />
        ) : (
          <View style={styles.waitingNotice}>
            <MascotFloat floatDistance={4} duration={2400}>
              <Image source={mascotImages.brand} style={styles.miniMascotWait} resizeMode="contain" />
            </MascotFloat>
            <Text style={styles.waitingText}>
              Oda sahibinin oyunu başlatması bekleniyor…
            </Text>
          </View>
        )}
      </StickyActionBar>
      <PlayerProfileSheet
        player={profilePlayer}
        isSelf={profilePlayer?.id === me?.id}
        visible={profilePlayer !== null}
        onClose={() => setProfilePlayer(null)}
      />
      <ModalSheet
        visible={playerToKick !== null}
        onClose={() => setPlayerToKick(null)}
        title="Oyuncuyu lobiden çıkar?"
      >
        <Text style={styles.kickConfirmation}>
          {playerToKick?.name} bu odadan çıkarılacak ve tekrar katılamayacak.
        </Text>
        <View style={styles.kickActions}>
          <Button
            label="Vazgeç"
            variant="secondary"
            onPress={() => setPlayerToKick(null)}
            disabled={kickingPlayer}
            style={{ flex: 1 }}
          />
          <Button
            label="Oyuncuyu Çıkar"
            variant="danger"
            onPress={() => void handleKickPlayer()}
            loading={kickingPlayer}
            style={{ flex: 1 }}
          />
        </View>
      </ModalSheet>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  scroll: {
    paddingBottom: spacing.md,
  },
  codeCard: {
    alignItems: 'center',
    marginVertical: spacing.sm,
    padding: spacing.xl,
    borderWidth: 2,
    borderColor: colors.orange,
  },
  codeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  kickerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kickerText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.orange,
    letterSpacing: 1.5,
  },
  miniSharePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.orange,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  miniShareText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: '#FFF',
  },
  codeText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 42,
    lineHeight: 48,
    color: '#FFF',
    letterSpacing: 8,
    marginVertical: 4,
  },
  codeHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  playersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  playersListWrap: {
    gap: 8,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  playerCardSelf: {
    borderColor: colors.orange,
    borderWidth: 1.5,
  },
  nameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  playerName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  hostCrownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 209, 102, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.yellow,
  },
  hostCrownText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 9,
    color: colors.yellow,
  },
  playerScore: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.lime,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.md,
  },
  readyText: {
    fontSize: 11,
    color: '#171026',
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.5,
  },
  unreadyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  notReadyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  nudgeBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 113, 59, 0.2)',
    borderWidth: 1,
    borderColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeBtnUsed: {
    opacity: 0.45,
    backgroundColor: colors.bgSurfaceAlt,
    borderColor: colors.border,
  },
  kickButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginLeft: spacing.xs,
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
  emptySlotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 247, 240, 0.15)',
    gap: 12,
  },
  emptySlotIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgSurfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  waitingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  miniMascotWait: {
    width: 110,
    height: 44,
  },
  waitingText: {
    ...typography.small,
    color: colors.textSecondary,
    fontFamily: 'Poppins-Medium',
  },
  errorText: {
    ...typography.small,
    color: colors.danger,
    marginTop: spacing.md,
    textAlign: 'center',
    fontFamily: 'Poppins-Medium',
  },
  kickConfirmation: {
    ...typography.body,
    color: colors.textSecondary,
  },
  kickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
