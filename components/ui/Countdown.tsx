import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { colors, typography, radii } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

interface CountdownProps {
  seconds: number;
  onExpire?: () => void;
  size?: number;
}

export function Countdown({ seconds, onExpire, size = 64 }: CountdownProps) {
  const { colors: themeColors } = useTheme();
  const [timerState, setTimerState] = useState(() => ({ seconds, remaining: seconds }));
  const remaining = timerState.seconds === seconds ? timerState.remaining : seconds;
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = 1;
    const start = Date.now();
    let expired = false;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, seconds - elapsed);
      setTimerState({ seconds, remaining: Math.ceil(left) });
      progress.value = withTiming(seconds > 0 ? left / seconds : 0, {
        duration: 1000,
        easing: Easing.linear,
      });
      if (left <= 0 && !expired) {
        expired = true;
        clearInterval(interval);
        onExpire?.();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [seconds, onExpire, progress]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 360}deg` }],
  }));

  const tone =
    remaining <= 5 ? themeColors.danger : remaining <= 10 ? themeColors.warning : themeColors.purpleSoft;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View style={[styles.ring, { borderColor: tone }, ringStyle]} />
      <View style={[styles.inner, {
        width: size - 8,
        height: size - 8,
        borderRadius: (size - 8) / 2,
        backgroundColor: themeColors.bgSurface,
        borderColor: themeColors.border,
      }]}>
        <Text style={[styles.text, { color: tone }]}>{remaining}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 3,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  inner: {
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { ...typography.h3, fontFamily: 'Poppins-Bold' },
});
