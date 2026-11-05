import { useEffect, useRef } from 'react';
import { submitArcadeAction } from './client';
import type { ArcadeState } from './types';
import type { DrawingStrokes } from './drawingSync';

// Persist a bounded snapshot: late joiners and reconnecting viewers see the same canvas.
export function useTeamDrawing(room: string | null, state: ArcadeState | null, draft: DrawingStrokes, reset: (strokes: DrawingStrokes) => void, onError: (message: string) => void) {
  const latest = useRef({state,draft,reset,onError});
  const saved=useRef('');
  useEffect(()=>{latest.current={state,draft,reset,onError};},[state,draft,reset,onError]);
  useEffect(()=>{
    const current=latest.current.state;
    if(current?.mode!=='drawing_chain'||current.public.rulesVersion!==2)return;
    const strokes=(current.public.strokes??[]) as DrawingStrokes;
    saved.current=JSON.stringify(strokes);
    latest.current.reset(current.phase==='draw'&&current.canAct?strokes:[]);
  },[state?.step,state?.mode,state?.public.rulesVersion]);
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
