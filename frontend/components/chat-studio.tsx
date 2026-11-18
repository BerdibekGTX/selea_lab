"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useWorkspace } from "@/components/workspace-context"
import { api, ensureWorkspaceSession, type ModelChoice } from "@/lib/workspace-api"
import { Paperclip, Pencil, Globe, Code2, BookOpen, FlaskConical, LayoutGrid, Video, Sparkles, X, Copy, Check, RotateCcw, ArrowUpRight, LoaderCircle } from "lucide-react"
import { PromptInput } from "@/components/agents/prompt-input"
import { ChipGroup, SegmentedControl, SuccessCheck } from "@/components/workspace-controls"
import { WorkspaceHeader } from "@/components/workspace-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import "./chat-studio.css"

type Chat={id:string;title:string;mode:string;models:{id:string;provider:string}[];turns:{prompt:string;responses:{text:string;error:boolean;html?:string}[]}[];vote?:string}
const modelKey = (model: ModelChoice) => model.provider + "/" + model.id
const parseModel = (key: string): ModelChoice => ({provider: key.split("/")[0], id: key.slice(key.indexOf("/")+1)})
const request = api
const ideaCategories = ["All ideas", "Creative", "Code", "Writing", "Research"].map(label => ({ label, value: label }))
const starters = [
  { icon: Globe, label: "Website", prompt: "Help me design a website for " },
  { icon: Code2, label: "Code", prompt: "Help me write code for " },
  { icon: LayoutGrid, label: "Mood board", prompt: "Describe a visual mood board for " },
  { icon: BookOpen, label: "Writing", prompt: "Help me write a story about " },
  { icon: FlaskConical, label: "Research", prompt: "Explain and compare different approaches to " },
]
const ideas=[
 {title:"Create a world worth exploring",category:"Creative",image:"/scenarios/helios-7.png",prompt:"Write an opening scene for a science fiction story aboard a damaged space station."},
 {title:"Build your next landing page",category:"Code",image:"",art:"website",prompt:"Create HTML and CSS for a clean landing page for a creative studio."},
 {title:"See a problem differently",category:"Research",image:"/scenarios/trolley-echo.png",prompt:"Compare three perspectives on the trolley problem, with arguments for and against each."},
 {title:"Turn an idea into a plan",category:"Writing",image:"",art:"editorial",prompt:"Help me turn a new product idea into a practical launch plan. Ask me about the product first."},
 {title:"Explore the bigger picture",category:"Research",image:"/scenarios/last-reservoir.png",prompt:"Explain how a city can allocate scarce water fairly between residents, farms, and ecosystems."},
]
export function ChatStudio({chatId}:{chatId?:string}){
 const workspace = useWorkspace();
 const operation = useRef(0);
 const [secondModel,setSecondModel]=useState("demo/demo-b");
 const [retry,setRetry]=useState(0);
 const router=useRouter();const [chat,setChat]=useState<Chat|null>(null);const [prompt,setPrompt]=useState("");const [mode,setMode]=useState("direct");const [model,setModel]=useState("demo/demo-a");const [category,setCategory]=useState("All ideas");const [ready,setReady]=useState(false);const [busy,setBusy]=useState<"reply" | "vote" | null>(null);const [error,setError]=useState("");const [instructions,setInstructions]=useState("");const [showInstructions,setShowInstructions]=useState(false);const [attachment,setAttachment]=useState<{name:string;text:string}|null>(null);const [copied,setCopied]=useState("");const file=useRef<HTMLInputElement>(null);const input=useRef<HTMLTextAreaElement>(null);const end=useRef<HTMLDivElement>(null)
 useEffect(()=>{let active=true;setReady(false);setChat(null);setBusy(null);setCopied("");setError("");setPrompt("");ensureWorkspaceSession().then(async()=>{if(chatId){const result=await request<Chat>("/chats/"+chatId);if(active){setChat(result);setMode(result.mode);setModel(modelKey(result.models[0]));if(result.models[1])setSecondModel(modelKey(result.models[1]))}}if(active)setReady(true)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false;operation.current++}},[chatId,retry])
 useEffect(()=>{if(!chatId && workspace.pending){operation.current++;setBusy(null);setCategory("All ideas");setChat(null);setPrompt("");setError("");setInstructions("");setShowInstructions(false);setAttachment(null);setCopied("");setModel(modelKey(workspace.pending[0]));setSecondModel(modelKey(workspace.pending[1]??{provider:"demo",id:"demo-b"}));setMode(workspace.pending.length===2?"compare":"direct");workspace.consumePending()}},[chatId,workspace.pending])
 const selectedModels = chat?.models ?? (mode==="compare"?[parseModel(model),parseModel(secondModel)]:[parseModel(model)])
 const isDemo = selectedModels.every(m=>m.provider==="demo")
 const options = [...workspace.catalog]; for(const choice of selectedModels) if(!options.some(m=>modelKey(m)===modelKey(choice))) options.push({...choice,name:choice.id})
 const modelChoices = options.map(option => ({ value: modelKey(option), label: option.name }))
 const modeChoices = [{ value: "direct", label: "Ask" }, { value: "compare", label: "Compare" }]
 if (chat?.mode === "battle") modeChoices.push({ value: "battle", label: "Battle" })
 if (chat?.mode === "agent") modeChoices.push({ value: "agent", label: "Agent" })
 useEffect(()=>{if(chat)end.current?.scrollIntoView({behavior:"smooth",block:"end"})},[chat])
 function choose(value:string){setPrompt(value);input.current?.focus()}
 async function send(value: string) {
   const text = [
     value.trim(),
     instructions.trim() ? "Instructions: " + instructions.trim() : "",
     attachment ? "Reference (" + attachment.name + "):\n" + attachment.text : "",
   ].filter(Boolean).join("\n\n")
   await submitPrompt(text, true)
 }

 async function submitPrompt(text: string, clearDraft: boolean) {
   if (!ready || busy || chat?.vote || !text.trim()) return
   if (mode === "compare" && model === secondModel) {
     setError("Choose two different models to compare.")
     return
   }
   if (text.length > 12000) {
     setError("Message and references must be under 12,000 characters.")
     return
   }
   const currentOperation = ++operation.current
   setBusy("reply")
   setError("")
   try {
     const result = await request<Chat>("/chat", {
       chat_id: chat?.id, mode: chat?.mode ?? mode, prompt: text, models: selectedModels,
     })
     if (operation.current !== currentOperation) return
     setChat(result)
     if (clearDraft) {
       setPrompt("")
       setAttachment(null)
     }
     window.dispatchEvent(new Event("selea-chats-updated"))
     if (!chatId && !chat) router.replace("/chat/" + result.id)
   } catch (error) {
     if (operation.current === currentOperation) setError(error instanceof Error ? error.message : "Could not send message.")
   } finally {
     if (operation.current === currentOperation) setBusy(null)
   }
 }
 async function attachReference(event: ChangeEvent<HTMLInputElement>) {
   const selected = event.target.files?.[0]
   event.target.value = ""
   if (!selected) return
   if (!/\.(txt|md|csv|json)$/i.test(selected.name)) {
     setError("Choose a .txt, .md, .csv, or .json text file.")
     return
   }
   if (selected.size > 30000) {
     setError("Choose a text reference smaller than 30 KB.")
     return
   }
   try {
     setAttachment({ name: selected.name, text: await selected.text() })
     setError("")
   } catch {
     setError("Could not read this file.")
   }
 }
 async function vote(choice: string) {
   if (!chat || busy || chat.vote) return
   const currentOperation = ++operation.current
   setBusy("vote")
   setError("")
   try {
     const result = await request<Chat>("/chats/" + chat.id + "/vote", { choice })
     if (operation.current === currentOperation) setChat(result)
   } catch (error) {
     if (operation.current === currentOperation) setError(error instanceof Error ? error.message : "Could not save vote.")
   } finally {
     if (operation.current === currentOperation) setBusy(null)
   }
 }

 async function copyResponse(text: string, key: string) {
   try {
     await navigator.clipboard.writeText(text)
     setCopied(key)
   } catch {
     setError("Clipboard is unavailable.")
   }
 }

 return <SidebarProvider style={{"--sidebar-width":"16.5rem"} as React.CSSProperties}>
   <AppSidebar variant="inset"/>
   <SidebarInset><div className="chat-studio">
     <WorkspaceHeader title={chat?.title ?? "New Chat"}>
       <small className="workspace-header-meta">{isDemo ? "Demo workspace" : "Provider models"}</small>
     </WorkspaceHeader>
     <main className={"studio-main " + (chat ? "has-conversation" : "")}>
       {!chat ? <h1>What will you <span className="studio-emblem" aria-hidden="true"><Sparkles/></span> create today?</h1>
         : <section className="studio-conversation" aria-label="Conversation">
           {chat.turns.map((turn, index) => <div key={index}>
             <p className="studio-prompt">{turn.prompt}</p>
             <div className={"studio-answers " + (turn.responses.length > 1 ? "is-pair" : "")}>
               {turn.responses.map((answer, i) => {
                 const key = `${index}-${i}`
                 return <article key={i}>
                   <header>{chat.models[i]?.id ?? `Model ${i + 1}`}</header>
                   <p className={answer.error ? "studio-error" : ""}>{answer.text}</p>
                   <footer className="studio-message-actions">
                     {!answer.error && <button type="button" onClick={() => copyResponse(answer.text, key)}>
                       {copied === key ? <Check size={14}/> : <Copy size={14}/>}
                       {copied === key ? "Copied" : "Copy"}
                     </button>}
                     <button type="button" title={turn.responses.length > 1 ? "Resend to both models as a new turn" : "Resend as a new turn"}
                       disabled={Boolean(busy || chat.vote)} onClick={() => submitPrompt(turn.prompt, false)}>
                       <RotateCcw size={14}/>Retry
                     </button>
                   </footer>
                 </article>
               })}
             </div>
           </div>)}
           {(chat.mode === "compare" || chat.mode === "battle") && !chat.vote && chat.turns.length > 0
             && !chat.turns.at(-1)?.responses.some(response => response.error)
             && <div className="studio-votes">
               {[["a","A is better"],["b","B is better"],["tie","Tie"],["neither","Neither"]].map(([value, label]) => (
                 <button key={value} disabled={Boolean(busy)} onClick={() => vote(value)}>{label}</button>
               ))}
             </div>}
           {chat.vote && <div className="studio-note" role="status"><SuccessCheck>Vote saved.</SuccessCheck> Start a new chat to compare again.</div>}
           <div ref={end}/>
         </section>}
       {busy === "reply" && <p className="studio-thinking" role="status"><LoaderCircle aria-hidden="true" size={16} className="motion-safe:animate-spin"/>Waiting for response</p>}
 <input hidden ref={file} type="file" accept=".txt,.md,.csv,.json" onChange={attachReference} />
 <PromptInput
   maxLength={12000}
   inputRef={input}
   value={prompt}
   onValueChange={setPrompt}
   onSubmit={send}
   loading={busy === "reply"}
   disabled={Boolean(busy || chat?.vote)}
   submitDisabled={!ready}
   onVoiceError={setError}
   actions={[
     { label: "Reference", icon: <Paperclip />, onSelect: () => file.current?.click() },
     { label: "Instructions", icon: <Pencil />, onSelect: () => setShowInstructions(value => !value) },
   ]}
   modeControl={<SegmentedControl label="Chat mode" options={modeChoices} value={mode}
     onChange={setMode} disabled={Boolean(chat || busy)} />}
   choices={selectedModels.length > 1 ? [
     { label: "Model A", badge: "A", value: model, options: modelChoices, onChange: setModel, disabled: Boolean(chat) },
     { label: "Model B", badge: "B", value: secondModel, options: modelChoices, onChange: setSecondModel, disabled: Boolean(chat) },
   ] : [{ label: "Model", value: model, options: modelChoices, onChange: setModel, disabled: Boolean(chat) }]}
   aboveInput={(attachment || showInstructions) && <>
     {attachment && <button
       type="button"
       className="m-1 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
       aria-label={`Remove reference ${attachment.name}`}
       onClick={() => setAttachment(null)}
       disabled={Boolean(busy)}
     >
       <Paperclip size={13} className="shrink-0" />
       <span className="truncate">{attachment.name}</span>
       <X size={13} className="shrink-0" />
     </button>}
     {showInstructions && <textarea
       className="mb-2 block w-full resize-y rounded-lg border bg-background p-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground"
       aria-label="Instructions"
       placeholder="Tone, constraints, or context…"
       rows={2}
       maxLength={3000}
       value={instructions}
       onChange={event => setInstructions(event.target.value)}
       disabled={Boolean(busy || chat?.vote)}
     />}
   </>}
 />
 {!isDemo&&<p className="studio-note">Provider billing applies. <Link className="underline" href="/settings">Model settings</Link></p>}{error&&<div className="studio-error" role="alert">{error} {!ready&&<button className="underline" onClick={()=>setRetry(n=>n+1)}>Retry connection</button>}</div>}{!chat && <>
   <nav className="studio-tools" aria-label="Prompt starters">
     {starters.map(({icon: Icon, label, prompt}) => (
       <button type="button" key={label} onClick={() => choose(prompt)} disabled={Boolean(busy)}>
         <Icon size={16}/>{label}
       </button>
     ))}
     <Link className="studio-arena-link" href="/arena"><Video size={16}/>Compare videos<ArrowUpRight size={13}/></Link>
   </nav>
   <section className="studio-ideas">
     <div className="studio-idea-filters">
       <ChipGroup label="Idea categories" options={ideaCategories} value={category} onChange={setCategory}/>
     </div>
<div className={category === "All ideas" ? "studio-idea-grid" : "studio-idea-grid is-filtered"}>{ideas.filter(item=>category==="All ideas"||item.category===category).map(item=><button className={"studio-idea "+(item.art??"")} key={item.title} onClick={()=>choose(item.prompt)}>{item.image?<img src={item.image} alt=""/>:<span className="studio-card-art" aria-hidden="true">{item.art==="website"?<><i/><b>Make something<br/>remarkable.</b><i/></>:<><small>A NEW PERSPECTIVE</small><b>Ideas<br/>into<br/><em>action.</em></b></>}</span>}<span className="studio-idea-title">{item.title}</span></button>)}</div></section></>}
 </main></div></SidebarInset></SidebarProvider>
}
