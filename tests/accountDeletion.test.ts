import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const deletionSql = readFileSync(new URL('../supabase/migrations/20261118000005_account_deletion.sql', import.meta.url), 'utf8');
const edgeFunction = readFileSync(new URL('../supabase/functions/delete-account/index.ts', import.meta.url), 'utf8');
const deletionScreen = readFileSync(new URL('../app/account-deletion.tsx', import.meta.url), 'utf8');
const profileScreen = readFileSync(new URL('../app/(tabs)/profil.tsx', import.meta.url), 'utf8');
const supabaseConfig = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

describe('account deletion release safeguards', () => {
  it('restricts the cleanup RPC to the service role', () => {
    assert.match(deletionSql, /REVOKE ALL ON FUNCTION public\.delete_account_data_secure\(UUID\) FROM PUBLIC, anon, authenticated/i);
    assert.match(deletionSql, /GRANT EXECUTE ON FUNCTION public\.delete_account_data_secure\(UUID\) TO service_role/i);
  });

  it('refuses deletion while the user is an active room participant before deleting personal data', () => {
    const guard = deletionSql.indexOf("Aktif oyunlardan ayrılmadan hesabını silemezsin");
    const firstDelete = deletionSql.indexOf('DELETE FROM public.round_picks');
    assert.ok(guard > 0 && firstDelete > guard, 'active-room guard must run before destructive cleanup');
  });

  it('cleans public, social, round and private-mode data', () => {
    for (const table of [
      'round_picks', 'round_results', 'round_choices', 'round_fake_answers',
      'round_answers', 'round_suspect_picks', 'ability_actions', 'nudges',
      'gizli_tilki_votes', 'forest_treasure_sessions', 'gizli_tilki_sessions',
      'room_game_stats', 'room_invites', 'question_reservations',
      'question_seen_history', 'room_join_rate_limits', 'preset_character_claims',
      'friend_requests', 'friendships', 'user_blocks', 'user_stats', 'profiles',
      'room_players',
    ]) {
      assert.match(deletionSql, new RegExp('DELETE FROM (public\\.)?' + table + '\\b'), table + ' must be cleaned');
    }
    assert.match(deletionSql, /DELETE FROM kizilkuyruk_private\.sessions/);
    assert.match(deletionSql, /deceived_by_author_id = NULL/);
  });

  it('verifies the caller, removes avatar files, then deletes the Auth identity', () => {
    assert.match(edgeFunction, /auth\.getUser\(\)/);
    assert.match(edgeFunction, /delete_account_data_secure/);
    const removeIndex = edgeFunction.indexOf('.remove(avatarPaths)');
    const deleteIndex = edgeFunction.indexOf('admin.auth.admin.deleteUser');
    assert.ok(removeIndex > 0 && deleteIndex > removeIndex, 'avatar removal must precede Auth deletion');
    assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(supabaseConfig, /\[functions\.delete-account\][\s\S]*verify_jwt = true/);
  });

  it('exposes the same deletion flow from the profile and public request route', () => {
    assert.match(profileScreen, /router\.push\('\/account-deletion'\)/);
    assert.match(deletionScreen, /service\.deleteAccount\(\)/);
    assert.match(deletionScreen, /Bu işlem geri alınamaz/);
  });
});
