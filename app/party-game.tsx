import { selectPartySnapshot } from '@/features/party/state';
import { getServerNowMs } from '@/services/serverClock';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  LogOut,
  Pause,
  Play,
  BookOpen,
  Send,
  Check,
  Clock3,
} from 'lucide-react-native';
import { Screen, Avatar } from '@/components/ui';
import { useGameStore } from '@/store/gameStore';
import { ensureSupabase } from '@/lib/supabase/client';
import {
  partyGame,
  PHASE_NAMES,
  ROLE_NAMES,
  SITES,
  SCENES,
  COLOR_NAMES,
  type PartyState,
} from '@/features/party/catalog';
import { SceneCrop } from '@/components/party/SceneCrop';

export default function PartyGameScreen() {
  const {
    roomCode,
    currentPlayer,
    service,
    setRoomCode,
    setRoomState,
    refreshRoom,
  } = useGameStore();
  const [state, setState] = useState<PartyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(getServerNowMs);
  const [rules, setRules] = useState(false);
  const [exit, setExit] = useState(false);
  const flight = useRef(false);
  const load = useCallback(async () => {
    if (!roomCode) return;
    const { data, error: e } = await ensureSupabase().rpc(
      'party_state_secure',
      { p_room_code: roomCode },
    );
    if (e) throw e;
    if (data?.phase === 'lobby') {
      router.replace('/lobby');
      return;
    }
    if (data) setState(previous => selectPartySnapshot(previous, data as PartyState));
  }, [roomCode]);
  useEffect(() => {
    if (!roomCode) {
      router.replace('/game-modes');
      return;
    }
    let disposed = false,
      inFlight = false;
    const poll = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const sb = ensureSupabase();
        let { data, error: e } = await sb.rpc('party_state_secure', {
          p_room_code: roomCode,
        });
        if (e) throw e;
        if (disposed) return;
        if (data?.phase === 'lobby') {
          router.replace('/lobby');
          return;
        }
        if (
          data?.deadline &&
          !data.pausedAt &&
          Date.parse(data.deadline) <= getServerNowMs()
        ) {
          const advanced = await sb.rpc('party_advance_secure', {
            p_room_code: roomCode,
            p_step: data.step,
          });
          if (advanced.error) throw advanced.error;
          const fresh = await sb.rpc('party_state_secure', {
            p_room_code: roomCode,
          });
          if (fresh.error) throw fresh.error;
          data = fresh.data;
        }
        if (!disposed && data) {
          setState(previous => selectPartySnapshot(previous, data as PartyState));
          setError(null);
        }
      } catch (cause) {
        if (!disposed)
          setError(
            cause instanceof Error
              ? cause.message
              : ((cause as { message?: string })?.message ??
                  'Bağlantı yenileniyor.'),
          );
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1800);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [roomCode]);
  useEffect(() => {
    const timer = setInterval(() => setNow(getServerNowMs()), 250);
    return () => clearInterval(timer);
  }, []);
  const step = state?.step,
    isHost = state?.isHost,
    paused = !!state?.pausedAt,
    finished = state?.phase === 'finished';
  useEffect(() => {
    if (!roomCode || !step || !isHost || paused || finished) return;
    let stopped = false,
      running = false;
    const tick = async () => {
      if (stopped || running) return;
      running = true;
      try {
        const sb = ensureSupabase();
        const view = await sb.rpc('party_state_secure', {
          p_room_code: roomCode,
        });
        if (view.error) throw view.error;
        if (stopped || view.data?.step !== step) return;
        const bots = (view.data as PartyState).players.filter(
          (p) => p.isBot && !p.submitted,
        );
        for (const bot of bots) {
          if (stopped) return;
          const result = await sb.rpc('party_bot_turn_secure', {
            p_room_code: roomCode,
            p_bot_id: bot.id,
            p_step: step,
          });
          if (result.error) throw result.error;
        }
        if (!stopped) await load();
      } catch (cause) {
        if (!stopped)
          setError(
            (cause as { message?: string })?.message ??
              'Bot hamlesi yeniden denenecek.',
          );
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, 2200);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [roomCode, step, isHost, paused, finished, load]);
  const act = async (fn: () => Promise<unknown>) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (cause) {
      setError(
        (cause as { message?: string })?.message ?? 'Hamle gönderilemedi.',
      );
      try {
        await load();
      } catch {
        /* the poll retries */
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const result = await ensureSupabase().rpc(name, {
      p_room_code: roomCode,
      ...args,
    });
    if (result.error) throw result.error;
  };
  const submit = (payload: Record<string, unknown>) =>
    act(() =>
      rpc('party_action_secure', { p_step: state!.step, p_payload: payload }),
    );
  const leave = () =>
    act(async () => {
      await service.leaveRoom(roomCode!);
      setRoomCode(null);
      setRoomState(null);
      router.replace('/(tabs)');
    });
  if (!state || !currentPlayer)
    return (
      <Screen>
        <View style={s.loading}>
          <ActivityIndicator color="#bca0e3" />
          <Text style={s.muted}>Oyun masası hazırlanıyor…</Text>
          {error && <Text style={s.error}>{error}</Text>}
          <Pressable onPress={() => router.replace('/lobby')}>
            <Text style={s.link}>Lobiye dön</Text>
          </Pressable>
        </View>
      </Screen>
    );
  const game = partyGame(state.mode);
  const seconds = state.deadline
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(state.deadline) -
            (state.pausedAt ? Date.parse(state.pausedAt) : now)) /
            1000,
        ),
      )
    : 0;
  const name = (id?: string) =>
    state.players.find((p) => p.id === id)?.name ?? 'Oyuncu';
  return (
    <Screen padded={false} gradient={false}>
      <LinearGradient
        pointerEvents="none"
        colors={[game.background, game.surface, game.background]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Oyundan çık"
            onPress={() => setExit(true)}
            style={s.icon}
          >
            <LogOut size={19} color="#d8cce5" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[s.kicker, { color: game.accent }]}>{game.badge}</Text>
            <Text style={s.title}>{game.name}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Oyun kuralları"
            onPress={() => setRules(true)}
            style={s.icon}
          >
            <BookOpen size={19} color={game.accent} />
          </Pressable>
        </View>
        <View style={s.status}>
          <Text style={s.muted}>
            {state.mode === 'kayip_kare'
              ? 'Tek karşılaşma'
              : `Tur ${state.round} / ${state.public.rounds}`}{' '}
            · {PHASE_NAMES[state.phase]}
          </Text>
          {!finished && (
            <View style={s.timer}>
              <Clock3 size={15} color={seconds < 8 ? '#ff8f93' : game.accent} />
              <Text
                style={[
                  s.timerText,
                  { color: seconds < 8 ? '#ff8f93' : game.accent },
                ]}
              >
                {paused ? 'DURAKLATILDI' : `${seconds} sn`}
              </Text>
            </View>
          )}
        </View>
        {error && (
          <View accessibilityRole="alert" style={s.errorBox}>
            <Text style={s.error}>{error}</Text>
            <Pressable onPress={() => void act(load)}>
              <Text style={s.link}>Yenile</Text>
            </Pressable>
          </View>
        )}
        {paused && (
          <Text style={s.notice}>
            Ev sahibi oyunu duraklattı. Süre ve hamleler beklemede.
          </Text>
        )}
        <View style={[s.board, { borderColor: game.accent + '55' }]}>
          <Text style={s.emblem}>{game.emoji}</Text>
          {state.mode === 'tilki_soygunu' && (
            <>
              <Text style={s.boardTitle}>
                Bir ekip. Beş iş. İki çalma hakkı.
              </Text>
              <Meter
                label="ALARM"
                value={state.public.alarm ?? 0}
                max={3}
                color="#ff7283"
              />
              <View style={s.row}>
                <Stat label="Başarılı iş" value={state.public.successes ?? 0} />
                <Stat
                  label="Ganimetin"
                  value={
                    state.players.find((p) => p.id === currentPlayer.id)
                      ?.score ?? 0
                  }
                />
                <Stat label="Çalma hakkın" value={state.me.steals} />
              </View>
              <Text style={s.hint}>
                Her işte en az {Math.ceil(state.players.length / 2)} kasa açıcı
                ve 1 gözcü gerekli.
              </Text>
            </>
          )}
          {state.mode === 'kizil_pakt' && (
            <>
              <Text style={s.boardTitle}>Köy bu gece kime güveniyor?</Text>
              <Meter
                label="KAYBEDİLEN ERZAK"
                value={state.public.damage ?? 0}
                max={3}
                color="#ff7283"
              />
              <View style={s.sites}>
                {SITES.map((site, i) => (
                  <View key={site} style={s.site}>
                    <Text style={s.siteEmoji}>{['🌾', '📦', '🌉'][i]}</Text>
                    <Text style={s.siteText}>{site}</Text>
                    <Text style={s.small}>
                      {state.public.events?.[i]?.damage
                        ? `Sabotaj: ${state.public.events[i].damage}`
                        : state.public.events?.[i]?.protected
                          ? 'Korundu'
                          : '—'}
                    </Text>
                  </View>
                ))}
              </View>
              {state.public.exposed?.length ? (
                <Text style={s.notice}>
                  İfşa edilenler: {state.public.exposed.map(name).join(', ')}
                </Text>
              ) : null}
            </>
          )}
          {state.mode === 'kilit_altinda' && (
            <>
              <Text style={s.boardTitle}>Çözüm üç farklı elde.</Text>
              <Meter
                label="AÇILAN KİLİT"
                value={state.public.locks ?? 0}
                max={4}
                color={game.accent}
              />
              <Meter
                label="GÜVENLİK HATASI"
                value={state.public.errors ?? 0}
                max={3}
                color="#ff7283"
              />
              <Text style={s.hint}>
                1 Mercan · 2 Mavi · 3 Sarı. Önce ipuçlarını birleştirin, sonra
                aynı sırada uzlaşın.
              </Text>
            </>
          )}
          {state.mode === 'kayip_kare' && (
            <>
              <Text style={s.boardTitle}>
                {finished ? 'Ortak sahne açıldı.' : 'Bütünü kimse görmüyor.'}
              </Text>
              <SceneCrop
                scene={
                  finished
                    ? (state.public.scene ?? state.me.scene ?? 0)
                    : (state.me.scene ?? 0)
                }
                crop={
                  ((state.me.crop ?? 0) + (state.phase === 'detail' ? 1 : 0)) %
                  4
                }
                full={finished}
              />
              {!finished && (
                <Text style={s.hint}>
                  Gördüğünü tarif et; ekran görüntüsünü paylaşma. Görseldeki
                  ortaklıkları ve çelişkileri takip et.
                </Text>
              )}
            </>
          )}
          {state.mode === 'gece_pazari' && (
            <>
              <Text style={s.boardTitle}>Sandık #{state.round}</Text>
              <Text style={s.hint}>
                Satıcı: {name(state.public.seller)} · Gerçek değer 0–8
              </Text>
              <View style={s.row}>
                <Stat label="Paran" value={state.me.coins} />
                <Stat label="Aldığın sandık" value={state.me.assetCount} />
              </View>
              {state.public.pitch && (
                <View style={s.pitch}>
                  <Text style={s.kicker}>SATICININ SÖZÜ</Text>
                  <Text style={s.quote}>“{state.public.pitch}”</Text>
                </View>
              )}
            </>
          )}
        </View>
        {!finished && (
          <View style={[s.private, { borderColor: game.accent + '66' }]}>
            <Text style={[s.kicker, { color: game.accent }]}>
              YALNIZCA SANA GÖRÜNÜR
            </Text>
            <Text style={s.role}>
              {ROLE_NAMES[state.me.role] ?? state.me.role}
            </Text>
            {state.mode === 'kizil_pakt' && state.me.role === 'keeper' && (
              <Text style={s.privateText}>
                Kalan koruma hakkın: {state.me.protects} / 2
              </Text>
            )}
            {state.me.hint && (
              <Text style={s.privateText}>{state.me.hint}</Text>
            )}
            {state.me.suspects?.length ? (
              <Text style={s.privateText}>
                İz: {state.me.suspects.map(name).join(' / ')}. Bu iki adaydan
                biri gizli tilki; hangisi olduğunu çıkar.
              </Text>
            ) : null}
            {state.mode === 'kizil_pakt' &&
              state.me.detained >= state.round && (
                <Text style={s.notice}>
                  Gözetimdesin. Bu gece sabotaj yapamazsın; oyuna devam edersin.
                </Text>
              )}
            {state.me.allies?.length ? (
              <Text style={s.privateText}>
                Diğer Kızıl Tilki: {state.me.allies.map(name).join(', ')}
              </Text>
            ) : null}
            {state.me.role === 'fox' && state.me.exposed && (
              <Text style={s.notice}>
                İfşa edildin. Sabotaj yetkin kapandı, fakat konuşmaya ve
                oylamaya devam edersin.
              </Text>
            )}
          </View>
        )}
        {state.phase === 'report' ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Turun hikâyesi</Text>
            <Text style={s.body}>{state.report.message}</Text>
            <ReportDetails state={state} name={name} />
            {state.isHost ? (
              <ActionButton
                title="Sonraki aşama →"
                color={game.accent}
                disabled={busy || paused}
                onPress={() =>
                  void act(() =>
                    rpc('party_advance_secure', { p_step: state.step }),
                  )
                }
              />
            ) : (
              <Text style={s.hint}>
                Sonraki aşama süre dolunca otomatik açılır.
              </Text>
            )}
          </View>
        ) : finished ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>
              {state.winnerIds.includes(currentPlayer.id)
                ? 'Kazandın!'
                : 'Final'}
            </Text>
            <Text style={s.body}>{state.result}</Text>
            {state.players
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((p) => (
                <View
                  key={p.id}
                  style={[s.player, state.winnerIds.includes(p.id) && s.winner]}
                >
                  <Avatar avatarKey={p.avatarKey} userId={p.id} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.playerName}>{p.name}</Text>
                    <Text style={s.small}>
                      {ROLE_NAMES[p.role ?? ''] ?? ''}
                      {p.isBot ? ' · Test botu' : ''}
                    </Text>
                  </View>
                  <Text style={[s.score, { color: game.accent }]}>
                    {p.score}
                  </Text>
                </View>
              ))}
            {state.isHost && (
              <ActionButton
                title="Aynı ekiple yeniden oyna"
                color={game.accent}
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    await service.rematch(roomCode!);
                    await refreshRoom();
                    router.replace('/lobby');
                  })
                }
              />
            )}
            <ActionButton
              title="Odayı bırak ve oyunları keşfet"
              color="#b1a0c9"
              disabled={busy}
              onPress={() => setExit(true)}
            />
          </View>
        ) : (
          <>
            <View style={s.progress}>
              <Text style={s.muted}>
                {state.submittedCount}/{state.totalCount} hamle kilitlendi
              </Text>
              <View style={s.dots}>
                {state.players.map((p) => (
                  <View
                    key={p.id}
                    style={[
                      s.dot,
                      {
                        backgroundColor: p.submitted
                          ? game.accent
                          : '#ffffff22',
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
            <TurnInput
              key={`${roomCode}:${state.step}`}
              state={state}
              myId={currentPlayer.id}
              disabled={busy || paused || !state.canAct}
              submit={(payload) => void submit(payload)}
            />
            {!state.canAct && (
              <Text style={s.notice}>
                {state.phase === 'last_guess'
                  ? 'Sahtekarın son tahmini bekleniyor.'
                  : state.phase === 'pitch'
                    ? 'Satıcı açıklamasını hazırlıyor.'
                    : 'Hamlen kilitli. Diğer oyuncular bekleniyor; süre dolunca oyun ilerler.'}
              </Text>
            )}
          </>
        )}
        {state.public.clues?.length ||
        state.public.details?.length ||
        state.public.claims?.length ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>Ortak iz panosu</Text>
            {[
              ...(state.public.clues ?? []),
              ...(state.public.details ?? []),
            ].map((c, i) => (
              <Text key={i} style={s.body}>
                <Text style={s.strong}>{name(c.playerId)}: </Text>
                {c.text}
              </Text>
            ))}
            {state.public.claims?.map((c) => (
              <Text key={c.playerId} style={s.body}>
                {name(c.playerId)} → {SITES[Number(c.site)]}
              </Text>
            ))}
          </View>
        ) : null}
        {!finished && (
          <Chat
            key={state.step}
            state={state}
            busy={busy || paused}
            send={(text) =>
              void act(() =>
                rpc('party_message_secure', {
                  p_step: state.step,
                  p_text: text,
                }),
              )
            }
          />
        )}
        <View style={s.panel}>
          <Text style={s.panelTitle}>Masadaki ekip</Text>
          {state.players.map((p) => (
            <View key={p.id} style={s.player}>
              <Avatar avatarKey={p.avatarKey} userId={p.id} size={32} />
              <Text style={[s.playerName, { flex: 1 }]}>
                {p.name}
                {p.id === currentPlayer.id ? ' · Sen' : ''}
              </Text>
              <Text style={s.small}>
                {p.isBot ? '🤖 ' : ''}
                {p.submitted ? '✓ Kilitli' : finished ? 'Final' : 'Masada'}
              </Text>
            </View>
          ))}
        </View>
        {state.isHost && !finished && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void act(() => rpc('party_pause_secure', { p_paused: !paused }))
            }
            style={s.pause}
          >
            {paused ? (
              <Play color="#dacde7" size={16} />
            ) : (
              <Pause color="#dacde7" size={16} />
            )}
            <Text style={s.link}>
              {paused ? 'Oyunu sürdür' : 'Oyunu duraklat'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
      <Modal
        visible={rules}
        transparent
        animationType="fade"
        onRequestClose={() => setRules(false)}
      >
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: game.surface }]}>
            <Text style={s.panelTitle}>{game.name} nasıl oynanır?</Text>
            {game.steps.map((line, i) => (
              <Text key={line} style={s.body}>
                {i + 1}. {line}
              </Text>
            ))}
            <ActionButton
              title="Anladım, oyuna dön"
              color={game.accent}
              onPress={() => setRules(false)}
            />
          </View>
        </View>
      </Modal>
      <Modal
        visible={exit}
        transparent
        animationType="fade"
        onRequestClose={() => setExit(false)}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.panelTitle}>Masadan ayrılıyor musun?</Text>
            <Text style={s.body}>
              Diğer oyuncular süre kurallarıyla devam edebilir. Yeniden girmek
              için oda kodu gerekir.
            </Text>
            <ActionButton
              title="Oyunda kal"
              color={game.accent}
              onPress={() => setExit(false)}
            />
            <ActionButton
              title="Odadan ayrıl"
              color="#ff8e99"
              disabled={busy}
              onPress={() => void leave()}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
function TurnInput({
  state,
  myId,
  disabled,
  submit,
}: {
  state: PartyState;
  myId: string;
  disabled: boolean;
  submit: (payload: Record<string, unknown>) => void;
}) {
  const [choice, setChoice] = useState('');
  const [site, setSite] = useState(0);
  const [claim, setClaim] = useState(0);
  const [text, setText] = useState('');
  const [bid, setBid] = useState(0);
  const [scene, setScene] = useState(0);
  const g = partyGame(state.mode);
  let payload: Record<string, unknown> = {},
    valid = true;
  if (state.phase === 'plan' || state.phase === 'lock') {
    payload = { choice };
    valid = !!choice && (state.phase !== 'lock' || choice.length === 3);
  }
  if (state.phase === 'night') {
    payload = { choice: choice || 'work', site, claim };
  }
  if (state.phase === 'vote') {
    payload = { target: choice };
    valid = !!choice;
  }
  if (['clue', 'detail', 'pitch'].includes(state.phase)) {
    payload = { text: text.trim() };
    valid = text.trim().length >= 2;
  }
  if (state.phase === 'bid') payload = { bid };
  if (state.phase === 'last_guess') payload = { scene };
  return (
    <View style={s.panel}>
      <Text style={s.panelTitle}>{PHASE_NAMES[state.phase]}</Text>
      {state.phase === 'plan' && (
        <View style={s.actions}>
          {[
            ['open', '🔓', 'Kasayı aç', 'Başarı için ekip gerekiyor'],
            ['guard', '👁️', 'Gözcü ol', 'En az bir gözcü gerekli'],
            ['steal', '💰', 'Paydan çal', `${state.me.steals} hakkın kaldı`],
          ].map(([id, icon, title, detail]) => (
            <Choice
              key={id}
              selected={choice === id}
              disabled={disabled || (id === 'steal' && state.me.steals < 1)}
              title={`${icon} ${title}`}
              detail={detail}
              color={g.accent}
              onPress={() => setChoice(id)}
            />
          ))}
        </View>
      )}
      {state.phase === 'night' && (
        <>
          <Text style={s.hint}>Gerçekte nereye gideceksin?</Text>
          <View style={s.choices}>
            {SITES.map((title, i) => (
              <Chip
                key={title}
                title={title}
                selected={site === i}
                disabled={disabled}
                onPress={() => setSite(i)}
              />
            ))}
          </View>
          <Text style={s.hint}>Köye nerede olduğunu söyleyeceksin?</Text>
          <View style={s.choices}>
            {SITES.map((title, i) => (
              <Chip
                key={title}
                title={title}
                selected={claim === i}
                disabled={disabled}
                onPress={() => setClaim(i)}
              />
            ))}
          </View>
          <View style={s.choices}>
            {[
              'work',
              ...(state.me.role === 'keeper' && state.me.protects > 0
                ? ['protect']
                : []),
              ...(state.me.role === 'fox' &&
              !state.me.exposed &&
              state.me.detained < state.round
                ? ['sabotage']
                : []),
            ].map((id) => (
              <Chip
                key={id}
                title={
                  {
                    work: 'İzle / çalış',
                    protect: 'Konumu koru',
                    sabotage: 'Sabotaj yap',
                  }[id] ?? id
                }
                selected={(choice || 'work') === id}
                disabled={disabled}
                onPress={() => setChoice(id)}
              />
            ))}
          </View>
        </>
      )}
      {state.phase === 'lock' && (
        <>
          <Text style={s.body}>
            İpuçlarını sohbetten birleştirin. Sonra renkleri doğru sırayla seç.
          </Text>
          <View style={s.lockSlots}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[s.lockSlot, { borderColor: g.accent }]}>
                <Text style={s.lockText}>
                  {choice[i] ? COLOR_NAMES[choice[i]] : '?'}
                </Text>
              </View>
            ))}
          </View>
          <View style={s.choices}>
            {['1', '2', '3'].map((id) => (
              <Pressable
                key={id}
                disabled={
                  disabled || choice.includes(id) || choice.length === 3
                }
                accessibilityRole="button"
                onPress={() => setChoice((v) => v + id)}
                style={[
                  s.colorPad,
                  {
                    backgroundColor: {
                      '1': '#ee8c80',
                      '2': '#7cbaf2',
                      '3': '#efcf72',
                    }[id],
                  },
                  choice.includes(id) && { opacity: 0.3 },
                ]}
              >
                <Text style={s.padText}>
                  {id} {COLOR_NAMES[id]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable disabled={disabled} onPress={() => setChoice('')}>
            <Text style={s.link}>Sırayı temizle</Text>
          </Pressable>
        </>
      )}
      {state.phase === 'vote' &&
        state.players
          .filter((p) => p.id !== myId && !state.public.exposed?.includes(p.id))
          .map((p) => (
            <Choice
              key={p.id}
              title={p.name}
              detail="Gizli oy"
              selected={choice === p.id}
              color={g.accent}
              disabled={disabled}
              onPress={() => setChoice(p.id)}
            />
          ))}
      {['clue', 'detail', 'pitch'].includes(state.phase) && (
        <>
          <Text style={s.body}>
            {state.phase === 'pitch'
              ? 'Sandığın için ikna edici bir açıklama yaz. Gerçek değeri yalnız sen biliyorsun.'
              : state.phase === 'detail'
                ? 'Yeni karedeki ışık veya yön işaretini tarif et.'
                : 'Kendi karende gördüğün bir ayrıntıyı anlat. Sahnenin adını doğrudan yazmamaya çalış.'}
          </Text>
          <TextInput
            accessibilityLabel="Gözlem veya satış açıklaması"
            value={text}
            onChangeText={setText}
            maxLength={120}
            editable={!disabled}
            placeholder="2–120 karakter…"
            placeholderTextColor="#9b91aa"
            multiline
            style={s.input}
          />
        </>
      )}
      {state.phase === 'bid' && (
        <>
          <Text style={s.body}>
            Teklifler kapalıdır. 0 ile pas geçebilirsin. Eşit en yüksek teklif
            satış yapmaz.
          </Text>
          <View style={s.bidRow}>
            <Chip
              title="−"
              disabled={disabled || bid <= 0}
              onPress={() => setBid((v) => v - 1)}
            />
            <Text style={[s.bid, { color: g.accent }]}>{bid}</Text>
            <Chip
              title="+"
              disabled={disabled || bid >= state.me.coins}
              onPress={() => setBid((v) => v + 1)}
            />
          </View>
          <Text style={s.hint}>En fazla {state.me.coins} jeton</Text>
        </>
      )}
      {state.phase === 'last_guess' && (
        <View style={s.choices}>
          {SCENES.map((title, i) => (
            <Chip
              key={title}
              title={title}
              selected={scene === i}
              disabled={disabled}
              onPress={() => setScene(i)}
            />
          ))}
        </View>
      )}
      <ActionButton
        title={
          disabled
            ? 'Bu aşama için bekle'
            : state.phase === 'bid' && bid === 0
              ? 'Pas geç · 0 jeton'
              : 'Hamleni kilitle ✓'
        }
        color={g.accent}
        disabled={disabled || !valid}
        onPress={() => submit(payload)}
      />
    </View>
  );
}
function Chat({
  state,
  busy,
  send,
}: {
  state: PartyState;
  busy: boolean;
  send: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <View style={s.panel}>
      <Text style={s.panelTitle}>Ekip kanalı</Text>
      <Text style={s.small}>
        Aşama başına 2 kısa mesaj. İpucunu paylaşabilir veya blöf yapabilirsin.
      </Text>
      {state.messages.map((m) => (
        <Text key={m.id} style={s.body}>
          <Text style={s.strong}>
            {state.players.find((p) => p.id === m.playerId)?.name}:{' '}
          </Text>
          {m.text}
        </Text>
      ))}
      {state.mode === 'kilit_altinda' && state.me.hint && (
        <Pressable disabled={busy} onPress={() => send(state.me.hint!)}>
          <Text style={s.link}>Kendi ipucumu ekiple paylaş ↗</Text>
        </Pressable>
      )}
      <View style={s.chatInput}>
        <TextInput
          value={text}
          onChangeText={setText}
          maxLength={120}
          editable={!busy}
          placeholder="Kısa mesaj…"
          placeholderTextColor="#9b91aa"
          style={[s.input, { flex: 1, minHeight: 45 }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mesajı gönder"
          disabled={busy || !text.trim()}
          style={s.icon}
          onPress={() => {
            send(text.trim());
            setText('');
          }}
        >
          <Send color="#d4b8ef" size={20} />
        </Pressable>
      </View>
    </View>
  );
}
function ReportDetails({
  state,
  name,
}: {
  state: PartyState;
  name: (id?: string) => string;
}) {
  const d = state.report.details;
  if (Array.isArray(d))
    return (
      <>
        {d.map((row, i) => (
          <Text key={i} style={s.body}>
            {name(row.playerId)}:{' '}
            {{
              open: 'Kasayı açtı',
              guard: 'Gözcü oldu',
              steal: 'Paydan çaldı',
            }[row.choice as string] ??
              row.text ??
              SITES[Number(row.site)] ??
              'Pas'}
          </Text>
        ))}
      </>
    );
  if (
    state.mode === 'kilit_altinda' &&
    d &&
    typeof d === 'object' &&
    'answer' in d
  )
    return (
      <Text style={s.hint}>
        Doğru sıra:{' '}
        {String(d.answer)
          .split('')
          .map((x) => COLOR_NAMES[x])
          .join(' → ')}
      </Text>
    );
  return null;
}
function ActionButton({
  title,
  color,
  disabled,
  onPress,
}: {
  title: string;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: color },
        (disabled || pressed) && { opacity: disabled ? 0.4 : 0.8 },
      ]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
function Chip({
  title,
  selected,
  disabled,
  onPress,
}: {
  title: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.chip, selected && s.chosen, disabled && { opacity: 0.4 }]}
    >
      <Text style={s.chipText}>{title}</Text>
    </Pressable>
  );
}
function Choice({
  title,
  detail,
  selected,
  disabled,
  color,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.choice,
        selected && { borderColor: color, backgroundColor: color + '18' },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.choiceTitle}>{title}</Text>
        <Text style={s.small}>{detail}</Text>
      </View>
      {selected && <Check color={color} size={20} />}
    </Pressable>
  );
}
function Meter({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <View style={s.meter}>
      <Text style={s.kicker}>
        {label} · {value}/{max}
      </Text>
      <View style={s.meterRow}>
        {Array.from({ length: max }, (_, i) => (
          <View
            key={i}
            style={[
              s.meterBlock,
              { backgroundColor: i < value ? color : '#ffffff18' },
            ]}
          />
        ))}
      </View>
    </View>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.stat}>
      <Text style={s.statNumber}>{value}</Text>
      <Text style={s.small}>{label}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  content: {
    padding: 18,
    paddingBottom: 45,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#ffffff0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    color: '#baa6ca',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  title: { color: '#fff', fontSize: 25, fontWeight: '900', marginTop: 4 },
  status: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  timer: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: '#ffffff09',
    borderRadius: 16,
    padding: 10,
  },
  timerText: { fontSize: 11, fontWeight: '900' },
  muted: { color: '#baadc8', fontSize: 12, lineHeight: 18 },
  board: {
    borderRadius: 27,
    borderWidth: 1,
    padding: 22,
    gap: 17,
    backgroundColor: '#ffffff05',
  },
  emblem: { fontSize: 48, textAlign: 'center' },
  boardTitle: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
    textAlign: 'center',
  },
  hint: { color: '#bdb3cc', fontSize: 12, lineHeight: 19, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'space-around' },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  statNumber: { color: '#fff', fontSize: 28, fontWeight: '900' },
  small: { color: '#a99bb8', fontSize: 10, lineHeight: 16 },
  meter: { gap: 8 },
  meterRow: { flexDirection: 'row', gap: 7 },
  meterBlock: { flex: 1, height: 10, borderRadius: 5 },
  sites: { flexDirection: 'row', gap: 8 },
  site: {
    flex: 1,
    backgroundColor: '#ffffff08',
    borderRadius: 17,
    padding: 10,
    alignItems: 'center',
    gap: 8,
  },
  siteEmoji: { fontSize: 26 },
  siteText: { color: '#d6c9e4', fontSize: 10, fontWeight: '800' },
  private: {
    padding: 18,
    borderWidth: 1,
    borderRadius: 21,
    backgroundColor: '#00000022',
    gap: 8,
  },
  role: { color: '#fff', fontSize: 18, fontWeight: '800' },
  privateText: { color: '#f2e4ff', fontSize: 15, lineHeight: 23 },
  panel: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#ffffff07',
    borderWidth: 1,
    borderColor: '#ffffff12',
    gap: 14,
  },
  panelTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  body: { color: '#d3c8e0', fontSize: 13, lineHeight: 21 },
  strong: { fontWeight: '900', color: '#eee4f7' },
  notice: {
    color: '#e9c796',
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'center',
  },
  progress: { alignItems: 'center', gap: 9 },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  actions: { gap: 10 },
  choice: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ffffff22',
    backgroundColor: '#ffffff04',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  choiceTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 5,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ffffff30',
    backgroundColor: '#ffffff08',
  },
  chosen: { backgroundColor: '#b9a0ed33', borderColor: '#c5a7f5' },
  chipText: { color: '#e6daef', fontSize: 12, fontWeight: '800' },
  button: {
    padding: 16,
    minHeight: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#1d1628',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  input: {
    borderRadius: 15,
    padding: 14,
    minHeight: 95,
    borderWidth: 1,
    borderColor: '#ffffff25',
    backgroundColor: '#00000020',
    color: '#f2e8fc',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  lockSlots: { flexDirection: 'row', gap: 8 },
  lockSlot: {
    flex: 1,
    paddingVertical: 22,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: '#00000020',
  },
  lockText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  colorPad: { padding: 14, borderRadius: 14, flex: 1, alignItems: 'center' },
  padText: { color: '#172535', fontSize: 11, fontWeight: '900' },
  bidRow: {
    flexDirection: 'row',
    gap: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bid: { fontSize: 52, fontWeight: '900' },
  pitch: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#ffffff08',
    gap: 9,
  },
  quote: { color: '#fff', fontSize: 16, lineHeight: 23, fontStyle: 'italic' },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff0a',
  },
  playerName: { color: '#e4daee', fontSize: 12, fontWeight: '800' },
  winner: {
    backgroundColor: '#bcf2b514',
    borderRadius: 13,
    paddingHorizontal: 9,
  },
  score: { fontSize: 24, fontWeight: '900' },
  chatInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pause: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    padding: 10,
  },
  link: { color: '#cfb0f4', fontSize: 12, fontWeight: '800' },
  errorBox: {
    padding: 15,
    borderRadius: 16,
    backgroundColor: '#982d4433',
    gap: 10,
  },
  error: { color: '#ffb4bd', fontSize: 12, lineHeight: 19 },
  overlay: {
    flex: 1,
    backgroundColor: '#000b',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  modal: {
    width: '100%',
    maxWidth: 500,
    padding: 24,
    borderRadius: 25,
    backgroundColor: '#2c1d3c',
    gap: 18,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
});
