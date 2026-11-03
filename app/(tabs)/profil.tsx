import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ScrollView, Switch, Pressable, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Shield, Zap, Award, Sparkles, Volume2, Vibrate, Globe, Check, Edit2, Flame, ImagePlus, LogOut, Sun, Moon, Shuffle } from 'lucide-react-native';
import { Screen, ScreenHeader, Card, Button, Avatar, Badge, Input } from '@/components/ui';
import { spacing, typography, radii, shadows } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import { useSound } from '@/hooks/useSound';
import { soundService } from '@/services/soundService';
import { AVATAR_KEYS, DICEBEAR_AVATAR_KEYS } from '@/features/game/players';
import { SPECIAL_AVATAR_KEYS } from '@/features/game/specialAvatars';
import { getPlayerAchievements } from '@/features/game/achievements';

export default function ProfilScreen() {
  const { colors, mode, setMode } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { currentPlayer, setCurrentPlayer, isLive, isAnonymous, connection, service } = useGameStore();
  const { trigger, enabled: hapticEnabled, ready: hapticPreferenceReady, setEnabled: setHapticEnabled } = useHaptics();
  const { enabled: soundEnabled, ready: soundPreferenceReady, setEnabled: setSoundEnabled } = useSound();

  const [editingName, setEditingName] = useState(false);
  const [profileDraft, setProfileDraft] = useState<{
    playerId: string | null;
    name: string;
    avatarKey: string;
  } | null>(null);
  const activeProfileDraft = profileDraft?.playerId === currentPlayer?.id
    ? profileDraft
    : {
        playerId: currentPlayer?.id ?? null,
        name: currentPlayer?.name ?? 'Oyuncu',
        avatarKey: currentPlayer?.avatarKey ?? 'fox',
      };
  const tempName = activeProfileDraft.name;
  const selectedAvatar = activeProfileDraft.avatarKey;
  const setTempName = (name: string) => setProfileDraft({ ...activeProfileDraft, name });
  const setSelectedAvatar = (avatarKey: string) => setProfileDraft({ ...activeProfileDraft, avatarKey });
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showAllAvatars, setShowAllAvatars] = useState(false);
  const [selectedAvatarCategory, setSelectedAvatarCategory] = useState<'all' | 'special' | 'people' | 'robots' | 'emoji' | 'animals' | 'fashion' | 'streetwear'>('all');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [statsPlayer, setStatsPlayer] = useState(currentPlayer);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const refreshStats = useCallback(async () => {
    if (!currentPlayer) {
      setStatsPlayer(null);
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    setStatsError(null);
    try {
      const player = await service.getProfile(currentPlayer.id);
      if (!player) throw new Error('Profil istatistikleri bulunamadı.');
      setStatsPlayer(player);
    } catch (error) {
      setStatsError((error as Error).message || 'İstatistikler yüklenemedi.');
    } finally {
      setStatsLoading(false);
    }
  }, [currentPlayer?.id, service]);

  useFocusEffect(useCallback(() => {
    void refreshStats();
  }, [refreshStats]));

  const saveProfile = async (name: string, avatarKey: string) => {
    if (!currentPlayer || savingProfile) return;
    setSavingProfile(true);
    setProfileError(null);
    trigger('light');
    try {
      const updatedPlayer = await service.updatePlayerProfile(
        name.trim().slice(0, 32) || 'Oyuncu',
        avatarKey
      );
      setCurrentPlayer(updatedPlayer);
      setSelectedAvatar(updatedPlayer.avatarKey);
      setTempName(updatedPlayer.name);
      return true;
    } catch (error) {
      setProfileError((error as Error).message);
      return false;
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveProfile = async () => {
    const saved = await saveProfile(tempName, selectedAvatar);
    if (!saved) return;
    setEditingName(false);
  };

  const handleAvatarSelect = async (key: string) => {
    if (!currentPlayer) return;
    await saveProfile(currentPlayer.name, key);
  };

  const handleChoosePhoto = async () => {
    if (!isLive) {
      setProfileError('Fotoğrafını diğer oyuncularla paylaşmak için canlı oyun modu gerekir.');
      return;
    }
    if (!currentPlayer || savingProfile) return;

    setProfileError(null);
    setSavingProfile(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        setProfileError('Seçilen fotoğraf okunamadı. Başka bir fotoğraf deneyebilirsin.');
        return;
      }

      const avatarUrl = await service.uploadAvatar(asset.base64, asset.mimeType ?? 'image/jpeg');
      const updatedPlayer = await service.updatePlayerProfile(currentPlayer.name, avatarUrl);
      setCurrentPlayer(updatedPlayer);
      setSelectedAvatar(updatedPlayer.avatarKey);
    } catch (error) {
      setProfileError((error as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setProfileError(null);
    try {
      await service.signOut();
      setCurrentPlayer(null);
      router.replace('/auth');
    } catch (error) {
      setProfileError((error as Error).message);
    } finally {
      setSigningOut(false);
    }
  };

  const achievements = getPlayerAchievements(statsPlayer);
  const unlockedAchievementCount = achievements.filter((achievement) => achievement.unlocked).length;

  const avatarChoices: string[] = [...SPECIAL_AVATAR_KEYS, ...DICEBEAR_AVATAR_KEYS, ...AVATAR_KEYS];
  if (!avatarChoices.includes(selectedAvatar)) avatarChoices.push(selectedAvatar);
  const filteredAvatarChoices = avatarChoices.filter((key) => {
    if (selectedAvatarCategory === 'all') return true;
    if (selectedAvatarCategory === 'special') return key.startsWith('special:');
    if (selectedAvatarCategory === 'animals') return AVATAR_KEYS.includes(key as (typeof AVATAR_KEYS)[number]);
    if (!key.startsWith('db:')) return false;
    const style = key.split(':')[1];
    if (selectedAvatarCategory === 'people') return style === 'lorelei' || style === 'adventurer';
    if (selectedAvatarCategory === 'robots') return style === 'bottts';
    if (selectedAvatarCategory === 'emoji') return style === 'fun-emoji';
    if (selectedAvatarCategory === 'fashion') return style === 'fashion';
    if (selectedAvatarCategory === 'streetwear') return style === 'streetwear';
    return false;
  });
  const visibleAvatarChoices = showAllAvatars || selectedAvatarCategory === 'special'
    ? filteredAvatarChoices
    : [
        ...filteredAvatarChoices.slice(0, 12),
        ...(filteredAvatarChoices.slice(0, 12).includes(selectedAvatar)
          || !filteredAvatarChoices.includes(selectedAvatar) ? [] : [selectedAvatar]),
      ];

  return (
    <Screen gradient diagonalSlice padded={false} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Profil"
          subtitle="İstatistiklerin ve oyun tercihlerin"
          right={
            <Badge tone={isLive ? 'lime' : 'yellow'} sticker>
              {isLive ? 'CANLI MOD' : 'DEMO MODU'}
            </Badge>
          }
        />

        {/* Profile Card */}
        <Card variant="surface" glow="orange" style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <Avatar
              avatarKey={currentPlayer?.avatarUrl ?? selectedAvatar}
              userId={currentPlayer?.id}
              size={68}
              ring
            />
            <View style={{ flex: 1 }}>
              <View style={styles.nameDisplayRow}>
                <Text style={styles.playerName}>{currentPlayer?.name ?? 'Kızılkuyruk Ustası'}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="İsmini güncelle"
                  onPress={() => {
                    setTempName(currentPlayer?.name ?? '');
                    setProfileError(null);
                    setEditingName(true);
                  }}
                  style={styles.editIconBtn}
                >
                  <Edit2 color={colors.orange} size={16} />
                </Pressable>
              </View>
              <View style={styles.rolePill}>
                <Flame color={colors.yellow} size={12} />
                <Text style={styles.playerRole}>
                  Kızılkuyruk Ustası
                  {statsPlayer ? ` • Seviye ${Math.floor(statsPlayer.score / 150) + 1}` : ''}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={handleChoosePhoto}
            disabled={savingProfile || !currentPlayer}
            style={[styles.uploadAvatarButton, (savingProfile || !currentPlayer) && styles.uploadAvatarButtonDisabled]}
          >
            <ImagePlus color={colors.orange} size={18} />
            <Text style={styles.uploadAvatarText}>
              {savingProfile ? 'Kaydediliyor...' : 'Kendi fotoğrafını ekle'}
            </Text>
          </Pressable>
          {profileError ? <Text style={styles.profileError}>{profileError}</Text> : null}

          <Pressable
            onPress={() => setShowAvatarPicker((visible) => !visible)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAvatarPicker }}
            accessibilityLabel={showAvatarPicker ? 'Avatar seçimini kapat' : 'Avatar seçimini aç'}
            style={styles.avatarPickerToggle}
          >
            <View>
              <Text style={styles.subhead}>AVATARINI SEÇ</Text>
              <Text style={styles.avatarPickerToggleHint}>
                {showAvatarPicker ? 'Seçenekleri gizle' : 'Avatar seçeneklerini görüntüle'}
              </Text>
            </View>
            <Text style={styles.avatarPickerToggleIcon}>{showAvatarPicker ? '−' : '+'}</Text>
          </Pressable>
          {showAvatarPicker ? (
            <>
              <View style={styles.avatarPickerIntro}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.avatarStyles}>KARAKTERİNİ SEÇ</Text>
                  <Text style={styles.avatarPickerCount}>{avatarChoices.length} farklı avatar · herkese uygun stiller</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rastgele avatar seç"
                  disabled={savingProfile}
                  onPress={() => {
                    const candidates = filteredAvatarChoices.filter((key) => key !== selectedAvatar);
                    if (candidates.length) void handleAvatarSelect(candidates[Math.floor(Math.random() * candidates.length)]);
                  }}
                  style={styles.randomAvatarButton}
                >
                  <Shuffle color={colors.orange} size={16} />
                  <Text style={styles.randomAvatarText}>Sürpriz</Text>
                </Pressable>
              </View>
              <View style={styles.avatarFilters}>
                {([
                  { key: 'all', label: 'Tümü' },
                  { key: 'special', label: '⭐ Özel Avatarlar' },
                  { key: 'people', label: 'Portreler' },
                  { key: 'robots', label: 'Robotlar' },
                  { key: 'emoji', label: 'Emoji' },
                  { key: 'animals', label: 'Hayvanlar' },
                  { key: 'fashion', label: 'Moda' },
                  { key: 'streetwear', label: 'Sokak Stili' },
                ] as const).map((filter) => {
                  const active = selectedAvatarCategory === filter.key;
                  return (
                    <Pressable
                      key={filter.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setSelectedAvatarCategory(filter.key);
                        setShowAllAvatars(false);
                      }}
                      style={[styles.avatarFilterChip, active && styles.avatarFilterChipActive]}
                    >
                      <Text style={[styles.avatarFilterText, active && styles.avatarFilterTextActive]}>
                        {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.avatarGrid}>
                {visibleAvatarChoices.map((key) => {
                  const active = selectedAvatar === key;
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={`${key.startsWith('db:') ? key.split(':')[1] : key} avatarını seç`}
                      accessibilityState={{ selected: active }}
                      onPress={() => handleAvatarSelect(key)}
                      disabled={savingProfile}
                      style={[styles.avatarChoice, active && styles.avatarChoiceActive]}
                    >
                      <Avatar avatarKey={key} size={44} />
                      {active ? (
                        <View style={styles.avatarSelectedMark}>
                          <Check color="#FFF" size={12} strokeWidth={3} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {filteredAvatarChoices.length > 12 ? (
                <Pressable
                  onPress={() => setShowAllAvatars((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showAllAvatars ? 'Daha az avatar göster' : `Tüm ${filteredAvatarChoices.length} avatarı göster`
                  }
                  style={styles.toggleAvatarsButton}
                >
                  <Text style={styles.toggleAvatarsText}>
                    {showAllAvatars ? 'Daha az göster' : `Daha fazla avatar göster (${Math.max(0, filteredAvatarChoices.length - visibleAvatarChoices.length)})`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </Card>

        {/* Stats Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>İSTATİSTİKLER</Text>
          {statsError ? <Text accessibilityRole="alert" style={styles.profileError}>{statsError}</Text> : null}
          {statsLoading && !statsPlayer ? (
            <ActivityIndicator color={colors.blueSoft} style={styles.statsLoading} />
          ) : null}
          <View style={styles.statsGrid}>
            <Card variant="surface" style={styles.statBox}>
              <Award color={colors.yellow} size={24} />
              <Text style={styles.statValue}>
                {statsPlayer ? `${statsPlayer.score} P` : '—'}
              </Text>
              <Text style={styles.statLabel}>Toplam Puan</Text>
            </Card>

            <Card variant="surface" style={styles.statBox}>
              <Sparkles color={colors.lime} size={24} />
              <Text style={[styles.statValue, { color: colors.lime }]}>
                {statsPlayer?.correctAnswers ?? '—'}
              </Text>
              <Text style={styles.statLabel}>Doğru Cevap</Text>
            </Card>

            <Card variant="surface" style={styles.statBox}>
              <Zap color={colors.orange} size={24} />
              <Text style={[styles.statValue, { color: colors.orange }]}>
                {statsPlayer?.successfulTraps ?? '—'}
              </Text>
              <Text style={styles.statLabel}>Başarılı Blöf</Text>
            </Card>

            <Card variant="surface" style={styles.statBox}>
              <Shield color={colors.blueSoft} size={24} />
              <Text style={[styles.statValue, { color: colors.blueSoft }]}>
                {statsPlayer?.gamesPlayed ?? '—'}
              </Text>
              <Text style={styles.statLabel}>Tamamlanan Oyun</Text>
            </Card>
          </View>
        </View>

        {/* Achievements — derived from the saved profile stats */}
        <View style={styles.section}>
          <View style={styles.achievementHeading}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>BAŞARIMLAR</Text>
            <Badge tone="lime" sticker>
              {unlockedAchievementCount}/{achievements.length} AÇILDI
            </Badge>
          </View>
          <View style={styles.achievementGrid}>
            {achievements.map((achievement) => (
              <Card
                key={achievement.id}
                variant="surface"
                style={[
                  styles.achievementCard,
                  !achievement.unlocked && styles.achievementCardLocked,
                ]}
              >
                <View style={styles.achievementTopRow}>
                  <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                  <Text
                    style={[
                      styles.achievementStatus,
                      achievement.unlocked
                        ? styles.achievementStatusUnlocked
                        : styles.achievementStatusLocked,
                    ]}
                  >
                    {achievement.unlocked ? 'AÇILDI' : 'KİLİTLİ'}
                  </Text>
                </View>
                <Text style={styles.achievementTitle}>{achievement.title}</Text>
                <Text style={styles.achievementDescription}>{achievement.description}</Text>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel={`${achievement.title} ilerlemesi`}
                  accessibilityValue={{
                    min: 0,
                    max: achievement.target,
                    now: achievement.progress,
                  }}
                  style={styles.achievementProgressTrack}
                >
                  <View
                    style={[
                      styles.achievementProgressFill,
                      { width: `${achievement.progressPercent}%` as `${number}%` },
                    ]}
                  />
                </View>
                <Text style={styles.achievementProgressText}>
                  {achievement.progress}/{achievement.target}
                </Text>
              </Card>
            ))}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AYARLAR & TERCİHLER</Text>
          <Card variant="surface">
            <Text style={styles.settingText}>Görünüm</Text>
            <Text style={styles.settingSub}>Uygulamanın açık veya koyu temasını seç</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              {([
                { value: 'light', label: 'Açık', icon: Sun },
                { value: 'dark', label: 'Koyu', icon: Moon },
              ] as const).map(({ value, label, icon: Icon }) => {
                const selected = mode === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setMode(value)}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: spacing.sm,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: selected ? colors.orange : colors.borderStrong,
                      backgroundColor: selected ? colors.orangeSurface : colors.bgSurfaceAlt,
                    }}
                  >
                    <Icon size={17} color={selected ? colors.orange : colors.textSecondary} />
                    <Text style={{ ...typography.small, color: selected ? colors.orange : colors.textPrimary }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.divider} />
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Volume2 color={colors.purpleSoft} size={20} />
                <View>
                  <Text style={styles.settingText}>Ses Efektleri</Text>
                  <Text style={styles.settingSub}>Oyun içi zil ve parti jingle’ları</Text>
                </View>
              </View>
              <Switch
                value={soundEnabled}
                disabled={!soundPreferenceReady}
                onValueChange={(v) => {
                  trigger('light');
                  setSoundEnabled(v);
                  if (v) soundService.play('click');
                }}
                trackColor={{ false: colors.bgSurfaceAlt, true: colors.orange }}
                thumbColor="#FFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Vibrate color={colors.orange} size={20} />
                <View>
                  <Text style={styles.settingText}>Haptik Titreşim</Text>
                  <Text style={styles.settingSub}>Dokunma ve geri sayım uyarıları</Text>
                </View>
              </View>
              <Switch
                value={hapticEnabled}
                disabled={!hapticPreferenceReady}
                onValueChange={(v) => {
                  trigger('light');
                  setHapticEnabled(v);
                }}
                trackColor={{ false: colors.bgSurfaceAlt, true: colors.orange }}
                thumbColor="#FFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Globe color={colors.blueSoft} size={20} />
                <View>
                  <Text style={styles.settingText}>Ağ Durumu</Text>
                  <Text style={styles.settingSub}>
                    {connection === 'online' ? 'Çevrimiçi (Düşük Gecikme)' : connection}
                  </Text>
                </View>
              </View>
              <Badge tone={connection === 'online' ? 'lime' : 'yellow'} sticker>
                {connection.toUpperCase()}
              </Badge>
            </View>

          </Card>
        </View>

        {/* App Info Card */}
        <View style={styles.section}>
          <Card variant="comic" style={{ alignItems: 'center' }}>
            <Text style={styles.aboutTitle}>Kızılkuyruk v2.0</Text>
            <Text style={styles.aboutText}>Modern Türkçe Parti & Blöf Oyunu</Text>
            <Text style={styles.aboutSub}>2–10 Oyuncu • Gerçek Zamanlı Realtime Motoru</Text>
          </Card>
        </View>
        {isLive ? (
          <View style={styles.section}>
            <Text style={styles.accountType}>
              {isAnonymous ? 'Misafir oturumu' : 'Supabase hesabı'}
            </Text>
            {profileError ? <Text style={styles.profileError}>{profileError}</Text> : null}
            <Button
              label={signingOut ? 'Çıkış yapılıyor...' : 'Çıkış yap'}
              variant="danger"
              fullWidth
              disabled={signingOut}
              onPress={() => void handleSignOut()}
              icon={<LogOut color="#FFF" size={18} />}
            />
          </View>
        ) : null}
      </ScrollView>
      <Modal
        visible={editingName}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingName(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            accessibilityLabel="İsim güncelleme penceresini kapat"
            onPress={() => setEditingName(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.nameModal}>
            <Text style={styles.nameModalTitle}>İsmini güncelle</Text>
            <Text style={styles.nameModalHint}>Oyuncular seni bu isimle görecek.</Text>
            <Input
              accessibilityLabel="Yeni oyuncu adı"
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              maxLength={32}
              onChangeText={setTempName}
              onSubmitEditing={() => void handleSaveProfile()}
              placeholder="Oyuncu adı"
              returnKeyType="done"
              style={styles.nameModalInput}
              value={tempName}
              editable={!savingProfile}
            />
            {profileError ? (
              <Text accessibilityRole="alert" style={styles.profileError}>{profileError}</Text>
            ) : null}
            <View style={styles.nameModalActions}>
              <Button
                label="Vazgeç"
                onPress={() => setEditingName(false)}
                variant="secondary"
                size="md"
                disabled={savingProfile}
              />
              <Button
                label="Kaydet"
                onPress={() => void handleSaveProfile()}
                variant="orange"
                size="md"
                loading={savingProfile}
                disabled={savingProfile}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 100,
  },
  accountType: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  statsLoading: {
    marginVertical: spacing.sm,
  },
  profileCard: {
    marginTop: spacing.xs,
    padding: spacing.lg,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,7,18,0.72)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  nameModal: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  nameModalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  nameModalHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  nameModalInput: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.orange,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.bgSurfaceAlt,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
  },
  nameModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerName: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  editIconBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  playerRole: {
    ...typography.caption,
    color: colors.yellow,
    fontFamily: 'Poppins-Medium',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    backgroundColor: colors.bgSurfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: colors.orange,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  saveBtn: {
    backgroundColor: colors.orange,
    borderRadius: radii.md,
    padding: 10,
  },
  subhead: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  avatarPickerToggle: {
    minHeight: 48,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarPickerToggleHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  avatarPickerToggleIcon: {
    color: colors.orange,
    fontFamily: 'Poppins-Bold',
    fontSize: 22,
    paddingHorizontal: spacing.xs,
  },
  avatarPickerIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  avatarStyles: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textPrimary,
    letterSpacing: 0.7,
  },
  avatarPickerCount: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  randomAvatarButton: {
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  randomAvatarText: {
    ...typography.caption,
    color: colors.orange,
    fontFamily: 'Poppins-SemiBold',
  },
  avatarFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
  },
  avatarFilterChip: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFilterChipActive: {
    backgroundColor: colors.orangeSurface,
    borderColor: colors.orange,
  },
  avatarFilterText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: 'Poppins-Medium',
  },
  avatarFilterTextActive: {
    color: colors.orange,
    fontFamily: 'Poppins-Bold',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.xs,
  },
  toggleAvatarsButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurfaceAlt,
  },
  toggleAvatarsText: {
    ...typography.caption,
    color: colors.orange,
    fontFamily: 'Poppins-SemiBold',
  },
  avatarChoice: {
    width: '19%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    marginBottom: 2,
  },
  avatarChoiceActive: {
    borderColor: colors.orange,
    backgroundColor: 'rgba(255, 113, 59, 0.2)',
  },
  avatarSelectedMark: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.orange,
  },
  uploadAvatarButton: {
    minHeight: 44,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadAvatarButtonDisabled: {
    opacity: 0.55,
  },
  uploadAvatarText: {
    ...typography.body,
    color: colors.textPrimary,
    fontFamily: 'Poppins-SemiBold',
  },
  profileError: {
    ...typography.caption,
    color: colors.dangerSoft,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    width: '48%',
    alignItems: 'center',
    padding: spacing.lg,
  },
  statValue: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    marginTop: spacing.xs,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  settingSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  aboutTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 18,
    color: colors.orange,
  },
  aboutText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: 'Poppins-SemiBold',
  },
  achievementHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  achievementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  achievementCard: {
    width: '48%',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.xs,
  },
  achievementCardLocked: {
    borderColor: colors.border,
    opacity: 0.84,
  },
  achievementTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  achievementIcon: {
    fontSize: 25,
    lineHeight: 32,
  },
  achievementStatus: {
    ...typography.caption,
    fontSize: 9,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.3,
  },
  achievementStatusUnlocked: {
    color: colors.lime,
  },
  achievementStatusLocked: {
    color: colors.textMuted,
  },
  achievementTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    minHeight: 38,
  },
  achievementDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    minHeight: 36,
  },
  achievementProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  achievementProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.orange,
  },
  achievementProgressText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'right',
    fontSize: 10,
  },
  aboutSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
