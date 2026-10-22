const {test}=require('node:test');const assert=require('node:assert/strict');
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const Table=require('../.sites-runtime/results-test/app/components/ExamResultsTable.js').default;
const {studyCenterLabel}=require('../.sites-runtime/results-test/lib/result-display.js');
const base={id:'1',sequence:'1',title:'พระ',first_name:'ทดสอบ',last_name:'ระบบ',dharma_name:'',category:'นักธรรม',level:'ตรี',sect:'มหานิกาย',region:'ภาค 5',province:'พิษณุโลก',school:'วัดสำนักสอบเดิม',temple:'วัดสังกัดจริง',district:'เมืองพิษณุโลก',jurisdiction:'ส่วนภูมิภาค',year:2542,birth_year:2502,birth_year_estimated:1,age_at_exam:40,age_estimated:0,vassa:12};
const render=(rows,admin=false)=>renderToStaticMarkup(React.createElement(Table,{rows,onDetail:()=>{},...(admin?{onEdit:()=>{},onTrash:()=>{}}:{})}));
const headers=html=>[...html.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map(m=>m[1].replace(/<[^>]+>/g,''));
const expectedMonastic=['ปีการศึกษา','นิกาย','ภาค','ชั้น','เลขที่ปกศ.','คำนำหน้า','ชื่อ','ฉายา','นามสกุล','อายุ','พรรษา','สังกัดวัด','อำเภอ','จังหวัด','จัดการรายชื่อ'];
const expectedLay=expectedMonastic.filter(label=>!['ฉายา','พรรษา'].includes(label));
test('public and admin monastic results use the requested column order and separate name fields',()=>{
 for(const admin of [false,true]){
  const html=render([{...base,dharma_name:'ธมฺมทินฺโน'}],admin);assert.deepEqual(headers(html),expectedMonastic);
  const cells=[...html.matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g)].map(m=>m[1].replace(/<[^>]+>/g,''));
  assert.deepEqual(cells.slice(0,14),['๒๕๔๒','ม.','๕','น.ธ.ตรี','พล ๑/๒๕๔๒','พระ','ทดสอบ','ธมฺมทินฺโน','ระบบ','๔๐','๑๒','วัดสังกัดจริง','เมืองพิษณุโลก','พิษณุโลก']);
  assert.ok(!html.includes('วัดสำนักสอบเดิม'));assert.ok(html.includes('อายุ ณ ปีที่สอบผ่าน พ.ศ. ๒๕๔๒'));
  if(admin){assert.ok(html.includes('แก้ไข ทดสอบ'));assert.ok(html.includes('ย้ายไปถังขยะ ทดสอบ'));}else{assert.ok(html.includes('ดูข้อมูล ทดสอบ'));}
 }
});
test('public and admin lay results omit dharma name and vassa and retain the actual affiliation',()=>{
 const lay={...base,id:'2',title:'เด็กหญิง',category:'ธรรมศึกษา',dharma_name:'ไม่แสดงฉายานี้',temple:'โรงเรียนสังกัดจริง',vassa:999};
 for(const admin of [false,true]){const html=render([lay],admin);assert.deepEqual(headers(html),expectedLay);assert.ok(html.includes('โรงเรียนสังกัดจริง'));assert.ok(!html.includes('พรรษา'));assert.ok(!html.includes('ไม่แสดงฉายานี้'));assert.ok(!html.includes('๙๙๙'));assert.ok(!html.includes('วัดสำนักสอบเดิม'));}
});
test('mixed categories have separate correctly ordered tables with matching cell counts',()=>{
 const html=render([base,{...base,id:'2',category:'ธรรมศึกษา',title:'นาย',temple:'องค์กรจริง'}]);
 const tables=[...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map(m=>m[1]);assert.equal(tables.length,2);assert.deepEqual(headers(tables[0]),expectedMonastic);assert.deepEqual(headers(tables[1]),expectedLay);
 for(const table of tables){assert.equal((table.match(/<th\s/g)||[]).length,(table.match(/<td(?:\s|>)/g)||[]).length);}
});
test('central schools keep their named temple/council and do not become a guessed provincial council',()=>{
 assert.equal(studyCenterLabel({...base,province:'กรุงเทพมหานคร',jurisdiction:'ส่วนกลาง',school:'สำนักเรียนวัดบวรนิเวศวิหาร'}),'วัดบวรนิเวศวิหาร');
 assert.equal(studyCenterLabel({...base,province:'',school:''}),'ไม่ระบุ');
 assert.equal(studyCenterLabel({...base,school:'วัดมหาธาตุ'}),'คณะจังหวัดพิษณุโลก');
});

test('certificate uses the source sequence and all visible digits are Thai without changing control values',()=>{
 const html=render([base]);assert.ok(html.includes('เลขที่ปกศ.'));assert.ok(html.includes('พล ๑/๒๕๔๒'));assert.ok(!/[0-9]/.test(html.replace(/<[^>]+>/g,'')));
 const ThaiNumerals=require('../.sites-runtime/results-test/app/components/ThaiNumerals.js').default;
 const controls=renderToStaticMarkup(React.createElement(ThaiNumerals,null,React.createElement('input',{type:'text',value:'2542',onChange:()=>{},placeholder:'ปี 2542'}),React.createElement('select',{value:'2542',onChange:()=>{}},React.createElement('option',{value:'2542'},'2542'))));
 assert.ok(controls.includes('value="๒๕๔๒"'));assert.ok(controls.includes('value="2542"'));assert.ok(controls.includes('>๒๕๔๒</option>'));
});

test('province directory shows the supplied region column, Thai digits, and Bangkok as central',()=>{
 const Directory=require('../.sites-runtime/results-test/app/components/ProvinceDirectory.js').default;const html=renderToStaticMarkup(React.createElement(Directory));
 assert.ok(html.includes('จังหวัด ชื่อย่อ และภาค'));assert.ok(html.includes('<td>ภาค ๑</td><td>นนทบุรี</td>'));assert.ok(html.includes('จำนวนรายการต่อหน้า'));assert.ok(html.includes('>๑๐๐</option>'));assert.equal((html.match(/<tr/g)||[]).length,26);
 const {regionForProvince}=require('../.sites-runtime/results-test/lib/province-regions.js');assert.equal(regionForProvince('กระบี่'),'ภาค 17');assert.equal(regionForProvince('พิษณุโลก'),'ภาค 5');assert.equal(regionForProvince('กรุงเทพมหานคร'),'');
});

test('each exam level has the category abbreviation without duplicating existing prefixes',()=>{
 const {examLevelLabel}=require('../.sites-runtime/results-test/lib/result-display.js');
 for(const category of ['นักธรรม','ธรรมศึกษา'])for(const level of ['ตรี','โท','เอก']){
  const expected=(category==='นักธรรม'?'น.ธ.':'ธ.ศ.')+level;
  for(const value of [level,'ชั้น'+level,category+'ชั้น'+level,expected])assert.equal(examLevelLabel(category,value),expected);
  for(const admin of [false,true])assert.ok(render([{...base,category,level}],admin).includes('>'+expected+'</span>'));
 }
 assert.equal(examLevelLabel('นักธรรม',''),'ไม่ระบุ');
});
test('compact results expose every responsive field label and proportional columns for both categories',()=>{
 for(const category of ['นักธรรม','ธรรมศึกษา'])for(const admin of [false,true]){
  const html=render([{...base,category}],admin);const labels=[...html.matchAll(/data-label="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(labels,category==='นักธรรม'?expectedMonastic:expectedLay);
  assert.equal((html.match(/<col style=/g)||[]).length,labels.length);
  assert.ok(html.includes('results-table-wrap'));assert.ok(html.includes('class="results-table"'));
 }
});

test('both audiences and categories abbreviate sects and show numeric ages only',()=>{
 for(const category of ['นักธรรม','ธรรมศึกษา'])for(const admin of [false,true])for(const [sect,label] of [['มหานิกาย','ม.'],['ธรรมยุต','ธ.']]){
  const html=render([{...base,category,sect,age_at_exam:24,age_estimated:1}],admin);
  assert.ok(html.includes('data-label="นิกาย" title="'+sect+'">'+label+'</td>'));
  const age=html.match(/<td data-label="อายุ"[^>]*>([^<]*)<\/td>/)[1];assert.equal(age,'๒๔');
  assert.ok(html.includes('คำนวณจากปีเกิดโดยประมาณ'));
 }
 for(const age of [0,null]){const html=render([{...base,sect:'',age_at_exam:age}]);assert.ok(html.includes('>ไม่ระบุนิกาย</td>'));assert.equal(html.match(/<td data-label="อายุ"[^>]*>([^<]*)<\/td>/)[1],age===null?'-':'๐');}
});
test('missing and unreported age or vassa display as a hyphen in public and admin results',()=>{
 for(const admin of [false,true])for(const missing of [null,'','ไม่ระบุ']){
  const html=render([{...base,age_at_exam:missing,vassa:missing}],admin);
  assert.equal(html.match(/<td data-label="อายุ"[^>]*>([^<]*)<\/td>/)[1],'-');
  assert.equal(html.match(/<td data-label="พรรษา"[^>]*>([^<]*)<\/td>/)[1],'-');
 }
});

test('pagination accepts only the three allowed sizes and clamps pages after size changes',()=>{
 const {pagination}=require('../.sites-runtime/results-test/lib/pagination.js');
 assert.deepEqual(pagination(211,new URLSearchParams('pageSize=50&page=3')),{pageSize:50,pages:5,page:3,offset:100});
 assert.deepEqual(pagination(211,new URLSearchParams('pageSize=๑๐๐&page=๙')),{pageSize:100,pages:3,page:3,offset:200});
 for(const size of ['','0','-25','999999','26','50.5','1 OR 1=1','Infinity'])assert.equal(pagination(211,new URLSearchParams({pageSize:size})).pageSize,25);
 for(const page of ['-1','NaN','Infinity'])assert.equal(pagination(211,new URLSearchParams({page})).page,1);
 assert.deepEqual(pagination(0,new URLSearchParams('page=999&pageSize=100')),{pageSize:100,pages:0,page:1,offset:0});
});

test('both categories and audiences omit region and certificate prefixes, including older computed certificates',()=>{
 for(const category of ['นักธรรม','ธรรมศึกษา'])for(const admin of [false,true]){
  const html=render([{...base,category,region:'ภาค 5-6',certificate_number:'ที่ ตก 1/2542'}],admin);
  assert.ok(html.includes('data-label="ภาค">๕-๖</td>'));assert.ok(html.includes('data-label="เลขที่ปกศ.">ตก ๑/๒๕๔๒</td>'));
  const central=render([{...base,category,region:'',jurisdiction:'ส่วนกลาง'}],admin);assert.ok(central.includes('data-label="ภาค">ส่วนกลาง</td>'));
 }
});
