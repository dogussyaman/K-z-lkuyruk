import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { ReactNode } from 'react';

export function StickyActionBar({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return <View style={[styles.container, { borderTopColor: colors.border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    zIndex: 10,
  },
});
