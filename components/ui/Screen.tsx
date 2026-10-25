import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { useGameStore } from '@/store/gameStore';
import { getGameModeTheme } from '@/features/game/themes';
import type { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
  gradient?: boolean;
  padded?: boolean;
  diagonalSlice?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  style?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  gradient = true,
  padded = true,
  diagonalSlice = false,
  edges = ['top', 'bottom'],
  style,
}: ScreenProps) {
  const { colors: themeColors } = useTheme();
  const { roomState } = useGameStore();
  const modeTheme = roomState?.config.gameMode ? getGameModeTheme(roomState.config.gameMode) : null;
  const background = modeTheme?.background ?? themeColors.bgDarkest;
  const middle = modeTheme?.surface ?? themeColors.bgDark;

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      {gradient ? (
        <LinearGradient
          colors={[background, middle, background]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} />
      )}

      {modeTheme ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.modeGlowTop, { backgroundColor: modeTheme.glow }]} />
          <View style={[styles.modeGlowBottom, { backgroundColor: modeTheme.glow }]} />
          <Text style={[styles.modeMark, { color: modeTheme.accent }]}>{modeTheme.heroEmoji}</Text>
        </View>
      ) : null}

      {diagonalSlice && (
        <View pointerEvents="none" style={styles.diagonalWrapper}>
          <View style={[styles.diagonalSliceTop, modeTheme && { backgroundColor: modeTheme.glow }]} />
          <View style={[styles.diagonalSliceBottom, modeTheme && { backgroundColor: modeTheme.glow }]} />
        </View>
      )}

      <SafeAreaView
        style={[styles.safeContent, padded && styles.padded, style]}
        edges={edges}
      >
        {children}
      </SafeAreaView>
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const { colors: themeColors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.zartoNight,
  },
  safeContent: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 14,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: 'Poppins-Bold',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    marginTop: 2,
  },
  modeGlowTop: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 999,
    top: -145,
    right: -135,
    opacity: 0.85,
  },
  modeGlowBottom: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 999,
    bottom: -160,
    left: -140,
    opacity: 0.5,
  },
  modeMark: {
    position: 'absolute',
    right: 18,
    top: 74,
    fontSize: 54,
    opacity: 0.065,
    transform: [{ rotate: '10deg' }],
  },
  diagonalWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  diagonalSliceTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 260,
    height: 180,
    backgroundColor: 'rgba(161, 107, 255, 0.08)',
    borderRadius: radii['2xl'],
    transform: [{ rotate: '-18deg' }, { skewX: '-10deg' }],
  },
  diagonalSliceBottom: {
    position: 'absolute',
    bottom: -60,
    left: -80,
    width: 240,
    height: 160,
    backgroundColor: 'rgba(255, 113, 61, 0.06)',
    borderRadius: radii['2xl'],
    transform: [{ rotate: '15deg' }],
  },
});
