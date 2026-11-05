import type { GameMode } from '@/types/game';

export const ARCADE_GAME_IDS = [
  'critical_signal',
  'drawing_chain',
  'kitchen_chaos',
  'pirate_cannon',
] as const satisfies readonly GameMode[];

export type ArcadeGameMode = (typeof ARCADE_GAME_IDS)[number];

export function isArcadeGameMode(value?: string | null): value is ArcadeGameMode {
  return ARCADE_GAME_IDS.includes(value as ArcadeGameMode);
}

export const SIGNAL_COLORS = [
  { id: 'red', label: 'Kırmızı', color: '#FF5E6C' },
  { id: 'blue', label: 'Mavi', color: '#48B7FF' },
  { id: 'yellow', label: 'Sarı', color: '#FFD166' },
  { id: 'green', label: 'Yeşil', color: '#55E0A3' },
] as const;

export const DRAWING_PROMPTS = [
  'Ayda piknik yapan bir tilki',
  'Yağmurdan kaçan bir korsan',
  'Kahve taşıyan bir robot',
  'Denizde yüzen bir ada',
  'Sahneye çıkan utangaç bir kedi',
  'Şemsiyesini kaybeden bir astronot',
  'Dans eden bir deniz feneri',
  'Pasta kurtaran bir köpek',
] as const;

export const KITCHEN_RECIPES = [
  { id: 'burger', name: 'Korsan Burger', emoji: '🍔', steps: ['chop', 'cook', 'plate', 'serve'] },
  { id: 'soup', name: 'Mercan Çorbası', emoji: '🍲', steps: ['chop', 'cook', 'plate', 'serve'] },
  { id: 'pizza', name: 'Fırtına Pizzası', emoji: '🍕', steps: ['chop', 'cook', 'plate', 'serve'] },
  { id: 'taco', name: 'Kızıl Taco', emoji: '🌮', steps: ['chop', 'cook', 'plate', 'serve'] },
] as const;

export const KITCHEN_ACTIONS = [
  { id: 'chop', label: 'Doğra', emoji: '🔪', color: '#7FD58B' },
  { id: 'cook', label: 'Pişir', emoji: '🔥', color: '#FF8559' },
  { id: 'plate', label: 'Tabakla', emoji: '🍽️', color: '#78B8FF' },
  { id: 'serve', label: 'Servis et', emoji: '🛎️', color: '#FFD166' },
] as const;
