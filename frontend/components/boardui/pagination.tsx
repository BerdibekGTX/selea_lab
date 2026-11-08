"use client";

// Adapted from BoardUI's free pagination registry item. See README.md.
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowRight} from "@phosphor-icons/react";

function range(start:number,end:number) {return Array.from({length:end-start+1},(_,i)=>start+i)}
function paginationRange(current:number,total:number,sibling:number):(number|"dots")[] {
  if(sibling*2+5>=total)return range(1,total);
  const left=Math.max(current-sibling,1),right=Math.min(current+sibling,total);
  if(left<=2&&right<total-2)return [...range(1,3+2*sibling),"dots",total];
  if(left>2&&right>=total-2)return [1,"dots",...range(total-(2+2*sibling),total)];
  return [1,"dots",...range(left,right),"dots",total];
}

export function Pagination({page,totalPages,onChange}:{page:number;totalPages:number;onChange:(page:number)=>void}) {
  const ref=useRef<HTMLElement>(null);
  const [compact,setCompact]=useState(false);
  useEffect(()=>{
    if(!ref.current)return;
    const observer=new ResizeObserver(([entry])=>setCompact(entry.contentRect.width<420));
    observer.observe(ref.current);
    return ()=>observer.disconnect();
  },[]);
  return <nav ref={ref} className="bui-pagination" aria-label="Model catalog pages">
    <button type="button" aria-label="Previous page" disabled={page<=1} onClick={()=>onChange(page-1)}><ArrowLeft size={16}/>{!compact&&"Previous"}</button>
    <ul>{paginationRange(page,totalPages,compact?0:1).map((item,i)=><li key={item==="dots"?`dots-${i}`:item}>{item==="dots"?<span aria-hidden="true">…</span>:<button type="button" aria-label={`Go to page ${item}`} aria-current={page===item?"page":undefined} onClick={()=>onChange(item)}>{item}</button>}</li>)}</ul>
    <button type="button" aria-label="Next page" disabled={page>=totalPages} onClick={()=>onChange(page+1)}>{!compact&&"Next"}<ArrowRight size={16}/></button>
  </nav>;
}
