import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DemoGameService } from '../services/demoAdapter';
import { MATCH_STARTING_CREDITS } from '../features/game/credits';

describe('classic bluff: saved abilities, ready and awards', () => {
  test('initial credit is optional; using a block requires a deliberate target', async () => {
    const host = new DemoGameService();
    await host.connect();
    const room = await host.createRoom({
      hostName: 'Test', avatarKey: 'fox', totalRounds: 1,
      roundSeconds: 30, categories: ['genel-kultur'], gameMode: 'classic',
    });
    await host.startGame(room.code);
    const initial = await host.getRoomState(room.code);
    assert.equal(initial?.players[room.playerId].credits, MATCH_STARTING_CREDITS);
    assert.equal(initial?.phase, 'ability_select');

    const screen = readFileSync(new URL('../app/ability-select.tsx', import.meta.url), 'utf8');
    assert.ok(!screen.includes('setTargetId(defaultTargetId)'));
    assert.match(screen, /setTargetId\(null\).*Never preselect/s);
    assert.match(screen, /Krediyi Sakla/);
    await host.confirmAbilitySelection(room.code);
    const after = await host.getRoomState(room.code);
    assert.equal(after?.players[room.playerId].credits, MATCH_STARTING_CREDITS);
  });

  test('ready mark is idempotent, and match titles use every resolved round', async () => {
    const host = new DemoGameService();
    await host.connect();
    const room = await host.createRoom({
      hostName: 'Test', avatarKey: 'fox', totalRounds: 1,
      roundSeconds: 30, categories: ['genel-kultur'], gameMode: 'classic',
    });
    await host.startGame(room.code);
    await host.advancePhase(room.code);
    await host.submitFakeAnswer(room.code, 'Bilinmeyen bir cevap');
    const state = await host.getRoomState(room.code);
    assert.equal(state?.phase, 'guess');
    const correct = state?.choices.find((choice) => choice.isCorrect);
    assert.ok(correct);
    await host.submitPick(room.code, correct.choiceIndex);
    const reveal = await host.getRoomState(room.code);
    assert.equal(reveal?.phase, 'reveal');
    await host.advancePhase(room.code);
    const before = await host.getRoundReady(room.code);
    assert.equal(before.isReady, false);
    const ready = await host.markRoundReady(room.code);
    assert.equal(ready.isReady, true);
    const again = await host.markRoundReady(room.code);
    assert.equal(again.readyCount, ready.readyCount);
    await host.advancePhase(room.code);
    const awards = await host.getMatchTitleStats(room.code);
    assert.ok(awards.some((entry) => entry.playerId === room.playerId && entry.rounds === 1));
  });
});
