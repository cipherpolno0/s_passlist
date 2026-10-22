// Run only when APPENDING a new schema migration; applied migrations are immutable.
import fs from 'node:fs';
const migration=process.argv[2];if(!migration||!/^drizzle\/\d+_[\w]+\.sql$/.test(migration))throw new Error('Pass a newly generated migration');
const snapshot=JSON.parse(fs.readFileSync(migration.replace('.sql','').replace(/(\d+)_.*$/,'meta/$1_snapshot.json'),'utf8'));
const q=s=>'"'+s.replaceAll('"','""')+'"';
const result=[];
for(const table of Object.values(snapshot.tables)){
 if(['audit_context','audit_events'].includes(table.name))continue;
 const columns=Object.keys(table.columns);
 const row=prefix=>`json_object(${columns.flatMap(c=>["'"+c+"'",prefix+'.'+q(c)]).join(',')})`;
 for(const op of ['INSERT','UPDATE','DELETE']){
  const ref=op==='DELETE'?'OLD':'NEW';
  const keys=table.name==='audit'?['target_id']:columns.includes('id')?['id']:columns.includes('email')?['email']:columns.filter(c=>table.columns[c].primaryKey);
  if(!keys.length)keys.push(...['batch_id','owner_id','dataset_version','source_row','version'].filter(c=>columns.includes(c)));
  const target=keys.map(c=>`COALESCE(CAST(${ref}.${q(c)} AS TEXT),'')`).join("||':'||")||"''";
  const field=name=>`COALESCE((SELECT ${name} FROM audit_context WHERE id=1),'')`;
  const owner=columns.includes('owner_id')?`${ref}.owner_id` :field('owner_id');
  const before=op==='INSERT'?'NULL':row('OLD'),after=op==='DELETE'?'NULL':row('NEW');
  result.push(`CREATE TRIGGER ${q('evidence_'+table.name+'_'+op.toLowerCase())} AFTER ${op} ON ${q(table.name)}${op==='UPDATE'?` WHEN ${before} IS NOT ${after}`:''} BEGIN
 INSERT INTO audit_events(kind,table_name,target_id,operation,owner_id,request_id,actor_id,actor_email,actor_role,path,method,action,ip,user_agent,status,before_json,after_json,created_at)
 VALUES('change','${table.name}',${target},'${op}',${owner},${field('request_id')},${field('actor_id')},${field('actor_email')},COALESCE((SELECT actor_role FROM audit_context WHERE id=1),'database'),${field('path')},${field('method')},${field('action')},${field('ip')},${field('user_agent')},NULL,${before},${after},strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;`);
 }
}
for(const op of ['UPDATE','DELETE'])result.push(`CREATE TRIGGER evidence_no_${op.toLowerCase()} BEFORE ${op} ON audit_events BEGIN SELECT RAISE(ABORT,'Audit evidence is append-only'); END;`);
result.push(`CREATE TRIGGER evidence_no_replace BEFORE INSERT ON audit_events WHEN EXISTS(SELECT 1 FROM audit_events WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Audit evidence is append-only'); END;`);
fs.appendFileSync(migration,'\n--> statement-breakpoint\n'+result.join('\n--> statement-breakpoint\n')+'\n');
