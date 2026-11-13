import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Trophy, ArrowRight, Sparkles, Crown, Medal } from 'lucide-react-native';
import {
  Screen,
  Button,
  Card,
  Badge,
  Avatar,
  PopView,
  MascotFloat,
  StaggerRow,
  PulseView,
  StickyActionBar,
} from '@/components/ui';
import { colors, spacing, typography, radii, shadows } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';

export default function ScoreboardScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { roomState, currentPlayer, roomCode, service } = useGameStore();
  const { trigger } = useHaptics();
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  // Watch for phase change
  useEffect(() => {
    if (roomState?.phase === 'ability_select') {
      router.replace('/ability-select');
    } else if (roomState?.phase === 'game_over') {
      router.replace('/game-over');
    }
  }, [roomState?.phase]);

  const currentRound = roomState?.currentRound ?? 1;
  const totalRounds = roomState?.config.totalRounds ?? 5;
  const isFinalRound = currentRound >= totalRounds;

  const playersList = roomState
    ? Object.values(roomState.players).sort((a, b) => b.score - a.score)
    : [];
  const me = playersList.find((p) => p.id === currentPlayer?.id) || currentPlayer;
  const isHost = me?.isHost ?? false;

  const top1 = playersList[0];
  const top2 = playersList[1];
  const top3 = playersList[2];
  const restPlayers = playersList.slice(3);

  const handleNextRound = async () => {
    // Only the host may advance server-authoritative rounds. Non-hosts remain
    // on the scoreboard until the realtime phase switches.
    if (!roomCode || !isHost || advancing) return;
    trigger('medium');
    setAdvancing(true);
    setAdvanceError(null);
    try {
      await service.advancePhase(roomCode);
      router.replace(isFinalRound ? '/game-over' : '/ability-select');
    } catch (cause) {
      setAdvanceError(cause instanceof Error ? cause.message : 'Tur ilerletilemedi. Yeniden dene.');
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <Screen gradient diagonalSlice>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.topHeader}>
          <MascotFloat floatDistance={4} duration={2200}>
            <View style={styles.iconCircle}>
              <Trophy color={colors.yellow} size={30} />
            </View>
          </MascotFloat>
          <Text style={styles.title}>Skor Tablosu</Text>
          <Badge tone="purple" sticker>
            Tur {currentRound} / {totalRounds} {isFinalRound ? '• FİNAL' : 'TAMAMLANDI'}
          </Badge>
        </View>

        {/* Top 3 Podium Cards */}
        {playersList.length >= 2 && (
          <View style={styles.podiumContainer}>
            {/* 2nd Place (Silver) */}
            {top2 && (
              <PopView delay={220} duration={360}>
                <View style={[styles.podiumCol, styles.podiumColSecond]}>
                  <View style={styles.avatarWrapSecond}>
                    <Avatar avatarKey={top2.avatarUrl ?? top2.avatarKey} userId={top2.id} size={48} />
                    <View style={styles.silverBadge}>
                      <Text style={styles.podiumRankText}>2</Text>
                    </View>
                  </View>
                  <Text style={styles.podiumName} numberOfLines={1}>{top2.name}</Text>
                  <Text style={styles.podiumScore}>{top2.score} P</Text>
                  <View style={styles.pillarSecond}>
                    <Medal color="#C0C0C0" size={20} />
                  </View>
                </View>
              </PopView>
            )}

            {/* 1st Place (Gold Champion) */}
            {top1 && (
              <PopView delay={100} duration={360}>
                <View style={[styles.podiumCol, styles.podiumColFirst]}>
                  <View style={styles.crownWrap}>
                    <MascotFloat floatDistance={3} duration={1600}>
                      <Crown color={colors.yellow} size={24} fill={colors.yellow} />
                    </MascotFloat>
                  </View>
                  <View style={styles.avatarWrapFirst}>
                    <Avatar avatarKey={top1.avatarUrl ?? top1.avatarKey} userId={top1.id} size={58} ring />
                    <View style={styles.goldBadge}>
                      <Text style={styles.podiumRankText}>1</Text>
                    </View>
                  </View>
                  <Text style={[styles.podiumName, styles.podiumNameFirst]} numberOfLines={1}>
                    {top1.name}
                  </Text>
                  <Text style={[styles.podiumScore, styles.podiumScoreFirst]}>
                    {top1.score} P
                  </Text>
                  <View style={styles.pillarFirst}>
                    <Trophy color={colors.yellow} size={24} />
                  </View>
                </View>
              </PopView>
            )}

            {/* 3rd Place (Bronze) */}
            {top3 && (
              <PopView delay={340} duration={360}>
                <View style={[styles.podiumCol, styles.podiumColThird]}>
                  <View style={styles.avatarWrapThird}>
                    <Avatar avatarKey={top3.avatarUrl ?? top3.avatarKey} userId={top3.id} size={44} />
                    <View style={styles.bronzeBadge}>
                      <Text style={styles.podiumRankText}>3</Text>
                    </View>
                  </View>
                  <Text style={styles.podiumName} numberOfLines={1}>{top3.name}</Text>
                  <Text style={styles.podiumScore}>{top3.score} P</Text>
                  <View style={styles.pillarThird}>
                    <Medal color="#CD7F32" size={18} />
                  </View>
                </View>
              </PopView>
            )}
          </View>
        )}

        {/* Players List (All or Rest) */}
        <Text style={styles.listLabel}>TÜM SIRALAMA</Text>
        <View style={styles.playersListWrap}>
          {playersList.map((player, index) => {
            const isMe = player.id === currentPlayer?.id;
            const isLeader = index === 0;

            return (
              <StaggerRow key={player.id} index={index} delay={60}>
                <Card
                  variant={isMe ? 'accent' : 'surface'}
                  style={[styles.playerRow, isMe && styles.playerRowSelf]}
                >
                  <View style={styles.rankNumCircle}>
                    <Text style={[styles.rankNum, isLeader && { color: colors.yellow }]}>
                      #{index + 1}
                    </Text>
                  </View>

                  <Avatar avatarKey={player.avatarUrl ?? player.avatarKey} userId={player.id} size={40} ring={isMe} />

                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.playerName, isMe && { color: colors.orange }]}>
                      {player.name} {isMe ? '(Sen)' : ''}
                    </Text>
                    <Text style={styles.playerMeta}>
                      {player.isHost ? 'Oda Kurucusu' : `Sıralama: ${index + 1}.`} · 🪙 {player.credits ?? 0} kredi
                    </Text>
                  </View>

                  <Badge tone={isLeader ? 'yellow' : isMe ? 'orange' : 'neutral'} sticker>
                    {player.score} PUAN
                  </Badge>
                </Card>
              </StaggerRow>
            );
          })}
        </View>

      </ScrollView>
      <StickyActionBar>
        {advanceError ? (
          <Text accessibilityRole="alert" style={[styles.advanceError, { color: colors.dangerSoft }]}>
            {advanceError}
          </Text>
        ) : null}
        {isFinalRound && isHost ? (
          <Button
            label="Final Podyumunu Aç!"
            onPress={handleNextRound}
            variant="orange"
            fullWidth
            loading={advancing}
            disabled={advancing}
            icon={<Sparkles color="#FFF" size={20} />
          />
        ) : isHost ? (
          <Button
            label={`Sonraki Tura Geç (Tur ${currentRound + 1})`}
            onPress={handleNextRound}
            variant="orange"
            fullWidth
            loading={advancing}
            disabled={advancing}
            icon={<ArrowRight color="#FFF" size={20} />
          />
        ) : (
          <View style={styles.waitingNotice}>
            <Text style={styles.waitingText}>
              {isFinalRound ? 'Oda kurucusunun finali açması bekleniyor…' : 'Oda kurucusunun sonraki turu başlatması bekleniyor…'}
            </Text>
          </View>
        )}
      </StickyActionBar>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  advanceError: { fontFamily: 'Poppins-Medium', fontSize: 11, textAlign: 'center', marginBottom: 7 },
  scroll: {
    paddingBottom: spacing.md,
    paddingTop: 4,
  },
  topHeader: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
    borderWidth: 2,
    borderColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...shadows.card,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    marginBottom: 4,
  },
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    marginVertical: spacing.md,
    paddingHorizontal: 8,
  },
  podiumCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  podiumColFirst: {
    transform: [{ translateY: -10 }],
  },
  podiumColSecond: {},
  podiumColThird: {},
  crownWrap: {
    marginBottom: -4,
    zIndex: 10,
  },
  avatarWrapFirst: {
    position: 'relative',
    alignItems: 'center',
  },
  avatarWrapSecond: {
    position: 'relative',
    alignItems: 'center',
  },
  avatarWrapThird: {
    position: 'relative',
    alignItems: 'center',
  },
  goldBadge: {
    position: 'absolute',
    bottom: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#171026',
  },
  silverBadge: {
    position: 'absolute',
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C0C0C0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#171026',
  },
  bronzeBadge: {
    position: 'absolute',
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#CD7F32',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#171026',
  },
  podiumRankText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: '#171026',
  },
  podiumName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: colors.textPrimary,
    marginTop: 10,
  },
  podiumNameFirst: {
    fontSize: 14,
    color: colors.yellow,
  },
  podiumScore: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  podiumScoreFirst: {
    fontSize: 13,
    color: colors.orange,
  },
  pillarFirst: {
    width: '100%',
    height: 96,
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.yellow,
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  pillarSecond: {
    width: '100%',
    height: 72,
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#C0C0C0',
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarThird: {
    width: '100%',
    height: 56,
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#CD7F32',
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  playersListWrap: {
    gap: 8,
    marginBottom: spacing.xl,
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
  rankNumCircle: {
    width: 32,
    alignItems: 'center',
  },
  rankNum: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    color: colors.textMuted,
  },
  playerName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  playerMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  waitingNotice: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  waitingText: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
