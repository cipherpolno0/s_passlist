import 'server-only';
import {createClient} from '@supabase/supabase-js';
import type {ObjectBucket} from './types';
export function storageClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
  if(!url||!key)throw new Error('ยังไม่ได้ตั้งค่า Supabase Storage ฝั่งเซิร์ฟเวอร์');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export const uploadBucket=()=>process.env.SUPABASE_UPLOAD_BUCKET||'passlist-uploads';
export const storageBucket=()=>process.env.SUPABASE_STORAGE_BUCKET||'passlist-private';
export const bucket: ObjectBucket = {
  async get(key) {
    const {data,error}=await storageClient().storage.from(storageBucket()).download(key);
    if(error){if(String(error.statusCode)==='404'||error.message.toLowerCase().includes('not found'))return null;throw new Error('อ่านไฟล์จาก Supabase Storage ไม่สำเร็จ');}
    return {body:data.stream(),arrayBuffer:()=>data.arrayBuffer(),text:()=>data.text(),json:async<T>()=>JSON.parse(await data.text()) as T};
  },
  async put(key,value,options) {
    const {error}=await storageClient().storage.from(storageBucket()).upload(key,value,{
      upsert:true,contentType:options?.httpMetadata?.contentType|| (typeof value==='string'?'application/json':'application/octet-stream'),
    });
    if(error)throw new Error('บันทึกไฟล์ใน Supabase Storage ไม่สำเร็จ');
  },
  async delete(keys) {
    const {error}=await storageClient().storage.from(storageBucket()).remove(Array.isArray(keys)?keys:[keys]);
    if(error)throw new Error('ลบไฟล์จาก Supabase Storage ไม่สำเร็จ');
  },
};
