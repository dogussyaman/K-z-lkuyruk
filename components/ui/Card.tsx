import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, typography, shadows } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'elevated' | 'outline' | 'surface' | 'accent' | 'comic';
  glow?: 'none' | 'purple' | 'orange' | 'lime' | 'blue';
}

export function Card({ children, style, variant = 'default', glow = 'none' }: CardProps) {
  const { colors: themeColors } = useTheme();
  const bg =
    variant === 'elevated'
      ? themeColors.bgElevated
      : variant === 'outline'
      ? 'transparent'
      : variant === 'surface'
      ? themeColors.bgCard
      : variant === 'accent'
      ? themeColors.bgSurfaceAlt
      : variant === 'comic'
      ? themeColors.bgCardAlt
      : themeColors.bgCard;

  const border =
    variant === 'outline'
      ? themeColors.borderStrong
      : variant === 'comic'
      ? themeColors.borderAccent
      : variant === 'accent'
      ? themeColors.borderAccent
      : themeColors.border;

  const glowStyle =
    glow === 'purple'
      ? shadows.glow
      : glow === 'orange'
      ? shadows.glowOrange
      : glow === 'lime'
      ? shadows.glowLime
      : glow === 'blue'
      ? shadows.glowBlue
      : { shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 7, elevation: 1 };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
        },
        glowStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({
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
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitle: { ...typography.h4, color: colors.textPrimary, fontFamily: 'Poppins-Bold' },
  headerSubtitle: { ...typography.small, color: colors.textMuted, marginTop: 2 },
});
