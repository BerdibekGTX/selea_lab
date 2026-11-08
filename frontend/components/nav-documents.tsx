"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ensureWorkspaceSession } from "@/lib/workspace-api"
import { usePathname } from "next/navigation"
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar"

export function NavDocuments() {
  const pathname = usePathname()
  const [chats, setChats] = useState<{ id: string; title: string }[]>([])
  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        await ensureWorkspaceSession()
        const response = await fetch("/api/chats")
        if (!response.ok) return
        const data = await response.json()
        if (active && Array.isArray(data)) setChats(data.slice(0, 8))
      } catch { /* History is optional while the backend is offline. */ }
    }
    void refresh()
    window.addEventListener("selea-chats-updated", refresh)
    return () => { active = false; window.removeEventListener("selea-chats-updated", refresh) }
  }, [pathname])
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recents</SidebarGroupLabel>
      <SidebarMenu>
        {chats.map(chat => <SidebarMenuItem key={chat.id}>
          <SidebarMenuButton asChild isActive={pathname === `/chat/${chat.id}`}>
            <Link href={`/chat/${chat.id}`} title={chat.title}><span className="truncate">{chat.title}</span></Link>
          </SidebarMenuButton>
        </SidebarMenuItem>)}
      </SidebarMenu>
    </SidebarGroup>
  )
}
