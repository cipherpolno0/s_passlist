import {PROVINCE_ABBREVIATIONS} from './province-abbreviations';
import {normalizeProvince} from './scope';
import {toArabic,toThai} from './thai-numerals';
export type CertificateRecord={province:string;jurisdiction?:unknown;year:number;sequence?:unknown;certificate_number?:string};
export function certificateNumber(record:CertificateRecord){
 if(record.certificate_number)return toThai(record.certificate_number.trim().replace(/^ที่\s*/,''));
 const province=(normalizeProvince(record.province)||(record.jurisdiction==='ส่วนกลาง'?'กรุงเทพมหานคร':'')),code=Object.hasOwn(PROVINCE_ABBREVIATIONS,province)?PROVINCE_ABBREVIATIONS[province]:'',sequence=toArabic(record.sequence).trim();
 if(!code||!/^\d+(?:\.\d+)?$/.test(sequence)||!Number.isInteger(record.year)||record.year<2400)return 'ไม่ระบุ';
 return toThai(`${code} ${sequence}/${record.year}`);
}
