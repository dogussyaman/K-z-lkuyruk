import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Sparkles,
  Zap,
  Shield,
  Search,
  Users,
  Scroll,
  Boxes,
  Crown,
  Clock,
  CheckCircle2,
  Lock,
  ArrowRight,
  Flame,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Button, Badge, Card } from '@/components/ui';
import { spacing, typography, radii, shadows } from '@/theme';
import { useHaptics } from '@/hooks/useHaptics';
import {
  GAME_MODES,
  type GameModeDefinition,
  type AnyGameModeId,
} from '@/features/game/modes';
import { gameModeImages } from '@/assets/game-modes';
import { soundService } from '@/services/soundService';

type FilterTab = 'all' | 'active' | 'coming_soon';

export default function GameModesScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { trigger } = useHaptics();

  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedModeId, setSelectedModeId] = useState<AnyGameModeId>('suspicious');

  const filteredModes = GAME_MODES.filter((m) => {
    if (filter === 'active') return m.status === 'active';
    if (filter === 'coming_soon') return m.status === 'coming_soon';
    return true;
  });

  const handleSelectMode = (id: AnyGameModeId) => {
    soundService.play('click');
    trigger('light');
    setSelectedModeId(id);
  };

  const handlePlayMode = (modeItem: GameModeDefinition) => {
    if (modeItem.status !== 'active') return;
    soundService.play('click');
    trigger('medium');
    router.push({
      pathname: '/create-room',
      params: { mode: modeItem.id },
    });
  };

  const renderIcon = (iconName: string, color: string, size = 18) => {
    switch (iconName) {
      case 'Zap':
        return <Zap size={size} color={color} />;
      case 'Shield':
        return <Shield size={size} color={color} />;
      case 'Search':
        return <Search size={size} color={color} />;
      case 'Users':
        return <Users size={size} color={color} />;
      case 'Scroll':
        return <Scroll size={size} color={color} />;
      case 'Boxes':
        return <Boxes size={size} color={color} />;
      case 'Crown':
        return <Crown size={size} color={color} />;
      default:
        return <Sparkles size={size} color={color} />;
    }
  };

  return (
    <Screen gradient diagonalSlice padded={false} edges={['top', 'bottom']}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          onPress={() => {
            soundService.play('click');
            router.back();
          }}
          style={styles.backBtn}
        >
          <ChevronLeft color={colors.textPrimary} size={22} />
        </Pressable>
        <View style={styles.topBarTextWrap}>
          <Text style={styles.screenTitle} numberOfLines={1}>Oyun Modları</Text>
          <Text style={styles.screenSubtitle}>Kızılkuyruk Dünyasını Keşfet</Text>
        </View>
        <Badge tone="orange" sticker>
          4 OYNANABİLİR
        </Badge>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.containerWrap}>
          {/* Featured Hero Banner */}
          <LinearGradient
            colors={[colors.zartoSurface, '#351B5C', '#1D0F33']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBanner}
          >
            <View style={styles.heroRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.heroKicker}>
                  <Flame size={13} color={colors.yellow} />
                  <Text style={styles.heroKickerText}>YENİ ÇIKANLAR</Text>
                </View>
                <Text style={styles.heroTitle}>Herkes Şüpheli & Fırtına Turu</Text>
                <Text style={styles.heroDesc}>
                  Artık sadece blöf yetmez! Dedektif çıkarımlarıyla tuzakçıları yakala veya 7 saniyede yıldırım hızında cevap ver.
                </Text>
              </View>
              <Image
                source={gameModeImages.suspicious}
                style={styles.heroImage}
                resizeMode="cover"
              />
            </View>
          </LinearGradient>

          {/* Filter Pills */}
          <View style={styles.filterRow}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === 'all' }}
              onPress={() => {
                trigger('light');
                setFilter('all');
              }}
              style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, filter === 'all' && styles.filterPillTextActive]}>
                Tümü ({GAME_MODES.length})
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === 'active' }}
              onPress={() => {
                trigger('light');
                setFilter('active');
              }}
              style={[styles.filterPill, filter === 'active' && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, filter === 'active' && styles.filterPillTextActive]}>
                Oynanabilir (4)
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === 'coming_soon' }}
              onPress={() => {
                trigger('light');
                setFilter('coming_soon');
              }}
              style={[styles.filterPill, filter === 'coming_soon' && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, filter === 'coming_soon' && styles.filterPillTextActive]}>
                Yakında (5)
              </Text>
            </Pressable>
          </View>

          {/* Game Mode Cards - 2'li Yapıda */}
          <View style={styles.cardsContainer}>
            {filteredModes.map((item) => {
              const isActive = item.status === 'active';
              const isSelected = selectedModeId === item.id;
              const imageSource = gameModeImages[item.illustrationKey];

              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleSelectMode(item.id)}
                  style={styles.cardPressable}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} modu seç`}
                >
                  <Card
                    variant="surface"
                    style={[
                      styles.modeCard,
                      isSelected && styles.modeCardSelected,
                      !isActive && styles.modeCardDisabled,
                    ]}
                  >
                    {/* Image Header with Gradient Overlay & Badges (230px tall) */}
                    <View style={styles.cardImageContainer}>
                      <Image
                        source={imageSource}
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                      <LinearGradient
                        colors={['rgba(17, 13, 27, 0.55)', 'transparent', 'rgba(17, 13, 27, 0.95)']}
                        locations={[0, 0.45, 1]}
                        style={StyleSheet.absoluteFill}
                      />

                      {/* Badges on Image */}
                      <View style={styles.imageBadgeTopRow}>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: isActive ? item.accentColor : 'rgba(100, 100, 120, 0.8)' },
                          ]}
                        >
                          {isActive ? (
                            renderIcon(item.iconName, '#FFFFFF', 11)
                          ) : (
                            <Lock size={10} color="#FFFFFF" />
                          )}
                          <Text style={styles.statusBadgeText}>{item.badge}</Text>
                        </View>

                        <View style={styles.difficultyBadge}>
                          <Text style={styles.difficultyBadgeText}>{item.difficultyLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.imageBottomRow}>
                        <View style={styles.iconCircle}>
                          {renderIcon(item.iconName, item.accentColor, 16)}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                          <Text style={[styles.cardTagline, { color: item.accentColor }]} numberOfLines={1}>
                            {item.tagline}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Card Body */}
                    <View style={styles.cardBody}>
                      <Text style={styles.cardDescription} numberOfLines={2}>
                        {item.description}
                      </Text>

                      {/* Metadata Chips */}
                      <View style={styles.metaRow}>
                        <View style={styles.metaChip}>
                          <Users size={11} color={colors.textSecondary} />
                          <Text style={styles.metaChipText}>{item.playerCountLabel}</Text>
                        </View>
                        <View style={styles.metaChip}>
                          <Clock size={11} color={colors.textSecondary} />
                          <Text style={styles.metaChipText}>{item.estimatedDurationLabel}</Text>
                        </View>
                        <View style={styles.metaChip}>
                          <Zap size={11} color={colors.textSecondary} />
                          <Text style={styles.metaChipText}>{item.rules.defaultRoundSeconds}s</Text>
                        </View>
                      </View>

                      {/* Mode Rules & Highlights (Top 2) */}
                      <View style={styles.featuresBox}>
                        {item.features.slice(0, 2).map((feat, index) => (
                          <View key={index} style={styles.featureLine}>
                            <CheckCircle2
                              size={12}
                              color={isActive ? item.accentColor : colors.textMuted}
                            />
                            <Text style={styles.featureText} numberOfLines={1}>
                              {feat}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* Action Button */}
                      <View style={styles.actionWrap}>
                        {isActive ? (
                          <Button
                            label="Oda Aç"
                            variant={item.id === 'survival' ? 'danger' : 'orange'}
                            size="sm"
                            fullWidth
                            icon={<ArrowRight size={14} color="#FFFFFF" />}
                            onPress={() => handlePlayMode(item)}
                          />
                        ) : (
                          <View style={styles.comingSoonBox}>
                            <Lock size={12} color={colors.textMuted} />
                            <Text style={styles.comingSoonText}>Yakında</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    backBtn: {
      width: 42,
      height: 42,
      borderRadius: radii.md,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topBarTextWrap: {
      flex: 1,
    },
    screenTitle: {
      ...typography.h3,
      fontFamily: 'Poppins-Bold',
      color: colors.textPrimary,
      lineHeight: 26,
    },
    screenSubtitle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    scroll: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 110,
    },
    heroBanner: {
      borderRadius: radii.xl,
      borderWidth: 1.5,
      borderColor: 'rgba(161, 107, 255, 0.35)',
      padding: spacing.md,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
      overflow: 'hidden',
      ...shadows.card,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    heroKicker: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255, 209, 102, 0.18)',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: radii.xs,
      alignSelf: 'flex-start',
      marginBottom: 5,
    },
    heroKickerText: {
      fontFamily: 'Poppins-Bold',
      fontSize: 9.5,
      color: colors.yellow,
      letterSpacing: 0.5,
    },
    heroTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: 16,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    heroDesc: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 3,
      lineHeight: 16,
    },
    heroImage: {
      width: 90,
      height: 90,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      marginBottom: spacing.md,
    },
    filterPill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 3,
      borderRadius: radii.pill,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterPillActive: {
      backgroundColor: colors.orange,
      borderColor: colors.orange,
    },
    filterPillText: {
      ...typography.caption,
      fontFamily: 'Poppins-SemiBold',
      color: colors.textSecondary,
    },
    filterPillTextActive: {
      color: '#FFFFFF',
      fontFamily: 'Poppins-Bold',
    },
    containerWrap: {
      width: '100%',
      maxWidth: 780,
      alignSelf: 'center',
    },
    cardsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      justifyContent: 'space-between',
    },
    cardPressable: {
      width: '48%',
      marginBottom: spacing.xs,
    },
    modeCard: {
      flex: 1,
      padding: 0,
      borderRadius: radii.xl,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      backgroundColor: colors.bgCard,
      justifyContent: 'space-between',
    },
    modeCardSelected: {
      borderColor: colors.orange,
    },
    modeCardDisabled: {
      opacity: 0.85,
    },
    cardImageContainer: {
      width: '100%',
      height: 230,
      position: 'relative',
      justifyContent: 'space-between',
      padding: spacing.md,
    },
    cardImage: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
    },
    imageBadgeTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 2,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radii.pill,
    },
    statusBadgeText: {
      fontFamily: 'Poppins-Bold',
      fontSize: 10,
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    difficultyBadge: {
      backgroundColor: 'rgba(17, 13, 27, 0.72)',
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    difficultyBadgeText: {
      fontFamily: 'Poppins-Medium',
      fontSize: 10,
      color: colors.textSecondary,
    },
    imageBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      zIndex: 2,
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: radii.full,
      backgroundColor: 'rgba(17, 13, 27, 0.85)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: 15.5,
      color: '#FFFFFF',
      lineHeight: 20,
    },
    cardTagline: {
      fontFamily: 'Poppins-Medium',
      fontSize: 10.5,
      lineHeight: 14,
    },
    cardBody: {
      padding: spacing.sm + 4,
      flex: 1,
      justifyContent: 'space-between',
      gap: spacing.xs + 3,
    },
    cardDescription: {
      ...typography.caption,
      color: colors.textSecondary,
      lineHeight: 16,
      fontSize: 11.5,
      minHeight: 32,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.bgDarkest,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: radii.xs,
    },
    metaChipText: {
      color: colors.textSecondary,
      fontSize: 10,
      fontFamily: 'Poppins-Medium',
    },
    featuresBox: {
      backgroundColor: colors.bgDarkest,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: 7,
      gap: 4,
    },
    featureLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    featureText: {
      color: colors.textPrimary,
      flexShrink: 1,
      fontSize: 10.5,
      lineHeight: 14,
    },
    actionWrap: {
      marginTop: 2,
    },
    comingSoonBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: colors.bgDarkest,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: 8,
    },
    comingSoonText: {
      fontFamily: 'Poppins-SemiBold',
      color: colors.textMuted,
      fontSize: 11,
    },
  });
