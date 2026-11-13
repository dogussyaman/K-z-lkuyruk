/**
 * Quiet Fox palette
 * One visual hierarchy: ink surfaces, warm tangerine actions, muted violet
 * for secondary focus. Gold, green and red are reserved for meaning.
 *
 * Keep these token names stable: screens and game modes share the same API.
 */
export const colors = {
  // Brand: restrained warmth over neutral graphite
  zartoNight: '#14151D',
  zartoSurface: '#24232E',
  zartoPurple: '#9783BB',
  zartoOrange: '#D87B57',
  zartoYellow: '#E6BC78',
  zartoLime: '#A9C799',
  zartoCream: '#F4F0EA',

  // Backgrounds: neutral foundation prevents a rainbow of competing cards
  bgDarkest: '#14151D',
  bgDark: '#1A1B24',
  bgSurface: '#23232E',
  bgSurfaceAlt: '#2B2A37',
  bgSurfaceMuted: '#20212B',
  bgElevated: '#302F3D',
  bgCard: '#23232E',
  bgCardAlt: '#292936',

  // Secondary focus accent, not a second primary CTA
  purple: '#9783BB',
  purpleDeep: '#79629A',
  purpleSoft: '#B0A0CC',
  purpleGlow: 'rgba(151, 131, 187, 0.12)',

  // Single primary call-to-action. Deep tone stays legible with white text.
  orange: '#D87B57',
  orangeDeep: '#B95A3D',
  orangeGlow: 'rgba(216, 123, 87, 0.12)',
  coral: '#D87B57',
  coralDeep: '#B95A3D',
  coralSoft: '#E7A186',

  // Semantic / occasional celebration accents
  yellow: '#E6BC78',
  lime: '#A9C799',
  limeSoft: '#C3D6B7',
  blue: '#86A8BE',
  blueDeep: '#547C9A',
  blueSoft: '#A2C2D6',
  blueGlow: 'rgba(134, 168, 190, 0.12)',

  success: '#6EB79C',
  successSoft: '#92D0B4',
  successGlow: 'rgba(110, 183, 156, 0.12)',
  successSurface: 'rgba(110, 183, 156, 0.11)',
  warning: '#E6BC78',
  warningGlow: 'rgba(230, 188, 120, 0.12)',
  danger: '#D16F74',
  dangerSoft: '#EB9A9D',
  dangerGlow: 'rgba(209, 111, 116, 0.12)',
  dangerSurface: 'rgba(209, 111, 116, 0.11)',
  purpleSurface: 'rgba(151, 131, 187, 0.11)',
  orangeSurface: 'rgba(216, 123, 87, 0.11)',
  goldSurface: 'rgba(230, 188, 120, 0.12)',
  silverSurface: 'rgba(174, 174, 186, 0.10)',
  categoryOverlayTop: 'rgba(20, 21, 29, 0.18)',
  categoryOverlayBottom: 'rgba(20, 21, 29, 0.84)',
  imageIconSurface: 'rgba(20, 21, 29, 0.54)',

  textPrimary: '#F5F2EE',
  textSecondary: '#BCB8C5',
  textMuted: '#9691A2',
  textOnAccent: '#FFFFFF',
  textInverse: '#14151D',

  border: 'rgba(245, 242, 238, 0.09)',
  borderStrong: 'rgba(245, 242, 238, 0.16)',
  borderAccent: 'rgba(216, 123, 87, 0.33)',
  overlay: 'rgba(15, 16, 23, 0.83)',
  overlayLight: 'rgba(35, 35, 46, 0.78)',
} as const;

export type ColorKey = keyof typeof colors;
