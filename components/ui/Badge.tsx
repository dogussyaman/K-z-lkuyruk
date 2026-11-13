import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '@/theme';
import type { ReactNode } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';

type Tone = 'purple' | 'orange' | 'yellow' | 'lime' | 'blue' | 'coral' | 'success' | 'warning' | 'danger' | 'neutral';

const getTones = (colors: ThemeColors): Record<Tone, { bg: string; fg: string; border: string }> => ({
  purple: { bg: colors.purpleSurface, fg: colors.purpleSoft, border: colors.borderAccent },
  orange: { bg: colors.orangeSurface, fg: colors.orange, border: colors.borderAccent },
  yellow: { bg: colors.goldSurface, fg: colors.yellow, border: colors.borderStrong },
  lime: { bg: colors.successSurface, fg: colors.lime, border: colors.borderStrong },
  blue: { bg: colors.purpleSurface, fg: colors.blueSoft, border: colors.borderStrong },
  coral: { bg: colors.orangeSurface, fg: colors.orange, border: colors.borderAccent },
  success: { bg: colors.successSurface, fg: colors.successSoft, border: colors.borderStrong },
  warning: { bg: colors.goldSurface, fg: colors.warning, border: colors.borderStrong },
  danger: { bg: colors.dangerSurface, fg: colors.dangerSoft, border: colors.borderStrong },
  neutral: { bg: colors.bgSurfaceAlt, fg: colors.textSecondary, border: colors.borderStrong },
});

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  sticker?: boolean;
  style?: ViewStyle;
}

export function Badge({ children, tone = 'neutral', sticker = false, style }: BadgeProps) {
  const { colors, mode } = useTheme();
  const darkTone = getTones(colors)[tone];
  const lightTone: Record<Tone, { bg: string; fg: string }> = {
    purple: { bg: 'rgba(117, 71, 196, 0.10)', fg: '#6640AA' },
    orange: { bg: 'rgba(217, 86, 43, 0.10)', fg: '#B8441B' },
    yellow: { bg: 'rgba(255, 209, 102, 0.24)', fg: '#72500B' },
    lime: { bg: 'rgba(122, 164, 36, 0.13)', fg: '#435B17' },
    blue: { bg: 'rgba(59, 130, 246, 0.10)', fg: '#1D4ED8' },
    coral: { bg: 'rgba(217, 86, 43, 0.10)', fg: '#B8441B' },
    success: { bg: 'rgba(16, 185, 129, 0.10)', fg: '#087247' },
    warning: { bg: 'rgba(255, 209, 102, 0.24)', fg: '#72500B' },
    danger: { bg: 'rgba(239, 68, 68, 0.10)', fg: '#B42318' },
    neutral: { bg: colors.bgSurfaceAlt, fg: colors.textSecondary },
  };
  const t = mode === 'light' ? { ...darkTone, ...lightTone[tone] } : darkTone;
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: t.bg,
          borderColor: t.border,
          borderWidth: 1,
        },
        sticker && styles.sticker,
        style,
      ]}
    >
      <Text style={[styles.text, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  sticker: {
    borderRadius: radii.sm,
  },
  text: {
    ...typography.caption,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.25,
  },
});
