import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Trophy, Crown, Medal, Flame, RefreshCw } from 'lucide-react-native';
import { Screen, ScreenHeader, Card, Badge, Avatar } from '@/components/ui';
import { colors, spacing, typography, radii, shadows } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import type { Player } from '@/types/game';
import type { LeaderboardScope } from '@/services/types';

type FilterType = LeaderboardScope;

export default function LiderlikScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { service, currentPlayer } = useGameStore();
  const { trigger } = useHaptics();
  const [filter, setFilter] = useState<FilterType>('all');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestId = useRef(0);
  const leaderboardCache = useRef(new Map<FilterType, Player[]>());

  const loadLeaderboard = useCallback(async (scope: FilterType) => {
    const currentRequestId = ++requestId.current;
    const cachedPlayers = leaderboardCache.current.get(scope);
    if (cachedPlayers) {
      setPlayers(cachedPlayers);
      setLoading(false);
    } else {
      setPlayers([]);
      setLoading(true);
    }
    setLoadError(null);
    setRefreshError(null);
    try {
      const nextPlayers = await service.getLeaderboard(scope);
      if (currentRequestId === requestId.current) {
        leaderboardCache.current.set(scope, nextPlayers);
        setPlayers(nextPlayers);
      }
    } catch (error) {
      if (currentRequestId === requestId.current) {
        const message = (error as Error).message || 'Liderlik tablosu yüklenemedi.';
        if (cachedPlayers) {
          setRefreshError(message);
        } else {
          setLoadError(message);
        }
      }
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [service]);

  useFocusEffect(useCallback(() => {
    void loadLeaderboard(filter);
  }, [filter, loadLeaderboard]));

  const topThree = players.slice(0, 3);
  const podiumVisible = topThree.length >= 3;
  const listOffset = podiumVisible ? 3 : 0;
  const rest = players.slice(listOffset);

  const onTabSelect = (tab: FilterType) => {
    trigger('light');
    setFilter(tab);
  };

  return (
    <Screen gradient diagonalSlice padded={false} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Liderlik"
          subtitle="En çok tuzağa düşüren parti şampiyonları"
          right={
            <View style={styles.badgeWrap}>
              <Flame color={colors.orange} size={16} />
              <Text style={styles.badgeText}>
                {filter === 'weekly' ? 'SON 7 GÜN' : filter === 'friends' ? 'ARKADAŞLAR' : 'TÜM ZAMANLAR'}
              </Text>
            </View>
          }
        />

        {/* Tab Filters */}
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => onTabSelect('all')}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === 'all' }}
            style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
              Genel Sıralama
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onTabSelect('weekly')}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === 'weekly' }}
            style={[styles.filterBtn, filter === 'weekly' && styles.filterBtnActive]}
          >
            <Text style={[styles.filterText, filter === 'weekly' && styles.filterTextActive]}>
              Haftalık
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onTabSelect('friends')}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === 'friends' }}
            style={[styles.filterBtn, filter === 'friends' && styles.filterBtnActive]}
          >
            <Text style={[styles.filterText, filter === 'friends' && styles.filterTextActive]}>
              Arkadaşlar
            </Text>
          </Pressable>
        </View>

        {/* Top 3 Podium */}
        {!loading && !loadError && podiumVisible && (
          <View style={styles.podiumContainer}>
            {/* 2nd place */}
            <View style={[styles.podiumCol, styles.secondPlace]}>
              <Avatar avatarKey={topThree[1].avatarUrl ?? topThree[1].avatarKey} userId={topThree[1].id} size={50} />
              <View style={styles.silverBadge}>
                <Text style={styles.rankNum}>2</Text>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>
                {topThree[1].name}
              </Text>
              <Text style={styles.podiumScore}>{topThree[1].score} P</Text>
              <View style={styles.pillarSecond}>
                <Medal color="#C0C0C0" size={20} />
              </View>
            </View>

            {/* 1st place */}
            <View style={[styles.podiumCol, styles.firstPlace]}>
              <View style={styles.crownWrap}>
                <Crown color={colors.yellow} size={24} fill={colors.yellow} />
              </View>
              <Avatar avatarKey={topThree[0].avatarUrl ?? topThree[0].avatarKey} userId={topThree[0].id} size={62} ring />
              <View style={styles.goldBadge}>
                <Text style={styles.rankNum}>1</Text>
              </View>
              <Text style={[styles.podiumName, styles.podiumNameFirst]} numberOfLines={1}>
                {topThree[0].name}
              </Text>
              <Text style={[styles.podiumScore, styles.podiumScoreFirst]}>
                {topThree[0].score} P
              </Text>
              <View style={styles.pillarFirst}>
                <Trophy color={colors.yellow} size={26} />
              </View>
            </View>

            {/* 3rd place */}
            <View style={[styles.podiumCol, styles.thirdPlace]}>
              <Avatar avatarKey={topThree[2].avatarUrl ?? topThree[2].avatarKey} userId={topThree[2].id} size={46} />
              <View style={styles.bronzeBadge}>
                <Text style={styles.rankNum}>3</Text>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>
                {topThree[2].name}
              </Text>
              <Text style={styles.podiumScore}>{topThree[2].score} P</Text>
              <View style={styles.pillarThird}>
                <Medal color="#CD7F32" size={18} />
              </View>
            </View>
          </View>
        )}

        {/* Remainder list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OYUNCU SIRALAMASI</Text>
          {refreshError ? (
            <Pressable
              onPress={() => void loadLeaderboard(filter)}
              style={styles.retryButton}
              accessibilityRole="button"
            >
              <RefreshCw color={colors.orange} size={16} />
              <Text style={styles.retryText}>Güncellenemedi · Yeniden dene</Text>
            </Pressable>
          ) : null}
          {loading ? (
            <Card variant="surface" style={styles.emptyCard}>
              <ActivityIndicator color={colors.blueSoft} />
              <Text style={styles.emptyText}>Liderlik tablosu yükleniyor...</Text>
            </Card>
          ) : loadError ? (
            <Card variant="surface" style={styles.emptyCard}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Pressable onPress={() => void loadLeaderboard(filter)} style={styles.retryButton}>
                <RefreshCw color={colors.orange} size={16} />
                <Text style={styles.retryText}>Yeniden dene</Text>
              </Pressable>
            </Card>
          ) : players.length === 0 ? (
            <Card variant="surface" style={styles.emptyCard}>
              <Trophy color={colors.yellow} size={24} />
              <Text style={styles.emptyTitle}>Henüz sıralama oluşmadı</Text>
              <Text style={styles.emptyText}>
                {filter === 'friends'
                  ? 'Arkadaşların arasında henüz sıralama yok.'
                  : filter === 'weekly'
                    ? 'Son 7 günde tamamlanmış bir oyun henüz yok.'
                    : 'İlk maç tamamlandığında oyuncular ve puanları burada görünecek.'}
              </Text>
            </Card>
          ) : rest.length > 0 ? (
            <Card variant="surface" style={styles.rankedListCard}>
              {rest.map((p, index) => {
                const rank = index + listOffset + 1;
                const isMe = currentPlayer?.id === p.id;
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.playerRow,
                      index !== rest.length - 1 && styles.playerRowBorder,
                    ]}
                  >
                    <Text style={styles.rankText}>#{rank}</Text>
                    <Avatar avatarKey={p.avatarUrl ?? p.avatarKey} userId={p.id} size={40} ring={isMe} />
                    <View style={styles.playerDetails}>
                      <Text
                        style={[styles.name, isMe && { color: colors.orange }]}
                        numberOfLines={1}
                      >
                        {p.name} {isMe ? '(Sen)' : ''}
                      </Text>
                      <Text style={styles.subtext}>{p.gamesPlayed ?? 0} tamamlanan oyun</Text>
                    </View>
                    <Badge tone={isMe ? 'orange' : 'neutral'}>{p.score} P</Badge>
                  </View>
                );
              })}
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 100,
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.orangeSurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.orange,
  },
  badgeText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    color: colors.orange,
    letterSpacing: 0.8,
  },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: 4,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: colors.orange,
    ...shadows.card,
  },
  filterText: {
    ...typography.small,
    color: colors.textSecondary,
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    textAlign: 'center',
  },
  filterTextActive: {
    color: '#FFF',
    fontFamily: 'Poppins-Bold',
  },
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.xl,
    paddingHorizontal: 8,
  },
  podiumCol: {
    flex: 1,
    alignItems: 'center',
  },
  firstPlace: {
    transform: [{ translateY: -10 }],
  },
  secondPlace: {},
  thirdPlace: {},
  crownWrap: {
    marginBottom: -4,
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
  rankNum: {
    color: '#171026',
    fontSize: 11,
    fontFamily: 'Poppins-Bold',
  },
  podiumName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: colors.textPrimary,
    marginTop: 10,
    textAlign: 'center',
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
    height: 90,
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
    height: 68,
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
    height: 52,
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#CD7F32',
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  rankedListCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyCard: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontFamily: 'Poppins-SemiBold',
    textAlign: 'center',
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
    color: colors.dangerSoft,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  retryText: {
    ...typography.caption,
    color: colors.orange,
    fontFamily: 'Poppins-SemiBold',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  playerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rankText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    color: colors.textMuted,
    width: 32,
    flexShrink: 0,
  },
  playerDetails: {
    flex: 1,
    minWidth: 0,
    marginLeft: 2,
  },
  name: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  subtext: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
});
