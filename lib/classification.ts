import { findCentralSchool, schoolName, CENTRAL_SCHOOL_KINDS } from './central-schools';
import { CATEGORIES,LEVELS,PROVINCES,SECTS,type PassRecord } from './constants';
export function schoolKind(value:string):string{const s=schoolName(value);return CENTRAL_SCHOOL_KINDS.find(kind=>s.startsWith(kind)&&s.length>kind.length)||'';}
export function publicationErrors(r:Pick<PassRecord,'firstName'|'year'|'category'|'level'|'province'|'region'|'sect'|'school'|'jurisdiction'|'schoolKind'>&{sectReviewed?:boolean}){
 const errors:string[]=[];
 if(!r.firstName.trim())errors.push('ไม่พบชื่อ');
 if(!Number.isInteger(r.year)||r.year<2400||r.year>new Date().getUTCFullYear()+544)errors.push('ไม่พบปี พ.ศ. ที่ถูกต้อง');
 // A missing sect is reviewable metadata, not a publication requirement.
 if(r.sect&&!SECTS.includes(r.sect))errors.push('นิกายต้องเป็นมหานิกายหรือธรรมยุต หรือเว้นว่างเพื่อตรวจภายหลัง');
 if(!CATEGORIES.includes(r.category)||!LEVELS.includes(r.level))errors.push('ประเภทหรือชั้นไม่ถูกต้อง');
 if(r.jurisdiction==='ส่วนกลาง'){
 if(!CENTRAL_SCHOOL_KINDS.includes(r.schoolKind)||schoolKind(r.school)!==r.schoolKind)errors.push('สำนักเรียนส่วนกลางต้องระบุชื่อและชนิดสำนักเรียนให้ตรงกัน');
 if(r.province&&r.province!=='กรุงเทพมหานคร')errors.push('สำนักเรียนส่วนกลางต้องอยู่ในกรุงเทพมหานคร');
 const reference=findCentralSchool(r.school);if(reference&&!r.sectReviewed&&r.sect&&reference.sect!==r.sect)errors.push(`นิกายขัดแย้งกับทะเบียนส่วนกลาง: ${reference.name} = ${reference.sect}`);
 }else{
 if(!PROVINCES.includes(r.province))errors.push('ต้องระบุจังหวัดจาก 77 จังหวัด');
 if(!/^ภาค (?:[1-9]|1[0-8])(?:-(?:[1-9]|1[0-8]))*$/.test(r.region))errors.push('ต้องระบุภาค 1–18');
 }
 return errors;
}
export function databaseRecord(r:Record<string,unknown>){return {sectReviewed:Number(r.sect_reviewed)===1,firstName:String(r.first_name||''),year:Number(r.year),category:String(r.category||''),level:String(r.level||''),province:String(r.province||''),region:String(r.region||''),sect:String(r.sect||''),school:String(r.school||''),jurisdiction:String(r.jurisdiction||''),schoolKind:String(r.school_kind||'')};}

// Retain the original workbook in R2; ambiguous affiliations stay blank until an admin reviews them.
export function deferSectRecord(r:PassRecord){
 const sectErrors=r.errors.filter(e=>e.includes('นิกาย')||e.includes('รหัสส่วนกลาง'));
 if(sectErrors.length){r.errors=r.errors.filter(e=>!sectErrors.includes(e));r.warnings.push(...sectErrors.map(e=>'รอตรวจนิกาย: '+e));r.sect='';}
 if(!SECTS.includes(r.sect)){if(r.sect)r.warnings.push('รอตรวจนิกายตามต้นฉบับ: '+r.sect);r.sect='';}
 if(!r.sect&&!r.warnings.some(w=>w.includes('รอตรวจนิกาย')))r.warnings.push('รอตรวจนิกายภายหลัง');
 r.sectReviewed=false;return r;
}
