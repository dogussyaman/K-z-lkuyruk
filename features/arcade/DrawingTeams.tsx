import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { ArcadePlayer, ArcadeState } from './types';

function Player({player,index,assigning,active}:{player:ArcadePlayer;index:number;assigning:boolean;active:boolean}) {
  const progress=useRef(new Animated.Value(assigning?0:1)).current;
  useEffect(()=>{if(!assigning){progress.setValue(1);return;}progress.setValue(0);const animation=Animated.timing(progress,{toValue:1,duration:650,delay:500+index*450,useNativeDriver:true});animation.start();return()=>animation.stop();},[assigning,index,progress]);
  return <Animated.View style={[styles.player,active&&styles.active,{opacity:progress.interpolate({inputRange:[0,1],outputRange:[.25,1]}),transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[player.team===0?90:-90,0]})},{scale:progress.interpolate({inputRange:[0,1],outputRange:[.65,1]})}]}]}><Text style={styles.name}>🦊 {player.name}{active?' ✏️':''}</Text></Animated.View>;
}
export function DrawingTeams({state,playerId}:{state:ArcadeState;playerId?:string}) {
  const [,tick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>tick(n=>n+1),250);return()=>clearInterval(id);},[]);
  const pub=state.public as {turnOrder?:string[];turnIndex?:number;activeTeam?:number;teamScores?:number[];solved?:boolean;answer?:string;guesses?:{playerId:string;text:string}[]};
  const remaining=state.deadline?Math.max(0,Math.ceil((Date.parse(state.deadline)-Date.now())/1000)):0;
  const assigning=state.phase==='lobby';
  const assignedCount=assigning?Math.max(0,Math.floor((8-remaining-1)/.5)):state.players.length;
  const pool=state.players.filter(p=>(pub.turnOrder?.indexOf(p.id)??0)>=assignedCount);
  const drawer=state.players.find(p=>p.id===state.currentPlayerId);
  const title=assigning?'Tilki takımları kuruluyor':state.phase==='draw'?`${drawer?.name??'Oyuncu'} çiziyor`:state.phase==='guess'?'Takım arkadaşları tahmin ediyor':state.phase==='play'?(pub.solved?'Doğru tahmin! +10 puan':'Tahmin süresi doldu'):'Maç tamamlandı';
  return <View style={styles.panel}>
    <Text accessibilityLiveRegion="polite" style={styles.title}>{title}</Text>
    {state.phase!=='finished'&&<Text style={styles.clock}>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')} · {assigning?'TAKIM DAĞILIMI':state.phase==='draw'?'ÇİZİM':state.phase==='guess'?'TAHMİN':'SONRAKİ TUR'}</Text>}
    {assigning&&pool.length>0&&<View style={styles.pool}><Text style={styles.hint}>OYUNCU HAVUZU</Text><Text style={styles.name}>{pool.map(p=>'🦊 '+p.name).join('  ·  ')}</Text></View>}
    <View style={styles.teams}>{[0,1].map(team=><View key={team} style={[styles.team,{borderColor:team===0?'#FF985C':'#59B9FF',backgroundColor:pub.activeTeam===team&&!assigning?'#203044':'#101B2A'}]}>
      <Text style={[styles.title,{color:team===0?'#FF985C':'#59B9FF'}]}>🦊 Tilki {team===0?'A':'B'} · {pub.teamScores?.[team]??0}</Text>
      {state.players.filter(p=>p.team===team).map(p=><Player key={p.id} player={p} index={pub.turnOrder?.indexOf(p.id)??0} assigning={assigning} active={!assigning&&p.id===drawer?.id}/>)}
    </View>)}</View>
    <Text style={styles.hint}>{assigning?'Oyuncu havuzu → iki eşit takım':`Tur ${(pub.turnIndex??0)+1}/${pub.turnOrder?.length??state.players.length} · Aktif takım: Tilki ${pub.activeTeam===0?'A':'B'}`}</Text>
    {state.phase==='draw'&&<Text style={styles.hint}>{state.currentPlayerId===playerId?'Sadece sana gösterilen kelimeyi çiz. Süre bitince tuval kilitlenir.':'Çizimi canlı izliyorsun. Tahmin aşaması çizim süresi bitince açılacak.'}</Text>}
    {state.phase==='guess'&&!state.canAct&&<Text style={styles.hint}>{state.currentPlayerId===playerId?'Takım arkadaşların tahmin ediyor; sen izliyorsun.':'Rakip takımın tahminlerini izliyorsun.'}</Text>}
    {state.phase==='play'&&<Text style={styles.answer}>Çizilen: {pub.answer}</Text>}
    {(pub.guesses??[]).slice(-5).map((g,i)=><Text key={i} style={styles.hint}>{state.players.find(p=>p.id===g.playerId)?.name}: {g.text}</Text>)}
  </View>;
}
const styles=StyleSheet.create({panel:{gap:12,padding:16,borderRadius:20,backgroundColor:'#101B2A',borderWidth:1,borderColor:'#304258'},title:{color:'#F4F7FB',fontSize:16,fontWeight:'900',textAlign:'center'},clock:{fontSize:20,color:'#FFD166',fontWeight:'900',textAlign:'center',fontVariant:['tabular-nums']},teams:{flexDirection:'row',gap:10},pool:{padding:12,backgroundColor:'#293448',borderRadius:14,gap:8,alignItems:'center'},team:{flex:1,minWidth:0,padding:10,borderWidth:2,borderRadius:16,gap:8,overflow:'hidden'},player:{padding:8,borderRadius:10,backgroundColor:'#243246'},active:{backgroundColor:'#486145'},name:{color:'#fff',fontWeight:'700',fontSize:13},hint:{color:'#B9CADB',textAlign:'center',lineHeight:20},answer:{color:'#FFD166',textAlign:'center',fontWeight:'900',fontSize:20}});
