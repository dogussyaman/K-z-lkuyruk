import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { router } from 'expo-router';
import { ArrowLeft, Flag, Footprints, Pause, Play, RotateCcw, Trophy, Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/ui';
import { ensureSupabase } from '@/lib/supabase/client';
import { useGameStore } from '@/store/gameStore';
import { getServerNowMs } from '@/services/serverClock';
import { soundService } from '@/services/soundService';

type ParkurPlayer = {
  id: string; name: string; avatarKey: string; isBot: boolean; score: number;
  parkourPosition: number; parkourLane: number; finishTurn: number | null; submitted: boolean;
};
type Hazard = { kind: 'mud' | 'ice' | 'ramp' | 'gate'; lane: number; label: string };
type ParkurState = {
  mode: 'tilki_parkuru'; phase: 'lobby' | 'aim' | 'report' | 'finished'; round: number; step: number;
  deadline: string | null; pausedAt: string | null; isHost: boolean; canAct: boolean;
  course: Hazard[]; report: { message?: string; hazard?: Hazard; turn?: number }; result: string | null;
  winnerIds: string[]; me: { position: number; lane: number; boosts: number; finishTurn: number | null };
  players: ParkurPlayer[]; submittedCount: number; totalCount: number;
};

const laneY = [57, 120, 183];
const laneColors = ['#60A5FA', '#A78BFA', '#34D399', '#FBBF24', '#FB7185', '#22D3EE', '#F97316', '#E879F9'];
const hazardIcon = (kind?: Hazard['kind']) => kind === 'mud' ? '◉' : kind === 'ice' ? '❄' : kind === 'ramp' ? '▲' : '▤';

export default function TilkiParkuruScreen() {
  const { roomCode, currentPlayer, service, setRoomCode, setRoomState } = useGameStore();
  const [state, setState] = useState<ParkurState | null>(null);
  const [aim, setAim] = useState(0);
  const [power, setPower] = useState(70);
  const [boost, setBoost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(getServerNowMs);
  const [trackWidth, setTrackWidth] = useState(620);
  const flight = useRef(false);
  const previousStage = useRef('');
  const { width } = useWindowDimensions();

  const refresh = useCallback(async () => {
    if (!roomCode) return;
    const { data, error: rpcError } = await ensureSupabase().rpc('parkur_state_secure', { p_room_code: roomCode });
    if (rpcError) throw rpcError;
    const next = data as ParkurState | null;
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
        const { data, error: rpcError } = await ensureSupabase().rpc('parkur_state_secure', { p_room_code: roomCode });
        if (rpcError) throw rpcError;
        if (disposed) return;
        const next = data as ParkurState | null;
        if (next?.phase === 'lobby') { router.replace('/lobby'); return; }
        if (next) setState(next);
        setError(null);
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Yarış durumu alınamadı.');
      } finally { running = false; }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 1400);
    return () => { disposed = true; clearInterval(timer); };
  }, [roomCode]);

  useEffect(() => { const clock = setInterval(() => setNow(getServerNowMs()), 250); return () => clearInterval(clock); }, []);
  useEffect(() => { setAim(0); setPower(70); setBoost(false); }, [state?.step]);
  useEffect(() => {
    const stage = `${state?.step ?? 0}:${state?.phase ?? ''}`;
    if (stage === previousStage.current) return;
    previousStage.current = stage;
    if (state?.phase === 'report') void soundService.play('true', 0.42);
    if (state?.phase === 'finished') void soundService.play('true', 0.75);
  }, [state?.step, state?.phase]);
  useEffect(() => () => soundService.stop('clock'), []);

  const botStepKey = state?.players
    .filter(player => player.isBot && !player.submitted && player.finishTurn === null)
    .map(player => player.id).join(',') ?? '';
  useEffect(() => {
    if (!roomCode || !state || state.phase === 'finished' || state.pausedAt) return;
    let running = false;
    const tick = async () => {
      if (running || flight.current) return;
      const expired = !!state.deadline && Date.parse(state.deadline) <= getServerNowMs();
      const bots = state.players.filter(player => player.isBot && !player.submitted && player.finishTurn === null);
      if (!expired && !(state.isHost && state.phase === 'aim' && bots.length)) return;
      running = true; flight.current = true;
      try {
        const sb = ensureSupabase();
        if (expired) {
          const { error: e } = await sb.rpc('parkur_advance_secure', { p_room_code: roomCode, p_step: state.step });
          if (e) throw e;
        } else {
          for (const bot of bots) {
            const { error: e } = await sb.rpc('parkur_bot_turn_secure', { p_room_code: roomCode, p_bot_id: bot.id, p_step: state.step });
            if (e) throw e;
          }
        }
        await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Yarış turu güncellenemedi.'); }
      finally { running = false; flight.current = false; }
    };
    const timer = setInterval(() => { void tick(); }, 450);
    void tick();
    return () => clearInterval(timer);
  }, [roomCode, state?.step, state?.phase, state?.deadline, state?.pausedAt, state?.isHost, botStepKey, refresh]);

  const submit = async () => {
    if (!roomCode || !state || flight.current || !state.canAct || state.pausedAt) return;
    flight.current = true; setBusy(true); setError(null);
    void soundService.play('click', 0.35);
    try {
      const { error: rpcError } = await ensureSupabase().rpc('parkur_action_secure', {
        p_room_code: roomCode, p_step: state.step, p_aim: aim, p_power: power, p_boost: boost,
      });
      if (rpcError) throw rpcError;
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Hamle gönderilemedi.'); }
    finally { flight.current = false; setBusy(false); }
  };

  const togglePause = async () => {
    if (!roomCode || !state?.isHost || flight.current) return;
    setBusy(true);
    try {
      const { error: rpcError } = await ensureSupabase().rpc('parkur_pause_secure', { p_room_code: roomCode, p_paused: !state.pausedAt });
      if (rpcError) throw rpcError;
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Yarış durumu değiştirilemedi.'); }
    finally { setBusy(false); }
  };

  const leave = async () => {
    if (!roomCode) return;
    setBusy(true);
    try { await service.leaveRoom(roomCode); setRoomCode(null); setRoomState(null); router.replace('/(tabs)/oyna'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Odadan çıkılamadı.'); }
    finally { setBusy(false); }
  };

  const remaining = state?.deadline && !state.pausedAt ? Math.max(0, Math.ceil((Date.parse(state.deadline) - now) / 1000)) : null;
  const sorted = useMemo(() => [...(state?.players ?? [])].sort((a, b) => b.parkourPosition - a.parkourPosition), [state?.players]);
  const boardWidth = Math.max(280, Math.min(720, width - 40));
  const xAt = (position: number) => 28 + (boardWidth - 66) * Math.min(100, position) / 100;
  const currentHazard = state?.course?.[Math.max(0, (state.round ?? 1) - 1)];
  const hazardKind = state?.report?.hazard?.kind ?? currentHazard?.kind;

  return (
    <Screen edges={['top']}>
      <LinearGradient pointerEvents="none" colors={['#07151F', '#0B1C2A', '#101325']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <View style={s.top}>
          <Pressable onPress={() => void leave()} style={s.back} accessibilityRole="button" accessibilityLabel="Yarıştan çık"><ArrowLeft size={19} color="#D7EAF2" /></Pressable>
          <View style={{ flex: 1 }}><Text style={s.kicker}>KIZILKUYRUK · CANLI YARIŞ</Text><Text style={s.title}>Tilki Parkuru</Text></View>
          {state?.isHost && state.phase !== 'finished' ? <Pressable onPress={() => void togglePause()} style={s.pause}>{state.pausedAt ? <Play size={17} color="#57E7FF" /> : <Pause size={17} color="#57E7FF" />}</Pressable> : null}
        </View>

        <View style={s.statusRow}>
          <View style={s.pill}><Flag size={14} color="#57E7FF" /><Text style={s.pillText}>ETAP {state?.round ?? 1} / 6</Text></View>
          <View style={[s.pill, remaining !== null && remaining <= 5 && s.urgent]}><Text style={s.pillText}>{state?.pausedAt ? 'DURAKLATILDI' : state?.phase === 'report' ? 'HAMLELER AÇILDI' : state?.phase === 'finished' ? 'FİNİŞ' : `${remaining ?? 25} SN`}</Text></View>
          <View style={s.pill}><Text style={s.pillText}>{state?.submittedCount ?? 0}/{state?.totalCount ?? 0} HAZIR</Text></View>
        </View>

        <View style={s.trackCard} onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}>
          <View style={s.trackHeading}><View><Text style={s.trackEyebrow}>NEON ARENA</Text><Text style={s.trackTitle}>{state?.report?.message ?? currentHazard?.label ?? 'Parkura hazırlan'}</Text></View><Text style={s.trackMark}>100 m</Text></View>
          <Svg width="100%" height={242} viewBox={`0 0 ${trackWidth} 242`}>
            <Rect x="12" y="20" width={trackWidth - 24} height="204" rx="26" fill="#09131F" stroke="#244054" strokeWidth="1.5" />
            {laneY.map((y, i) => <Line key={`lane-${i}`} x1="24" y1={y} x2={trackWidth - 24} y2={y} stroke="#244054" strokeDasharray="5 7" />)}
            <Line x1={trackWidth - 48} y1="29" x2={trackWidth - 48} y2="215" stroke="#57E7FF" strokeWidth="3" />
            <SvgText x={trackWidth - 46} y="17" fill="#57E7FF" fontSize="9" fontWeight="800">FİNİŞ</SvgText>
            {(state?.course ?? []).map((hazard, i) => {
              const x = 62 + (trackWidth - 138) * i / 5;
              return <G key={`${hazard.kind}-${i}`} opacity={i === (state?.round ?? 1) - 1 ? 1 : 0.5}>
                <Circle cx={x} cy={laneY[hazard.lane]} r="14" fill={hazard.kind === 'ice' ? '#163C55' : hazard.kind === 'mud' ? '#493620' : hazard.kind === 'ramp' ? '#3C2E56' : '#3D2738'} stroke={hazard.kind === 'ice' ? '#7DD3FC' : hazard.kind === 'mud' ? '#FBBF24' : hazard.kind === 'ramp' ? '#C4B5FD' : '#FDA4AF'} strokeWidth="1.5" />
                <SvgText x={x} y={laneY[hazard.lane] + 4} textAnchor="middle" fill="#FFF" fontSize="11" fontWeight="900">{hazardIcon(hazard.kind)}</SvgText>
              </G>;
            })}
            {sorted.map((player, index) => {
              const lanePlayers = sorted.filter(candidate => candidate.parkourLane === player.parkourLane);
              const laneIndex = lanePlayers.findIndex(candidate => candidate.id === player.id);
              const laneOffset = (laneIndex - (lanePlayers.length - 1) / 2) * 18;
              const y = (laneY[player.parkourLane] ?? laneY[1]) + laneOffset;
              const x = Math.min(trackWidth - 48, xAt(player.parkourPosition));
              const isMe = player.id === currentPlayer?.id;
              return <G key={player.id}>
                {isMe ? <Circle cx={x} cy={y} r="15" fill="none" stroke="#F8FAFC" strokeWidth="1.5" opacity="0.9" /> : null}
                <Circle cx={x} cy={y} r="11" fill={laneColors[index % laneColors.length]} stroke="#07151F" strokeWidth="2" />
                <SvgText x={x} y={y + 3.5} textAnchor="middle" fill="#06111C" fontSize="8" fontWeight="900">{player.name.trim().slice(0, 1).toLocaleUpperCase('tr-TR')}</SvgText>
              </G>;
            })}
          </Svg>
          <View style={s.trackLegend}><Text style={s.legendText}>● SENİN BİLYEN</Text><Text style={s.legendText}>❄ BUZ</Text><Text style={s.legendText}>▲ RAMPA</Text><Text style={s.legendText}>▤ KAPI</Text></View>
        </View>

        {state?.phase === 'finished' ? (
          <View style={s.finishCard}>
            <Trophy size={34} color="#FFD166" />
            <Text style={s.finishTitle}>{state.winnerIds.includes(currentPlayer?.id ?? '') ? 'Parkurun şampiyonu sensin!' : 'Yarış tamamlandı!'}</Text>
            <Text style={s.finishCopy}>{state.result ?? 'Finiş çizgisi geçildi.'}</Text>
            <Pressable onPress={() => void leave()} style={s.primary}><RotateCcw size={17} color="#06131C" /><Text style={s.primaryText}>Oyun salonuna dön</Text></Pressable>
          </View>
        ) : state?.phase === 'report' ? (
          <View style={s.report}><Text style={s.reportTitle}>Bu etabın sonucu</Text><Text style={s.reportText}>{state.report?.message ?? 'Bilyeler parkurda ilerledi.'}</Text><Text style={s.muted}>Sıradaki etap otomatik açılıyor.</Text></View>
        ) : state?.canAct && !state.pausedAt ? (
          <View style={s.controls}>
            <View style={s.controlsHeading}><View><Text style={s.trackEyebrow}>HAMLE SIRASI SENDE</Text><Text style={s.controlTitle}>Atışını ayarla</Text></View><View style={s.energy}><Zap size={15} color="#FFD166" /><Text style={s.energyText}>{state.me?.boosts ?? 0} takviye</Text></View></View>
            <Text style={s.label}>YÖN · {aim < 0 ? `SOL ${Math.abs(aim)}°` : aim > 0 ? `SAĞ ${aim}°` : 'DÜZ'}</Text>
            <View style={s.adjustRow}><Pressable onPress={() => setAim(value => Math.max(-25, value - 5))} style={s.adjust}><Text style={s.adjustText}>− SOL</Text></Pressable><View style={s.direction}><Footprints color="#57E7FF" size={19} /><Text style={s.directionText}>{aim === 0 ? 'DÜZ' : aim < 0 ? 'SOLA KIR' : 'SAĞA KIR'}</Text></View><Pressable onPress={() => setAim(value => Math.min(25, value + 5))} style={s.adjust}><Text style={s.adjustText}>SAĞ +</Text></Pressable></View>
            <View style={s.scale}>{[-25, -15, -5, 0, 5, 15, 25].map(value => <Pressable key={value} onPress={() => setAim(value)} style={[s.scalePoint, aim === value && s.scaleActive]}><Text style={[s.scaleText, aim === value && s.scaleTextActive]}>{value === 0 ? 'DÜZ' : value}</Text></Pressable>)}</View>
            <View style={s.powerHeader}><Text style={s.label}>FIRLATMA GÜCÜ</Text><Text style={s.powerValue}>{power}%</Text></View>
            <View style={s.adjustRow}><Pressable onPress={() => setPower(value => Math.max(35, value - 5))} style={s.powerAdjust}><Text style={s.adjustText}>− AZALT</Text></Pressable><View style={s.powerBar}><View style={[s.powerFill, { width: `${(power - 35) / 65 * 100}%` }]} /></View><Pressable onPress={() => setPower(value => Math.min(100, value + 5))} style={s.powerAdjust}><Text style={s.adjustText}>ARTIR +</Text></Pressable></View>
            <Pressable disabled={(state.me?.boosts ?? 0) < 1} onPress={() => setBoost(value => !value)} style={[s.boost, boost && s.boostActive, (state.me?.boosts ?? 0) < 1 && s.disabled]}><Zap size={17} color={boost ? '#FFD166' : '#A7BCC8'} /><Text style={[s.boostText, boost && { color: '#FFD166' }]}>{boost ? 'TAKVİYE AÇIK · +13 İLERLEME' : 'ENERJİ TAKVİYESİ KULLAN'}</Text><Text style={s.boostHint}>İki kez</Text></Pressable>
            <View style={s.tip}><Text style={s.tipText}>{hazardKind === 'mud' ? 'Çamurlu şeritten kaç; yanlış şerit ilerlemeni yavaşlatır.' : hazardKind === 'ice' ? 'Buzda keskin dönüşe dikkat; bilyen yön değiştirebilir.' : hazardKind === 'ramp' ? 'Rampada yüksek güç ekstra sıçrama sağlar.' : 'Kapıdan kaçınmak için başka şeride kır.'}</Text></View>
            <Pressable disabled={busy} onPress={() => void submit()} style={[s.primary, busy && s.disabled]}>{busy ? <ActivityIndicator color="#06131C" /> : <><Zap size={18} color="#06131C" /><Text style={s.primaryText}>HAMLEYİ KİLİTLE</Text></>}</Pressable>
          </View>
        ) : (
          <View style={s.waiting}><ActivityIndicator color="#57E7FF" /><Text style={s.waitingText}>{state?.pausedAt ? 'Ev sahibi yarışı duraklattı.' : 'Diğer oyuncular hamlelerini yapıyor…'}</Text><Text style={s.muted}>Hamleler kilitlenince parkur sonucu birlikte açılacak.</Text></View>
        )}

        <View style={s.ranking}>
          <View style={s.rankingHeader}><Text style={s.rankingTitle}>Yarış sıralaması</Text><Text style={s.muted}>{state?.players.length ?? 0} yarışçı</Text></View>
          {sorted.map((player, index) => (
            <View key={player.id} style={s.playerRow}>
              <Text style={[s.rank, index === 0 && { color: '#FFD166' }]}>{index + 1}</Text>
              <View style={[s.avatar, { backgroundColor: laneColors[index % laneColors.length] }]}><Text style={s.avatarText}>{player.name.trim().slice(0, 1).toLocaleUpperCase('tr-TR')}</Text></View>
              <View style={{ flex: 1 }}><Text style={s.playerName} numberOfLines={1}>{player.name}{player.isBot ? ' · BOT' : ''}</Text><View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.max(3, player.parkourPosition)}%`, backgroundColor: laneColors[index % laneColors.length] }]} /></View></View>
              <Text style={s.distance}>{player.parkourPosition} m</Text>
            </View>
          ))}
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 42, gap: 16, maxWidth: 820, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#142635', alignItems: 'center', justifyContent: 'center' },
  kicker: { color: '#8CA7B7', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 }, title: { color: '#F3F8FC', fontSize: 25, fontWeight: '900', marginTop: 2 }, pause: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: '#234659', backgroundColor: '#102633', alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', gap: 7 }, pill: { flex: 1, minHeight: 34, borderRadius: 12, backgroundColor: '#102331', borderWidth: 1, borderColor: '#1D3949', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }, pillText: { color: '#D7E7EF', fontSize: 9, fontWeight: '900', letterSpacing: 0.55 }, urgent: { borderColor: '#F97316', backgroundColor: '#341C20' },
  trackCard: { backgroundColor: '#0D1C29', borderWidth: 1, borderColor: '#203949', borderRadius: 24, padding: 13, overflow: 'hidden' }, trackHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5, paddingTop: 4 }, trackEyebrow: { color: '#57E7FF', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, trackTitle: { color: '#F4F7FA', fontSize: 15, fontWeight: '900', marginTop: 4 }, trackMark: { color: '#88A1AF', fontWeight: '900', fontSize: 11 }, trackLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingBottom: 3 }, legendText: { color: '#76909F', fontSize: 8, fontWeight: '900' },
  controls: { backgroundColor: '#0E202D', borderWidth: 1, borderColor: '#244355', borderRadius: 24, padding: 17, gap: 13 }, controlsHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }, controlTitle: { color: '#F2F8FB', fontSize: 20, fontWeight: '900', marginTop: 3 }, energy: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2B281C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }, energyText: { color: '#FFD166', fontSize: 11, fontWeight: '900' }, label: { color: '#8AA3B1', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, adjust: { minWidth: 74, height: 43, borderRadius: 13, borderWidth: 1, borderColor: '#315063', backgroundColor: '#132B3A', alignItems: 'center', justifyContent: 'center' }, adjustText: { color: '#D9E9EF', fontSize: 10, fontWeight: '900' }, direction: { flex: 1, height: 43, borderRadius: 13, backgroundColor: '#0A1722', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, directionText: { color: '#57E7FF', fontSize: 11, fontWeight: '900' }, scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -5 }, scalePoint: { minWidth: 34, paddingVertical: 6, alignItems: 'center', borderRadius: 9, backgroundColor: '#122432' }, scaleActive: { backgroundColor: '#57E7FF' }, scaleText: { color: '#91A7B3', fontSize: 9, fontWeight: '800' }, scaleTextActive: { color: '#07151F' },
  powerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, powerValue: { color: '#F4F8FA', fontSize: 15, fontWeight: '900' }, powerAdjust: { minWidth: 70, height: 37, borderRadius: 12, backgroundColor: '#142B39', alignItems: 'center', justifyContent: 'center' }, powerBar: { flex: 1, height: 10, borderRadius: 99, backgroundColor: '#203B4A', overflow: 'hidden' }, powerFill: { height: '100%', borderRadius: 99, backgroundColor: '#57E7FF' }, boost: { minHeight: 45, borderRadius: 14, borderWidth: 1, borderColor: '#324756', backgroundColor: '#14232E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, position: 'relative' }, boostActive: { borderColor: '#8B6B32', backgroundColor: '#302A1B' }, boostText: { color: '#C6D5DC', fontSize: 10, fontWeight: '900' }, boostHint: { position: 'absolute', right: 11, color: '#7F94A0', fontSize: 8, fontWeight: '800' }, disabled: { opacity: 0.55 }, tip: { backgroundColor: '#0A1822', borderRadius: 12, padding: 11 }, tipText: { color: '#9FB3BE', fontSize: 11, lineHeight: 16 }, primary: { minHeight: 49, borderRadius: 15, backgroundColor: '#57E7FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#07151F', fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },
  waiting: { minHeight: 118, borderRadius: 21, backgroundColor: '#0E202D', borderWidth: 1, borderColor: '#203949', alignItems: 'center', justifyContent: 'center', padding: 18, gap: 9 }, waitingText: { color: '#ECF4F8', fontWeight: '900', fontSize: 14 }, muted: { color: '#79919E', fontSize: 10, fontWeight: '700', textAlign: 'center' }, report: { backgroundColor: '#112633', borderWidth: 1, borderColor: '#2B6073', borderRadius: 21, padding: 17, gap: 7 }, reportTitle: { color: '#57E7FF', fontWeight: '900', fontSize: 10, letterSpacing: 1.3 }, reportText: { color: '#F2F7FA', fontSize: 16, fontWeight: '900' },
  ranking: { backgroundColor: '#0D1C29', borderWidth: 1, borderColor: '#203949', borderRadius: 22, padding: 15, gap: 13 }, rankingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, rankingTitle: { color: '#F4F8FA', fontSize: 15, fontWeight: '900' }, playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, rank: { width: 18, color: '#6E8795', fontSize: 12, fontWeight: '900', textAlign: 'center' }, avatar: { width: 31, height: 31, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#07151F', fontWeight: '900', fontSize: 13 }, playerName: { color: '#DBE7EC', fontSize: 11, fontWeight: '800', marginBottom: 5 }, progressTrack: { width: '100%', height: 5, borderRadius: 99, backgroundColor: '#1B3341', overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 99 }, distance: { color: '#AAC0CB', fontSize: 10, fontWeight: '900', minWidth: 36, textAlign: 'right' },
  finishCard: { alignItems: 'center', gap: 9, backgroundColor: '#14251F', borderColor: '#87713D', borderWidth: 1, borderRadius: 22, padding: 20 }, finishTitle: { color: '#FFF2C5', fontSize: 19, fontWeight: '900', textAlign: 'center' }, finishCopy: { color: '#C6C3A9', fontSize: 12, textAlign: 'center', marginBottom: 5 }, error: { color: '#FF9A9A', textAlign: 'center', fontSize: 12, fontWeight: '700' },
});
