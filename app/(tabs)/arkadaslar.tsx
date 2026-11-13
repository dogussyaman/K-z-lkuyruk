import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ScrollView, Pressable, Share, TextInput, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { UserPlus, Share2, Send, Search, UserRoundX, UserRoundCheck } from 'lucide-react-native';
import { Screen, ScreenHeader, Card, Button, Avatar, EmptyState, Badge } from '@/components/ui';
import { colors, spacing, typography, radii } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import type { FriendRequest, SocialPlayer } from '@/services/types';

export default function ArkadaslarScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { roomCode, service } = useGameStore();
  const { trigger } = useHaptics();
  const [friends, setFriends] = useState<SocialPlayer[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const hasLoadedSocialData = useRef(false);
  const [loadingRequest, setLoadingRequest] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SocialPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingPlayerId, setLoadingPlayerId] = useState<string | null>(null);

  const refreshSocialData = useCallback(async () => {
    if (!hasLoadedSocialData.current) {
      setLoadingData(true);
      setLoadError(null);
    }
    try {
      const [friendList, friendRequests] = await Promise.all([
        service.listFriends(),
        service.listFriendRequests(),
      ]);
      setFriends(friendList);
      setRequests(friendRequests);
      hasLoadedSocialData.current = true;
      setError(null);
    } catch (e) {
      const message = (e as Error).message || 'Arkadaşların yüklenemedi.';
      if (hasLoadedSocialData.current) {
        setError(message);
      } else {
        setLoadError(message);
      }
    } finally {
      setLoadingData(false);
    }
  }, [service]);

  useFocusEffect(useCallback(() => {
    void refreshSocialData();
  }, [refreshSocialData]));

  const handleShare = async () => {
    trigger('light');
    try {
      await Share.share({
        message: roomCode
          ? `Kızılkuyruk parti oyununda odadayım! Kod: ${roomCode}. Hemen katıl!`
          : `Kızılkuyruk blöf oyununu oynamak için arkadaş ekle!`,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const respondToRequest = async (request: FriendRequest, accept: boolean) => {
    setLoadingRequest(request.requestId);
    setError(null);
    try {
      await service.respondFriendRequest(request.requestId, accept);
      setSearchResults((results) => results.map((player) =>
        player.id === request.id
          ? { ...player, relationshipStatus: accept ? 'friends' : 'none' }
          : player
      ));
      await refreshSocialData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingRequest(null);
    }
  };

  const searchPlayers = async () => {
    const query = searchQuery.trim();
    if (query.length < 2 || query.length > 32) {
      setSearchError('Oyuncu aramak için 2-32 karakter gir.');
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setSearchError(null);
    setHasSearched(false);
    setSearchResults([]);
    try {
      setSearchResults(await service.searchPlayers(query));
      setHasSearched(true);
    } catch (e) {
      setSearchError((e as Error).message || 'Oyuncular aranamadı.');
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (playerId: string) => {
    setLoadingPlayerId(playerId);
    setSearchError(null);
    try {
      const relationshipStatus = await service.sendFriendRequest(playerId);
      setSearchResults((results) => results.map((player) =>
        player.id === playerId ? { ...player, relationshipStatus } : player
      ));
      await refreshSocialData();
    } catch (e) {
      setSearchError((e as Error).message || 'Arkadaşlık isteği gönderilemedi.');
    } finally {
      setLoadingPlayerId(null);
    }
  };

  const removeFriend = async (player: SocialPlayer) => {
    setLoadingPlayerId(player.id);
    setError(null);
    try {
      await service.removeFriend(player.id);
      await refreshSocialData();
      setSearchResults((results) => results.map((result) =>
        result.id === player.id ? { ...result, relationshipStatus: 'none' } : result
      ));
    } catch (e) {
      setError((e as Error).message || 'Arkadaş kaldırılamadı.');
    } finally {
      setLoadingPlayerId(null);
    }
  };

  return (
    <Screen gradient diagonalSlice padded={false} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Arkadaşlar"
          subtitle="Davet et, birlikte blöf yapın!"
          right={<Badge tone="purple" sticker>{friends.length} ARKADAŞ</Badge>}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Room Share Card */}
        <Card variant="surface" style={{ marginTop: spacing.xs }}>
          <View style={styles.inviteRow}>
            <View style={styles.inviteIconCircle}>
              <UserPlus color={colors.orange} size={22} strokeWidth={2.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteTitle}>Oda Kodunu Paylaş</Text>
              <Text style={styles.inviteDesc}>
                {roomCode ? `Aktif oda kodun: ${roomCode}` : 'Bir oda kurarak arkadaşlarını çağır.'}
              </Text>
            </View>
            <Button
              label="Paylaş"
              size="md"
              variant="orange"
              onPress={handleShare}
              icon={<Share2 color="#FFF" size={15} />}
            />
          </View>
        </Card>

        {loadingData ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Arkadaşlık İstekleri</Text>
            <Card variant="surface" style={styles.loadingCard}>
              <ActivityIndicator color={colors.blueSoft} />
              <Text style={styles.loadingText}>İstekler yükleniyor...</Text>
            </Card>
          </View>
        ) : loadError ? null : requests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Arkadaşlık İstekleri ({requests.length})</Text>
            <Card variant="surface" style={styles.listCard}>
            {requests.map((request, idx) => (
              <View key={request.requestId} style={[styles.row, idx < requests.length - 1 && styles.rowBorder]}>
                <Avatar avatarKey={request.avatarUrl ?? request.avatarKey} userId={request.id} size={42} />
                <View style={styles.requestIdentity}>
                  <Text style={styles.name}>{request.name}</Text>
                  <Text style={styles.requestDate}>
                    {new Date(request.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <Pressable
                  disabled={loadingRequest === request.requestId}
                  onPress={() => void respondToRequest(request, true)}
                  style={styles.acceptButton}
                >
                  <Text style={styles.acceptText}>Kabul</Text>
                </Pressable>
                <Pressable
                  disabled={loadingRequest === request.requestId}
                  onPress={() => void respondToRequest(request, false)}
                  style={styles.declineButton}
                >
                  <Text style={styles.declineText}>Reddet</Text>
                </Pressable>
              </View>
            ))}
            </Card>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Oyuncu Bul</Text>
          <Card variant="surface" style={styles.searchCard}>
            <View style={styles.searchRow}>
              <TextInput
                value={searchQuery}
                onChangeText={(value) => {
                  setSearchQuery(value);
                  setSearchError(null);
                  setHasSearched(false);
                  setSearchResults([]);
                }}
                onSubmitEditing={() => void searchPlayers()}
                placeholder="Oyuncu adını yaz"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                maxLength={32}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel="Oyuncu adıyla ara"
              />
              <Pressable
                onPress={() => void searchPlayers()}
                disabled={searching}
                accessibilityRole="button"
                accessibilityLabel="Oyuncu ara"
                style={styles.searchButton}
              >
                {searching
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Search color="#FFF" size={18} />}
              </Pressable>
            </View>
            {searchError ? <Text accessibilityRole="alert" style={styles.error}>{searchError}</Text> : null}
            {!searching && hasSearched && searchResults.length === 0 && !searchError ? (
              <Text style={styles.loadingText}>Eşleşen oyuncu bulunamadı.</Text>
            ) : null}
            {searchResults.map((player) => (
              <View key={player.id} style={styles.searchResult}>
                <Avatar avatarKey={player.avatarUrl ?? player.avatarKey} userId={player.id} size={40} />
                <Text style={styles.searchName} numberOfLines={1}>{player.name}</Text>
                {player.relationshipStatus === 'friends' ? (
                  <Pressable
                    onPress={() => void removeFriend(player)}
                    disabled={loadingPlayerId === player.id}
                    style={styles.relationshipAction}
                    accessibilityRole="button"
                    accessibilityLabel={`${player.name} arkadaşlığını kaldır`}
                  >
                    {loadingPlayerId === player.id
                      ? <ActivityIndicator color={colors.dangerSoft} size="small" />
                      : <UserRoundX color={colors.dangerSoft} size={18} />}
                  </Pressable>
                ) : player.relationshipStatus === 'none' ? (
                  <Pressable
                    onPress={() => void sendRequest(player.id)}
                    disabled={loadingPlayerId === player.id}
                    style={styles.relationshipAction}
                    accessibilityRole="button"
                    accessibilityLabel={`${player.name} arkadaşlık isteği gönder`}
                  >
                    {loadingPlayerId === player.id
                      ? <ActivityIndicator color={colors.lime} size="small" />
                      : <UserPlus color={colors.lime} size={18} />}
                  </Pressable>
                ) : (
                  <View style={styles.requestStatus}>
                    <UserRoundCheck color={colors.textMuted} size={16} />
                    <Text style={styles.requestStatusText}>
                      {player.relationshipStatus === 'incoming_pending' ? 'İstek gönderdi' : 'İstek gönderildi'}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Arkadaşların ({friends.length})</Text>
          {loadingData ? (
            <Card variant="surface" style={styles.loadingCard}>
              <ActivityIndicator color={colors.blueSoft} />
              <Text style={styles.loadingText}>Arkadaşların yükleniyor...</Text>
            </Card>
          ) : loadError ? (
            <Card variant="surface" style={styles.loadingCard}>
              <Text style={styles.loadError}>{loadError}</Text>
              <Pressable onPress={() => void refreshSocialData()} style={styles.retryButton}>
                <Text style={styles.retryText}>Yeniden dene</Text>
              </Pressable>
            </Card>
          ) : friends.length === 0 ? (
            <EmptyState title="Henüz arkadaşın yok" message="Oyuncu profillerinden arkadaşlık isteği gönder." />
          ) : (
            <Card variant="surface" style={styles.listCard}>
              {friends.map((friend, idx) => (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  onInvite={handleShare}
                  onRemove={() => void removeFriend(friend)}
                  removing={loadingPlayerId === friend.id}
                  isLast={idx === friends.length - 1}
                />
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function FriendRow({
  friend,
  onInvite,
  onRemove,
  removing,
  muted,
  isLast,
}: {
  friend: SocialPlayer;
  onInvite: () => void;
  onRemove: () => void;
  removing: boolean;
  muted?: boolean;
  isLast?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <Avatar avatarKey={friend.avatarUrl ?? friend.avatarKey} userId={friend.id} size={42} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={[styles.name, muted && { color: colors.textMuted }]}>{friend.name}</Text>
        <Badge tone="neutral" sticker>Arkadaş</Badge>
      </View>
      <Pressable onPress={onInvite} style={styles.iconBtn}>
        <Send color={colors.purpleSoft} size={18} />
      </Pressable>
      <Pressable
        onPress={onRemove}
        disabled={removing}
        style={[styles.iconBtn, styles.removeFriendButton]}
        accessibilityRole="button"
        accessibilityLabel={`${friend.name} arkadaşlığını kaldır`}
      >
        {removing
          ? <ActivityIndicator color={colors.dangerSoft} size="small" />
          : <UserRoundX color={colors.dangerSoft} size={18} />}
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 100,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.orangeSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  inviteDesc: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
    fontSize: 12,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    marginBottom: spacing.xs,
  },
  listCard: {
    padding: 0,
    overflow: 'hidden',
  },
  loadingCard: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  loadError: {
    ...typography.caption,
    color: colors.dangerSoft,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  retryText: {
    ...typography.caption,
    color: colors.orange,
    fontFamily: 'Poppins-SemiBold',
  },
  searchCard: {
    gap: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    color: colors.textPrimary,
    backgroundColor: colors.bgSurfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.blueDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResult: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  searchName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  relationshipAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  requestStatusText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  removeFriendButton: {
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    marginBottom: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestIdentity: {
    flex: 1,
    marginLeft: 10,
  },
  requestDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  acceptButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.lime,
    marginRight: 6,
  },
  acceptText: {
    ...typography.caption,
    color: colors.zartoNight,
    fontFamily: 'Poppins-Bold',
  },
  declineButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurfaceAlt,
  },
  declineText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginVertical: spacing.sm,
  },
});
