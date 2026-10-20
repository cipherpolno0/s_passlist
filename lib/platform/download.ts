import 'server-only';
import {storageClient,storageBucket,bucket} from './storage';
export async function signedDownload(key:string,name:string) {
 const {data,error}=await storageClient().storage.from(storageBucket()).createSignedUrl(key,60,{download:name});
 if(error||!data)throw new Error('สร้างลิงก์ดาวน์โหลดไม่สำเร็จ');
 return new Response(null,{status:303,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
export async function downloadResponse(body:BodyInit,name:string,type:string) {
 const blob=await new Response(body).blob();
 // Leave headroom below the Vercel Function response body limit.
 if(blob.size>4*1024*1024){
  const key=`exports/${Date.now()}-${crypto.randomUUID()}`;
  await bucket.put(key,new Uint8Array(await blob.arrayBuffer()),{httpMetadata:{contentType:type}});
  return signedDownload(key,name);
 }
 return new Response(blob,{headers:{'Content-Type':type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
