import {readWorkbook} from './xlsx';
import {checkZip,clean} from './excel';
import {digits,normalizeProvince,normalizeRegion,normalizeCategory,normalizeLevel,normalizeSect,scopeFromCells,scopeFromText,type Scope} from './scope';
import {regionForProvince} from './province-regions';
import {MAX_SCANNED_ROWS,PROVINCES,type ImportOptions} from './constants';

export const STATISTICS_PARSER_VERSION='retained-results-v2';
export const STATISTIC_METRICS=['sent','absent','retained','passed','failed','other'] as const;
export type Metric=typeof STATISTIC_METRICS[number];
export type RetainedStatistic={year:number;region:string;province:string;category:string;level:string;sect:string;temple:string;sheet:string;sourceRow:number;sourceEndRow:number;note:string}&Record<Metric,number|null>;
export type StatisticIssue={sheet:string;row:number;message:string};
const aliases:Record<string,string[]>={
 sent:['ส่งสอบ','ส่งเข้าสอบ','จำนวนส่งสอบ','จำนวนส่งเข้าสอบ'],absent:['ขาดสอบ','จำนวนขาดสอบ'],retained:['คงสอบ','จำนวนคงสอบ','คงเหลือ'],passed:['สอบได้','สอบผ่าน','จำนวนสอบได้','จำนวนสอบผ่าน'],failed:['สอบตก','จำนวนสอบตก','ไม่ผ่าน'],other:['อื่นๆ','อื่น ๆ','อื่น','จำนวนอื่นๆ'],
 year:['ปี พ.ศ.','พ.ศ.','ปีการศึกษา','ปีสอบ','ปีการสอบ'],region:['ภาค','ภาคที่'],province:['จังหวัด','จังหวัดสนามสอบ','จังหวัดที่สอบ'],category:['ประเภท','ประเภทการสอบ','แผนก'],level:['ชั้น','ระดับ','ระดับชั้น'],sect:['นิกาย','คณะสงฆ์'],temple:['วัด','ชื่อวัด','วัด/สถานศึกษา','สังกัดวัด','สถานศึกษา','องค์กร','สำนักเรียน','สังกัดองค์กร/สถานศึกษา']
};
const key=(s:string)=>digits(s).replace(/[\s.()\[\]_:：/\\-]/g,'');
const labels=Object.fromEntries(Object.entries(aliases).flatMap(([name,values])=>values.map(v=>[key(v),name])));
const blankMetrics=()=>Object.fromEntries(STATISTIC_METRICS.map(m=>[m,null])) as Record<Metric,number|null>;
const isMetric=(value:string):value is Metric=>(STATISTIC_METRICS as readonly string[]).includes(value);
const missing=(s:string)=>!s||['-','—','–','ไม่ระบุ'].includes(s);

// Read summary numbers only. A list of successful candidates cannot establish sent/absent/failed counts.
export function parseRetainedStatistics(bytes:Uint8Array,options:ImportOptions){
 checkZip(bytes);
 const workbook=readWorkbook(bytes,{cachedFormulaResults:true}),rows:RetainedStatistic[]=[],issues:StatisticIssue[]=[];
 const fileScope=scopeFromText(options.filename||'');
 const defaults:Scope={province:normalizeProvince(options.province)||fileScope.province||'',region:normalizeRegion(options.region||'')||fileScope.region||'',sect:normalizeSect(options.sect||'')||fileScope.sect||'',category:options.category||fileScope.category||'',level:options.level||fileScope.level||'',year:options.year||fileScope.year||0};
 let scanned=0;
 for(const sheet of workbook.worksheets){
  let scope:Scope={...defaults,...scopeFromText(sheet.name)},temple='',personMap:Record<string,number>={};
  let pending:{mapping:Record<string,number>;row:number;tabular:boolean}|null=null;
  let vertical:RetainedStatistic|null=null;
  const issue=(row:number,message:string)=>{if(issues.length<200)issues.push({sheet:sheet.name,row,message});};
  const numeric=(value:unknown,label:string,row:number,notes:string[]):number|null=>{
   if(value&&typeof value==='object'&&('formula'in value||'sharedFormula'in value)){
    const cached=(value as {result?:unknown}).result;
    if(typeof cached==='number'){notes.push('ใช้ผลสูตรที่ Excel บันทึกไว้ ไม่ได้คำนวณสูตรใหม่');return numeric(cached,label,row,notes);}
    notes.push(`ช่อง ${label} เป็นสูตรที่ไม่มีผลลัพธ์บันทึกไว้`);issue(row,`ช่อง ${label} เป็นสูตรที่ไม่มีผลลัพธ์บันทึกไว้`);return null;
   }
   const raw=digits(clean(value)).replace(/,/g,'').replace(/\s*(?:รูป|คน|ราย)\s*$/,'').trim();
   if(missing(raw))return null;
   if(!/^\d+$/.test(raw)||Number(raw)>100000000){issue(row,`ช่อง ${label} ไม่ใช่จำนวนเต็มที่อ่านได้: ${raw.slice(0,40)}`);notes.push(`ช่อง ${label} อ่านตัวเลขไม่ได้`);return null;}
   return Number(raw);
  };
  const create=(row:number,explicit:Record<string,string>={},notes:string[]=[]):RetainedStatistic|null=>{
   const s={...scope};
   if(explicit.year)s.year=Number(digits(explicit.year).replace(/^พ\.?\s*ศ\.?\s*/,''));
   if(explicit.province){s.province=normalizeProvince(explicit.province);if(!explicit.region)s.region=regionForProvince(s.province);}
   if(explicit.region)s.region=normalizeRegion(explicit.region);
   if(explicit.category)s.category=normalizeCategory(explicit.category);
   if(explicit.level)s.level=normalizeLevel(explicit.level);
   if(explicit.sect)s.sect=normalizeSect(explicit.sect);
   if(!Number.isInteger(s.year)||s.year<2400||s.year>3000||!PROVINCES.includes(s.province)||!['นักธรรม','ธรรมศึกษา'].includes(s.category)||!['ตรี','โท','เอก'].includes(s.level)){
    issue(row,'พบสรุปสถิติ แต่ปี/จังหวัด/ประเภท/ชั้นไม่ครบ จึงยังไม่รวมยอด');return null;
   }
   return {...blankMetrics(),year:s.year,province:s.province,region:s.region||regionForProvince(s.province),category:s.category,level:s.level,sect:s.sect||'',temple:explicit.temple||temple,sheet:sheet.name,sourceRow:row,sourceEndRow:row,note:notes.join(' · ')};
  };
  const save=(r:RetainedStatistic|null)=>{
   if(!r)return;
   if(!STATISTIC_METRICS.some(m=>r[m]!==null)){issue(r.sourceRow,'ไม่พบตัวเลขในแถวสรุปสถิติ');return;}
   const notes=r.note?[r.note]:[];
   if(r.sent!==null&&r.absent!==null&&r.retained!==null&&r.sent-r.absent!==r.retained){const message='ยอดส่งสอบลบขาดสอบไม่เท่ากับคงสอบตามต้นฉบับ';notes.push(message);issue(r.sourceRow,message);}
   if(r.retained!==null&&r.passed!==null&&r.failed!==null&&(r.other!==null?r.retained!==r.passed+r.failed+r.other:r.retained<r.passed+r.failed)){const message='ยอดคงสอบไม่สัมพันธ์กับสอบได้และสอบตกตามต้นฉบับ';notes.push(message);issue(r.sourceRow,message);}
   r.note=[...new Set(notes)].join(' · ');rows.push(r);
   if(rows.length>5000)throw new Error('พบแถวสถิติเกิน ๕,๐๐๐ แถว กรุณาตรวจขนาดไฟล์');
  };
  const flush=()=>{save(vertical);vertical=null;};
  sheet.eachRow({includeEmpty:false},(row,rowNumber)=>{
   if(++scanned>MAX_SCANNED_ROWS)throw new Error(`ไฟล์มีจำนวนแถวรวมเกิน ${MAX_SCANNED_ROWS.toLocaleString('th-TH')} แถว`);
   const values:string[]=[];row.eachCell({includeEmpty:true},(cell,col)=>{if(cell.isMerged&&cell.master.address!==cell.address)return;values[col]=clean(cell.value);});
   const nonempty=values.filter(Boolean),line=nonempty.join(' ');if(!line&&!row.hasValues)return;
   const mapping:Record<string,number>={};values.forEach((v,col)=>{const name=labels[key(v)];if(name&&!mapping[name])mapping[name]=col;});
   const nameCol=values.findIndex(v=>['ชื่อ','ชื่อตัว'].includes(v));
   if(nameCol>0&&values.some(v=>['นามสกุล','ชื่อสกุล','ลำดับ','ที่','ลำดับที่'].includes(v))){flush();pending=null;personMap={name:nameCol,sequence:values.findIndex(v=>['ที่','ลำดับ','ลำดับที่','เลขที่'].includes(v))};return;}
   const nameValue=values[personMap.name]||'',humanName=!!nameValue&&!/^[\d๐-๙.,\s]+$/.test(nameValue);
   const numbered=humanName&&personMap.sequence>0&&/^\d+(?:\.\d+)?$/.test(digits(values[personMap.sequence]||''));
   const person=numbered||!!(personMap.name&&humanName&&nonempty.length>=3&&!STATISTIC_METRICS.some(m=>mapping[m])&&!/^(?:บัญชี|รายชื่อ|ในสนามหลวง|พ\.?\s*ศ|สำนักเรียน|นักธรรม|ธรรมศึกษา|ภาค|จังหวัด)/.test(line));
   if(person&&!pending)return;
   const metricHeaders=STATISTIC_METRICS.filter(m=>mapping[m]);
   if(metricHeaders.length>=2||(metricHeaders.length&&mapping.province&&mapping.category&&mapping.level)){
    flush();pending={mapping,row:rowNumber,tabular:!!(mapping.province||mapping.category||mapping.level)};return;
   }
   if(pending){
    const p=pending,metricCells=STATISTIC_METRICS.filter(m=>p.mapping[m]).map(m=>row.getCell(p.mapping[m]).value);
    const hasValues=metricCells.some(v=>typeof v==='number'||typeof v==='object'&&v!==null||/^\s*[\d๐-๙–—-]/.test(clean(v)));
    if(hasValues&&(!person||p.tabular)){
     const notes:string[]=[],explicit=Object.fromEntries(Object.entries(p.mapping).filter(([name])=>!isMetric(name)).map(([name,col])=>[name,clean(row.getCell(col).value)]));
     const r=create(rowNumber,explicit);if(r){for(const m of STATISTIC_METRICS)if(p.mapping[m])r[m]=numeric(row.getCell(p.mapping[m]).value,m,rowNumber,notes);r.note=notes.join(' · ');save(r);}
     if(!p.tabular)pending=null;return;
    }
    if(rowNumber<=p.row+2&&(!line||nonempty.every(v=>['รูป','คน','ราย','จำนวน'].includes(v))))return;
    pending=null;
   }
   if(person)return;
   // Adjacent label/value pairs and vertical summaries are common in older files.
   const pairs:{metric:Metric;value:unknown}[]=[];
   for(let col=1;col<values.length;col++){
    const label=labels[key(values[col]||'')];
    if(label&&isMetric(label)&&col<row.cellCount){const next=row.getCell(col+1).value;if(!labels[key(clean(next))])pairs.push({metric:label,value:next});}
    else{const match=(values[col]||'').match(/^(ส่งเข้าสอบ|ส่งสอบ|ขาดสอบ|คงสอบ|สอบได้|สอบผ่าน|สอบตก|อื่น\s*ๆ)\s*[:：]?\s*([\d๐-๙,]+|[-–—])\s*(?:รูป|คน|ราย)?$/);if(match){const m=labels[key(match[1])];if(isMetric(m))pairs.push({metric:m,value:match[2]});}}
   }
   if(pairs.length){
    if(!vertical)vertical=create(rowNumber);
    if(vertical){const notes=vertical.note?[vertical.note]:[];for(const pair of pairs){if(vertical[pair.metric]!==null){flush();vertical=create(rowNumber);if(!vertical)break;}vertical[pair.metric]=numeric(pair.value,pair.metric,rowNumber,notes);}if(vertical){vertical.sourceEndRow=rowNumber;vertical.note=notes.join(' · ');}}
    return;
   }
   const found=scopeFromCells(values);const bare=nonempty.length===1?normalizeLevel(line):'';if(bare)found.level=bare;
   const heading=/^(?:บัญชี|รายชื่อ|ผลสอบ|ในสนามหลวง|พ\.?\s*ศ|ปี|ภาค|จังหวัด|จ\.|นิกาย|ฝ่าย|คณะ|สำนักเรียน|สำนักศาสนศึกษา|วัด|นักธรรม|ธรรมศึกษา|น\.?\s*ธ|ธ\.?\s*ศ|(?:ส่วน)?กลาง)/.test(line)||nonempty.length===1;
   if(heading&&Object.keys(found).length){flush();if(found.province&&found.province!==scope.province){temple='';scope.region=found.region||regionForProvince(found.province);}if(found.category||found.level){temple='';personMap={};}scope={...scope,...found};}
   if(!person&&nonempty.length===1&&/^(?:สำนักเรียน|สำนักศาสนศึกษา|คณะเขต|คณะสงฆ์|วัด)/.test(line)){
    flush();temple=/คณะจังหวัด|สำนักเรียนส่วนกลาง/.test(line)?'':line.replace(/^(?:สำนักเรียน|สำนักศาสนศึกษา)\s*/,'');
    if(temple&&scope.jurisdiction==='ส่วนกลาง')scope.province='กรุงเทพมหานคร';
   }
  });flush();
 }
 // A clearly labelled reference/form sheet must not duplicate the actual results sheets.
 // If the workbook only has a form-named sheet, retain its data rather than assuming it is blank.
 const reference=(name:string)=>/ชื่อเล่มแบบพิมพ์|แม่แบบ|ตัวอย่าง|คำแนะนำ|(?:^|[ _-])(?:template|sample)(?:$|[ _-])/i.test(name);
 const actual=rows.filter(r=>!reference(r.sheet)),excluded=actual.length?rows.filter(r=>reference(r.sheet)):[];
 if(excluded.length){
  const sheets=[...new Set(excluded.map(r=>r.sheet))];
  return {rows:actual,issues:[...issues.filter(i=>!sheets.includes(i.sheet)),...sheets.map(sheet=>({sheet,row:0,message:'ไม่นำชีตชื่อแบบพิมพ์/ตัวอย่างมารวมสถิติ เนื่องจากมีชีตผลสอบจริงในไฟล์เดียวกัน'}))],scanned};
 }
 return {rows,issues,scanned};
}
