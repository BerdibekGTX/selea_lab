"use client";

import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {usePathname, useRouter} from "next/navigation";
import Leaderboard from "./leaderboard";
import Models from "./models";
import {AgentThinking} from "../components/boardui/agent-thinking";
import {SeleaSidebar} from "../components/selea-sidebar";
import {PageHeading} from "../components/boardui/page-heading";
import {ArrowUp, ArrowRight, Plus, SidebarSimple, ChatCircle, ChartBar, GearSix, X, Copy, DownloadSimple, Globe, Code, GameController, ImageSquare, Database, Storefront, Check, Paperclip, SignOut, UserCircle, ShieldCheck} from "@phosphor-icons/react";

type Model = {provider: string; id: string};
type Answer = {text: string; error: boolean; html?: string};
type Chat = {id: string; title: string; mode: string; models: Model[]; turns: {prompt: string; responses: Answer[]}[]; vote?: string};
type User = {id: string; name: string; email: string};
type History = {id: string; title: string; updated: number};
const defaultModels: Model[] = [{provider:"demo",id:"demo-a"},{provider:"demo",id:"demo-b"}];
const modeNames: Record<string,string> = {battle:"Battle",compare:"Side by Side",direct:"Direct",agent:"Agent"};
const starters = [
  {title:"Create a landing page",detail:"Create a sleek, modern landing page",icon:Globe,prompt:"Create a sleek, modern landing page for a sustainable design studio."},
  {title:"Build a dashboard",detail:"Turn data into interactive charts",icon:ChartBar,prompt:"Build an interactive analytics dashboard using sample data."},
  {title:"Make a game",detail:"Build a playable browser game",icon:GameController,prompt:"Build a playable snake game with score tracking and keyboard controls."},
  {title:"Design to code",detail:"Describe a design and bring it to life",icon:ImageSquare,prompt:"Build a minimalist portfolio with editorial typography and a three-column gallery."},
  {title:"Build a web app",detail:"Start with an interactive prototype",icon:Database,prompt:"Build a task management app with add, complete and filter controls."},
  {title:"Launch a storefront",detail:"Create a beautiful online shop",icon:Storefront,prompt:"Build a coffee storefront with product cards and a working local shopping cart."},
];

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + path, body === undefined ? {} : {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Please check the fields and try again.");
  return data;
}

function Brand() {
  return <span className="brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h15v5H6zM3 9h15v6H3zM0 16h15v5H0z" fill="currentColor"/></svg><span>selea</span></span>;
}

export default function Arena() {
  const path = usePathname();
  const router = useRouter();
  const [expanded,setExpanded] = useState(true);
  const [mobileOpen,setMobileOpen] = useState(false);
  const [ready,setReady] = useState(false);
  const [user,setUser] = useState<User|null>(null);
  const [history,setHistory] = useState<History[]>([]);
  const [chat,setChat] = useState<Chat|null>(null);
  const [mode,setMode] = useState("battle");
  const [models,setModels] = useState<Model[]>(defaultModels);
  const [keys,setKeys] = useState<Record<string,string>>({});
  const [prompt,setPrompt] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [modal,setModal] = useState<"settings"|"login"|"register"|"privacy"|null>(null);
  const [query,setQuery] = useState("");
  const [preview,setPreview] = useState(false);
  const [copied,setCopied] = useState("");
  const [attachment,setAttachment] = useState<{name:string;text:string}|null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const board = path === "/leaderboard" || path.startsWith("/leaderboard/") || path === "/leaderboards";
  const category = path.startsWith("/leaderboard/") ? path.split("/")[2] : "overview";
  const search = path === "/history/search";
  const modelPage = path === "/models";
  const activeChatId = path.startsWith("/chat/") ? path.split("/")[2] : null;
  const chatRef = useRef<Chat|null>(null);
  chatRef.current = chat;

  async function refreshHistory() { setHistory(await api<History[]>("/chats")); }
  useEffect(()=>{
    api<{user:User|null}>("/session").then(async session=>{
      setUser(session.user);
      await refreshHistory();
      setReady(true);
    }).catch(()=>setError("The API is unavailable. Start the backend and reload this page."));
    try {
      const stored = JSON.parse(localStorage.getItem("selea-arena-models") || "null");
      if(Array.isArray(stored) && stored.length === 2 && stored.every(m=>["demo","openai","anthropic","xai"].includes(m.provider) && typeof m.id === "string")) setModels(stored);
    } catch {}
  },[]);
  useEffect(()=>{
    if (!ready) return;
    setMobileOpen(false);
    let active = true;
    setError("");
    if (activeChatId) {
      if(chatRef.current?.id !== activeChatId) {
        setChat(null);
        api<Chat>("/chats/"+activeChatId).then(data=>{if(active){setChat(data);setMode(data.mode)}}).catch(e=>{if(active)setError(e.message)});
      }
    } else {
      setChat(null);
    }
    return ()=>{active=false};
  },[path,ready,activeChatId,board]);
  useEffect(()=>{if(busy || chat) end.current?.scrollIntoView({behavior:"smooth",block:"end"})},[busy,chat]);
  useEffect(()=>{
    if(modal) dialog.current?.showModal();
    else dialog.current?.close();
  },[modal]);

  function newChat() {
    if(busy) return;
    setMobileOpen(false);
    setChat(null);setPrompt("");setAttachment(null);setError("");setPreview(false);router.push("/");
    textarea.current?.focus();
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if(!prompt.trim() || !ready || busy) return;
    const text = prompt.trim() + (attachment ? "\n\nAttached file: "+attachment.name+"\n"+attachment.text : "");
    if(text.length > 12000) {setError("Prompt and attachment must fit within 12,000 characters.");return}
    setBusy(true);setError("");setPreview(false);
    try {
      const result = await api<Chat>("/chat",{chat_id:chat?.id,mode:chat?.mode || mode,prompt:text,models,keys});
      setChat(result);setPrompt("");setAttachment(null);router.push("/chat/"+result.id);
      await refreshHistory();
    } catch(e) {setError((e as Error).message)}
    finally {setBusy(false)}
  }
  async function vote(choice: string) {
    if(!chat || busy) return;
    setBusy(true);setError("");
    try {setChat(await api<Chat>("/chats/"+chat.id+"/vote",{choice}))}
    catch(e) {setError((e as Error).message)}
    finally {setBusy(false)}
  }
  function updateModel(index:number, patch:Partial<Model>) {
    const next=models.map((m,i)=>i===index?{...m,...patch}:m);
    setModels(next);
    try {localStorage.setItem("selea-arena-models",JSON.stringify(next))} catch {}
  }
  async function account(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result=await api<{user:User}>("/auth/"+(modal==="register"?"register":"login"),Object.fromEntries(data));
      setUser(result.user);setModal(null);await refreshHistory();
    } catch(e) {setError((e as Error).message)}
    finally {setBusy(false)}
  }
  async function logout() {
    try {await api("/logout",{});setUser(null);setHistory([]);setKeys({});setChat(null);setModal(null);router.push("/")}
    catch(e) {setError((e as Error).message)}
  }
  async function copy(text:string,id:string) {
    try {await navigator.clipboard.writeText(text);setCopied(id)}
    catch {setError("Copy is unavailable in this browser. Select the response text to copy it.")}
  }
  function download(text:string,name:string,type="text/plain") {
    const url=URL.createObjectURL(new Blob([text],{type}));
    const link=document.createElement("a");link.href=url;link.download=name;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const last=chat?.turns.at(-1);
  const html=last?.responses[0].html;
  const sandboxHtml=html ? '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; form-action \'none\';">' + html : "";
  const filtered=history.filter(item=>item.title.toLowerCase().includes(query.toLowerCase()));

  const startVoting=()=>{setMode("battle");newChat()};
  function useCatalogModels(selection:Model[]) {
    if(busy)return;
    const next=selection.length===2?selection.map(({id,provider})=>({id,provider})):[{id:selection[0].id,provider:selection[0].provider},models[1]];
    setModels(next);
    try{localStorage.setItem("selea-arena-models",JSON.stringify(next))}catch{}
    setMode(selection.length===2?"compare":"direct");
    newChat();
  }

  return <div className={"selea-shell "+(expanded?"expanded ":"")}> 
    <SeleaSidebar expanded={expanded} onExpandedChange={setExpanded} mobileOpen={mobileOpen} onMobileClose={()=>setMobileOpen(false)} history={history} activeChatId={activeChatId} board={board} modelPage={modelPage} category={category} busy={busy} userName={user?.name} onNewChat={newChat} onSettings={()=>setModal("settings")} onAccount={()=>setModal(user?"settings":"login")} onPrivacy={()=>setModal("privacy")}/>
    <main className={chat?"conversation":""}>
      <header className="topbar">
        <button className="workspace-sidebar-toggle icon" aria-label="Open sidebar" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)}><SidebarSimple size={18}/></button>
        <Link href="/" aria-label="Selea home" className="header-brand"><Brand/></Link><span className="header-divider" aria-hidden="true">/</span><span className="header-location">{board?"Leaderboard":modelPage?"Models":search?"History":chat?"Conversation":"Arena"}</span>
        <div className="top-right"><span className="environment"><i/>{models.every(m=>m.provider==="demo")?"Demo workspace":"Your models"}</span><button className="icon header-settings" aria-label="Workspace settings" onClick={()=>setModal("settings")}><GearSix size={18}/></button><button className="header-account" onClick={()=>setModal(user?"settings":"login")}>{user?user.name:"Log in"}</button></div>
      </header>
      {error&&!modal&&<div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError("")}><X size={16}/></button></div>}
      {board?<Leaderboard category={category} ready={ready} onStart={startVoting}/>
      :search?<section className="directory"><PageHeading title="Conversations" description="Pick up where you left off." icon={<ChatCircle size={22}/>}/><input className="search" placeholder="Search your chats…" aria-label="Search chats" value={query} onChange={e=>setQuery(e.target.value)}/><div className="history-list">{filtered.map(item=><Link key={item.id} href={"/chat/"+item.id}><ChatCircle size={20}/><span>{item.title}<small>{new Date(item.updated*1000).toLocaleDateString()}</small></span><ArrowRight size={16}/></Link>)}{!filtered.length&&<p>No conversations found.</p>}</div></section>
      :modelPage?<Models configured={models} ready={ready} onUse={useCatalogModels} onConfigure={()=>setModal("settings")}/>
      :<div className={chat?"chat-content":"welcome"}>
        {!chat&&!activeChatId&&<div className="hero page-heading"><span className="bui-welcome-icon" aria-hidden="true"><ChatCircle size={26}/></span><h1 className="page-title">One question. More perspectives.</h1><p className="page-description">Ask, compare, and find the answer that works for you.</p></div>}
        {chat&&<div className="transcript">
          <div className="chat-heading"><span>{modeNames[chat.mode]}</span><button className="icon" title="Export chat" onClick={()=>download(JSON.stringify(chat,null,2),"conversation.json","application/json")}><DownloadSimple size={18}/></button></div>
          {chat.turns.map((turn,index)=><section className="turn" key={index}><div className="user-message">{turn.prompt}</div><div className={"answers "+(turn.responses.length===2?"pair":"")}>{turn.responses.map((answer,side)=><article key={side}><h2>{chat.models[side].id}<small>{chat.models[side].provider==="demo"?"Demo":chat.models[side].provider==="hidden"?"Anonymous":chat.models[side].provider}</small></h2><div className={answer.error?"answer-error":"answer-text"}>{answer.text}</div><button className="copy" title="Copy response" onClick={()=>copy(answer.text,index+"-"+side)}>{copied===index+"-"+side?<Check size={14}/>:<Copy size={14}/>} Copy</button></article>)}</div></section>)}
          {html&&<div className="artifact"><div><button className="secondary" onClick={()=>setPreview(!preview)}>{preview?"Hide preview":"Preview artifact"}</button><button className="secondary" onClick={()=>download(html,"artifact.html","text/html")}>Download HTML</button></div>{preview&&<iframe title="Generated artifact" sandbox="allow-scripts" srcDoc={sandboxHtml}/>}</div>}
          {["battle","compare"].includes(chat.mode)&&last&&!last.responses.some(r=>r.error)&&<div className="voting">{chat.vote?<><span>Vote recorded · Models revealed</span><button className="primary" onClick={newChat}>New battle <Plus size={16}/></button></>:<><p>Which response do you prefer?</p><div>{[["a","A is better"],["b","B is better"],["tie","Tie"],["neither","Both bad"]].map(([value,label])=><button className="secondary" key={value} disabled={busy} onClick={()=>vote(value)}>{label}</button>)}</div></>}</div>}
        </div>}
        {busy&&<AgentThinking/>}
        {!chat?.vote&&<form className="composer" onSubmit={send}>
          {attachment&&<div className="file-chip">{attachment.name}<button type="button" aria-label="Remove attachment" onClick={()=>setAttachment(null)}><X size={14}/></button></div>}
          <textarea ref={textarea} value={prompt} onChange={e=>setPrompt(e.target.value)} aria-label="Message" placeholder={chat?"Ask a follow-up…":"Ask anything…"} maxLength={12000} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit()}}}/>
          <div className="composer-tools">
            <input hidden ref={file} type="file" accept=".txt,.md,.csv,.json,.html,.css,.js,.py" onChange={async event=>{
              const selected=event.target.files?.[0];event.target.value="";
              if(!selected)return;
              if(selected.size>20000){setError("Choose a text file smaller than 20 KB.");return}
              try{setAttachment({name:selected.name,text:await selected.text()})}catch{setError("The file could not be read.")}
            }}/>
            <button type="button" className="icon" title="Attach a text file" aria-label="Attach a text file" onClick={()=>file.current?.click()}><Plus size={17}/></button>
            <select aria-label="Chat mode" value={chat?.mode||mode} disabled={!!chat||busy} onChange={e=>setMode(e.target.value)}>{Object.entries(modeNames).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
            <button className="model-control" type="button" onClick={()=>setModal("settings")}>{(chat?.mode||mode)==="battle"?"Auto select":models[0].id}<span>⌄</span></button>
            <button type="submit" className="send icon" aria-label="Send message" disabled={!ready||busy||!prompt.trim()}><ArrowRight size={19}/></button>
          </div>
        </form>}
        {!chat&&!activeChatId&&<div className="starters"><small>Get started</small><div>{starters.map(item=><button key={item.title} onClick={()=>{setMode("agent");setPrompt(item.prompt);textarea.current?.focus()}}><i><item.icon size={18}/></i><span>{item.title}<small>{item.detail}</small></span></button>)}</div></div>}
        {chat&&<p className="chat-note">AI can make mistakes. Review responses before relying on them.</p>}
        <div ref={end}/>
      </div>}
    </main>
    <dialog ref={dialog} onCancel={()=>setModal(null)} onClick={event=>{if(event.target===event.currentTarget)setModal(null)}}>
      {modal&&<div className={"dialog-content bui-dialog-"+modal}><header><span className="bui-dialog-icon" aria-hidden="true">{modal==="settings"?<GearSix size={21}/>:modal==="privacy"?<ShieldCheck size={21}/>:<UserCircle size={21}/>}</span><h2>{modal==="settings"?"Settings":modal==="privacy"?"Privacy and data":modal==="register"?"Create an account":"Welcome back"}</h2><button className="icon" aria-label="Close dialog" onClick={()=>setModal(null)}><X size={20}/></button></header>
        {error&&<p className="error" role="alert">{error}</p>}
        {modal==="settings"?<><p>Connect your models. API keys stay in this tab for the current session.</p>{models.map((model,index)=><fieldset key={index}><legend>Model {index===0?"A":"B"}</legend><div className="fields"><label>Provider<select value={model.provider} onChange={e=>updateModel(index,{provider:e.target.value,id:e.target.value==="demo"?"demo-"+(index?"b":"a"):""})}>{["demo","openai","anthropic","xai"].map(provider=><option key={provider}>{provider}</option>)}</select></label><label>Model ID<input value={model.id} onChange={e=>updateModel(index,{id:e.target.value})} placeholder="Enter provider model ID"/></label></div></fieldset>)}
          {["openai","anthropic","xai"].map(provider=><label key={provider}>{provider==="xai"?"xAI":provider==="openai"?"OpenAI":"Anthropic"} API key<input type="password" autoComplete="off" placeholder="Session-only key" value={keys[provider]||""} onChange={e=>setKeys({...keys,[provider]:e.target.value})}/></label>)}
          <p className="fine">Demo responses are simulated. Real requests use your provider balance. A $2 estimated budget, 10-turn limit and 20 requests per minute apply. Models with unavailable pricing are blocked.</p><button className="primary" onClick={()=>setModal(null)}>Done</button>
          {user&&<div className="account-row"><span>{user.email}</span><button onClick={logout}><SignOut size={16}/> Log out</button></div>}
        </>:modal==="privacy"?<><p>Chats, votes and accounts are stored in the local SQLite database on this computer. Passwords are salted and hashed. Session cookies are HTTP-only.</p><p>API keys are submitted only with model requests and are never stored with conversations. Your prompt and history are sent to the provider you choose.</p><p>Generated previews run in an isolated frame with network access blocked. This independent Selea app is inspired by Arena and is not affiliated with Arena AI.</p></>
        :<form onSubmit={account}>{modal==="register"&&<label>Name<input name="name" required maxLength={40} autoComplete="name"/></label>}<label>Email<input name="email" type="email" required autoComplete="email"/></label><label>Password<input name="password" type="password" minLength={8} maxLength={128} required autoComplete={modal==="register"?"new-password":"current-password"}/></label><p className="fine">Account access is local to this installation. Email verification and password recovery are not configured.</p><button disabled={busy} className="primary" type="submit">{busy?"Please wait…":modal==="register"?"Create account":"Log in"}</button><button className="auth-switch" type="button" onClick={()=>{setError("");setModal(modal==="register"?"login":"register")}}>{modal==="register"?"Already have an account? Log in":"New here? Create an account"}</button></form>}
      </div>}
    </dialog>
  </div>;
}


