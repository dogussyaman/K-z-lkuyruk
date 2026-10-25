import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import type { GameMode } from '../../types/game';
import { getGameModeTheme } from '../../features/game/themes';

export function ModeAtmosphere({ mode }: { mode?: GameMode | null }) {
  const theme = getGameModeTheme(mode);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[theme.background, theme.surface, theme.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, styles.glowTop, { backgroundColor: theme.glow }]} />
      <View style={[styles.glow, styles.glowBottom, { backgroundColor: theme.glow }]} />
      <Text style={[styles.mark, { color: theme.accent }]}>{theme.heroEmoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 999, opacity: 0.75 },
  glowTop: { top: -110, right: -90 },
  glowBottom: { bottom: -130, left: -100 },
  mark: { position: 'absolute', right: 18, top: 76, fontSize: 52, opacity: 0.08, transform: [{ rotate: '12deg' }] },
});
