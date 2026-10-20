# ผลตรวจสอบ Next.js migration

ฐานซอร์ส: Sites v38; GitHub main `2d67a5b03731deb8d63cb4d118521f9da1024441`
ตรวจวันที่ 20 ตุลาคม 2569

## ตรวจอัตโนมัติ

- `npm ci`: ติดตั้งจาก package-lock.json ใหม่สำเร็จ
- `npm run typecheck`: TypeScript ผ่าน
- `npm test`: 80 tests (importer 41, ตาราง 12, retained statistics parser 10, PostgreSQL integration 17)
- `npm run build`: Next.js 16.3.4 production build ผ่าน และมี `.next/routes-manifest.json`
- `node tests/http-smoke.mjs`: HTTP production server กับ Supabase Auth จำลองผ่าน

## สิ่งที่ทดสอบกับ PostgreSQL engine ผ่าน PGlite

- schema 11 ตาราง, RLS, ไม่มี anonymous grants, lease แบบ milliseconds
- queries ใช้ schema แบบระบุชื่อเต็ม รองรับ transaction pooler โดยไม่ต้องพึ่ง session search_path
- การ bind parameters, JSON bulk import, conflict ignore, transaction rollback
- การค้นชื่อบางส่วนที่ต้องมีทั้งชื่อ/นามสกุล และการซ่อน private/unpublished/trashed rows
- จำนวนรายชื่อแยก 6 ประเภท/ชั้น สำหรับสถิติสีแดง พร้อม owner/trash scope
- JSON audit และการแก้นิกายเป็นกลุ่ม รวม optimistic concurrency guards
- โหลดข้อมูลอ้างอิงจริงที่อนุญาตเผยแพร่: วัด 44,704 แถว และสถานศึกษา 49,519 แถว
- signed-upload intake → Excel parsing → preview → commit → retry ไม่ซ้ำ → publish → public search
- ปฏิเสธการอ่าน preview ข้ามเจ้าของ และคืนลิงก์ดาวน์โหลดต้นฉบับหลังตรวจสิทธิ์
- เติมอายุและพรรษาจาก Excel เดิม และเติมภาคพร้อม audit
- อ่านสถิติจากต้นฉบับ Excel ที่เก็บไว้

## HTTP smoke ที่ตรวจ production build จริง

- session cookie ของ Supabase SSR ถูกส่งไปตรวจด้วย `getUser()` ที่ Auth server จำลอง
- header `oai-authenticated-user-*` ที่ปลอมขึ้นไม่ให้สิทธิ์ผู้ดูแล
- ผู้ไม่เข้าสู่ระบบถูกส่งไป `/login`; API ตอบ 401
- auth responses มี private/no-store และ logout ปฏิเสธ Origin จากเว็บไซต์อื่น
- หน้า Login และตั้งรหัสผ่านใหม่ตอบ HTTP 200

## ข้อจำกัดที่ยังต้องตรวจบนระบบจริง

- ยังไม่ได้ติดตั้ง schema หรือย้ายข้อมูล production ไป Supabase `ywtewiwhwurvuslarmme` เพราะการเชื่อมต่อยังไม่มีสิทธิ์
- ยังไม่ได้ deploy หรือแก้ env ใน Vercel ทีม `kungrobcipher-8723`
- ต้องทดสอบ SMTP/ลิงก์ reset และ signed upload/download กับ credentials ของโปรเจกต์จริง
- ไม่ได้ทดสอบใน browser เนื่องจากไม่มี browser QA ที่รองรับในสภาพแวดล้อมนี้
- ทดสอบ scripts ย้ายข้อมูลด้วย syntax validation; ยังไม่ได้รัน `--apply` กับ D1/R2 export จริง

ดูขั้นตอนติดตั้งและย้ายข้อมูลใน DEPLOYMENT.md; build ผ่านไม่ได้ยืนยันว่า production พร้อมใช้แล้ว
