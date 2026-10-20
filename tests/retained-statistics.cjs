const {test}=require('node:test');const assert=require('node:assert/strict');const ExcelJS=require('exceljs');
const {parseRetainedStatistics}=require('../.sites-runtime/retained-statistics-test/retained-statistics.js');
const {parseExcel}=require('../.sites-runtime/retained-statistics-test/excel.js');
const options={province:'',year:0,category:'',level:''};
const parse=async(book,settings={})=>parseRetainedStatistics(new Uint8Array(await book.xlsx.writeBuffer()),{...options,...settings});
function headings(sheet,province='พิษณุโลก',category='นักธรรม',level='ตรี',year=2542){sheet.addRow(['บัญชีรายชื่อผู้สอบได้','',category,level]);sheet.addRow(['ในสนามหลวง','',province,5]);sheet.addRow(['พ.ศ.','',year]);}
const metrics=['ส่งเข้าสอบ','ขาดสอบ','คงสอบ','สอบได้','สอบตก','อื่นๆ'];
test('extracts all six metric columns using split historical headings across six exam groups',async()=>{
 const b=new ExcelJS.Workbook();for(const category of ['นักธรรม','ธรรมศึกษา'])for(const level of ['ตรี','โท','เอก']){const s=b.addWorksheet(category+level);headings(s,'พิษณุโลก',category,level);s.addRow(metrics);s.addRow(['๑,๐๐๐','๕๐',950,900,50,0]);s.addRow(['ที่','ชื่อ','นามสกุล']);s.addRow([1,'พระทดสอบ','ระบบ']);}
 const result=await parse(b);assert.equal(result.rows.length,6);for(const r of result.rows){assert.equal(r.year,2542);assert.equal(r.region,'ภาค 5');assert.equal(r.province,'พิษณุโลก');assert.equal(r.sent,1000);assert.equal(r.absent,50);assert.equal(r.retained,950);assert.equal(r.passed,900);assert.equal(r.failed,50);assert.equal(r.other,0);assert.equal(r.sect,'');assert.equal(r.sourceRow,5);}
});
test('reads summary blocks after name rows and prevents people/addresses from becoming totals',async()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('รายชื่อ');headings(s);s.addRow(['ที่','ชื่อ','นามสกุล','อายุ','วัด']);s.addRow([1,'พระสมมติ','ทดสอบ',45,'วัดขาดสอบ']);s.addRow(metrics);s.addRow([100,5,95,90,5,0]);
 const result=await parse(b);assert.equal(result.rows.length,1);assert.equal(result.rows[0].passed,90);assert.equal(result.rows[0].temple,'');
});
test('keeps missing counts null, preserves zero and never invents totals from successful names',async()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('ธรรมศึกษา ตรี');headings(s);s.addRow(metrics);s.addRow([null,0,null,5,'-',null]);const r=(await parse(b)).rows[0];assert.equal(r.sent,null);assert.equal(r.absent,0);assert.equal(r.passed,5);assert.equal(r.failed,null);
 const names=new ExcelJS.Workbook(),n=names.addWorksheet('รายชื่อ');headings(n);n.addRow(['ที่','ชื่อ','นามสกุล']);n.addRow([1,'สมมติ','ทดสอบ']);assert.equal((await parse(names)).rows.length,0);
});
test('handles mixed tabular statistic sheets with explicit scopes and repeated headers',async()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('สถิติ');const header=['จังหวัด','ประเภท','ชั้น','ปี พ.ศ.','ภาค','นิกาย','วัด',...metrics];s.addRow(header);s.addRow(['ตาก','นักธรรม','ตรี',2542,5,'ม.','วัดหนึ่ง',100,5,95,90,5,0]);s.addRow(header);s.addRow(['เชียงใหม่','ธรรมศึกษา','เอก',2541,7,'ธ.','โรงเรียนสอง',80,0,80,70,10,0]);const r=await parse(b);assert.equal(r.rows.length,2);assert.equal(r.rows[0].sect,'มหานิกาย');assert.equal(r.rows[1].year,2541);assert.equal(r.rows[1].region,'ภาค 7');
});
test('vertical and inline label summaries are joined only within their own section',async()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('สรุป');headings(s);s.addRow(['ส่งสอบ',100]);s.addRow(['ขาดสอบ',5]);s.addRow(['คงสอบ',95]);s.addRow(['สอบได้',90]);s.addRow(['สอบตก',5]);s.addRow(['ธรรมศึกษา ชั้นโท']);s.addRow(['ส่งสอบ ๒๐๐ คน','ขาดสอบ: ๑๐ คน','คงสอบ ๑๙๐','สอบได้ ๑๘๐','สอบตก ๑๐']);const r=await parse(b);assert.equal(r.rows.length,2);assert.equal(r.rows[0].sourceRow,4);assert.equal(r.rows[0].sourceEndRow,8);assert.equal(r.rows[1].category,'ธรรมศึกษา');assert.equal(r.rows[1].level,'โท');assert.equal(r.rows[1].passed,180);
});
test('retained numeric formula results are used with a note and missing caches remain unknown',async()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('สรุป');headings(s);s.addRow(metrics);s.addRow([{formula:'100+5',result:105},5,100,90,10,{formula:'SUM(A1:A2)'}]);const r=(await parse(b)).rows[0];assert.equal(r.sent,105);assert.equal(r.other,null);assert.match(r.note,/ผลสูตร/);
 const names=new ExcelJS.Workbook(),n=names.addWorksheet('รายชื่อ');n.addRow(['ที่','ชื่อ','นามสกุล','ประเภท','ระดับ']);n.addRow([1,{formula:'"ปลอม"',result:'ปลอม'},'ทดสอบ','นักธรรม','ตรี']);const p=await parseExcel(new Uint8Array(await names.xlsx.writeBuffer()),{province:'พิษณุโลก',year:2542,category:'',level:''});assert.equal(p.records[0].firstName,'');
});
test('rejects incomplete scopes and never carries province/year between worksheets',async()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('ครบ');headings(s);s.addRow(metrics);s.addRow([10,0,10,9,1,0]);const other=b.addWorksheet('ไม่ครบ');other.addRow(['นักธรรม ชั้นเอก']);other.addRow(metrics);other.addRow([10,0,10,9,1,0]);const result=await parse(b);assert.equal(result.rows.length,1);assert.ok(result.issues.some(i=>i.sheet==='ไม่ครบ'&&/ไม่ครบ/.test(i.message)));
});
test('metadata, percentage columns, mixed sect labels and merged header cells stay distinct',async()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('ทดสอบ');headings(s);s.addRow(['มหานิกาย ธรรมยุต']);s.addRow(['ส่งเข้าสอบ',null,'ขาดสอบ','คงสอบ','สอบได้','สอบตก','ร้อยละ']);s.mergeCells('A5:B5');s.addRow([20,null,0,20,10,10,50]);const result=await parse(b);assert.equal(result.rows[0].sent,20);assert.equal(result.rows[0].other,null);assert.equal(result.rows[0].sect,'');
});

test('separates explicitly labelled form/reference sheets when real result sheets are present',async()=>{
 const b=new ExcelJS.Workbook(),real=b.addWorksheet('ผลสอบจริง');headings(real);real.addRow(metrics);real.addRow([100,5,95,90,5,0]);
 const sample=b.addWorksheet('2512_ชื่อเล่มแบบพิมพ์');headings(sample,'นนทบุรี','นักธรรม','ตรี',2541);sample.addRow(metrics);sample.addRow([0,0,0,0,0,0]);
 const result=await parse(b);assert.equal(result.rows.length,1);assert.equal(result.rows[0].province,'พิษณุโลก');assert.ok(result.issues.some(i=>i.sheet===sample.name&&/ไม่นำชีต/.test(i.message)));
});
test('flags impossible retained/pass/fail totals even when the other column is absent',async()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('ผลสอบ');headings(s);s.addRow(metrics.slice(0,5));s.addRow([100,5,95,90,10]);const result=await parse(b);assert.equal(result.rows[0].retained,95);assert.equal(result.rows[0].passed,90);assert.match(result.rows[0].note,/ไม่สัมพันธ์/);assert.ok(result.issues.length);
});
