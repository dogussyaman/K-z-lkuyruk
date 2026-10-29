import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Plus,
  LogIn,
  Sparkles,
  Zap,
  Gamepad2,
  ChevronRight,
  Flame,
  CheckCircle2,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { Screen, Button, Card, Badge, Avatar, MascotFloat, PulseView } from '@/components/ui';
import { colors, spacing, typography, radii, shadows } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { getRoomRecoveryRoute } from '@/services/roomRecovery';
import { useHaptics } from '@/hooks/useHaptics';
import { CATEGORY_OPTIONS } from '@/features/game/categories';
import { mascotImages } from '@/assets/illustrations';
import { soundService } from '@/services/soundService';
import { categoryOptionImages } from '@/assets/categories/options';

const QUICK_SCORING_RULES = [
  {
    key: 'correct',
    score: '+2',
    label: 'Doğru Bil',
    icon: CheckCircle2,
    color: colors.lime,
    iconBg: colors.successSurface,
  },
  {
    key: 'trap',
    score: '+1',
    label: 'Tuzağa Düşürme',
    icon: Zap,
    color: colors.orange,
    iconBg: colors.orangeSurface,
  },
  {
    key: 'victim',
    score: '0',
    label: 'Tuzağa Düşme',
    icon: ShieldCheck,
    color: colors.purpleSoft,
    iconBg: colors.purpleSurface,
  },
];

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const {
    init,
    isLive,
    service,
    currentPlayer,
    authStatus,
    recoveryStatus,
    recoveryCode,
    recoveryRoom,
    continueSavedRoom,
    dismissRecoveryOffer,
    error,
    setError,
  } = useGameStore();
  const { trigger } = useHaptics();
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [leaderPreview, setLeaderPreview] = useState<
    { id: string; name: string; avatarKey: string; score: number }[]
  >([]);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (isLive && authStatus !== 'signed_in') return;
    service.getLeaderboard().then((lb) => {
      setLeaderPreview(
        lb
          .slice(0, 4)
          .map((p) => ({
            id: p.id,
            name: p.name,
            avatarKey: p.avatarKey,
            score: p.score,
          }))
      );
    }).catch((error) => console.error('Liderlik listesi yüklenemedi:', error));
  }, [authStatus, isLive, service]);

  useEffect(() => {
    if (isLive && authStatus === 'signed_out') router.replace('/auth');
  }, [isLive, authStatus]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error, setError]);

  const handleContinueGame = async () => {
    if (recovering) return;
    setRecovering(true);
    setRecoveryError(null);
    try {
      const state = await continueSavedRoom();
      router.replace(getRoomRecoveryRoute(state, currentPlayer?.id ?? ''));
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : 'Oyuna devam edilemedi.');
    } finally {
      setRecovering(false);
    }
  };

  const goCreate = () => {
    trigger('light');
    router.push('/create-room');
  };
  const goJoin = () => {
    trigger('light');
    router.push('/join-room');
  };

  return (
    <Screen gradient diagonalSlice padded={false} edges={['top']}>
      <Modal
        visible={recoveryStatus === 'available' && !!recoveryCode}
        transparent
        animationType="fade"
        onRequestClose={dismissRecoveryOffer}
      >
        <View style={styles.recoveryOverlay}>
          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryTitle}>Devam eden bir oyunun var</Text>
            <Text style={styles.recoveryText}>
              Oda {recoveryCode}
              {recoveryRoom
                ? ` · Tur ${recoveryRoom.currentRound}/${recoveryRoom.config.totalRounds}`
                : ' · Sunucu durumu alınamadı; yeniden deneyebilirsin'}
            </Text>
            {recoveryError ? <Text style={styles.recoveryError}>{recoveryError}</Text> : null}
            <Button
              label="Kaldığın Yerden Devam Et"
              onPress={() => void handleContinueGame()}
              variant="orange"
              loading={recovering}
              fullWidth
            />
            <Pressable
              onPress={dismissRecoveryOffer}
              disabled={recovering}
              style={styles.recoverySkip}
            >
              <Text style={styles.recoverySkipText}>Şimdilik Geç</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {error ? (
        <View style={styles.storeError} accessibilityRole="alert">
          <Text style={styles.storeErrorText}>{error}</Text>
          <Pressable
            onPress={() => setError(null)}
            hitSlop={8}
            style={styles.storeErrorClose}
            accessibilityLabel="Kapat"
          >
            <X size={16} color={colors.dangerSoft} />
          </Pressable>
        </View>
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Top bar with Kızılkuyruk branding and player avatar */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.logoPill}>
              <Image
                source={require('@/assets/illustrations/kızılkuyruk.png')}
                resizeMode="contain"
                accessibilityLabel="Kızılkuyruk"
                style={styles.logoImage}
              />
            </View>
          </View>

          <Pressable
            style={styles.profileBtn}
            onPress={() => router.push('/(tabs)/profil')}
          >
            <Avatar
              avatarKey={currentPlayer?.avatarUrl ?? currentPlayer?.avatarKey ?? 'fox'}
              userId={currentPlayer?.id}
              size={38}
              ring
            />
          </Pressable>
        </View>

        {/* Hero Area: Asymmetric Card with 3D Fox Mascot */}
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={[colors.bgSurfaceAlt, colors.bgSurface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            {/* Diagonal Accent Stripe */}
            <View style={styles.heroDiagonalStripe} />

            <View style={styles.heroContentRow}>
              {/* Left Column: Text & Micro Copy */}
              <View style={styles.heroLeftCol}>
                <View style={styles.kickerPill}>
                  <Flame color={colors.orange} size={14} />
                  <Text style={styles.kickerText}>KIZILKUYRUK</Text>
                </View>
                <Text style={styles.heroTitle}>
                  Blöfünü Yap,{'\n'}
                  <Text style={{ color: colors.orange }}>Tuzağa Düşür!</Text>
                </Text>
                <Text style={styles.heroSubtitle}>
                  Sahte cevaplar yaz, rakiplerini kandır ve gerçek cevabı bul!
                </Text>
              </View>

              {/* Right Column: 3D Mascot Illustration */}
              <View style={styles.mascotWrap}>
                <Image
                  source={mascotImages.hero}
                  style={styles.mascotImage}
                  resizeMode="contain"
                />
              </View>
            </View>

            {/* CTAs */}
            <View style={styles.ctaRow}>
              <Button
                label="Oda Oluştur"
                onPress={goCreate}
                variant="orange"
                size="md"
                icon={<Plus color="#FFF" size={20} strokeWidth={2.5} />}
                style={styles.primaryCta}
              />
              <Button
                label="Odaya Katıl"
                onPress={goJoin}
                variant="secondary"
                size="md"
                icon={<LogIn color={colors.textPrimary} size={18} />}
                style={styles.secondaryCta}
              />
            </View>
          </LinearGradient>
        </View>

        {/* Featured game modes entry point */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Orman Hazinesi, Gizli Tilki ve tüm oyun modlarını keşfet"
          onPress={() => router.push('/game-modes')}
          style={({ pressed }) => [styles.modeSpotlight, pressed && styles.modeSpotlightPressed]}
        >
          <LinearGradient
            colors={['#3A1D2D', '#20243A', '#172B3B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.modeSpotlightIcon}>
            <Gamepad2 color="#FF936B" size={23} />
          </View>
          <View style={styles.modeSpotlightCopy}>
            <Text style={styles.modeSpotlightKicker}>YENİ OYUN TARZLARI</Text>
            <Text style={styles.modeSpotlightTitle}>Aynı ekip, başka oyun</Text>
            <Text style={styles.modeSpotlightText}>Soygun planla, gizli tilkiyi bul, birlikte kilitleri aç veya Gece Pazarı’nda pazarlık yap. Herkes kendi cihazında.</Text>
            <View style={styles.modeSpotlightLink}><Text style={styles.modeSpotlightLinkText}>Tüm oyun modlarını keşfet</Text><ChevronRight color="#17101F" size={16} /></View>
          </View>
          <Text style={styles.modeSpotlightFox}>🦊</Text>
        </Pressable>

        {/* Quick Bluff Rules / Scoring Highlights Banner */}
        <View style={styles.miniRulesRow}>
          {QUICK_SCORING_RULES.map((rule) => {
            const Icon = rule.icon;
            return (
              <Pressable
                key={rule.key}
                onPress={() => trigger('light')}
                style={({ pressed }) => [
                  styles.miniRuleCard,
                  {
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                <View style={styles.miniRuleCardContent}>
                  <View style={styles.miniRuleHeader}>
                    <View style={[styles.miniRuleIconCircle, { backgroundColor: rule.iconBg }]}>
                      <Icon size={12} color={rule.color} strokeWidth={2.6} />
                    </View>
                    <Text style={[styles.miniRuleScore, { color: rule.color }]}>
                      {rule.score}
                    </Text>
                  </View>
                  <Text style={styles.miniRuleLabel} numberOfLines={2}>
                    {rule.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Categories Showcase */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Kategoriler</Text>
            <Pressable onPress={() => router.push('/category-select')}>
              <Text style={styles.sectionLink}>Tümünü Gör</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesScrollView}
            contentContainerStyle={styles.categoriesScroll}
          >
            {CATEGORY_OPTIONS.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => {
                  soundService.play('click');
                  router.push('/category-select');
                }}
                style={({ pressed }) => [
                  styles.catCardPressable,
                  { transform: [{ scale: pressed ? 0.96 : 1 }] },
                ]}
              >
                <ImageBackground
                  source={categoryOptionImages[category.id]}
                  style={styles.catCard}
                  imageStyle={styles.catCardImage}
                >
                  <LinearGradient
                    colors={[colors.categoryOverlayTop, colors.categoryOverlayBottom]}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.catCardContent}>
                    <View style={styles.catEmojiCircle}>
                      <Text style={styles.catEmoji}>{category.emoji}</Text>
                    </View>
                    <Text style={styles.catName} numberOfLines={2}>
                      {category.name}
                    </Text>
                  </View>
                </ImageBackground>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* How to Play - Kızılkuyruk guide cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nasıl Oynanır?</Text>
          <Card variant="surface" style={styles.howToCard}>
            <View style={styles.howToRow}>
              <View style={[styles.howToBadge, { backgroundColor: colors.purpleSurface }]}>
                <Gamepad2 color={colors.purpleSoft} size={22} />
              </View>
              <View style={styles.howToText}>
                <Text style={styles.howToTitle}>1. Odaya Gir & Soru Gelir</Text>
                <Text style={styles.howToDesc}>
                  2-10 arkadaşınla odaya katıl. Kategori sorusu aynı anda herkese açılır.
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.howToRow}>
              <View style={[styles.howToBadge, { backgroundColor: colors.orangeSurface }]}>
                <Zap color={colors.orange} size={22} />
              </View>
              <View style={styles.howToText}>
                <Text style={styles.howToTitle}>2. Sahte Cevap Yaz & Şıkları Karıştır</Text>
                <Text style={styles.howToDesc}>
                  Herkes inandırıcı bir yalan uydurur. Gerçek cevap ve sahteler harmanlanır!
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.howToRow}>
              <View style={[styles.howToBadge, { backgroundColor: colors.successSurface }]}>
                <Sparkles color={colors.lime} size={22} />
              </View>
              <View style={styles.howToText}>
                <Text style={styles.howToTitle}>3. Tuzağa Düşür & Tuzağa Düşme!</Text>
                <Text style={styles.howToDesc}>
                  Doğru cevaba +2 puan; sahtene kanan her rakip için +1 puan kap! Yanılsan da puan kaybetmezsin.
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Leaderboard Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Liderlik Tablosu</Text>
            <Pressable
              onPress={() => router.push('/(tabs)/liderlik')}
              style={styles.linkRow}
            >
              <Text style={styles.sectionLink}>Tümü</Text>
              <ChevronRight color={colors.orange} size={16} />
            </Pressable>
          </View>

          <Card variant="default" style={styles.leaderCard}>
            {leaderPreview.length === 0 ? (
              <Text style={styles.emptyText}>Henüz kayıtlı skor bulunmuyor.</Text>
            ) : (
              leaderPreview.map((p, i) => (
                <View
                  key={p.id}
                  style={[
                    styles.leaderRow,
                    i !== leaderPreview.length - 1 && styles.leaderRowBorder,
                  ]}
                >
                  <View
                    style={[
                      styles.rankCircle,
                      i === 0 && styles.rankCircleFirst,
                      i === 1 && styles.rankCircleSecond,
                      i === 2 && styles.rankCircleThird,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rankText,
                        i === 0 && { color: colors.yellow },
                      ]}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  <Avatar avatarKey={p.avatarKey} userId={p.id} size={36} />
                  <Text style={styles.leaderName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Badge tone={i === 0 ? 'yellow' : i < 3 ? 'neutral' : 'purple'}>
                    {p.score} P
                  </Badge>
                </View>
              ))
            )}
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  recoveryOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  storeError: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storeErrorText: {
    ...typography.caption,
    color: colors.dangerSoft,
    flex: 1,
    marginRight: spacing.sm,
  },
  storeErrorClose: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  recoveryTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    textAlign: 'center',
  },
  recoveryText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  recoveryError: {
    ...typography.caption,
    color: colors.dangerSoft,
    textAlign: 'center',
  },
  recoverySkip: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  recoverySkipText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 100,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoPill: {
    transform: [{ rotate: '-2deg' }],
  },
  logoImage: {
    width: 144,
    height: 54,
  },
  profileBtn: {
    padding: 2,
  },
  heroContainer: {
    marginTop: spacing.md,
  },
  heroCard: {
    borderRadius: radii['2xl'],
    borderWidth: 1.5,
    borderColor: colors.borderAccent,
    padding: spacing.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  heroDiagonalStripe: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 220,
    backgroundColor: colors.orangeSurface,
    transform: [{ rotate: '-24deg' }],
  },
  heroContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLeftCol: {
    flex: 1.25,
    paddingRight: 6,
    minWidth: 0,
  },
  kickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.orangeSurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  kickerText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    color: colors.orange,
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 26,
    lineHeight: 32,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 6,
  },
  mascotWrap: {
    flex: 0.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotImage: {
    width: 130,
    height: 130,
    borderRadius: radii.lg,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.lg,
  },
  primaryCta: {
    flex: 1.15,
    paddingHorizontal: spacing.sm,
  },
  secondaryCta: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  modeSpotlight: {
    marginTop: spacing.md,
    minHeight: 150,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,147,107,0.42)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  modeSpotlightPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  modeSpotlightIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,147,107,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,147,107,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  modeSpotlightCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  modeSpotlightKicker: { color: '#FFAD88', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  modeSpotlightTitle: { color: '#FFFFFF', fontFamily: 'Poppins-Bold', fontSize: 22, marginTop: 3 },
  modeSpotlightText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 18, marginTop: 4 },
  modeSpotlightLink: { alignSelf: 'flex-start', marginTop: 12, minHeight: 34, borderRadius: 11, backgroundColor: '#FF936B', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 4 },
  modeSpotlightLinkText: { color: '#17101F', fontSize: 10, fontWeight: '900' },
  modeSpotlightFox: { position: 'absolute', right: 11, top: 10, fontSize: 28, opacity: 0.82 },
  miniRulesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
  },
  miniRuleCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
  },
  miniRuleCardContent: {
    minHeight: 62,
    paddingVertical: 8,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  miniRuleIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRuleScore: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  miniRuleLabel: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 11,
    lineHeight: 14,
    color: colors.textPrimary,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  section: {
    marginTop: spacing['2xl'],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  sectionLink: {
    ...typography.bodyMedium,
    color: colors.orange,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  categoriesScrollView: {
    marginHorizontal: -18,
  },
  categoriesScroll: {
    paddingHorizontal: 18,
    paddingVertical: 4,
  },
  catCardPressable: {
    marginRight: 12,
  },
  catCard: {
    width: 136,
    height: 104,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgCard,
    ...shadows.card,
  },
  catCardImage: {
    resizeMode: 'cover',
  },
  catCardContent: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  catEmojiCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.imageIconSurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catEmoji: {
    fontSize: 18,
  },
  catName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    lineHeight: 16,
    color: '#FFF',
    textShadowColor: colors.overlay,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  howToRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  howToCard: {
    padding: spacing.lg,
  },
  howToText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  howToBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howToTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  howToDesc: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  leaderCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  leaderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rankCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bgSurfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCircleFirst: {
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.yellow,
  },
  rankCircleSecond: {
    backgroundColor: colors.silverSurface,
  },
  rankCircleThird: {
    backgroundColor: colors.bgSurfaceAlt,
  },
  rankText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: colors.textMuted,
  },
  leaderName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  emptyText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
