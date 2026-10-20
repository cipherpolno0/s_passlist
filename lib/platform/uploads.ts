import 'server-only';
import {storageClient,uploadBucket} from './storage';
import {MAX_FILE} from '../constants';
export type StagedUpload = {path?:unknown;filename?:unknown;fields?:unknown};
export function ownedUploadPath(path: unknown, owner: string): path is string {
 return typeof path==='string'&&path.startsWith(`uploads/${owner}/`)&&/^uploads\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.xlsx$/.test(path);
}
export async function uploadedForm(upload:StagedUpload,owner:string,maximum=MAX_FILE) {
 if(!ownedUploadPath(upload.path,owner)||typeof upload.filename!=='string'||!upload.filename.toLowerCase().endsWith('.xlsx')||upload.filename.length>250)throw new Error('ไฟล์อัปโหลดไม่ถูกต้อง');
 const storage=storageClient().storage.from(uploadBucket());
 const {data,error}=await storage.download(upload.path);
 if(error||!data)throw new Error('ไม่พบไฟล์อัปโหลด กรุณาอัปโหลดใหม่');
 if(!data.size||data.size>maximum)throw new Error('ขนาดไฟล์เกินที่ระบบรองรับ');
 const form=new FormData();
 if(upload.fields&&typeof upload.fields==='object')for(const [key,value] of Object.entries(upload.fields))if(typeof value==='string'&&value.length<=1000&&key!=='file')form.set(key,value);
 form.set('file',new File([data],upload.filename,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const {error:removeError}=await storage.remove([upload.path]);
 if(removeError)throw new Error('เตรียมไฟล์ไม่สำเร็จ กรุณาลองใหม่');
 return form;
}
