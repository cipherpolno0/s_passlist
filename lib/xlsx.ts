import {CENTRAL_SCHOOLS} from './central-schools';
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { unzipSync,zipSync,strFromU8,strToU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { MAX_SCANNED_ROWS, PROVINCES } from './constants';
type Node=Record<string,unknown>;
const obj=(v:unknown):Node=>v&&typeof v==='object'&&!Array.isArray(v)?v as Node:{};
const list=(v:unknown):unknown[]=>v==null?[]:Array.isArray(v)?v:[v];
function text(v:unknown):string{
 if(v==null)return '';if(typeof v==='string'||typeof v==='number')return String(v);if(Array.isArray(v))return v.map(text).join('');
 const o=obj(v);if('t'in o)return text(o.t);if('r'in o)return text(o.r);return text(o['#text']);
}
const decode=(s:string)=>s.replace(/_x([0-9a-fA-F]{4})_/g,(_,n:string)=>String.fromCharCode(parseInt(n,16)));
function resolve(base:string,target:string){const parts=(target.startsWith('/')?target.slice(1):base+target).split('/'),out:string[]=[];for(const p of parts){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p);}return out.join('/');}
function coordinate(ref:string){const m=ref.replace(/\$/g,'').match(/^([A-Z]+)(\d+)$/i);if(!m)throw new Error('ตำแหน่งเซลล์ Excel ไม่ถูกต้อง');let col=0;for(const c of m[1].toUpperCase())col=col*26+c.charCodeAt(0)-64;const row=Number(m[2]);if(row<1||row>MAX_SCANNED_ROWS||col<1||col>100)throw new Error(`ชีตมีขนาดเกินกำหนด (${MAX_SCANNED_ROWS.toLocaleString('th-TH')} แถว / 100 คอลัมน์)`);return {row,col};}
// Synchronous ZIP/XML parsing avoids async scheduler state surviving between Worker requests.
export function readWorkbook(bytes:Uint8Array,options:{cachedFormulaResults?:boolean}={}){
 const files=unzipSync(bytes,{filter:f=>/\.(?:xml|rels)$/i.test(f.name)});
 const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,trimValues:false,removeNSPrefix:true,processEntities:true,isArray:(name:string)=>['row','c','si','r','sheet','Relationship','mergeCell'].includes(name)});
 function read(path:string){const data=files[path];if(!data)throw new Error('ไม่พบส่วนประกอบ Excel: '+path);const xml=strFromU8(data);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('ไม่รองรับ XML ที่กำหนด DTD หรือ Entity');return obj(parser.parse(xml));}
 function relations(path:string){if(!files[path])return [];return list(obj(read(path).Relationships).Relationship).map(obj).filter(r=>r['@_TargetMode']!=='External');}
 const root=relations('_rels/.rels').find(r=>String(r['@_Type']).endsWith('/officeDocument'));
 const workbookPath=root?resolve('',String(root['@_Target'])):'xl/workbook.xml';
 const slash=workbookPath.lastIndexOf('/'),base=workbookPath.slice(0,slash+1),name=workbookPath.slice(slash+1);
 const rels=relations(base+'_rels/'+name+'.rels');const sheetDefs=list(obj(read(workbookPath).workbook).sheets).flatMap(s=>list(obj(s).sheet)).map(obj);
 if(sheetDefs.length>100)throw new Error('ไฟล์มีจำนวนชีตเกิน 100 ชีต กรุณาแบ่งไฟล์');
 const stringsRel=rels.find(r=>String(r['@_Type']).endsWith('/sharedStrings'));
 const stringsPath=stringsRel?resolve(base,String(stringsRel['@_Target'])):base+'sharedStrings.xml';
 const strings=files[stringsPath]?list(obj(read(stringsPath).sst).si).map(v=>decode(text(v))):[];
 const workbook=new ExcelJS.Workbook();let cells=0;
 for(const def of sheetDefs){
 const rel=rels.find(r=>r['@_Id']===def['@_id']);if(!rel||!String(rel['@_Type']).endsWith('/worksheet'))continue;
 const data=obj(read(resolve(base,String(rel['@_Target']))).worksheet);
 const dimension=obj(data.dimension)['@_ref'];if(dimension){const last=String(dimension).split(':').at(-1);if(last)coordinate(last);}
 const sheet=workbook.addWorksheet(String(def['@_name']||'Sheet'));
 for(const rowValue of list(obj(data.sheetData).row)){
 const row=obj(rowValue);for(const value of list(row.c)){
 if(++cells>4000000)throw new Error('ไฟล์มีจำนวนเซลล์เกินกำหนด กรุณาแบ่งไฟล์');
 const c=obj(value),ref=String(c['@_r']||'');const p=coordinate(ref);const cell=sheet.getCell(p.row,p.col),v=text(c.v),type=String(c['@_t']||'');
 if('f'in c){cell.value={formula:text(c.f)||' ',result:options.cachedFormulaResults&&type!=='e'&&v!==''&&Number.isFinite(Number(v))?Number(v):undefined};continue;}
 if(type==='s'){const i=Number(v);if(!Number.isInteger(i)||i<0||i>=strings.length)throw new Error('ดัชนีข้อความใน Excel ไม่ถูกต้อง');cell.value=strings[i];}
 else if(type==='inlineStr')cell.value=decode(text(c.is));
 else if(type==='e')cell.value={error:v as ExcelJS.ErrorValue};
 else if(type==='b')cell.value=v==='1';
 else if(type==='str'||type==='d')cell.value=decode(v);
 else if(v!=='')cell.value=Number.isFinite(Number(v))?Number(v):decode(v);
 }
 }
 const merges=list(obj(data.mergeCells).mergeCell).map(v=>String(obj(v)['@_ref']||''));if(merges.length>20000)throw new Error('ไฟล์มีเซลล์ผสานเกินกำหนด');
 let mergedArea=0;for(const range of merges){const ends=range.split(':'),a=coordinate(ends[0]),b=coordinate(ends[1]||ends[0]);mergedArea+=(b.row-a.row+1)*(b.col-a.col+1);if(mergedArea>1000000)throw new Error('พื้นที่เซลล์ผสานมีขนาดเกินกำหนด');sheet.mergeCells(range);}
 }
 return workbook;
}
const esc=(v:string)=>v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function letter(index:number){let s='';for(let n=index;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function sheetXml(rows:string[][],extra=''){return declaration+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+extra+'<sheetData>'+rows.map((row,i)=>`<row r="${i+1}">`+row.map((v,j)=>`<c r="${letter(j+1)}${i+1}" t="inlineStr"${i===0?' s="1"':''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>';}
export function templateBytes(){
 const headers=['ลำดับ','คำนำหน้า','ชื่อ','นามสกุล','ฉายา','ประเภท','ระดับ','วัด','เขต/อำเภอ','สำนักเรียน','หมายเหตุ','จังหวัดสนามสอบ','ภาค','นิกาย','ปี พ.ศ.','เขตข้อมูล','ชนิดสำนักเรียน','แขวง/ตำบล','อายุ','ปี พ.ศ. เกิด','พรรษา'];
 const guidance=['แม่แบบรายชื่อผู้สอบได้ ทุกจังหวัด ทุกภาค นักธรรม/ธรรมศึกษา ตรี–โท–เอก มหานิกาย/ธรรมยุต','กรอกชีต รายชื่อผู้สอบได้ เริ่มแถว 2 โดยไม่เปลี่ยนหัวตาราง ไม่ต้องใส่สูตร','ไฟล์เดียวรวมหลายจังหวัด หลายภาค หลายนิกาย และหลายชั้นได้ โดยเลือกจังหวัดในหน้าเว็บเป็น อ่านจากไฟล์','ปี พ.ศ. เลือกในหน้าอัปโหลด ใช้หนึ่งปีต่อไฟล์ หากมีปีในแต่ละแถวต้องตรงกับปีที่เลือก','ประเภท: นักธรรม หรือ ธรรมศึกษา | ระดับ: ตรี โท หรือ เอก','ภาค: เช่น ภาค 1–ภาค 18 หรือภาคที่ระบุตามต้นฉบับ ภาคว่างจะเติมจากตารางจับคู่จังหวัดของผู้ดูแล (กรุงเทพมหานครแยกเป็นส่วนกลาง)','นิกาย: มหานิกาย / ธรรมยุต / กลาง ม. / กลาง ธ. | ชื่อสำนักเรียนส่วนกลางตรงทะเบียนจะเติมนิกายและกรุงเทพมหานครให้ ตรวจชื่อในชีตทะเบียนส่วนกลาง','จังหวัดสนามสอบต้องเป็นหนึ่งใน 77 จังหวัด ส่วนคอลัมน์จังหวัดของบัญชีเก่าคือจังหวัดสังกัด เว้นแต่ผู้ใช้งานยืนยันให้ใช้เป็นจังหวัดสนามสอบ','ค่าที่ระบุในแถวใช้ก่อนหัวข้อ/ชื่อชีต และค่าภาค/นิกายเริ่มต้นใช้เติมเมื่อในไฟล์ไม่มีข้อมูล','หากภาคว่างจะเติมจากตารางจับคู่จังหวัดที่ผู้ดูแลให้ ส่วนกรุงเทพมหานครแยกเป็นส่วนกลาง นิกายยังระบุภายหลังได้','สำนักเรียนส่วนกลาง: เลือกจากรายการคอลัมน์สำนักเรียน ระบบจัดวัด / คณะเขต / คณะสงฆ์ ตามทะเบียนส่วนกลางที่ผู้ดูแลให้มา ไม่อนุมานจากคอลัมน์วัดสังกัด','โหมดอัตโนมัติจะตรวจข้อมูลครบและกระทบยอด ก่อนบันทึกและเผยแพร่ให้ผู้ใช้ทั่วไปสืบค้น','ภาคเริ่มต้นไม่จำเป็นเมื่อมีจังหวัดในตารางจับคู่ ส่วนภาคที่ระบุในไฟล์จะคงเดิมและแจ้งหากต่างจากตาราง','เปิดโหมดนำเข้าไว้ก่อนเพื่อกำหนดนิกายตามวัด ตำบล อำเภอ จังหวัดในหลังบ้านได้ ข้อมูลยังไม่เผยแพร่จนตรวจครบ; ชื่อที่ไม่ตรงทะเบียนหรือข้อมูลขัดแย้งต้องตรวจทาน ชื่อในอดีตต้องเทียบต้นฉบับ | แม่แบบไม่มีข้อมูลบุคคลตัวอย่าง'];
 let first=sheetXml([headers],'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+headers.map((_,i)=>`<col min="${i+1}" max="${i+1}" width="${[10,15,24,24,22,18,12,26,22,30,35,26,20,18,14,24,22,22,14,20,14][i]}" customWidth="1"/>`).join('')+'</cols>');
 const validations=[['F','&quot;นักธรรม,ธรรมศึกษา&quot;'],['G','&quot;ตรี,โท,เอก&quot;'],['J','CentralSchoolList'],['L','ProvinceList'],['N','&quot;มหานิกาย,ธรรมยุต,กลาง ม.,กลาง ธ.&quot;'],['P','&quot;ส่วนกลาง,ส่วนภูมิภาค&quot;'],['Q','&quot;วัด,คณะเขต,คณะสงฆ์&quot;']].map(([col,f])=>`<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${col}2:${col}10001"><formula1>${f}</formula1></dataValidation>`).join('');
 first=first.replace('</worksheet>','<autoFilter ref="A1:R1"/><dataValidations count="7">'+validations+'</dataValidations></worksheet>');
 const contentTypes=declaration+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+[1,2,3,4].map(i=>`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
 const workbook=declaration+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="รายชื่อผู้สอบได้" sheetId="1" r:id="rId1"/><sheet name="คำแนะนำ" sheetId="2" r:id="rId2"/><sheet name="รายการจังหวัด" sheetId="3" state="hidden" r:id="rId3"/><sheet name="ทะเบียนส่วนกลาง" sheetId="4" r:id="rId4"/></sheets><definedNames><definedName name="CentralSchoolList">\'ทะเบียนส่วนกลาง\'!$A$2:$A$'+(CENTRAL_SCHOOLS.length+1)+'</definedName><definedName name="ProvinceList">\'รายการจังหวัด\'!$A$1:$A$77</definedName></definedNames></workbook>';
 const rels=declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+[1,2,3,4].map(i=>`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')+'<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
 const styles=declaration+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="12"/><name val="Sarabun"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="12"/><name val="Sarabun"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF163E35"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
 const contents:Record<string,string>={'[Content_Types].xml':contentTypes,'_rels/.rels':declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>','xl/workbook.xml':workbook,'xl/_rels/workbook.xml.rels':rels,'xl/styles.xml':styles,'xl/worksheets/sheet1.xml':first,'xl/worksheets/sheet2.xml':sheetXml(guidance.map(s=>[s]),'<cols><col min="1" max="1" width="115" customWidth="1"/></cols>'),'xl/worksheets/sheet3.xml':sheetXml(PROVINCES.map(p=>[p])),'xl/worksheets/sheet4.xml':sheetXml([['ชื่อสำนักเรียน','รหัสส่วนกลาง','นิกายอ้างอิง','ชนิดสำนักเรียน'],...CENTRAL_SCHOOLS.map(s=>[s.name,s.code,s.sect,s.kind])],'<cols><col min="1" max="1" width="44" customWidth="1"/><col min="2" max="4" width="22" customWidth="1"/></cols>')};
 return zipSync(Object.fromEntries(Object.entries(contents).map(([k,v])=>[k,strToU8(v)])),{level:6});
}
