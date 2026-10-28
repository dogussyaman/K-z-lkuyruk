import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';
import { resolve } from 'node:path';

const botControls = readFileSync(resolve(process.cwd(), 'components/LobbyBotControls.tsx'), 'utf8');

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261026100000_human_like_test_bots.sql'),
  'utf8'
);

describe('human-like test bot migration', () => {
  test('marks bots explicitly and keeps personalities constrained', () => {
    assert.match(migration, /is_bot BOOLEAN NOT NULL DEFAULT FALSE/i);
    assert.match(migration, /bot_personality TEXT/i);
    assert.match(migration, /'scholar', 'balanced', 'trickster'/i);
  });

  test('keeps bot lifecycle host-controlled and lobby-only', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.add_test_bot_secure/i);
    assert.match(migration, /v_room\.host_id <> auth\.uid\(\)/i);
    assert.match(migration, /v_room\.phase <> 'lobby'/i);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.add_test_bot_secure/i);
  });

  test('supports automated ability, bluff and guess phases', () => {
    assert.match(migration, /v_room\.phase = 'ability_select'/i);
    assert.match(migration, /v_room\.phase = 'fake_answer'/i);
    assert.match(migration, /v_room\.phase = 'guess'/i);
    assert.match(migration, /resolve_round_authoritative/i);
  });

  test('prevents bots from polluting persistent user statistics', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\._skip_bot_room_game_stats/i);
    assert.match(migration, /rp\.is_bot/i);
    assert.match(migration, /CREATE TRIGGER skip_bot_room_game_stats/i);
  });
  test('keeps bot availability aligned with supported mode engines', () => {
    assert.match(migration, /v_room\.game_mode IN \('gizli_tilki', 'double_trap'\)/i);
    assert.match(migration, /v_room\.game_mode IN \('team_battle', 'orman_hazinesi'\)/i);
    assert.match(botControls, /UNSUPPORTED_BOT_MODES = new Set\(\['gizli_tilki', 'double_trap'\]\)/i);
  });

  test('does not assign duplicate migration version identifiers', () => {
    const dir = resolve(process.cwd(), 'supabase/migrations');
    const files = readdirSync(dir).filter((name) => name.endsWith('.sql'));
    const versions = new Map<string, string[]>();
    for (const file of files) {
      const version = file.match(/^(\\d+)_/)?.[1];
      if (!version) continue;
      versions.set(version, [...(versions.get(version) ?? []), file]);
    }
    const duplicates = [...versions.entries()].filter(([, names]) => names.length > 1);
    assert.deepEqual(duplicates, [], `Migration versions must be unique: ${JSON.stringify(duplicates)}`);
  });
});
