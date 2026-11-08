"use client"

import type { ReactNode } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function WorkspaceHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="workspace-header">
      <SidebarTrigger />
      <span className="workspace-header-title" title={title}>{title}</span>
      {children}
    </header>
  )
}
