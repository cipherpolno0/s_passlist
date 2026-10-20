import {PROVINCE_BY_ABBREVIATION} from './province-abbreviations';
import {centralCode} from './central-schools';
import { PROVINCES, REGIONS, type PassRecord } from './constants';
export const digits=(s:string)=>s.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-3664));
const compact=(s:string)=>digits(s).replace(/[\s.()\[\]_:]/g,'');
export function normalizeProvince(s:string){
 const input=compact(s.trim());
 const c=Object.hasOwn(PROVINCE_BY_ABBREVIATION,input)?input:compact(s.trim().replace(/^(?:จังหวัด|จว\.|จ\.)\s*[:：]?\s*/,''));
 if(['กทม','กทมฯ','กรุงเทพฯ','กรุงเทพ','กรุงเทพมหานคร'].includes(c))return 'กรุงเทพมหานคร';
 return PROVINCES.find(p=>p===c)||(Object.hasOwn(PROVINCE_BY_ABBREVIATION,c)?PROVINCE_BY_ABBREVIATION[c]:'');
}
export function normalizeCategory(s:string){const c=compact(s);if(c.includes('ธรรมศึกษา')||/^ธศ(?:ชั้น)?(?:ตรี|โท|เอก)?$/.test(c))return 'ธรรมศึกษา';if(c.includes('นักธรรม')||/^นธ(?:ชั้น)?(?:ตรี|โท|เอก)?$/.test(c))return 'นักธรรม';return '';}
export function normalizeLevel(s:string){const c=compact(s).replace(/^(นักธรรม|ธรรมศึกษา|นธ|ธศ)/,'').replace(/^ชั้น/,'');return ['ตรี','โท','เอก'].find(x=>x===c)||'';}
export function normalizeSect(s:string){
 const code=centralCode(s.trim());if(code)return code.sect;
 const c=compact(s).replace(/^(นิกาย|คณะ|ฝ่าย)/,'');
 if(/^(มหานิกาย|มหานิกายม|ม)$/.test(c))return 'มหานิกาย';
 if(/^(ธรรมยุต|ธรรมยุติ|ธรรมยุติกนิกาย|ธรรมยุตนิกาย|ธรรมยุตธ|ธรรมยุติธ|ธรรมยุติกนิกายธ|ธ)$/.test(c))return 'ธรรมยุต';
 return '';
}
export function normalizeRegion(s:string){
 const c=digits(s).trim().replace(/\s*\((?:ธ\.?|ม\.?|ธรรมยุต(?:ิกนิกาย|ิ)?|มหานิกาย)\)\s*$/,'').replace(/ภาค\s*ที่\s*/,'ภาค ').replace(/[–—,\/]/g,'-').replace(/\s*-\s*/g,'-');
 const n=c.match(/^(?:ภาค\s*)?(\d{1,2}(?:-\d{1,2})*)$/);
 if(n){const parts=n[1].split('-').map(Number);if(parts.every(n=>n>=1&&n<=18))return 'ภาค '+[...new Set(parts)].join('-');}
 return REGIONS.find(v=>compact(v)===compact(c))||'';
}
export type Scope={province:string;region:string;sect:string;category:string;level:string;year:number;jurisdiction?:string};
export function scopeFromText(text:string):Partial<Scope>{
 const s=digits(text).replace(/[_\n]/g,' ').replace(/\s+/g,' ').trim(),out:Partial<Scope>={};
 const code=s.match(/(?:^|\s)((?:ส่วน)?กลาง\s*[มธ]\.?)(?=\s|$)/);if(code)Object.assign(out,centralCode(code[1]));
 const categoryText=s.replace(/(?:จังหวัดสนามสอบ|จังหวัดที่สอบ|จังหวัด|จว\.|จ\.)\s*[:：]?\s*[^\s()]+/g,'');
 const category=categoryText.includes('นักธรรม')&&categoryText.includes('ธรรมศึกษา')?'':normalizeCategory(categoryText);if(category)out.category=category;else if(s.includes('นักธรรม')&&s.includes('ธรรมศึกษา'))out.category='';
 if(!category){if(/(?:^|[\s(])ธ\.?\s*ศ\.?(?=[\s)-]|ตรี|โท|เอก|$)/.test(categoryText))out.category='ธรรมศึกษา';else if(/(?:^|[\s(])น\.?\s*ธ\.?(?=[\s)-]|ตรี|โท|เอก|$)/.test(categoryText))out.category='นักธรรม';}
 const lm=s.match(/(?:(?:นักธรรม|ธรรมศึกษา)\s*(?:ชั้น\s*)?|ชั้น\s*|น\.?\s*ธ\.?[-\s]*|ธ\.?\s*ศ\.?[-\s]*)(ตรี|โท|เอก)/);if(lm)out.level=lm[1];
 const rm=s.match(/ภาค\s*(?:ที่\s*)?\d{1,2}(?:\s*[-–—,/]\s*\d{1,2})*/);
 if(rm){out.region=normalizeRegion(rm[0])||rm[0];}
 if(!out.region){const geographic=REGIONS.filter(r=>!/^ภาค \d/.test(r)&&r!=='กรุงเทพมหานคร').find(r=>s.includes(r));if(geographic)out.region=geographic;}
 if(/ธรรมยุต(?:ิกนิกาย|ิ)?/.test(s)&&s.includes('มหานิกาย'))out.sect='';else if(/ธรรมยุต(?:ิกนิกาย|ิ)?/.test(s))out.sect='ธรรมยุต';else if(s.includes('มหานิกาย'))out.sect='มหานิกาย';
 else if(/(?:นิกาย|คณะ|ฝ่าย)\s*[:：]?\s*ธ\.?\s*$|\(\s*ธ\.?\s*\)/.test(s))out.sect='ธรรมยุต';
 else if(/(?:นิกาย|คณะ|ฝ่าย)\s*[:：]?\s*ม\.?\s*$|\(\s*ม\.?\s*\)/.test(s))out.sect='มหานิกาย';
 // A heading or sheet may supply a province, but data-row addresses never run through this parser.
 if(!out.sect){const unknown=s.match(/^(?:นิกาย|คณะนิกาย|ฝ่าย)\s*[:：]?\s*(.+)$/);if(unknown)out.sect=unknown[1];}
 const normalized=normalizeProvince(s);if(normalized&&(!out.category||!Object.hasOwn(PROVINCE_BY_ABBREVIATION,compact(s))))out.province=normalized;
 else{const m=s.match(/(?:จังหวัดสนามสอบ|จังหวัดที่สอบ|จังหวัด|จว\.|จ\.)\s*[:：]?\s*([^\s()]+)/);if(m){out.province=normalizeProvince(m[1])||m[1];}
 if(!out.province){const found=PROVINCES.filter(p=>s.includes(p));if(found.length===1)out.province=found[0];else if(/(?:^|\s)(กทม\.?|กรุงเทพฯ)(?:\s|$)/.test(s))out.province='กรุงเทพมหานคร';}}
 if(s.includes('สำนักเรียนส่วนกลาง')||/^ส่วนกลาง$/.test(s))out.jurisdiction='ส่วนกลาง';if(s.includes('ส่วนภูมิภาค'))out.jurisdiction='ส่วนภูมิภาค';
 const ym=s.match(/(?:พ\.?\s*ศ\.?|ปีการสอบ|ปี\s*พ\.?\s*ศ\.?)\s*[:：]?\s*(\d{4})/);if(ym)out.year=Number(ym[1]);
 return out;
}
export function fingerprint(r:Pick<PassRecord,'year'|'province'|'category'|'level'|'title'|'firstName'|'lastName'|'dharmaName'|'temple'|'district'|'school'|'region'|'sect'>&{subdistrict?:string}){
 const base=[r.year,r.province,r.category,r.level,r.title,r.firstName,r.lastName,r.dharmaName,r.temple,r.district,r.school];
 if(r.subdistrict)base.push(r.subdistrict);
 if(r.region||r.sect)base.push(r.region||'',r.sect||'');
 return base.map(v=>String(v).replace(/\s/g,'')).join('|');
}

export function scopeFromCells(values:string[]):Partial<Scope>{
 const nonempty=values.filter(Boolean),line=nonempty.join(' '),out=scopeFromText(line);
 if(/^ในสนามหลวง/.test(nonempty[0]||'')){
 const i=nonempty.findIndex((v,n)=>n>0&&!!normalizeProvince(v));
 if(i>=0){out.province=normalizeProvince(nonempty[i]);const next=digits(nonempty[i+1]||'');if(/^(?:[1-9]|1[0-8])$/.test(next))out.region=normalizeRegion(next);}
 }
 if(!out.level&&out.category){const level=nonempty.map(normalizeLevel).filter(Boolean);if(new Set(level).size===1)out.level=level[0];}
 return out;
}
