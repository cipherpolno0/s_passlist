import type {Database, ObjectBucket} from './platform/types';
import {PROVINCE_REGION,PROVINCE_REGION_VERSION,regionForProvince} from './province-regions';
import {fingerprint} from './scope';
import {activeRecord} from './record-state';
export async function backfillProvinceRegions(db:Database){
 const version=PROVINCE_REGION_VERSION,token=crypto.randomUUID(),now=Date.now(),deadline=now+18_000;
 const meta=await db.prepare('SELECT status FROM province_region_meta WHERE version=?').bind(version).first();if(meta?.status==='done')return;
 await db.prepare('INSERT OR IGNORE INTO province_region_meta(version,updated_at) VALUES(?,?)').bind(version,new Date().toISOString()).run();
 const claim=await db.prepare("UPDATE province_region_meta SET status='running',lease_token=?,lease_until=? WHERE version=? AND status<>'done' AND lease_until<?").bind(token,now+120000,version,now).run();if(!claim.meta.changes)return;
 try{
  while(Date.now()<deadline){
   const data=await db.prepare(`SELECT r.* FROM records r JOIN batches b ON b.id=r.batch_id WHERE b.status IN ('committed','archived') AND COALESCE(TRIM(r.region),'')='' AND r.jurisdiction<>'ส่วนกลาง' AND r.province IN(SELECT key FROM json_each(?)) AND ${activeRecord('r')} ORDER BY r.id LIMIT 300`).bind(JSON.stringify(PROVINCE_REGION)).all();
   if(!data.results.length){await db.prepare("UPDATE province_region_meta SET status='done',lease_token='',lease_until=0,updated_at=? WHERE version=? AND lease_token=?").bind(new Date().toISOString(),version,token).run();return;}
   const patches=data.results.map(r=>{const region=regionForProvince(String(r.province));return {id:r.id,oldRegion:r.region,oldFingerprint:r.fingerprint,region,fingerprint:fingerprint({year:Number(r.year),province:String(r.province),category:String(r.category),level:String(r.level),title:String(r.title),firstName:String(r.first_name),lastName:String(r.last_name),dharmaName:String(r.dharma_name),temple:String(r.temple),district:String(r.district),school:String(r.school),sect:String(r.sect),subdistrict:String(r.subdistrict||''),region})};});
   const payload=JSON.stringify(patches),chunk=crypto.randomUUID(),eligible=`r.id=json_extract(j.value,'$.id') AND r.region=json_extract(j.value,'$.oldRegion') AND r.fingerprint=json_extract(j.value,'$.oldFingerprint') AND r.jurisdiction<>'ส่วนกลาง' AND ${activeRecord('r')} AND EXISTS(SELECT 1 FROM province_region_meta m WHERE m.version=? AND m.lease_token=?)`;
   await db.batch([
    db.prepare(`INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) SELECT ?||'_'||r.id,r.owner_id,'province-region-autofill',r.id,json_object('source',?,'province',r.province,'beforeRegion',r.region,'afterRegion',json_extract(j.value,'$.region'),'beforeFingerprint',r.fingerprint,'afterFingerprint',json_extract(j.value,'$.fingerprint')),? FROM json_each(?) j CROSS JOIN records r WHERE ${eligible}`).bind(chunk,version,new Date().toISOString(),payload,version,token),
    db.prepare(`UPDATE records AS r SET region=json_extract(j.value,'$.region'),fingerprint=json_extract(j.value,'$.fingerprint') FROM json_each(?) j WHERE ${eligible} AND r.id IN(SELECT json_extract(value,'$.id') FROM json_each(?))`).bind(payload,version,token,payload),
    db.prepare("UPDATE province_region_meta SET filled=filled+(SELECT COUNT(*) FROM audit WHERE substr(id,1,36)=? AND action='province-region-autofill'),updated_at=? WHERE version=? AND lease_token=?").bind(chunk,new Date().toISOString(),version,token),
   ]);
  }
 }finally{await db.prepare("UPDATE province_region_meta SET status=CASE WHEN status='done' THEN status ELSE 'pending' END,lease_token='',lease_until=0,updated_at=? WHERE version=? AND lease_token=?").bind(new Date().toISOString(),version,token).run();}
}
