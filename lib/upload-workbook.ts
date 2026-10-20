'use client';
import {createClient} from './supabase/client';
export async function uploadWorkbook(endpoint:string,form:FormData) {
 const file=form.get('file');if(!(file instanceof File))throw new Error('กรุณาเลือกไฟล์');
 const ticket=await fetch('/api/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,size:file.size})});
 const result=await ticket.json() as {error?:string;path:string;token:string;bucket:string};
 if(!ticket.ok)throw new Error(result.error||'เตรียมอัปโหลดไม่สำเร็จ');
 const storage=createClient().storage.from(result.bucket);
 const {error}=await storage.uploadToSignedUrl(result.path,result.token,file,{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 if(error)throw new Error('อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่');
 const fields=Object.fromEntries([...form.entries()].filter(([key,value])=>key!=='file'&&typeof value==='string'));
 return fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'import-upload',upload:{path:result.path,filename:file.name,fields}})});
}
