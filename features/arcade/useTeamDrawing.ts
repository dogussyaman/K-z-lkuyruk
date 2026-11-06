import { useEffect, useRef } from 'react';
import { submitArcadeAction } from './client';
import type { ArcadeState } from './types';
import { subscribeToArcadeDrawingDraft, type DrawingStrokes } from './drawingSync';

// Persist a bounded snapshot: late joiners and reconnecting viewers see the same canvas.
export function useTeamDrawing(room: string | null, playerId: string | undefined, state: ArcadeState | null, draft: DrawingStrokes, reset: (strokes: DrawingStrokes) => void, onRemoteDraft: (step: number, strokes: DrawingStrokes) => void, onError: (message: string) => void) {
  const latest = useRef({state,draft,reset,onRemoteDraft,onError});
  const saved=useRef('');
  const restoring=useRef(false);
  const publisher=useRef<ReturnType<typeof subscribeToArcadeDrawingDraft> | null>(null);
  const remoteSequence=useRef({step:-1,sequence:-1});
  useEffect(()=>{latest.current={state,draft,reset,onRemoteDraft,onError};},[state,draft,reset,onRemoteDraft,onError]);
  useEffect(()=>{
    const current=latest.current.state;
    if(current?.mode!=='drawing_chain'||current.public.rulesVersion!==2)return;
    const strokes=(current.public.strokes??[]) as DrawingStrokes;
    restoring.current=true;
    saved.current=JSON.stringify(strokes);
    remoteSequence.current={step:current.step,sequence:-1};
    latest.current.onRemoteDraft(current.step,strokes);
    latest.current.reset(current.phase==='draw'&&current.canAct?strokes:[]);
  },[state?.step,state?.mode,state?.public.rulesVersion]);
  useEffect(()=>{
    if(!room||!playerId)return;
    let active=true;
    const channel=subscribeToArcadeDrawingDraft(room,(incoming)=>{
      const current=latest.current.state;
      if(!active||!current||current.mode!=='drawing_chain'||current.public.rulesVersion!==2||current.phase!=='draw'||current.step!==incoming.step||current.currentPlayerId!==incoming.playerId||incoming.playerId===playerId)return;
      if(remoteSequence.current.step===incoming.step&&incoming.sequence<=remoteSequence.current.sequence)return;
      remoteSequence.current={step:incoming.step,sequence:incoming.sequence};
      latest.current.onRemoteDraft(incoming.step,incoming.strokes);
    },(message)=>{if(active)latest.current.onError(message);});
    publisher.current=channel;
    return()=>{active=false;publisher.current=null;channel.dispose();};
  },[room,playerId]);
  useEffect(()=>{
    if(restoring.current){restoring.current=false;return;}
    if(state?.mode==='drawing_chain'&&state.public.rulesVersion===2&&state.phase==='draw'&&state.canAct&&playerId){
      publisher.current?.publish(state.step,playerId,draft);
    }
  },[draft,playerId,state?.canAct,state?.mode,state?.phase,state?.step,state?.public.rulesVersion]);
  useEffect(()=>{
    if(!room)return;
    let stopped=false, busy=false;
    const timer=setInterval(async()=>{
      const {state:s,draft:d,onError:fail}=latest.current;
      if(stopped||busy||s?.mode!=='drawing_chain'||s.public.rulesVersion!==2||s.phase!=='draw'||!s.canAct||!s.deadline||Date.parse(s.deadline)<=Date.now())return;
      const json=JSON.stringify(d);
      if(json===saved.current)return;
      busy=true;
      try {
        await submitArcadeAction(room,{action:'draft',step:s.step,strokes:d,sequence:Date.now()});
        if(!stopped&&latest.current.state?.step===s.step)saved.current=json;
      } catch(error) {
        if(!stopped&&latest.current.state?.step===s.step&&Date.parse(s.deadline)>Date.now())fail(error instanceof Error?error.message:'Çizim gönderilemedi; yeniden deneniyor.');
      } finally {busy=false;}
    },250);
    return()=>{stopped=true;clearInterval(timer);};
  },[room]);
}
