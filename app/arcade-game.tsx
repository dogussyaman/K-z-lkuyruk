import { Screen, Button } from '@/components/ui';
import { advanceArcadeGame, getArcadeState, submitArcadeAction } from '@/features/arcade/client';
import { subscribeToArcadeDrawingDraft } from '@/features/arcade/drawingSync';
import { KITCHEN_ACTIONS, SIGNAL_COLORS, isArcadeGameMode } from '@/features/arcade/catalog';
import type { ArcadeAction, ArcadeState } from '@/features/arcade/types';
import { useGameStore } from '@/store/gameStore';
import { router } from 'expo-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';

const palette={bg:'#080D18',panel:'#111B2A',border:'#25364A',text:'#F4F7FB',muted:'#96A9BD',cyan:'#42D7F5',orange:'#FF8A4C'};
export default function ArcadeGameScreen(){
  const {roomCode,currentPlayer,service,setRoomCode,setRoomState}=useGameStore(); const [state,setState]=useState<ArcadeState|null>(null); const [text,setText]=useState(''); const [answer,setAnswer]=useState<string[]>([]); const [ticket,setTicket]=useState(0); const [angle,setAngle]=useState(45); const [power,setPower]=useState(60); const [strokes,setStrokes]=useState<number[][][]>([]); const [remoteDrawing,setRemoteDrawing]=useState<{step:number;strokes:number[][][]}|null>(null); const [drawCanvasKey,setDrawCanvasKey]=useState(0); const [error,setError]=useState<string|null>(null); const lock=useRef(false); const stateRef=useRef<ArcadeState|null>(null); const drawingSyncRef=useRef<ReturnType<typeof subscribeToArcadeDrawingDraft>|null>(null); const remoteSequenceRef=useRef({step:-1,sequence:-1});
  useEffect(()=>{if(!roomCode){router.replace('/(tabs)');return;}let active=true;const poll=async()=>{try{const next=await getArcadeState(roomCode);if(!active||!next)return;stateRef.current=next;setState(next);if(next.phase!=='finished'&&next.isHost&&next.deadline&&Date.parse(next.deadline)<Date.now())await advanceArcadeGame(roomCode,next.step);}catch(e){if(active)setError(e instanceof Error?e.message:'Oyun durumu alınamadı.');}};void poll();const timer=setInterval(()=>void poll(),1300);return()=>{active=false;clearInterval(timer);};},[roomCode]);
  useEffect(()=>{if(!roomCode||!currentPlayer?.id)return;let active=true;const sync=subscribeToArcadeDrawingDraft(roomCode,(incoming)=>{const current=stateRef.current;if(!active||!current||current.mode!=='drawing_chain'||current.phase!=='draw'||current.step!==incoming.step||current.currentPlayerId!==incoming.playerId||current.currentPlayerId===currentPlayer.id||(remoteSequenceRef.current.step===incoming.step&&incoming.sequence<=remoteSequenceRef.current.sequence))return;remoteSequenceRef.current={step:incoming.step,sequence:incoming.sequence};setRemoteDrawing({step:incoming.step,strokes:incoming.strokes});},message=>{if(active)setError(message);});drawingSyncRef.current=sync;return()=>{active=false;drawingSyncRef.current=null;sync.dispose();};},[roomCode,currentPlayer?.id]);
  useEffect(()=>{if(state?.mode==='drawing_chain'&&state.phase==='draw'&&state.canAct&&currentPlayer?.id)drawingSyncRef.current?.publish(state.step,currentPlayer.id,strokes);},[currentPlayer?.id,state?.canAct,state?.mode,state?.phase,state?.step,strokes]);
  const act=async(payload:ArcadeAction)=>{if(!roomCode||!state||lock.current)return;lock.current=true;setError(null);try{await submitArcadeAction(roomCode,{...payload,step:state.step});if(payload.action==='draw'){setStrokes([]);setDrawCanvasKey(v=>v+1);}}catch(e){setError(e instanceof Error?e.message:'Hamle gönderilemedi.');}finally{lock.current=false;}};
  const leaveGame=async()=>{if(roomCode){try{await service.leaveRoom(roomCode);}catch(e){setError(e instanceof Error?e.message:'Odadan ayrılamadın.');return;}}setRoomCode(null);setRoomState(null);router.replace('/game-modes');};
  if(!state)return <Screen><View style={s.center}><ActivityIndicator color={palette.cyan}/><Text style={s.muted}>Oyun yükleniyor…</Text></View></Screen>;
  if(!isArcadeGameMode(state.mode))return <Screen><View style={s.center}><Text style={s.title}>Oyun modu bulunamadı</Text><Button label="Lobiye dön" onPress={()=>router.replace('/lobby')}/></View></Screen>;
  const pub=state.public as any;const me=state.players.find(p=>p.id===currentPlayer?.id);const meState=state.me as any;const can=state.canAct;
  return <Screen><ScrollView contentContainerStyle={s.page}>
    <Text style={s.back}>ODA {roomCode}</Text><Text style={s.title}>{state.mode==='critical_signal'?'Kritik Sinyal':state.mode==='drawing_chain'?'Çizgi Zinciri':state.mode==='kitchen_chaos'?'Mutfak Kaosu':'Korsan Topu'}</Text>
    <View style={s.arena}><Text style={s.eyebrow}>OYUNCULAR</Text><View style={s.row}>{state.players.map(p=><Text key={p.id} style={[s.chip,{borderColor:p.id===state.currentPlayerId?palette.cyan:palette.border}]}>{p.name} · {p.score}p</Text>)}</View>
      {state.mode==='critical_signal'&&<><Text style={s.big}>SİNYAL MODÜLÜ {pub.module}/3</Text><Text style={s.muted}>Sana özel ipucu: {meState.position}. konum · {meState.color}</Text><Text style={s.muted}>Hatalar {pub.strikes}/3</Text></>}
      {state.mode==='drawing_chain'&&<><Text style={s.big}>{state.phase==='draw'?'ÇİZİM SIRASI':'TAHMİN SIRASI'}</Text><Text style={s.muted}>{state.phase==='draw'?(can?`Sana özel ipucu: ${meState.text}`:`${state.players.find(p=>p.id===state.currentPlayerId)?.name??'Başka bir oyuncu'} çiziyor; sıra sana gelince ipucun açılacak.`):'Çizimi yorumla'}</Text></>}
      {state.mode==='kitchen_chaos'&&<><Text style={s.big}>BEAT {pub.beat}/{pub.beats} · SERVİS {pub.score}</Text><Text style={s.muted}>{pub.orders?.map((o:any)=>`${o.emoji} ${o.name} (${o.status})`).join('    ')}</Text></>}
      {state.mode==='pirate_cannon'&&<><Text style={s.big}>RÜZGÂR {pub.wind} · {pub.teamScores?.join(' : ')}</Text><Text style={s.muted}>Yörünge atıştan sonra Phaser sahnesinde görüntülenir.</Text></>}
    </View>
    {state.phase==='finished'?<View style={s.panel}><Text style={s.big}>MAÇ TAMAMLANDI</Text><Text style={s.muted}>{state.result}</Text><Button label="Oyun seçimine dön" onPress={()=>void leaveGame()}/></View>:null}
    {state.mode==='critical_signal'&&me?.isHost&&<View style={s.panel}><Text style={s.big}>Defuser renk dizisi</Text><View style={s.row}>{Array.from({length:4},(_,i)=>{const c=SIGNAL_COLORS.find(x=>x.id===answer[i]);return <Pressable key={i} onPress={()=>setAnswer(a=>{const n=[...a];const ix=SIGNAL_COLORS.findIndex(x=>x.id===n[i]);n[i]=SIGNAL_COLORS[(ix+1)%4].id;return n;})} style={[s.color,{backgroundColor:c?.color??'#25364A'}]}><Text>{i+1}</Text></Pressable>})}</View><Button label="Diziyi kilitle" disabled={!can||answer.length!==4} onPress={()=>{void act({action:'guess',answer});setAnswer([]);}}/></View>}
    {state.mode==='critical_signal'&&<View style={s.panel}><Text style={s.big}>Ekip mesajı</Text><TextInput value={text} onChangeText={setText} placeholder="İpucunu paylaş" placeholderTextColor="#71879B" style={s.input}/><Button label="Gönder" disabled={!text.trim()} onPress={()=>{const t=text.trim();setText('');void act({action:'message',text:t});}}/></View>}
    {state.mode==='drawing_chain'&&<View style={s.panel}><Text style={s.big}>{state.phase==='draw'?'Çizim tuvali':'Tahmin'}</Text>{state.phase==='draw'?<>{can?<><DrawingBoard key={drawCanvasKey} onChange={setStrokes}/><View style={s.row}><Button label="Temizle" disabled={strokes.length===0} onPress={()=>{setStrokes([]);setDrawCanvasKey(v=>v+1);}}/><Button label="Çizimi devret" disabled={strokes.length===0} onPress={()=>void act({action:'draw',strokes})}/></View></>:<><DrawingPreview strokes={remoteDrawing?.step===state.step?remoteDrawing.strokes:[]}/><Text style={s.muted}>{state.players.find(p=>p.id===state.currentPlayerId)?.name??'Başka bir oyuncu'} çiziyor.</Text></>}</>:<><DrawingPreview strokes={Array.isArray(meState.strokes)?meState.strokes:[]}/><TextInput value={text} onChangeText={setText} placeholder="Ne çizilmiş?" placeholderTextColor="#71879B" style={s.input}/><Button label="Tahmini gönder" disabled={!can||text.trim().length<2} onPress={()=>{const t=text.trim();setText('');void act({action:'guess',text:t});}}/></>}</View>}
    {state.mode==='kitchen_chaos'&&<View style={s.panel}><Text style={s.big}>Sipariş istasyonu</Text><View style={s.row}>{(pub.orders??[]).map((o:any,i:number)=><Pressable key={i} onPress={()=>setTicket(i)} style={[s.chip,{borderColor:ticket===i?palette.cyan:palette.border}]}><Text style={s.muted}>{o.emoji} {o.name}</Text></Pressable>)}</View><View style={s.row}>{KITCHEN_ACTIONS.map(a=><Pressable key={a.id} onPress={()=>void act({action:a.id,ticket})} style={s.station}><Text style={s.big}>{a.emoji}</Text><Text style={s.muted}>{a.label}</Text></Pressable>)}</View></View>}
    {state.mode==='pirate_cannon'&&<View style={s.panel}><Text style={s.big}>Top ayarları</Text><View style={s.row}><Button label={`Açı − · ${angle}°`} disabled={!can} onPress={()=>setAngle(v=>Math.max(15,v-5))}/><Button label="Açı +" disabled={!can} onPress={()=>setAngle(v=>Math.min(75,v+5))}/></View><View style={s.row}><Button label={`Barut − · ${power}%`} disabled={!can} onPress={()=>setPower(v=>Math.max(30,v-5))}/><Button label="Barut +" disabled={!can} onPress={()=>setPower(v=>Math.min(100,v+5))}/></View><Button label="💥 Ateş et" disabled={!can} onPress={()=>void act({action:'fire',angle,power})}/></View>}
    {error?<Text style={s.error}>{error}</Text>:null}
  </ScrollView></Screen>;
}
function DrawingBoard({onChange}:{onChange:(strokes:number[][][])=>void}){
  const [strokes,setStrokes]=useState<number[][][]>([]);
  const strokesRef=useRef<number[][][]>([]); const activeStroke=useRef<number[][]|null>(null); const onChangeRef=useRef(onChange); const sizeRef=useRef({width:1,height:1});
  useEffect(()=>{onChangeRef.current=onChange;},[onChange]);
  const pan=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>true,
    onMoveShouldSetPanResponder:()=>true,
    onPanResponderTerminationRequest:()=>false,
    onPanResponderGrant:(event)=>{const {locationX,locationY}=event.nativeEvent;const p=[Math.max(0,Math.min(1000,Math.round(locationX/sizeRef.current.width*1000))),Math.max(0,Math.min(700,Math.round(locationY/sizeRef.current.height*700)))];const stroke=[p];activeStroke.current=stroke;const next=[...strokesRef.current,stroke];strokesRef.current=next;setStrokes(next);onChangeRef.current(next);},
    onPanResponderMove:(event)=>{if(!activeStroke.current)return;const {locationX,locationY}=event.nativeEvent;const p=[Math.max(0,Math.min(1000,Math.round(locationX/sizeRef.current.width*1000))),Math.max(0,Math.min(700,Math.round(locationY/sizeRef.current.height*700)))];activeStroke.current.push(p);const next=[...strokesRef.current.slice(0,-1),[...activeStroke.current]];strokesRef.current=next;setStrokes(next);onChangeRef.current(next);},
    onPanResponderRelease:()=>{activeStroke.current=null;},
    onPanResponderTerminate:()=>{activeStroke.current=null;},
  }),[]);
  return <View style={s.drawBoard} {...pan.panHandlers} onLayout={event=>{sizeRef.current={width:Math.max(1,event.nativeEvent.layout.width),height:Math.max(1,event.nativeEvent.layout.height)};}} accessibilityLabel="Dokunmatik çizim tuvali">
    <Svg width="100%" height="100%" viewBox="0 0 1000 700">
      <Rect x="0" y="0" width="1000" height="700" fill="#FFFFFF"/>
      {Array.from({length:9},(_,i)=><Line key={`v${i}`} x1={(i+1)*100} y1="0" x2={(i+1)*100} y2="700" stroke="#D9DEE7" strokeWidth="2"/>)}
      {Array.from({length:6},(_,i)=><Line key={`h${i}`} x1="0" y1={(i+1)*100} x2="1000" y2={(i+1)*100} stroke="#D9DEE7" strokeWidth="2"/>)}
      {strokes.map((stroke,i)=><Fragment key={i}>
        {stroke.length===1&&<Circle cx={stroke[0][0]} cy={stroke[0][1]} r="6.5" fill="#E11D48"/>}
        <Polyline points={stroke.map(p=>`${p[0]},${p[1]}`).join(' ')} fill="none" stroke="#E11D48" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"/>
      </Fragment>)}
    </Svg>
  </View>;
}
function DrawingPreview({strokes}:{strokes:number[][][]}){
  return <View style={s.drawBoard} accessibilityLabel="Çizim önizlemesi">
    <Svg width="100%" height="100%" viewBox="0 0 1000 700">
      <Rect x="0" y="0" width="1000" height="700" fill="#FFFFFF"/>
      {Array.from({length:9},(_,i)=><Line key={`v${i}`} x1={(i+1)*100} y1="0" x2={(i+1)*100} y2="700" stroke="#D9DEE7" strokeWidth="2"/>)}
      {Array.from({length:6},(_,i)=><Line key={`h${i}`} x1="0" y1={(i+1)*100} x2="1000" y2={(i+1)*100} stroke="#D9DEE7" strokeWidth="2"/>)}
      {strokes.map((stroke,i)=><Fragment key={i}>
        {stroke.length===1&&<Circle cx={stroke[0][0]} cy={stroke[0][1]} r="6.5" fill="#E11D48"/>}
        <Polyline points={stroke.map(p=>`${p[0]},${p[1]}`).join(' ')} fill="none" stroke="#E11D48" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"/>
      </Fragment>)}
    </Svg>
  </View>;
}
const s=StyleSheet.create({page:{maxWidth:860,width:'100%',alignSelf:'center',padding:18,gap:14,paddingBottom:40},center:{flex:1,alignItems:'center',justifyContent:'center',gap:14},back:{color:palette.cyan,fontWeight:'800'},title:{color:palette.text,fontWeight:'900',fontSize:24},arena:{minHeight:280,backgroundColor:'#0B1422',borderColor:palette.border,borderWidth:1,borderRadius:20,padding:20,justifyContent:'center',alignItems:'center',gap:16},eyebrow:{color:palette.cyan,fontWeight:'900'},big:{color:palette.text,fontWeight:'900',fontSize:16,textAlign:'center'},muted:{color:palette.muted,fontSize:13,textAlign:'center',lineHeight:20},row:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'center',alignItems:'center'},chip:{color:palette.text,borderWidth:1,borderRadius:10,padding:9,overflow:'hidden',backgroundColor:palette.panel},panel:{padding:16,borderWidth:1,borderColor:palette.border,borderRadius:18,backgroundColor:palette.panel,gap:12},drawBoard:{width:'100%',height:260,borderRadius:14,overflow:'hidden',backgroundColor:'#F7F4ED'},color:{width:50,height:50,borderRadius:12,alignItems:'center',justifyContent:'center'},input:{color:palette.text,backgroundColor:'#091321',borderColor:palette.border,borderWidth:1,borderRadius:12,padding:12,minHeight:46},station:{minWidth:78,minHeight:70,backgroundColor:'#203144',borderRadius:12,alignItems:'center',justifyContent:'center',padding:8},error:{color:'#ff7181',fontWeight:'700'}});
