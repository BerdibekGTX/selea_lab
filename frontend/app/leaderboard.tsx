"use client";



import {useEffect, useRef, useState} from "react";

import Link from "next/link";
import { ModelRankingChart } from "@/components/model-ranking-chart";





import {ArrowRight, ArrowsClockwise, ChartBar, ChatCircle, CheckCircle, Code, FileText, ImageSquare, ShieldCheck, Sparkle, VideoCamera, WarningCircle, CaretDown, CaretRight, Browser, Eye} from "@phosphor-icons/react";



export const categories = [

  {id:"overview",label:"Overview",group:"",icon:ChartBar},

  {id:"capabilities",label:"Capabilities",group:"Agent",icon:Sparkle},

  {id:"alignment",label:"Alignment",group:"Agent",icon:ShieldCheck},

  {id:"text",label:"Text",group:"Chat",icon:ChatCircle},

  {id:"vision",label:"Vision",group:"Chat",icon:Eye},

  {id:"document",label:"Document",group:"Chat",icon:FileText},

  {id:"webdev",label:"WebDev",group:"Code",icon:Browser},

  {id:"image-to-webdev",label:"Image-to-WebDev",group:"Code",icon:Code},

  {id:"text-to-image",label:"Text-to-Image",group:"Image",icon:ImageSquare},

  {id:"single-image-edit",label:"Single Image Edit",group:"Image",icon:Sparkle},

  {id:"multi-image-edit",label:"Multi Image Edit",group:"Image",icon:Sparkle},

  {id:"text-to-video",label:"Text-to-Video",group:"Video",icon:VideoCamera},

  {id:"image-to-video",label:"Image-to-Video",group:"Video",icon:VideoCamera},

  {id:"video-edit",label:"Video Edit",group:"Video",icon:VideoCamera},

];

const categoryHref = (id:string) => id === "overview" ? "/leaderboard" : "/leaderboard/" + id;



export function CategoryMenu({category, group, sidebar=false}: {category:string;group?:string;sidebar?:boolean}) {

  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(()=>{

    function close(event:PointerEvent) {

      if(menu.current && !menu.current.contains(event.target as Node)) menu.current.open=false;

    }

    function escape(event:KeyboardEvent) {

      if(event.key==="Escape" && menu.current?.open) {

        menu.current.open=false;

        menu.current.querySelector("summary")?.focus();

      }

    }

    document.addEventListener("pointerdown",close);

    document.addEventListener("keydown",escape);

    return ()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape)};

  },[]);

  const selected=categories.find(item=>item.id===category)??categories[0];

  return <details ref={menu} className={"lb-menu "+(sidebar?"lb-side-menu":"")}>

    <summary aria-label={sidebar?"Leaderboard categories":group?group+" categories":"Choose leaderboard"}>

      {sidebar?<CaretRight size={13}/>:group?<>{group}<CaretDown size={10}/></>:<><ChartBar size={18}/>{selected.label}<CaretDown size={11}/></>}

    </summary>

    <nav className="lb-category-menu" aria-label={group?group+" leaderboards":"Leaderboard categories"}>

      {["","Agent","Chat","Code","Image","Video"].filter(section=>!group||section===group).map(section=><div key={section}>

        {section&&<small>{section}</small>}

        {categories.filter(item=>item.group===section).map(item=><Link key={item.id} href={categoryHref(item.id)} aria-label={item.label} aria-current={category===item.id?"page":undefined} onClick={()=>{if(menu.current)menu.current.open=false}}>

          <item.icon size={16}/><span>{item.label}</span>

        </Link>)}

      </div>)}

    </nav>

  </details>;

}



export function LeaderboardHeader({category,onStart}: {category:string;onStart:()=>void}) {

  return <>


    <nav className="lb-top-categories" aria-label="Leaderboard sections">

      {["Agent","Chat","Code","Image","Video"].map(group=><CategoryMenu key={group} group={group} category={category}/>)}

    </nav>

    <button className="lb-start" onClick={onStart}>Start Voting</button>

  </>;

}



type Model = {id:string;provider:string};

type Score = Model & {wins:number;ties:number;votes:number};

type Recent = {id:string;title:string;mode:string;models:Model[];status:"complete"|"voted"|"error";updated:number};

type Overview = {category:string;supported:boolean;total_sessions:number;category_sessions:number;total_votes:number;rankings:Score[];recent:Recent[]};

const rate = (score:Score) => (score.wins + score.ties / 2) / score.votes * 100;

const providerNames:Record<string,string>={demo:"Demo model",openai:"OpenAI",anthropic:"Anthropic",xai:"xAI",hidden:"Anonymous battle"};

const tabs=[

  {id:"overview",label:"Best Overall Models",icon:Sparkle},

  {id:"text",label:"Best Text Models",icon:ChatCircle},

  {id:"capabilities",label:"Best Overall Agents",icon:Code},

  {id:"alignment",label:"Best Aligned Agents",icon:ShieldCheck},

  {id:"webdev",label:"Best WebDev Models",icon:Browser},

  {id:"text-to-image",label:"Best Image Models",icon:ImageSquare},

  {id:"text-to-video",label:"Best Video Models",icon:VideoCamera},

];



function ModelMark({provider}:{provider:string}) {

  return <span className={"lb-model-mark lb-provider-"+provider} aria-hidden="true">{provider==="openai"?"O":provider==="anthropic"?"A":provider==="xai"?"x":provider==="hidden"?"?":"D"}</span>;

}



export default function Leaderboard({category,ready,onStart}: {category:string;ready:boolean;onStart:()=>void}) {

  const [data,setData]=useState<Overview|null>(null);

  const [error,setError]=useState("");

  const [retry,setRetry]=useState(0);

  const selected=categories.find(item=>item.id===category)??categories[0];

  useEffect(()=>{

    setData(null);setError("");

    if(!ready)return;

    const controller=new AbortController();

    let active=true;

    const timeout=setTimeout(()=>controller.abort(),10000);

    fetch("/api/leaderboard/overview?category="+encodeURIComponent(category),{signal:controller.signal})

      .then(async response=>{

        if(!response.ok)throw new Error("Could not load this leaderboard.");

        return response.json() as Promise<Overview>;

      })

      .then(result=>{if(active)setData(result)})

      .catch(()=>{if(active)setError("Could not load this leaderboard. Please try again.")})

      .finally(()=>clearTimeout(timeout));

    return ()=>{active=false;clearTimeout(timeout);controller.abort()};

  },[category,ready,retry]);

  const rankings=data?.rankings??[];

  const top = rankings.filter(score => score.votes > 0).slice(0, 10);

  const badge=category==="overview"?"Best Overall":selected.label;

  return <section className="lb-overview">

    <div className="lb-hero">

      <header className="lb-intro"><h1>Measuring AI<br/>in the <em>real world.</em></h1><p>Compare AI models through your conversations.<br/>Discover what performs best in your workspace.</p><div className="lb-total"><strong>{data?.total_sessions.toLocaleString() ?? "—"}</strong><span>Total sessions · Your workspace</span></div></header>

      <aside className="lb-highlights" aria-label="Ranking highlights">

        <div className="lb-eyebrow">Leading in your workspace <span className="status-dot" aria-hidden="true"/></div>

        {rankings.slice(0,3).map((score,index)=><Link href="/models" className="lb-highlight" key={score.provider+score.id}>

          <ModelMark provider={score.provider}/><div><h2>{score.id}</h2><p><strong>#{index+1}</strong> in {selected.label==="Overview"?"Overall":selected.label}<span> · {score.provider==="demo"?"Demo":providerNames[score.provider]??score.provider}</span></p></div><CaretRight size={16}/>

        </Link>)}

        {data&&!rankings.length&&<div className="lb-highlight-empty"><ChartBar size={28}/><h2>Your next discovery starts here.</h2><p>Rankings appear after you compare responses and cast your first vote.</p><button onClick={onStart}>Start a comparison <ArrowRight size={14}/></button></div>}

        {!data&&!error&&<p className="lb-loading" role="status">Loading rankings…</p>}

      </aside>

    </div>

    <nav className="lb-tabs" aria-label="Ranking categories">{tabs.map(tab=><Link key={tab.id} href={categoryHref(tab.id)} aria-current={category===tab.id?"page":undefined}><tab.icon size={17}/>{tab.label}</Link>)}</nav>

    {error?<div className="lb-error" role="alert"><p>{error}</p><button className="secondary" onClick={()=>setRetry(value=>value+1)}><ArrowsClockwise size={16}/>Retry</button></div>:<>

      {data&&!data.supported&&<p className="lb-category-note">{selected.label} evaluations are not available in this local version yet.</p>}

      <div className="lb-panels">

        <article className="lb-panel">

          <header><h2>Top 10 Models</h2><span className="lb-badge"><selected.icon size={13}/>{badge}</span></header>

          <div className="lb-chart" aria-label="Model win rates">

            {top.length > 0 && <ModelRankingChart rows={top.map(score => ({
              id: score.provider + "/" + score.id, model: score.id, winRate: rate(score), votes: score.votes,
            }))}/>}

            {data&&!top.length&&<div className="lb-panel-empty"><ChartBar size={32}/><h3>No ranked models yet</h3><p>{data.supported?"Completed comparisons and votes will populate this chart.":"This category will appear here when evaluations become available."}</p>{data.supported&&<button className="secondary" onClick={onStart}>Compare models <ArrowRight size={14}/></button>}</div>}

            {!data&&<p className="lb-loading">Loading model results…</p>}

          </div>

          <footer><span>{data?.total_votes??0} votes · win rate includes ties at 50%</span><Link href="/models">View models <ArrowRight size={13}/></Link></footer>

        </article>

        <article className="lb-panel">

          <header><h2>Recent Sessions</h2><span className="lb-badge"><selected.icon size={13}/>{badge}</span></header>

          <div className="lb-session-list">{data?.recent.map(session=><Link className="lb-session" href={"/chat/"+session.id} key={session.id}>

            <ModelMark provider={session.models[0]?.provider??"hidden"}/>

            <div className="lb-session-title"><strong>{session.models.map(model=>model.id).join(" / ")}</strong><span title={session.title}>{session.title}</span></div>

            <div className={"lb-status "+(session.status==="error"?"has-error":"")}>{session.status==="error"?<WarningCircle size={15}/>:<CheckCircle size={15}/>}<span>{session.status==="error"?"Needs attention":session.status==="voted"?"Vote recorded":"Session complete"}</span></div><CaretRight size={13}/>

          </Link>)}

          {data&&!data.recent.length&&<div className="lb-panel-empty"><ChatCircle size={32}/><h3>No sessions in this category</h3><p>Your completed conversations will appear here.</p></div>}

          {!data&&<p className="lb-loading">Loading sessions…</p>}

          </div>

          <footer><span>{data?.category_sessions??0} sessions in this category</span><Link href="/history/search">View history <ArrowRight size={13}/></Link></footer>

        </article>

      </div>

      <p className="lb-methodology">Rankings reflect your votes in this workspace. Ties count as half a win, and “Both bad” gives neither model a win. Demo models use simulated responses.</p>

    </>}

  </section>;

}

