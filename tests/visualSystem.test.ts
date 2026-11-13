import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { colors } from '../theme/colors';

function relativeLuminance(hex: string): number {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test('neutral backgrounds preserve readability at default text sizes', () => {
  assert.ok(contrast(colors.textPrimary, colors.bgDarkest) >= 7);
  assert.ok(contrast(colors.textSecondary, colors.bgCard) >= 4.5);
});

test('tangerine and violet primary buttons meet regular-text contrast', () => {
  assert.ok(contrast('#FFFFFF', colors.orangeDeep) >= 4.5);
  assert.ok(contrast('#FFFFFF', colors.purpleDeep) >= 4.5);
});

test('brand icons are distinct against the ink surface without neon', () => {
  assert.ok(contrast(colors.orange, colors.bgDarkest) >= 4.5);
  assert.ok(contrast(colors.purpleSoft, colors.bgDarkest) >= 4.5);
});

test('bottom tabs use a single selected hue while retaining unique icons', () => {
  const content = readFileSync(new URL('../components/navigation/LiquidGlassTabBar.tsx', import.meta.url), 'utf8');
  const configs = content.match(/activeColor: colors\.orangeDeep/g) ?? [];
  assert.equal(configs.length, 6); // 5 routes + the unknown route fallback
});

test('shared screens keep mode identities without changing full-page surface hues', () => {
  const content = readFileSync(new URL('../components/ui/Screen.tsx', import.meta.url), 'utf8');
  assert.match(content, /const background = themeColors\.bgDarkest/);
  assert.match(content, /modeTheme\.heroEmoji/);
});
