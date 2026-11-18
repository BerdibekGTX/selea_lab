"use client"
import {useEffect,useState} from "react"
import Link from "next/link"
import {videoApi} from "@/lib/video-api"
type Model={id:string;name:string;provider:string;version:string;categories:string[];comparisons:number}
export function VideoModelCatalog(){
 const [models,setModels]=useState<Model[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[query,setQuery]=useState(""),[retry,setRetry]=useState(0)
 useEffect(()=>{let active=true;setLoading(true);setError("");videoApi<Model[]>("/models").then(data=>{if(active)setModels(data)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[retry])
 const filtered=models.filter(m=>(m.name+" "+m.provider+" "+m.version).toLowerCase().includes(query.toLowerCase()))
 return <section className="models-page"><div className="models-heading"><h1>Video models</h1><p>Models with published comparisons. Generated externally, evaluated here.</p></div><input className="video-catalog-search" aria-label="Search video models" placeholder="Search by model or provider…" value={query} onChange={e=>setQuery(e.target.value)}/>{loading?<p role="status">Loading models…</p>:error?<div role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:filtered.length?<div className="models-grid">{filtered.map(m=><article className="catalog-card" key={m.id}><header><div><h2>{m.name}</h2><p>{m.provider} · {m.version}</p></div><span>Video</span></header><p className="video-catalog-description">{m.comparisons} published comparisons</p><div className="catalog-tags">{m.categories.map(c=><span key={c}>{c==="text-to-video"?"Text-to-Video":"Image-to-Video"}</span>)}</div><footer><Link href="/arena">Compare videos →</Link><Link href="/leaderboard/text-to-video">View rankings →</Link></footer></article>)}</div>:<div className="models-empty"><h3>{query?"No matching models":"No published video models yet"}</h3><p>Models appear after their reviewed comparisons are published.</p><Link href="/arena">Open video comparisons →</Link></div>}</section>
}
