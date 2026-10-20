import {parseRetainedStatistics,STATISTICS_PARSER_VERSION,STATISTIC_METRICS} from './retained-statistics';
import type {ImportOptions} from './constants';

export async function backfillRetainedStatistics(db:D1Database,bucket:R2Bucket,options:{owner?:string;id?:string;background?:boolean}={}){
 const time=Date.now(),token=crypto.randomUUID(),conditions=["b.status IN ('committed','archived')","COALESCE(s.lease_until,0)<?","(s.batch_id IS NULL OR s.parser_version<>? OR s.status IN ('pending','running'))"],args:unknown[]=[time,STATISTICS_PARSER_VERSION];
 if(options.owner){conditions.push('b.owner_id=?');args.push(options.owner);}
 if(options.id){conditions.push('b.id=?');args.push(options.id);}
 // Avoid reading the same workbook concurrently with its older age/vassa upgrades.
 if(options.background)conditions.push("b.age_status NOT IN ('pending','running') AND b.vassa_status NOT IN ('pending','running')");
 const batch=await db.prepare(`SELECT b.* FROM batches b LEFT JOIN statistics_sources s ON s.batch_id=b.id WHERE ${conditions.join(' AND ')} ORDER BY b.created_at,b.id LIMIT 1`).bind(...args).first();
 if(!batch)return {processed:false};
 const id=String(batch.id),owner=String(batch.owner_id),stamp=new Date().toISOString();
 await db.prepare('INSERT OR IGNORE INTO statistics_sources(batch_id,owner_id,parser_version,updated_at) SELECT id,owner_id,?,? FROM batches WHERE id=? AND owner_id=?').bind(STATISTICS_PARSER_VERSION,stamp,id,owner).run();
 const claimed=await db.prepare("UPDATE statistics_sources SET status='running',lease_token=?,lease_until=?,parser_version=?,error='',updated_at=? WHERE batch_id=? AND owner_id=? AND lease_until<? AND (parser_version<>? OR status IN ('pending','running'))").bind(token,time+120000,STATISTICS_PARSER_VERSION,stamp,id,owner,time,STATISTICS_PARSER_VERSION).run();
 if(!claimed.meta.changes)return {processed:false};
 try{
  const source=await bucket.get('source/'+id);if(!source)throw new Error('ไม่พบไฟล์ผลสอบต้นฉบับที่เก็บไว้');
  let summary:{options?:ImportOptions}={};try{summary=JSON.parse(String(batch.summary));}catch{}
  const importOptions:ImportOptions={province:batch.province==='อ่านจากไฟล์'?'':String(batch.province),year:Number(batch.year),category:'',level:'',...summary.options,filename:String(batch.filename)};
  const parsed=parseRetainedStatistics(new Uint8Array(await source.arrayBuffer()),importOptions);
  const records=parsed.rows.map(r=>({id:crypto.randomUUID(),batch_id:id,owner_id:owner,year:r.year,region:r.region,province:r.province,category:r.category,level:r.level,sect:r.sect,temple:r.temple,...Object.fromEntries(STATISTIC_METRICS.map(m=>[m,r[m]])),note:r.note,source_file:String(batch.filename),source_sheet:r.sheet,source_row:r.sourceRow,source_end_row:r.sourceEndRow,updated_at:stamp}));
  const cols=['id','batch_id','owner_id','year','region','province','category','level','sect','temple',...STATISTIC_METRICS,'note','source_file','source_sheet','source_row','source_end_row','updated_at'];
  const valid="EXISTS(SELECT 1 FROM statistics_sources m JOIN batches b ON b.id=m.batch_id WHERE m.batch_id=? AND m.owner_id=? AND m.lease_token=? AND b.status IN ('committed','archived'))";
  const statements=[db.prepare(`DELETE FROM retained_exam_statistics WHERE batch_id=? AND owner_id=? AND ${valid}`).bind(id,owner,id,owner,token)];
  for(let offset=0;offset<records.length;offset+=200)statements.push(db.prepare(`INSERT INTO retained_exam_statistics(${cols.join(',')}) SELECT ${cols.map(c=>`json_extract(j.value,'$.${c}')`).join(',')} FROM json_each(?) j WHERE ${valid}`).bind(JSON.stringify(records.slice(offset,offset+200)),id,owner,token));
  statements.push(db.prepare("UPDATE statistics_sources SET status=?,row_count=?,issues=?,error='',lease_token='',lease_until=0,updated_at=? WHERE batch_id=? AND owner_id=? AND lease_token=?").bind(records.length?'done':'empty',records.length,JSON.stringify(parsed.issues),stamp,id,owner,token));
  statements.push(db.prepare("INSERT INTO audit(id,owner_id,action,target_id,detail,created_at) SELECT ?,?,'statistics-from-retained-excel',?,?,? WHERE EXISTS(SELECT 1 FROM batches WHERE id=? AND owner_id=?)").bind(crypto.randomUUID(),owner,id,JSON.stringify({parserVersion:STATISTICS_PARSER_VERSION,rows:records.length,issues:parsed.issues.length,filename:batch.filename}),stamp,id,owner));
  await db.batch(statements);
  return {processed:true,id,filename:String(batch.filename),rows:records.length,status:records.length?'done':'empty'};
 }catch(error){
  const message=error instanceof Error?error.message:'อ่านสถิติจากไฟล์เดิมไม่สำเร็จ';
  await db.prepare("UPDATE statistics_sources SET status='error',error=?,lease_token='',lease_until=0,updated_at=? WHERE batch_id=? AND owner_id=? AND lease_token=?").bind(message.slice(0,500),new Date().toISOString(),id,owner,token).run();
  return {processed:true,id,filename:String(batch.filename),status:'error',error:message};
 }
}

export async function statisticsSourceStatus(db:D1Database,owner:string){
 const statusCase="CASE WHEN s.parser_version=? THEN s.status ELSE 'pending' END";
 const counts=await db.prepare(`SELECT ${statusCase} status,COUNT(*) count FROM batches b LEFT JOIN statistics_sources s ON s.batch_id=b.id WHERE b.owner_id=? AND b.status IN ('committed','archived') GROUP BY 1`).bind(STATISTICS_PARSER_VERSION,owner).all();
 const states=Object.fromEntries(counts.results.map(r=>[String(r.status),Number(r.count)]));
 const sources=await db.prepare(`SELECT b.id,b.filename,b.status batch_status,${statusCase} status,COALESCE(s.row_count,0) row_count,s.issues,s.error,s.updated_at FROM batches b LEFT JOIN statistics_sources s ON s.batch_id=b.id WHERE b.owner_id=? AND b.status IN ('committed','archived') ORDER BY b.created_at DESC,b.id LIMIT 25`).bind(STATISTICS_PARSER_VERSION,owner).all();
 return {total:Object.values(states).reduce((a,b)=>a+b,0),pending:(states.pending||0)+(states.running||0),done:states.done||0,empty:states.empty||0,errors:states.error||0,sources:sources.results.map(r=>({...r,issues:JSON.parse(String(r.issues||'[]'))}))};
}

// Manual corrections take precedence for exactly the same scope. Identical retained summaries
// collapse to one row; conflicting summaries stay out of totals until explicitly corrected.
export function statisticsQuery(owner:string,filter:{sql:string;args:unknown[]}){
 const scope=['owner_id','year','region','province','category','level','sect','temple'];
 const same=(a:string,b:string)=>scope.map(c=>`${a}.${c}=${b}.${c}`).join(' AND ');
 const metrics=STATISTIC_METRICS.join(',');
 const sql=`WITH raw_auto AS (
 SELECT r.* FROM retained_exam_statistics r JOIN batches b ON b.id=r.batch_id JOIN statistics_sources m ON m.batch_id=b.id
 WHERE r.owner_id=? AND b.owner_id=r.owner_id AND b.status='committed' AND m.parser_version=? AND m.status='done'
 ), grouped_auto AS (
 SELECT ${scope.join(',')},${STATISTIC_METRICS.map(m=>`MAX(${m}) ${m}`).join(',')},GROUP_CONCAT(DISTINCT note) note,
 GROUP_CONCAT(DISTINCT source_file||' / '||source_sheet||' แถว '||source_row) source_file,COUNT(*) source_rows,
 COUNT(DISTINCT json_array(${metrics})) variants FROM raw_auto GROUP BY ${scope.join(',')}
 ), candidates AS (
 SELECT ${scope.join(',')},${metrics},note,source_file,1 source_rows,'manual' origin FROM exam_statistics WHERE owner_id=?
 UNION ALL SELECT ${scope.map(c=>'g.'+c).join(',')},${STATISTIC_METRICS.map(m=>'g.'+m).join(',')},g.note,g.source_file,g.source_rows,'retained' origin FROM grouped_auto g
 WHERE g.variants=1 AND NOT EXISTS(SELECT 1 FROM exam_statistics m WHERE ${same('m','g')})
 ), filtered AS (SELECT * FROM candidates s WHERE ${filter.sql}), effective AS (
 SELECT s.* FROM filtered s WHERE NOT EXISTS(SELECT 1 FROM filtered broad WHERE broad.owner_id=s.owner_id AND broad.year=s.year AND broad.region=s.region AND broad.province=s.province AND broad.category=s.category AND broad.level=s.level
 AND (broad.sect=s.sect OR broad.sect='') AND (broad.temple=s.temple OR broad.temple='') AND (broad.sect<>s.sect OR broad.temple<>s.temple))
 ), conflicts AS (SELECT g.* FROM grouped_auto g WHERE g.variants>1 AND NOT EXISTS(SELECT 1 FROM exam_statistics m WHERE ${same('m','g')}))`;
 return {sql,args:[owner,STATISTICS_PARSER_VERSION,owner,...filter.args]};
}
