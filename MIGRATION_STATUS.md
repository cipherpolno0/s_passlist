# การย้าย s_passlist ไป Supabase และ Vercel

สถานะ 21 ตุลาคม 2569: โค้ดและ schema เตรียมแล้ว แต่ยังไม่ได้ย้ายข้อมูลจริงหรือเปิด production ใหม่

- ต้นทาง: https://s-passlist.kungrobcipher.chatgpt.site/ เวอร์ชัน 38, source commit `46b64dea161cd43aff50d3b2079aa24396c1d600`
- GitHub: `cipherpolno0/s_passlist` โค้ดใน branch สำหรับการย้ายระบบ
- Supabase: `news_passlist` (`ywtewiwhwurvuslarmme`) บัญชี Kung
- Vercel: `news_passlist` ในทีม `kungrobcipher-8723` (`prj_WjRlsWSUau2P42ZvJn9l2SmukWZ9`)
- ตรวจต้นทางพบชุดข้อมูล committed 2 ชุด รวม 24,500 รายชื่อ

## สิ่งที่เตรียมแล้ว

ใช้ Next.js App Router บน Node.js แทน Vinext/Cloudflare Workers เปลี่ยน `cloudflare:workers` เป็น server adapter สำหรับ PostgreSQL คง API และ UI เดิมไว้ รวมถึงตัวอ่าน Excel การค้นด้วยชื่อและนามสกุลคู่กัน การเรียงชั้น/เลข ปกศ. ถังขยะ สถิติ และการเทียบทะเบียน

`lib/postgres.ts` ใช้ parameterized SQL และ transaction สำหรับ D1 batch เดิม แปลง placeholder, INSERT OR IGNORE, JSON functions และเลขลำดับเป็น PostgreSQL เก็บไฟล์ต้นฉบับ/preview เป็น bytea ในตาราง private `passlist.source_files` เพื่อย้ายต้นฉบับได้ครบพร้อมตรวจ SHA-256 การใช้งานขนาดใหญ่ควรประเมินพื้นที่ฐานข้อมูลก่อนเพิ่มข้อมูลจำนวนมาก

การเข้าสู่ระบบใช้ Supabase Auth ตรวจ session กับ Auth server และใช้ ADMIN_EMAILS ฝั่งเซิร์ฟเวอร์ ไม่เชื่อถือ header ยืนยันตัวตนของ Sites บน Vercel ตั้ง DATA_OWNER_ID ให้ตรงกับชุดข้อมูลเดิมเพื่อรักษาสิทธิ์ผู้ดูแลต่อข้อมูลที่ย้าย

Supabase ติดตั้ง schema `passlist` แล้ว 12 ตาราง เปิด RLS ทุกตาราง และถอนสิทธิ์ PUBLIC/anon/authenticated ตารางนี้ไม่เปิดผ่าน Data API ทั่วไป ยังไม่มี application role หรือ policies ให้ runtime เข้าใช้ ขณะนี้จึงยังปิดการเข้าถึงโดยตรง

## ผลตรวจที่รันจริง

- TypeScript ผ่าน
- Next.js production build ผ่าน
- unit tests PostgreSQL adapter 5 รายการผ่าน
- regression tests ตัวอ่าน Excel 41 รายการ, การแสดงผล 12 รายการ และการอ่านสถิติเดิม 10 รายการ ผ่านทั้งหมด
- สร้าง SQL จาก API ค้นหาทั่วไป/ผู้ดูแล สถิติ ถังขยะ ทะเบียน และกระบวนการ commit Excel รวม 33 statement: อ่านข้อมูลทดสอบด้วย SELECT และตรวจ PREPARE สำหรับคำสั่งเขียนบน Supabase PostgreSQL จริง โดย rollback transaction
- ตรวจ JSON array/object, การอ่านปี/ชื่อโรงเรียน และเลขลำดับกับ PostgreSQL จริงผ่าน
- Security advisors พบ INFO เรื่อง RLS ไม่มี policy 12 ตาราง ซึ่งตรงกับสถานะ deny-by-default ก่อนสร้าง application role; ไม่มีการเปิดอ่านรายชื่อให้ anon/authenticated

## งานที่ยังต้องทำหลังอนุมัติสิทธิ์ที่ถูกบล็อก

ระบบอนุมัติอัตโนมัติปฏิเสธการสร้าง application/export credentials และการคัดลอก administrator email กับ source owner identifier ไป Vercel เพราะต้องมีการอนุญาตที่ระบุข้อมูลและปลายทางโดยตรง ยังไม่มี credential ที่ถูกสร้างจากขั้นตอนที่ปฏิเสธ

1. สร้าง role `passlist_app` สำหรับแอปเท่านั้น ไม่เป็น superuser และให้ DML/EXECUTE เฉพาะ schema passlist ตาม `supabase/app-role.sql`; เก็บรหัสเฉพาะใน Vercel encrypted environment
2. ตั้งค่า DATABASE_URL, Supabase URL/publishable key, ADMIN_EMAILS และ DATA_OWNER_ID ในโปรเจกต์ Vercel ที่ระบุ
3. เปิด read-only export ชั่วคราวใน Site ด้วย `tools/sites-export-route.ts` และคีย์สุ่มที่หมดอายุ เก็บเฉพาะ SHA-256/วันหมดอายุใน environment ของ Site
4. รัน `tools/migrate-site.mjs` ผ่าน environment ที่ป้องกัน: upsert ตารางตาม primary key ตรวจจำนวนแถวทุกตาราง และ SHA-256 ของไฟล์ source/preview ห้ามบันทึกข้อมูลรายชื่อหรือ Excel ใน repository
5. ถอนคีย์ส่งออกและ route ชั่วคราวเมื่อย้ายเสร็จ
6. ตรวจ login/logout, สิทธิ์ผู้ดูแล, public search, ตัวกรอง/สถิติ, import/export, ลบ/กู้คืน และการจับคู่ทะเบียนกับข้อมูลจริง
7. ตั้งค่า Supabase Auth Site URL/redirect สำหรับโดเมน Vercel แล้วเผยแพร่ production หลังตรวจข้อมูลครบ

ยังไม่อ้างว่า end-to-end หรือ production พร้อมใช้งาน จนกว่ารหัสเชื่อมต่อ การย้ายข้อมูล และการตรวจสิทธิ์จริงจะเสร็จ

## คำสั่งตรวจ

```sh
pnpm typecheck
pnpm build
node --experimental-transform-types --test tests/postgres-adapter.test.mjs
node --experimental-transform-types tools/check-postgres-queries.mjs
```

คำสั่งสุดท้ายสร้าง `.sites-runtime/pg-check/queries.sql` ด้วยข้อมูลทดสอบสมมติเท่านั้น ให้ตรวจ SQL นี้ใน transaction ที่ rollback บน schema เป้าหมาย ข้อมูล production และไฟล์ต้นฉบับไม่อยู่ใน GitHub

## ตรวจต่อ 21 ตุลาคม 2569

ยืนยันผ่าน Sites database viewer ว่าชุดข้อมูลที่เผยแพร่มี 13,960 + 10,540 = 24,500 รายชื่อ Vercel API อ่านโปรเจกต์ได้แล้ว มี env สาธารณะ 2 ค่า แต่ยังไม่มี DATABASE_URL/ADMIN_EMAILS/DATA_OWNER_ID และไม่มีบัญชี Supabase Auth

ปรับ importer ให้ใช้ transaction และ table/advisory locks หยุดเมื่อปลายทางมีข้อมูล ตรวจ digest ของข้อมูลต้นทางซ้ำ ตรวจ SHA-256 ไฟล์ทั้งสองฝั่ง แล้วจึง COMMIT; เพิ่มการทดสอบกรณีปลายทางไม่ว่าง ข้อมูลเปลี่ยนและไฟล์เสียหาย ทุกกรณีผิดพลาดต้อง ROLLBACK เพิ่มเงื่อนไขอีเมลยืนยันแล้วในการยืนยันตัวตน

ตรวจรอบนี้: 73 tests ผ่าน (10 PostgreSQL/migration + 41 Excel + 12 ตาราง + 10 สถิติ), TypeScript ผ่าน, Next.js production build ผ่านและมี .next/routes-manifest.json ตรวจ SQL ของแอป 33 statement บน Supabase จริงใน transaction ที่ ROLLBACK ผ่าน ไม่ได้สร้าง credentials เปิด export endpoint ย้ายข้อมูล merge หรือ deploy production

ชุดนี้ใช้ source_files ใน PostgreSQL จึงไม่ควรรวม schema/โค้ดจาก PR #1 ซึ่งใช้ Supabase Storage โดยตรง ให้เลือก implementation เดียวและตรวจครบก่อน merge
