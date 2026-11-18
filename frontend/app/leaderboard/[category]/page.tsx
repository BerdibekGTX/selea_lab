import { CatalogWorkspace } from "@/components/catalog-workspace"
import VideoLeaderboard from "@/app/video-leaderboard/page"
export default async function Page({params}:{params:Promise<{category:string}>}) {
 const {category}=await params
 return category==="text-to-video"||category==="image-to-video" ? <VideoLeaderboard initialCategory={category}/> : <CatalogWorkspace view="leaderboard"/>
}
