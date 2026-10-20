import { env } from '../../../lib/platform/runtime';
import { getCurrentUser } from '../../../lib/auth';
import { isAdminEmail } from '../../../lib/admin';
import { TEMPLE_REGISTRY_CHUNK, TEMPLE_REGISTRY_ROWS, TEMPLE_REGISTRY_SHA256, TEMPLE_REGISTRY_SOURCE, TEMPLE_REGISTRY_VERSION, getTempleRegistrySeed, templeAddressKey, templeNameKey } from '../../../lib/temple-registry';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const database=()=>{if(!env.DB)throw new Error('ยังไม่พร้อมใช้งานฐานข้อมูล');return env.DB;};
const now=()=>new Date().toISOString();
const audit=(owner:string,action:string,detail:unknown)=>database().prepare('INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,action,TEMPLE_REGISTRY_VERSION,JSON.stringify(detail),now());
async function authorized(){const user=await getCurrentUser();if(!user)throw Object.assign(new Error('กรุณาเข้าสู่ระบบ'),{status:401});if(!isAdminEmail(user.email))throw Object.assign(new Error('เฉพาะผู้ดูแลระบบเท่านั้น'),{status:403});return user;}
async function status(owner:string){
 const [meta,count,sects,summary]=await Promise.all([
  database().prepare('SELECT * FROM temple_registry_meta WHERE owner_id=? AND dataset_version=?').bind(owner,TEMPLE_REGISTRY_VERSION).first<Record<string,unknown>>(),
  database().prepare('SELECT COUNT(*) count FROM temple_registry WHERE owner_id=? AND dataset_version=?').bind(owner,TEMPLE_REGISTRY_VERSION).first<{count:number}>(),
  database().prepare('SELECT sect,COUNT(*) count FROM temple_registry WHERE owner_id=? AND dataset_version=? GROUP BY sect ORDER BY sect').bind(owner,TEMPLE_REGISTRY_VERSION).all<{sect:string;count:number}>(),
  database().prepare("SELECT COUNT(DISTINCT NULLIF(province_key,'')) provinces,SUM(CASE WHEN subdistrict_key='' OR district_key='' OR province_key='' THEN 1 ELSE 0 END) incomplete FROM temple_registry WHERE owner_id=? AND dataset_version=?").bind(owner,TEMPLE_REGISTRY_VERSION).first<{provinces:number;incomplete:number}>()
 ]);
 const loaded=Number(count?.count||0),ready=meta?.status==='ready'&&loaded>=TEMPLE_REGISTRY_ROWS;
 let duplicates={groups:0,extraRows:0};
 if(ready){const d=await database().prepare(`SELECT COUNT(*) groups,COALESCE(SUM(n-1),0) extra_rows FROM (SELECT COUNT(*) n FROM temple_registry WHERE owner_id=? AND dataset_version=? GROUP BY name_key,subdistrict_key,district_key,province_key HAVING COUNT(*)>1)`).bind(owner,TEMPLE_REGISTRY_VERSION).first<{groups:number;extra_rows:number}>();duplicates={groups:Number(d?.groups||0),extraRows:Number(d?.extra_rows||0)};}
 return {source:TEMPLE_REGISTRY_SOURCE,version:TEMPLE_REGISTRY_VERSION,sourceSha256:TEMPLE_REGISTRY_SHA256,expected:TEMPLE_REGISTRY_ROWS,loaded,ready,status:ready?'ready':loaded?'loading':'not-installed',startedAt:meta?.started_at||null,importedAt:ready?meta?.imported_at||null:null,provinces:ready?Number(summary?.provinces||0):0,incompleteAddresses:ready?Number(summary?.incomplete||0):0,duplicateGroups:duplicates.groups,duplicateExtraRows:duplicates.extraRows,sects:ready?sects.results.map(x=>({sect:x.sect,count:Number(x.count)})):[]};
}
export async function GET(){try{const user=await authorized();return json(await status(user.userId));}catch(e){const error=e as Error&{status?:number};return json({error:error.message||'เกิดข้อผิดพลาด'},error.status||400);}}
export async function POST(req:Request){try{
 const user=await authorized();const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'ไม่อนุญาตคำขอจากเว็บไซต์อื่น'},403);
 const body=await req.json() as {action?:string};if(body.action!=='seed')return json({error:'ไม่รองรับคำขอนี้'},400);
 const db=database(),owner=user.userId,rows=getTempleRegistrySeed();
 await db.prepare("INSERT OR IGNORE INTO temple_registry_meta(owner_id,dataset_version,source_filename,source_hash,rows_total,status,started_at,updated_at,imported_at) VALUES(?,?,?,?,?,'loading',?,?,NULL)").bind(owner,TEMPLE_REGISTRY_VERSION,TEMPLE_REGISTRY_SOURCE,TEMPLE_REGISTRY_SHA256,TEMPLE_REGISTRY_ROWS,now(),now()).run();
 const count=Number((await db.prepare('SELECT COUNT(*) count FROM temple_registry WHERE owner_id=? AND dataset_version=?').bind(owner,TEMPLE_REGISTRY_VERSION).first<{count:number}>())?.count||0);
 if(count>=TEMPLE_REGISTRY_ROWS){await db.prepare("UPDATE temple_registry_meta SET status='ready',imported_at=COALESCE(imported_at,?),updated_at=? WHERE owner_id=? AND dataset_version=?").bind(now(),now(),owner,TEMPLE_REGISTRY_VERSION).run();return json({loaded:TEMPLE_REGISTRY_ROWS,expected:TEMPLE_REGISTRY_ROWS,ready:true});}
 const maximum=await db.prepare('SELECT MAX(source_row) max_row FROM temple_registry WHERE owner_id=? AND dataset_version=?').bind(owner,TEMPLE_REGISTRY_VERSION).first<{max_row:number|null}>();
 const offset=Math.max(0,Number(maximum?.max_row||1)-1),part=rows.slice(offset,offset+TEMPLE_REGISTRY_CHUNK);
 if(!part.length)throw new Error('ไม่พบข้อมูลส่วนที่ยังนำเข้า');
 const encoded=JSON.stringify(part.map(([sourceOrder,name,templeType,sect,subdistrict,district,province])=>[sourceOrder,name,templeType,sect,subdistrict,district,province,templeNameKey(name),templeAddressKey(subdistrict,'subdistrict'),templeAddressKey(district,'district'),templeAddressKey(province,'province')]));
 await db.batch([db.prepare(`INSERT OR IGNORE INTO temple_registry(owner_id,dataset_version,source_row,source_order,name,temple_type,sect,subdistrict,district,province,name_key,subdistrict_key,district_key,province_key)
  SELECT ?,?,CAST(key AS INTEGER)+?,CAST(json_extract(value,'$[0]') AS INTEGER),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),json_extract(value,'$[4]'),json_extract(value,'$[5]'),json_extract(value,'$[6]'),json_extract(value,'$[7]'),json_extract(value,'$[8]'),json_extract(value,'$[9]'),json_extract(value,'$[10]') FROM json_each(?)`).bind(owner,TEMPLE_REGISTRY_VERSION,offset+2,encoded),db.prepare("UPDATE temple_registry_meta SET status='loading',updated_at=? WHERE owner_id=? AND dataset_version=?").bind(now(),owner,TEMPLE_REGISTRY_VERSION)]);
 const loaded=Number((await db.prepare('SELECT COUNT(*) count FROM temple_registry WHERE owner_id=? AND dataset_version=?').bind(owner,TEMPLE_REGISTRY_VERSION).first<{count:number}>())?.count||0),ready=loaded>=TEMPLE_REGISTRY_ROWS;
 if(ready)await db.batch([db.prepare("UPDATE temple_registry_meta SET status='ready',imported_at=COALESCE(imported_at,?),updated_at=? WHERE owner_id=? AND dataset_version=?").bind(now(),now(),owner,TEMPLE_REGISTRY_VERSION),audit(owner,'temple-registry-import',{source:TEMPLE_REGISTRY_SOURCE,version:TEMPLE_REGISTRY_VERSION,rows:loaded,sourceSha256:TEMPLE_REGISTRY_SHA256})]);
 return json({loaded,expected:TEMPLE_REGISTRY_ROWS,ready});
 }catch(e){const error=e as Error&{status?:number};console.error(e);return json({error:error.message||'เกิดข้อผิดพลาด'},error.status||400);}}
