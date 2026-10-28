import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startBotPhase, type TestBot } from '../services/botAutomation';

const bots: TestBot[] = [
  { player_id: 'bot-a', personality: 'balanced' },
  { player_id: 'bot-b', personality: 'scholar' },
];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness() {
  let id = 0;
  const timers = new Map<number, () => void>();
  const turns: string[] = [];
  const errors: unknown[] = [];
  const options = {
    loadBots: async () => bots,
    takeTurn: async (bot: string) => { turns.push(bot); },
    delayFor: () => 100,
    isExpired: () => false,
    onError: (error: unknown) => { errors.push(error); },
    schedule: (callback: () => void) => {
      timers.set(++id, callback);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (timer: ReturnType<typeof setTimeout>) => { timers.delete(timer as unknown as number); },
  };
  const run = async () => {
    const batch = [...timers.values()];
    timers.clear();
    batch.forEach(callback => callback());
    await flush();
  };
  return { options, timers, turns, errors, run };
}

test('effect cleanup and replay still schedules every bot exactly once', async () => {
  const h = harness();
  const first = startBotPhase(h.options);
  await flush();
  assert.equal(h.timers.size, 2);
  first();
  const second = startBotPhase(h.options);
  await flush();
  await h.run();
  assert.deepEqual(h.turns, ['bot-a', 'bot-b']);
  second();
});

test('a late bot-list response from an old phase cannot schedule turns', async () => {
  const h = harness();
  let resolve!: (value: TestBot[]) => void;
  const stop = startBotPhase({ ...h.options, loadBots: () => new Promise<TestBot[]>(r => { resolve = r; }) });
  stop();
  resolve(bots);
  await flush();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.turns, []);
});

test('a temporary list failure is retried instead of silencing the whole phase', async () => {
  const h = harness();
  let attempts = 0;
  const stop = startBotPhase({ ...h.options, loadBots: async () => {
    if (++attempts === 1) throw new Error('temporary network error');
    return bots;
  } });
  await flush();
  await h.run();
  await h.run();
  assert.equal(attempts, 2);
  assert.deepEqual(h.turns, ['bot-a', 'bot-b']);
  stop();
});

test('a failed turn retries without replaying successful bots', async () => {
  const h = harness();
  let failed = false;
  const stop = startBotPhase({ ...h.options, takeTurn: async (bot) => {
    if (bot === 'bot-a' && !failed) { failed = true; throw new Error('network'); }
    h.turns.push(bot);
  } });
  await flush();
  await h.run();
  await h.run();
  assert.deepEqual(h.turns, ['bot-b', 'bot-a']);
  stop();
});

test('expired phases and cancelled retries never submit a stale turn', async () => {
  const h = harness();
  let expired = false;
  const stop = startBotPhase({ ...h.options, isExpired: () => expired });
  await flush();
  expired = true;
  await h.run();
  assert.deepEqual(h.turns, []);
  stop();
  assert.equal(h.timers.size, 0);
});

test('persistent failures are bounded and reported', async () => {
  const h = harness();
  let attempts = 0;
  const stop = startBotPhase({ ...h.options, loadBots: async () => {
    attempts++;
    throw new Error('unavailable');
  } });
  await flush();
  await h.run();
  await h.run();
  assert.equal(attempts, 3);
  assert.equal(h.errors.length, 1);
  assert.equal(h.timers.size, 0);
  stop();
});
