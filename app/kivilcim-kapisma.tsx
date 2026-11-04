import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowLeft, CircleHelp, Crown, RotateCcw, Timer, Trophy, Zap } from 'lucide-react-native';
import { Screen } from '@/components/ui';
import { ensureSupabase } from '@/lib/supabase/client';
import { useGameStore } from '@/store/gameStore';
import { getServerNowMs } from '@/services/serverClock';
import { soundService } from '@/services/soundService';

type ResultKind = 'correct' | 'wrong' | 'false_start' | 'missed';
type KivilcimPlayer = {
  id: string; name: string; avatarKey: string; isBot: boolean; score: number;
  lastResult: ResultKind | null; reactionMs: number | null; submitted: boolean;
};
type KivilcimState = {
  mode: 'kivilcim_kapisma'; phase: 'lobby' | 'ready' | 'signal' | 'report' | 'finished';
  round: number; step: number; deadline: string | null; signalStartedAt: string | null;
  target: string | null; icons: string[]; isHost: boolean; canAct: boolean;
  report: { message?: string; quickest?: string | null; round?: number };
  winnerIds: string[]; players: KivilcimPlayer[]; submittedCount: number; totalCount: number;
};

const ICON_COLORS: Record<string, string> = { '🔴': '#FF667A', '🔵': '#56C5FF', '🟡': '#FFD85C', '🟢': '#5CE0A3' };
const RESULT_LABEL: Record<ResultKind, string> = {
  correct: 'DOĞRU SİNYAL', wrong: 'YANLIŞ RENK', false_start: 'ERKEN DOKUNUŞ', missed: 'SİNYAL KAÇTI',
};

export default function KivilcimKapismaScreen() {
  const { roomCode, currentPlayer, service, setRoomCode, setRoomState } = useGameStore();
  const [state, setState] = useState<KivilcimState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(getServerNowMs);
  const flight = useRef(false);
  const priorStage = useRef('');

  const refresh = useCallback(async () => {
    if (!roomCode) return;
    const { data, error: rpcError } = await ensureSupabase().rpc('kivilcim_state_secure', { p_room_code: roomCode });
    if (rpcError) throw rpcError;
    const next = data as KivilcimState | null;
    if (next?.phase === 'lobby') { router.replace('/lobby'); return; }
    if (next) setState(next);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) { router.replace('/game-modes'); return; }
    let disposed = false, running = false;
    const poll = async () => {
      if (disposed || running) return;
      running = true;
      try {
        const { data, error: rpcError } = await ensureSupabase().rpc('kivilcim_state_secure', { p_room_code: roomCode });
        if (rpcError) throw rpcError;
        if (disposed) return;
        const next = data as KivilcimState | null;
        if (next?.phase === 'lobby') { router.replace('/lobby'); return; }
        if (next) setState(next);
        setError(null);
      } catch (cause) { if (!disposed) setError(cause instanceof Error ? cause.message : 'Oyun durumu alınamadı.'); }
      finally { running = false; }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 800);
    return () => { disposed = true; clearInterval(timer); };
  }, [roomCode]);

  useEffect(() => { const timer = setInterval(() => setNow(getServerNowMs()), 120); return () => clearInterval(timer); }, []);

  useEffect(() => {
    if (!state) return;
    const stage = `${state.step}:${state.phase}`;
    if (stage !== priorStage.current) {
      priorStage.current = stage;
      if (state.phase === 'signal') void soundService.play('clock', 0.16);
      else soundService.stop('clock');
      if (state.phase === 'finished') void soundService.play('true', 0.65);
    }
    return () => { if (state.phase !== 'signal') soundService.stop('clock'); };
  }, [state?.step, state?.phase]);
  useEffect(() => () => soundService.stop('clock'), []);

  const botPendingKey = state?.players.filter(player => player.isBot && !player.submitted).map(player => player.id).join(',') ?? '';
  useEffect(() => {
    if (!roomCode || !state || state.phase === 'finished' || flight.current) return;
    let running = false;
    const tick = async () => {
      if (running || flight.current) return;
      const expired = !!state.deadline && Date.parse(state.deadline) <= getServerNowMs();
      const bots = state.phase === 'signal' ? state.players.filter(player => player.isBot && !player.submitted) : [];
      if (!expired && !(state.isHost && bots.length)) return;
      running = true;
      try {
        if (expired) {
          const { error: rpcError } = await ensureSupabase().rpc('kivilcim_advance_secure', { p_room_code: roomCode, p_step: state.step });
          if (rpcError) throw rpcError;
        } else {
          for (const bot of bots) {
            const { error: rpcError } = await ensureSupabase().rpc('kivilcim_bot_turn_secure', { p_room_code: roomCode, p_bot_id: bot.id, p_step: state.step });
            if (rpcError) throw rpcError;
          }
        }
        await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tur güncellenemedi.'); }
      finally { running = false; }
    };
    const timer = setInterval(() => { void tick(); }, 250);
    void tick();
    return () => clearInterval(timer);
  }, [roomCode, state?.step, state?.phase, state?.deadline, state?.isHost, botPendingKey, refresh]);

  const hit = async (icon: string) => {
    if (!roomCode || !state?.canAct || busy || flight.current) return;
    flight.current = true; setBusy(true); setError(null);
    void soundService.play('click', 0.35);
    try {
      const { data, error: rpcError } = await ensureSupabase().rpc('kivilcim_action_secure', {
        p_room_code: roomCode, p_step: state.step, p_icon: icon,
      });
      if (rpcError) throw rpcError;
      if (data === 'correct') void soundService.play('true', 0.7);
      else void soundService.play('zartalanma', data === 'false_start' ? 0.4 : 0.55);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dokunuş kaydedilemedi.');
      try { await refresh(); } catch { /* polling will retry */ }
    } finally { flight.current = false; setBusy(false); }
  };

  const leave = async () => {
    if (!roomCode) return;
    setBusy(true); soundService.stop('clock');
    try { await service.leaveRoom(roomCode); setRoomCode(null); setRoomState(null); router.replace('/(tabs)/oyna'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Odadan çıkılamadı.'); }
    finally { setBusy(false); }
  };

  const sorted = useMemo(() => [...(state?.players ?? [])].sort((a, b) => b.score - a.score), [state?.players]);
  const seconds = state?.deadline ? Math.max(0, (Date.parse(state.deadline) - now) / 1000) : 0;
  const fraction = state?.deadline ? Math.max(0, Math.min(1, seconds / (state.phase === 'signal' ? 5 : state.phase === 'ready' ? 3 : 2.2))) : 0;
  const me = state?.players.find(player => player.id === currentPlayer?.id);
  const latestResult = me?.lastResult;

  return (
    <Screen edges={['top']}>
      <LinearGradient pointerEvents="none" colors={['#14130D', '#171A17', '#10151C']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <View style={s.top}>
          <Pressable onPress={() => void leave()} style={s.back} accessibilityRole="button" accessibilityLabel="Oyundan çık"><ArrowLeft color="#EEE9D4" size={19} /></Pressable>
          <View style={{ flex: 1 }}><Text style={s.kicker}>KIZILKUYRUK · REFLEKS ARENASI</Text><Text style={s.title}>Kıvılcım Kapışması</Text></View>
          <View style={s.roundChip}><Text style={s.roundText}>{state?.round ?? 1}<Text style={s.roundTotal}> / 8</Text></Text></View>
        </View>

        <View style={s.countdown}>
          <View style={s.statusRow}>
            <View style={s.phaseTag}><View style={[s.liveDot, state?.phase === 'signal' && s.liveDotOn]} /><Text style={s.phaseText}>{state?.phase === 'ready' ? 'SİNYAL BEKLENİYOR' : state?.phase === 'signal' ? 'ŞİMDİ!' : state?.phase === 'report' ? 'TUR SONUCU' : state?.phase === 'finished' ? 'ARENA TAMAMLANDI' : 'BAĞLANIYOR'}</Text></View>
            {state?.phase === 'ready' || state?.phase === 'signal' ? <Text style={s.timerText}>{Math.ceil(seconds)}s</Text> : <Text style={s.timerText}>{state?.submittedCount ?? 0}/{state?.totalCount ?? 0}</Text>}
          </View>
          <View style={s.timerTrack}><View style={[s.timerFill, { width: `${fraction * 100}%`, backgroundColor: state?.phase === 'signal' ? '#FFE066' : '#A3B18A' }]} /></View>
          <Text style={s.instruction}>{state?.phase === 'ready' ? 'Renkler görünüyor ama hedef saklı. Bekle…' : state?.phase === 'signal' ? 'Yanan rengi en hızlı sen yakala!' : state?.phase === 'report' ? state.report?.message : 'Hazırsan yeni tura geçiyoruz.'}</Text>
        </View>

        {state?.phase === 'finished' ? (
          <View style={s.finishedCard}>
            <Trophy color="#FFE066" size={42} />
            <Text style={s.finishedTitle}>{state.winnerIds.includes(currentPlayer?.id ?? '') ? 'Refleks şampiyonu sensin!' : 'Arena tamamlandı!'}</Text>
            <Text style={s.finishedCopy}>Sekiz tur bitti. Her dokunuşun puana dönüştü.</Text>
            <Pressable style={s.finishButton} onPress={() => void leave()}><RotateCcw color="#17170E" size={17} /><Text style={s.finishButtonText}>Oyun salonuna dön</Text></Pressable>
          </View>
        ) : state?.phase === 'report' ? (
          <View style={s.reportCard}>
            <View style={s.reportIcon}><Crown size={20} color="#FFE066" /></View>
            <View style={{ flex: 1 }}><Text style={s.reportTitle}>{state.report?.message ?? 'Tur tamamlandı'}</Text><Text style={s.reportSubtitle}>{me?.lastResult ? RESULT_LABEL[me.lastResult] : 'Bu turda sinyali kaçırdın'}</Text></View>
            {me?.reactionMs !== null && me?.reactionMs !== undefined ? <Text style={s.reactionValue}>{me.reactionMs} ms</Text> : null}
          </View>
        ) : (
          <View style={[s.signalCard, state?.phase === 'signal' && s.signalCardOn]}>
            <View style={s.signalTop}><Text style={s.signalEyebrow}>{state?.phase === 'signal' ? 'YAKALANACAK SİNYAL' : 'RENKLERİ TANI'}</Text><CircleHelp color="#87908A" size={16} /></View>
            {state?.phase === 'signal' && state.target ? <View style={[s.targetSignal, { borderColor: ICON_COLORS[state.target], backgroundColor: ICON_COLORS[state.target] + '20' }]}><Text style={s.targetGlyph}>{state.target}</Text><Text style={[s.targetLabel, { color: ICON_COLORS[state.target] }]}>{state.target === '🔴' ? 'KIRMIZI' : state.target === '🔵' ? 'MAVİ' : state.target === '🟡' ? 'SARI' : 'YEŞİL'}</Text></View> : <View style={s.waitingSignal}><Zap color="#A6A58E" size={33} /><Text style={s.waitingTitle}>Sinyali bekle</Text><Text style={s.waitingCopy}>Hedef aniden görünecek. Erken basma!</Text></View>}
            <View style={s.colorGrid}>
              {(state?.icons ?? ['🔴', '🔵', '🟡', '🟢']).map((icon) => {
                const isTarget = state?.phase === 'signal' && state.target === icon;
                const isDisabled = !state?.canAct || busy;
                return <Pressable key={icon} accessibilityRole="button" accessibilityLabel={`${icon === '🔴' ? 'Kırmızı' : icon === '🔵' ? 'Mavi' : icon === '🟡' ? 'Sarı' : 'Yeşil'} sinyal seç`} accessibilityState={{ disabled: isDisabled }} disabled={isDisabled} onPress={() => void hit(icon)} style={({ pressed }) => [s.colorButton, { borderColor: isTarget ? ICON_COLORS[icon] : '#36413B', backgroundColor: isTarget ? ICON_COLORS[icon] + '2A' : '#202821' }, pressed && s.colorPressed, isDisabled && !isTarget && s.colorDim]}>
                  <View style={[s.colorDot, { backgroundColor: ICON_COLORS[icon], shadowColor: ICON_COLORS[icon] }]} />
                  <Text style={[s.colorLabel, isTarget && { color: ICON_COLORS[icon] }]}>{icon === '🔴' ? 'KIRMIZI' : icon === '🔵' ? 'MAVİ' : icon === '🟡' ? 'SARI' : 'YEŞİL'}</Text>
                </Pressable>;
              })}
            </View>
            <View style={s.actionStatus}>{busy ? <ActivityIndicator size="small" color="#FFE066" /> : latestResult ? <Text style={[s.resultText, { color: latestResult === 'correct' ? '#74E1AA' : latestResult === 'missed' ? '#A6A58E' : '#FF8C86' }]}>{RESULT_LABEL[latestResult]}</Text> : state?.canAct ? <Text style={s.actionText}>Dokunmaya hazırsın</Text> : <Text style={s.actionText}>Hamlen kilitli · sonucu bekle</Text>}</View>
          </View>
        )}

        {error ? <Text style={s.error}>{error}</Text> : null}

        <View style={s.rulesStrip}><Zap size={16} color="#FFE066" /><Text style={s.ruleText}>Doğru + hızlı = daha çok puan</Text><Text style={s.ruleDivider}>·</Text><Text style={s.ruleText}>Erken veya yanlış = −15/20</Text></View>

        <View style={s.leaderboard}>
          <View style={s.leaderHeader}><View><Text style={s.leaderEyebrow}>SEKİZ TUR SONRA</Text><Text style={s.leaderTitle}>Kıvılcım tablosu</Text></View><Timer size={17} color="#9AA38F" /></View>
          {sorted.map((player, index) => <View key={player.id} style={s.playerRow}>
            <Text style={[s.rank, index === 0 && { color: '#FFE066' }]}>{index === 0 ? '✦' : index + 1}</Text>
            <View style={[s.avatar, index === 0 && s.avatarTop]}><Text style={s.avatarLetter}>{player.name.trim().slice(0, 1).toLocaleUpperCase('tr-TR')}</Text></View>
            <View style={{ flex: 1 }}><View style={s.nameLine}><Text numberOfLines={1} style={s.playerName}>{player.name}{player.isBot ? ' · BOT' : ''}</Text>{player.lastResult ? <Text style={[s.playerResult, { color: player.lastResult === 'correct' ? '#74E1AA' : player.lastResult === 'missed' ? '#87908A' : '#FF8C86' }]}>{RESULT_LABEL[player.lastResult]}</Text> : null}</View><View style={s.scoreTrack}><View style={[s.scoreFill, { width: `${Math.min(100, Math.max(3, player.score / Math.max(1, sorted[0]?.score || 100) * 100))}%`, backgroundColor: index === 0 ? '#FFE066' : '#8B9879' }]} /></View></View>
            <Text style={s.score}>{player.score}</Text>
          </View>)}
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 42, gap: 16, maxWidth: 780, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#25291F', alignItems: 'center', justifyContent: 'center' },
  kicker: { color: '#9AA38F', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, title: { color: '#F7F3DC', fontSize: 23, fontWeight: '900', marginTop: 2 }, roundChip: { minWidth: 52, height: 43, borderRadius: 15, backgroundColor: '#282819', borderWidth: 1, borderColor: '#514A28', alignItems: 'center', justifyContent: 'center' }, roundText: { color: '#FFE066', fontSize: 17, fontWeight: '900' }, roundTotal: { color: '#9A9064', fontSize: 10 },
  countdown: { backgroundColor: '#171E18', borderRadius: 18, borderWidth: 1, borderColor: '#333C31', padding: 14, gap: 9 }, statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, phaseTag: { flexDirection: 'row', alignItems: 'center', gap: 7 }, liveDot: { width: 7, height: 7, borderRadius: 9, backgroundColor: '#858F7C' }, liveDotOn: { backgroundColor: '#FFE066' }, phaseText: { color: '#C5CDBA', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, timerText: { color: '#F7F3DC', fontWeight: '900', fontSize: 13 }, timerTrack: { height: 5, borderRadius: 9, backgroundColor: '#30382E', overflow: 'hidden' }, timerFill: { height: '100%', borderRadius: 9 }, instruction: { color: '#95A08E', fontSize: 11, fontWeight: '700' },
  signalCard: { backgroundColor: '#171E18', borderRadius: 25, borderWidth: 1, borderColor: '#333C31', padding: 16, gap: 15 }, signalCardOn: { borderColor: '#75652A', backgroundColor: '#1C2016' }, signalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, signalEyebrow: { color: '#A1AA91', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, targetSignal: { minHeight: 114, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 14 }, targetGlyph: { fontSize: 55 }, targetLabel: { fontSize: 15, fontWeight: '900', letterSpacing: 1.3 }, waitingSignal: { minHeight: 114, borderRadius: 20, backgroundColor: '#202820', alignItems: 'center', justifyContent: 'center', gap: 6 }, waitingTitle: { color: '#E2E5D6', fontSize: 18, fontWeight: '900' }, waitingCopy: { color: '#969E8B', fontSize: 11, fontWeight: '700' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, colorButton: { flex: 1, minWidth: '46%', height: 77, borderRadius: 18, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }, colorPressed: { transform: [{ scale: 0.96 }], opacity: 0.8 }, colorDim: { opacity: 0.64 }, colorDot: { width: 22, height: 22, borderRadius: 99, shadowOpacity: 0.8, shadowRadius: 12 }, colorLabel: { color: '#C8D0C1', fontSize: 12, fontWeight: '900', letterSpacing: 0.7 }, actionStatus: { minHeight: 24, alignItems: 'center', justifyContent: 'center' }, actionText: { color: '#8F9A88', fontSize: 11, fontWeight: '800' }, resultText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  reportCard: { minHeight: 90, borderRadius: 20, borderWidth: 1, borderColor: '#514A28', backgroundColor: '#242315', padding: 15, flexDirection: 'row', gap: 12, alignItems: 'center' }, reportIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#37321B', alignItems: 'center', justifyContent: 'center' }, reportTitle: { color: '#F2E9C4', fontWeight: '900', fontSize: 13 }, reportSubtitle: { color: '#A69E7B', fontSize: 9, fontWeight: '800', marginTop: 5 }, reactionValue: { color: '#FFE066', fontSize: 12, fontWeight: '900' },
  finishedCard: { borderRadius: 23, borderWidth: 1, borderColor: '#78652D', backgroundColor: '#292719', padding: 22, alignItems: 'center', gap: 10 }, finishedTitle: { color: '#FFF5CC', fontSize: 19, fontWeight: '900', textAlign: 'center' }, finishedCopy: { color: '#B0AA8A', fontSize: 11, textAlign: 'center' }, finishButton: { marginTop: 4, minHeight: 44, paddingHorizontal: 16, borderRadius: 13, backgroundColor: '#FFE066', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, finishButtonText: { color: '#17170E', fontSize: 11, fontWeight: '900' }, error: { color: '#FF9A96', textAlign: 'center', fontSize: 11, fontWeight: '800' },
  rulesStrip: { borderRadius: 14, backgroundColor: '#1A211A', borderWidth: 1, borderColor: '#2C382B', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flexWrap: 'wrap' }, ruleText: { color: '#ABB5A0', fontSize: 9, fontWeight: '800' }, ruleDivider: { color: '#68735F' },
  leaderboard: { borderRadius: 22, borderWidth: 1, borderColor: '#2E392E', backgroundColor: '#151C16', padding: 15, gap: 13 }, leaderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }, leaderEyebrow: { color: '#8F9A83', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 }, leaderTitle: { color: '#F0F1E3', fontSize: 15, fontWeight: '900', marginTop: 3 }, playerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, rank: { width: 19, color: '#84907D', fontSize: 12, fontWeight: '900', textAlign: 'center' }, avatar: { width: 31, height: 31, borderRadius: 12, backgroundColor: '#303B31', alignItems: 'center', justifyContent: 'center' }, avatarTop: { backgroundColor: '#FFE066' }, avatarLetter: { color: '#151A14', fontWeight: '900', fontSize: 13 }, nameLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5 }, playerName: { color: '#D8DFD1', fontSize: 10, fontWeight: '800', flexShrink: 1 }, playerResult: { fontSize: 7, fontWeight: '900', letterSpacing: 0.35 }, scoreTrack: { height: 4, borderRadius: 9, backgroundColor: '#2A342A', marginTop: 5, overflow: 'hidden' }, scoreFill: { height: '100%', borderRadius: 9 }, score: { minWidth: 30, textAlign: 'right', color: '#F2F2E1', fontSize: 12, fontWeight: '900' },
});
