import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { ArcadePlayer, ArcadeState } from './types';

function Player({player,index,assigning,active}:{player:ArcadePlayer;index:number;assigning:boolean;active:boolean}) {
  const [progress]=useState(()=>new Animated.Value(assigning?0:1));
  useEffect(()=>{if(!assigning){progress.setValue(1);return;}progress.setValue(0);const animation=Animated.timing(progress,{toValue:1,duration:650,delay:500+index*450,useNativeDriver:true});animation.start();return()=>animation.stop();},[assigning,index,progress]);
  return <Animated.View style={[styles.player,active&&styles.active,{opacity:progress.interpolate({inputRange:[0,1],outputRange:[.25,1]}),transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:[player.team===0?90:-90,0]})},{scale:progress.interpolate({inputRange:[0,1],outputRange:[.65,1]})}]}]}><Text style={styles.name}>🦊 {player.name}{active?' ✏️':''}</Text></Animated.View>;
}
export function DrawingTeams({state,playerId}:{state:ArcadeState;playerId?:string}) {
  const [now,setNow]=useState<number|null>(null);
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
  const pub=state.public as {turnOrder?:string[];turnIndex?:number;activeTeam?:number;teamScores?:number[];solved?:boolean;answer?:string;guesses?:{playerId:string;text:string}[]};
  const assigning=state.phase==='lobby';
  const elapsed=state.deadline&&now!==null?Math.max(0,8-Math.ceil((Date.parse(state.deadline)-now)/1000)):0;
  const assignedCount=assigning?Math.min(state.players.length,Math.floor(elapsed*state.players.length/4)):state.players.length;
  const pool=state.players.filter(p=>(pub.turnOrder?.indexOf(p.id)??0)>=assignedCount);
  const drawer=state.players.find(p=>p.id===state.currentPlayerId);
  const title=assigning?'Tilki takımları kuruluyor':state.phase==='draw'?`${drawer?.name??'Oyuncu'} çiziyor`:state.phase==='guess'?'Takım arkadaşları tahmin ediyor':state.phase==='play'?(pub.solved?'Doğru tahmin! +10 puan':'Tahmin süresi doldu'):'Maç tamamlandı';
  return <View style={styles.panel}>
    <Text accessibilityLiveRegion="polite" style={styles.title}>{title}</Text>
    {assigning&&pool.length>0&&<View style={styles.pool}><Text style={styles.hint}>HAVUZ</Text><Text style={styles.name}>{pool.map(p=>'🦊 '+p.name).join(' · ')}</Text></View>}
    <View style={styles.teams}>{[0,1].map(team=><View key={team} style={[styles.team,{borderColor:team===0?'#FF985C':'#59B9FF',backgroundColor:pub.activeTeam===team&&!assigning?'#203044':'#101B2A'}]}>
      <Text style={[styles.title,{color:team===0?'#FF985C':'#59B9FF'}]}>🦊 Tilki {team===0?'A':'B'} · {pub.teamScores?.[team]??0}</Text>
      {state.players.filter(p=>p.team===team).map(p=><Player key={p.id} player={p} index={pub.turnOrder?.indexOf(p.id)??0} assigning={assigning} active={!assigning&&p.id===drawer?.id}/>)}
    </View>)}</View>
    <Text style={styles.hint}>{assigning?'Oyuncular iki eşit takıma ayrılıyor':`Tur ${(pub.turnIndex??0)+1}/${pub.turnOrder?.length??state.players.length} · Tilki ${pub.activeTeam===0?'A':'B'} sırada`}</Text>
    {state.phase==='draw'&&<Text style={styles.hint}>{state.currentPlayerId===playerId?'Kelimeyi çiz; takım arkadaşların ve rakip takım izliyor.':'Çizen oyuncunun tuvali her iki takıma da canlı gösteriliyor.'}</Text>}
    {state.phase==='guess'&&!state.canAct&&<Text style={styles.hint}>{state.currentPlayerId===playerId?'Takımın tahmin ediyor.':'Diğer takımın tahminlerini izliyorsun.'}</Text>}
    {state.phase==='play'&&<Text style={styles.answer}>Çizilen: {pub.answer}</Text>}
    {(pub.guesses??[]).slice(-5).map((g,i)=><Text key={i} style={styles.hint}>{state.players.find(p=>p.id===g.playerId)?.name}: {g.text}</Text>)}
  </View>;
}
export function DrawingCountdown({deadline}:{deadline:string|null}) {
  const [now,setNow]=useState<number|null>(null);
  useEffect(()=>{const initial=setTimeout(()=>setNow(Date.now()),0);const id=setInterval(()=>setNow(Date.now()),1000);return()=>{clearTimeout(initial);clearInterval(id);};},[]);
  const seconds=deadline&&now!==null?Math.max(0,Math.ceil((Date.parse(deadline)-now)/1000)):0;
  return <Text style={styles.clock}>{now===null?'--:--':`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}</Text>;
}
const styles=StyleSheet.create({panel:{gap:6,padding:9,borderRadius:14,backgroundColor:'#101B2A',borderWidth:1,borderColor:'#304258'},title:{color:'#F4F7FB',fontSize:13,fontWeight:'900',textAlign:'center'},clock:{fontSize:17,color:'#FFD166',fontWeight:'900',textAlign:'center',fontVariant:['tabular-nums'],width:68},teams:{flexDirection:'row',gap:6},pool:{padding:8,backgroundColor:'#293448',borderRadius:10,gap:4,alignItems:'center'},team:{flex:1,minWidth:0,padding:6,borderWidth:1.5,borderRadius:12,gap:4,overflow:'hidden'},player:{paddingVertical:4,paddingHorizontal:6,borderRadius:8,backgroundColor:'#243246'},active:{backgroundColor:'#486145'},name:{color:'#fff',fontWeight:'700',fontSize:11},hint:{color:'#B9CADB',textAlign:'center',lineHeight:15,fontSize:11},answer:{color:'#FFD166',textAlign:'center',fontWeight:'900',fontSize:16}});
