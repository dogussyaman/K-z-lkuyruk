import { Screen, Button, Card } from '@/components/ui';
import { useGameStore } from '@/store/gameStore';
import { advanceArcadeGame, getArcadeState, submitArcadeAction } from '@/features/arcade/client';
import { KITCHEN_ACTIONS, SIGNAL_COLORS, isArcadeGameMode } from '@/features/arcade/catalog';
import type { ArcadeAction, ArcadeState } from '@/features/arcade/types';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { router } from 'expo-router';
import type * as PhaserTypes from 'phaser';

type DraftStroke = number[][];
type DrawBridge = { setState: (state: ArcadeState | null) => void; setDraft: (strokes: DraftStroke[]) => void; clearDraft: () => void };

const palette = { bg: '#080D18', panel: '#111B2A', border: '#25364A', text: '#F4F7FB', muted: '#96A9BD', cyan: '#42D7F5', orange: '#FF8A4C', green: '#53D7A2', red: '#FF5C6C' };
const labels: Record<string, string> = { critical_signal: 'Kritik Sinyal', drawing_chain: 'Çizgi Zinciri', kitchen_chaos: 'Mutfak Kaosu', pirate_cannon: 'Korsan Topu' };

export default function ArcadeGameScreen() {
  const { roomCode, currentPlayer, service, setRoomCode, setRoomState } = useGameStore();
  const hostId = currentPlayer?.id;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<DrawBridge | null>(null);
  const actionLock = useRef(false);
  const drawingPointer = useRef<number | null>(null);
  const strokesRef = useRef<DraftStroke[]>([]);
  const liveStrokeRef = useRef<number[][] | null>(null);
  const [state, setState] = useState<ArcadeState | null>(null);
  const [draft, setDraft] = useState<DraftStroke[]>([]);
  const [chatText, setChatText] = useState('');
  const [answer, setAnswer] = useState<string[]>([]);
  const [guessText, setGuessText] = useState('');
  const [ticket, setTicket] = useState(0);
  const [angle, setAngle] = useState(45);
  const [power, setPower] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) { router.replace('/(tabs)'); return; }
    let mounted = true;
    const poll = async () => {
      try {
        const next = await getArcadeState(roomCode);
        if (!mounted || !next) return;
        setState(next);
        bridgeRef.current?.setState(next);
        if (next.phase === 'finished') return;
        if (next.isHost && next.deadline && new Date(next.deadline).getTime() < Date.now()) {
          await advanceArcadeGame(roomCode, next.step);
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Oyun durumu alınamadı.');
      }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 1200);
    return () => { mounted = false; clearInterval(timer); };
  }, [roomCode]);

  useEffect(() => {
    if (!canvasRef.current || !roomCode) return;
    let game: PhaserTypes.Game | undefined;
    let disposed = false;
    void import('phaser').then((module) => {
      if (disposed || !canvasRef.current) return;
      const Phaser = module.default;
      class ArenaScene extends Phaser.Scene {
        snapshot: ArcadeState | null = null;
        strokes: DraftStroke[] = [];
        lastShotStep = -1;
        graphics!: Phaser.GameObjects.Graphics;
        texts: PhaserTypes.GameObjects.Text[] = [];
        constructor() { super('ArcadeArena'); }
        create() {
          this.graphics = this.add.graphics();
          const canvas = this.game.canvas;
          canvas.style.touchAction = 'none';
          canvas.style.cursor = 'crosshair';
          const getPoint = (event: PointerEvent) => {
            const bounds = canvas.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return null;
            const x = ((event.clientX - bounds.left) / bounds.width) * 1000;
            const y = ((event.clientY - bounds.top) / bounds.height) * 560;
            const left = 80; const right = 920; const top = 72.8; const bottom = 481.6;
            if (x < left || x > right || y < top || y > bottom) return null;
            return [Math.round(((x - left) / (right - left)) * 1000), Math.round(((y - top) / (bottom - top)) * 700)];
          };
          const onPointerDown = (event: PointerEvent) => {
            if (this.snapshot?.mode !== 'drawing_chain' || this.snapshot.phase !== 'draw' || !this.snapshot.canAct) return;
            const point = getPoint(event);
            if (!point) return;
            event.preventDefault();
            event.stopPropagation();
            drawingPointer.current = event.pointerId;
            liveStrokeRef.current = [point];
            try { canvas.setPointerCapture(event.pointerId); } catch {}
            setDraft([...strokesRef.current, liveStrokeRef.current]);
            bridgeRef.current?.setDraft([...strokesRef.current, liveStrokeRef.current]);
          };
          const onPointerMove = (event: PointerEvent) => {
            if (drawingPointer.current !== event.pointerId || !liveStrokeRef.current) return;
            const point = getPoint(event);
            if (!point) return;
            event.preventDefault();
            event.stopPropagation();
            const previous = liveStrokeRef.current[liveStrokeRef.current.length - 1];
            if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) liveStrokeRef.current.push(point);
            setDraft([...strokesRef.current, liveStrokeRef.current]);
            bridgeRef.current?.setDraft([...strokesRef.current, liveStrokeRef.current]);
          };
          const onPointerUp = (event: PointerEvent) => {
            if (drawingPointer.current !== event.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            drawingPointer.current = null;
            if (liveStrokeRef.current) strokesRef.current = [...strokesRef.current, liveStrokeRef.current];
            liveStrokeRef.current = null;
            setDraft(strokesRef.current);
            bridgeRef.current?.setDraft(strokesRef.current);
            try { canvas.releasePointerCapture(event.pointerId); } catch {}
          };
          canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
          canvas.addEventListener('pointermove', onPointerMove, { passive: false });
          canvas.addEventListener('pointerup', onPointerUp, { passive: false });
          canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
          this.events.once('destroy', () => {
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
          });
          this.scale.on('resize', () => this.paint());
          this.paint();
        }
        setSnapshot(next: ArcadeState | null) { this.snapshot = next; this.paint(); }
        setDrawing(next: DraftStroke[]) { this.strokes = next; this.paint(); }
        clearDrawing() { this.strokes = []; this.paint(); }
        paint() {
          if (!this.graphics) return;
          this.texts.forEach((item) => item.destroy()); this.texts=[];
          const g=this.graphics; const w=this.scale.width; const h=this.scale.height; const s=this.snapshot;
          g.clear(); g.fillStyle(0x0b1422,1); g.fillRoundedRect(4,4,w-8,h-8,22);
          g.lineStyle(1,0x29445d,0.55);
          for(let x=24;x<w;x+=32) g.lineBetween(x,0,x,h);
          for(let y=20;y<h;y+=32) g.lineBetween(0,y,w,y);
          g.fillStyle(0x101f30,0.96); g.fillRoundedRect(w*.06,h*.09,w*.88,h*.8,16);
          if (!s) return;
          if (s.mode==='critical_signal') this.paintSignal(g,w,h,s);
          if (s.mode==='drawing_chain') this.paintDrawing(g,w,h,s);
          if (s.mode==='kitchen_chaos') this.paintKitchen(g,w,h,s);
          if (s.mode==='pirate_cannon') this.paintCannon(g,w,h,s);
        }
        paintSignal(g: Phaser.GameObjects.Graphics,w: number,h: number,s: ArcadeState) {
          const pub=s.public as any; const hint=s.me as any;
          g.fillStyle(0x112c3e,1); g.fillRoundedRect(w*.12,h*.2,w*.76,h*.54,18);
          g.lineStyle(2,0x4ad7f0,0.7); g.strokeRoundedRect(w*.12,h*.2,w*.76,h*.54,18);
          g.fillStyle(0x102235,1); g.fillRoundedRect(w*.17,h*.29,w*.25,h*.35,12);
          g.fillStyle(0x08111c,1); g.fillRoundedRect(w*.47,h*.29,w*.34,h*.35,12);
          for(let i=0;i<4;i++) { const color=[0xff5e6c,0x48b7ff,0xffd166,0x55e0a3][i]; g.fillStyle(color,1); g.fillCircle(w*(.53+i*.078),h*.47,Math.min(w,h)*.026); }
          g.fillStyle(0x63e9fb,1); g.fillCircle(w*.295,h*.465,Math.min(w,h)*.065);
          g.lineStyle(3,0x66dff4,0.65); g.lineBetween(w*.37,h*.465,w*.48,h*.465);
          this.addText(w*.12,h*.115,`SİNYAL MODÜLÜ ${pub.module ?? 1} / 3`,15,'#8DEEFF');
          this.addText(w*.18,h*.32,'KİŞİSEL İPUCUN',11,'#94AFC2');
          this.addText(w*.18,h*.43,hint.position ? `${hint.position}. konum` : 'İpucu aranıyor',20,'#F6FBFF');
          this.addText(w*.18,h*.52,hint.color ? `${hint.color.toUpperCase()} sinyali` : 'Ekip ile konuş',13,'#92AFC4');
          this.addText(w*.13,h*.79,`HATA ${pub.strikes ?? 0} / 3`,12,(pub.strikes ?? 0)>1?'#ff7181':'#ffc46c');
        }
        addText(x:number,y:number,text:string,size:number,color:string) { this.texts.push(this.add.text(x,y,text,{fontFamily:'Arial, sans-serif',fontSize:`${size}px`,fontStyle:'bold',color,wordWrap:{width:this.scale.width*.7}})); }
        paintDrawing(g: Phaser.GameObjects.Graphics,w:number,h:number,s:ArcadeState) {
          const pub=s.public as any; const item=s.me as any;
          if(s.phase==='finished') {
            const chain=pub.chain??[];
            this.addText(w*.08,h*.035,'ZİNCİRİN AÇILIMI',14,'#8DEEFF');
            const cols=3, gap=w*.025, cardW=(w*.84-gap*2)/cols, cardH=h*.29;
            chain.forEach((entry:any,index:number)=>{
              const col=index%cols,row=Math.floor(index/cols),x=w*.08+col*(cardW+gap),y=h*.12+row*(cardH+h*.04);
              g.fillStyle(0xf7f4ed,1);g.fillRoundedRect(x,y,cardW,cardH,10);
              if(entry.kind==='drawing') {
                g.lineStyle(3,0x222d3c,1);for(const stroke of entry.strokes??[])for(let i=1;i<stroke.length;i++){const a=stroke[i-1],b=stroke[i];g.lineBetween(x+cardW*.08+cardW*.84*a[0]/1000,y+cardH*.08+cardH*.72*a[1]/700,x+cardW*.08+cardW*.84*b[0]/1000,y+cardH*.08+cardH*.72*b[1]/700);}
              } else this.addText(x+cardW*.06,y+cardH*.36,String(entry.text??''),Math.max(11,Math.round(w*.015)),'#182231');
              const caption=entry.kind==='drawing'?`ÇİZİM · ${index+1}`:`TAHMİN · ${index+1}`;
              this.addText(x+cardW*.06,y+cardH*.78,caption,10,'#607487');
            });
            return;
          }
          const x=w*.08,y=h*.13,bw=w*.84,bh=h*.73;
          g.fillStyle(0xffffff,1); g.fillRoundedRect(x,y,bw,bh,14);
          g.lineStyle(1,0xd9dee7,.9);
          for(let i=1;i<10;i++) g.lineBetween(x+bw*i/10,y,x+bw*i/10,y+bh);
          for(let i=1;i<7;i++) g.lineBetween(x,y+bh*i/7,x+bw,y+bh*i/7);
          for(const stroke of this.strokes) {
            g.lineStyle(9,0xe11d48,1);
            if(stroke.length===1)g.fillCircle(x+bw*stroke[0][0]/1000,y+bh*stroke[0][1]/700,5);
            for(let i=1;i<stroke.length;i++){const a=stroke[i-1],b=stroke[i];g.lineBetween(x+bw*a[0]/1000,y+bh*a[1]/700,x+bw*b[0]/1000,y+bh*b[1]/700);}
          }
          this.addText(w*.09,h*.035,s.phase==='draw'?'ÇİZİM MASASI':'TAHMİN SIRASI',14,'#8DEEFF');
          this.addText(w*.09,h*.89,s.phase==='draw'?(item.text ?? 'İPUCUNU ÇİZ'):(`ZİNCİR ${pub.chainStep ?? 0} / ${pub.totalSteps ?? 0}`),13,'#F6FBFF');
        }
        paintKitchen(g:Phaser.GameObjects.Graphics,w:number,h:number,s:ArcadeState) {
          const pub=s.public as any; const orders=pub.orders ?? [];
          g.fillStyle(0x241711,1);g.fillRoundedRect(w*.08,h*.17,w*.84,h*.59,16);
          const colors=[0x75dc96,0xff885f,0x6fb9ff,0xffd166];
          orders.forEach((o:any,i:number)=>{const xx=w*(.21+i*.29);g.fillStyle(0x39271d,1);g.fillRoundedRect(xx-w*.09,h*.31,w*.18,h*.31,14);g.fillStyle(colors[i%4],1);g.fillRoundedRect(xx-w*.07,h*.36,w*.14,h*.075,6);g.fillStyle(0xd8e5ee,1);g.fillCircle(xx,h*.51,Math.min(w,h)*.06);this.addText(xx-w*.08,h*.58,`${o.emoji}  ${String(o.status).toUpperCase()}`,11,'#F7F0E6');});
          this.addText(w*.1,h*.07,`SERVICE ${pub.score ?? 0}  ·  BEAT ${pub.beat ?? 1} / ${pub.beats ?? 8}`,14,'#FFDCA3');
          this.addText(w*.1,h*.81,`HATALAR ${pub.mistakes ?? 0}     ·     İSTASYONA DOKUN`,12,'#DDBA9B');
          const names=['DOĞRA','PİŞİR','TABAKLA','SERVİS'];
          names.forEach((n,i)=>{const xx=w*(.12+i*.22);g.fillStyle(colors[i],.22);g.fillRoundedRect(xx,h*.69,w*.17,h*.12,10);this.addText(xx+5,h*.725,n,10,'#FFF4E8');});
        }
        paintCannon(g:Phaser.GameObjects.Graphics,w:number,h:number,s:ArcadeState) {
          const pub=s.public as any; const team=(s.me as any).team ?? 0;
          g.fillStyle(0x12475b,1);g.fillRect(0,h*.67,w,h*.33);
          g.fillStyle(0x2c745e,1);g.fillEllipse(w*.5,h*.69,w*.25,h*.22);
          g.fillStyle(0x163b39,1);g.fillEllipse(w*.5,h*.62,w*.15,h*.16);
          g.fillStyle(0x34495b,1);g.fillEllipse(w*.13,h*.7,w*.16,h*.1);g.fillEllipse(w*.87,h*.7,w*.16,h*.1);
          g.fillStyle(0xe48a46,1);g.fillCircle(team===0?w*.13:w*.87,h*.6,Math.min(w,h)*.045);
          g.fillStyle(0xffdf90,1);g.fillCircle(team===0?w*.13:w*.87,h*.57,Math.min(w,h)*.02);
          for(let i=0;i<11;i++) { const x=w*(.08+i*.08);g.lineStyle(1,0xafd9e3,.22);g.lineBetween(x,h*.19,x+w*.045,h*.19); }
          this.addText(w*.08,h*.07,`RÜZGÂR ${Number(pub.wind ?? 0)>0?'+':''}${pub.wind ?? 0}     ·     TOPLAR ${pub.teamScores?.[0] ?? 0} : ${pub.teamScores?.[1] ?? 0}`,14,'#D7F6FF');
          const last=pub.lastShot; if(last?.path?.length){g.lineStyle(3,last.hit?0x78f0b0:0xffd166,.75);let previous:any=null;for(const p of last.path){const point={x:Number(p.x)*w,y:Number(p.y)*h};if(previous)g.lineBetween(previous.x,previous.y,point.x,point.y);previous=point;}const p=last.path[last.path.length-1];g.fillStyle(last.hit?0x70e8b0:0xffd166,1);g.fillCircle(Number(p.x)*w,Number(p.y)*h,7);}
          this.addText(w*.08,h*.84,`ATIŞ SIRASI ${pub.turns ?? 0} / ${pub.maxTurns ?? 12}  ·  ${team===0?'KIRMIZI TAKIM':'MAVİ TAKIM'}`,12,'#D7F6FF');
        }
      }
      const scene = new ArenaScene();
      game = new Phaser.Game({ type: Phaser.AUTO, parent: canvasRef.current!, width: 1000, height: 560, backgroundColor: '#080D18', scene: [scene], scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1000, height: 560 }, render: { antialias: true, pixelArt: false, powerPreference: 'high-performance' } });
      bridgeRef.current = { setState: (next) => { scene.setSnapshot(next); }, setDraft: (next) => scene.setDrawing(next), clearDraft: () => scene.clearDrawing() };
      scene.setSnapshot(null);
    });
    return () => { disposed = true; bridgeRef.current = null; game?.destroy(true); };
  }, [!!roomCode]);

  const act = async (payload: ArcadeAction) => {
    if (!roomCode || !state || actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(null);
    try { await submitArcadeAction(roomCode, { ...payload, step: state.step }); if(payload.action==='draw'){strokesRef.current=[];liveStrokeRef.current=null;} setDraft([]); bridgeRef.current?.clearDraft(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Hamle gönderilemedi.'); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const leaveGame = async () => {
    if (roomCode) {
      try { await service.leaveRoom(roomCode); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Odadan ayrılamadın.'); return; }
    }
    setRoomCode(null); setRoomState(null); router.replace('/game-modes');
  };

  const clearDraft = () => { strokesRef.current=[];liveStrokeRef.current=null;setDraft([]);bridgeRef.current?.clearDraft(); };

  if (!roomCode || !state) return <Screen><View style={styles.center}><ActivityIndicator color={palette.cyan}/><Text style={styles.muted}>Oyun arenası yükleniyor…</Text></View></Screen>;
  if (!isArcadeGameMode(state.mode)) return <Screen><View style={styles.center}><Text style={styles.title}>Oyun modu bulunamadı</Text><Button label="Lobiye dön" onPress={() => router.replace('/lobby')} /></View></Screen>;
  const publicState=state.public as any; const myPlayer=state.players.find((p)=>p.id===hostId); const remaining=state.deadline?Math.max(0,Math.ceil((new Date(state.deadline).getTime()-Date.now())/1000)):0;
  const ticketOrder=publicState.orders?.[ticket];
  const canAct=state.canAct&&!busy;

  return <Screen><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}><Text style={styles.back}>ODA {roomCode}</Text><Text style={styles.title}>{labels[state.mode]}</Text><Text style={styles.timer}>{state.phase==='finished'?'MAÇ SONU':`${remaining} SN`}</Text></View>
    <View style={styles.stage}>
      <div ref={canvasRef} style={{ width: '100%', height: '100%', touchAction: 'none', userSelect: 'none' }}/>
      {state.mode==='drawing_chain'&&state.phase==='draw'&&<Svg pointerEvents="none" viewBox="0 0 1000 560" style={styles.drawPreview}>
        {draft.map((stroke,index)=><Fragment key={index}>
          {stroke.length===1&&<Circle cx={80+840*stroke[0][0]/1000} cy={72.8+408.8*stroke[0][1]/700} r="6" fill="#E11D48"/>}
          <Polyline points={stroke.map(point=>`${80+840*point[0]/1000},${72.8+408.8*point[1]/700}`).join(' ')} fill="none" stroke="#E11D48" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
        </Fragment>)}
      </Svg>}
    </View>
    <View style={styles.playerRow}>{state.players.map(p=><View key={p.id} style={[styles.playerChip,{borderColor:p.id===state.currentPlayerId?palette.cyan:palette.border}]}><Text style={styles.playerName}>{p.name}{p.isHost?' 👑':''}</Text><Text style={styles.playerMeta}>{p.score} P{p.team!==undefined?` · ${p.team===0?'KIRMIZI':'MAVİ'}`:''}{p.submitted?' · HAZIR':''}</Text></View>)}</View>
    {state.phase==='finished' ? <Card style={styles.panel}><Text style={styles.panelTitle}>Maç tamamlandı</Text><Text style={styles.muted}>{state.result}</Text><Button label="Oyun seçimine dön" onPress={()=>void leaveGame()}/></Card> : null}
    {state.mode==='critical_signal'&&state.phase!=='finished'&&<View style={styles.controls}>
      <View style={styles.panel}><Text style={styles.panelTitle}>Mürettebat hattı</Text><Text style={styles.muted}>İpucunu sesli/sohbetten paylaşın. Defuser renk sırasını girsin.</Text>
        <View style={styles.chat}>{(publicState.chat??[]).slice(-4).map((m:any,i:number)=><Text key={`${m.at}-${i}`} style={styles.chatLine}><Text style={styles.cyan}>{state.players.find(p=>p.id===m.playerId)?.name??'Mürettebat'}: </Text>{m.text}</Text>)}</View>
        <View style={styles.inline}><TextInput value={chatText} onChangeText={setChatText} placeholder="Ekibe kısa ipucu gönder…" placeholderTextColor="#71879B" maxLength={160} style={styles.input}/><Button label="Gönder" disabled={!chatText.trim()||busy} onPress={()=>{const text=chatText.trim();setChatText('');void act({action:'message',text});}}/></View>
      </View>
      {myPlayer?.isHost&&<View style={styles.panel}><Text style={styles.panelTitle}>Defuser paneli · renk dizisi</Text><View style={styles.colorRow}>{Array.from({length:4},(_,i)=>{const color=SIGNAL_COLORS.find(c=>c.id===answer[i]);return <Pressable key={i} onPress={()=>setAnswer((a)=>{const n=[...a];const current=SIGNAL_COLORS.findIndex(c=>c.id===n[i]);n[i]=SIGNAL_COLORS[(current+1)%SIGNAL_COLORS.length].id;return n;})} style={[styles.colorSlot,{backgroundColor:color?.color??'#26384A'}]}><Text style={styles.slotText}>{i+1}</Text></Pressable>})}</View><Button label="Diziyi kilitle" disabled={!canAct||answer.length!==4} onPress={()=>{void act({action:'guess',answer});setAnswer([]);}}/></View>}
    </View>}
    {state.mode==='drawing_chain'&&state.phase!=='finished'&&<View style={styles.panel}><Text style={styles.panelTitle}>{state.phase==='draw'?(canAct?'Tuval sende':'Sıra bekleniyor'):'Çizimi tahmin et'}</Text>{state.phase==='draw'?canAct?<><Text style={styles.muted}>Yalnızca sana görünen ipucu: <Text style={styles.cyan}>{(state.me as any).text}</Text> · Tuvale parmağınla/farenle çiz.</Text><Text style={[styles.drawStatus,{color:draft.length?'#53D7A2':palette.muted}]}>{draft.length?'✓ Çizim alındı · '+draft.length+' çizgi':'Çizgiler tuvalde kırmızı olarak anında görünür.'}</Text><View style={styles.inline}><Button label="Temizle" disabled={!canAct} onPress={clearDraft}/><Button label="Çizimi devret" disabled={!canAct||draft.length===0} onPress={()=>void act({action:'draw',strokes:draft})}/></View></>:<Text style={styles.muted}>{state.players.find(p=>p.id===state.currentPlayerId)?.name??'Başka bir oyuncu'} çiziyor. Sıra sana gelince ipucun açılacak.</Text>:<><Text style={styles.muted}>Gördüğünü tek cümleyle tahmin et.</Text><View style={styles.inline}><TextInput value={guessText} onChangeText={setGuessText} placeholder="Bu çizim ne anlatıyor?" placeholderTextColor="#71879B" style={styles.input}/><Button label="Tahmini gönder" disabled={!canAct||guessText.trim().length<2} onPress={()=>{const text=guessText.trim();setGuessText('');void act({action:'guess',text});}}/></View></>}</View>}
    {state.mode==='kitchen_chaos'&&state.phase!=='finished'&&<View style={styles.panel}><Text style={styles.panelTitle}>İstasyon seçimi</Text><Text style={styles.muted}>Sipariş: {ticketOrder?.emoji} {ticketOrder?.name} · aşama: {ticketOrder?.status}</Text><View style={styles.ticketRow}>{(publicState.orders??[]).map((o:any,i:number)=><Pressable key={i} onPress={()=>setTicket(i)} style={[styles.ticket,{borderColor:ticket===i?palette.cyan:palette.border}]}><Text style={styles.muted}>{o.emoji} {o.name}</Text></Pressable>)}</View><View style={styles.stationRow}>{KITCHEN_ACTIONS.map(a=><Pressable disabled={!canAct||myPlayer?.submitted} key={a.id} onPress={()=>void act({action:a.id,ticket})} style={[styles.station,{backgroundColor:`${a.color}22`,borderColor:a.color}]}><Text style={styles.stationEmoji}>{a.emoji}</Text><Text style={styles.stationText}>{a.label}</Text></Pressable>)}</View><Text style={styles.muted}>Her oyuncu aynı anda bir istasyon hamlesi seçer; mutfak bütün hamleleri birlikte çözer.</Text></View>}
    {state.mode==='pirate_cannon'&&state.phase!=='finished'&&<View style={styles.panel}><Text style={styles.panelTitle}>{state.canAct?'Nişan al ve ateş et':`${state.players.find(p=>p.id===state.currentPlayerId)?.name??'Rakip'} nişan alıyor`}</Text><Text style={styles.muted}>Top açısı ve barut gücü merminin yörüngesini belirler. Rüzgâr her atışta değişir.</Text><View style={styles.adjustRow}><View style={styles.adjust}><Text style={styles.adjustLabel}>AÇI · {angle}°</Text><View style={styles.inline}><Button label="−" disabled={!canAct} onPress={()=>setAngle((v)=>Math.max(15,v-5))}/><Button label="+" disabled={!canAct} onPress={()=>setAngle((v)=>Math.min(75,v+5))}/></View></View><View style={styles.adjust}><Text style={styles.adjustLabel}>BARUT · {power}%</Text><View style={styles.inline}><Button label="−" disabled={!canAct} onPress={()=>setPower((v)=>Math.max(30,v-5))}/><Button label="+" disabled={!canAct} onPress={()=>setPower((v)=>Math.min(100,v+5))}/></View></View></View><Button label="💥 Ateş et" disabled={!canAct} onPress={()=>void act({action:'fire',angle,power})}/></View>}
    {error&&<Text style={styles.error}>{error}</Text>}
  </ScrollView></Screen>;
}

const styles=StyleSheet.create({page:{maxWidth:1050,width:'100%',alignSelf:'center',padding:18,paddingBottom:40,gap:14},center:{flex:1,alignItems:'center',justifyContent:'center',gap:16,backgroundColor:palette.bg},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},back:{color:palette.cyan,fontWeight:'800',fontSize:12},title:{color:palette.text,fontSize:22,fontWeight:'900'},timer:{color:palette.orange,fontWeight:'900',fontVariant:['tabular-nums']},stage:{width:'100%',height:Math.min(560,typeof window!=='undefined'?window.innerWidth*.56:420),minHeight:280,overflow:'hidden',borderRadius:20,borderWidth:1,borderColor:palette.border,backgroundColor:palette.bg,position:'relative'},drawPreview:{position:'absolute',top:0,left:0,width:'100%',height:'100%'},drawStatus:{fontSize:12,fontWeight:'900',textAlign:'center'},canvas:{width:'100%',height:'100%'},playerRow:{flexDirection:'row',flexWrap:'wrap',gap:8},playerChip:{backgroundColor:palette.panel,borderWidth:1,borderRadius:12,paddingVertical:8,paddingHorizontal:12,minWidth:110},playerName:{color:palette.text,fontWeight:'800',fontSize:12},playerMeta:{color:palette.muted,fontSize:10,marginTop:3},controls:{gap:12},panel:{backgroundColor:palette.panel,borderColor:palette.border,borderWidth:1,borderRadius:18,padding:16,gap:10},panelTitle:{fontSize:16,fontWeight:'900',color:palette.text},muted:{fontSize:12,color:palette.muted,lineHeight:18},cyan:{color:palette.cyan,fontWeight:'800'},chat:{gap:5,minHeight:40},chatLine:{fontSize:12,color:palette.text},inline:{flexDirection:'row',alignItems:'center',gap:9,flexWrap:'wrap'},input:{flex:1,minWidth:180,minHeight:46,borderWidth:1,borderColor:palette.border,borderRadius:12,paddingHorizontal:12,color:palette.text,backgroundColor:'#091321'},colorRow:{flexDirection:'row',gap:12,justifyContent:'center'},colorSlot:{width:54,height:54,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#ffffff55'},slotText:{color:'#08111c',fontWeight:'900'},ticketRow:{flexDirection:'row',flexWrap:'wrap',gap:8},ticket:{padding:9,borderWidth:1,borderRadius:10},stationRow:{flexDirection:'row',flexWrap:'wrap',gap:8},station:{flex:1,minWidth:110,padding:12,borderWidth:1,borderRadius:14,alignItems:'center',gap:4},stationEmoji:{fontSize:22},stationText:{color:palette.text,fontWeight:'800',fontSize:12},adjustRow:{flexDirection:'row',gap:20,justifyContent:'center',flexWrap:'wrap'},adjust:{alignItems:'center',gap:7},adjustLabel:{color:palette.text,fontWeight:'900',fontSize:13},error:{color:'#ff7584',fontWeight:'700',padding:12}});
