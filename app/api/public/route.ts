import {pagination} from '../../../lib/pagination';
import {certificateNumber} from '../../../lib/certificate-number';
import {toArabic} from '../../../lib/thai-numerals';
import { getChatGPTUser } from '../../chatgpt-auth';
import { isAdminEmail } from '../../../lib/admin';
import { PROVINCES } from '../../../lib/constants';
import { database } from '../../../lib/import-service';
import { activeRecord } from '../../../lib/record-state';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
// Public search returns only the approved fields; it never exposes notes, source files, audit details, or unpublished rows.
const fields = "CASE WHEN r.category='นักธรรม' AND r.title NOT LIKE '%สามเณร%' AND r.title NOT LIKE 'เณร%' THEN r.vassa ELSE NULL END AS vassa,r.sequence AS certificate_sequence,r.birth_year,r.age_at_exam,r.birth_year_estimated,r.age_estimated,r.id,r.year,r.sect,r.region,r.province,r.category,r.level,r.title,r.first_name,r.last_name,r.dharma_name,r.temple,r.district,r.subdistrict,r.school,r.jurisdiction,r.school_kind";
const provinceOrder = 'CASE r.province ' + PROVINCES.map((province, index) => `WHEN '${province}' THEN ${index}`).join(' ') + ' ELSE 77 END';

export async function GET(req: Request) {
 try {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'search';
  if (action === 'meta') {
   const user = await getChatGPTUser();
   return json({viewer: {signedIn: !!user, isAdmin: !!user && isAdminEmail(user.email)}});
  }
  if (action === 'stats' || action === 'groups' || action === 'export') {
   return json({error: 'หน้าสืบค้นทั่วไปไม่เปิดรายการรวม กรุณาค้นด้วยชื่อและนามสกุล'}, 403);
  }
  if (action !== 'search' && action !== 'detail') return json({error: 'ไม่รองรับคำขอนี้'}, 400);

  const firstName = toArabic((url.searchParams.get('firstName') || '').normalize('NFC').trim().slice(0, 120));
  const lastName = toArabic((url.searchParams.get('lastName') || '').normalize('NFC').trim().slice(0, 120));
  if (!firstName || !lastName) return json({error: 'กรุณากรอกชื่อและนามสกุลให้ครบทั้งสองช่อง'}, 400);

  const db = database();
  const arabic=(column:string)=>[...'๐๑๒๓๔๕๖๗๘๙'].reduce((sql,digit,index)=>`REPLACE(${sql},'${digit}','${index}')`,column);
  const sequenceOrder=`CASE WHEN TRIM(COALESCE(r.sequence,''))='' THEN 1 ELSE 0 END,sequence_number(${arabic('r.sequence')})`;
  const order = `${provinceOrder},CASE r.category WHEN 'นักธรรม' THEN 0 ELSE 1 END,CASE r.level WHEN 'ตรี' THEN 1 WHEN 'โท' THEN 2 ELSE 3 END,r.year DESC,${sequenceOrder} ASC,CASE r.sect WHEN 'มหานิกาย' THEN 0 WHEN 'ธรรมยุต' THEN 1 ELSE 2 END,r.id`;
  const from = `FROM records r JOIN batches b ON b.id=r.batch_id WHERE b.status='committed' AND b.visibility='published' AND ${activeRecord('r')} AND (LOWER(TRIM(${arabic("r.first_name")}))LIKE LOWER(?) ESCAPE '\\' OR LOWER(TRIM(${arabic("COALESCE(r.title,'')||r.first_name")}))LIKE LOWER(?) ESCAPE '\\' OR LOWER(TRIM(${arabic("COALESCE(r.title,'')||' '||r.first_name")}))LIKE LOWER(?) ESCAPE '\\') AND LOWER(TRIM(${arabic("r.last_name")}))LIKE LOWER(?) ESCAPE '\\'`;
  // Both name fields remain mandatory. Escape LIKE syntax so literal one-letter and partial-name searches cannot turn into wildcard browsing.
  const pattern=(text:string)=>'%'+text.replace(/[\\%_]/g,'\\$&')+'%';
  const args = [pattern(firstName), pattern(firstName), pattern(firstName), pattern(lastName)];
  const publicRecord=(row:Record<string,unknown>)=>{const {certificate_sequence,...visible}=row;return {...visible,certificate_number:certificateNumber({province:String(row.province||''),jurisdiction:row.jurisdiction,year:Number(row.year),sequence:certificate_sequence})};};
  if (action === 'detail') {
   const record = await db.prepare(`SELECT ${fields} ${from} AND r.id=?`).bind(...args, url.searchParams.get('id') || '').first();
   return record ? json({record:publicRecord(record)}) : json({error: 'ไม่พบรายชื่อที่เผยแพร่'}, 404);
  }

  const count = await db.prepare(`SELECT COUNT(*) total ${from}`).bind(...args).first();
  const total = Number(count?.total || 0);
  const {pageSize,pages,page,offset}=pagination(total,url.searchParams);
  const items = await db.prepare(`SELECT ${fields} ${from} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...args,pageSize,offset).all();
  return json({items: items.results.map(publicRecord), total, pages, page,pageSize});
 } catch (error) {
  console.error(error);
  return json({error: 'ไม่สามารถสืบค้นได้ในขณะนี้ กรุณาลองใหม่'}, 500);
 }
}
