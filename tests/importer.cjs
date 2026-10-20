const {test}=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const fs=require('node:fs');
const {parseExcel,createTemplate,checkZip}=require('../.sites-runtime/test-build/excel.js');
const options={province:'กรุงเทพมหานคร',year:2569,category:'',level:''};
async function workbook(rows){const w=new ExcelJS.Workbook();const s=w.addWorksheet('รายชื่อ');for(const row of rows)s.addRow(row);return new Uint8Array(await w.xlsx.writeBuffer());}
const headers=['ลำดับ','คำนำหน้า','ชื่อ','นามสกุล','ประเภท','ระดับ','วัด'];
test('template is downloadable and contains no invented people',async()=>{const b=new Uint8Array(await createTemplate());const w=new ExcelJS.Workbook();await w.xlsx.load(b);assert.equal(w.worksheets[0].getCell('C1').value,'ชื่อ');assert.equal(w.worksheets[0].getCell('C2').value,null);});
test('blank surname, decimal sequence and duplicates remain available for review',async()=>{const p=await parseExcel(await workbook([headers,[1,'พระ','TEST_ก','','นักธรรม','ตรี','วัดทดสอบ'],[1.5,'พระ','TEST_ก','','นักธรรม','ตรี','วัดทดสอบ']]),options);assert.equal(p.records.length,2);assert.equal(p.records.filter(r=>r.errors.length).length,0);assert.ok(p.records[0].warnings.includes('ไม่พบนามสกุล'));assert.ok(p.records[1].warnings.some(w=>w.includes('จำนวนเต็ม')));assert.ok(p.records[1].warnings.some(w=>w.includes('ซ้ำ')));});
test('merged headings and statistics are not names, repeated group headers work',async()=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('รวม');s.addRow(['บัญชีรายชื่อผู้สอบได้นักธรรมชั้น ตรี']);s.addRow(['ที่','คำนำหน้า','ชื่อ','ฉายา','นามสกุล']);s.addRow(['สำนักเรียนวัดทดสอบ']);s.mergeCells('A3:E3');s.addRow([1,'พระ','TEST_หนึ่ง','ทดสอบ','หนึ่ง']);s.addRow(['ส่งเข้าสอบ','ขาดสอบ','คงสอบ','สอบได้']);s.addRow([10,1,9,5]);s.addRow(['บัญชีรายชื่อผู้สอบได้ ธรรมศึกษา ชั้น โท']);s.addRow(['ที่','คำนำหน้า','ชื่อ','นามสกุล']);s.addRow([1,'นาย','TEST_สอง','สอง']);const p=await parseExcel(new Uint8Array(await w.xlsx.writeBuffer()),options);assert.equal(p.records.length,2);assert.equal(p.records[0].school,'วัดทดสอบ');assert.equal(p.records[1].category,'ธรรมศึกษา');assert.equal(p.records[1].level,'โท');assert.equal(p.records[1].lastName,'สอง');});
test('invalid and formula-derived names never become valid records',async()=>{const p=await parseExcel(await workbook([headers,[1,'นาย',{formula:'1+1',result:'TEST_ปลอม'},'หนึ่ง','ธรรมศึกษา','ตรี'],[2,'นาย','TEST_สาม','สาม','ไม่ถูกต้อง','ไม่ถูกต้อง']]),options);assert.equal(p.records.length,2);assert.ok(p.records[0].errors.includes('ไม่พบชื่อ'));assert.equal(p.records[1].errors.length,2);});
test('row province/year mismatches are errors',async()=>{const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','ปี พ.ศ.','จังหวัดสนามสอบ'],['TEST_หนึ่ง','หนึ่ง','นักธรรม','ตรี',2568,'เชียงใหม่']]),options);assert.equal(p.records[0].errors.length,2);});
test('file-level BE mismatch is reported',async()=>{const p=await parseExcel(await workbook([['พ.ศ. 2568'],headers,[1,'นาย','TEST_หนึ่ง','หนึ่ง','ธรรมศึกษา','เอก']]),options);assert.ok(p.warnings.some(x=>x.includes('ปีในไฟล์')));});
test('invalid XLSX container is rejected',()=>assert.throws(()=>checkZip(new Uint8Array([1,2,3]))));
if(process.env.PASSLIST_REFERENCE)test('historical workbook reconciles to 9,589 names in six groups',async()=>{const p=await parseExcel(new Uint8Array(fs.readFileSync(process.env.PASSLIST_REFERENCE)),{...options,year:2540});assert.equal(p.records.length,9599);const counts=['นักธรรม','ธรรมศึกษา'].flatMap(c=>['ตรี','โท','เอก'].map(l=>p.records.filter(r=>r.category===c&&r.level===l).length));assert.deepEqual(counts,[980,787,512,5123,1547,650]);assert.equal(p.records.filter(r=>r.warnings.some(w=>w.includes('จำนวนเต็ม'))).length,8);assert.equal(p.records.filter(r=>r.errors.length).length,10);assert.equal(p.records.filter(r=>!r.errors.length).length,9589);console.log('Historical reconciliation:',JSON.stringify({declared:p.reconciliation.declared,found:p.reconciliation.found,groups:p.groups.length}));});
const {PROVINCES,REGIONS}=require('../.sites-runtime/test-build/constants.js');
test('all 77 provinces, all 18 numbered regions, all six categories/levels and both sects can share one file',async()=>{
 const rows=[['ลำดับ','ชื่อ','นามสกุล','จังหวัดสนามสอบ','ภาค','นิกาย','ประเภท','ระดับ']];let n=0;
 for(let i=0;i<PROVINCES.length;i++)for(const sect of ['มหานิกาย','ธรรมยุต'])for(const category of ['นักธรรม','ธรรมศึกษา'])for(const level of ['ตรี','โท','เอก'])rows.push([++n,`TEST_${n}`,'ทดสอบ',PROVINCES[i],`ภาค ${i%18+1}`,sect,category,level]);
 const p=await parseExcel(await workbook(rows),{...options,province:''});
 assert.equal(p.records.length,77*12);assert.equal(p.records.filter(r=>r.errors.length).length,0);assert.equal(new Set(p.records.map(r=>r.province)).size,77);assert.equal(new Set(p.records.map(r=>r.region)).size,18);assert.equal(new Set(p.records.map(r=>r.sect)).size,2);assert.equal(new Set(p.records.map(r=>r.category+r.level)).size,6);
});
test('scope is read from headings with Thai digits, compound regions and sect changes',async()=>{
 const w=new ExcelJS.Workbook();const s=w.addWorksheet('รวม');
 s.addRow(['บัญชีผู้สอบได้ นักธรรม ชั้น ตรี']);s.addRow(['จังหวัดเชียงใหม่ ภาค ๔-๕-๖-๗ (ธ.)']);s.addRow(['ที่','ชื่อ','นามสกุล']);s.addRow([1,'TEST_หนึ่ง','หนึ่ง']);
 s.addRow(['จังหวัด จันทบุรี ภาค ๑๓ มหานิกาย']);s.addRow([2,'TEST_สอง','สอง']);
 const p=await parseExcel(new Uint8Array(await w.xlsx.writeBuffer()),{...options,province:''});
 assert.equal(p.records.length,2);assert.equal(p.records[0].region,'ภาค 4-5-6-7');assert.equal(p.records[0].sect,'ธรรมยุต');assert.equal(p.records[0].province,'เชียงใหม่');assert.equal(p.records[1].province,'จันทบุรี');assert.equal(p.records[1].region,'ภาค 13');assert.equal(p.records[1].sect,'มหานิกาย');assert.equal(p.records.filter(r=>r.errors.length).length,0);
});
test('worksheet scope resets, explicit row scope wins, and missing sect is never guessed',async()=>{
 const w=new ExcelJS.Workbook();const a=w.addWorksheet('ธ.ศ.โท เชียงใหม่ (ธ.) ภาค 7');a.addRow(['ชื่อ','นามสกุล','จังหวัดสนามสอบ','ภาค','นิกาย']);a.addRow(['TEST_หนึ่ง','หนึ่ง','กระบี่','ภาค 18','มหานิกาย']);
 const b=w.addWorksheet('นักธรรม เอก นนทบุรี ภาค 1');b.addRow(['ชื่อ','นามสกุล']);b.addRow(['TEST_สอง','สอง']);
 const p=await parseExcel(new Uint8Array(await w.xlsx.writeBuffer()),{...options,province:''});
 assert.equal(p.records.length,2);assert.equal(p.records[0].province,'กระบี่');assert.equal(p.records[0].sect,'มหานิกาย');assert.equal(p.records[0].region,'ภาค 18');assert.equal(p.records[1].sect,'');assert.equal(p.records[1].province,'นนทบุรี');assert.ok(p.records[1].warnings.some(w=>w.includes('ไม่ระบุนิกาย')));assert.equal(p.records[1].level,'เอก');
});
test('legacy province column is used as exam province only after explicit opt-in',async()=>{
 const bytes=await workbook([['ชื่อ','นามสกุล','จังหวัด','ประเภท','ระดับ'],['TEST_หนึ่ง','หนึ่ง','จ.เชียงราย','ธ.ศ.','ตรี']]);
 const no=await parseExcel(bytes,{...options,province:''});assert.ok(no.records[0].errors.some(e=>e.includes('จังหวัดสนามสอบ')));
 const yes=await parseExcel(bytes,{...options,province:'',useSourceProvince:true});assert.equal(yes.records[0].province,'เชียงราย');assert.equal(yes.records[0].sourceProvince,'เชียงราย');assert.equal(yes.records[0].errors.length,0);
});
test('sect aliases and malformed scope cannot be silently reassigned',async()=>{
 const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','ภาค','นิกาย'],['TEST_หนึ่ง','หนึ่ง','น.ธ.','โท','๑๘','ธรรมยุติกนิกาย'],['TEST_สอง','สอง','ธ.ศ.','ตรี','ภาค 19','อื่น']]),{...options,region:'ภาค 1',sect:'มหานิกาย'});
 assert.equal(p.records[0].region,'ภาค 18');assert.equal(p.records[0].sect,'ธรรมยุต');assert.equal(p.records[0].category,'นักธรรม');assert.equal(p.records[1].errors.length,2);
});
test('same core person under different sects is retained as separate scope without a duplicate warning',async()=>{
 const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','นิกาย'],['TEST_หนึ่ง','หนึ่ง','นักธรรม','ตรี','มหานิกาย'],['TEST_หนึ่ง','หนึ่ง','นักธรรม','ตรี','ธรรมยุต']]),options);
 assert.equal(p.records.length,2);assert.notEqual(p.records[0].fingerprint,p.records[1].fingerprint);assert.equal(p.records.some(r=>r.warnings.some(w=>w.includes('ซ้ำ'))),false);
});
test('a region cell may carry an explicit sect suffix without losing the region',async()=>{
 const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','ภาค'],['TEST_รวม','ทดสอบ','นักธรรม','ตรี','ภาค ๔-๕-๖-๗ (ธ.)']]),options);
 assert.equal(p.records[0].region,'ภาค 4-5-6-7');assert.equal(p.records[0].sect,'ธรรมยุต');assert.equal(p.records[0].errors.length,0);
});
test('inline strings and rich text preserve Thai, XML entities, and zero-prefixed text',async()=>{
 const {zipSync,unzipSync,strToU8,strFromU8}=require('fflate');const files=unzipSync(new Uint8Array(await createTemplate()));
 let xml=strFromU8(files['xl/worksheets/sheet1.xml']);xml=xml.replace('</sheetData>','<row r="2"><c r="C2" t="inlineStr"><is><r><t>TEST_ก</t></r><r><t>&amp;ข</t></r></is></c><c r="D2" t="inlineStr"><is><t>001</t></is></c><c r="F2" t="inlineStr"><is><t>ธรรมศึกษา</t></is></c><c r="G2" t="inlineStr"><is><t>ตรี</t></is></c><c r="L2" t="inlineStr"><is><t>กรุงเทพฯ</t></is></c><c r="M2" t="inlineStr"><is><t>ภาค ๑</t></is></c><c r="N2" t="inlineStr"><is><t>ม.</t></is></c></row></sheetData>');files['xl/worksheets/sheet1.xml']=strToU8(xml);
 const p=await parseExcel(zipSync(files),{...options,province:''});assert.equal(p.records[0].firstName,'TEST_ก&ข');assert.equal(p.records[0].lastName,'001');assert.equal(p.records[0].province,'กรุงเทพมหานคร');assert.equal(p.records[0].sect,'มหานิกาย');assert.equal(p.records[0].errors.length,0);
});
test('XLSX XML with a DTD is rejected before entity expansion',async()=>{
 const {zipSync,unzipSync,strToU8,strFromU8}=require('fflate');const files=unzipSync(new Uint8Array(await createTemplate()));files['xl/workbook.xml']=strToU8(strFromU8(files['xl/workbook.xml']).replace('<workbook','<!DOCTYPE workbook [<!ENTITY x "test">]><workbook'));
 await assert.rejects(parseExcel(zipSync(files),options),/DTD/);
});
test('the photographed split-cell headings detect category, level, province, bare region, year, and declared totals',async()=>{
 const w=new ExcelJS.Workbook();
 for(const [category,level,province]of [['นักธรรม','ตรี','พิษณุโลก'],['ธรรมศึกษา','เอก','ตาก']]){
 const s=w.addWorksheet(category);s.addRow(['บัญชีรายชื่อผู้สอบได้','',category,level]);s.addRow(['ในสนามหลวง','',province,5]);s.addRow(['พ.ศ.','',2542]);s.addRow(['ส่งเข้าสอบ','ขาดสอบ','คงสอบ','สอบได้','สอบตก']);s.addRow([2,0,2,2,0]);s.addRow(['ที่','คำนำหน้า','ชื่อ','ฉายา','นามสกุล','วัด','จังหวัด']);s.addRow([1,'พระ','TEST_หนึ่ง','','หนึ่ง','ทดสอบ',province]);s.addRow([2,'สามเณร','TEST_สอง','','สอง','ทดสอบ',province]);}
 const p=await parseExcel(new Uint8Array(await w.xlsx.writeBuffer()),{...options,year:0,province:'',sect:'มหานิกาย'});
 assert.equal(p.records.length,4);assert.equal(p.records[0].region,'ภาค 5');assert.equal(p.records[0].province,'พิษณุโลก');assert.equal(p.records[0].year,2542);assert.equal(p.records[2].category,'ธรรมศึกษา');assert.equal(p.records[2].level,'เอก');assert.equal(p.records[2].province,'ตาก');assert.deepEqual(p.reconciliation,{declared:4,found:4,matches:true});assert.equal(p.autoReady,true);
});
test('central temple and district council school headings are classified without inventing a region or province',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('นักธรรม ตรี');s.addRow(['พ.ศ.',2569]);s.addRow(['สำนักเรียนส่วนกลาง']);s.addRow(['สำนักเรียนวัดบวรนิเวศวิหาร']);s.addRow(['ที่','ชื่อ','นามสกุล']);s.addRow([1,'TEST_วัด','ทดสอบ']);s.addRow(['คณะเขตลาดกระบัง']);s.addRow([2,'TEST_คณะ','ทดสอบ']);
 const p=await parseExcel(new Uint8Array(await w.xlsx.writeBuffer()),{...options,year:0,province:''});assert.equal(p.records.length,2);assert.equal(p.records[0].jurisdiction,'ส่วนกลาง');assert.equal(p.records[0].schoolKind,'วัด');assert.equal(p.records[1].schoolKind,'คณะเขต');assert.equal(p.records[0].province,'กรุงเทพมหานคร');assert.equal(p.records[0].region,'');assert.equal(p.records[0].sect,'ธรรมยุต');assert.equal(p.records[1].sect,'มหานิกาย');assert.equal(p.autoReady,true);
});
test('automatic import is held for a missing sect or a mismatched declared pass count',async()=>{
 const bytes=await workbook([['นักธรรม ชั้นตรี'],['ในสนามหลวง','พิษณุโลก',5],['พ.ศ.',2569],['ส่งเข้าสอบ','ขาดสอบ','คงสอบ','สอบได้','สอบตก'],[3,0,3,3,0],['ที่','ชื่อ','นามสกุล'],[1,'TEST_หนึ่ง','หนึ่ง']]);
 const p=await parseExcel(bytes,{...options,province:'',year:0});assert.equal(p.records[0].sect,'');assert.equal(p.reconciliation.matches,false);assert.equal(p.autoReady,false);assert.ok(p.holds.some(h=>h.includes('นิกาย')));assert.ok(p.holds.some(h=>h.includes('ยอดสอบได้')));
});
test('a heading naming both sects does not assign either sect automatically',async()=>{
 const p=await parseExcel(await workbook([['นิกาย มหานิกาย ธรรมยุต'],['นักธรรม ชั้นตรี'],headers,[1,'พระ','TEST_สองนิกาย','ทดสอบ','นักธรรม','ตรี']]),{...options,region:'ภาค 1'});
 assert.equal(p.autoReady,false);assert.equal(['มหานิกาย','ธรรมยุต'].includes(p.records[0].sect),false);
});
const {CENTRAL_SCHOOLS,findCentralSchool}=require('../.sites-runtime/test-build/central-schools.js');
const {publicationErrors}=require('../.sites-runtime/test-build/classification.js');
test('owner directory retains every exact name and sect including two special councils',()=>{
 assert.equal(CENTRAL_SCHOOLS.length,116);assert.equal(new Set(CENTRAL_SCHOOLS.map(s=>s.name)).size,116);
 assert.equal(findCentralSchool('สำนักเรียนวัดมหาธาตุ').sect,'มหานิกาย');assert.equal(findCentralSchool('คณะเขตคลองเตย – วัฒนา').name,'คณะเขตคลองเตย-วัฒนา');
 assert.equal(findCentralSchool('วัดมหาธาต'),undefined);
 for(const name of ['คณะสงฆ์จีนนิกาย','คณะสงฆ์อนัมนิกาย'])assert.deepEqual([findCentralSchool(name).sect,findCentralSchool(name).kind],['มหานิกาย','คณะสงฆ์']);
});
test('all directory schools infer central Bangkok and the registered sect per row, across six exam groups',async()=>{
 const rows=[['ชื่อ','นามสกุล','ประเภท','ระดับ','สำนักเรียน']];for(const school of CENTRAL_SCHOOLS)for(const c of ['นักธรรม','ธรรมศึกษา'])for(const l of ['ตรี','โท','เอก'])rows.push([`TEST_${rows.length}`,'ทดสอบ',c,l,school.name]);
 const p=await parseExcel(await workbook(rows),{...options,province:''});assert.equal(p.records.length,696);assert.equal(p.autoReady,true);
 for(const r of p.records){const s=findCentralSchool(r.school);assert.equal(r.sect,s.sect);assert.equal(r.schoolKind,s.kind);assert.equal(r.province,'กรุงเทพมหานคร');assert.equal(r.jurisdiction,'ส่วนกลาง');}
});
test('central short codes work in rows, headings, and sheet names',async()=>{
 for(const code of ['กลาง ม.','กลาง ธ.']){
 const school=code==='กลาง ม.'?'วัดมหาธาตุ':'วัดบวรนิเวศวิหาร';
 const p=await parseExcel(await workbook([['นักธรรม ตรี'],[code],['ชื่อ','นามสกุล','สำนักเรียน'],['TEST_รหัส','ทดสอบ',school]]),{...options,province:''});assert.equal(p.autoReady,true);assert.equal(p.records[0].sect,findCentralSchool(school).sect);
 const r=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','นิกาย','สำนักเรียน'],['TEST_แถว','ทดสอบ','ธรรมศึกษา','เอก',code,school]]),{...options,province:''});assert.equal(r.autoReady,true);assert.equal(r.records[0].jurisdiction,'ส่วนกลาง');
 const w=new ExcelJS.Workbook(),s=w.addWorksheet(code+' นักธรรมตรี');s.addRow(['ชื่อ','นามสกุล','สำนักเรียน']);s.addRow(['TEST_ชีต','ทดสอบ',school]);assert.equal((await parseExcel(new Uint8Array(await w.xlsx.writeBuffer()),{...options,province:''})).autoReady,true);
 }
});
test('photographed Bangkok temple and council headings keep student temple affiliations separate',async()=>{
 const rows=[['บัญชีรายชื่อผู้สอบได้','นักธรรม','ตรี'],['ในสนามหลวง','กรุงเทพมหานคร',1],['พ.ศ.',2541],['ที่','คำนำหน้า','ชื่อ','ฉายา','นามสกุล','วัด','อำเภอ','จังหวัด'],['สำนักเรียนวัดมหาธาตุ'],[1,'พระ','TEST_วัด','ฉายา','ทดสอบ','สังฆราชา','ลาดกระบัง','กรุงเทพมหานคร'],['สำนักเรียนคณะเขตลาดกระบัง'],[688,'พระ','TEST_คณะ','ฉายา','ทดสอบ','บำรุงรื่น','ลาดกระบัง','กรุงเทพมหานคร']];
 const p=await parseExcel(await workbook(rows),{...options,province:'',year:0});assert.equal(p.records.length,2);assert.equal(p.autoReady,true);assert.equal(p.records[0].school,'วัดมหาธาตุ');assert.equal(p.records[0].temple,'สังฆราชา');assert.equal(p.records[1].school,'คณะเขตลาดกระบัง');assert.equal(p.records[1].temple,'บำรุงรื่น');assert.equal(p.records[1].year,2541);
});
test('sect, province and institution-kind conflicts are held without replacing explicit evidence',async()=>{
 const rows=[['ชื่อ','นามสกุล','ประเภท','ระดับ','นิกาย','จังหวัดสนามสอบ','เขตข้อมูล','สำนักเรียน','ชนิดสำนักเรียน'],['TEST_นิกาย','ทดสอบ','นักธรรม','ตรี','ธรรมยุต','กรุงเทพมหานคร','ส่วนกลาง','วัดมหาธาตุ','วัด'],['TEST_จังหวัด','ทดสอบ','นักธรรม','ตรี','มหานิกาย','เชียงใหม่','ส่วนกลาง','วัดมหาธาตุ','วัด'],['TEST_ชนิด','ทดสอบ','ธรรมศึกษา','เอก','มหานิกาย','กรุงเทพมหานคร','ส่วนกลาง','วัดมหาธาตุ','คณะเขต']];
 const p=await parseExcel(await workbook(rows),{...options,province:''});assert.equal(p.autoReady,false);assert.equal(p.records[0].sect,'ธรรมยุต');assert.ok(p.records.every(r=>r.errors.length));assert.ok(publicationErrors(p.records[0]).some(e=>e.includes('ขัดแย้ง')));
});
test('unknown historical school is retained for review, and affiliation alone cannot infer central sect',async()=>{
 const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','นิกาย','สำนักเรียน','เขตข้อมูล'],['TEST_เก่า','ทดสอบ','นักธรรม','ตรี','มหานิกาย','วัดชื่อในอดีต','ส่วนกลาง']]),options);assert.equal(p.records[0].school,'วัดชื่อในอดีต');assert.equal(p.records[0].errors.length,0);assert.equal(p.autoReady,false);assert.ok(p.holds.some(s=>s.includes('ทะเบียนส่วนกลาง')));
 const r=await parseExcel(await workbook([headers,[1,'พระ','TEST_สังกัด','ทดสอบ','นักธรรม','ตรี','วัดบวรนิเวศวิหาร']]),options);assert.equal(r.records[0].sect,'');assert.equal(r.records[0].school,'');assert.equal(r.records[0].jurisdiction,'ส่วนภูมิภาค');
});
test('template central reference and dropdown are populated and never import as persons',async()=>{
 const w=new ExcelJS.Workbook();await w.xlsx.load(await createTemplate());assert.equal(w.getWorksheet('ทะเบียนส่วนกลาง').rowCount,117);assert.ok(w.definedNames.model.some(n=>n.name==='CentralSchoolList'));assert.equal(w.worksheets[0].getCell('J2').dataValidation.formulae[0],'CentralSchoolList');w.worksheets[0].addRow([1,'นาย','TEST_แม่แบบ','ทดสอบ','','ธรรมศึกษา','ตรี','','','วัดมหาธาตุ','','','','',2569]);const p=await parseExcel(new Uint8Array(await w.xlsx.writeBuffer()),{...options,province:'',year:0});assert.equal(p.records.length,1);assert.equal(p.autoReady,true);
});

test('explicit regional context is retained, conflicting central codes are held',async()=>{
 const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','เขตข้อมูล','สำนักเรียน'],['TEST_ภูมิภาค','ทดสอบ','นักธรรม','ตรี','ส่วนภูมิภาค','วัดมหาธาตุ']]),{...options,province:''});assert.equal(p.records[0].jurisdiction,'ส่วนภูมิภาค');assert.equal(p.records[0].province,'');assert.equal(p.records[0].sect,'');assert.equal(p.autoReady,false);
 const r=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','นิกาย','ภาค','สำนักเรียน'],['TEST_รหัสขัดกัน','ทดสอบ','นักธรรม','ตรี','กลาง ม.','กลาง ธ.','วัดมหาธาตุ']]),{...options,province:''});assert.equal(r.autoReady,false);assert.ok(r.records[0].errors.some(e=>e.includes('รหัสส่วนกลางขัดแย้ง')));
});
test('deferred sect mode imports mixed and ambiguous affiliations without dropping valid names',async()=>{
 const rows=[['ชื่อ','นามสกุล','ประเภท','ระดับ','นิกาย','ปี พ.ศ.','จังหวัดสนามสอบ','ภาค','วัด','ตำบล','อำเภอ'],['TEST_ม','ทดสอบ','นักธรรม','ตรี','มหานิกาย',2569,'เชียงใหม่','ภาค 7','วัดร่วมชื่อ','ตำบลหนึ่ง','อำเภอหนึ่ง'],['TEST_ธ','ทดสอบ','ธรรมศึกษา','โท','ธรรมยุต',2569,'เชียงใหม่','ภาค 7','วัดร่วมชื่อ','ตำบลสอง','อำเภอหนึ่ง'],['TEST_ว่าง','ทดสอบ','ธรรมศึกษา','เอก','',2569,'เชียงใหม่','ภาค 7','วัดร่วมชื่อ','ตำบลหนึ่ง','อำเภอหนึ่ง'],['TEST_รวม','ทดสอบ','นักธรรม','โท','มหานิกาย ธรรมยุต',2569,'เชียงใหม่','ภาค 7','วัดร่วมชื่อ','ตำบลหนึ่ง','อำเภอหนึ่ง'],['','ทดสอบ','นักธรรม','ตรี','อื่น',2569,'เชียงใหม่','ภาค 7','วัดร่วมชื่อ','ตำบลหนึ่ง','อำเภอหนึ่ง']];
 const p=await parseExcel(await workbook(rows.map((r,i)=>i===0?['ที่',...r]:[i,...r])),{...options,province:'',deferSect:true});assert.equal(p.records.length,5);assert.deepEqual(p.records.map(r=>r.sect),['มหานิกาย','ธรรมยุต','','','']);assert.equal(p.records.filter(r=>r.errors.length).length,1);assert.deepEqual(p.records[4].errors,['ไม่พบชื่อ']);assert.equal(p.records[0].subdistrict,'ตำบลหนึ่ง');assert.equal(p.records[1].subdistrict,'ตำบลสอง');assert.ok(p.records[3].warnings.some(w=>w.includes('รอตรวจนิกาย')));assert.equal(p.records.every(r=>r.sectReviewed===false),true);
});
test('deferred central sect conflicts become pending review; admin confirmation can override a reference',async()=>{
 const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','นิกาย','สำนักเรียน','เขตข้อมูล'],['TEST_ตรวจหลัง','ทดสอบ','นักธรรม','ตรี','มหานิกาย','วัดบวรนิเวศวิหาร','ส่วนกลาง']]),{...options,deferSect:true});assert.equal(p.records[0].errors.length,0);assert.equal(p.records[0].sect,'');assert.ok(p.records[0].warnings.some(w=>w.includes('ขัดแย้ง')));
 assert.ok(publicationErrors({...p.records[0],sect:'มหานิกาย'}).some(e=>e.includes('ขัดแย้ง')));assert.equal(publicationErrors({...p.records[0],sect:'มหานิกาย',sectReviewed:true}).length,0);
});

const {PROVINCE_ABBREVIATIONS}=require('../.sites-runtime/test-build/province-abbreviations.js');
const {normalizeProvince,scopeFromText}=require('../.sites-runtime/test-build/scope.js');
test('77 province abbreviations normalize full names, dotted abbreviations, and explicit headings',()=>{
 assert.equal(Object.keys(PROVINCE_ABBREVIATIONS).length,77);
 assert.deepEqual(Object.keys(PROVINCE_ABBREVIATIONS).sort(),[...PROVINCES].sort());
 assert.equal(new Set(Object.values(PROVINCE_ABBREVIATIONS)).size,77);
 for(const province of PROVINCES){const code=PROVINCE_ABBREVIATIONS[province];for(const text of [province,code,code.split('').join('.')+'.','จ.'+code,'จังหวัด '+code,'จว. '+code])assert.equal(normalizeProvince(text),province,text);assert.equal(scopeFromText('จังหวัดสนามสอบ '+code).province,province);}
 assert.equal(scopeFromText('จังหวัด นธ').category,undefined);assert.equal(scopeFromText('จังหวัด นธ').province,'นราธิวาส');
 assert.equal(normalizeProvince('พล'),'พิษณุโลก');assert.equal(normalizeProvince('กท'),'กรุงเทพมหานคร');assert.equal(normalizeProvince('นธ'),'นราธิวาส');
 assert.equal(normalizeProvince('ไม่มีรหัส'),'');assert.equal(normalizeProvince('constructor'),'');
 assert.equal(scopeFromText('นธ').category,'นักธรรม');assert.equal(scopeFromText('นธ').province,undefined);
});
test('Excel abbreviation fields normalize both exam and affiliation provinces without changing names',async()=>{
 const rows=[['ชื่อ','นามสกุล','ประเภท','ระดับ','จังหวัดสนามสอบ','จังหวัด']];
 for(const province of PROVINCES)rows.push(['TEST_นธ','พล','ธรรมศึกษา','ตรี',PROVINCE_ABBREVIATIONS[province],PROVINCE_ABBREVIATIONS[province]]);
 const p=await parseExcel(await workbook(rows),{...options,province:''});assert.equal(p.records.length,77);
 for(let i=0;i<77;i++){const r=p.records[i];assert.equal(r.province,PROVINCES[i]);assert.equal(r.sourceProvince,PROVINCES[i]);assert.equal(r.firstName,'TEST_นธ');assert.equal(r.lastName,'พล');assert.equal(r.category,'ธรรมศึกษา');assert.equal(r.errors.length,0);}
});

const {examAge}=require('../.sites-runtime/test-build/exam-age.js');
test('age refers to exam year, with explicit estimates and no invented values',()=>{
 assert.deepEqual(examAge(2568,'๔๐',''),{birthYear:2528,ageAtExam:40,birthYearEstimated:true,ageEstimated:false,warnings:[]});
 assert.deepEqual(examAge(2542,'','พ.ศ. 2500'),{birthYear:2500,ageAtExam:42,birthYearEstimated:false,ageEstimated:true,warnings:[]});
 assert.equal(examAge(2568,'39','2528').warnings.length,0);
 assert.equal(examAge(2568,'40','2500').birthYear,null);
 for(const age of ['-2','121','25.5','ไม่ทราบ'])assert.ok(examAge(2568,age,'').warnings.length);
 for(const age of ['','ไม่ระบุ','-'])assert.equal(examAge(2568,age,'').warnings.length,0);
 assert.equal(examAge(2568,'0','').ageAtExam,0);
 assert.equal(examAge(2568,'','').birthYear,null);
});
test('Excel age and birth year columns are separate from ordination years and exam year',async()=>{
 const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','ปี พ.ศ.','อายุ','พรรษา','ปี พ.ศ. เกิด'],['TEST_อายุ','ทดสอบ','นักธรรม','ตรี',2569,'๔๐',20,''],['TEST_ปีเกิด','ทดสอบ','ธรรมศึกษา','โท',2569,'','',2500],['TEST_ไม่มี','ทดสอบ','นักธรรม','เอก',2569,'',12,''],['TEST_ไม่ระบุ','ทดสอบ','นักธรรม','เอก',2569,'ไม่ระบุ','ไม่ระบุ','ไม่ระบุ']]),options);
 assert.equal(p.records[0].birthYear,2529);assert.equal(p.records[0].ageAtExam,40);assert.equal(p.records[1].ageAtExam,69);assert.equal(p.records[2].ageAtExam,null);assert.equal(p.records[2].birthYear,null);assert.equal(p.records[3].ageAtExam,null);assert.equal(p.records[3].birthYear,null);assert.equal(p.records[3].vassa,null);assert.ok(!p.records[3].warnings.some(w=>/อายุ|พรรษา|ปี พ\.ศ\. เกิด/.test(w)));
});
const {readVassa}=require('../.sites-runtime/test-build/vassa.js');
test('vassa is reported explicitly, separate from age, for monks and preserves zero',()=>{
 assert.equal(readVassa('๒๐ พรรษา','นักธรรม','พระ',40).vassa,20);
 assert.equal(readVassa('0','นักธรรม','พระมหา',20).vassa,0);
 assert.equal(readVassa('12','นักธรรม','สามเณร',17).vassa,null);
 assert.equal(readVassa('12','ธรรมศึกษา','นาย',40).vassa,null);
 assert.equal(readVassa('','นักธรรม','พระ',40).vassa,null);
 for(const value of ['','ไม่ระบุ','-']){assert.equal(readVassa(value,'นักธรรม','พระ',40).vassa,null);assert.equal(readVassa(value,'นักธรรม','พระ',40).warnings.length,0);}
 for(const value of ['-1','2.5','121','ไม่ทราบ'])assert.ok(readVassa(value,'นักธรรม','พระ',40).warnings.length);
 assert.ok(readVassa('41','นักธรรม','พระ',40).warnings.length);
});
test('mixed Excel reads age and vassa independently, with novices and lay candidates excluded',async()=>{
 const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','คำนำหน้า','ประเภท','ระดับ','อายุ','อายุพรรษา'],['TEST_MONK','ระบบ','พระ','นักธรรม','ตรี',40,'๑๒'],['TEST_NOVICE','ระบบ','สามเณร','นักธรรม','ตรี',17,2],['TEST_LAY','ระบบ','นาย','ธรรมศึกษา','ตรี',40,20],['TEST_ZERO','ระบบ','พระ','นักธรรม','ตรี',20,0]]),options);
 assert.deepEqual(p.records.map(r=>r.vassa),[12,null,null,0]);assert.deepEqual(p.records.map(r=>r.ageAtExam),[40,17,40,20]);
});

const {certificateNumber}=require('../.sites-runtime/test-build/certificate-number.js');
const {thaiWorkbookCopy}=require('../.sites-runtime/test-build/thai-workbook.js');
test('certificate uses original Thai or Arabic sequence and exam province/year without inventing missing numbers',()=>{
 assert.equal(certificateNumber({province:'พิษณุโลก',year:2542,sequence:'1'}),'พล ๑/๒๕๔๒');
 assert.equal(certificateNumber({province:'พล',year:2542,sequence:'๐๐๕'}),'พล ๐๐๕/๒๕๔๒');
 assert.equal(certificateNumber({province:'กรุงเทพมหานคร',year:2569,sequence:'12'}),'กท ๑๒/๒๕๖๙');
 assert.equal(certificateNumber({province:'พิษณุโลก',year:2542,sequence:''}),'ไม่ระบุ');
});
test('Thai Excel copy converts cell values and cached totals while preserving original source and workbook structure',async()=>{
 const w=new ExcelJS.Workbook(),sheet=w.addWorksheet('ผลสอบ');sheet.addRow(['ลำดับ','ชื่อ','ปี พ.ศ.','อายุ','พรรษา']);sheet.addRow([1,'ทดสอบ & เลข 2',2542,40,12]);sheet.getCell('F2').value={formula:'1+2',result:3};
 const source=new Uint8Array(await w.xlsx.writeBuffer()),before=Buffer.from(source).toString('base64'),copy=thaiWorkbookCopy(source),converted=new ExcelJS.Workbook();await converted.xlsx.load(copy);
 assert.equal(Buffer.from(source).toString('base64'),before);assert.equal(converted.worksheets.length,1);assert.equal(converted.worksheets[0].getCell('A2').value,'๑');assert.equal(converted.worksheets[0].getCell('B2').value,'ทดสอบ & เลข ๒');assert.equal(converted.worksheets[0].getCell('C2').value,'๒๕๔๒');assert.equal(converted.worksheets[0].getCell('F2').value,'๓');
});
const {REGION_PROVINCES,PROVINCE_REGION,regionForProvince}=require('../.sites-runtime/test-build/province-regions.js');
test('administrator region table covers exactly 76 unique provinces and 18 regions; Bangkok is separate',()=>{
 const listed=Object.values(REGION_PROVINCES).flat();assert.equal(Object.keys(REGION_PROVINCES).length,18);assert.equal(listed.length,76);assert.equal(new Set(listed).size,76);assert.deepEqual([...listed].sort(),PROVINCES.filter(p=>p!=='กรุงเทพมหานคร').sort());
 assert.equal(regionForProvince('พล'),'ภาค 5');assert.equal(regionForProvince('กระบี่'),'ภาค 17');assert.equal(regionForProvince('นราธิวาส'),'ภาค 18');assert.equal(regionForProvince('กรุงเทพมหานคร'),'');
});
test('all mapped provinces fill missing regions in Excel using the exam/study province',async()=>{
 const rows=[['ลำดับ','ชื่อ','นามสกุล','ประเภท','ระดับ','จังหวัดสนามสอบ','จังหวัด','นิกาย']];let n=0;
 for(const [province]of Object.entries(PROVINCE_REGION))rows.push([++n,'TEST_REGION_'+n,'ระบบ','นักธรรม','ตรี',province,province==='พิษณุโลก'?'เชียงใหม่':'พิษณุโลก','มหานิกาย']);
 const p=await parseExcel(await workbook(rows),{...options,province:''});assert.equal(p.records.length,76);assert.equal(p.autoReady,true);for(const r of p.records){assert.equal(r.region,PROVINCE_REGION[r.province]);assert.equal(r.errors.length,0);assert.ok(!r.warnings.some(w=>w.includes('ไม่ระบุภาค')));}
});
test('explicit and compound regions remain unchanged, mismatches warn, central and unrelated affiliation provinces never fill',async()=>{
 const p=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','จังหวัดสนามสอบ','จังหวัด','ภาค','เขตข้อมูล'],['TEST_CONFLICT_REGION','ระบบ','นักธรรม','ตรี','พิษณุโลก','เชียงใหม่','ภาค 7','ส่วนภูมิภาค'],['TEST_COMPOUND_REGION','ระบบ','นักธรรม','ตรี','พิษณุโลก','','ภาค ๔-๕-๖-๗','ส่วนภูมิภาค'],['TEST_CENTRAL_REGION','ระบบ','นักธรรม','ตรี','กรุงเทพมหานคร','','','ส่วนกลาง'],['TEST_UNKNOWN_REGION','ระบบ','ธรรมศึกษา','ตรี','','พิษณุโลก','','ส่วนภูมิภาค']]),{...options,province:''});
 assert.equal(p.records[0].region,'ภาค 7');assert.ok(p.records[0].warnings.some(w=>w.includes('ภาคไม่ตรงกับตาราง')));assert.equal(p.records[1].region,'ภาค 4-5-6-7');assert.ok(!p.records[1].warnings.some(w=>w.includes('ภาคไม่ตรงกับตาราง')));assert.equal(p.records[2].region,'');assert.equal(p.records[3].region,'');assert.equal(p.records[3].province,'');
 const school=await parseExcel(await workbook([['ชื่อ','นามสกุล','ประเภท','ระดับ','สำนักเรียน'],['TEST_SCHOOL_REGION','ระบบ','นักธรรม','ตรี','คณะจังหวัดพิษณุโลก']]),{...options,province:''});assert.equal(school.records[0].province,'พิษณุโลก');assert.equal(school.records[0].region,'ภาค 5');
});
