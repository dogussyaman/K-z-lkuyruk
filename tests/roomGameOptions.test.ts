import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { ARCADE_GAME_IDS } from '../features/arcade/catalog';
import { CLASSIC_VARIANTS, GAME_MODES } from '../features/game/modes';

const source = readFileSync(resolve(process.cwd(), 'app/create-room.tsx'), 'utf8');

test('room creation lists the four implemented arcade games as two-column cards', () => {
  assert.deepEqual(ARCADE_GAME_IDS, [
    'critical_signal',
    'drawing_chain',
    'kitchen_chaos',
    'pirate_cannon',
  ]);
  assert.equal(ARCADE_GAME_IDS.length, 4);
  for (const id of ARCADE_GAME_IDS) {
    const mode = GAME_MODES.find((candidate) => candidate.id === id);
    assert.ok(mode, `${id} must have a game mode definition`);
    assert.equal(mode.status, 'active', `${id} must be playable`);
    assert.ok(existsSync(resolve(process.cwd(), `assets/game-modes/${mode.illustrationKey}.jpg`)), `${id} must have a card image`);
  }
  for (const mode of CLASSIC_VARIANTS.filter((candidate) => candidate.status === 'active')) {
    assert.ok(existsSync(resolve(process.cwd(), `assets/game-modes/${mode.illustrationKey}.jpg`)), `${mode.id} must have a card image`);
  }
  assert.match(source, /source=\{gameModeImages\[variant\.illustrationKey\]\}/);
  assert.match(source, /source=\{gameModeImages\[mode\.illustrationKey\]\}/);
  assert.match(source, /<ImageBackground/);
  assert.match(source, /ARCADE_GAME_IDS\.map/);
  assert.match(source, /pathname: '\/mode-create-room', params: \{ mode: mode\.id \}/);
  assert.match(source, /flexDirection: 'row',\s+flexWrap: 'wrap'/);
});
