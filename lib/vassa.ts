// Vassa is an explicitly recorded number of monastic rainy seasons in the exam year.
export function canHaveVassa(category:string,title:string){return category==='นักธรรม'&&!/สามเณร|^เณร/.test(title.trim());}
export function readVassa(raw:string,category:string,title:string,ageAtExam?:number|null){
 if(!raw.trim()||['ไม่ระบุ','-','—','–'].includes(raw.trim())||!canHaveVassa(category,title))return {vassa:null,warnings:[] as string[]};
 const text=raw.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-3664)).trim().replace(/\s*(?:พรรษา|ปี)\s*$/,'');
 const value=/^\d{1,3}$/.test(text)?Number(text):null;
 if(value===null||value>120)return {vassa:null,warnings:['พรรษาในไฟล์ไม่ถูกต้อง: ต้องเป็นจำนวนเต็ม 0–120 พรรษา']};
 if(ageAtExam!=null&&value>ageAtExam)return {vassa:null,warnings:['พรรษาในไฟล์มากกว่าอายุ ณ ปีสอบ: โปรดตรวจต้นฉบับ']};
 return {vassa:value,warnings:[] as string[]};
}
export function vassaDisplay(value:unknown,category:string,title:string){const missing=value==null||(typeof value==='string'&&(!value.trim()||['ไม่ระบุ','-','—','–'].includes(value.trim())));return !missing&&canHaveVassa(category,title)?String(value):'-';}
