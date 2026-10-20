import {getAdmin} from '../../../lib/admin';
import {storageClient,uploadBucket} from '../../../lib/platform/storage';
import {MAX_FILE} from '../../../lib/constants';
export const runtime='nodejs';
export async function POST(request:Request){
 const user=await getAdmin();if(!user)return Response.json({error:'เฉพาะผู้ดูแลระบบเท่านั้น'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},{status:403});
 try{
  const input=await request.json() as {filename?:string;size?:number};
  if(typeof input.filename!=='string'||!input.filename.toLowerCase().endsWith('.xlsx')||input.filename.length>250||!Number.isInteger(input.size)||Number(input.size)<1||Number(input.size)>MAX_FILE)throw new Error('เลือกไฟล์ .xlsx ขนาดไม่เกิน 10 MB');
  const path=`uploads/${user.userId}/${crypto.randomUUID()}.xlsx`,bucket=uploadBucket();
  const {data,error}=await storageClient().storage.from(bucket).createSignedUploadUrl(path,{upsert:false});
  if(error||!data)throw new Error('เตรียมพื้นที่อัปโหลดไม่สำเร็จ');
  return Response.json({path,token:data.token,bucket},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'อัปโหลดไม่สำเร็จ'},{status:400});}
}
