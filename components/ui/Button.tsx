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
    bg: colors.purpleDeep,
    fg: colors.textOnAccent,
    border: colors.purple,
    bottomBorder: colors.purpleDeep,
    shadow: shadows.glow,
  },
  orange: {
    bg: colors.orangeDeep,
    fg: colors.textOnAccent,
    border: colors.orange,
    bottomBorder: colors.orangeDeep,
    shadow: shadows.glowOrange,
  },
  secondary: {
    bg: colors.bgSurfaceAlt,
    fg: colors.textPrimary,
    border: colors.borderStrong,
    bottomBorder: colors.borderStrong,
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
    border: colors.dangerSoft,
    bottomBorder: colors.danger,
  },
  success: {
    bg: colors.success,
    fg: colors.textOnAccent,
    border: colors.successSoft,
    bottomBorder: colors.success,
  },
  lime: {
    bg: colors.lime,
    fg: '#171026',
    border: colors.limeSoft,
    bottomBorder: colors.lime,
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
            backgroundColor: v.bg,
            borderColor: hovered && variant === 'secondary' ? themeColors.purple : v.border,
            borderBottomColor: v.bottomBorder,
            borderBottomWidth: disabled ? 1 : 2,
            transform: [{ translateY: pressed ? 1 : 0 }, { scale: pressed ? 0.985 : 1 }],
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
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  iconWrap: { marginRight: spacing.sm },
  label: {
    ...typography.bodyMedium,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.1,
    flexShrink: 1,
    textAlign: 'center',
  },
});
