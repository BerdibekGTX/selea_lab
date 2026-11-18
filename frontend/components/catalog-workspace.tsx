"use client"

import { useEffect, useState } from "react"

import { usePathname, useRouter } from "next/navigation"

import { WorkspaceHeader } from "@/components/workspace-header"
import { AppSidebar } from "@/components/app-sidebar"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

import Leaderboard, { LeaderboardHeader } from "@/app/leaderboard"

import Models from "@/app/models"
import { VideoModelCatalog } from "@/components/video-model-catalog"
import Link from "next/link"

import { useWorkspace } from "@/components/workspace-context"
import { ensureWorkspaceSession } from "@/lib/workspace-api"



export function CatalogWorkspace({view}: {view:"models"|"leaderboard"}) {

  const workspace = useWorkspace()
  const [modelKind,setModelKind]=useState("text")
  const path=usePathname()

  const router=useRouter()

  const category=path.split("/")[2] || "overview"

  const [ready,setReady]=useState(false)

  const [error,setError]=useState(false)

  const [retry,setRetry]=useState(0)

  useEffect(()=>{

    const controller=new AbortController()

    setError(false)

    ensureWorkspaceSession().then(()=>{if(!controller.signal.aborted)setReady(true)}).catch(()=>{if(!controller.signal.aborted)setError(true)})

    return ()=>controller.abort()

  },[retry])

  return <SidebarProvider style={{"--sidebar-width":"16.5rem","--header-height":"3rem"} as React.CSSProperties}>

    <AppSidebar variant="inset"/>

    <SidebarInset>

      <div className="catalog-workspace">

        <WorkspaceHeader title={view==="leaderboard"?"Leaderboard":"Models"}>{view==="leaderboard"?<LeaderboardHeader category={category} onStart={()=>workspace.startChat([{provider:"demo",id:"demo-a"},{provider:"demo",id:"demo-b"}])}/>:<a className="workspace-header-meta" href="/leaderboard">Leaderboards</a>}</WorkspaceHeader>

        {error&&<div role="alert" className="catalog-api-error">The workspace API is unavailable. <button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}

        {view==="models"?<><div className="catalog-kind-switch" role="group" aria-label="Model type"><button aria-pressed={modelKind==="text"} onClick={()=>setModelKind("text")}>Text & code</button><button aria-pressed={modelKind==="video"} onClick={()=>setModelKind("video")}>Video</button></div>{modelKind==="video"?<VideoModelCatalog/>:<Models configured={workspace.catalog.filter(m=>workspace.configured.includes(m.provider))} ready={ready} onConfigure={()=>router.push("/settings")} onUse={models=>workspace.startChat(models)}/>}</>:<><div className="catalog-kind-switch"><span>Text comparisons</span><Link href="/leaderboard/text-to-video">Video rankings →</Link></div><Leaderboard category={category} ready={ready} onStart={()=>workspace.startChat([{provider:"demo",id:"demo-a"},{provider:"demo",id:"demo-b"}])}/></>}

      </div>

    </SidebarInset>

  </SidebarProvider>

}

