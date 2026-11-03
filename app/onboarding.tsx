import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ScrollView, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { Sparkles, ArrowRight, Shield, Zap, Target, Flame, Check } from 'lucide-react-native';
import { Screen, Button, Avatar, Card, StickyActionBar } from '@/components/ui';
import { colors, spacing, typography, radii, shadows } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import {
  AVATAR_KEYS,
  DICEBEAR_AVATAR_KEYS,
} from '@/features/game/players';
import { SPECIAL_AVATAR_KEYS } from '@/features/game/specialAvatars';
import { mascotImages } from '@/assets/illustrations';
import { getPresetCharacterIdentity } from '@/features/game/characterCatalog';

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { setCurrentPlayer, service, currentPlayer, isInitialized, init } = useGameStore();
  const { trigger } = useHaptics();

  const [step, setStep] = useState<1 | 2>(1);
  const [avatarOptions] = useState(() => [
    ...SPECIAL_AVATAR_KEYS,
    ...AVATAR_KEYS,
    ...DICEBEAR_AVATAR_KEYS,
  ]);
  const [selectedAvatar, setSelectedAvatar] = useState(avatarOptions[0]);
  const [avatarCategory, setAvatarCategory] = useState<'special' | 'all' | 'people' | 'robots' | 'emoji' | 'animals' | 'fashion' | 'streetwear'>('special');
  const filteredAvatarOptions = avatarOptions.filter((key) => {
    if (avatarCategory === 'all') return true;
    if (avatarCategory === 'special') return key.startsWith('special:');
    if (avatarCategory === 'animals') return AVATAR_KEYS.includes(key as (typeof AVATAR_KEYS)[number]);
    if (!key.startsWith('db:')) return false;
    const style = key.split(':')[1];
    if (avatarCategory === 'people') return style === 'lorelei' || style === 'adventurer';
    if (avatarCategory === 'robots') return style === 'bottts';
    if (avatarCategory === 'emoji') return style === 'fun-emoji';
    if (avatarCategory === 'fashion') return style === 'fashion';
    if (avatarCategory === 'streetwear') return style === 'streetwear';
    return false;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [takenAvatars, setTakenAvatars] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const selectedAvatarIsTaken = takenAvatars.includes(selectedAvatar);
  const availableInFilter = filteredAvatarOptions.find((key) => !takenAvatars.includes(key));
  const anyAvailableAvatar = avatarOptions.find((key) => !takenAvatars.includes(key));
  const effectiveSelectedAvatar = selectedAvatarIsTaken
    ? availableInFilter ?? anyAvailableAvatar ?? selectedAvatar
    : selectedAvatar;
  const effectiveAvatarCategory = selectedAvatarIsTaken && !availableInFilter && anyAvailableAvatar
    ? 'all'
    : avatarCategory;
  const visibleAvatarOptions = effectiveAvatarCategory === 'all' ? avatarOptions : filteredAvatarOptions;
  const selectedCharacter = getPresetCharacterIdentity(effectiveSelectedAvatar);

  const refreshTakenCharacters = useCallback(async () => {
    try {
      const taken = await service.listTakenPresetCharacters();
      setTakenAvatars(taken);
      setAvailabilityError(null);
    } catch (cause) {
      setAvailabilityError(cause instanceof Error
        ? cause.message
        : 'Karakterlerin uygunluğu kontrol edilemedi. Tekrar dene.');
    } finally {
      setAvailabilityLoading(false);
    }
  }, [service, setTakenAvatars, setAvailabilityError, setAvailabilityLoading]);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    let active = true;
    service.listTakenPresetCharacters()
      .then((taken) => {
        if (!active) return;
        setTakenAvatars(taken);
        setAvailabilityError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setAvailabilityError(cause instanceof Error
          ? cause.message
          : 'Karakterlerin uygunluğu kontrol edilemedi. Tekrar dene.');
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [service, setTakenAvatars, setAvailabilityError, setAvailabilityLoading]);

  useEffect(() => {
    // A pending anonymous auth user is retained after a race for an occupied
    // character, so the player can choose again without creating another account.
    if (isInitialized && currentPlayer?.id && currentPlayer.avatarKey !== 'pending_character') {
      router.replace('/(tabs)');
    }
  }, [currentPlayer?.id, currentPlayer?.avatarKey, isInitialized]);

  const handleNext = () => {
    trigger('light');
    setStep(2);
  };

  const handleFinish = async () => {
    if (currentPlayer && currentPlayer.avatarKey !== 'pending_character') {
      router.replace('/(tabs)');
      return;
    }
    if (availabilityLoading || availabilityError) {
      setError(availabilityError ?? 'Karakter uygunluğu kontrol ediliyor.');
      return;
    }
    if (takenAvatars.includes(effectiveSelectedAvatar)) {
      setError('Bu karakter dolu. Boş karakterlerden birini seç.');
      await refreshTakenCharacters();
      return;
    }
    trigger('medium');
    setBusy(true);
    setError(null);
    try {
      const player = await service.signInAnonymously(selectedCharacter.displayName, effectiveSelectedAvatar);
      setCurrentPlayer(player);
      router.replace('/(tabs)');
    } catch (authError) {
      const authCode = (authError as { code?: string })?.code;
      if (authCode === 'PRESET_CHARACTER_TAKEN') {
        await refreshTakenCharacters();
        setError('Bu karakter sen seçene kadar başka bir oyuncu tarafından alındı. Güncel listeden başka birini seç.');
      } else {
        setError((authError as Error).message || 'Misafir oturumu başlatılamadı.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen gradient diagonalSlice>
      <View style={styles.container}>
        {/* Step Indicator */}
        <View style={styles.stepIndicatorRow}>
          <View style={[styles.stepBar, step >= 1 && styles.stepBarActive]} />
          <View style={[styles.stepBar, step >= 2 && styles.stepBarActive]} />
        </View>

        {step === 1 ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerWrap}>
              <View style={styles.mascotCircle}>
                <Image source={mascotImages.hero} style={styles.mascotImage} resizeMode="contain" />
              </View>

              <View style={styles.kickerPill}>
                <Flame color={colors.orange} size={14} />
                <Text style={styles.kickerText}>KIZILKUYRUK&apos;A HOŞ GELDİN!</Text>
              </View>

              <Text style={styles.title}>Parti & Blöf Zamanı!</Text>
              <Text style={styles.subtitle}>
                Arkadaşlarınla oynayabileceğin, sahte cevaplar uydurup rakipleri tuzağa düşürdüğün Türkçe parti oyunu.
              </Text>
            </View>

            {/* Feature Cards */}
            <View style={styles.featuresWrap}>
              <Card variant="surface" style={styles.featureCard}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(198, 243, 107, 0.2)' }]}>
                  <Target color={colors.lime} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>1. Gerçek Cevabı Bul (+2)</Text>
                  <Text style={styles.featureDesc}>
                    Karışık cevap havuzundan doğrusunu tahmin et, hanene +2 puanı yazdır.
                  </Text>
                </View>
              </Card>

              <Card variant="surface" style={styles.featureCard}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(255, 113, 59, 0.2)' }]}>
                  <Zap color={colors.orange} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>2. Sahteni Yuttur & Tuzağa Düşür (+1)</Text>
                  <Text style={styles.featureDesc}>
                    İnandırıcı bir blöf yaz. Sahtene kanan her rakip için +1 puan kap! Yanılsan da puan kaybetmezsin.
                  </Text>
                </View>
              </Card>

              <Card variant="surface" style={styles.featureCard}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                  <Shield color={colors.purpleSoft} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>3. Kalkan & Blok Yetenekleri</Text>
                  <Text style={styles.featureDesc}>
                    Puan kazandıkça maçlık kredi topla; Kalkan ve rakibi pas geçiren Blok yeteneklerini satın al!
                  </Text>
                </View>
              </Card>
            </View>

          </ScrollView>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerWrap}>
              <Text style={styles.title}>Karakterini Seç</Text>
              <Text style={styles.subtitle}>
                Her avatarın kendi karakter adı var. Seçtiğinde e-posta gerektirmeyen, sana özel bir oyun kimliği otomatik hazırlanır.
              </Text>
            </View>

            {/* Preview Avatar */}
            <View style={styles.previewAvatarWrap}>
              <Avatar avatarKey={effectiveSelectedAvatar} size={90} ring />
              <Text style={styles.selectedCharacterName}>{selectedCharacter.displayName}</Text>
              <Text style={styles.selectedCharacterHint}>Karakterin · {selectedCharacter.avatarLabel}</Text>
            </View>

            {/* Avatar Grid */}
            <Text style={styles.sectionLabel}>
              KARAKTERİNİ SEÇ · {visibleAvatarOptions.filter((key) => !takenAvatars.includes(key)).length} / {visibleAvatarOptions.length} BOŞ
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarFilters}>
              {([
                { key: 'special', label: '⭐ Özel Avatarlar' },
                { key: 'all', label: 'Tümü' },
                { key: 'people', label: 'Portreler' },
                { key: 'robots', label: 'Robotlar' },
                { key: 'emoji', label: 'Emoji' },
                { key: 'animals', label: 'Hayvanlar' },
                { key: 'fashion', label: 'Moda' },
                { key: 'streetwear', label: 'Sokak Stili' },
              ] as const).map((filter) => {
                const active = effectiveAvatarCategory === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setAvatarCategory(filter.key)}
                    style={[styles.avatarFilterChip, active && styles.avatarFilterChipActive]}
                  >
                    <Text style={[styles.avatarFilterText, active && styles.avatarFilterTextActive]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.avatarGrid}>
              {visibleAvatarOptions.map((key) => {
                const active = effectiveSelectedAvatar === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`${getPresetCharacterIdentity(key).displayName} ${takenAvatars.includes(key) ? 'karakteri dolu' : 'karakterini seç'}`}
                    accessibilityState={{ selected: active, disabled: takenAvatars.includes(key) }}
                    disabled={busy || availabilityLoading || takenAvatars.includes(key)}
                    onPress={() => {
                      trigger('light');
                      setSelectedAvatar(key);
                    }}
                    style={[styles.avatarBox, active && styles.avatarBoxActive, takenAvatars.includes(key) && styles.avatarBoxTaken]}
                  >
                    <Avatar avatarKey={key} size={42} />
                    <Text numberOfLines={1} style={[styles.avatarName, active && styles.avatarNameActive]}>
                      {getPresetCharacterIdentity(key).displayName}
                    </Text>
                    {takenAvatars.includes(key) ? (
                      <View style={styles.avatarTakenBadge}>
                        <Text style={styles.avatarTakenBadgeText}>DOLU</Text>
                      </View>
                    ) : active ? (
                      <View style={styles.avatarSelectedMark}>
                        <Check color="#FFF" size={12} strokeWidth={3} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.identityNote}>
              <Text style={styles.identityNoteTitle}>Hesabın otomatik hazırlanacak</Text>
              <Text style={styles.identityNoteText}>
                Her karakter yalnızca bir oyuncuya atanabilir. Dolu karakterler tekrar seçilemez; hesabın gerçek e-posta veya şifre gerektirmeden otomatik hazırlanır.
              </Text>
              {availabilityLoading ? <Text style={styles.availabilityHint}>Karakterlerin uygunluğu kontrol ediliyor…</Text> : null}
              {availabilityError ? (
                <>
                  <Text accessibilityRole="alert" style={styles.error}>{availabilityError}</Text>
                  <Pressable onPress={() => void refreshTakenCharacters()} style={styles.retryAvailability}>
                    <Text style={styles.retryAvailabilityText}>Karakter listesini tekrar yükle</Text>
                  </Pressable>
                </>
              ) : null}
              {!availabilityLoading && !availabilityError && avatarOptions.every((key) => takenAvatars.includes(key)) ? (
                <Text style={styles.error}>Şu anda boş karakter kalmadı.</Text>
              ) : null}
            </View>

          </ScrollView>
        )}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <StickyActionBar>
          {step === 1 ? (
            <Button
              label="Karakterini Seç"
              onPress={handleNext}
              variant="orange"
              fullWidth
              icon={<ArrowRight color="#FFF" size={20} />}
            />
          ) : (
            <Button
              label={busy ? 'Karakter hazırlanıyor…' : availabilityLoading ? 'Karakterler yükleniyor…' : availabilityError ? 'Karakter listesi gerekli' : avatarOptions.every((key) => takenAvatars.includes(key)) ? 'Boş karakter kalmadı' : 'Partiye Başla!'}
              onPress={handleFinish}
              variant="orange"
              fullWidth
              disabled={busy || availabilityLoading || !!availabilityError || takenAvatars.includes(effectiveSelectedAvatar) || avatarOptions.every((key) => takenAvatars.includes(key))}
              icon={busy ? <ActivityIndicator color="#FFF" /> : <Sparkles color="#FFF" size={20} />}
            />
          )}
        </StickyActionBar>
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
    marginBottom: 16,
  },
  stepBar: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.bgCard,
  },
  stepBarActive: {
    backgroundColor: colors.orange,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },
  headerWrap: {
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  mascotCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.bgCard,
    borderWidth: 2,
    borderColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.glowOrange,
  },
  mascotImage: {
    width: 120,
    height: 120,
  },
  kickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 113, 59, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginBottom: 8,
  },
  kickerText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.orange,
    letterSpacing: 1,
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
    marginTop: 6,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  featuresWrap: {
    gap: 12,
    marginBottom: spacing.xl,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: spacing.md,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  featureDesc: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  previewAvatarWrap: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  selectedCharacterName: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    marginTop: spacing.sm,
  },
  selectedCharacterHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  identityNote: {
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  identityNoteTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    marginBottom: 4,
  },
  identityNoteText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  avatarName: {
    maxWidth: '100%',
    marginTop: 4,
    color: colors.textSecondary,
    fontFamily: 'Poppins-Medium',
    fontSize: 9,
    textAlign: 'center',
  },
  avatarNameActive: {
    color: colors.orange,
    fontFamily: 'Poppins-Bold',
  },
  avatarBoxTaken: {
    opacity: 0.42,
    backgroundColor: colors.bgSurface,
  },
  avatarTakenBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: radii.xs,
    backgroundColor: colors.bgDark,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  avatarTakenBadgeText: {
    color: colors.textMuted,
    fontFamily: 'Poppins-Bold',
    fontSize: 7,
    letterSpacing: 0.2,
  },
  availabilityHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  retryAvailability: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: 4,
  },
  retryAvailabilityText: {
    ...typography.caption,
    color: colors.orange,
    fontFamily: 'Poppins-Bold',
  },
  sectionLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 12,
  },
  avatarFilters: {
    gap: 8,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  avatarFilterChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgCard,
  },
  avatarFilterChipActive: {
    borderColor: colors.orange,
    backgroundColor: 'rgba(255, 113, 59, 0.16)',
  },
  avatarFilterText: {
    color: colors.textSecondary,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
  },
  avatarFilterTextActive: {
    color: colors.orange,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarBox: {
    width: '22%',
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 5,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  avatarBoxActive: {
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
  error: { ...typography.caption, color: colors.dangerSoft, textAlign: 'center', paddingHorizontal: spacing.md },
});
