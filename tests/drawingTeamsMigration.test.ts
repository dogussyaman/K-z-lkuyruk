import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261105185054_drawing_team_rounds.sql'), 'utf8');
const lockMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261105190456_drawing_consistent_lock_order.sql'), 'utf8');
const client = readFileSync(resolve(process.cwd(), 'features/arcade/client.ts'), 'utf8');
const drawingHook = readFileSync(resolve(process.cwd(), 'features/arcade/useTeamDrawing.ts'), 'utf8');
const webScreen = readFileSync(resolve(process.cwd(), 'app/arcade-game.web.tsx'), 'utf8');
const nativeScreen = readFileSync(resolve(process.cwd(), 'app/arcade-game.tsx'), 'utf8');

describe('fox-team drawing game', () => {
  it('randomly assigns balanced teams and requires four to eight even-numbered players', () => {
    assert.match(migration, /WHEN ''drawing_chain'' THEN v_min_players := 4; v_max_players := 8; v_round_seconds := 120/);
    assert.match(migration, /v_count<4 OR v_count%2<>0/);
    assert.match(migration, /ORDER BY random\(\)/);
    assert.match(migration, /v_private:=v_private\|\|jsonb_build_object\(v_player\.player_id::text,v_i%2\)/);
    assert.match(migration, /'turnOrder',v_sequence/);
  });

  it('enforces two-minute drawing turns and one-minute team guesses', () => {
    assert.match(migration, /deadline=now\(\)\+interval '120 seconds'/);
    assert.match(migration, /deadline=now\(\)\+interval '60 seconds'/);
    assert.match(migration, /Yalnızca çizenin takım arkadaşları tahmin edebilir/);
    assert.match(migration, /'teamScores'/);
    assert.match(migration, /'answer',secret_state->>'answer'/);
  });

  it('uses the existing arcade RPCs for drawing state, actions, and timer transitions', () => {
    assert.match(client, /rpc\('arcade_start_secure'/);
    assert.match(client, /rpc\('arcade_action_secure'/);
    assert.match(client, /rpc\('arcade_advance_secure'/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.arcade_state_secure/);
    assert.match(migration, /public_state->>'rulesVersion'='2'/);
    assert.match(migration, /PERFORM kizilkuyruk_private\.drawing_team_action\(v_room,p_payload\)/);
    assert.match(lockMigration, /Draft writes lock room, then session/);
    assert.doesNotMatch(client, /arcade_drawing_(start|action|advance)_secure/);
  });

  it('shows team scores, live artwork, and team-only guessing on both platforms', () => {
    for (const screen of [webScreen, nativeScreen]) {
      assert.match(screen, /DrawingTeams/);
      assert.match(screen, /useTeamDrawing/);
      assert.match(screen, /public\.rulesVersion===2/);
      assert.match(screen, /action:'guess'/);
    }
    assert.match(drawingHook, /action:'draft'/);
  });
});
