import type {D1Database} from '@cloudflare/workers-types';
import {ORGANIZATION_VERSION,ORGANIZATION_SOURCE,ORGANIZATION_SHA256,ORGANIZATION_ROWS,ORGANIZATION_MANIFEST,getOrganizationSeed,organizationNameKey} from './organization-registry';
import {templeAddressKey} from './temple-registry';
import {checkOrganizationRecords,organizationRecordFromDatabase} from './organization-registry-check';
import {activeRecord} from './record-state';
const now=()=>new Date().toISOString();

// A resumable server upgrade, using only the trusted, bundled reference dataset.
// A short lease prevents two requests from importing or backfilling the same slice.
export async function bootstrapOrganizationRegistry(db:D1Database,budgetMs=18000){
 const started=Date.now(),token=crypto.randomUUID();
 const state=await db.prepare('SELECT backfill_status FROM organization_registry_meta WHERE dataset_version=?').bind(ORGANIZATION_VERSION).first<{backfill_status:string}>();if(state?.backfill_status==='done')return;
 if(!state)await db.prepare(`INSERT OR IGNORE INTO organization_registry_meta(dataset_version,source_filename,source_hash,rows_total,started_at,updated_at) VALUES(?,?,?,?,?,?)`).bind(ORGANIZATION_VERSION,ORGANIZATION_SOURCE,ORGANIZATION_SHA256,ORGANIZATION_ROWS,now(),now()).run();
 const lease=await db.prepare('UPDATE organization_registry_meta SET lease_token=?,lease_until=? WHERE dataset_version=? AND lease_until<?').bind(token,Date.now()+60000,ORGANIZATION_VERSION,Date.now()).run();if(Number(lease.meta.changes)!==1)return;
 try{
  while(Date.now()-started<budgetMs){
   const meta=await db.prepare('SELECT status,seed_offset,cursor,backfill_status FROM organization_registry_meta WHERE dataset_version=? AND lease_token=?').bind(ORGANIZATION_VERSION,token).first<{status:string;seed_offset:number;cursor:string;backfill_status:string}>();if(!meta||meta.backfill_status==='done')return;
   if(meta.status!=='ready'){
    const offset=Number(meta.seed_offset);
    if(offset===ORGANIZATION_ROWS){const loaded=Number((await db.prepare('SELECT COUNT(*) count FROM organization_registry WHERE dataset_version=?').bind(ORGANIZATION_VERSION).first<{count:number}>())?.count||0);if(loaded!==ORGANIZATION_ROWS)throw new Error('จำนวนแถวทะเบียนองค์กรในฐานข้อมูลไม่ครบ');await db.prepare("UPDATE organization_registry_meta SET status='ready',backfill_status='running',imported_at=?,updated_at=? WHERE dataset_version=? AND lease_token=?").bind(now(),now(),ORGANIZATION_VERSION,token).run();continue;}
    const part=getOrganizationSeed().slice(offset,offset+1000);
    if(!part.length)throw new Error('ไม่พบช่วงข้อมูลทะเบียนองค์กรที่ยังนำเข้า');
    const rows=part.map(([order,name,subdistrict,district,province],index)=>({row:offset+index+2,order,name,subdistrict,district,province,nameKey:organizationNameKey(name),subdistrictKey:templeAddressKey(subdistrict,'subdistrict'),districtKey:templeAddressKey(district,'district'),provinceKey:templeAddressKey(province,'province')}));
    await db.batch([
     db.prepare(`INSERT OR IGNORE INTO organization_registry(dataset_version,source_row,source_order,name,subdistrict,district,province,name_key,subdistrict_key,district_key,province_key) SELECT ?,json_extract(value,'$.row'),json_extract(value,'$.order'),json_extract(value,'$.name'),json_extract(value,'$.subdistrict'),json_extract(value,'$.district'),json_extract(value,'$.province'),json_extract(value,'$.nameKey'),json_extract(value,'$.subdistrictKey'),json_extract(value,'$.districtKey'),json_extract(value,'$.provinceKey') FROM json_each(?)`).bind(ORGANIZATION_VERSION,JSON.stringify(rows)),
     db.prepare('UPDATE organization_registry_meta SET seed_offset=?,updated_at=? WHERE dataset_version=? AND lease_token=?').bind(offset+part.length,now(),ORGANIZATION_VERSION,token)
    ]);

    continue;
   }
   const data=await db.prepare(`SELECT r.* FROM records r JOIN batches b ON b.id=r.batch_id WHERE r.id>? AND b.status IN ('committed','archived','importing') AND ${activeRecord('r')} ORDER BY r.id LIMIT 300`).bind(meta.cursor).all<Record<string,unknown>>();
   if(!data.results.length){await db.prepare("UPDATE organization_registry_meta SET backfill_status='done',completed_at=?,updated_at=? WHERE dataset_version=? AND lease_token=?").bind(now(),now(),ORGANIZATION_VERSION,token).run();return;}
   const records=data.results.map(organizationRecordFromDatabase),summary=await checkOrganizationRecords(db,records);if(!summary.ready)throw new Error('ทะเบียนองค์กรยังไม่พร้อมตรวจเทียบ');
   const at=now(),patches=records.flatMap((record,i)=>{const old=data.results[i];if(record.organizationMatch?.status!=='matched'||!record.organizationMatch.autoFilled?.length)return[];return [{id:record.id,owner:String(old.owner_id),oldFingerprint:String(old.fingerprint),oldSubdistrict:String(old.subdistrict||''),oldDistrict:String(old.district||''),oldProvince:String(old.source_province||''),subdistrict:record.subdistrict||'',district:record.district,province:record.sourceProvince,fingerprint:record.fingerprint,auditId:crypto.randomUUID(),detail:JSON.stringify({reason:'เติมที่อยู่อัตโนมัติจากทะเบียนองค์กรและสถานศึกษา '+ORGANIZATION_SOURCE,version:ORGANIZATION_VERSION,sourceSha256:ORGANIZATION_SHA256,sourceRows:record.organizationMatch.sourceRows,before:{subdistrict:old.subdistrict,district:old.district,source_province:old.source_province},after:{subdistrict:record.subdistrict,district:record.district,source_province:record.sourceProvince}})}];});
   const encoded=JSON.stringify(patches);
   await db.batch([
    db.prepare(`UPDATE records AS r SET subdistrict=json_extract(j.value,'$.subdistrict'),district=json_extract(j.value,'$.district'),source_province=json_extract(j.value,'$.province'),fingerprint=json_extract(j.value,'$.fingerprint'),updated_at=? FROM json_each(?) j WHERE r.id=json_extract(j.value,'$.id') AND r.owner_id=json_extract(j.value,'$.owner') AND r.fingerprint=json_extract(j.value,'$.oldFingerprint') AND r.subdistrict=json_extract(j.value,'$.oldSubdistrict') AND r.district=json_extract(j.value,'$.oldDistrict') AND r.source_province=json_extract(j.value,'$.oldProvince') AND ${activeRecord('r')}`).bind(at,encoded),
    db.prepare(`INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) SELECT json_extract(j.value,'$.auditId'),r.owner_id,'organization-registry-autofill',r.id,json_extract(j.value,'$.detail'),? FROM json_each(?) j JOIN records r ON r.id=json_extract(j.value,'$.id') AND r.owner_id=json_extract(j.value,'$.owner') WHERE r.updated_at=? AND r.fingerprint=json_extract(j.value,'$.fingerprint') AND r.subdistrict=json_extract(j.value,'$.subdistrict') AND r.district=json_extract(j.value,'$.district') AND r.source_province=json_extract(j.value,'$.province')`).bind(at,encoded,at),
    db.prepare(`UPDATE organization_registry_meta SET updated=updated+(SELECT COUNT(*) FROM json_each(?) j JOIN audit a ON a.id=json_extract(j.value,'$.auditId')),cursor=?,scanned=scanned+?,matched=matched+?,ambiguous=ambiguous+?,conflicts=conflicts+?,not_found=not_found+?,incomplete=incomplete+?,updated_at=? WHERE dataset_version=? AND lease_token=?`).bind(encoded,String(data.results[data.results.length-1].id),records.length,summary.matched,summary.ambiguous,summary.locationMismatch,summary.notFound+summary.missingName,summary.incomplete,at,ORGANIZATION_VERSION,token)
   ]);
  }
 }finally{await db.prepare("UPDATE organization_registry_meta SET lease_token='',lease_until=0 WHERE dataset_version=? AND lease_token=?").bind(ORGANIZATION_VERSION,token).run();}
}
export async function organizationRegistryStatus(db:D1Database){
 const meta=await db.prepare('SELECT * FROM organization_registry_meta WHERE dataset_version=?').bind(ORGANIZATION_VERSION).first();
 const count=Number((await db.prepare('SELECT COUNT(*) count FROM organization_registry WHERE dataset_version=?').bind(ORGANIZATION_VERSION).first<{count:number}>())?.count||0);
 return {source:ORGANIZATION_SOURCE,sourceSha256:ORGANIZATION_SHA256,version:ORGANIZATION_VERSION,expected:ORGANIZATION_ROWS,loaded:count,ready:meta?.status==='ready'&&count===ORGANIZATION_ROWS,provinces:ORGANIZATION_MANIFEST.provinces,duplicateGroups:ORGANIZATION_MANIFEST.duplicateAddressGroups,duplicateExtraRows:ORGANIZATION_MANIFEST.duplicateExtraRows,incompleteAddresses:ORGANIZATION_MANIFEST.incompleteAddresses,backfillStatus:String(meta?.backfill_status||'pending'),scanned:Number(meta?.scanned||0),matched:Number(meta?.matched||0),updated:Number(meta?.updated||0),ambiguous:Number(meta?.ambiguous||0),conflicts:Number(meta?.conflicts||0),notFound:Number(meta?.not_found||0),incomplete:Number(meta?.incomplete||0),importedAt:meta?.imported_at||null,completedAt:meta?.completed_at||null};
}
