import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, Polygon, Rect, Stop, Text as SvgText, LinearGradient as SvgGradient } from 'react-native-svg';
import { router } from 'expo-router';
import { ArrowLeft, Check, Flag, Gem, RotateCcw, Trophy } from 'lucide-react-native';
import { Screen } from '@/components/ui';
import { ensureSupabase } from '@/lib/supabase/client';
import { useGameStore } from '@/store/gameStore';
import { getServerNowMs } from '@/services/serverClock';
import { soundService } from '@/services/soundService';
import {
  PLATFORMER_ACCELERATION,
  PLATFORMER_BALL_RADIUS,
  PLATFORMER_GRAVITY,
  PLATFORMER_JUMP_SPEED,
  PLATFORMER_MAX_SPEED,
  PLATFORMER_STAGES,
} from '@/features/party/platformer';
import type { PlatformerStage } from '@/features/party/platformer';

type RunnerPlayer = {
  id: string;
  name: string;
  avatarKey: string;
  isBot: boolean;
  stage: number;
  stageStartedAt: string;
  stageTimes: number[];
  totalElapsedMs: number;
  deaths: number;
  finished: boolean;
  botReadyAt?: string | null;
};
type RunnerState = {
  mode: 'kizilkure_parkuru';
  phase: 'lobby' | 'race' | 'finished';
  stageCount: number;
  isHost: boolean;
  deadline: string | null;
  winnerId: string | null;
  players: RunnerPlayer[];
  me: RunnerPlayer | null;
};
type Pose = { x: number; y: number; rotation: number };
type Physics = Pose & { vx: number; vy: number; grounded: boolean; checkpoint: number; deaths: number; gems: Set<number> };
type Direction = 'left' | 'right' | 'jump';

const BALL = PLATFORMER_BALL_RADIUS;
const COURSE_HEIGHT = 260;
const formatTime = (milliseconds: number) => {
  const seconds = Math.max(0, milliseconds) / 1000;
  return `${seconds.toFixed(2)} sn`;
};

export default function KizilkureParkuruScreen() {
  const { width } = useWindowDimensions();
  const { roomCode, currentPlayer, service, setRoomCode, setRoomState } = useGameStore();
  const [state, setState] = useState<RunnerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(getServerNowMs);
  const [viewportWidth, setViewportWidth] = useState(Math.max(320, Math.min(760, width - 36)));
  const [pose, setPose] = useState<Pose>({ x: 48, y: 186, rotation: 0 });
  const [checkpointLabel, setCheckpointLabel] = useState('BAŞLANGIÇ');
  const [gemsCollected, setGemsCollected] = useState(0);
  const [stageSubmitting, setStageSubmitting] = useState(false);
  const inputs = useRef({ left: false, right: false, jump: false });
  const jumpRequested = useRef(false);
  const frame = useRef<Physics>({ x: 48, y: 186, rotation: 0, vx: 0, vy: 0, grounded: true, checkpoint: 48, deaths: 0, gems: new Set() });
  const lastTick = useRef(0);
  const tickNo = useRef(0);
  const finishing = useRef(false);
  const alive = useRef(true);
  const flight = useRef(false);
  const priorStage = useRef(0);
  const botCalls = useRef(new Set<string>());

  const stageNumber = state?.me?.stage ?? 1;
  const stage: PlatformerStage = PLATFORMER_STAGES[Math.max(0, Math.min(PLATFORMER_STAGES.length - 1, stageNumber - 1))];
  const me = state?.me;
  const isFinished = state?.phase === 'finished' || !!me?.finished;
  const startTime = me?.stageStartedAt ? Date.parse(me.stageStartedAt) : 0;
  const canPlay = state?.phase === 'race' && !!me && !me.finished && !stageSubmitting && now >= startTime;
  const sortedPlayers = useMemo(() => [...(state?.players ?? [])].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return a.totalElapsedMs - b.totalElapsedMs;
    if (a.stage !== b.stage) return b.stage - a.stage;
    return a.totalElapsedMs - b.totalElapsedMs;
  }), [state?.players]);

  const refresh = useCallback(async () => {
    if (!roomCode) return;
    const { data, error: rpcError } = await ensureSupabase().rpc('kizilkure_state_secure', { p_room_code: roomCode });
    if (rpcError) throw rpcError;
    const next = data as RunnerState | null;
    if (!next || next.phase === 'lobby') {
      router.replace('/lobby');
      return;
    }
    if (alive.current) setState(next);
  }, [roomCode]);

  useEffect(() => {
    alive.current = true;
    if (!roomCode) { router.replace('/game-modes'); return; }
    let disposed = false;
    let running = false;
    const poll = async () => {
      if (disposed || running) return;
      running = true;
      try {
        const { data, error: rpcError } = await ensureSupabase().rpc('kizilkure_state_secure', { p_room_code: roomCode });
        if (rpcError) throw rpcError;
        const next = data as RunnerState | null;
        if (disposed) return;
        if (!next || next.phase === 'lobby') { router.replace('/lobby'); return; }
        setState(next);
        setError(null);
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Parkur durumu alınamadı. Bağlantı tekrar deneniyor.');
      } finally { running = false; }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 950);
    return () => { disposed = true; alive.current = false; clearInterval(timer); };
  }, [roomCode]);

  useEffect(() => {
    const timer = setInterval(() => setNow(getServerNowMs()), 100);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!me || priorStage.current === me.stage) return;
    priorStage.current = me.stage;
    const nextStage = PLATFORMER_STAGES[me.stage - 1];
    if (!nextStage) return;
    finishing.current = false;
    setStageSubmitting(false);
    setCheckpointLabel('BAŞLANGIÇ');
    setGemsCollected(0);
    frame.current = {
      x: nextStage.startX,
      y: (nextStage.platforms[0]?.y ?? 204) - BALL,
      rotation: 0,
      vx: 0,
      vy: 0,
      grounded: true,
      checkpoint: nextStage.startX,
      deaths: 0,
      gems: new Set(),
    };
    setPose({ x: nextStage.startX, y: (nextStage.platforms[0]?.y ?? 204) - BALL, rotation: 0 });
    void soundService.play('true', 0.28);
  }, [me?.stage]);

  const finishStage = useCallback(async (stageToFinish: number) => {
    if (!roomCode || finishing.current || flight.current || !state?.me || state.me.stage !== stageToFinish) return;
    finishing.current = true;
    flight.current = true;
    setStageSubmitting(true);
    setError(null);
    void soundService.play('true', 0.5);
    try {
      const { error: rpcError } = await ensureSupabase().rpc('kizilkure_finish_stage_secure', {
        p_room_code: roomCode,
        p_stage: stageToFinish,
        p_deaths: frame.current.deaths,
        p_gems: frame.current.gems.size,
      });
      if (rpcError) throw rpcError;
      await refresh();
    } catch (cause) {
      finishing.current = false;
      setError(cause instanceof Error ? cause.message : 'Etap süresi kaydedilemedi. Yeniden dene.');
    } finally {
      flight.current = false;
      setStageSubmitting(false);
    }
  }, [roomCode, state?.me, refresh]);

  useEffect(() => {
    if (pose.x >= stage.finishX - BALL && canPlay) void finishStage(stageNumber);
  }, [pose.x, stage.finishX, stageNumber, canPlay, finishStage]);

  useEffect(() => {
    if (!roomCode || !state?.isHost || state.phase !== 'race') return;
    const timer = setInterval(() => {
      const bots = state.players.filter(player => player.isBot && !player.finished && player.stage <= PLATFORMER_STAGES.length);
      for (const bot of bots) {
        const pendingKey = `${bot.id}:${bot.stage}`;
        if (bot.botReadyAt && getServerNowMs() >= Date.parse(bot.botReadyAt) && !botCalls.current.has(pendingKey)) {
          botCalls.current.add(pendingKey);
          void (async () => {
            try {
              const { error: rpcError } = await ensureSupabase().rpc('kizilkure_bot_stage_secure', {
                p_room_code: roomCode,
                p_bot_id: bot.id,
                p_stage: bot.stage,
              });
              if (rpcError) setError(rpcError.message);
              else void refresh();
            } finally {
              botCalls.current.delete(pendingKey);
            }
          })();
        }
      }
    }, 850);
    return () => clearInterval(timer);
  }, [roomCode, state?.isHost, state?.phase, state?.players, refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['arrowleft', 'a'].includes(key)) inputs.current.left = true;
      if (['arrowright', 'd'].includes(key)) inputs.current.right = true;
      if (['arrowup', 'w', ' '].includes(key)) {
        if (!inputs.current.jump) jumpRequested.current = true;
        inputs.current.jump = true;
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['arrowleft', 'a'].includes(key)) inputs.current.left = false;
      if (['arrowright', 'd'].includes(key)) inputs.current.right = false;
      if (['arrowup', 'w', ' '].includes(key)) inputs.current.jump = false;
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    }
  }, []);

  useEffect(() => {
    if (!canPlay || !state?.me) return;
    let raf = 0;
    const animate = (timestamp: number) => {
      const body = frame.current;
      const delta = lastTick.current ? Math.min(2.5, (timestamp - lastTick.current) / 16.67) : 1;
      lastTick.current = timestamp;
      if (inputs.current.left !== inputs.current.right) {
        body.vx += (inputs.current.right ? 1 : -1) * PLATFORMER_ACCELERATION * delta;
      } else {
        body.vx *= Math.pow(0.82, delta);
      }
      body.vx = Math.max(-PLATFORMER_MAX_SPEED, Math.min(PLATFORMER_MAX_SPEED, body.vx));
      if (jumpRequested.current && body.grounded) {
        body.vy = -PLATFORMER_JUMP_SPEED;
        body.grounded = false;
        void soundService.play('click', 0.2);
      }
      jumpRequested.current = false;
      const oldBottom = body.y + BALL;
      body.x = Math.max(0, Math.min(stage.length - BALL, body.x + body.vx * delta));
      body.y += body.vy * delta;
      body.vy += PLATFORMER_GRAVITY * delta;
      body.grounded = false;
      for (const platform of stage.platforms) {
        const overlapsX = body.x + BALL * 0.75 > platform.x && body.x - BALL * 0.75 < platform.x + platform.width;
        if (overlapsX && oldBottom <= platform.y + 5 && body.y + BALL >= platform.y && body.vy >= 0) {
          body.y = platform.y - BALL;
          body.vy = 0;
          body.grounded = true;
        }
      }
      const hazardHit = stage.hazards.some(hazard =>
        body.x + BALL * 0.65 > hazard.x
        && body.x - BALL * 0.65 < hazard.x + hazard.width
        && body.y + BALL > hazard.y - 4
        && body.y - BALL < hazard.y + 21
      );
      if (hazardHit || body.y > COURSE_HEIGHT + 44) {
        body.x = body.checkpoint;
        const support = [...stage.platforms].reverse().find(platform => body.x >= platform.x && body.x <= platform.x + platform.width);
        body.y = (support?.y ?? stage.platforms[0].y) - BALL;
        body.vx = 0;
        body.vy = 0;
        body.grounded = true;
        body.deaths += 1;
        void soundService.play('zartalanma', 0.25);
      }
      const checkpoint = stage.checkpoints.findIndex(x => body.x >= x && body.checkpoint < x);
      if (checkpoint >= 0) {
        body.checkpoint = stage.checkpoints[checkpoint];
        setCheckpointLabel(`KONTROL ${checkpoint + 1}`);
        void soundService.play('true', 0.2);
      }
      stage.gems.forEach((gem, index) => {
        if (body.gems.has(index)) return;
        if (Math.hypot(gem.x - body.x, gem.y - body.y) <= BALL + 16) {
          body.gems.add(index);
          setGemsCollected(body.gems.size);
          void soundService.play('true', 0.18);
        }
      });
      body.rotation += body.vx * delta * 2.5;
      tickNo.current += 1;
      if (tickNo.current % 2 === 0) setPose({ x: body.x, y: body.y, rotation: body.rotation });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      lastTick.current = 0;
    };
  }, [canPlay, state?.me?.stage, stage]);

  const setDirection = (direction: Direction, pressed: boolean) => {
    if (direction === 'jump') {
      if (pressed && !inputs.current.jump) jumpRequested.current = true;
      inputs.current.jump = pressed;
      return;
    }
    inputs.current[direction] = pressed;
  };

  const leave = async () => {
    if (!roomCode || busy) return;
    setBusy(true);
    try {
      await service.leaveRoom(roomCode);
      setRoomCode(null);
      setRoomState(null);
      router.replace('/(tabs)/oyna');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Parkurdan çıkılamadı.');
    } finally { setBusy(false); }
  };

  const retryStage = () => void finishStage(stageNumber);
  const stageElapsed = me?.stageStartedAt
    ? Math.max(0, now - Date.parse(me.stageStartedAt))
    : 0;
  const currentElapsed = (me?.totalElapsedMs ?? 0) + (!me?.finished ? stageElapsed : 0);
  const cameraX = Math.max(0, Math.min(stage.length - viewportWidth, pose.x - viewportWidth * 0.34));
  const backgroundDots = [120, 390, 690, 1010, 1325, 1535];
  const winner = state?.players.find(player => player.id === state.winnerId);

  return (
    <Screen edges={['top']}>
      <LinearGradient pointerEvents="none" colors={['#171626', '#11141E', '#15121C']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <View style={s.top}>
          <Pressable onPress={() => void leave()} style={s.back} accessibilityRole="button" accessibilityLabel="Parkurdan çık"><ArrowLeft size={19} color="#F5E8E5" /></Pressable>
          <View style={{ flex: 1 }}><Text style={s.kicker}>KIZILKUYRUK · SÜRELİ PARKUR</Text><Text style={s.title}>Kızılküre Parkuru</Text></View>
          <View style={s.stageBadge}><Text style={s.stageBadgeText}>{isFinished ? 'FİNİŞ' : `ETAP ${stageNumber}/3`}</Text></View>
        </View>

        {!state ? (
          <View style={s.loading}><ActivityIndicator color="#FF806C" /><Text style={s.muted}>Parkur hazırlanıyor…</Text></View>
        ) : (
          <>
            <View style={s.statsRow}>
              <View style={s.statCard}><Text style={s.statLabel}>TOPLAM SÜRE</Text><Text style={s.statValue}>{formatTime(currentElapsed)}</Text></View>
              <View style={s.statCard}><Text style={s.statLabel}>KONTROL NOKTASI</Text><Text style={s.statValueSmall}>{checkpointLabel}</Text></View>
              <View style={s.statCard}><Gem size={14} color="#FFE17D" /><Text style={s.statValueSmall}>{gemsCollected}/{stage.gems.length}</Text></View>
            </View>

            <View style={s.courseCard} onLayout={event => setViewportWidth(Math.max(300, Math.min(820, event.nativeEvent.layout.width - 22)))}>
              <View style={s.courseHeading}>
                <View style={{ flex: 1 }}><Text style={s.stageEyebrow}>ETAP {stageNumber} · {stage.name.toLocaleUpperCase('tr-TR')}</Text><Text style={s.stageSubtitle}>{stage.subtitle}</Text></View>
                {stageSubmitting ? <ActivityIndicator color="#FF8F7E" /> : now < startTime
                  ? <Text style={s.stageClock}>HAZIRLAN…</Text>
                  : <Text style={s.stageClock}>{formatTime(stageElapsed)}</Text>}
              </View>
              <View style={s.canvasWrap}>
                <Svg width="100%" height={260} viewBox={`${cameraX} 0 ${viewportWidth} ${COURSE_HEIGHT}`} onLayout={event => setViewportWidth(Math.max(300, Math.min(820, event.nativeEvent.layout.width)))}>
                  <Defs>
                    <SvgGradient id="sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={stage.background[0]} /><Stop offset="1" stopColor={stage.background[1]} /></SvgGradient>
                    <SvgGradient id="orb" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFB18B" /><Stop offset="0.35" stopColor="#FF665C" /><Stop offset="1" stopColor="#CF334C" /></SvgGradient>
                    <SvgGradient id="platform" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={stage.highlight} /><Stop offset="0.22" stopColor={stage.ground} /><Stop offset="1" stopColor="#283344" /></SvgGradient>
                  </Defs>
                  <Rect x={cameraX} y="0" width={viewportWidth} height={COURSE_HEIGHT} fill="url(#sky)" />
                  <Circle cx={cameraX + viewportWidth * 0.78} cy="43" r="24" fill="#FFF2AF" opacity="0.62" />
                  {backgroundDots.map((x, index) => <Circle key={`star-${x}`} cx={x} cy={45 + (index % 3) * 28} r={index % 2 ? 3 : 4} fill="#FFF6C9" opacity="0.76" />)}
                  <Path d={`M ${cameraX - 30} 170 Q ${cameraX + viewportWidth * 0.22} 84 ${cameraX + viewportWidth * 0.47} 171 T ${cameraX + viewportWidth + 60} 150 L ${cameraX + viewportWidth + 60} 260 L ${cameraX - 30} 260 Z`} fill="#263651" opacity="0.34" />
                  <Path d={`M ${cameraX - 30} 192 Q ${cameraX + viewportWidth * 0.2} 129 ${cameraX + viewportWidth * 0.43} 190 T ${cameraX + viewportWidth + 60} 177 L ${cameraX + viewportWidth + 60} 260 L ${cameraX - 30} 260 Z`} fill="#263B4A" opacity="0.38" />
                  {stage.platforms.map((platform, index) => (
                    <G key={`platform-${index}`}>
                      <Rect x={platform.x} y={platform.y} width={platform.width} height={platform.height} rx="11" fill="url(#platform)" stroke={stage.highlight} strokeOpacity="0.56" strokeWidth="2" />
                      <Rect x={platform.x + 6} y={platform.y + 7} width={Math.max(0, platform.width - 12)} height="8" rx="4" fill={stage.highlight} opacity="0.7" />
                      {Array.from({ length: Math.floor(platform.width / 58) }, (_, dot) => <Circle key={`stone-${index}-${dot}`} cx={platform.x + 28 + dot * 58} cy={platform.y + 37} r="3" fill="#D1E3C7" opacity="0.26" />)}
                    </G>
                  ))}
                  {stage.hazards.map((hazard, index) => {
                    const count = Math.max(2, Math.floor(hazard.width / 16));
                    const triangleWidth = hazard.width / count;
                    return <G key={`spike-${index}`}>
                      {Array.from({ length: count }, (_, spike) => <Polygon key={`spike-${index}-${spike}`} points={`${hazard.x + spike * triangleWidth},${hazard.y} ${hazard.x + (spike + 0.5) * triangleWidth},${hazard.y - 24} ${hazard.x + (spike + 1) * triangleWidth},${hazard.y}`} fill="#F56B75" stroke="#FFD0A6" strokeWidth="1.3" />)}
                    </G>;
                  })}
                  {stage.checkpoints.map((x, index) => (
                    <G key={`checkpoint-${x}`}>
                      <Line x1={x} y1="86" x2={x} y2={stage.platforms.find(p => x >= p.x && x <= p.x + p.width)?.y ?? 204} stroke="#F9F4DF" strokeWidth="4" />
                      <Path d={`M ${x + 2} 88 l 45 12 -45 13 Z`} fill={checkpointLabel === `KONTROL ${index + 1}` ? '#FFE17D' : '#D8E7E7'} />
                    </G>
                  ))}
                  {stage.gems.map((gem, index) => !frame.current.gems.has(index) ? <G key={`gem-${index}`}>
                    <Circle cx={gem.x} cy={gem.y} r="13" fill="#FFE17D" opacity="0.2" />
                    <Polygon points={`${gem.x},${gem.y - 10} ${gem.x + 4},${gem.y - 3} ${gem.x + 11},${gem.y} ${gem.x + 4},${gem.y + 3} ${gem.x},${gem.y + 10} ${gem.x - 4},${gem.y + 3} ${gem.x - 11},${gem.y} ${gem.x - 4},${gem.y - 3}`} fill="#FFE17D" stroke="#FFF8D2" strokeWidth="1.5" />
                  </G> : null)}
                  <G>
                    <Line x1={stage.finishX} y1="48" x2={stage.finishX} y2="203" stroke="#FFF6D2" strokeWidth="5" />
                    <Path d={`M ${stage.finishX + 3} 51 h 48 v 38 h -48 Z`} fill="#FFF3CF" />
                    <Path d={`M ${stage.finishX + 3} 51 h 24 v 19 h -24 Z M ${stage.finishX + 27} 70 h 24 v 19 h -24 Z`} fill="#FF665C" />
                    <SvgText x={stage.finishX + 8} y="108" fill="#FFF4D5" fontSize="11" fontWeight="900">FİNİŞ</SvgText>
                  </G>
                  {me && !me.finished ? <G transform={`translate(${pose.x}, ${pose.y}) rotate(${pose.rotation})`}>
                    <Ellipse cx="0" cy="17" rx="19" ry="5" fill="#12212B" opacity="0.28" />
                    <Circle cx="0" cy="0" r={BALL} fill="url(#orb)" stroke="#FFCFAB" strokeWidth="2" />
                    <Ellipse cx="-6" cy="-8" rx="7" ry="4" fill="#FFE3C8" opacity="0.58" />
                    <Ellipse cx="-6" cy="2" rx="2.2" ry="4.1" fill="#22283A" />
                    <Ellipse cx="6" cy="2" rx="2.2" ry="4.1" fill="#22283A" />
                    <Path d="M -5 9 Q 0 13 6 8" fill="none" stroke="#8E293B" strokeWidth="1.8" strokeLinecap="round" />
                    <Path d="M -2 -17 Q 3 -25 9 -18" fill="none" stroke="#FDBA7B" strokeWidth="2" strokeLinecap="round" />
                  </G> : null}
                </Svg>
              </View>
              {isFinished ? (
                <View style={s.finishBanner}>
                  <Trophy color="#FFE17D" size={28} />
                  <Text style={s.finishTitle}>{winner?.id === currentPlayer?.id ? 'PARKUR ŞAMPİYONU!' : 'ÜÇ ETAP TAMAMLANDI!'}</Text>
                  <Text style={s.finishCopy}>{winner ? `${winner.name} · ${formatTime(winner.totalElapsedMs)}` : 'Süreler kaydedildi.'}</Text>
                  <Pressable onPress={() => void leave()} style={s.leaveButton}><RotateCcw color="#1C1721" size={17} /><Text style={s.leaveButtonText}>Oyun salonuna dön</Text></Pressable>
                </View>
              ) : error ? (
                <View style={s.errorBox}><Text style={s.errorText}>{error}</Text>{pose.x >= stage.finishX - BALL ? <Pressable onPress={retryStage} style={s.retry}><Text style={s.retryText}>ETABI KAYDET</Text></Pressable> : null}</View>
              ) : stageSubmitting ? (
                <View style={s.stageWait}><ActivityIndicator color="#FF806C" /><Text style={s.muted}>Etap süren kaydediliyor…</Text></View>
              ) : null}
            </View>

            {canPlay && !error ? (
              <View style={s.controls}>
                <View style={s.controlGroup}>
                  <HoldButton label="◀" hint="SOL" onHold={pressed => setDirection('left', pressed)} />
                  <HoldButton label="▶" hint="SAĞ" onHold={pressed => setDirection('right', pressed)} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Zıpla"
                  onPressIn={() => setDirection('jump', true)}
                  onPressOut={() => setDirection('jump', false)}
                  style={({ pressed }) => [s.jumpButton, pressed && s.jumpPressed]}
                >
                  <Text style={s.jumpGlyph}>↑</Text><Text style={s.jumpLabel}>ZIPLA</Text>
                </Pressable>
              </View>
            ) : null}
            <Text style={s.hint}>Klavyede A/D veya ←/→ ile hareket et · W, ↑ ya da Boşluk ile zıpla</Text>

            <View style={s.ranking}>
              <View style={s.rankingHeader}><View><Text style={s.rankingTitle}>Canlı yarış sırası</Text><Text style={s.rankingSubtitle}>Süreler sunucu saatinden kaydedilir</Text></View><View style={s.livePill}><View style={s.liveDot} /><Text style={s.liveText}>CANLI</Text></View></View>
              {sortedPlayers.map((player, index) => {
                const activeMs = !player.finished && now >= Date.parse(player.stageStartedAt) ? now - Date.parse(player.stageStartedAt) : 0;
                const shownTotal = player.totalElapsedMs + activeMs;
                return <View key={player.id} style={s.playerRow}>
                  <Text style={[s.rank, index === 0 && player.finished && { color: '#FFE17D' }]}>{index + 1}</Text>
                  <View style={[s.playerOrb, { backgroundColor: index === 0 ? '#FF7565' : '#685BC2' }]}><Text style={s.playerOrbText}>{player.name.trim().slice(0, 1).toLocaleUpperCase('tr-TR')}</Text></View>
                  <View style={{ flex: 1 }}><View style={s.playerNameLine}><Text style={s.playerName} numberOfLines={1}>{player.name}{player.isBot ? ' · BOT' : ''}</Text><Text style={s.playerProgress}>{player.finished ? 'FİNİŞ' : `ETAP ${Math.min(player.stage, 3)}/3`}</Text></View><View style={s.splits}>{[0, 1, 2].map(i => <Text key={i} style={[s.split, i < player.stageTimes.length && s.splitDone]}>{player.stageTimes[i] !== undefined ? `${(player.stageTimes[i] / 1000).toFixed(1)}s` : `E${i + 1} ···`}</Text>)}</View></View>
                  <Text style={s.totalTime}>{formatTime(shownTotal)}</Text>
                </View>;
              })}
            </View>
          </>
        )}
        {error && !isFinished && pose.x < stage.finishX - BALL ? <Text style={s.footerError}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function HoldButton({ label, hint, onHold }: { label: string; hint: string; onHold: (pressed: boolean) => void }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={hint === 'SOL' ? 'Sola ilerle' : 'Sağa ilerle'}
    onPressIn={() => onHold(true)}
    onPressOut={() => onHold(false)}
    style={({ pressed }) => [s.directionButton, pressed && s.directionPressed]}
  ><Text style={s.directionGlyph}>{label}</Text><Text style={s.directionHint}>{hint}</Text></Pressable>;
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 42, gap: 14, maxWidth: 920, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  back: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#242433', borderWidth: 1, borderColor: '#39384B' },
  kicker: { color: '#B2A9C8', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#FFF7F2', fontSize: 23, fontWeight: '900', marginTop: 2 },
  stageBadge: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 13, backgroundColor: '#38252D', borderWidth: 1, borderColor: '#8C4550' },
  stageBadgeText: { color: '#FFB8A8', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  loading: { minHeight: 230, borderRadius: 23, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1B1B29' },
  muted: { color: '#C1BBCB', fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, minHeight: 69, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9, gap: 5, backgroundColor: '#201F2C', borderWidth: 1, borderColor: '#353445', justifyContent: 'center' },
  statLabel: { color: '#A9A0B8', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  statValue: { color: '#FFF6EC', fontSize: 16, fontWeight: '900' },
  statValueSmall: { color: '#FFF0D4', fontSize: 11, fontWeight: '900' },
  courseCard: { backgroundColor: '#1B1B29', borderWidth: 1, borderColor: '#383746', borderRadius: 23, padding: 11, gap: 9, overflow: 'hidden' },
  courseHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 3, minHeight: 43 },
  stageEyebrow: { color: '#FFB18E', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  stageSubtitle: { color: '#DDD4DE', fontSize: 10, marginTop: 3 },
  stageClock: { color: '#FFF4D3', fontSize: 14, fontWeight: '900' },
  canvasWrap: { borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF42' },
  finishBanner: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, padding: 15, backgroundColor: '#292536' },
  finishTitle: { color: '#FFF0C2', fontWeight: '900', fontSize: 17, textAlign: 'center' },
  finishCopy: { color: '#D6CFD6', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  leaveButton: { marginTop: 3, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 13, backgroundColor: '#FFB866', flexDirection: 'row', alignItems: 'center', gap: 7 },
  leaveButtonText: { color: '#1C1721', fontSize: 11, fontWeight: '900' },
  stageWait: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 8 },
  errorBox: { alignItems: 'center', gap: 7, padding: 9, borderRadius: 13, backgroundColor: '#40252C' },
  errorText: { color: '#FFD5D0', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  retry: { borderRadius: 10, backgroundColor: '#FFB866', paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { color: '#211824', fontSize: 10, fontWeight: '900' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  controlGroup: { flexDirection: 'row', gap: 9 },
  directionButton: { width: 72, height: 67, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#262537', borderWidth: 1, borderColor: '#494558' },
  directionPressed: { backgroundColor: '#454055', transform: [{ scale: 0.96 }] },
  directionGlyph: { color: '#FFF5F0', fontSize: 26, lineHeight: 30, fontWeight: '900' },
  directionHint: { color: '#B4AABD', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  jumpButton: { flex: 1, maxWidth: 190, height: 67, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF7565', borderWidth: 1, borderColor: '#FFB49A', shadowColor: '#FF5849', shadowOpacity: 0.27, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  jumpPressed: { backgroundColor: '#FFA080', transform: [{ scale: 0.97 }] },
  jumpGlyph: { color: '#2B1D28', fontSize: 22, lineHeight: 25, fontWeight: '900' },
  jumpLabel: { color: '#2B1D28', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  hint: { color: '#91899F', textAlign: 'center', fontSize: 9, fontWeight: '700' },
  ranking: { backgroundColor: '#1E1D2A', borderWidth: 1, borderColor: '#383746', borderRadius: 21, padding: 14, gap: 13 },
  rankingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rankingTitle: { color: '#FFF6F0', fontSize: 15, fontWeight: '900' },
  rankingSubtitle: { color: '#A99FB4', fontSize: 9, marginTop: 2 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 99, backgroundColor: '#24362F' },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#66D8A1' },
  liveText: { color: '#9AE3B8', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  playerRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { width: 17, color: '#928BA1', textAlign: 'center', fontSize: 11, fontWeight: '900' },
  playerOrb: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF66' },
  playerOrbText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  playerNameLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  playerName: { flex: 1, color: '#EDE5EE', fontWeight: '800', fontSize: 10 },
  playerProgress: { color: '#D6B7A9', fontSize: 8, fontWeight: '900' },
  splits: { flexDirection: 'row', gap: 7, marginTop: 4 },
  split: { color: '#756E82', fontSize: 8, fontWeight: '700' },
  splitDone: { color: '#A4E5C1' },
  totalTime: { minWidth: 63, textAlign: 'right', color: '#FFF0D5', fontSize: 9, fontWeight: '900' },
  footerError: { color: '#FFB9B0', textAlign: 'center', fontSize: 11, fontWeight: '700' },
});
