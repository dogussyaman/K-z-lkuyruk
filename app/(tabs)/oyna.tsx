import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { router } from 'expo-router';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, LogIn, Zap, Shield, Swords, Sparkles, Flame, ArrowRight } from 'lucide-react-native';
import { Screen, ScreenHeader, Button, Card, Badge } from '@/components/ui';
import { colors, spacing, typography, radii, shadows } from '@/theme';
import { CATEGORY_GROUPS, CATEGORY_OPTIONS } from '@/features/game/categories';
import { mascotImages } from '@/assets/illustrations';
import { categoryOptionImages } from '@/assets/categories/options';
import { gameModeImages } from '@/assets/game-modes';

export default function OynaScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <Screen gradient diagonalSlice padded={false} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Oyna"
          subtitle="Arkadaşlarını topla, blöfünle tuzağa düşür!"
          right={<Badge tone="orange" sticker>2–10 OYUNCU</Badge>}
        />

        {/* Hero Banner with Fox Lobby Mascot */}
        <LinearGradient
          colors={[colors.zartoSurface, '#391866', '#221140']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroDiagonal} />
          <View style={styles.heroRow}>
            <View style={{ flex: 1.2 }}>
              <View style={styles.kickerPill}>
                <Sparkles color={colors.yellow} size={13} />
                <Text style={styles.kicker}>PARTİ SALONU</Text>
              </View>
              <Text style={styles.heroTitle}>Oyununu Seç,{'\n'}Ortamı Isıt!</Text>
              <Text style={styles.heroCopy}>
                Oda açarak arkadaşlarını davet et veya paylaşılan 5 haneli kodla odaya katıl.
              </Text>

              <View style={styles.tags}>
                <View style={styles.tag}>
                  <Zap color={colors.yellow} size={13} />
                  <Text style={styles.tagText}>Hızlı Turlar</Text>
                </View>
                <View style={styles.tag}>
                  <Shield color={colors.lime} size={13} />
                  <Text style={styles.tagText}>Kalkan & Blok</Text>
                </View>
              </View>
            </View>

            <View style={styles.heroMascotWrap}>
              <Image source={mascotImages.lobby} style={styles.heroMascot} resizeMode="contain" />
            </View>
          </View>
        </LinearGradient>

        {/* 2-Column Action Cards */}
        <View style={styles.actions}>
          <Card variant="surface" style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(255, 113, 59, 0.2)' }]}>
              <Plus color={colors.orange} size={24} strokeWidth={2.5} />
            </View>
            <Text style={styles.actionTitle}>Yeni Oda Kur</Text>
            <Text style={styles.actionCopy}>
              Tur sayısını, soru süresini belirle ve kodunu paylaş.
            </Text>
            <Button
              label="Oda Oluştur"
              onPress={() => router.push('/create-room')}
              variant="orange"
              size="md"
              fullWidth
            />
          </Card>

          <Card variant="surface" style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
              <LogIn color={colors.purpleSoft} size={24} strokeWidth={2.5} />
            </View>
            <Text style={styles.actionTitle}>Odaya Katıl</Text>
            <Text style={styles.actionCopy}>
              Arkadaşının verdiği 5 haneli oda kodunu girerek lobiye katıl.
            </Text>
            <Button
              label="Kod ile Katıl"
              onPress={() => router.push('/join-room')}
              variant="secondary"
              size="md"
              fullWidth
            />
          </Card>
        </View>

        {/* Game Modes Showcase */}
        <View style={styles.sectionHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Flame color={colors.orange} size={18} />
            <Text style={styles.sectionTitle}>Oyun Modları</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tüm modları gör"
            onPress={() => router.push('/game-modes')}
          >
            <Text style={styles.sectionMeta}>Tümü (9) →</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modesScroll}
        >
          {/* Herkes Şüpheli */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Herkes Şüpheli modunu seç"
            style={styles.modeShowcaseCard}
            onPress={() => router.push({ pathname: '/create-room', params: { mode: 'suspicious' } })}
          >
            <Image source={gameModeImages.suspicious} style={styles.modeShowcaseImage} />
            <LinearGradient
              colors={['transparent', 'rgba(17, 13, 27, 0.92)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.modeShowcaseContent}>
              <Badge tone="purple" style={styles.modeShowcaseBadge}>YENİ MOD</Badge>
              <Text style={styles.modeShowcaseTitle}>Herkes Şüpheli</Text>
              <Text style={styles.modeShowcaseSub}>Dedektif Çıkarımı</Text>
            </View>
          </Pressable>

          {/* Fırtına Turu */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fırtına Turu modunu seç"
            style={styles.modeShowcaseCard}
            onPress={() => router.push({ pathname: '/create-room', params: { mode: 'blitz' } })}
          >
            <Image source={gameModeImages.blitz} style={styles.modeShowcaseImage} />
            <LinearGradient
              colors={['transparent', 'rgba(17, 13, 27, 0.92)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.modeShowcaseContent}>
              <Badge tone="yellow" style={styles.modeShowcaseBadge}>7 SANİYE</Badge>
              <Text style={styles.modeShowcaseTitle}>Fırtına Turu</Text>
              <Text style={styles.modeShowcaseSub}>Yıldırım Hızlı Yarış</Text>
            </View>
          </Pressable>

          {/* Hayatta Kalma */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hayatta Kalma modunu seç"
            style={styles.modeShowcaseCard}
            onPress={() => router.push({ pathname: '/create-room', params: { mode: 'survival' } })}
          >
            <Image source={gameModeImages.survival} style={styles.modeShowcaseImage} />
            <LinearGradient
              colors={['transparent', 'rgba(17, 13, 27, 0.92)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.modeShowcaseContent}>
              <Badge tone="danger" style={styles.modeShowcaseBadge}>3 CAN</Badge>
              <Text style={styles.modeShowcaseTitle}>Hayatta Kalma</Text>
              <Text style={styles.modeShowcaseSub}>Son Kalan Tilki</Text>
            </View>
          </Pressable>

          {/* Klasik Blöf */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Klasik Blöf modunu seç"
            style={styles.modeShowcaseCard}
            onPress={() => router.push({ pathname: '/create-room', params: { mode: 'classic' } })}
          >
            <Image source={gameModeImages.classic} style={styles.modeShowcaseImage} />
            <LinearGradient
              colors={['transparent', 'rgba(17, 13, 27, 0.92)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.modeShowcaseContent}>
              <Badge tone="orange" style={styles.modeShowcaseBadge}>KLASİK</Badge>
              <Text style={styles.modeShowcaseTitle}>Klasik Blöf</Text>
              <Text style={styles.modeShowcaseSub}>Tuzak & Puan Avı</Text>
            </View>
          </Pressable>
        </ScrollView>

        {/* Categories Grid */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Oyun Kategorileri</Text>
          <Pressable onPress={() => router.push('/category-select')}>
            <Text style={styles.sectionMeta}>Tümü ({CATEGORY_OPTIONS.length})</Text>
          </Pressable>
        </View>

        {CATEGORY_GROUPS.map((group) => (
          <View key={group.id} style={styles.categoryGroup}>
            <View style={styles.categoryGroupHeading}>
              <Text style={styles.categoryGroupEmoji}>{group.emoji}</Text>
              <Text style={styles.categoryGroupTitle}>{group.name}</Text>
            </View>
            <View style={styles.categoryGrid}>
              {group.categories.map((category) => (
                <Pressable
                  key={category.id}
                  style={styles.categoryTileWrap}
                  onPress={() => router.push('/category-select')}
                >
                  <ImageBackground
                    source={categoryOptionImages[category.id]}
                    style={styles.categoryTile}
                    imageStyle={styles.categoryImage}
                  >
                    <LinearGradient
                      colors={['rgba(15, 9, 27, 0.2)', 'rgba(15, 9, 27, 0.82)']}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    <View style={styles.categoryTileContent}>
                      <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                      <Text style={styles.categoryName} numberOfLines={3}>
                        {category.name}
                      </Text>
                    </View>
                  </ImageBackground>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Tactical Pro-Tip Card */}
        <Card variant="comic" style={styles.tipCard}>
          <View style={styles.tipIconWrap}>
            <Swords color={colors.orange} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>Kızılkuyruk Blöf Taktikleri</Text>
            <Text style={styles.tipCopy}>
              Gerçek cevabı bulmak +2 puan; ancak kendi uydurduğun cevaba arkadaşlarını tuzağa düşürmek rakip başına +1 puan! Puan kazandıkça kredi toplayıp Kalkan ve Blok yeteneklerini kullanabilirsin!
            </Text>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 100,
  },
  hero: {
    marginTop: spacing.xs,
    borderRadius: radii['2xl'],
    borderWidth: 1.5,
    borderColor: 'rgba(255, 113, 59, 0.3)',
    padding: spacing.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  heroDiagonal: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 140,
    height: 220,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    transform: [{ rotate: '-22deg' }],
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  kicker: {
    color: colors.yellow,
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#FFF7FF',
    fontFamily: 'Poppins-Bold',
    fontSize: 22,
    lineHeight: 28,
  },
  heroCopy: {
    color: '#D8CCE6',
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  heroMascotWrap: {
    flex: 0.85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMascot: {
    width: 110,
    height: 110,
  },
  tags: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: { color: '#FFF7FF', fontFamily: 'Poppins-Medium', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: spacing.lg },
  actionCard: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    fontSize: 15,
  },
  actionCopy: {
    color: colors.textMuted,
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    lineHeight: 16,
    minHeight: 48,
    marginTop: 4,
    marginBottom: 10,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing['2xl'],
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    fontSize: 18,
  },
  sectionMeta: {
    color: colors.orange,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
  },
  categoryGroup: { marginBottom: spacing.md },
  categoryGroupHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  categoryGroupEmoji: { fontSize: 18 },
  categoryGroupTitle: {
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryTileWrap: { width: '47%', minWidth: 0 },
  categoryTile: {
    minHeight: 84,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    ...shadows.card,
  },
  categoryImage: {
    resizeMode: 'cover',
  },
  categoryTileContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  categoryEmojiBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: { fontSize: 18 },
  categoryName: {
    color: '#FFF',
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  tipCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginTop: spacing.xl,
  },
  tipIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 113, 59, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: { color: colors.textPrimary, fontFamily: 'Poppins-Bold', fontSize: 13 },
  tipCopy: { color: colors.textSecondary, fontFamily: 'Poppins-Regular', fontSize: 11, lineHeight: 16, marginTop: 2 },
  modesScroll: {
    gap: 12,
    paddingRight: 10,
    marginBottom: spacing.xs,
  },
  modeShowcaseCard: {
    width: 145,
    height: 165,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'flex-end',
    ...shadows.card,
  },
  modeShowcaseImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  modeShowcaseContent: {
    padding: 10,
    zIndex: 2,
  },
  modeShowcaseBadge: {
    alignSelf: 'flex-start',
    marginBottom: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  modeShowcaseTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 17,
  },
  modeShowcaseSub: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 9.5,
  },
});
