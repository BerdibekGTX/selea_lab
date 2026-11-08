"use client"
import Link from "next/link"
import { useState } from "react"
import { IconDotsVertical, IconLogout, IconUserCircle, IconSettings } from "@tabler/icons-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { useWorkspace } from "@/components/workspace-context"
import { toast } from "sonner"

export function NavUser() {
  const { user, logout } = useWorkspace()
  const { isMobile, setOpenMobile } = useSidebar()
  const [busy, setBusy] = useState(false)
  return <SidebarMenu><SidebarMenuItem><DropdownMenu>
    <DropdownMenuTrigger asChild><SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{user?.name.slice(0, 2).toUpperCase() || "S"}</span>
      <span className="grid flex-1 text-left"><span className="truncate font-medium">{user?.name || "Guest"}</span><span className="truncate text-xs text-muted-foreground">{user?.email || "Local workspace"}</span></span><IconDotsVertical className="ml-auto size-4"/>
    </SidebarMenuButton></DropdownMenuTrigger>
    <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" className="min-w-48">
      <DropdownMenuItem asChild><Link href="/account" onClick={() => setOpenMobile(false)}><IconUserCircle/>{user ? "Account" : "Sign in / Register"}</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href="/settings" onClick={() => setOpenMobile(false)}><IconSettings/>Settings</Link></DropdownMenuItem>
      {user && <DropdownMenuItem disabled={busy} onSelect={async e => { e.preventDefault(); setBusy(true); try { await logout(); setOpenMobile(false) } catch { toast.error("Could not sign out. Try again.") } finally { setBusy(false) } }}><IconLogout/>{busy ? "Signing out…" : "Log out"}</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu></SidebarMenuItem></SidebarMenu>
}
