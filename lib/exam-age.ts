export type ExamAge={birthYear:number|null;ageAtExam:number|null;birthYearEstimated:boolean;ageEstimated:boolean;warnings:string[]};
const ascii=(s:string)=>s.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-3664));
const missing=(value:string)=>!value.trim()||['ไม่ระบุ','-','—','–'].includes(value.trim());
export function examAge(year:number,rawAge:string,rawBirthYear:string):ExamAge{
 const result:ExamAge={birthYear:null,ageAtExam:null,birthYearEstimated:false,ageEstimated:false,warnings:[]};
 const ageText=ascii(rawAge).trim().replace(/\s*ปี\s*$/,'');
 const birthText=ascii(rawBirthYear).trim().replace(/^พ\.?\s*ศ\.?\s*/,'');
 const age=ageText&&/^\d{1,3}$/.test(ageText)?Number(ageText):null;
 const birth=birthText&&/^\d{4}$/.test(birthText)?Number(birthText):null;
 if(!missing(rawAge)&&(age===null||age<0||age>120))result.warnings.push('อายุในไฟล์ไม่ถูกต้อง: ต้องเป็นจำนวนเต็ม 0–120 ปี');
 if(!missing(rawBirthYear)&&(birth===null||birth<year-120||birth>year))result.warnings.push('ปี พ.ศ. เกิดในไฟล์ไม่สัมพันธ์กับปีสอบ (ช่วงอายุ 0–120 ปี)');
 if(result.warnings.length||!Number.isInteger(year)||year<2400)return result;
 if(age!==null&&birth!==null&&Math.abs(year-birth-age)>1){result.warnings.push('อายุและปี พ.ศ. เกิดในไฟล์ขัดแย้งกัน: โปรดตรวจต้นฉบับ');return result;}
 result.birthYear=birth;result.ageAtExam=age;
 if(age!==null&&birth===null){result.birthYear=year-age;result.birthYearEstimated=true;}
 if(birth!==null&&age===null){result.ageAtExam=year-birth;result.ageEstimated=true;}
 return result;
}
export function ageDisplay(value:unknown,estimated:unknown){return value===null||value===undefined?'ไม่ระบุ':`${estimated?'ประมาณ ':''}${value}`;}
export function examAgeValueDisplay(value:unknown){return value===null||value===undefined||(typeof value==='string'&&missing(value))?'-':String(value);}
export function examAgeDisplay(value:unknown,estimated:unknown){const display=examAgeValueDisplay(value);return display==='-'?display:`${estimated?'ประมาณ ':''}${display} ปี`;}
