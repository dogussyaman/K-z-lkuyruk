import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goBackOrReplace } from '../lib/backNavigation';

test('back preserves the previous screen when navigation history exists', () => {
  const calls: string[] = [];
  goBackOrReplace({ canGoBack: () => true, back: () => { calls.push('back'); }, replace: (path: string) => { calls.push(path); } }, '/(tabs)');
  assert.deepEqual(calls, ['back']);
});

test('room creation has a working exit after a direct link or reload', () => {
  for (const destination of ['/(tabs)', '/game-modes']) {
    const calls: string[] = [];
    goBackOrReplace({ canGoBack: () => false, back: () => { calls.push('back'); }, replace: (path: string) => { calls.push(path); } }, destination);
    assert.deepEqual(calls, [destination]);
  }
});
