import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261118000006_player_reporting.sql', import.meta.url), 'utf8');
const reportScreen = readFileSync(new URL('../app/report-player.tsx', import.meta.url), 'utf8');
const resultScreen = readFileSync(new URL('../app/result.tsx', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../services/supabaseAdapter.ts', import.meta.url), 'utf8');

describe('player reporting and UGC safety', () => {
  it('keeps report records private and limits submissions to the secure RPC', () => {
    assert.match(migration, /ALTER TABLE public\.player_reports ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.player_reports FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.report_player_secure\(TEXT, UUID, TEXT, TEXT\) TO authenticated/);
  });

  it('validates room membership, self-reporting, bots, categories and rate limits on the server', () => {
    for (const rule of [
      'Kendini bildiremezsin',
      'Bu odada bildirim gönderme yetkin yok',
      'Bildirilecek oyuncu bu odada bulunamadı',
      'Bot oyuncular bildirilemez',
      'Saatlik bildirim sınırına ulaştın',
    ]) assert.ok(migration.includes(rule), rule);
    assert.match(migration, /player_reports_one_pending_per_room_idx/);
  });

  it('anonymizes moderation references when an Auth account is deleted', () => {
    assert.match(migration, /anonymize_player_reports_before_auth_delete/);
    assert.match(migration, /reporter_name_snapshot = 'Silinmiş kullanıcı'/);
    assert.match(migration, /reported_name_snapshot = 'Silinmiş kullanıcı'/);
  });

  it('exposes bot identity to the client and submits reports through Supabase RPC', () => {
    assert.match(migration, /''isBot'',rp\.is_bot/);
    assert.match(adapter, /report_player_secure/);
    assert.match(reportScreen, /service\.reportPlayer\(/);
    assert.match(resultScreen, /pathname: '\/report-player'/);
    assert.match(resultScreen, /!player\.isBot/);
  });
});
