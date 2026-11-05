import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261105221000_drawing_chain_fox_teams.sql'), 'utf8');
const client = readFileSync(resolve(process.cwd(), 'features/arcade/client.ts'), 'utf8');
const webScreen = readFileSync(resolve(process.cwd(), 'app/arcade-game.web.tsx'), 'utf8');
const nativeScreen = readFileSync(resolve(process.cwd(), 'app/arcade-game.tsx'), 'utf8');

describe('fox-team drawing game', () => {
  it('creates balanced alternating teams and requires four to eight players', () => {
    assert.match(migration, /WHEN 'drawing_chain' THEN v_min_players := 4; v_max_players := 8/);
    assert.match(migration, /v_team:=v_index%2/);
    assert.match(migration, /IF v_index<=cardinality\(v_team_a\).*v_team_a\[v_index\]/s);
    assert.match(migration, /IF v_index<=cardinality\(v_team_b\).*v_team_b\[v_index\]/s);
    assert.match(migration, /now\(\)\+interval '6 seconds'/);
  });

  it('enforces two-minute drawing turns and one-minute team guesses', () => {
    assert.match(migration, /deadline=now\(\)\+interval '120 seconds'/);
    assert.match(migration, /deadline=now\(\)\+interval '60 seconds'/);
    assert.match(migration, /Yalnızca çizen oyuncunun takım arkadaşları tahmin edebilir/);
    assert.match(migration, /'teamScores'/);
    assert.match(migration, /arcade_drawing_close_round/);
  });

  it('routes drawing game actions and timeout resolution through the new RPCs', () => {
    assert.match(client, /mode === 'drawing_chain' \? 'arcade_drawing_start_secure'/);
    assert.match(client, /mode === 'drawing_chain' \? 'arcade_drawing_action_secure'/);
    assert.match(client, /mode === 'drawing_chain' \? 'arcade_drawing_advance_secure'/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.arcade_state_secure/);
    assert.match(migration, /arcade_action_legacy_secure[\s\S]*FROM PUBLIC,anon,authenticated/);
    assert.match(migration, /arcade_advance_legacy_secure/);
  });

  it('shows team scores, live artwork, and team-only guessing on both platforms', () => {
    for (const screen of [webScreen, nativeScreen]) {
      assert.match(screen, /FoxTeamsDisplay/);
      assert.match(screen, /currentDrawing/);
      assert.match(screen, /Takım tahmini/);
      assert.match(screen, /iki takım/);
    }
  });
});
