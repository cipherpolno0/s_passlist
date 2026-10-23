import {Pool, types} from 'pg';
import {context} from './audit-store.mjs';
import {databaseConfig} from './database-config.mjs';
types.setTypeParser(20, Number);
let pool:Pool|undefined;
export function postgres(){
 return pool??=new Pool(databaseConfig(process.env.DATABASE_URL));
}
const numeric=new Set('year source_row source_order source_end_row sent absent retained passed failed other birth_year age_at_exam birth_year_estimated age_estimated vassa sect_reviewed lease_until row order birth age birthEstimated ageEstimated'.split(' '));
export function postgresSql(input:string){
 let sql=input.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi,'INSERT INTO');
 const ignore=/INSERT\s+OR\s+IGNORE\s+INTO/i.test(input);
 sql=sql.replace(/lower\(hex\(randomblob\(16\)\)\)/gi,"replace(gen_random_uuid()::text,'-','')")
  .replace(/json_extract\(([^(),]+),\s*'\$\.([^']+)'\)/g,(all,_v,field)=>numeric.has(field)?`(${all})::bigint`:all)
  .replace(/\bjson_array\(/gi,'jsonb_build_array(').replace(/\bjson_object\(/gi,'jsonb_build_object(');
 let out='',quote='',index=0;const stack:string[]=[];
 for(let i=0;i<sql.length;i++){
  const c=sql[i];
  if(quote){out+=c;if(c===quote){if(sql[i+1]===quote){out+=sql[++i];}else quote='';}continue;}
  if(c==="'"||c==='"'){quote=c;out+=c;continue;}
  if(c==='('){stack.push((out.match(/([a-z_]+)\s*$/i)?.[1]||'').toLowerCase());out+=c;continue;}
  if(c===')'){stack.pop();out+=c;continue;}
  if(c==='?'){out+=`$${++index}`+(stack.includes('jsonb_build_object')?'::text':'');continue;}
  out+=c;
 }
 if(ignore)out=out.replace(/;?\s*$/,' ON CONFLICT DO NOTHING');
 return out;
}
export class PgStatement {
 constructor(readonly sql:string,readonly args:unknown[]=[]){ }
 bind(...args:unknown[]){return new PgStatement(this.sql,args);}
 async all<T=Record<string,unknown>>(){return database.batch([this]).then(rows=>rows[0] as {results:T[];meta:{changes:number}});}
 async run(){return this.all();}
 async first<T=Record<string,unknown>>(column?:string){const row=(await this.all<T>()).results[0];return row?(column?(row as Record<string,unknown>)[column]:row):null;}
}
export const database={
 prepare(sql:string){return new PgStatement(sql);},
 async batch(statements:PgStatement[]){
  const client=await postgres().connect();
  try{await client.query('BEGIN');await client.query('SET LOCAL search_path = passlist, pg_catalog');await client.query("SET LOCAL statement_timeout = '120s'");
   const c=context.getStore();await client.query("SELECT set_config('passlist.audit_context',$1,true)",[JSON.stringify(c?{request_id:c.requestId,actor_id:c.actorId,actor_email:c.actorEmail,actor_role:c.actorRole,owner_id:c.ownerId,path:c.path,method:c.method,action:c.action,ip:c.ip,user_agent:c.userAgent}:{actor_role:'system',action:'background'})]);
   if(c?.access?.role==='viewer'&&statements.some(s=>/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s.sql)&&!/^\s*INSERT\s+INTO\s+(?:passlist\.)?audit_events\s*\(/i.test(s.sql)))throw new Error('บทบาทผู้ดูข้อมูลไม่สามารถเปลี่ยนข้อมูลได้');
   const results=[];for(const statement of statements){const r=await client.query(postgresSql(statement.sql),statement.args);results.push({results:r.rows,success:true,meta:{changes:r.rowCount||0}});}
   await client.query('COMMIT');return results;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
};
export const bucket={
 async get(key:string){const r=await database.prepare('SELECT content FROM source_files WHERE key=?').bind(key).all();if(!r.results.length)return null;const bytes=r.results[0].content as Buffer;return {body:new Uint8Array(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>bytes.toString('utf8'),json:async<T>()=>JSON.parse(bytes.toString('utf8')) as T};},
 async put(key:string,value:BodyInit,options?:{httpMetadata?:{contentType?:string}}){const bytes=Buffer.from(await new Response(value).arrayBuffer());await database.prepare('INSERT INTO source_files(key,content,content_type) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET content=excluded.content,content_type=excluded.content_type').bind(key,bytes,options?.httpMetadata?.contentType||'application/octet-stream').run();return {key};},
 async delete(keys:string|string[]){await database.prepare('DELETE FROM source_files WHERE key=ANY(?::text[])').bind(Array.isArray(keys)?keys:[keys]).run();}
};
