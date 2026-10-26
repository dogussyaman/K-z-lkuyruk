import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Compass, Flame, Footprints, Leaf, Map, Pickaxe, ShieldCheck, Tent, Timer, Trophy, TreePine, Users, Waves } from 'lucide-react-native';
import { Screen } from '@/components/ui';
import { useGameStore } from '@/store/gameStore';
import { ensureSupabase } from '@/lib/supabase/client';

type TeamStats = { progress: number; fragments: number; food: number; rope: number; torch: number; morale: number };
type PlayerRow = { player_id: string; name: string; avatar_key?: string; team_id?: string | null };
type LogRow = { turn: number; team: string; action: string; message: string; at?: string };
type ForestState = {
  phase: 'lobby' | 'expedition' | 'finished'; turn_number: number; current_team: string;
  team_state: Record<string, TeamStats>; last_action?: LogRow | null; event_log?: LogRow[];
  winner?: string | null; phase_deadline_at?: string | null; state_version?: number;
  my_team?: string | null; is_host?: boolean; players: PlayerRow[];
};

const ACTIONS = [
  { id: 'explore', title: 'Keşfe çık', detail: 'Patikada ilerle, harita parçası ara.', icon: Compass, color: '#7BC96F' },
  { id: 'forage', title: 'Erzak topla', detail: 'Eksilen ip, meşale veya yiyeceği bul.', icon: Leaf, color: '#D9AD62' },
  { id: 'use_rope', title: 'İp köprüsü', detail: '1 ip harca, iki adım ilerle.', icon: Waves, color: '#72C7E8' },
  { id: 'use_torch', title: 'Meşale yak', detail: '1 meşale harca, ilerle ve moral kazan.', icon: Flame, color: '#FF936B' },
  { id: 'camp', title: 'Kamp kur', detail: '1 erzak harca, moralini toparla.', icon: Tent, color: '#B8A1FF' },
] as const;

export default function OrmanHazinesiScreen() {
  const { roomCode } = useGameStore();
  const [state, setState] = useState<ForestState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const deadline = state?.phase_deadline_at ? new Date(state.phase_deadline_at).getTime() : null;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const isMyTurn = Boolean(state?.phase === 'expedition' && state.my_team && state.my_team === state.current_team);

  const refresh = useCallback(async () => {
    if (!roomCode) return;
    const { data, error: rpcError } = await ensureSupabase().rpc('forest_treasure_get_state', { p_room_code: roomCode });
    if (rpcError) throw rpcError;
    setState(data as ForestState);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) { router.replace('/game-modes'); return; }
    let mounted = true;
    const poll = async () => {
      try {
        const { data, error: rpcError } = await ensureSupabase().rpc('forest_treasure_get_state', { p_room_code: roomCode });
        if (rpcError) throw rpcError;
        if (mounted) { setState(data as ForestState); setError(null); }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Sefer durumu alınamadı.');
      }
      if (mounted) setNow(Date.now());
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 2200);
    return () => { mounted = false; clearInterval(timer); };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !state?.is_host || !deadline || deadline > now || state.phase !== 'expedition' || busy) return;
    let cancelled = false;
    setBusy(true);
    ensureSupabase().rpc('forest_treasure_advance', { p_room_code: roomCode })
      .then(({ error: rpcError }) => { if (rpcError) throw rpcError; })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Süre aşımı işlenemedi.'); })
      .finally(() => { if (!cancelled) { setBusy(false); void refresh().catch(() => undefined); } });
    return () => { cancelled = true; };
  }, [roomCode, state?.is_host, state?.phase, deadline, now, busy, refresh]);

  const perform = async (action: string) => {
    if (!roomCode || busy || !isMyTurn) return;
    setBusy(true); setError(null);
    try {
      const { error: rpcError } = await ensureSupabase().rpc('forest_treasure_move', { p_room_code: roomCode, p_action: action });
      if (rpcError) throw rpcError;
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Hamle yapılamadı.');
    } finally { setBusy(false); }
  };

  const myStats = state ? state.team_state?.[state.my_team ?? 'A'] : undefined;
  const teamA = state?.team_state?.A;
  const teamB = state?.team_state?.B;
  const progress = (stats?: TeamStats) => Math.min(100, Math.round(((stats?.progress ?? 0) / 7) * 100));

  return (
    <Screen style={styles.screen}>
      <View style={styles.glowTop} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.replace('/game-modes')} style={styles.back}><ChevronLeft color="#FFF" size={22} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>KIZILKUYRUK • KEŞİF MODU</Text><Text style={styles.title}>Orman Hazinesi</Text></View>
          <View style={styles.turnBadge}><Timer color="#D9AD62" size={15} /><Text style={styles.turnText}>{remaining === null ? '—' : remaining + ' sn'}</Text></View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.heroText}><Text style={styles.heroKicker}>SORU YOK. SADECE STRATEJİ.</Text><Text style={styles.heroTitle}>Harita parçalarını topla. Hazineye ulaş.</Text><Text style={styles.heroSub}>Her hamle kaynaklarını ve rakibinle arandaki farkı değiştirir.</Text></View>
          <Text style={styles.heroEmoji}>🗺️</Text>
          <View style={styles.route}><View style={styles.routeNode}><TreePine color="#7BC96F" size={17} /></View><View style={styles.routeLine}/><View style={styles.routeNode}><Map color="#D9AD62" size={17}/></View><View style={styles.routeLine}/><View style={styles.routeNode}><Trophy color="#FFD166" size={17}/></View></View>
        </View>

        {state ? <View style={styles.scoreRow}>
          <TeamCard team="A" stats={teamA} active={state.current_team === 'A'} progress={progress(teamA)} members={state.players.filter((p) => p.team_id === 'A')} />
          <View style={styles.vs}><Text style={styles.vsText}>VS</Text><Text style={styles.turnNumber}>{Math.min(state.turn_number + 1,16)}/16</Text></View>
          <TeamCard team="B" stats={teamB} active={state.current_team === 'B'} progress={progress(teamB)} members={state.players.filter((p) => p.team_id === 'B')} />
        </View> : <View style={styles.loading}><ActivityIndicator color="#7BC96F" /><Text style={styles.muted}>Orman haritası hazırlanıyor…</Text></View>}

        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Sefer çantası</Text><Text style={styles.muted}>Takımının ortak kaynakları</Text></View><View style={styles.teamPill}><Users color="#7BC96F" size={14}/><Text style={styles.teamPillText}>{state?.my_team ? 'TAKIM ' + state.my_team : 'TAKIM BEKLENİYOR'}</Text></View></View>
        <View style={styles.resources}>
          <Resource icon={<Leaf color="#7BC96F" size={19}/>} label="Erzak" value={myStats?.food ?? 0} />
          <Resource icon={<Waves color="#72C7E8" size={19}/>} label="İp" value={myStats?.rope ?? 0} />
          <Resource icon={<Flame color="#FF936B" size={19}/>} label="Meşale" value={myStats?.torch ?? 0} />
          <Resource icon={<ShieldCheck color="#B8A1FF" size={19}/>} label="Moral" value={myStats?.morale ?? 0} />
        </View>

        {state?.phase === 'finished' ? <View style={styles.finishCard}>
          <Trophy color="#FFD166" size={35}/>
          <Text style={styles.finishTitle}>{state.winner === 'draw' ? 'Berabere!' : state.winner === state.my_team ? 'Hazine sizin!' : 'Rakip hazineye ulaştı!'}</Text>
          <Text style={styles.muted}>Sefer tamamlandı. Harita parçaları ve takım kararları sonucu belirledi.</Text>
          <Pressable onPress={() => router.replace('/game-modes')} style={styles.finishButton}><Text style={styles.finishButtonText}>Oyun modlarına dön</Text></Pressable>
        </View> : <>
          <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>{isMyTurn ? 'Sıra sizin takımda' : 'Rakip takımın hamlesi'}</Text><Text style={styles.muted}>{isMyTurn ? 'Ekipçe bir sonraki hamleyi seçin.' : 'Rakip hamle yapınca sefer güncellenecek.'}</Text></View><Footprints color={isMyTurn ? '#7BC96F' : '#87909D'} size={22}/></View>
          <View style={styles.actions}>
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              const disabled = !isMyTurn || busy || (action.id === 'use_rope' && (myStats?.rope ?? 0) < 1) || (action.id === 'use_torch' && (myStats?.torch ?? 0) < 1) || (action.id === 'camp' && (myStats?.food ?? 0) < 1);
              return <Pressable key={action.id} onPress={() => void perform(action.id)} disabled={disabled} style={({pressed}) => [styles.action, {borderColor: isMyTurn && !disabled ? action.color : 'rgba(255,255,255,0.08)'}, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
                <View style={[styles.actionIcon,{backgroundColor: action.color+'22'}]}><Icon color={action.color} size={21}/></View>
                <View style={styles.actionCopy}><Text style={styles.actionTitle}>{action.title}</Text><Text style={styles.actionDetail}>{action.detail}</Text></View>
                <Text style={[styles.actionArrow,{color:action.color}]}>{disabled ? '—' : 'SEÇ'}</Text>
              </Pressable>;
            })}
          </View>
        </>}

        {state?.last_action ? <View style={styles.report}><View style={styles.reportHeader}><Pickaxe color="#D9AD62" size={17}/><Text style={styles.reportTitle}>Son gelişme • Takım {state.last_action.team}</Text></View><Text style={styles.reportText}>{state.last_action.message}</Text></View> : null}
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Sefer günlüğü</Text><Text style={styles.muted}>{state?.event_log?.length ?? 0} hamle</Text></View>
        {(state?.event_log ?? []).slice(-5).reverse().map((entry) => <View key={String(entry.turn)} style={styles.logRow}><View style={styles.logDot}/><View style={styles.logCopy}><Text style={styles.logTitle}>#{entry.turn} · Takım {entry.team} · {entry.action === 'timeout' ? 'Süre doldu' : ACTIONS.find((a) => a.id === entry.action)?.title ?? entry.action}</Text><Text style={styles.logText}>{entry.message}</Text></View></View>)}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.footerNote}>İp ve meşale tehlikeli geçitlerde hayat kurtarır. Erzak kampta moral kazandırır. Harita parçalarını toplamak tek başına yetmez; hazineye ulaşmak için ilerlemen gerekir.</Text>
      </ScrollView>
    </Screen>
  );
}

function TeamCard({team, stats, active, progress, members}: {team:string;stats?:TeamStats;active:boolean;progress:number;members:PlayerRow[]}) {
  return <View style={[styles.teamCard, active && styles.teamActive]}>
    <View style={styles.teamCardTop}><Text style={styles.teamName}>TAKIM {team}</Text>{active ? <View style={styles.activeDot}/> : null}</View>
    <Text style={styles.teamProgress}>{stats?.progress ?? 0}<Text style={styles.teamProgressUnit}>/7</Text></Text>
    <View style={styles.progressTrack}><View style={[styles.progressFill,{width:progress+'%',backgroundColor:team==='A'?'#7BC96F':'#D9AD62'}]}/></View>
    <View style={styles.fragments}><Map color="#D9AD62" size={14}/><Text style={styles.fragmentText}>{stats?.fragments ?? 0}/3 harita parçası</Text></View>
    <Text style={styles.memberNames} numberOfLines={2}>{members.map((member) => member.name).join(' · ') || 'Oyuncular bekleniyor'}</Text>
    <Text style={styles.teamMeta}>🍃 {stats?.food ?? 0}  ·  🪢 {stats?.rope ?? 0}  ·  🔥 {stats?.torch ?? 0}</Text>
  </View>;
}

function Resource({icon,label,value}:{icon:ReactNode;label:string;value:number}) {
  return <View style={styles.resource}><View>{icon}</View><Text style={styles.resourceValue}>{value}</Text><Text style={styles.resourceLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:'#091812'},
  glowTop:{position:'absolute',top:-160,left:-120,width:340,height:340,borderRadius:200,backgroundColor:'rgba(123,201,111,0.10)'},
  content:{paddingHorizontal:16,paddingTop:24,paddingBottom:42,gap:14},
  header:{flexDirection:'row',alignItems:'center',gap:10},
  back:{width:42,height:42,borderRadius:14,backgroundColor:'rgba(255,255,255,0.08)',alignItems:'center',justifyContent:'center'},
  headerCopy:{flex:1},
  eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:'#7BC96F'},
  title:{fontSize:21,fontWeight:'900',color:'#FFF',marginTop:3},
  turnBadge:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:10,height:34,borderRadius:12,backgroundColor:'rgba(217,173,98,0.12)'},
  turnText:{fontSize:11,fontWeight:'900',color:'#D9AD62'},
  hero:{borderRadius:24,borderWidth:1,borderColor:'rgba(123,201,111,0.24)',backgroundColor:'#142A20',overflow:'hidden',padding:18,minHeight:205},
  heroGlow:{position:'absolute',right:-50,top:-60,width:180,height:180,borderRadius:100,backgroundColor:'rgba(217,173,98,0.12)'},
  heroText:{paddingRight:55},
  heroKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.5,color:'#D9AD62'},
  heroTitle:{fontSize:23,fontWeight:'900',lineHeight:29,color:'#FFF',marginTop:7},
  heroSub:{fontSize:12,lineHeight:18,color:'rgba(255,255,255,0.68)',marginTop:6},
  heroEmoji:{position:'absolute',right:15,top:18,fontSize:45},
  route:{flexDirection:'row',alignItems:'center',marginTop:15,gap:6},
  routeNode:{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.06)',borderWidth:1,borderColor:'rgba(255,255,255,0.1)'},
  routeLine:{flex:1,height:2,backgroundColor:'rgba(123,201,111,0.35)'},
  scoreRow:{flexDirection:'row',alignItems:'stretch',gap:8},
  teamCard:{flex:1,minWidth:0,borderRadius:18,padding:11,backgroundColor:'rgba(255,255,255,0.045)',borderWidth:1,borderColor:'rgba(255,255,255,0.08)'},
  teamActive:{borderColor:'#7BC96F',backgroundColor:'rgba(123,201,111,0.10)'},
  teamCardTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  teamName:{fontSize:10,fontWeight:'900',letterSpacing:1,color:'#D7E2D9'},
  activeDot:{width:7,height:7,borderRadius:4,backgroundColor:'#7BC96F'},
  teamProgress:{fontSize:25,fontWeight:'900',color:'#FFF',marginTop:8},
  teamProgressUnit:{fontSize:12,color:'rgba(255,255,255,0.45)'},
  progressTrack:{height:5,backgroundColor:'rgba(255,255,255,0.09)',borderRadius:9,overflow:'hidden',marginTop:9},
  progressFill:{height:5,borderRadius:9},
  fragments:{flexDirection:'row',alignItems:'center',gap:5,marginTop:10},
  fragmentText:{fontSize:10,color:'#D9AD62',fontWeight:'800'},
  teamMeta:{fontSize:10,color:'rgba(255,255,255,0.55)',marginTop:8},
  memberNames:{fontSize:9,lineHeight:13,color:'rgba(255,255,255,0.55)',marginTop:7,minHeight:24},
  vs:{alignItems:'center',justifyContent:'center',width:28},
  vsText:{fontSize:10,fontWeight:'900',color:'rgba(255,255,255,0.45)'},
  turnNumber:{fontSize:9,color:'rgba(255,255,255,0.45)',marginTop:4},
  loading:{padding:24,alignItems:'center',gap:10},
  muted:{fontSize:11,color:'rgba(255,255,255,0.52)',lineHeight:16},
  sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:4},
  sectionTitle:{fontSize:16,fontWeight:'900',color:'#FFF'},
  teamPill:{flexDirection:'row',alignItems:'center',gap:5,borderRadius:12,paddingHorizontal:9,paddingVertical:7,backgroundColor:'rgba(123,201,111,0.1)'},
  teamPillText:{fontSize:9,fontWeight:'900',color:'#7BC96F'},
  resources:{flexDirection:'row',gap:8},
  resource:{flex:1,alignItems:'center',gap:4,paddingVertical:12,borderRadius:16,backgroundColor:'rgba(255,255,255,0.05)',borderWidth:1,borderColor:'rgba(255,255,255,0.07)'},
  resourceValue:{fontSize:20,fontWeight:'900',color:'#FFF'},
  resourceLabel:{fontSize:10,fontWeight:'700',color:'rgba(255,255,255,0.58)'},
  actions:{gap:9},
  action:{minHeight:72,flexDirection:'row',alignItems:'center',gap:12,padding:13,borderRadius:18,backgroundColor:'rgba(255,255,255,0.045)',borderWidth:1.3},
  actionIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},
  actionCopy:{flex:1},
  actionTitle:{fontSize:13,fontWeight:'900',color:'#FFF'},
  actionDetail:{fontSize:10,color:'rgba(255,255,255,0.57)',lineHeight:15,marginTop:3},
  actionArrow:{fontSize:10,fontWeight:'900',letterSpacing:0.8},
  disabled:{opacity:0.35},
  pressed:{transform:[{scale:0.99}],opacity:0.82},
  finishCard:{alignItems:'center',gap:10,padding:22,borderRadius:22,backgroundColor:'rgba(217,173,98,0.10)',borderWidth:1,borderColor:'rgba(217,173,98,0.25)'},
  finishTitle:{fontSize:21,fontWeight:'900',color:'#FFF',textAlign:'center'},
  finishButton:{marginTop:5,paddingHorizontal:18,paddingVertical:12,borderRadius:13,backgroundColor:'#7BC96F'},
  finishButtonText:{fontSize:12,fontWeight:'900',color:'#091812'},
  report:{padding:14,borderRadius:17,backgroundColor:'rgba(217,173,98,0.09)',borderWidth:1,borderColor:'rgba(217,173,98,0.18)',gap:7},
  reportHeader:{flexDirection:'row',alignItems:'center',gap:7},
  reportTitle:{fontSize:11,fontWeight:'900',color:'#D9AD62'},
  reportText:{fontSize:12,lineHeight:18,color:'#F1F4F0'},
  logRow:{flexDirection:'row',gap:10,paddingVertical:9,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.06)'},
  logDot:{width:7,height:7,borderRadius:5,backgroundColor:'#7BC96F',marginTop:5},
  logCopy:{flex:1},
  logTitle:{fontSize:11,fontWeight:'800',color:'#FFF'},
  logText:{fontSize:10,lineHeight:15,color:'rgba(255,255,255,0.55)',marginTop:3},
  error:{fontSize:12,color:'#FF9C9C',padding:10,borderRadius:12,backgroundColor:'rgba(255,0,0,0.08)'},
  footerNote:{fontSize:10,lineHeight:16,color:'rgba(255,255,255,0.42)',marginTop:6},
});
