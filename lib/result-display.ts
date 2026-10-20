import {findCentralSchool,schoolName} from './central-schools';
export type StudyCenterRecord={province:string;school:string;jurisdiction?:unknown};
export function studyCenterLabel(record:StudyCenterRecord){
 const reference=findCentralSchool(record.school);
 if(record.jurisdiction==='ส่วนกลาง'||record.province==='กรุงเทพมหานคร'&&reference)return reference?.name||schoolName(record.school)||'ส่วนกลาง กรุงเทพมหานคร';
 return record.province?`คณะจังหวัด${record.province}`:'ไม่ระบุ';
}
export function affiliationLabel(category:string){return category==='นักธรรม'?'สังกัดวัด':'สังกัดองค์กร/สถานศึกษา';}

export function examLevelLabel(category:string,level:string){
 const value=level.trim();
 const short=value.replace(/^(?:น\.?\s*ธ\.?|ธ\.?\s*ศ\.?|นักธรรม|ธรรมศึกษา)\s*/,'').replace(/^ชั้น\s*/,'');
 if(!['ตรี','โท','เอก'].includes(short))return value||'ไม่ระบุ';
 return `${category==='นักธรรม'?'น.ธ.':'ธ.ศ.'}${short}`;
}
