import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from 'react-native';
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
  { id: 'claim_treasure', title: 'Hazineyi aç', detail: '3 harita parçası ve 6 ilerleme ile sandığı aç.', icon: Trophy, color: '#FFD166' },
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
    void (async () => {
      try {
        const { error: rpcError } = await ensureSupabase().rpc('forest_treasure_advance', { p_room_code: roomCode });
        if (rpcError) throw rpcError;
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Süre aşımı işlenemedi.');
      } finally {
        if (!cancelled) {
          setBusy(false);
          try { await refresh(); } catch { /* polling will retry */ }
        }
      }
    })();
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
              const disabled = !isMyTurn || busy || (action.id === 'use_rope' && (myStats?.rope ?? 0) < 1) || (action.id === 'use_torch' && (myStats?.torch ?? 0) < 1) || (action.id === 'camp' && (myStats?.food ?? 0) < 1) || (action.id === 'claim_treasure' && ((myStats?.fragments ?? 0) < 3 || (myStats?.progress ?? 0) < 6));
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
        <Text style={styles.footerNote}>İp ve meşale tehlikeli geçitlerde hayat kurtarır. Erzak kampta moral kazandırır. Harita parçalarını bulmak tek başına yetmez: 6 adım ilerleyince sıranı kullanıp “Hazineyi aç” hamlesini yap. Rakip takım da haritayı bulursa yarış devam eder.</Text>
      </ScrollView>
    </Screen>
  );
}

function TeamCard({team, stats, active, progress, members}: {team:string;stats?:TeamStats;active:boolean;progress:number;members:PlayerRow[]}) {
  const progressWidth = `${progress}%` as DimensionValue;
  return <View style={[styles.teamCard, active && styles.teamActive]}>
    <View style={styles.teamCardTop}><Text style={styles.teamName}>TAKIM {team}</Text>{active ? <View style={styles.activeDot}/> : null}</View>
    <Text style={styles.teamProgress}>{Math.min(7, stats?.progress ?? 0)}<Text style={styles.teamProgressUnit}>/7</Text></Text>
    <View style={styles.progressTrack}><View style={[styles.progressFill,{width:progressWidth,backgroundColor:team==='A'?'#7BC96F':'#D9AD62'}]}/></View>
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
  back:{width:42,height:42,borderRadius:14,backgroundColor:'rgba(255,255,255,0.07)',alignItems:'center',justifyContent:'center'},
  headerCopy:{flex:1},eyebrow:{color:'#7BC96F',fontSize:9,fontWeight:'900',letterSpacing:1.4},title:{color:'#FFF',fontSize:23,fontWeight:'900',marginTop:2},turnBadge:{flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'rgba(217,173,98,0.12)',borderColor:'rgba(217,173,98,0.25)',borderWidth:1,paddingHorizontal:10,paddingVertical:8,borderRadius:12},turnText:{color:'#F3D297',fontSize:11,fontWeight:'900'},
  hero:{minHeight:185,borderRadius:24,backgroundColor:'#132C20',borderWidth:1,borderColor:'rgba(123,201,111,0.22)',padding:19,overflow:'hidden',justifyContent:'space-between'},heroGlow:{position:'absolute',right:-80,top:-80,width:210,height:210,borderRadius:150,backgroundColor:'rgba(123,201,111,0.10)'},heroText:{maxWidth:'75%',gap:5},heroKicker:{color:'#D9AD62',fontSize:9,fontWeight:'900',letterSpacing:1.4},heroTitle:{color:'#FFF',fontSize:21,fontWeight:'900',lineHeight:26},heroSub:{color:'#9DB1A4',fontSize:11,lineHeight:17},heroEmoji:{position:'absolute',right:18,top:28,fontSize:46},route:{flexDirection:'row',alignItems:'center',marginTop:16},routeNode:{width:34,height:34,borderRadius:14,backgroundColor:'#0C2117',borderWidth:1,borderColor:'rgba(255,255,255,0.08)',alignItems:'center',justifyContent:'center'},routeLine:{height:2,flex:1,backgroundColor:'rgba(123,201,111,0.26)'},
  scoreRow:{flexDirection:'row',alignItems:'stretch',gap:7},teamCard:{flex:1,borderRadius:19,padding:12,backgroundColor:'#10251A',borderWidth:1,borderColor:'rgba(255,255,255,0.08)'},teamActive:{borderColor:'#7BC96F',backgroundColor:'#153322'},teamCardTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},teamName:{color:'#A9B8AE',fontSize:9,fontWeight:'900',letterSpacing:1},activeDot:{width:7,height:7,borderRadius:7,backgroundColor:'#7BC96F'},teamProgress:{color:'#FFF',fontSize:27,fontWeight:'900',marginTop:4},teamProgressUnit:{color:'#6E8276',fontSize:12},progressTrack:{height:5,borderRadius:8,backgroundColor:'#07120D',overflow:'hidden',marginTop:4},progressFill:{height:'100%',borderRadius:8},fragments:{flexDirection:'row',alignItems:'center',gap:5,marginTop:8},fragmentText:{color:'#D6C18B',fontSize:9,fontWeight:'800'},memberNames:{color:'#82958A',fontSize:9,lineHeight:13,marginTop:6},teamMeta:{color:'#84988D',fontSize:9,marginTop:6},vs:{alignItems:'center',justifyContent:'center',width:34},vsText:{color:'#D9AD62',fontWeight:'900',fontSize:12},turnNumber:{color:'#617168',fontSize:8,marginTop:4},
  sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:2},sectionTitle:{color:'#FFF',fontSize:15,fontWeight:'900'},muted:{color:'#809188',fontSize:10,lineHeight:15},teamPill:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,paddingVertical:6,borderRadius:12,backgroundColor:'rgba(123,201,111,0.09)'},teamPillText:{color:'#9DD394',fontSize:8,fontWeight:'900'},resources:{flexDirection:'row',gap:7},resource:{flex:1,minHeight:76,borderRadius:16,backgroundColor:'#10251A',borderWidth:1,borderColor:'rgba(255,255,255,0.07)',alignItems:'center',justifyContent:'center',gap:2},resourceValue:{color:'#FFF',fontSize:18,fontWeight:'900'},resourceLabel:{color:'#83968A',fontSize:8,fontWeight:'800'},
  actions:{gap:8},action:{minHeight:72,borderRadius:18,borderWidth:1,padding:11,backgroundColor:'#10251A',flexDirection:'row',alignItems:'center',gap:10},actionIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},actionCopy:{flex:1},actionTitle:{color:'#FFF',fontSize:13,fontWeight:'900'},actionDetail:{color:'#7D8F85',fontSize:9,lineHeight:14,marginTop:2},actionArrow:{fontSize:9,fontWeight:'900',letterSpacing:.8},disabled:{opacity:.42},pressed:{transform:[{scale:.985}]},finishCard:{borderRadius:22,padding:20,backgroundColor:'#173322',borderColor:'#FFD166',borderWidth:1,alignItems:'center',gap:9},finishTitle:{color:'#FFF',fontSize:21,fontWeight:'900',textAlign:'center'},finishButton:{marginTop:7,backgroundColor:'#7BC96F',paddingHorizontal:18,paddingVertical:10,borderRadius:13},finishButtonText:{color:'#0A190F',fontWeight:'900',fontSize:11},
  report:{borderRadius:18,padding:14,backgroundColor:'#10251A',borderWidth:1,borderColor:'rgba(217,173,98,0.16)'},reportHeader:{flexDirection:'row',alignItems:'center',gap:7},reportTitle:{color:'#D9AD62',fontSize:10,fontWeight:'900'},reportText:{color:'#B5C1BA',fontSize:11,lineHeight:17,marginTop:6},logRow:{flexDirection:'row',gap:9,paddingVertical:8,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.05)'},logDot:{width:7,height:7,borderRadius:7,backgroundColor:'#7BC96F',marginTop:5},logCopy:{flex:1},logTitle:{color:'#CFD8D2',fontSize:9,fontWeight:'900'},logText:{color:'#75877C',fontSize:9,lineHeight:14,marginTop:2},footerNote:{color:'#64766B',fontSize:9,lineHeight:14,textAlign:'center',marginTop:6},error:{color:'#FF9E91',fontSize:11,fontWeight:'800',textAlign:'center'},loading:{alignItems:'center',padding:22,gap:8},
});