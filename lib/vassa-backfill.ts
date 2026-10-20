import {parseExcel} from './excel';
import {activeRecord} from './record-state';
import type {ImportOptions} from './constants';

// Read retained workbooks, filling only missing vassa values by original sheet/row identity.
export async function backfillVassa(db:D1Database,bucket:R2Bucket){
 const now=Date.now(),token=crypto.randomUUID(),deadline=now+18_000;
 const batch=await db.prepare("SELECT * FROM batches WHERE status IN ('committed','archived') AND vassa_status IN ('pending','running') AND vassa_lease_until<? ORDER BY created_at,id LIMIT 1").bind(now).first();if(!batch)return;
 const claimed=await db.prepare("UPDATE batches SET vassa_status='running',vassa_lease_token=?,vassa_lease_until=? WHERE id=? AND vassa_status IN ('pending','running') AND vassa_lease_until<?").bind(token,now+120_000,batch.id,now).run();if(!claimed.meta.changes)return;
 try{
  const source=await bucket.get(`source/${batch.id}`);if(!source)throw new Error('ไม่พบไฟล์ Excel ต้นฉบับสำหรับอ่านพรรษา');
  let summary:{options?:ImportOptions}={};try{summary=JSON.parse(String(batch.summary));}catch{}
  const options:ImportOptions=summary.options||{province:batch.province==='อ่านจากไฟล์'?'':String(batch.province),year:Number(batch.year),category:'',level:''};
  const parsed=await parseExcel(new Uint8Array(await source.arrayBuffer()),options);let cursor=Number(batch.vassa_cursor)||0;
  while(cursor<parsed.records.length&&Date.now()<deadline){
   const rows=parsed.records.slice(cursor,cursor+300),patches=rows.filter(r=>r.vassa!=null).map(r=>({id:`${batch.id}_${r.id}`,sheet:r.sheet,row:r.row,vassa:r.vassa})),chunkToken=crypto.randomUUID(),payload=JSON.stringify(patches);
   const eligible=`r.batch_id=? AND r.owner_id=? AND r.id=json_extract(j.value,'$.id') AND r.sheet=json_extract(j.value,'$.sheet') AND r.source_row=json_extract(j.value,'$.row') AND r.vassa IS NULL AND r.category='นักธรรม' AND r.title NOT LIKE '%สามเณร%' AND r.title NOT LIKE 'เณร%' AND ${activeRecord('r')} AND EXISTS(SELECT 1 FROM batches b WHERE b.id=r.batch_id AND b.vassa_lease_token=?)`;
   const args=[String(batch.id),String(batch.owner_id),token];
   const statements=patches.length?[
    db.prepare(`INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) SELECT ?||'_'||r.id,r.owner_id,'vassa-autofill',r.id,json_object('source','retained-excel','sheet',r.sheet,'row',r.source_row,'examYear',r.year,'vassa',json_extract(j.value,'$.vassa')),? FROM json_each(?) j CROSS JOIN records r WHERE ${eligible}`).bind(chunkToken,new Date().toISOString(),payload,...args),
    db.prepare(`UPDATE records AS r SET vassa=json_extract(j.value,'$.vassa') FROM json_each(?) j WHERE ${eligible} AND r.id IN (SELECT json_extract(value,'$.id') FROM json_each(?))`).bind(payload,...args,payload),
   ]:[];
   statements.push(db.prepare("UPDATE batches SET vassa_cursor=?,vassa_updated=vassa_updated+(SELECT COUNT(*) FROM audit WHERE substr(id,1,36)=? AND action='vassa-autofill') WHERE id=? AND vassa_lease_token=?").bind(cursor+rows.length,chunkToken,batch.id,token));
   await db.batch(statements);cursor+=rows.length;
  }
  await db.prepare("UPDATE batches SET vassa_status=?,vassa_lease_until=0,vassa_lease_token='',vassa_error='' WHERE id=? AND vassa_lease_token=?").bind(cursor>=parsed.records.length?'done':'pending',batch.id,token).run();
 }catch(error){await db.prepare("UPDATE batches SET vassa_status='error',vassa_lease_until=0,vassa_lease_token='',vassa_error=? WHERE id=? AND vassa_lease_token=?").bind(error instanceof Error?error.message:'อ่านพรรษาไม่สำเร็จ',batch.id,token).run();}
}
