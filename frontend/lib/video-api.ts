export type Category = "text-to-video" | "image-to-video";
export const VIDEO_CATEGORIES = [
  { value: "text-to-video", label: "Text-to-Video" },
  { value: "image-to-video", label: "Image-to-Video" },
] as const;
export type VideoOutput = {id:string;video:string;thumbnail:string|null;duration:number;resolution:string;audio:boolean;model?:string;provider?:string;version?:string;platform?:string;settings?:Record<string,unknown>};
export type ArenaPair = {empty?:boolean;reason?:string;session_id:string;pair_id:string;challenge:{id:string;title:string;category:Category;prompt:string;criterion:string;source_image:string|null};a:VideoOutput;b:VideoOutput};
export type VideoChallenge = {id:string;title:string;category:Category;prompt:string;criterion:string;source_image:string|null;status:string;rounds:number|{id:string}[]};
function errorText(data:unknown,status:number){
 const detail=(data as {detail?:unknown}|null)?.detail
 if(typeof detail==="string")return detail
 if(Array.isArray(detail))return detail.map(item=>item.msg).join(". ")
 return `Request failed (${status})`
}
export async function videoApi<T>(path:string, body?:unknown, method="POST"):Promise<T>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000)
 try{
  const response=await fetch(`/api/video${path}`,body===undefined?{cache:"no-store",signal:controller.signal}:{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:controller.signal})
  const data=await response.json().catch(()=>null)
  if(!response.ok)throw new Error(errorText(data,response.status))
  return data as T
 }catch(e){if(controller.signal.aborted)throw new Error("The request timed out. Please retry.");throw e}finally{clearTimeout(timeout)}
}
export function uploadWithProgress<T>(path:string,data:FormData,onProgress:(percent:number)=>void):Promise<T>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open("POST",`/api/video${path}`);xhr.timeout=360000
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100))}
  xhr.onload=()=>{let payload;try{payload=JSON.parse(xhr.responseText)}catch{};if(xhr.status>=200&&xhr.status<300)resolve(payload as T);else reject(new Error(errorText(payload,xhr.status)))}
  xhr.onerror=()=>reject(new Error("Network error during upload. Your form has been kept; please retry."))
  xhr.ontimeout=()=>reject(new Error("Upload timed out. Please retry."));xhr.onabort=()=>reject(new Error("Upload cancelled."));xhr.send(data)
 })
}
