import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20261116000001_game_modes_suspicious_and_blitz.sql'
);

test('game modes migration file exists and is non-empty', () => {
  assert.ok(existsSync(migrationPath), 'Migration 20261116000001 must exist');
});

test('game modes migration updates rooms constraint to include suspicious and blitz', () => {
  const content = readFileSync(migrationPath, 'utf8');

  assert.match(
    content,
    /ALTER\s+TABLE\s+public\.rooms\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+rooms_game_mode_check/i,
    'Must drop existing check constraint cleanly'
  );

  assert.match(
    content,
    /CHECK\s*\(\s*game_mode\s+IN\s*\(\s*'classic',\s*'survival',\s*'suspicious',\s*'blitz'\s*\)\s*\)/i,
    'Must include classic, survival, suspicious, blitz in rooms_game_mode_check'
  );
});

test('game modes migration updates create_room_with_mode_secure RPC to accept all 4 modes', () => {
  const content = readFileSync(migrationPath, 'utf8');

  assert.match(
    content,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_room_with_mode_secure/i,
    'Must replace create_room_with_mode_secure'
  );

  assert.match(
    content,
    /p_game_mode\s+NOT\s+IN\s*\(\s*'classic',\s*'survival',\s*'suspicious',\s*'blitz'\s*\)/i,
    'Must validate p_game_mode against the 4 active modes'
  );

  assert.match(
    content,
    /p_game_mode\s*=\s*'blitz'/i,
    'Must clamp round duration for blitz mode'
  );
});

test('game modes migration defines secure RPC for suspect picks and includes rollback docs', () => {
  const content = readFileSync(migrationPath, 'utf8');

  assert.match(
    content,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.submit_suspect_pick_secure/i,
    'Must define submit_suspect_pick_secure RPC'
  );

  assert.match(
    content,
    /v_player_id\s*=\s*p_suspect_id/i,
    'Must disallow self suspicion'
  );

  assert.match(
    content,
    /ROLLBACK\s+INSTRUCTIONS/i,
    'Must include rollback instructions'
  );
});
