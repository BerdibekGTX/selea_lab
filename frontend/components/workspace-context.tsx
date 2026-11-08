"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { api, ensureWorkspaceSession, type WorkspaceUser, type CatalogModel, type ModelChoice } from "@/lib/workspace-api"

type Workspace = {
  user: WorkspaceUser | null; ready: boolean; error: string; configured: string[]; catalog: CatalogModel[];
  pending: ModelChoice[] | null; startChat: (models?: ModelChoice[]) => void; consumePending: () => void;
  refresh: () => Promise<void>; logout: () => Promise<void>;
}
const Context = createContext<Workspace | null>(null)
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<WorkspaceUser | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [configured, setConfigured] = useState<string[]>([])
  const [catalog, setCatalog] = useState<CatalogModel[]>([{ provider: "demo", id: "demo-a", name: "Demo A" }, { provider: "demo", id: "demo-b", name: "Demo B" }])
  const [pending, setPending] = useState<ModelChoice[] | null>(null)
  async function refresh() {
    setError("")
    try {
      const session = await ensureWorkspaceSession()
      setUser(session.user); setReady(true)
      const credentials = await api<{ configured: string[] }>("/credentials")
      setConfigured(credentials.configured)
      window.dispatchEvent(new Event("selea-chats-updated"))
    } catch (e) { setError(e instanceof Error ? e.message : "Workspace unavailable.") }
  }
  useEffect(() => {
    void refresh()
    api<{ models: CatalogModel[] }>("/models").then(data => setCatalog(data.models)).catch(() => {})
  }, [])
  function startChat(models?: ModelChoice[]) {
    setPending(models ?? [{ provider: "demo", id: "demo-a" }])
    window.dispatchEvent(new Event("selea-new-chat"))
    router.push("/new")
  }
  async function logout() {
    await api("/logout", {})
    setUser(null); setConfigured([]); startChat(); await refresh()
  }
  return <Context.Provider value={{ user, ready, error, configured, catalog, pending, startChat, consumePending: () => setPending(null), refresh, logout }}>{children}</Context.Provider>
}
export function useWorkspace() {
  const value = useContext(Context)
  if (!value) throw new Error("WorkspaceProvider is required")
  return value
}
