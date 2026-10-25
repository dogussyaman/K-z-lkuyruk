import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261114000001_restore_fake_answer_room_lock.sql'),
  'utf8'
);
const survivalMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261115000001_survival_mode_and_cleanup_security.sql'),
  'utf8'
);

test('fake-answer RPC locks the room before validating and inserting a submission', () => {
  assert.match(
    migration,
    /SELECT\s+\*\s+INTO\s+v_room\s+FROM\s+public\.rooms\s+WHERE\s+code\s*=\s*UPPER\(p_room_code\)\s+FOR\s+UPDATE;/i,
    'the room row lock is required to serialize concurrent submissions'
  );
  assert.match(migration, /IF v_room\.phase <> 'fake_answer' THEN/i);
  assert.match(migration, /is_blocked_current_round\s*=\s*TRUE/i);
  assert.match(migration, /IF v_trimmed IS NULL OR v_trimmed = '' OR length\(v_trimmed\) > 120 THEN/i);
  assert.match(
    migration,
    /PERFORM public\._set_room_phase\(v_room\.id,\s*'guess',\s*v_room\.round_seconds\)/i,
    'the shared guess deadline must still reset when the phase advances early'
  );
});


test('Survival migration defines server-owned lives and restricts room cleanup RPC access', () => {
  assert.match(survivalMigration, /ADD COLUMN IF NOT EXISTS game_mode TEXT/i);
  assert.match(survivalMigration, /ADD COLUMN IF NOT EXISTS lives_remaining INTEGER/i);
  assert.match(survivalMigration, /apply_survival_life_loss/i);
  assert.match(survivalMigration, /survival_finished/i);
  assert.match(survivalMigration, /create_room_with_mode_secure/i);
  assert.match(survivalMigration, /REVOKE ALL ON FUNCTION public\\.cleanup_inactive_rooms\\(\\) FROM PUBLIC, anon, authenticated/i);
  assert.match(survivalMigration, /GRANT EXECUTE ON FUNCTION public\\.cleanup_inactive_rooms\\(\\) TO service_role/i);
});
