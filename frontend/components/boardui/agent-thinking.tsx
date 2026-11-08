"use client";

// Wave indicator adapted from BoardUI's free agent-thinking registry item.
import {useEffect,useState} from "react";

const seed=[.55,.3,.15,.85,.55,.3,1,.85,.55];
export function AgentThinking({label="Thinking"}:{label?:string}) {
  const [opacities,setOpacities]=useState(seed);
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{
    const started=performance.now();
    const timer=window.setInterval(()=>setElapsed(Math.floor((performance.now()-started)/1000)),1000);
    const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation:number|undefined;
    function animate(){
      window.clearInterval(animation);
      setOpacities(seed);
      if(motion.matches)return;
      let phase=0;
      animation=window.setInterval(()=>{
        phase=(phase+1/8)%1;
        setOpacities(seed.map((_,i)=>{
          const scalar=((i%3+Math.floor(i/3))/4)*.75;
          const behind=(phase-scalar+1)%1;
          return .12+.88*Math.max(0,1-behind/.3)**1.5;
        }));
      },80);
    }
    animate();motion.addEventListener("change",animate);
    return ()=>{clearInterval(timer);clearInterval(animation);motion.removeEventListener("change",animate)};
  },[]);
  return <div className="bui-thinking">
    <span className="bui-thinking-grid" aria-hidden="true">{opacities.map((opacity,i)=><span key={i} style={{opacity}}/>)}</span>
    <span role="status">{label}…</span>
    <span className="bui-thinking-timer" aria-hidden="true">{elapsed}s</span>
  </div>;
}
