"use client"

import Link from "next/link"
import { ensureWorkspaceSession } from "@/lib/workspace-api"
import { useEffect, useState, type FormEvent } from "react"
import { WorkspaceHeader } from "@/components/workspace-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StatCards } from "@/components/boardui/stat-cards"
import { EmptyState } from "@/components/workspace-controls"
import { Folder, Plus, Pencil, Archive, RotateCcw, BarChart3, MessagesSquare, Vote, Percent } from "lucide-react"

type Project = { id:string; name:string; description:string; updated:number; archived:boolean }
type Overview = {total_sessions:number;total_votes:number;rankings:{id:string;provider:string;votes:number;wins:number;ties:number}[];recent:{id:string;title:string;status:string;mode:string}[]}
const storageKey = "selea-projects-v1"

export function WorkspacePage({view}:{view:"analytics"|"projects"}) {
  return <SidebarProvider style={{"--sidebar-width":"16.5rem"} as React.CSSProperties}>
    <AppSidebar variant="inset"/>
    <SidebarInset>
      <WorkspaceHeader title={view==="analytics"?"Analytics":"Projects"}/>
      <main className="mx-auto w-full max-w-7xl space-y-8 p-5 md:p-8">{view==="analytics"?<Analytics/>:<Projects/>}</main>
    </SidebarInset>
  </SidebarProvider>
}

function Analytics() {
  const [data,setData]=useState<Overview|null>(null)
  const [error,setError]=useState("")
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    const controller=new AbortController()
    setError("");setData(null)
    const timeout=setTimeout(()=>controller.abort(),12000)
    let active=true
    async function load(){
      try {
        await ensureWorkspaceSession()
        const response=await fetch("/api/leaderboard/overview",{signal:controller.signal})
        if(!response.ok)throw new Error()
        const result:Overview=await response.json()
        if(active)setData(result)
      } catch {if(active)setError("Could not load your analytics. Check that the API is running and try again.")}
      finally {clearTimeout(timeout)}
    }
    load()
    return ()=>{active=false;controller.abort();clearTimeout(timeout)}
  },[retry])
  return <>
    <div><h2 className="text-3xl font-semibold tracking-tight">Workspace analytics</h2><p className="mt-2 text-sm text-muted-foreground">Your conversations, votes, and model performance.</p></div>
    {error?<Card role="alert"><CardContent className="flex flex-wrap items-center gap-4"><p className="text-sm">{error}</p><Button variant="outline" onClick={()=>setRetry(n=>n+1)}>Retry</Button></CardContent></Card>:!data?<p role="status" className="text-muted-foreground">Loading analytics…</p>:<>
      <StatCards stats={[
        { label: "Total sessions", value: data.total_sessions.toLocaleString(), caption: "Chats in this workspace", icon: <MessagesSquare/> },
        { label: "Votes cast", value: data.total_votes.toLocaleString(), caption: "Saved comparison votes", icon: <Vote/> },
        { label: "Ranked models", value: data.rankings.length.toLocaleString(), caption: "Models with votes", icon: <BarChart3/> },
        { label: "Voting participation", value: `${data.total_sessions ? Math.round(data.total_votes / data.total_sessions * 100) : 0}%`,
          caption: "Share of sessions with a vote", icon: <Percent/> },
      ]}/>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Model performance</CardTitle><CardDescription>Win rate from your votes. Ties count as half a win.</CardDescription></CardHeader><CardContent className="space-y-5">{data.rankings.length?data.rankings.map(model=>{const rate=model.votes?(model.wins+model.ties/2)/model.votes*100:0;return <div key={model.provider+model.id}><div className="mb-2 flex justify-between gap-3 text-sm"><span className="truncate">{model.id}</span><span>{rate.toFixed(1)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${rate}%`}}/></div></div>}):<div className="py-12 text-center text-muted-foreground"><BarChart3 className="mx-auto mb-3 size-8"/><p>No votes recorded yet.</p></div>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Recent activity</CardTitle><CardDescription>Your latest eight sessions.</CardDescription></CardHeader><CardContent>{data.recent.length?data.recent.map(session=><div key={session.id} className="flex justify-between gap-4 border-b py-3 text-sm last:border-0"><Link className="truncate hover:underline" href={`/chat/${session.id}`}>{session.title}</Link><span className="shrink-0 text-muted-foreground">{session.status}</span></div>):<p className="py-12 text-center text-muted-foreground">Your conversations will appear here.</p>}</CardContent></Card>
      </div>
    </>}
  </>
}

function Projects() {
  const [projects,setProjects]=useState<Project[]>([])
  const [ready,setReady]=useState(false)
  const [error,setError]=useState("")
  const [query,setQuery]=useState("")
  const [archived,setArchived]=useState(false)
  const [editing,setEditing]=useState<Project|null>(null)
  const [creating,setCreating]=useState(false)
  useEffect(()=>{
    try {
      const value=JSON.parse(localStorage.getItem(storageKey)||"[]")
      if(!Array.isArray(value)||!value.every(p=>typeof p.id==="string"&&typeof p.name==="string"&&typeof p.description==="string"&&typeof p.updated==="number"&&typeof p.archived==="boolean"))throw new Error()
      setProjects(value);setReady(true)
    } catch {setError("Saved projects could not be read. Browser storage may be unavailable.")}
  },[])
  function persist(next:Project[]) {
    try {localStorage.setItem(storageKey,JSON.stringify(next));setProjects(next);setError("");return true}
    catch {setError("Could not save changes. Check available browser storage.");return false}
  }
  function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const form=new FormData(event.currentTarget)
    const name=String(form.get("name")||"").trim()
    if(!name)return
    const project:Project={id:editing?.id??crypto.randomUUID(),name,description:String(form.get("description")||"").trim(),updated:Date.now(),archived:editing?.archived??false}
    if(persist(editing?projects.map(p=>p.id===editing.id?project:p):[project,...projects])){setEditing(null);setCreating(false)}
  }
  const shown=projects.filter(p=>p.archived===archived&&(p.name+" "+p.description).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.updated-a.updated)
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-3xl font-semibold tracking-tight">Projects</h2><Button asChild variant="outline"><Link href="/challenges">Video challenges</Link></Button><p className="mt-2 text-sm text-muted-foreground">Organize your ideas. Saved in this browser on this device.</p></div><Button disabled={!ready} onClick={()=>{setEditing(null);setCreating(true)}}><Plus/>New project</Button></div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {(creating||editing)&&<Card><CardHeader><CardTitle>{editing?"Edit project":"New project"}</CardTitle></CardHeader><CardContent><form key={editing?.id??"new"} onSubmit={save} className="space-y-4"><label className="block space-y-2 text-sm"><span>Project name</span><Input autoFocus name="name" required maxLength={100} defaultValue={editing?.name} placeholder="Name your project"/></label><label className="block space-y-2 text-sm"><span>Description</span><textarea name="description" maxLength={2000} defaultValue={editing?.description} className="min-h-24 w-full rounded-md border bg-transparent p-3 outline-none focus:ring-2 focus:ring-ring" placeholder="What are you working on?"/></label><div className="flex gap-2"><Button type="submit">Save project</Button><Button type="button" variant="outline" onClick={()=>{setEditing(null);setCreating(false)}}>Cancel</Button></div></form></CardContent></Card>}
    <div className="flex flex-wrap gap-3"><Input aria-label="Search projects" placeholder="Search projects…" value={query} onChange={e=>setQuery(e.target.value)} className="max-w-md"/><Button variant={archived?"outline":"secondary"} onClick={()=>setArchived(false)}>Active</Button><Button variant={archived?"secondary":"outline"} onClick={()=>setArchived(true)}>Archived</Button></div>
    {!ready&&!error?<p role="status">Loading projects…</p>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map(project=><Card key={project.id}><CardHeader><Folder className="mb-2 size-5 text-muted-foreground"/><CardTitle className="break-words">{project.name}</CardTitle><CardDescription className="whitespace-pre-wrap break-words">{project.description||"No description"}</CardDescription></CardHeader><CardContent><p className="mb-4 text-xs text-muted-foreground">Updated {new Date(project.updated).toLocaleDateString()}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>{setCreating(false);setEditing(project)}}><Pencil/>Edit</Button><Button variant="ghost" size="sm" onClick={()=>persist(projects.map(p=>p.id===project.id?{...p,archived:!p.archived,updated:Date.now()}:p))}>{project.archived?<RotateCcw/>:<Archive/>}{project.archived?"Restore":"Archive"}</Button></div></CardContent></Card>)}</div>}
    {ready && !error && !shown.length && !creating && !editing && (
      <EmptyState icon={<Folder/>}
        title={query.trim() ? "No matching projects" : archived ? "No archived projects" : "No projects yet"}
        description={query.trim() ? "Clear your search to see your projects." : archived ? "Archived projects can be restored here." : "Create a project to organize your ideas."}>
        {query.trim() ? <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button>
          : archived ? <Button variant="outline" onClick={() => setArchived(false)}>View active projects</Button>
          : <Button onClick={() => setCreating(true)}><Plus/>New project</Button>}
      </EmptyState>
    )}
  </>
}
