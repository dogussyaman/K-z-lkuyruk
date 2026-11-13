import { useEffect, useRef, type ComponentType } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Home } from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '@/theme';
import { soundService } from '@/services/soundService';
import { useHaptics } from '@/hooks/useHaptics';
import { useTheme } from '@/theme/ThemeProvider';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type TabIconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type TabIcon = ComponentType<TabIconProps>;

function GameTabIcon({ color = '#eeeff6', size = 24 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 6.5h11a5.2 5.2 0 0 1 4.96 6.77l-1.38 4.5a3.1 3.1 0 0 1-5.08 1.36L13.9 17.3h-3.8L8 19.13a3.1 3.1 0 0 1-5.08-1.36l-1.38-4.5A5.2 5.2 0 0 1 6.5 6.5Z M7.3 10.8h1.3v1.3h1.3v1.3H8.6v1.3H7.3v-1.3H6v-1.3h1.3v-1.3Z M16.4 10.4a.8.8 0 1 0 0 1.6a.8.8 0 0 0 0-1.6Z M18.3 12.5a.8.8 0 1 0 0 1.6a.8.8 0 0 0 0-1.6Z"
        fill={color}
        fillRule="evenodd"
      />
    </Svg>
  );
}

function HomeTabIcon({ color = '#eeeff6', size = 24 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 25 24">
      <Path
        d="M13.85 3.70391C13.05 3.10391 11.95 3.10391 11.15 3.70391L4.65 8.57891C4.08344 9.00383 3.75 9.6707 3.75 10.3789V18.5003C3.75 19.743 4.75736 20.7503 6 20.7503H10.25C10.6642 20.7503 11 20.4145 11 20.0003V17.0003C11 16.1719 11.6716 15.5003 12.5 15.5003C13.3284 15.5003 14 16.1719 14 17.0003V20.0003C14 20.4145 14.3358 20.7503 14.75 20.7503H19C20.2426 20.7503 21.25 19.743 21.25 18.5003V10.3789C21.25 9.6707 20.9166 9.00383 20.35 8.57891L13.85 3.70391Z"
        fill={color}
      />
    </Svg>
  );
}

function ProfileTabIcon({ color = '#eeeff6', size = 24 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12.0672 2C9.6678 2 7.72266 3.94514 7.72266 6.34459C7.72266 8.74404 9.6678 10.6892 12.0672 10.6892C14.4667 10.6892 16.4118 8.74404 16.4118 6.34459C16.4118 3.94514 14.4667 2 12.0672 2Z"
        fill={color}
      />
      <Path
        d="M20.25 19.453C20.2421 19.8615 19.9087 20.1895 19.5001 20.1895H4.50013C4.09157 20.1895 3.75818 19.8624 3.75027 19.454L3.75023 19.452L3.75019 19.4493L3.7501 19.4423L3.75 19.4211C3.74999 19.404 3.75015 19.3807 3.75072 19.3516C3.75187 19.2937 3.75468 19.2127 3.76117 19.1119C3.77413 18.9107 3.80189 18.6292 3.86099 18.2937C3.97867 17.6258 4.22374 16.7262 4.73808 15.8194C5.79641 13.9537 7.92408 12.1895 12.0001 12.1895C16.0762 12.1895 18.2038 13.9537 19.2622 15.8194C19.7765 16.7262 20.0216 17.6258 20.1393 18.2937C20.1984 18.6292 20.2261 18.9107 20.2391 19.1119C20.2456 19.2127 20.2484 19.2937 20.2495 19.3516C20.2501 19.3807 20.2503 19.404 20.2503 19.4211L20.2502 19.4423L20.2501 19.4493L20.25 19.452L20.25 19.453Z"
        fill={color}
      />
    </Svg>
  );
}

function LeadershipTabIcon({ color = '#eeeff6', size = 24 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 25 24">
      <Path
        d="M6.44531 4C6.44531 3.58579 6.7811 3.25 7.19531 3.25H17.1414C17.5557 3.25 17.8914 3.58579 17.8914 4V9.69964C17.8914 10.9657 17.4795 12.1377 16.7825 13.086C16.7328 13.1536 16.6816 13.2201 16.629 13.2854C15.7289 14.4038 14.4149 15.1778 12.9189 15.3739V16.6562H15.666C15.9888 16.6562 16.2754 16.8628 16.3775 17.1691L17.2423 19.7637C17.3186 19.9924 17.2802 20.2439 17.1393 20.4394C16.9983 20.635 16.7719 20.7509 16.5308 20.7509H7.80664C7.56556 20.7509 7.33917 20.635 7.19821 20.4394C7.05725 20.2439 7.01889 19.9924 7.09513 19.7637L7.96001 17.1691C8.06209 16.8628 8.3487 16.6562 8.67152 16.6562H11.4189V15.3741C9.92235 15.1782 8.60777 14.4039 7.70741 13.2851L7.70636 13.2837C7.65427 13.219 7.60357 13.1531 7.5543 13.086C6.8573 12.1377 6.44531 10.9657 6.44531 9.69965V4Z"
        fill={color}
      />
      <Path
        d="M4.16895 5.41016H5.44531V9.69965C5.44531 10.5632 5.60881 11.3902 5.90642 12.1502C5.80517 12.0613 5.70308 11.9664 5.60101 11.8653C4.48947 10.7644 3.41895 8.95968 3.41895 6.16016C3.41895 5.74594 3.75473 5.41016 4.16895 5.41016Z"
        fill={color}
      />
      <Path
        d="M18.7364 11.8653C18.634 11.9667 18.5316 12.0619 18.43 12.1511C18.7278 11.3909 18.8914 10.5635 18.8914 9.69964V5.41016H20.1685C20.5827 5.41016 20.9185 5.74594 20.9185 6.16016C20.9185 8.95968 19.8479 10.7644 18.7364 11.8653Z"
        fill={color}
      />
    </Svg>
  );
}

function FriendsTabIcon({ color = '#eeeff6', size = 24 }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8.80437 4.10156C6.7626 4.10156 5.10742 5.75674 5.10742 7.79851C5.10742 9.84027 6.7626 11.4955 8.80437 11.4955C10.8461 11.4955 12.5013 9.84027 12.5013 7.79851C12.5013 5.75674 10.8461 4.10156 8.80437 4.10156Z"
        fill={color}
      />
      <Path
        d="M1.85175 19.16L1.85172 19.1577L1.85165 19.1513L1.85156 19.1321C1.85156 19.1164 1.85169 19.0952 1.85215 19.0688C1.85309 19.016 1.85538 18.9421 1.86069 18.8502C1.8713 18.6666 1.89402 18.4095 1.94242 18.1031C2.03866 17.4938 2.23948 16.6698 2.66304 15.837C3.08862 15.0001 3.74414 14.1453 4.74743 13.5023C5.75344 12.8576 7.06383 12.4551 8.75032 12.4551C10.4368 12.4551 11.7472 12.8576 12.7532 13.5023C13.7565 14.1453 14.412 15.0001 14.8376 15.837C15.2612 16.6698 15.462 17.4938 15.5582 18.1031C15.6066 18.4095 15.6293 18.6666 15.6399 18.8502C15.6453 18.9421 15.6476 19.016 15.6485 19.0688C15.649 19.0952 15.6491 19.1164 15.6491 19.1321L15.649 19.1513L15.6489 19.1577L15.6489 19.161C15.6418 19.5701 15.3081 19.8988 14.899 19.8988H2.60167C2.19253 19.8988 1.85888 19.5709 1.85178 19.1618C1.85178 19.1618 1.85179 19.1625 1.85175 19.16Z"
        fill={color}
      />
      <Path
        d="M17.0209 19.8988C17.0999 19.6756 17.1446 19.4363 17.149 19.187L17.1491 19.1799L17.1493 19.1676L17.1494 19.1387L17.1494 19.1327C17.1494 19.1083 17.1492 19.078 17.1486 19.0422C17.1473 18.9708 17.1443 18.8769 17.1378 18.7637C17.1247 18.538 17.0974 18.2312 17.0402 17.8691C17.0103 17.6801 16.9717 17.472 16.9215 17.2494C16.9165 17.2261 16.9113 17.2028 16.9058 17.1794C16.6448 16.0607 16.0667 14.4931 14.7497 13.189C14.515 12.9567 14.2627 12.7384 13.9924 12.5363C14.3865 12.4831 14.8056 12.4551 15.2509 12.4551C16.9373 12.4551 18.2477 12.8576 19.2537 13.5023C20.257 14.1453 20.9126 15.0001 21.3381 15.837C21.7617 16.6698 21.9625 17.4938 22.0588 18.1031C22.1072 18.4095 22.1299 18.6666 22.1405 18.8502C22.1458 18.9421 22.1481 19.016 22.149 19.0688C22.1495 19.0952 22.1496 19.1164 22.1496 19.1321L22.1495 19.1513L22.1495 19.1577L22.1494 19.161C22.1423 19.5701 21.8086 19.8988 21.3995 19.8988H17.0209Z"
        fill={color}
      />
      <Path
        d="M14.0028 7.79851C14.0028 8.89595 13.6627 9.91394 13.082 10.7528C13.7007 11.219 14.4705 11.4955 15.3049 11.4955C17.3467 11.4955 19.0018 9.84027 19.0018 7.79851C19.0018 5.75674 17.3467 4.10156 15.3049 4.10156C14.4705 4.10156 13.7007 4.37797 13.082 4.84422C13.6627 5.68307 14.0028 6.70106 14.0028 7.79851Z"
        fill={color}
      />
    </Svg>
  );
}

const BAR_H = 70;
const BAR_R = 24;
const NOTCH_HALF = 44;
const NOTCH_DEPTH = 34;
const CIRCLE = 52;
const CIRCLE_TOP = 5 - CIRCLE / 2;
const SIDE_MARGIN = 16;
const MAX_BAR_WIDTH = 500;
const OVERHANG = Math.abs(CIRCLE_TOP) + 10;
const CAPSULE_PADDING_H = 6;

interface LiquidGlassTabBarProps {
  state: BottomTabBarProps['state'];
  navigation: any;
  descriptors: Record<string, { options: { title?: string } }>;
}

const TAB_CONFIGS = {
  index: { label: 'Ana Sayfa', icon: HomeTabIcon, activeColor: colors.orangeDeep },
  oyna: { label: 'Oyna', icon: GameTabIcon, activeColor: colors.orangeDeep },
  arkadaslar: { label: 'Arkadaşlar', icon: FriendsTabIcon, activeColor: colors.orangeDeep },
  liderlik: { label: 'Liderlik', icon: LeadershipTabIcon, activeColor: colors.orangeDeep },
  profil: { label: 'Profil', icon: ProfileTabIcon, activeColor: colors.orangeDeep },
} as const;

function clampX(width: number, x: number) {
  'worklet';
  const min = BAR_R + NOTCH_HALF;
  const max = width - BAR_R - NOTCH_HALF;
  return Math.min(Math.max(x, min), max);
}

function buildPath(width: number, centerX: number, depth: number) {
  'worklet';
  const left = centerX - NOTCH_HALF;
  const right = centerX + NOTCH_HALF;
  const controlLeft = NOTCH_HALF * 0.5;
  const controlRight = NOTCH_HALF * 0.46;

  return [
    `M ${BAR_R} 0`,
    `L ${left} 0`,
    `C ${left + controlLeft} 0 ${centerX - controlRight} ${depth} ${centerX} ${depth}`,
    `C ${centerX + controlRight} ${depth} ${right - controlLeft} 0 ${right} 0`,
    `L ${width - BAR_R} 0`,
    `A ${BAR_R} ${BAR_R} 0 0 1 ${width} ${BAR_R}`,
    `L ${width} ${BAR_H - BAR_R}`,
    `A ${BAR_R} ${BAR_R} 0 0 1 ${width - BAR_R} ${BAR_H}`,
    `L ${BAR_R} ${BAR_H}`,
    `A ${BAR_R} ${BAR_R} 0 0 1 0 ${BAR_H - BAR_R}`,
    `L 0 ${BAR_R}`,
    `A ${BAR_R} ${BAR_R} 0 0 1 ${BAR_R} 0`,
    'Z',
  ].join(' ');
}

type TabItemProps = {
  center: number;
  cx: SharedValue<number>;
  label: string;
  focused: boolean;
  icon: TabIcon;
  onPress: () => void;
  onLongPress: () => void;
};

function TabItem({
  center,
  cx,
  label,
  focused,
  icon: Icon,
  onPress,
  onLongPress,
}: TabItemProps) {
  const { colors: themeColors } = useTheme();
  const iconStyle = useAnimatedStyle(() => {
    const distance = Math.abs(cx.value - center);
    const visibility = interpolate(distance, [16, 62], [0, 1], Extrapolation.CLAMP);

    return {
      opacity: visibility,
      transform: [
        { scale: 0.55 + 0.45 * visibility },
        { translateY: (1 - visibility) * 10 },
      ],
    };
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tab}
    >
      <Animated.View style={[styles.inactiveIcon, iconStyle]}>
        <Icon color={themeColors.textSecondary} size={29} strokeWidth={2.2} />
      </Animated.View>
    </Pressable>
  );
}

export function LiquidGlassTabBar({ state, navigation, descriptors }: LiquidGlassTabBarProps) {
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { trigger } = useHaptics();
  const shouldReduceMotion = useReducedMotion();

  const barWidth = Math.min(screenWidth - SIDE_MARGIN * 2, MAX_BAR_WIDTH);
  const routeCount = state.routes.length;
  const pad =
    routeCount > 1
      ? Math.max(0, (BAR_R + NOTCH_HALF - barWidth / (2 * routeCount)) / (1 - 1 / routeCount))
      : 0;
  const tabWidth = (barWidth - pad * 2) / routeCount;
  const centerOf = (index: number) => pad + tabWidth * (index + 0.5);

  const cx = useSharedValue(centerOf(state.index));
  const bump = useSharedValue(0);
  const pop = useSharedValue(1);
  const ripple = useSharedValue(1);
  const mounted = useRef(false);

  useEffect(() => {
    const target = centerOf(state.index);
    if (!mounted.current) {
      mounted.current = true;
      cx.value = target;
      return;
    }

    if (shouldReduceMotion) {
      cx.value = target;
      bump.value = 0;
      pop.value = 1;
      ripple.value = 1;
      return;
    }

    cx.value = withSpring(target, { damping: 15, stiffness: 150, mass: 0.9 });
    bump.value = withSequence(
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 9, stiffness: 160 }),
    );
    pop.value = withSequence(
      withTiming(0, { duration: 0 }),
      withSpring(1, { damping: 8, stiffness: 140 }),
    );
    ripple.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }),
    );
  }, [state.index, barWidth, shouldReduceMotion]);

  const pathProps = useAnimatedProps(() => ({
    d: buildPath(barWidth, clampX(barWidth, cx.value), NOTCH_DEPTH - bump.value * 8),
  }));

  const circleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: clampX(barWidth, cx.value) - CIRCLE / 2 },
      { translateY: -bump.value * 10 },
      { scale: 1 + bump.value * 0.06 },
    ],
  }));

  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(pop.value * 1.4, 1),
    transform: [
      { scale: 0.4 + 0.6 * pop.value },
      { rotate: `${interpolate(pop.value, [0, 1], [-70, 0])}deg` },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ripple.value) * 0.18,
    transform: [{ scale: 1 + ripple.value * 0.9 }],
  }));

  const activeRoute = state.routes[state.index];
  const activeConfig =
    TAB_CONFIGS[activeRoute.name as keyof typeof TAB_CONFIGS] ?? TAB_CONFIGS.index;
  const ActiveIcon = activeConfig.icon;
  const initialPath = buildPath(barWidth, clampX(barWidth, centerOf(state.index)), NOTCH_DEPTH);
  const bottomPosition = Math.max(insets.bottom, 12);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { bottom: bottomPosition, paddingTop: OVERHANG },
      ]}
    >
      <View style={[styles.bar, { width: barWidth }]}>
        <Svg width={barWidth} height={BAR_H} style={StyleSheet.absoluteFill}>
          <AnimatedPath
            d={initialPath}
            animatedProps={pathProps}
            fill={themeColors.bgCard}
            stroke={themeColors.borderStrong}
            strokeWidth={1.2}
          />
        </Svg>

        <View style={[styles.tabsRow, { paddingHorizontal: pad }]}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const config =
              TAB_CONFIGS[route.name as keyof typeof TAB_CONFIGS] ?? {
                label: descriptors[route.key]?.options.title ?? route.name,
                icon: Home,
                activeColor: colors.orangeDeep,
              };

            const onPress = () => {
              soundService.play('click');
              trigger('light');

              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              trigger('medium');
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            return (
              <TabItem
                key={route.key}
                center={centerOf(index)}
                cx={cx}
                label={config.label}
                focused={focused}
                icon={config.icon}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          })}
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.circleWrap,
            { backgroundColor: activeConfig.activeColor },
            circleStyle,
          ]}
        >
          <Animated.View
            style={[styles.ring, { backgroundColor: activeConfig.activeColor }, ringStyle]}
          />
          <View style={[styles.disc, {
            shadowColor: activeConfig.activeColor,
            borderColor: themeColors.bgSurfaceMuted,
          }]}>
            <Animated.View style={activeIconStyle}>
              <ActiveIcon
                color={
                  activeConfig.activeColor === colors.yellow || activeConfig.activeColor === colors.lime
                    ? themeColors.textInverse
                    : '#FFFFFF'
                }
                size={29}
                strokeWidth={2.5}
              />
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 999,
    paddingHorizontal: SIDE_MARGIN,
  },
  bar: {
    height: BAR_H,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  tabsRow: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    height: BAR_H,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  inactiveIcon: {
    position: 'absolute',
    top: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleWrap: {
    position: 'absolute',
    left: 0,
    top: CIRCLE_TOP,
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: CIRCLE / 2,
  },
  disc: {
    ...StyleSheet.absoluteFill,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgSurfaceMuted,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});
