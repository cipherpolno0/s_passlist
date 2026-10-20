import type {Database, ObjectBucket} from './platform/types';

import type {PassRecord,OrganizationMatch,OrganizationSummary} from './constants';
import {ORGANIZATION_VERSION,ORGANIZATION_ROWS,organizationNameKey} from './organization-registry';
import {templeAddressKey} from './temple-registry';
import {fingerprint} from './scope';
type Candidate={source_row:number;subdistrict:string;district:string;province:string;subdistrict_key:string;district_key:string;province_key:string};
export async function checkOrganizationRecords(db:Database,records:PassRecord[]):Promise<OrganizationSummary>{
 const meta=await db.prepare('SELECT status,seed_offset FROM organization_registry_meta WHERE dataset_version=?').bind(ORGANIZATION_VERSION).first<{status:string;seed_offset:number}>();
 const summary:OrganizationSummary={version:ORGANIZATION_VERSION,ready:meta?.status==='ready'&&Number(meta.seed_offset)===ORGANIZATION_ROWS,total:Number(meta?.seed_offset||0),expected:ORGANIZATION_ROWS,checked:0,matched:0,ambiguous:0,locationMismatch:0,incomplete:0,notFound:0,missingName:0,autoFilledRecords:0,autoFilledSubdistrict:0,autoFilledDistrict:0,autoFilledProvince:0};
 if(!summary.ready)return summary;
 const inputs=new Map<string,{lookup:string[];records:PassRecord[]}>();
 for(const record of records){const name=organizationNameKey(record.temple||(!/^(?:คณะจังหวัด|คณะเขต|คณะสงฆ์)/.test(record.school||'')?record.school:''));if(!name){summary.missingName++;record.organizationMatch={version:ORGANIZATION_VERSION,status:'missing-name',nameCount:0,locationCount:0,sourceRows:[]};continue;}summary.checked++;const lookup=[name,templeAddressKey(record.subdistrict||'','subdistrict'),templeAddressKey(record.district||'','district'),templeAddressKey(record.sourceProvince||'','province')],key=JSON.stringify(lookup),existing=inputs.get(key);if(existing)existing.records.push(record);else inputs.set(key,{lookup,records:[record]});}
 const unique=[...inputs.values()];
 for(let offset=0;offset<unique.length;offset+=500){const part=unique.slice(offset,offset+500);
  const result=await db.prepare(`WITH incoming AS (SELECT CAST(key AS INTEGER) idx,json_extract(value,'$[0]') name_key FROM json_each(?)) SELECT i.idx,r.source_row,r.subdistrict,r.district,r.province,r.subdistrict_key,r.district_key,r.province_key FROM incoming i JOIN organization_registry r ON r.dataset_version=? AND r.name_key=i.name_key ORDER BY i.idx,r.source_order`).bind(JSON.stringify(part.map(x=>x.lookup)),ORGANIZATION_VERSION).all<Candidate&{idx:number}>();
  const byIndex=new Map<number,Candidate[]>();for(const row of result.results){const list=byIndex.get(Number(row.idx))||[];list.push(row);byIndex.set(Number(row.idx),list);}
  for(let i=0;i<part.length;i++){const candidates=byIndex.get(i)||[],[,sub,district,province]=part[i].lookup;
   const exact=(r:Candidate)=>(!sub||r.subdistrict_key===sub)&&(!district||r.district_key===district)&&(!province||r.province_key===province);
   const compatible=(r:Candidate)=>(!sub||!r.subdistrict_key||r.subdistrict_key===sub)&&(!district||!r.district_key||r.district_key===district)&&(!province||!r.province_key||r.province_key===province);
   const matching=candidates.filter(exact),possible=candidates.filter(compatible),groups=new Set(matching.map(r=>[r.subdistrict_key,r.district_key,r.province_key].join('|')));
   let status:OrganizationMatch['status']='not-found';let reference:Candidate|undefined;
   if(candidates.length){if(!matching.length)status=possible.length?'incomplete':'location-mismatch';else if(possible.some(r=>!exact(r)))status='incomplete';else if(groups.size!==1)status='ambiguous';else{reference=matching[0];status=reference.subdistrict_key&&reference.district_key&&reference.province_key?'matched':'incomplete';}}
   for(const record of part[i].records){const previous=record.organizationMatch;const auto=new Set<'subdistrict'|'district'|'province'>(previous?.version===ORGANIZATION_VERSION&&previous.status==='matched'&&status==='matched'?previous.autoFilled||[]:[]);
    if(status==='matched'&&reference){if(!String(record.subdistrict||'').trim()){record.subdistrict=reference.subdistrict;auto.add('subdistrict');}if(!String(record.district||'').trim()){record.district=reference.district;auto.add('district');}if(!String(record.sourceProvince||'').trim()){record.sourceProvince=reference.province;auto.add('province');}record.fingerprint=fingerprint(record);
     if(!/^วัด/.test(record.temple||record.school))record.warnings=record.warnings.filter(w=>!w.includes('ไม่พบชื่อวัดในทะเบียน')&&!w.includes('พบชื่อวัดในทะเบียน แต่ตำบล')&&!w.includes('ทะเบียนวัดพบชื่อซ้ำ')&&!w.includes('พบชื่อวัดและพื้นที่บางส่วน'));
     summary.matched++;
    }else if(status==='ambiguous'){summary.ambiguous++;if(!record.warnings.includes('ทะเบียนองค์กรพบชื่อซ้ำต่างพื้นที่ กรุณาตรวจสอบที่อยู่'))record.warnings.push('ทะเบียนองค์กรพบชื่อซ้ำต่างพื้นที่ กรุณาตรวจสอบที่อยู่');}
    else if(status==='location-mismatch'){summary.locationMismatch++;if(!record.warnings.includes('ชื่อองค์กรตรงทะเบียน แต่ที่อยู่ขัดแย้ง จึงไม่เติมอัตโนมัติ'))record.warnings.push('ชื่อองค์กรตรงทะเบียน แต่ที่อยู่ขัดแย้ง จึงไม่เติมอัตโนมัติ');}
    else if(status==='incomplete')summary.incomplete++;else summary.notFound++;
    record.organizationMatch={version:ORGANIZATION_VERSION,status,nameCount:candidates.length,locationCount:matching.length,sourceRows:matching.map(r=>Number(r.source_row)),...(auto.size?{autoFilled:[...auto]}:{})};
    if(auto.size)summary.autoFilledRecords++;if(auto.has('subdistrict'))summary.autoFilledSubdistrict++;if(auto.has('district'))summary.autoFilledDistrict++;if(auto.has('province'))summary.autoFilledProvince++;
   }
  }
 }
 return summary;
}

export function organizationRecordFromDatabase(row:Record<string,unknown>):PassRecord{
 return {id:String(row.id),sheet:String(row.sheet||''),row:Number(row.source_row||0),sequence:String(row.sequence||''),year:Number(row.year),province:String(row.province||''),region:String(row.region||''),sect:String(row.sect||''),category:String(row.category||''),level:String(row.level||''),title:String(row.title||''),firstName:String(row.first_name||''),lastName:String(row.last_name||''),dharmaName:String(row.dharma_name||''),temple:String(row.temple||''),subdistrict:String(row.subdistrict||''),district:String(row.district||''),sourceProvince:String(row.source_province||''),school:String(row.school||''),jurisdiction:String(row.jurisdiction||''),schoolKind:String(row.school_kind||''),note:String(row.note||''),fingerprint:String(row.fingerprint||''),warnings:[],errors:[]};
}
