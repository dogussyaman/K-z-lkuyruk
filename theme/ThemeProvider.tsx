import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { colors as darkColors } from './colors';

export type ThemeMode = 'dark' | 'light';
export type ThemeColors = Record<keyof typeof darkColors, string>;

const THEME_STORAGE_KEY = 'zarto-theme-mode';

const lightColors: ThemeColors = {
  ...darkColors,
  zartoNight: '#F6F4F1',
  zartoSurface: '#EEEAE7',
  bgDarkest: '#F6F4F1',
  bgDark: '#F0EEEA',
  bgSurface: '#FFFFFF',
  bgSurfaceAlt: '#F2EFED',
  bgSurfaceMuted: '#EAE7E5',
  bgElevated: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgCardAlt: '#F5F2EE',
  purple: '#715A93',
  purpleDeep: '#5B467F',
  purpleSoft: '#715A93',
  orange: '#AD5234',
  orangeDeep: '#A34A30',
  coral: '#AD5234',
  coralDeep: '#A34A30',
  coralSoft: '#BA6F52',
  yellow: '#8A6427',
  lime: '#527447',
  limeSoft: '#628D56',
  blue: '#39687F',
  blueSoft: '#39687F',
  success: '#277856',
  successSoft: '#277856',
  warning: '#95681D',
  danger: '#BB434B',
  dangerSoft: '#AD3A42',
  textPrimary: '#272730',
  textSecondary: '#595662',
  textMuted: '#716C79',
  textInverse: '#272730',
  border: 'rgba(39, 39, 48, 0.09)',
  borderStrong: 'rgba(39, 39, 48, 0.17)',
  borderAccent: 'rgba(173, 82, 52, 0.25)',
  overlay: 'rgba(21, 22, 29, 0.50)',
  overlayLight: 'rgba(246, 244, 241, 0.94)',
  categoryOverlayTop: 'rgba(20, 21, 29, 0.16)',
  categoryOverlayBottom: 'rgba(20, 21, 29, 0.82)',
  imageIconSurface: 'rgba(20, 21, 29, 0.48)',
  purpleGlow: 'rgba(113, 90, 147, 0.09)',
  orangeGlow: 'rgba(173, 82, 52, 0.08)',
  successSurface: 'rgba(39, 120, 86, 0.10)',
  dangerSurface: 'rgba(187, 67, 75, 0.09)',
  purpleSurface: 'rgba(113, 90, 147, 0.09)',
  orangeSurface: 'rgba(173, 82, 52, 0.09)',
  goldSurface: 'rgba(149, 104, 29, 0.11)',
  silverSurface: 'rgba(89, 86, 98, 0.08)',
};

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const userChangedMode = useRef(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((savedMode) => {
      if (mounted && !userChangedMode.current && (savedMode === 'light' || savedMode === 'dark')) {
        setModeState(savedMode);
      }
    }).catch((error: unknown) => {
      console.error('Tema tercihi okunamadı.', error);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.backgroundColor = mode === 'light' ? lightColors.bgDarkest : darkColors.bgDarkest;
      document.documentElement.style.colorScheme = mode;
    }
  }, [mode]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    userChangedMode.current = true;
    setModeState(nextMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch((error: unknown) => {
      console.error('Tema tercihi kaydedilemedi.', error);
    });
  }, []);

  const value = useMemo(
    () => ({ mode, colors: mode === 'light' ? lightColors : darkColors, setMode }),
    [mode, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}

export function useThemeStyles<T>(createStyles: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors, createStyles]);
}
