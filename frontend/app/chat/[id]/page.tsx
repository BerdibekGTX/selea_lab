import { ChatStudio } from "@/components/chat-studio"
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ChatStudio chatId={id}/>}
