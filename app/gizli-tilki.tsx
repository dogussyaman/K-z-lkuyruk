import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Clock3, ShieldAlert, Wrench, RadioTower, Zap, Users, RefreshCw } from 'lucide-react-native';
import { Screen } from '@/components/ui';
import { useGameStore } from '@/store/gameStore';
import { ensureSupabase } from '@/lib/supabase/client';

type PlayerRow = { player_id: string; name: string; avatar_key?: string; is_ready?: boolean; team_id?: string | null };
type ModeState = {
  phase: string; operation_round: number; resources: { energy: number; parts: number; trust: number };
  selected_operation?: string | null; proposed_team?: string[]; last_report?: { operation?: string; success?: boolean; message?: string; resources?: { energy: number; parts: number; trust: number }; suspect_votes?: Record<string, number> } | null;
  successful_operations: number; failed_operations: number; winner?: string | null; phase_deadline_at?: string | null; state_version?: number;
  my_role?: { role_name: string; loyalty: string; private_clue: string } | null; players: PlayerRow[];
  my_action_submitted?: boolean; my_team_vote_submitted?: boolean;
};

const OPERATIONS = [
  { id: 'power_relay', title: 'Güç Rölesi', detail: 'Enerji hattını yeniden devreye al.', cost: '1 enerji', icon: Zap },
  { id: 'surveillance', title: 'Gözetim Ağı', detail: 'Kör noktaları kapat, sabotaj izlerini ara.', cost: '1 parça', icon: RadioTower },
  { id: 'vault', title: 'Kasa Operasyonu', detail: 'Güvenlik katmanlarını aş.', cost: '1 güven', icon: ShieldAlert },
  { id: 'network', title: 'Ağ Sızması', detail: 'Karşı ekibin sistemlerine eriş.', cost: 'Yüksek risk', icon: RadioTower },
  { id: 'supply_run', title: 'Malzeme Sevkiyatı', detail: 'Tükenen kaynakları kurtarmaya çalış.', cost: 'Riskli', icon: Wrench },
] as const;

export default function GizliTilkiScreen() {
  const { roomCode, currentPlayer, roomState } = useGameStore();
  const [state, setState] = useState<ModeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [selectedSuspect, setSelectedSuspect] = useState<string | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const isHost = Boolean(currentPlayer?.id && roomState?.players[currentPlayer.id]?.isHost);
  const deadline = state?.phase_deadline_at ? new Date(state.phase_deadline_at).getTime() : null;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  useEffect(() => {
    if (state?.players?.length && selectedTeamIds.length === 0) {
      setSelectedTeamIds(state.players.slice(0, Math.min(3, state.players.length)).map((p) => p.player_id));
    }
  }, [state?.players, selectedTeamIds.length]);

  const refresh = useCallback(async () => {
    if (!roomCode) return;
    const { data, error: rpcError } = await ensureSupabase().rpc('gizli_tilki_get_state', { p_room_code: roomCode });
    if (rpcError) throw rpcError;
    setState(data as ModeState);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) { router.replace('/game-modes'); return; }
    let mounted = true;
    const load = async () => {
      try {
        const { data, error: rpcError } = await ensureSupabase().rpc('gizli_tilki_get_state', { p_room_code: roomCode });
        if (rpcError) throw rpcError;
        if (mounted) setState(data as ModeState);
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Operasyon durumu alınamadı.');
      }
    };
    void load();
    const poll = setInterval(() => { void load(); setNow(Date.now()); }, 2500);
    return () => { mounted = false; clearInterval(poll); };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !isHost || !state || !deadline || deadline > now || busy) return;
    if (!['briefing', 'operation_select', 'secret_action', 'debrief', 'team_vote'].includes(state.phase)) return;
    let cancelled = false;
    setBusy(true);
    ensureSupabase().rpc('gizli_tilki_advance', { p_room_code: roomCode })
      .then(({ error: rpcError }) => {
        if (rpcError) throw rpcError;
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Aşama ilerletilemedi.'); })
      .finally(() => { if (!cancelled) { setBusy(false); void refresh().catch(() => undefined); } });
    return () => { cancelled = true; };
  }, [roomCode, isHost, state?.phase, deadline, now, busy, refresh]);

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await fn(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.'); }
    finally { setBusy(false); }
  };

  const chooseOperation = (operation: string) => {
    if (!roomCode || !state) return;
    const team = selectedTeamIds;
    void act(async () => {
      if (team.length < 2 || team.length > 5) throw new Error('Operasyon ekibi 2–5 oyuncu olmalı.');
      const { error: rpcError } = await ensureSupabase().rpc('gizli_tilki_choose_operation', {
        p_room_code: roomCode, p_operation: operation, p_team_player_ids: team,
      });
      if (rpcError) throw rpcError;
    });
  };

  const voteTeam = (approve: boolean) => void act(async () => {
    const { error: rpcError } = await ensureSupabase().rpc('gizli_tilki_vote_team', { p_room_code: roomCode, p_approve: approve });
    if (rpcError) throw rpcError;
  });

  const submitAction = (action: string) => void act(async () => {
    const { error: rpcError } = await ensureSupabase().rpc('gizli_tilki_submit_action', { p_room_code: roomCode, p_action: action });
    if (rpcError) throw rpcError;
  });

  const voteSuspect = () => {
    if (!selectedSuspect) return;
    void act(async () => {
      const { error: rpcError } = await ensureSupabase().rpc('gizli_tilki_vote_suspect', { p_room_code: roomCode, p_suspect_player_id: selectedSuspect });
      if (rpcError) throw rpcError;
    });
  };

  if (!state) return <Screen><View style={styles.center}><ActivityIndicator color="#FF7652" /><Text style={styles.muted}>Operasyon merkezi bağlanıyor…</Text>{error ? <Text style={styles.error}>{error}</Text> : null}</View></Screen>;

  const roleLabel = state.my_role?.role_name === 'saboteur' ? 'GİZLİ SABOTAJCI' :
    state.my_role?.role_name === 'engineer' ? 'MÜHENDİS' :
    state.my_role?.role_name === 'scout' ? 'İSTİHBARATÇI' : state.my_role?.role_name === 'operator' ? 'OPERATÖR' : 'ROL BEKLENİYOR';
  const canChoose = isHost || state.my_role?.role_name === 'operator';
  const alreadyActed = Boolean(state.my_action_submitted);
  const alreadyVoted = Boolean(state.my_team_vote_submitted);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Pressable style={styles.back} onPress={() => router.replace('/lobby')}><ChevronLeft color="#FFF" size={21} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.eyebrow}>KIZILKUYRUK // GİZLİ DOSYA</Text><Text style={styles.title}>Operasyon Merkezi</Text></View>
          <View style={styles.clock}><Clock3 color="#FF7652" size={15} /><Text style={styles.clockText}>{remaining === null ? '—' : `${remaining}s`}</Text></View>
        </View>

        <View style={styles.roleCard}>
          <View style={styles.roleTop}><Text style={styles.label}>GİZLİ KİMLİĞİN</Text><Text style={[styles.role, state.my_role?.loyalty === 'saboteurs' && { color: '#FF7652' }]}>{roleLabel}</Text></View>
          <Text style={styles.clue}>{state.my_role?.private_clue ?? 'Oyun sahibi operasyonu başlatınca rolün gizlice atanacak.'}</Text>
          <Text style={styles.room}>ODA {roomCode ?? '—'} · TUR {Math.min(state.operation_round + 1, 5)}/5</Text>
        </View>

        <View style={styles.resources}>
          {(['energy', 'parts', 'trust'] as const).map((key) => <View key={key} style={styles.resource}><Text style={styles.resourceValue}>{state.resources?.[key] ?? 0}</Text><Text style={styles.resourceName}>{key === 'energy' ? 'ENERJİ' : key === 'parts' ? 'PARÇA' : 'GÜVEN'}</Text></View>)}
        </View>

        <View style={styles.scoreLine}><Text style={styles.scoreText}>Başarılı operasyon <Text style={styles.good}>{state.successful_operations}/3</Text></Text><Text style={styles.scoreText}>Başarısız <Text style={styles.bad}>{state.failed_operations}/3</Text></Text></View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{state.phase === 'lobby' ? 'Lobi hazır' : state.phase === 'briefing' ? 'Brifing' : state.phase === 'operation_select' ? 'Operasyon seç' : state.phase === 'team_vote' ? 'Ekibi onayla' : state.phase === 'secret_action' ? 'Gizli hamleni yap' : state.phase === 'debrief' ? 'Operasyon raporu' : 'Dosya kapandı'}</Text>
          {state.phase === 'lobby' ? <Text style={styles.muted}>4–10 oyuncu hazır olduğunda oda sahibi oyunu başlatmalı.</Text> : null}

          {state.phase === 'operation_select' ? <>
            <Text style={styles.muted}>Oda sahibi veya Operatör 2–5 kişilik ekip seçer, ardından görevi belirler. Herkes gizlice onaylar.</Text>
            <Text style={styles.label}>OPERASYON EKİBİ · {selectedTeamIds.length}/5</Text>
            {state.players.map((player) => {
              const selected = selectedTeamIds.includes(player.player_id);
              return <Pressable key={player.player_id} disabled={!canChoose || busy || (!selected && selectedTeamIds.length >= 5)} onPress={() => setSelectedTeamIds((previous) => selected ? previous.filter((id) => id !== player.player_id) : [...previous, player.player_id])} style={[styles.playerChoice, selected && styles.playerSelected, (!canChoose || (!selected && selectedTeamIds.length >= 5)) && styles.disabled]}><Text style={styles.playerName}>{player.name}</Text><Text style={styles.muted}>{selected ? '✓ Ekipte' : 'Ekibe ekle'}</Text></Pressable>;
            })}
            {OPERATIONS.map((op) => { const Icon = op.icon; return <Pressable key={op.id} disabled={!canChoose || busy || selectedTeamIds.length < 2 || selectedTeamIds.length > 5} onPress={() => chooseOperation(op.id)} style={[styles.operation, (!canChoose || selectedTeamIds.length < 2 || selectedTeamIds.length > 5) && styles.disabled]}><View style={styles.operationIcon}><Icon color="#FF8B67" size={19} /></View><View style={{ flex: 1 }}><Text style={styles.operationTitle}>{op.title}</Text><Text style={styles.muted}>{op.detail}</Text></View><Text style={styles.cost}>{op.cost}</Text></Pressable>; })}
            {!canChoose ? <Text style={styles.hint}>Görev seçimi yalnızca oda sahibi veya Operatör tarafından yapılır.</Text> : null}
          </> : null}

          {state.phase === 'team_vote' ? <>
            <Text style={styles.muted}>Seçilen operasyon: {OPERATIONS.find((o) => o.id === state.selected_operation)?.title ?? state.selected_operation}. Ekipte {state.proposed_team?.length ?? 0} kişi var.</Text>
            <View style={styles.actions}><ActionButton label={alreadyVoted ? 'Onay kaydedildi' : 'Ekibi onayla'} color="#1C9C78" disabled={alreadyVoted || busy} onPress={() => voteTeam(true)} /><ActionButton label="Reddet" color="#B84747" disabled={alreadyVoted || busy} onPress={() => voteTeam(false)} /></View>
          </> : null}

          {state.phase === 'secret_action' ? <>
            <Text style={styles.muted}>Hamlen diğer oyunculara gösterilmez. Her tur yalnızca bir hamle kaydedebilirsin.</Text>
            {!state.proposed_team?.includes(currentPlayer?.id ?? '') ? <Text style={styles.hint}>Bu operasyonun ekibinde değilsin. Hamleler yalnızca seçilen ekipten kabul edilir.</Text> :
              state.my_role?.loyalty === 'saboteurs' ? <View style={styles.actions}><ActionButton label={alreadyActed ? 'Hamle kaydedildi' : 'Sabotaj yap'} color="#B84747" disabled={alreadyActed || busy} onPress={() => submitAction('sabotage')} /><ActionButton label="İstihbarat" color="#4E83B8" disabled={alreadyActed || busy} onPress={() => submitAction('intel')} /></View> :
              <View style={styles.actions}><ActionButton label={alreadyActed ? 'Hamle kaydedildi' : 'Destek ver'} color="#1C9C78" disabled={alreadyActed || busy} onPress={() => submitAction('support')} /><ActionButton label="Tamir et" color="#D18B37" disabled={alreadyActed || busy} onPress={() => submitAction('repair')} /><ActionButton label="İstihbarat" color="#4E83B8" disabled={alreadyActed || busy} onPress={() => submitAction('intel')} /></View>}
          </> : null}

          {state.phase === 'debrief' ? <>
            <View style={[styles.report, { borderColor: state.last_report?.success ? '#1C9C78' : '#B84747' }]}><Text style={styles.reportTitle}>{state.last_report?.success ? 'OPERASYON BAŞARILI' : 'OPERASYON AKSADI'}</Text><Text style={styles.reportText}>{state.last_report?.message ?? 'Rapor hazırlanıyor.'}</Text></View>
            <Text style={styles.muted}>Ekipteki davranışları tartış ve şüpheliyi seç. Oda sahibi süre dolunca sonraki aşamaya geçirir.</Text>
            {state.players.filter((p) => p.player_id !== currentPlayer?.id).map((p) => <Pressable key={p.player_id} onPress={() => setSelectedSuspect(p.player_id)} style={[styles.playerChoice, selectedSuspect === p.player_id && styles.playerSelected]}><Text style={styles.playerName}>{p.name}</Text><Text style={styles.muted}>{selectedSuspect === p.player_id ? 'Şüpheli seçildi' : 'Şüpheli olarak işaretle'}</Text></Pressable>)}
            <ActionButton label="Şüpheli oyunu gönder" color="#6C63D9" disabled={!selectedSuspect || busy} onPress={voteSuspect} />
          </> : null}

          {state.phase === 'finished' ? <View style={styles.report}><Text style={styles.reportTitle}>{state.winner === 'crew' ? 'EKİP KAZANDI' : 'SABOTAJCILAR KAZANDI'}</Text><Text style={styles.reportText}>Dosya kapandı. {state.successful_operations} başarılı, {state.failed_operations} başarısız operasyon.</Text>{state.players.map((p) => <Text key={p.player_id} style={styles.playerName}>{p.name}</Text>)}</View> : null}
          {busy ? <ActivityIndicator color="#FF7652" style={{ marginTop: 10 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.roster}><View style={styles.rosterHeader}><Users color="#35B8FF" size={17} /><Text style={styles.rosterTitle}>Operasyondaki oyuncular</Text><Pressable onPress={() => void refresh().catch((e) => setError(e.message))}><RefreshCw color="#9AA6BD" size={16} /></Pressable></View>
          {state.players.map((p) => <View key={p.player_id} style={styles.rosterRow}><View style={styles.avatar}><Text style={styles.avatarText}>{p.name.slice(0,1).toUpperCase()}</Text></View><Text style={styles.playerName}>{p.name}{p.player_id === currentPlayer?.id ? ' (sen)' : ''}</Text><Text style={styles.ready}>{p.is_ready ? 'HAZIR' : 'BEKLİYOR'}</Text></View>)}
        </View>
        <Text style={styles.footer}>GİZLİ ROLLER SUNUCUDA SAKLANIR · SÜRE SUNUCU TARAFINDAN DENETLENİR</Text>
      </ScrollView>
    </Screen>
  );
}

function ActionButton({ label, color, disabled, onPress }: { label: string; color: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.actionButton, { backgroundColor: color }, disabled && styles.disabled]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { padding: 18, paddingTop: 52, paddingBottom: 44, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  back: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#202638', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#FF8B67', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFF', fontSize: 23, fontWeight: '900', marginTop: 3 },
  clock: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, backgroundColor: '#22283A' },
  clockText: { color: '#FFF', fontWeight: '900' },
  roleCard: { backgroundColor: '#1A2030', borderColor: '#FF7652', borderWidth: 1, borderRadius: 22, padding: 17, gap: 10 },
  roleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  label: { color: '#9BA8C1', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  role: { color: '#35B8FF', fontSize: 12, fontWeight: '900' },
  clue: { color: '#FFF', fontSize: 14, lineHeight: 21 },
  room: { color: '#8F9BB2', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  resources: { flexDirection: 'row', gap: 9 },
  resource: { flex: 1, backgroundColor: '#1A2030', borderRadius: 17, padding: 13, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: '#2B344A' },
  resourceValue: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  resourceName: { color: '#9AA6BD', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  scoreLine: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 3 },
  scoreText: { color: '#AEB7CA', fontSize: 12, fontWeight: '700' },
  good: { color: '#5EE0B0', fontWeight: '900' },
  bad: { color: '#FF7652', fontWeight: '900' },
  panel: { backgroundColor: '#151B29', borderRadius: 23, borderWidth: 1, borderColor: '#2A3347', padding: 17, gap: 12 },
  panelTitle: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  muted: { color: '#A1ACC1', fontSize: 12, lineHeight: 18 },
  operation: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 15, backgroundColor: '#20283A', borderWidth: 1, borderColor: '#303A50' },
  operationIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#322B3A' },
  operationTitle: { color: '#FFF', fontSize: 13, fontWeight: '900', marginBottom: 2 },
  cost: { color: '#FFB08D', fontSize: 10, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionButton: { flexGrow: 1, minHeight: 44, borderRadius: 13, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  hint: { color: '#FFB08D', fontSize: 11 },
  report: { borderWidth: 1, borderRadius: 16, padding: 14, backgroundColor: '#20283A', gap: 6 },
  reportTitle: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  reportText: { color: '#C2CAD9', fontSize: 12, lineHeight: 18 },
  playerChoice: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#303A50', backgroundColor: '#20283A', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  playerSelected: { borderColor: '#6C63D9', backgroundColor: '#2C2B4B' },
  playerName: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  roster: { backgroundColor: '#151B29', borderRadius: 20, padding: 15, borderWidth: 1, borderColor: '#2A3347', gap: 12 },
  rosterHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rosterTitle: { color: '#FFF', fontSize: 13, fontWeight: '900', flex: 1 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 30, height: 30, borderRadius: 11, backgroundColor: '#303A50', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontWeight: '900' },
  ready: { color: '#5EE0B0', fontSize: 9, fontWeight: '900', marginLeft: 'auto' },
  error: { color: '#FF9999', fontSize: 12, fontWeight: '700' },
  footer: { color: '#6D7890', fontSize: 9, textAlign: 'center', fontWeight: '800', letterSpacing: 0.8 },
});
