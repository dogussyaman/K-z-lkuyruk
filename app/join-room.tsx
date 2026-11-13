import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, LogIn, Users, KeyRound, Sparkles, Eye, EyeOff } from 'lucide-react-native';
import { Screen, Button, Card, Avatar, Badge, StickyActionBar, Input } from '@/components/ui';
import { spacing, typography, radii, shadows } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import { AVATAR_KEYS, DICEBEAR_AVATAR_KEYS } from '@/features/game/players';
import { CATEGORIES } from '@/features/game/categories';
import type { RoomSummary } from '@/services/types';

export default function JoinRoomScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const {
    service,
    currentPlayer,
    authStatus,
    setCurrentPlayer,
    setRoomCode,
    setRoomState,
  } = useGameStore();
  const params = useLocalSearchParams<{ code?: string | string[]; invite?: string | string[] }>();
  const { trigger } = useHaptics();

  const initialCode = typeof params.code === 'string' ? params.code.trim().toUpperCase() : '';
  const initialInvite = typeof params.invite === 'string' ? params.invite : '';
  const invalidInitialLink = (params.code !== undefined && !/^[A-Z0-9]{5,6}$/.test(initialCode))
    ? 'Davet bağlantısındaki oda kodu geçersiz.'
    : (initialInvite && !/^[A-Za-z0-9_-]{43}$/.test(initialInvite))
      ? 'Davet bağlantısı geçersiz.'
      : null;
  const [code, setCode] = useState(/^[A-Z0-9]{5,6}$/.test(initialCode) ? initialCode : '');
  const [roomPassword, setRoomPassword] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [inviteToken, setInviteToken] = useState(
    /^[A-Za-z0-9_-]{43}$/.test(initialInvite) ? initialInvite : ''
  );
  const [showRoomPassword, setShowRoomPassword] = useState(false);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const name = nameOverride ?? currentPlayer?.name ?? 'Oyuncu';
  const avatarKey = avatarOverride ?? currentPlayer?.avatarKey ?? 'fox';
  const [openRooms, setOpenRooms] = useState<RoomSummary[]>([]);
  const [joinMode, setJoinMode] = useState<'open' | 'code'>(
    initialCode || initialInvite ? 'code' : 'open'
  );
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [roomListError, setRoomListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(invalidInitialLink);
  const [isFocused, setIsFocused] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (authStatus === 'signed_out') {
      router.replace({
        pathname: '/auth',
        params: {
          returnTo: '/join-room',
          code: typeof params.code === 'string' ? params.code : undefined,
          invite: typeof params.invite === 'string' ? params.invite : undefined,
        },
      });
    }
  }, [authStatus, params.code, params.invite]);

  const loadOpenRooms = useCallback(async () => {
    try {
      const rooms = await service.listOpenRooms();
      setOpenRooms(rooms);
      setRoomListError(null);
    } catch (cause) {
      setRoomListError((cause as Error).message || 'Açık odalar yüklenemedi.');
    } finally {
      setLoadingRooms(false);
      setRefreshingRooms(false);
    }
  }, [service]);

  useEffect(() => {
    if (authStatus !== 'signed_in') return;
    let active = true;
    service.listOpenRooms()
      .then((rooms) => {
        if (!active) return;
        setOpenRooms(rooms);
        setRoomListError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setRoomListError((cause as Error).message || 'Açık odalar yüklenemedi.');
      })
      .finally(() => {
        if (!active) return;
        setLoadingRooms(false);
        setRefreshingRooms(false);
      });
    return () => {
      active = false;
    };
  }, [authStatus, service]);

  const refreshOpenRooms = useCallback(() => {
    setRefreshingRooms(true);
    void loadOpenRooms();
  }, [loadOpenRooms]);

  const retryOpenRooms = useCallback(() => {
    setLoadingRooms(true);
    void loadOpenRooms();
  }, [loadOpenRooms]);

  const handleJoin = async (targetCode?: string) => {
    if (submitting.current) return;
    const finalCode = (targetCode || code).trim().toUpperCase();
    if (!/^[A-Z0-9]{5,6}$/.test(finalCode)) {
      setError('Lütfen geçerli 5-6 karakterli bir oda kodu gir.');
      return;
    }
    const hasInvite = !!inviteToken && finalCode === code;
    const passwordConfirmed = requiresPassword && finalCode === code;
    submitting.current = true;
    setCode(finalCode);
    trigger('medium');
    setLoading(true);
    setError(null);
    try {
      if (!hasInvite && !passwordConfirmed) {
        const access = await service.checkRoomAccess(finalCode);
        if (access === 'password_required') {
          setCode(finalCode);
          setRequiresPassword(true);
          setRoomPassword('');
          setLoading(false);
          return;
        }
      }
      const res = await service.joinRoom(
        finalCode,
        name.trim() || 'Oyuncu',
        avatarKey,
        passwordConfirmed ? roomPassword || undefined : undefined,
        hasInvite ? inviteToken : undefined
      );
      setRoomCode(finalCode);
      const state = await service.getRoomState(finalCode);
      setRoomState(state);
      if (state?.players[res.playerId]) {
        setCurrentPlayer(state.players[res.playerId]);
      }
      router.replace('/lobby');
    } catch (e) {
      const cause = e as { code?: string; message?: string };
      if (targetCode && !hasInvite && !passwordConfirmed && cause.code === 'ROOM_ACCESS_DENIED') {
        try {
          const access = await service.checkRoomAccess(finalCode);
          if (access === 'password_required') {
            setJoinMode('code');
            setCode(finalCode);
            setRequiresPassword(true);
            setRoomPassword('');
            setError('Oda artık kilitli. Şifreyi girerek katılabilirsin.');
            return;
          }
        } catch (accessError) {
          const accessCause = accessError as { code?: string; message?: string };
          if (accessCause.code === 'ROOM_FULL') {
            setError('Oda dolu. Başka bir odayı deneyebilirsin.');
          } else if (accessCause.code === 'GAME_ALREADY_STARTED') {
            setError('Oyun başladı; yeni oyuncu kabul edilmiyor.');
          } else if (accessCause.code === 'ROOM_UNAVAILABLE') {
            setError('Oda bulunamadı veya yeni katılıma açık değil. Oda kodunu kontrol et.');
          } else {
            setError(accessCause.message || cause.message || 'Odaya katılırken bir hata oluştu.');
          }
          return;
        }
      }
      if (requiresPassword && finalCode === code && cause.code === 'ROOM_ACCESS_DENIED') {
        setRoomPassword('');
        setError('Oda şifresi yanlış. Yeniden dene.');
      } else if (cause.code === 'ROOM_UNAVAILABLE') {
        setRequiresPassword(false);
        setRoomPassword('');
        setError('Oda bulunamadı veya yeni katılıma açık değil. Oda kodunu kontrol et.');
      } else if (cause.code === 'ROOM_FULL') {
        setError('Oda dolu. Başka bir odayı deneyebilirsin.');
      } else if (cause.code === 'GAME_ALREADY_STARTED') {
        setError('Oyun başladı; yeni oyuncu kabul edilmiyor.');
      } else if (cause.code === 'INVITE_INVALID') {
        setInviteToken('');
        setError('Davet bağlantısı geçersiz, süresi dolmuş veya kullanılmış.');
      } else if (cause.code === 'INVITE_UNAVAILABLE') {
        setError('Bu davet bağlantısı canlı oyun modunda kullanılabilir.');
      } else {
        setError(cause.message || 'Odaya katılırken bir hata oluştu.');
      }
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <Screen gradient diagonalSlice>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft color={colors.textPrimary} size={22} />
          </Pressable>
          <Text style={styles.screenTitle}>Odaya Katıl</Text>
          <Badge tone="orange" sticker>GİRİŞ</Badge>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={joinMode === 'open' ? (
            <RefreshControl
              refreshing={refreshingRooms}
              onRefresh={refreshOpenRooms}
              tintColor={colors.orange}
            />
          ) : undefined}
        >
          <View style={styles.modeSwitch}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: joinMode === 'open' }}
              onPress={() => {
                setJoinMode('open');
                setError(null);
              }}
              style={[styles.modeButton, joinMode === 'open' && styles.modeButtonActive]}
            >
              <Users color={joinMode === 'open' ? colors.orange : colors.textSecondary} size={17} />
              <Text style={[styles.modeText, joinMode === 'open' && styles.modeTextActive]}>Açık Odalar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: joinMode === 'code' }}
              onPress={() => {
                setJoinMode('code');
                setError(null);
              }}
              style={[styles.modeButton, joinMode === 'code' && styles.modeButtonActive]}
            >
              <KeyRound color={joinMode === 'code' ? colors.orange : colors.textSecondary} size={17} />
              <Text style={[styles.modeText, joinMode === 'code' && styles.modeTextActive]}>Oda Kodu ile Katıl</Text>
            </Pressable>
          </View>

          {joinMode === 'code' ? (
            <>
          {/* Giant Code Input Card */}
          <Card
            variant="surface"
            style={[
              styles.sectionCard,
              isFocused && styles.sectionCardFocused,
            ]}
          >
            <View style={styles.codeHeaderRow}>
              <KeyRound color={colors.orange} size={18} />
              <Text style={styles.sectionLabel}>Oda Kodu</Text>
            </View>

            <TextInput
              value={code}
              onChangeText={(txt) => {
                setError(null);
                setCode(txt.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                setRequiresPassword(false);
                setRoomPassword('');
                setInviteToken('');
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="TUZAK"
              placeholderTextColor={colors.textMuted}
              style={[styles.giantCodeInput, isFocused && styles.giantCodeInputFocused]}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
              underlineColorAndroid="transparent"
            />
          </Card>

          {requiresPassword ? (
            <Card variant="surface" style={styles.sectionCard}>
              <View style={styles.codeHeaderRow}>
                <KeyRound color={colors.purpleSoft} size={18} />
                <Text style={styles.sectionLabel}>Oda Şifresi</Text>
              </View>
              <View style={styles.roomPasswordRow}>
                <TextInput
                  value={roomPassword}
                  onChangeText={(value) => {
                    setError(null);
                    setRoomPassword(value);
                  }}
                  placeholder="Oda şifresi"
                  placeholderTextColor={colors.textMuted}
                  style={styles.roomPasswordInput}
                  secureTextEntry={!showRoomPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={72}
                  accessibilityLabel="Oda şifresi"
                />
                <Pressable
                  onPress={() => setShowRoomPassword((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={showRoomPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  style={styles.passwordVisibilityButton}
                >
                  {showRoomPassword
                    ? <EyeOff color={colors.textSecondary} size={20} />
                    : <Eye color={colors.textSecondary} size={20} />}
                </Pressable>
              </View>
            </Card>
          ) : null}

          <Pressable
            onPress={() => setShowProfileEditor((visible) => !visible)}
            style={styles.profileEditToggle}
            accessibilityRole="button"
          >
            <Text style={styles.profileEditText}>
              {name} olarak katıl · {showProfileEditor ? 'Profili gizle' : 'Profili düzenle'}
            </Text>
          </Pressable>
          {showProfileEditor ? (
            <Card variant="surface" style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>Lobiye Giriş İsmin</Text>
              <Input
                value={name}
                onChangeText={setNameOverride}
                placeholder="Takma Adın"
                placeholderTextColor={colors.textMuted}
                style={styles.nameInput}
                maxLength={16}
                variant="surface"
                focusedBorderColor={colors.orange}
              />

              <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Avatarını Seç</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.avatarScroll}
              >
                {[...AVATAR_KEYS, ...DICEBEAR_AVATAR_KEYS].map((key) => {
                  const active = avatarKey === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => {
                        trigger('light');
                        setAvatarOverride(key);
                      }}
                      style={[styles.avatarBox, active && styles.avatarBoxActive]}
                    >
                      <Avatar avatarKey={key} size={42} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>
          ) : null}
            </>
          ) : (
            <View style={styles.openRoomsWrap}>
              <View style={styles.openRoomsHeader}>
                <Sparkles color={colors.yellow} size={16} />
                <Text style={styles.openRoomsTitle}>Katılmaya Uygun Odalar</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Açık oda listesini yenile"
                  onPress={refreshOpenRooms}
                  disabled={loadingRooms || refreshingRooms}
                  style={styles.refreshButton}
                >
                  <Text style={styles.refreshText}>Yenile</Text>
                </Pressable>
              </View>
              {loadingRooms ? (
                <View style={styles.roomListState}>
                  <ActivityIndicator color={colors.orange} />
                  <Text style={styles.roomPasswordHint}>Açık odalar yükleniyor...</Text>
                </View>
              ) : roomListError ? (
                <View style={styles.roomListState}>
                  <Text style={styles.errorText}>{roomListError}</Text>
                  <Button label="Tekrar Dene" size="sm" variant="secondary" onPress={retryOpenRooms} />
                </View>
              ) : openRooms.length === 0 ? (
                <View style={styles.emptyRooms}>
                  <Text style={styles.emptyRoomsTitle}>Şu an açık oda yok</Text>
                  <Text style={styles.roomPasswordHint}>Bir oda oluşturabilir ya da oda koduyla katılabilirsin.</Text>
                </View>
              ) : null}
              {openRooms.map((room) => {
                const categoryLabel = room.categoryStatus === 'selecting'
                  ? 'Kategori seçiliyor'
                  : room.categoryStatus === 'not_selected'
                    ? 'Kategori seçilmedi'
                    : CATEGORIES
                        .filter((category) => room.categoryIds.includes(category.id))
                        .map((category) => category.name)
                        .join(', ');
                return (
                  <Pressable
                    key={room.code}
                    onPress={() => handleJoin(room.code)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={`${room.code}, ${categoryLabel}, ${room.playerCount} / ${room.maxPlayers} oyuncu, herkese açık. Katıl`}
                    style={styles.roomRow}
                  >
                    <View style={styles.roomInfo}>
                      <Text style={styles.roomCode}>{room.code}</Text>
                      <Text style={styles.roomMeta}>{categoryLabel}</Text>
                      <Text style={styles.roomMeta}>{room.playerCount} / {room.maxPlayers} oyuncu · Herkese açık</Text>
                    </View>
                    <View style={styles.roomJoinButton}>
                      <Text style={styles.roomJoinText}>{loading ? 'Katılıyor...' : 'Katıl'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
        {joinMode === 'code' ? (
          <StickyActionBar>
            {error ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}
            <Button
              label={requiresPassword ? 'Şifreyle Katıl' : 'Lobiye Katıl'}
              onPress={() => handleJoin()}
              variant="orange"
              loading={loading}
              fullWidth
              icon={<LogIn color="#FFF" size={20} />}
            />
          </StickyActionBar>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>
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
  screenTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  scroll: { paddingBottom: spacing.md },
  modeSwitch: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modeButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.sm,
  },
  modeButtonActive: {
    borderColor: colors.orange,
    backgroundColor: colors.orangeSurface,
  },
  modeText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  modeTextActive: {
    color: colors.orange,
    fontFamily: 'Poppins-Bold',
  },
  mascotBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  mascotImage: {
    width: 76,
    height: 76,
  },
  mascotTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  mascotDesc: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  profileEditToggle: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  profileEditText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sectionCardFocused: {
    borderColor: colors.orange,
    ...shadows.card,
  },
  codeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  roomPasswordHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  roomPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurfaceAlt,
  },
  roomPasswordInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  passwordVisibilityButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  giantCodeInput: {
    backgroundColor: colors.bgSurfaceAlt,
    borderRadius: radii.xl,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.orange,
    fontFamily: 'Poppins-Bold',
    fontSize: 28,
    letterSpacing: 6,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: colors.borderStrong,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  giantCodeInputFocused: {
    borderColor: colors.orange,
  },
  nameInput: {
    marginTop: 6,
  },
  avatarScroll: {
    gap: 10,
    paddingVertical: 8,
  },
  avatarBox: {
    padding: 3,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarBoxActive: {
    borderColor: colors.orange,
    backgroundColor: colors.orangeSurface,
  },
  errorWrap: {
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.small,
    color: colors.dangerSoft,
    textAlign: 'center',
    fontFamily: 'Poppins-SemiBold',
  },
  openRoomsWrap: {
    marginTop: spacing.xl,
  },
  openRoomsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  refreshButton: {
    marginLeft: 'auto',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSurfaceAlt,
  },
  refreshText: { ...typography.caption, color: colors.orange },
  roomListState: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyRooms: {
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyRoomsTitle: { ...typography.bodyMedium, color: colors.textPrimary },
  openRoomsTitle: {
    ...typography.h4,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: 8,
  },
  roomCode: {
    fontFamily: 'Poppins-Bold',
    fontSize: 18,
    color: colors.purpleSoft,
    letterSpacing: 2,
  },
  roomInfo: { flex: 1 },
  roomMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  roomJoinButton: {
    minWidth: 70,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.orangeDeep,
  },
  roomJoinText: { ...typography.small, color: '#FFFFFF', fontFamily: 'Poppins-Bold' },
});
