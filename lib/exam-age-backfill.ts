import {parseExcel} from './excel';
import {activeRecord} from './record-state';
import type {ImportOptions} from './constants';

// Bounded, resumable upgrade of retained source workbooks. Never changes exam or identity fields.
export async function backfillExamAges(db:D1Database,bucket:R2Bucket){
 const now=Date.now(),token=crypto.randomUUID(),deadline=now+18_000;
 const batch=await db.prepare("SELECT * FROM batches WHERE status IN ('committed','archived') AND age_status IN ('pending','running') AND age_lease_until<? ORDER BY created_at,id LIMIT 1").bind(now).first();
 if(!batch)return;
 const claimed=await db.prepare("UPDATE batches SET age_status='running',age_lease_token=?,age_lease_until=? WHERE id=? AND age_status IN ('pending','running') AND age_lease_until<?").bind(token,now+120_000,batch.id,now).run();
 if(!claimed.meta.changes)return;
 try{
  const source=await bucket.get(`source/${batch.id}`);if(!source)throw new Error('ไม่พบไฟล์ Excel ต้นฉบับสำหรับคำนวณอายุ');
  let summary:{options?:ImportOptions}={};try{summary=JSON.parse(String(batch.summary));}catch{}
  const options:ImportOptions=summary.options||{province:batch.province==='อ่านจากไฟล์'?'':String(batch.province),year:Number(batch.year),category:'',level:''};
  const parsed=await parseExcel(new Uint8Array(await source.arrayBuffer()),options);
  let cursor=Number(batch.age_cursor)||0;
  while(cursor<parsed.records.length&&Date.now()<deadline){
   const rows=parsed.records.slice(cursor,cursor+300),patches=rows.filter(r=>r.birthYear!=null&&r.ageAtExam!=null).map(r=>({id:`${batch.id}_${r.id}`,sheet:r.sheet,row:r.row,birth:r.birthYear,age:r.ageAtExam,birthEstimated:r.birthYearEstimated?1:0,ageEstimated:r.ageEstimated?1:0}));
   const eligible=`r.batch_id=? AND r.owner_id=? AND r.id=json_extract(j.value,'$.id') AND r.sheet=json_extract(j.value,'$.sheet') AND r.source_row=json_extract(j.value,'$.row') AND r.birth_year IS NULL AND r.age_at_exam IS NULL AND ${activeRecord('r')} AND EXISTS(SELECT 1 FROM batches b WHERE b.id=r.batch_id AND b.age_lease_token=?)`;
   const args=[String(batch.id),String(batch.owner_id),token];
   const chunkToken=crypto.randomUUID();
   await db.batch([
    db.prepare(`INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) SELECT ?||'_'||r.id,r.owner_id,'age-autofill',r.id,json_object('source','retained-excel','sheet',r.sheet,'row',r.source_row,'examYear',r.year,'birthYear',json_extract(j.value,'$.birth'),'ageAtExam',json_extract(j.value,'$.age'),'birthYearEstimated',json_extract(j.value,'$.birthEstimated'),'ageEstimated',json_extract(j.value,'$.ageEstimated')),? FROM records r JOIN json_each(?) j WHERE ${eligible}`).bind(chunkToken,new Date().toISOString(),JSON.stringify(patches),...args),
    db.prepare(`UPDATE records AS r SET birth_year=json_extract(j.value,'$.birth'),age_at_exam=json_extract(j.value,'$.age'),birth_year_estimated=json_extract(j.value,'$.birthEstimated'),age_estimated=json_extract(j.value,'$.ageEstimated') FROM json_each(?) j WHERE ${eligible}`).bind(JSON.stringify(patches),...args),
    db.prepare("UPDATE batches SET age_cursor=?,age_updated=age_updated+(SELECT COUNT(*) FROM audit WHERE substr(id,1,36)=? AND action='age-autofill') WHERE id=? AND age_lease_token=?").bind(cursor+rows.length,chunkToken,batch.id,token),
   ]);
   cursor+=rows.length;
  }
  await db.prepare('UPDATE batches SET age_status=?,age_lease_until=0,age_lease_token=\'\',age_error=\'\' WHERE id=? AND age_lease_token=?').bind(cursor>=parsed.records.length?'done':'pending',batch.id,token).run();
 }catch(error){
  await db.prepare("UPDATE batches SET age_status='error',age_lease_until=0,age_lease_token='',age_error=? WHERE id=? AND age_lease_token=?").bind(error instanceof Error?error.message:'คำนวณอายุไม่สำเร็จ',batch.id,token).run();
 }
}
