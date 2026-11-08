export type WorkspaceUser = { id: string; name: string; email: string }
export type ModelChoice = { provider: string; id: string }
export type CatalogModel = ModelChoice & { name: string }

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "The request failed. Please try again.")
  return data as T
}

let sessionRequest: Promise<{ user: WorkspaceUser | null }> | null = null
export function ensureWorkspaceSession() {
  if (!sessionRequest) {
    sessionRequest = api<{ user: WorkspaceUser | null }>("/session").finally(() => { sessionRequest = null })
  }
  return sessionRequest
}
