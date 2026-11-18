"use client"
import type { ReactNode } from "react"
import Link from "next/link"
import { AppSidebar } from "@/components/app-sidebar"
import { WorkspaceHeader } from "@/components/workspace-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import "@/app/video-arena.css"

export function VideoShell({title,children}: {title:string;children:ReactNode}) {
  return <SidebarProvider style={{"--sidebar-width":"16.5rem"} as React.CSSProperties}>
    <AppSidebar variant="inset"/>
    <SidebarInset><div className="video-workspace">
      <WorkspaceHeader title={title}><nav className="video-header-links" aria-label="Video workspace"><Link href="/arena">Compare</Link><Link href="/leaderboard/text-to-video">Rankings</Link><Link href="/challenges">Challenges</Link></nav></WorkspaceHeader>
      <main className="video-main">{children}</main>
    </div></SidebarInset>
  </SidebarProvider>
}
