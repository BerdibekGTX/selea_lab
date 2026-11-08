"use client"
import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { WorkspaceHeader } from "@/components/workspace-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWorkspace } from "@/components/workspace-context"
import { api, ensureWorkspaceSession } from "@/lib/workspace-api"

export function WorkspaceUtilities({ view }: { view: "settings" | "help" | "search" | "account" }) {
  const title = { settings: "Settings", help: "Get Help", search: "Search chats", account: "Account" }[view]
  return <SidebarProvider style={{ "--sidebar-width": "16.5rem" } as React.CSSProperties}><AppSidebar variant="inset"/><SidebarInset>
    <WorkspaceHeader title={title}/>
    <main className="mx-auto w-full max-w-3xl space-y-6 p-5 md:py-12"><h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
      {view === "settings" ? <Settings/> : view === "help" ? <Help/> : view === "search" ? <Search/> : <Account/>}
    </main></SidebarInset></SidebarProvider>
}
function Settings() {
  const { configured, refresh, error } = useWorkspace()
  useEffect(() => { void refresh() }, [])
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const [failure, setFailure] = useState("")
  async function save(provider: string, disconnect = false) {
    setBusy(provider); setFailure(""); setMessage("")
    try { await ensureWorkspaceSession(); await api("/credentials", { provider, key: disconnect ? "" : keys[provider] }); setKeys(v => ({ ...v, [provider]: "" })); await refresh(); setMessage(disconnect ? "Key removed from this session." : "Key saved for this session. It will be verified when you send a message.") }
    catch(e) { setFailure(e instanceof Error ? e.message : "Could not save key.") } finally { setBusy("") }
  }
  return <><p className="text-sm text-muted-foreground">Connect a provider to use its models in New Chat. Demo models work without a key.</p>
    {(failure || error) && <div role="alert" className="flex items-center gap-3 text-sm text-red-300">{failure || error}{error && <Button variant="outline" onClick={() => void refresh()}>Retry connection</Button>}</div>}{message && <p role="status" className="text-sm">{message}</p>}
    {[['openai','OpenAI'],['anthropic','Anthropic'],['xai','xAI']].map(([id, name]) => <Card key={id}><CardHeader><CardTitle>{name}</CardTitle><CardDescription>{configured.includes(id) ? "Key available in this session" : "No session key saved"}</CardDescription></CardHeader><CardContent>
      <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); void save(id) }}><Input className="min-w-40 flex-1" type="password" autoComplete="off" aria-label={`${name} API key`} placeholder="Paste API key" maxLength={512} value={keys[id] || ""} onChange={e => setKeys(v => ({ ...v, [id]: e.target.value }))}/><Button disabled={!!busy || !keys[id]?.trim()}>{busy === id ? "Saving…" : "Save key"}</Button>{configured.includes(id) && <Button type="button" variant="outline" disabled={!!busy} onClick={() => save(id, true)}>Disconnect</Button>}</form>
    </CardContent></Card>)}
    <p className="text-xs leading-relaxed text-muted-foreground">Keys are held in backend memory for the current session, never saved with chats or in browser storage. Signing out, signing in again, session expiry, or restarting the API clears them. Requests have a $2 per-chat budget and a 10-turn limit. Provider billing applies to real models.</p>
    <Button asChild variant="outline"><Link href="/models">Choose a model</Link></Button>
  </>
}
function Search() {
  const [chats, setChats] = useState<{id:string; title:string; updated:number}[]>([])
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => { let active = true; setLoading(true); setError(""); ensureWorkspaceSession().then(() => api<typeof chats>("/chats")).then(data => { if(active) setChats(data) }).catch(() => { if(active) setError("Could not load your chats.") }).finally(() => { if(active) setLoading(false) }); return () => { active = false } }, [retry])
  const filtered = chats.filter(chat => chat.title.toLowerCase().includes(query.trim().toLowerCase()))
  return <><Input autoFocus aria-label="Search chat history" placeholder="Search by chat title…" value={query} onChange={e => setQuery(e.target.value)}/>{error ? <div role="alert">{error} <Button variant="outline" onClick={() => setRetry(v => v + 1)}>Retry</Button></div> : loading ? <p role="status">Loading chats…</p> : filtered.length ? <div className="divide-y rounded-xl border">{filtered.map(chat => <Link className="flex items-center justify-between gap-4 p-4 text-sm hover:bg-muted" href={`/chat/${chat.id}`} key={chat.id}><span className="truncate">{chat.title}</span><span className="shrink-0 text-xs text-muted-foreground">{new Date(chat.updated * 1000).toLocaleDateString()}</span></Link>)}</div> : <Card><CardContent className="space-y-4 py-8 text-center"><p className="text-muted-foreground">{query ? "No matching chats." : "You haven't started a chat yet."}</p><Button asChild><Link href="/new">New Chat</Link></Button></CardContent></Card>}</>
}
function Account() {
  const { user, refresh, logout } = useWorkspace()
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setError("")
    try { await ensureWorkspaceSession(); await api(`/auth/${register ? "register" : "login"}`, { name: data.get("name") || "", email: data.get("email"), password: data.get("password") }); await refresh() } catch(e) { setError(e instanceof Error ? e.message : "Sign in failed.") } finally { setBusy(false) }
  }
  return <Card><CardHeader><CardTitle>{user ? user.name : register ? "Create your local account" : "Welcome back"}</CardTitle><CardDescription>{user ? user.email : "Accounts and chats are stored on this Selea server."}</CardDescription></CardHeader><CardContent className="space-y-4">
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {user ? <><Button asChild><Link href="/new">New Chat</Link></Button><Button className="ml-3" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await logout() } catch { setError("Could not sign out.") } finally { setBusy(false) } }}>Log out</Button></> : <><form className="space-y-4" onSubmit={submit}>{register && <label className="block space-y-2 text-sm"><span>Name</span><Input name="name" required maxLength={40} autoComplete="name"/></label>}<label className="block space-y-2 text-sm"><span>Email</span><Input name="email" type="email" required maxLength={200} autoComplete="email"/></label><label className="block space-y-2 text-sm"><span>Password</span><Input name="password" type="password" required minLength={8} maxLength={128} autoComplete={register ? "new-password" : "current-password"}/></label><Button disabled={busy} type="submit">{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</Button></form><Button variant="ghost" onClick={() => { setRegister(!register); setError("") }}>{register ? "Already have an account? Sign in" : "Create an account"}</Button></>}
  </CardContent></Card>
}
function Help() {
  return <><p className="text-muted-foreground">A quick guide to your Selea workspace.</p>{[
    ["Start a chat", "Open New Chat, write a prompt, and select a model. Idea cards and prompt starters fill the message field. Send with the arrow or Ctrl / Cmd + Enter."],
    ["Compare and vote", "Choose Compare and two different models. After both responses arrive, vote for A, B, a tie, or neither. The vote updates your Leaderboard and Analytics. A voted chat is read-only."],
    ["Use real AI models", "Save a provider key in Settings, then choose its model in Models or the chat selector. Demo A and Demo B use simulated responses. Real requests use your provider account and may incur charges."],
    ["References and instructions", "Reference and the plus button attach text files (.txt, .md, .csv, .json), up to 30 KB. Instructions add tone or constraints. The complete request must fit within 12,000 characters. Images and video generation are not supported."],
    ["Find your work", "Recents and Search open saved chats. Projects stores project notes in this browser. Guest chats belong to your session; creating an account or signing in preserves those chats under your account."],
    ["Troubleshooting", "If a request fails, check Settings, the selected model, and your provider balance. The API must be running. A chat permits up to 10 turns and a $2 estimated budget. Start a new chat when it reaches a limit."],
  ].map(([title, text]) => <details key={title} className="rounded-xl border p-5"><summary className="cursor-pointer font-medium">{title}</summary><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{text}</p></details>)}<div className="flex gap-3"><Button asChild><Link href="/new">Try New Chat</Link></Button><Button asChild variant="outline"><Link href="/settings">Model settings</Link></Button></div></>
}
