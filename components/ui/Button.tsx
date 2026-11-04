import { Pressable, StyleSheet, Text, View, ActivityIndicator, type ViewStyle } from 'react-native';
import { colors, typography, radii, spacing, shadows } from '@/theme';
import type { ReactNode } from 'react';
import { soundService } from '@/services/soundService';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';

type Variant = 'primary' | 'orange' | 'secondary' | 'ghost' | 'danger' | 'success' | 'lime';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
  disableSound?: boolean;
}

const getVariants = (colors: ThemeColors): Record<
  Variant,
  { bg: string; fg: string; border: string; bottomBorder: string; shadow?: object }
> => ({
  primary: {
    bg: colors.purple,
    fg: colors.textOnAccent,
    border: '#A78BFA',
    bottomBorder: '#6D28D9',
    shadow: shadows.glow,
  },
  orange: {
    bg: colors.orange,
    fg: colors.textOnAccent,
    border: '#FFA07A',
    bottomBorder: '#D9480F',
    shadow: shadows.glowOrange,
  },
  secondary: {
    bg: colors.bgSurfaceAlt,
    fg: colors.textPrimary,
    border: colors.borderStrong,
    bottomBorder: 'rgba(255, 247, 255, 0.20)',
  },
  ghost: {
    bg: 'transparent',
    fg: colors.textPrimary,
    border: 'transparent',
    bottomBorder: 'transparent',
  },
  danger: {
    bg: colors.danger,
    fg: colors.textOnAccent,
    border: '#F87171',
    bottomBorder: '#DC2626',
  },
  success: {
    bg: colors.success,
    fg: colors.textOnAccent,
    border: '#6EE7B7',
    bottomBorder: '#059669',
  },
  lime: {
    bg: colors.lime,
    fg: '#171026',
    border: '#E2F899',
    bottomBorder: '#84CC16',
    shadow: shadows.glowLime,
  },
});

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  loading,
  icon,
  style,
  fullWidth,
  disableSound = false,
}: ButtonProps) {
  const { colors: themeColors } = useTheme();
  const v = getVariants(themeColors)[variant];
  const height = size === 'lg' ? 56 : size === 'md' ? 48 : 38;
  const fontSize = size === 'lg' ? 17 : size === 'md' ? 15 : 13;

  const handlePress = () => {
    if (!disableSound) {
      soundService.play('click');
    }
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={(state) => {
        // React Native's shared PressableStateCallbackType exposes `pressed`;
        // React Native Web may additionally supply `hovered` at runtime.
        const hovered = 'hovered' in state && state.hovered === true;
        const { pressed } = state;
        return [
          styles.base,
          v.shadow,
          {
            height,
            backgroundColor: hovered && variant === 'orange' ? themeColors.orangeDeep : v.bg,
            borderColor: hovered && variant === 'secondary' ? themeColors.purple : v.border,
            borderBottomColor: v.bottomBorder,
            borderBottomWidth: disabled ? 1 : 3.5,
            transform: [{ translateY: pressed ? 2.5 : 0 }, { scale: pressed ? 0.97 : 1 }],
            opacity: disabled ? 0.45 : pressed ? 0.92 : hovered ? 0.98 : 1,
          },
          fullWidth && { width: '100%' },
          style,
        ];
      }}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
          <Text style={[styles.label, { color: v.fg, fontSize }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  iconWrap: { marginRight: spacing.sm },
  label: {
    ...typography.bodyMedium,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.3,
    flexShrink: 1,
    textAlign: 'center',
  },
});
