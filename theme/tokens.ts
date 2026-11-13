import { colors } from './colors';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

export type SpacingKey = keyof typeof spacing;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  '2xl': 28,
  pill: 999,
  full: 999,
} as const;

export const typography = {
  fontFamily: 'Poppins-Regular',
  fontFamilyMedium: 'Poppins-Medium',
  fontFamilySemiBold: 'Poppins-SemiBold',
  fontFamilyBold: 'Poppins-Bold',

  h1: { fontSize: 34, lineHeight: 40, fontFamily: 'Poppins-Bold' as const },
  h2: { fontSize: 28, lineHeight: 34, fontFamily: 'Poppins-Bold' as const },
  h3: { fontSize: 22, lineHeight: 28, fontFamily: 'Poppins-SemiBold' as const },
  h4: { fontSize: 18, lineHeight: 24, fontFamily: 'Poppins-SemiBold' as const },
  body: { fontSize: 16, lineHeight: 24, fontFamily: 'Poppins-Regular' as const },
  bodyMedium: { fontSize: 16, lineHeight: 24, fontFamily: 'Poppins-Medium' as const },
  small: { fontSize: 13, lineHeight: 18, fontFamily: 'Poppins-Regular' as const },
  caption: { fontSize: 11, lineHeight: 16, fontFamily: 'Poppins-Medium' as const },
  big: { fontSize: 46, lineHeight: 52, fontFamily: 'Poppins-Bold' as const },
  mega: { fontSize: 62, lineHeight: 68, fontFamily: 'Poppins-Bold' as const },
} as const;

export const layout = {
  screenPadding: 20,
  cardPadding: 18,
  maxContentWidth: 520,
  tabBarHeight: 70,
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 11,
    elevation: 2,
  },
  glow: {
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 9,
    elevation: 3,
  },
  glowOrange: {
    shadowColor: colors.orange,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  glowLime: {
    shadowColor: colors.lime,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 2,
  },
  glowBlue: {
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  arcade3D: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    elevation: 3,
  },
} as const;
