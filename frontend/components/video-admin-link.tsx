"use client"
import {useEffect,useState} from "react"
import Link from "next/link"
import {useWorkspace} from "@/components/workspace-context"
import {videoApi} from "@/lib/video-api"
import {Button} from "@/components/ui/button"
export function VideoAdminLink(){
 const {user}=useWorkspace();const [admin,setAdmin]=useState(false)
 useEffect(()=>{let active=true;setAdmin(false);if(user)videoApi<{admin:boolean}>("/session").then(s=>{if(active)setAdmin(s.admin)}).catch(()=>{});return()=>{active=false}},[user])
 return admin?<Button asChild variant="outline"><Link href="/admin">Manage video comparisons</Link></Button>:null
}
