import type {Database, ObjectBucket} from './platform/types';

import { SECTS, type PassRecord, type RegistryCheck, type RegistrySummary } from './constants';
import { normalizeSect, fingerprint } from './scope';
import { TEMPLE_REGISTRY_ROWS, TEMPLE_REGISTRY_VERSION, templeAddressKey, templeNameKey } from './temple-registry';

type Lookup=[string,string,string,string];
type RegistryRow={idx:number;source_row:number;name:string;sect:string;subdistrict:string;district:string;province:string;subdistrict_key:string;district_key:string;province_key:string};
type RegistryCandidate={name:string;sect:string;subdistrict:string;district:string;province:string;subdistrict_key:string;district_key:string;province_key:string};
const uniqueSects=(values:string[])=>[...new Set(values.map(v=>v.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
const keyOfLocation=(r:RegistryCandidate)=>[r.subdistrict_key,r.district_key,r.province_key].join('|');

export async function checkTempleRecords(database:Database,owner:string,records:PassRecord[]):Promise<RegistrySummary>{
 const state=await database.prepare("SELECT status,rows_total FROM temple_registry_meta WHERE owner_id=? AND dataset_version=?").bind(owner,TEMPLE_REGISTRY_VERSION).first<{status:string;rows_total:number}>();
 const loaded=Number((await database.prepare('SELECT COUNT(*) count FROM temple_registry WHERE owner_id=? AND dataset_version=?').bind(owner,TEMPLE_REGISTRY_VERSION).first<{count:number}>())?.count||0);
 const ready=state?.status==='ready'&&loaded>=Number(state.rows_total||0);
 const summary:RegistrySummary={ready,total:loaded,expected:TEMPLE_REGISTRY_ROWS,checked:0,matched:0,sectConflict:0,otherSect:0,ambiguous:0,nameOnly:0,incomplete:0,locationMismatch:0,notFound:0,missingTemple:0,sectUnspecified:0,autoFilledRecords:0,autoFilledSubdistrict:0,autoFilledProvince:0,autoFilledSect:0};
 if(!ready)return summary;

 const inputs=new Map<string,{lookup:Lookup;records:PassRecord[]}>();
 for(const record of records){
  if(record.category==='ธรรมศึกษา'&&record.organizationMatch?.status==='matched'&&!/^วัด/.test(record.temple||record.school))continue;
  const name=templeNameKey(record.temple||(/^วัด/.test(record.school)?record.school:''));
  if(!name){record.registryMatch={status:'missing-name',nameCount:0,locationCount:0,sects:[]};summary.missingTemple++;continue;}
  summary.checked++;
  const lookup:Lookup=[name,templeAddressKey(record.subdistrict||'','subdistrict'),templeAddressKey(record.district||'','district'),templeAddressKey(record.sourceProvince||'','province')];
  const key=JSON.stringify(lookup),found=inputs.get(key);
  if(found)found.records.push(record);else inputs.set(key,{lookup,records:[record]});
 }

 const unique=[...inputs.values()];
 for(let offset=0;offset<unique.length;offset+=500){
  const part=unique.slice(offset,offset+500),encoded=JSON.stringify(part.map(x=>x.lookup));
  const result=await database.prepare(`
   WITH incoming AS (
    SELECT CAST(key AS INTEGER) idx,json_extract(value,'$[0]') name_key FROM json_each(?)
   )
   SELECT i.idx,r.source_row,r.name,r.sect,r.subdistrict,r.district,r.province,r.subdistrict_key,r.district_key,r.province_key
   FROM incoming i JOIN temple_registry r ON r.owner_id=? AND r.dataset_version=? AND r.name_key=i.name_key
   ORDER BY i.idx,r.source_order
  `).bind(encoded,owner,TEMPLE_REGISTRY_VERSION).all<RegistryRow>();
  const byIndex=new Map<number,RegistryCandidate[]>();
  for(const row of result.results){
   const rows=byIndex.get(Number(row.idx))||[];
   rows.push({name:String(row.name||''),sect:String(row.sect||''),subdistrict:String(row.subdistrict||''),district:String(row.district||''),province:String(row.province||''),subdistrict_key:String(row.subdistrict_key||''),district_key:String(row.district_key||''),province_key:String(row.province_key||'')});
   byIndex.set(Number(row.idx),rows);
  }

  for(let i=0;i<part.length;i++){
   const candidates=byIndex.get(i)||[],[name,sub,district,province]=part[i].lookup;
   const hasLocation=!!(sub||district||province);
   if(!candidates.length){for(const record of part[i].records){record.registryMatch={status:'not-found',nameCount:0,locationCount:0,sects:[]};record.warnings.push('ไม่พบชื่อวัดในทะเบียนอ้างอิง โปรดตรวจการสะกดและพื้นที่');summary.notFound++;}continue;}

   const exact=(r:RegistryCandidate)=>(!sub||r.subdistrict_key===sub)&&(!district||r.district_key===district)&&(!province||r.province_key===province);
   const compatible=(r:RegistryCandidate)=>(!sub||!r.subdistrict_key||r.subdistrict_key===sub)&&(!district||!r.district_key||r.district_key===district)&&(!province||!r.province_key||r.province_key===province);
   const matching=candidates.filter(exact),possible=candidates.filter(compatible),uncertain=possible.some(r=>!exact(r));
   const locationGroups=new Map<string,RegistryCandidate[]>();
   for(const row of matching){const key=keyOfLocation(row),group=locationGroups.get(key)||[];group.push(row);locationGroups.set(key,group);}
   const matchedSects=uniqueSects(matching.map(r=>normalizeSect(r.sect)||r.sect));
   const allSects=uniqueSects(candidates.map(r=>normalizeSect(r.sect)||r.sect));
   let status:RegistryCheck['status'];
   let reference:RegistryCandidate|undefined;
   let referenceSect='';

   if(!matching.length)status=possible.length?'incomplete':'location-mismatch';
   else if(uncertain)status='incomplete';
   else if(locationGroups.size>1||matchedSects.length>1)status=hasLocation?'ambiguous':'name-only-ambiguous';
   else{
    const group=[...locationGroups.values()][0]||[];reference=group[0];referenceSect=normalizeSect(reference?.sect||'');
    if(!reference?.subdistrict_key||!reference?.province_key)status='incomplete';
    else if(!SECTS.includes(referenceSect))status='other-sect';
    else if(group.some(r=>!normalizeSect(r.sect)))status='incomplete';
    else status='matched';
   }

   for(const record of part[i].records){
    const previousMatch=record.registryMatch;
    const autoFilled=new Set<'subdistrict'|'province'|'sect'>();
    let recordStatus:RegistryCheck['status']=status;
    const fileSectValue=String(record.sourceSect||record.sect||'').trim();
    const fileSect=normalizeSect(fileSectValue);
    const sectConflict=!!reference&&recordStatus==='matched'&&fileSectValue&&(!fileSect||fileSect!==referenceSect);
    if(recordStatus==='matched'&&reference){
     if(!record.subdistrict&&reference.subdistrict){record.subdistrict=reference.subdistrict;autoFilled.add('subdistrict');}
     if(!record.sourceProvince&&reference.province){record.sourceProvince=reference.province;autoFilled.add('province');}
     if(sectConflict){
      recordStatus='sect-conflict';
      record.warnings.push(`นิกายในไฟล์ ${fileSectValue} ไม่ตรงกับทะเบียนวัด ${referenceSect}`);
      summary.sectConflict++;
     }else{
      if(record.sect!==referenceSect){record.sect=referenceSect;autoFilled.add('sect');}
      record.sectReviewed=true;
      record.warnings=record.warnings.filter(w=>!w.includes('รอตรวจนิกาย')&&!w.includes('ไม่ระบุนิกาย: โปรดตรวจเพิ่มเติม'));
      summary.matched++;
     }
     record.fingerprint=fingerprint(record);
    }
    const carriedAuto=previousMatch?.status===recordStatus?previousMatch.autoFilled||[]:[];
    const effectiveAuto=new Set<'subdistrict'|'province'|'sect'>([...carriedAuto,...autoFilled]);
    record.registryMatch={status:recordStatus,nameCount:candidates.length,locationCount:matching.length,sects:recordStatus==='sect-conflict'?matchedSects:status==='matched'?matchedSects:allSects,...(effectiveAuto.size?{autoFilled:[...effectiveAuto]}:{})};
    if(effectiveAuto.has('subdistrict'))summary.autoFilledSubdistrict++;
    if(effectiveAuto.has('province'))summary.autoFilledProvince++;
    if(effectiveAuto.has('sect'))summary.autoFilledSect++;
    if(effectiveAuto.size)summary.autoFilledRecords++;

    if(recordStatus==='sect-conflict'){
     if(!sectConflict)record.warnings.push(`นิกายในไฟล์ ${fileSectValue||record.sect} ไม่ตรงกับทะเบียนวัด ${referenceSect}`);
     if(status!=='matched')summary.sectConflict++;
    }else if(recordStatus==='other-sect'){
     record.warnings.push(`ทะเบียนวัดระบุนิกาย ${matchedSects.join(' / ')||'ไม่ระบุ'} ซึ่งอยู่นอกตัวเลือกมหานิกาย/ธรรมยุต`);summary.otherSect++;
    }else if(recordStatus==='ambiguous'||recordStatus==='name-only-ambiguous'){
     record.warnings.push(`ทะเบียนวัดพบชื่อซ้ำหรือพื้นที่/นิกายกำกวม${allSects.length?`: ${allSects.join(' / ')}`:''} โปรดตรวจพื้นที่และยืนยัน`);summary.ambiguous++;
    }else if(recordStatus==='incomplete'){
     record.warnings.push('พบชื่อวัดและพื้นที่บางส่วนในทะเบียน แต่ข้อมูลตำบล/อำเภอ/จังหวัดหรือนิกายไม่ครบ');summary.incomplete++;
    }else if(recordStatus==='location-mismatch'){
     record.warnings.push('พบชื่อวัดในทะเบียน แต่ตำบล อำเภอ หรือจังหวัดไม่ตรงกับไฟล์');summary.locationMismatch++;
    }else if(recordStatus==='matched'&&!SECTS.includes(record.sect)){
     summary.sectUnspecified++;
    }
   }
  }
 }
 return summary;
}
