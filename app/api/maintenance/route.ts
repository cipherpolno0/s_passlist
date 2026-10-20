import {getAdmin} from '../../../lib/admin';
import {env} from '../../../lib/platform/runtime';
import {backfillExamAges} from '../../../lib/exam-age-backfill';
import {backfillVassa} from '../../../lib/vassa-backfill';
import {backfillProvinceRegions} from '../../../lib/province-region-backfill';
import {backfillRetainedStatistics} from '../../../lib/statistics-source-service';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 if(!await getAdmin())return Response.json({error:'เฉพาะผู้ดูแลระบบเท่านั้น'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Forbidden',{status:403});
 const body=await request.json() as {step?:string};
 try{
  switch(body.step){
   case 'age':await backfillExamAges(env.DB,env.BUCKET);break;
   case 'vassa':await backfillVassa(env.DB,env.BUCKET);break;
   case 'region':await backfillProvinceRegions(env.DB);break;
   case 'statistics':await backfillRetainedStatistics(env.DB,env.BUCKET,{background:true});break;
   default:return Response.json({error:'ไม่รองรับคำขอนี้'},{status:400});
  }
  return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'ปรับข้อมูลเดิมไม่สำเร็จ กรุณาลองใหม่'},{status:400});}
}
