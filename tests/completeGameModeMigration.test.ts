import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const completePath = resolve(process.cwd(), 'supabase/migrations/20261118000001_complete_game_mode_universe.sql');
const statePath = resolve(process.cwd(), 'supabase/migrations/20261118000002_mode_state_and_double_trap.sql');
const completeSql = readFileSync(completePath, 'utf8');
const stateSql = readFileSync(statePath, 'utf8');

const modeIds = [
  'classic', 'survival', 'suspicious', 'blitz', 'team_battle',
  'secret_missions', 'double_trap', 'golden_question', 'detective_fox',
];

describe('complete game mode migrations', () => {
  it('keeps every playable mode in the final rooms constraint', () => {
    for (const mode of modeIds) assert.match(completeSql, new RegExp(`'${mode}'`));
  });

  it('keeps privileged functions locked down with explicit search_path', () => {
    assert.match(completeSql, /SECURITY DEFINER SET search_path = pg_catalog, public/g);
    assert.match(completeSql, /REVOKE ALL ON FUNCTION public\.start_game_secure/);
    assert.match(completeSql, /REVOKE ALL ON FUNCTION public\.use_ability_secure/);
    assert.match(stateSql, /SECURITY DEFINER SET search_path = pg_catalog, public/g);
    assert.match(stateSql, /REVOKE ALL ON FUNCTION public\.get_room_state_secure/);
  });

  it('contains the core server-authoritative mode mechanics', () => {
    assert.match(completeSql, /picker\.team_id IS DISTINCT FROM v_player\.team_id/);
    assert.match(completeSql, /v_room\.game_mode='golden_question'/);
    assert.match(completeSql, /v_room\.game_mode='secret_missions'/);
    assert.match(completeSql, /v_room\.game_mode='detective_fox'/);
    assert.match(stateSql, /v_room\.game_mode='double_trap'/);
    assert.match(stateSql, /'teamScores'/);
    assert.match(stateSql, /'modeMeta'/);
  });
});
