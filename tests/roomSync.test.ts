import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameState } from '../types/game';
import { getLiveWaitingDestination, selectRoomSnapshot, startRoomSync } from '../services/roomSync';

function state(overrides: Partial<GameState> = {}): GameState {
  return { config: { code: 'ROOM1' }, phase: 'fake_answer', stateVersion: 5,
    phaseDeadlineAt: 1000, pausedAt: null,
    progress: { submittedCount: 1, totalCount: 3, completed: false, submissionStatus: { human: true, bot1: false, bot2: false } },
    ...overrides } as GameState;
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness(initial = state()) {
  let snapshot = initial;
  let tick = () => {};
  let advances = 0;
  const applied: (GameState | null)[] = [];
  const errors: unknown[] = [];
  const options = {
    readState: async () => snapshot,
    applyState: (value: GameState | null) => { applied.push(value); },
    advanceExpired: async () => { advances++; snapshot = state({ phase: 'guess', phaseDeadlineAt: 10000, stateVersion: 6, progress: { submittedCount: 0, totalCount: 3, completed: false, submissionStatus: { human: false, bot1: false, bot2: false } } }); },
    now: () => 2000,
    onError: (error: unknown) => { errors.push(error); },
    schedule: (callback: () => void) => { tick = callback; return 1 as unknown as ReturnType<typeof setInterval>; },
    cancel: () => { tick = () => {}; },
  };
  return { options, applied, errors, tick: async () => { tick(); await flush(); }, advances: () => advances };
}

test('a waiting host with one answer and two silent bots leaves an expired bluff phase', async () => {
  const h = harness();
  const stop = startRoomSync(h.options);
  await flush();
  assert.equal(h.advances(), 1);
  assert.equal(h.applied[0]?.progress?.submittedCount, 1);
  assert.equal(h.applied.at(-1)?.phase, 'guess');
  assert.equal(getLiveWaitingDestination(h.applied.at(-1)!, 'human'), '/question');
  stop();
});

test('a fresh server deadline wins over a stale expired client deadline', async () => {
  const h = harness(state({ phaseDeadlineAt: 10000 }));
  const stop = startRoomSync(h.options);
  await flush();
  assert.equal(h.advances(), 0);
  assert.equal(h.applied.length, 1);
  stop();
});

test('paused rooms and non-timed phases never advance', async () => {
  for (const snapshot of [state({ pausedAt: 500 }), state({ phase: 'scoreboard' }), state({ phaseDeadlineAt: null })]) {
    const h = harness(snapshot);
    const stop = startRoomSync(h.options);
    await flush();
    assert.equal(h.advances(), 0);
    stop();
  }
});

test('a network failure is retried on the next tick', async () => {
  const h = harness();
  let calls = 0;
  const stop = startRoomSync({ ...h.options, readState: async () => {
    if (++calls === 1) throw new Error('offline');
    return state();
  } });
  await flush();
  assert.equal(h.errors.length, 1);
  await h.tick();
  assert.equal(h.advances(), 1);
  stop();
});

test('polls cannot overlap and an old room response cannot update a new room', async () => {
  const h = harness();
  let resolve!: (value: GameState) => void;
  let reads = 0;
  const stop = startRoomSync({ ...h.options, readState: () => {
    reads++;
    return new Promise<GameState>(r => { resolve = r; });
  } });
  await h.tick();
  await h.tick();
  assert.equal(reads, 1);
  stop();
  resolve(state());
  await flush();
  assert.deepEqual(h.applied, []);
  assert.equal(h.advances(), 0);
});

test('a newly recorded answer with the same room version refreshes the counter', () => {
  const previous = state({ progress: { submittedCount: 0, totalCount: 3, completed: false, submissionStatus: { human: false } } });
  const next = state();
  assert.equal(selectRoomSnapshot(previous, next), next);
  assert.equal(getLiveWaitingDestination(next, 'human'), null);
});

test('version comparisons apply only within the same room', () => {
  const previous = state({ stateVersion: 90 });
  const older = state({ stateVersion: 1 });
  assert.equal(selectRoomSnapshot(previous, older), previous);
  const different = { ...older, config: { ...older.config, code: 'ROOM2' } };
  assert.equal(selectRoomSnapshot(previous, different), different);
});

test('waiting routes use actual server submission status for each phase', () => {
  assert.equal(getLiveWaitingDestination(state({ phase: 'guess' }), 'bot1'), '/question');
  assert.equal(getLiveWaitingDestination(state({ phase: 'guess' }), 'human'), null);
  assert.equal(getLiveWaitingDestination(state({ phase: 'reveal' }), 'human'), '/result');
  assert.equal(getLiveWaitingDestination(state({ phase: 'game_over' }), 'human'), '/game-over');
});
