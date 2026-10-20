import {applyProvinceRegion} from './province-regions';
import {readVassa} from './vassa';
import {examAge} from './exam-age';
import {findCentralSchool,schoolName,centralCode} from './central-schools';
import {readWorkbook,templateBytes} from './xlsx';
import { CATEGORIES, LEVELS, PROVINCES, MAX_ROWS, MAX_SCANNED_ROWS, type ImportOptions, type ParsedFile, type PassRecord } from './constants';
import { digits, normalizeProvince, normalizeRegion, normalizeSect, normalizeCategory, normalizeLevel, scopeFromText, scopeFromCells, fingerprint, type Scope } from './scope';
import {schoolKind,publicationErrors,deferSectRecord} from './classification';
export {digits} from './scope';
export function clean(v:unknown):string {
 if(v==null)return '';
 if(typeof v==='object'){const o=v as Record<string,unknown>;if('formula'in o||'sharedFormula'in o)return '';if('richText'in o)return clean((o.richText as {text:string}[]).map(x=>x.text).join(''));if('text'in o)return clean(o.text);return '';}
 return String(v).normalize('NFC').replace(/[\u200b\ufeff]/g,'').replace(/\s+/g,' ').trim();
}
const key=(s:string)=>s.replace(/[\s.()\-_/：:*]/g,'');
const aliases:Record<string,string[]>={vassa:['พรรษา','อายุพรรษา','จำนวนพรรษา','ปีพรรษา','พรรษาที่','พรรษา (ปี)'],age:['อายุ','อายุปี','อายุ (ปี)','อายุ ณ ปีสอบ','อายุ ณ ปีที่สอบผ่าน'],birthYear:['ปีเกิด','ปี พ.ศ. เกิด','ปีพ.ศ.เกิด','พ.ศ.เกิด','ปีที่เกิด','ปีเกิด (พ.ศ.)'],sequence:['ที่','ลำดับ','ลำดับที่','เลขที่'],title:['คำนำหน้า','คำนำหน้าชื่อ'],firstName:['ชื่อ','ชื่อตัว'],lastName:['นามสกุล','ชื่อสกุล'],dharmaName:['ฉายา'],temple:['วัด','สังกัดวัด','วัด/สถานศึกษา','สถานศึกษา','โรงเรียน','องค์กร','สถานศึกษา/องค์กร','องค์กร/สถานศึกษา','ชื่อสถานศึกษา','ชื่อองค์กร','สถานศึกษา / องค์กร'],subdistrict:['ตำบล','แขวง','แขวง/ตำบล','ตำบล/แขวง'],district:['อำเภอ','เขต','เขต/อำเภอ','อำเภอ/เขต'],sourceProvince:['จังหวัด','จังหวัดที่ตั้ง','จว.','จ.'],school:['สำนักเรียน','สำนักศาสนศึกษา','สำนักเรียนส่วนกลาง','ชื่อสำนักเรียนส่วนกลาง'],note:['หมายเหตุ'],category:['ประเภท','ประเภทการสอบ','แผนก'],level:['ระดับ','ชั้น','ระดับชั้น','ชั้นสอบ'],year:['ปี พ.ศ.','ปีพ.ศ.','พ.ศ.','ปีการสอบ'],province:['จังหวัดสนามสอบ','จังหวัดที่สอบ','จังหวัดสอบ','จังหวัดของชุดผลสอบ'],region:['ภาค','ภาคที่','ภาคสงฆ์','ภาคการปกครอง','ภาคคณะสงฆ์'],sect:['นิกาย','คณะนิกาย','สังกัดนิกาย','ฝ่าย'],jurisdiction:['เขตข้อมูล','พื้นที่การศึกษา','ประเภทสำนักเรียน'],schoolKind:['ชนิดสำนักเรียน','วัดหรือคณะเขต']};
export function validateRecord(r:PassRecord){
 r.errors=[];if(!r.firstName)r.errors.push('ไม่พบชื่อ');if(!CATEGORIES.includes(r.category))r.errors.push('ไม่พบประเภทนักธรรม/ธรรมศึกษา');if(!LEVELS.includes(r.level))r.errors.push('ไม่พบระดับตรี/โท/เอก');
 if((r.jurisdiction!=='ส่วนกลาง'||r.province)&&!PROVINCES.includes(r.province))r.errors.push('ไม่พบจังหวัดสนามสอบที่ถูกต้อง');
 if(!Number.isInteger(r.year)||r.year<2400||r.year>new Date().getUTCFullYear()+544)r.errors.push('ปี พ.ศ. ไม่ถูกต้อง');
 if(r.region&&!normalizeRegion(r.region))r.errors.push('ภาคไม่ถูกต้อง');if(r.sect&&!normalizeSect(r.sect))r.errors.push('นิกายไม่ถูกต้อง');
 for(const k of ['firstName','lastName','dharmaName','temple','district','school','note'] as const)if(r[k].length>500)r.errors.push('ข้อความยาวเกิน 500 ตัวอักษร');
 if((r.subdistrict||'').length>500)r.errors.push('ชื่อตำบลยาวเกิน 500 ตัวอักษร');
 if(!r.lastName)r.warnings.push('ไม่พบนามสกุล');if(!r.region&&r.jurisdiction!=='ส่วนกลาง')r.warnings.push('ไม่ระบุภาค: โปรดตรวจเพิ่มเติม');if(!r.sect)r.warnings.push('ไม่ระบุนิกาย: โปรดตรวจเพิ่มเติม');return r;
}
export function checkZip(bytes:Uint8Array){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let e=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(d.getUint32(i,true)===0x06054b50){e=i;break;}
 if(e<0)throw new Error('ไฟล์ไม่ใช่ .xlsx ที่สมบูรณ์');
 const count=d.getUint16(e+10,true),start=d.getUint32(e+16,true);if(count>1000)throw new Error('ไฟล์มีส่วนประกอบมากเกินกำหนด');
 let p=start,total=0;for(let n=0;n<count;n++){if(p+46>bytes.length||d.getUint32(p,true)!==0x02014b50)throw new Error('โครงสร้างไฟล์ Excel ไม่ถูกต้อง');total+=d.getUint32(p+24,true);if(total>128*1024*1024)throw new Error('ไฟล์ Excel หลังขยายมีขนาดเกิน 128 MB กรุณาลดขนาดหรือแบ่งไฟล์');p+=46+d.getUint16(p+28,true)+d.getUint16(p+30,true)+d.getUint16(p+32,true);}
}
export async function parseExcel(bytes:Uint8Array,options:ImportOptions):Promise<ParsedFile>{
 checkZip(bytes);const workbook=readWorkbook(bytes);
 const records:PassRecord[]=[],warnings:string[]=[],seen=new Set<string>();let ignored=0,scanned=0;const totals:number[]=[];
 const filenameScope=scopeFromText(options.filename||'');
 const defaults:Scope={...filenameScope,province:normalizeProvince(options.province),year:options.year,category:options.category,level:options.level,region:normalizeRegion(options.region||''),sect:normalizeSect(options.sect||'')||filenameScope.sect||'',jurisdiction:options.jurisdiction||filenameScope.jurisdiction||''};
 for(const sheet of workbook.worksheets){
 if(sheet.rowCount>MAX_SCANNED_ROWS||sheet.columnCount>100)throw new Error(`ชีตมีขนาดเกินกำหนด (${MAX_SCANNED_ROWS.toLocaleString('th-TH')} แถว / 100 คอลัมน์)`);
 // Reset all context per worksheet so a province/sect never leaks from the previous sheet.
 let scope:Scope={...defaults,...scopeFromText(sheet.name)},mapping:Record<string,number>={},school=options.school||'',statsColumn=0;
 sheet.eachRow((row,rowNumber)=>{
 if(++scanned>MAX_SCANNED_ROWS)throw new Error(`จำนวนแถวรวมในไฟล์เกิน ${MAX_SCANNED_ROWS.toLocaleString('th-TH')} แถว กรุณาแบ่งไฟล์`);
 const values:string[]=[];row.eachCell({includeEmpty:true},(c,i)=>{if(c.isMerged&&c.master.address!==c.address)return;values[i]=clean(c.value);});
 const line=values.filter(Boolean).join(' ');if(!line)return;
 if(statsColumn){const v=digits(values[statsColumn]||'').replace(/,/g,'');if(/^\d+$/.test(v))totals.push(Number(v));else warnings.push(`อ่านยอดสอบได้ไม่สำเร็จ: ${sheet.name} แถว ${rowNumber}`);statsColumn=0;ignored++;return;}
 const header:Record<string,number>={};values.forEach((v,i)=>{for(const [k,aa]of Object.entries(aliases))if(aa.some(a=>key(a)===key(v)))header[k]=i;});
 if(header.firstName&&(header.lastName||header.sequence||header.category||header.level)){mapping=header;ignored++;return;}
 const val=(k:string)=>values[mapping[k]]||'',seq=digits(val('sequence')),numbered=/^\d+(\.\d+)?$/.test(seq);
 if(/ส่งเข้าสอบ/.test(line)&&/ขาดสอบ/.test(line)){statsColumn=values.findIndex(v=>v==='สอบได้');if(statsColumn<0)statsColumn=0;ignored++;return;}
 if(/^(สำนักเรียน|สำนักศาสนศึกษา|คณะเขต|คณะสงฆ์)/.test(line)&&!numbered){if(line==='สำนักเรียนส่วนกลาง'){scope.jurisdiction='ส่วนกลาง';school='';}else{school=line;if(line.includes('ส่วนกลาง')||/^คณะ(?:เขต|สงฆ์)/.test(line)||scope.province==='กรุงเทพมหานคร'&&schoolKind(line))scope.jurisdiction='ส่วนกลาง';}ignored++;return;}
 if(scope.jurisdiction==='ส่วนกลาง'&&!numbered&&/^วัด/.test(line)&&values.filter(Boolean).length===1){school=line;ignored++;return;}
 // Metadata is read only outside numbered person rows. Merged section labels are not people.
 const hasPersonFields=!!(val('category')||val('level')||val('lastName')||val('dharmaName'));
 const heading=!numbered&&(/^(บัญชี|รายชื่อ|ในสนามหลวง|พ\.?\s*ศ\.?|ปีการสอบ)/.test(line)||(!hasPersonFields||!mapping.firstName)&&(/^(บัญชี|รายชื่อ|ผลสอบ|ในสนามหลวง|พ\.?\s*ศ\.?|ปีการสอบ|ปี\s*พ\.?\s*ศ|จังหวัด|จ\.|ภาค\s*(ที่\s*)?[\d๐-๙]|นิกาย|คณะ|ฝ่าย|(?:ส่วน)?กลาง\s*[มธ])/.test(line)||/^(นักธรรม|ธรรมศึกษา|น\.?\s*ธ\.?|ธ\.?\s*ศ\.?)/.test(line)||values.filter(Boolean).length===1));
 if(heading){
 const found=scopeFromCells(values);
 if(Object.keys(found).length){
 if(found.region&&found.region!==scope.region){scope.province=defaults.province;school='';}if(found.province&&found.province!=='กรุงเทพมหานคร'&&scope.jurisdiction==='ส่วนกลาง'){scope.jurisdiction='ส่วนภูมิภาค';school='';}
 scope={...scope,...found};
 if(found.category||found.level){school='';if(/บัญชี|ผู้สอบ|รายชื่อ/.test(line)&&found.category)mapping={};}
 if(found.year&&options.year>0&&found.year!==options.year&&!warnings.includes('ปีในไฟล์ไม่ตรงกับปีที่เลือก'))warnings.push('ปีในไฟล์ไม่ตรงกับปีที่เลือก');
 ignored++;return;
 }
 }
 if(!mapping.firstName){ignored++;return;}
 if(values.filter(Boolean).every(v=>/^[\d๐-๙.,\s]+$/.test(v))||/^\d+(\.\d+)?$/.test(digits(val('firstName')))){ignored++;return;}
 if(!val('firstName')&&!numbered){ignored++;return;}
 if(/^(ส่งเข้าสอบ|ขาดสอบ|คงสอบ|สอบได้|สอบตก|รวม|ยอดรวม|รวมทั้งสิ้น|ลำดับ|ที่)$/.test(val('sequence'))){ignored++;return;}
 const rawCategory=val('category'),rawLevel=val('level'),rawProvince=val('province'),rawRegion=val('region'),rawSect=val('sect');
 const rowCodes=[centralCode(rawSect),centralCode(val('jurisdiction')),centralCode(rawRegion)].filter(Boolean),rowCode=rowCodes[0];
 const selectedProvince=rawProvince||scope.province||(options.useSourceProvince?val('sourceProvince'):'');
 const record:PassRecord={id:`${sheet.id}-${rowNumber}`,sheet:sheet.name,row:rowNumber,sequence:val('sequence'),title:val('title'),firstName:val('firstName'),lastName:val('lastName'),dharmaName:val('dharmaName'),category:rawCategory?normalizeCategory(rawCategory)||rawCategory:scope.category,level:rawLevel?normalizeLevel(rawLevel)||rawLevel:normalizeLevel(rawCategory)||scope.level,province:normalizeProvince(selectedProvince)||selectedProvince,year:val('year')?Number(digits(val('year'))):scope.year,region:rawRegion?normalizeRegion(rawRegion)||rawRegion:scope.region,sect:rawSect?normalizeSect(rawSect)||rawSect:scopeFromText(rawRegion).sect||scope.sect,sourceSect:rawSect,temple:val('temple'),district:val('district'),subdistrict:val('subdistrict'),sectReviewed:false,sourceProvince:normalizeProvince(val('sourceProvince'))||val('sourceProvince'),school:val('school')||school,jurisdiction:val('jurisdiction')||scope.jurisdiction||'ส่วนภูมิภาค',schoolKind:val('schoolKind')||schoolKind(val('school')||school),note:val('note'),fingerprint:'',warnings:[],errors:[]};
 const age=examAge(record.year,val('age'),val('birthYear'));Object.assign(record,{birthYear:age.birthYear,ageAtExam:age.ageAtExam,birthYearEstimated:age.birthYearEstimated,ageEstimated:age.ageEstimated});record.warnings.push(...age.warnings);
 const monastic=readVassa(val('vassa'),record.category,record.title,record.ageAtExam);record.vassa=monastic.vassa;record.warnings.push(...monastic.warnings);
 if(!record.province&&record.jurisdiction!=='ส่วนกลาง'){const studyProvince=normalizeProvince(record.school.replace(/^(?:สำนักเรียน\s*)?(?:คณะจังหวัด|จังหวัด)\s*/,''));if(studyProvince&&studyProvince!=='กรุงเทพมหานคร')record.province=studyProvince;}
 if(!val('jurisdiction')&&record.province==='กรุงเทพมหานคร'&&record.school&&record.schoolKind)record.jurisdiction='ส่วนกลาง';
 if(rowCode){record.jurisdiction='ส่วนกลาง';if(!record.province)record.province=rowCode.province;if(!rawSect)record.sect=rowCode.sect;if(centralCode(rawRegion))record.region='';}
 const reference=findCentralSchool(record.school);
 if(reference&&(record.jurisdiction==='ส่วนกลาง'||!record.province&&!val('jurisdiction')&&!scope.jurisdiction)){record.jurisdiction='ส่วนกลาง';record.school=reference.name;record.schoolKind=record.schoolKind||reference.kind;if(!record.province)record.province='กรุงเทพมหานคร';if(!record.sect)record.sect=reference.sect;}
 if(record.jurisdiction==='ส่วนกลาง'){
 record.school=schoolName(record.school);
 if(!reference)record.warnings.push('ไม่พบสำนักเรียนในทะเบียนส่วนกลาง: โปรดตรวจชื่อและนิกายตามต้นฉบับ');
 }
 applyProvinceRegion(record);
 validateRecord(record);
 if(record.jurisdiction==='ส่วนกลาง')record.errors.push(...publicationErrors(record).filter(e=>e.includes('ขัดแย้ง')||e.includes('ต้องอยู่')||!!val('schoolKind')&&e.includes('ชนิดสำนักเรียน')));
 if(rowCode&&(record.sect&&record.sect!==rowCode.sect||rowCodes.some(code=>code?.sect!==rowCode.sect)))record.errors.push('รหัสส่วนกลางขัดแย้งกับนิกายที่ระบุในแถว');
 if(options.year>0&&record.year!==options.year)record.errors.push('ปีในแถวไม่ตรงกับปีที่เลือก');
 if(options.province&&record.province!==normalizeProvince(options.province))record.errors.push('จังหวัดสนามสอบไม่ตรงกับจังหวัดที่เลือก (เลือกอ่านจากไฟล์เมื่อมีหลายจังหวัด)');
 if(seq&&!/^\d+$/.test(seq))record.warnings.push('เลขลำดับไม่ใช่จำนวนเต็ม');
 if(row.values&&Object.values(row.values).some(v=>v&&typeof v==='object'&&('formula'in v||'sharedFormula'in v)))record.warnings.push('แถวมีสูตร Excel: ไม่ใช้ผลลัพธ์จากสูตร');
 if(options.deferSect)deferSectRecord(record);
 record.fingerprint=fingerprint(record);if(seen.has(record.fingerprint))record.warnings.push('ข้อมูลหลักซ้ำภายในไฟล์ (เก็บไว้ตรวจทาน)');seen.add(record.fingerprint);
 records.push(record);if(records.length>MAX_ROWS)throw new Error(`เกิน ${MAX_ROWS.toLocaleString('th-TH')} รายชื่อ กรุณาแบ่งไฟล์`);
 });
 }
 if(!records.length)throw new Error('ไม่พบแถวรายชื่อ กรุณาใช้แม่แบบ หรือมีหัวคอลัมน์ ชื่อ และ นามสกุล');
 const groups:ParsedFile['groups']=[],map=new Map<string,ParsedFile['groups'][number]>();for(const r of records){const k=[r.sect,r.region,r.province,r.category,r.level,r.jurisdiction,r.school].join('|');let g=map.get(k);if(!g){g={province:r.province,region:r.region,sect:r.sect,category:r.category,level:r.level,school:r.school,schoolKind:r.schoolKind,jurisdiction:r.jurisdiction,count:0};groups.push(g);map.set(k,g);}g.count++;}
 const found=records.filter(r=>!r.errors.length).length,declared=totals.length?totals.reduce((a,b)=>a+b,0):null;const reconciliation={declared,found,matches:declared===null?null:declared===found};
 if(reconciliation.matches===false)warnings.push(`ยอดสอบได้ในไฟล์ ${declared} ไม่ตรงกับรายชื่อที่ผ่านเกณฑ์ ${found}`);
 const holds=Array.from(new Set([...warnings,...records.flatMap(r=>[...r.errors,...r.warnings,...publicationErrors(r)])]));
 groups.sort((a,b)=>(a.sect==='มหานิกาย'?0:1)-(b.sect==='มหานิกาย'?0:1)||Number(a.region.replace('ภาค ', '').split('-')[0]||0)-Number(b.region.replace('ภาค ', '').split('-')[0]||0)||a.province.localeCompare(b.province,'th')||CATEGORIES.indexOf(a.category)-CATEGORIES.indexOf(b.category)||LEVELS.indexOf(a.level)-LEVELS.indexOf(b.level)||a.school.localeCompare(b.school,'th'));
 return {records,ignored,warnings,sheets:workbook.worksheets.map(x=>x.name),groups,reconciliation,autoReady:holds.length===0,holds};
}
export async function createTemplate(){return templateBytes();}
