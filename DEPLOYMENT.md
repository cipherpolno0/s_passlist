# เผยแพร่ s_passlist บน Vercel และ Supabase

เป้าหมายเดียวของชุดนี้คือ GitHub `cipherpolno0/s_passlist`, Supabase `ywtewiwhwurvuslarmme` และ Vercel `kungrobcipher-8723/news_passlist` เว็บไซต์เดิมที่ Sites ยังทำงานอยู่และยังไม่ถูกสลับโฮสต์

## Runtime และข้อมูล

ใช้ Next.js App Router, React, TypeScript และ Tailwind บน Node.js 24 กับ pnpm ตาม package.json ฐานข้อมูลเป็น PostgreSQL schema `passlist` ผ่าน `pg` และ transaction pooler; ใช้ Supabase Auth กับ SSR cookies ยืนยันตัวตนด้วย `getUser()` และอีเมลที่ยืนยันแล้ว พร้อมตรวจ `ADMIN_EMAILS` ฝั่งเซิร์ฟเวอร์

ตาราง 12 ตารางเปิด RLS และถอนสิทธิ์ PUBLIC/anon/authenticated ไม่เปิด schema นี้ใน Data API ใช้ role `passlist_app` ซึ่งมีสิทธิ์อ่าน/เขียนเฉพาะ schema นี้และไม่มี BYPASSRLS; API เซิร์ฟเวอร์ตรวจสิทธิ์ผู้ดูแล/เจ้าของและสถานะเผยแพร่ก่อนอ่านข้อมูล

ไฟล์ Excel และ preview เก็บใน `passlist.source_files` แบบ bytea ส่วนตัว ไม่ใช้ Supabase Storage ในชุดนี้ ห้ามนำ schema จาก PR #1 ซึ่งใช้ Storage มารวมโดยไม่ปรับความเข้ากันได้

## สถานะที่ตรวจ 21 ตุลาคม 2569

- Sites เวอร์ชัน 38 มีชุดข้อมูล committed/published 2 ชุด จำนวน 13,960 และ 10,540 รวม 24,500 รายชื่อ
- Supabase มี schema 12 ตารางแต่ยังไม่มีข้อมูลหรือบัญชี Auth
- Vercel เข้าถึงโปรเจกต์ได้แล้ว มี URL/publishable key สาธารณะ แต่ยังขาด DATABASE_URL, ADMIN_EMAILS และ DATA_OWNER_ID
- Deployment เดิมผิดพลาด NEXT_NO_ROUTES_MANIFEST เพราะ main ยัง build ด้วย Vinext การเปลี่ยนเป็น `next build` ในชุดนี้แก้สาเหตุที่ระดับซอร์ส ยังต้องทดสอบ deployment จริง
- การสร้าง application/export credentials และการส่ง administrator email/source owner ID ไป Vercel เคยถูก automatic approval review ปฏิเสธ ต้องมีการอนุญาตที่ระบุข้อมูลและปลายทางก่อนดำเนินการเหล่านี้

## หลังได้การอนุญาตที่จำเป็น

1. ตรวจว่า schema ตรง `supabase/schema.sql` ที่ติดตั้งไว้แล้ว ห้ามรันไฟล์นี้ซ้ำบนปลายทางที่มี schema เพราะใช้ CREATE TABLE/FUNCTION
2. สร้าง role ตาม `supabase/app-role.sql` ผ่าน psql protected stdin โดยส่ง `app_password` เป็นรหัสสุ่ม ไม่บันทึกรหัสใน repository หรือประวัติ SQL สาธารณะ สคริปต์ role ทำใน transaction และหยุดเมื่อ role มีอยู่แล้ว
3. ตั้ง env ใน Vercel production: DATABASE_URL ของ transaction pooler (port 6543, username `passlist_app.<project-ref>`), NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ADMIN_EMAILS และ DATA_OWNER_ID ซึ่งตรงเจ้าของข้อมูล Sites เดิม ห้ามใช้ project postgres/service-role เป็น runtime credential
4. สร้างบัญชี Supabase Auth ของอีเมลผู้ดูแลที่อนุญาตและยืนยันอีเมล ตั้ง Site URL ให้ตรงโดเมนจริง หน้า /login มีการสร้างบัญชีเฉพาะ allowlist และมีลิงก์ลืมรหัสผ่านตามวิธีด้านล่าง
5. ตั้ง Vercel Framework เป็น Next.js, Build Command `pnpm build`, Install Command `pnpm install --frozen-lockfile`, ไม่กำหนด Output Directory เป็น dist และใช้ Node.js 24
6. เก็บ DATABASE_URL เฉพาะ encrypted/sensitive environment ฝั่งเซิร์ฟเวอร์ ไม่ส่งรหัสฐานข้อมูลไป NEXT_PUBLIC_ และไม่ใส่ credentials ของ production ให้ preview ที่ยังไม่ตรวจโค้ด

## ย้ายข้อมูลจริง

หยุดแก้ไขและนำเข้าข้อมูลที่เว็บต้นทางตลอดการย้าย คงเว็บต้นทางไว้จนกว่าการตรวจจะเสร็จ

1. เปิด read-only route ชั่วคราวจาก `tools/sites-export-route.ts` เฉพาะ Sites ต้นทาง สุ่ม export token และเก็บเฉพาะ SHA-256 กับวันหมดอายุใน MIGRATION_EXPORT_TOKEN_SHA256/MIGRATION_EXPORT_EXPIRES ตัว route ปิดเมื่อคีย์หมดอายุ
2. เรียก `node tools/migrate-site.mjs --apply` ใน environment ที่ป้องกัน โดยตั้ง SOURCE_SITE_URL, SOURCE_EXPORT_TOKEN, DATABASE_URL และ SOURCE_READ_ONLY_CONFIRMED=true
3. สคริปต์ล็อกตารางปลายทางและใช้ transaction เดียว หยุดหากมีแถวในตารางใด ตรวจจำนวนทุกตาราง อ่านข้อมูลต้นทางซ้ำเพื่อเทียบ digest และตรวจ SHA-256 ไฟล์ source/preview ทั้งในปลายทางและต้นทางก่อน COMMIT หากเกิดข้อผิดพลาดจะ ROLLBACK ทั้งหมด
4. ถ้าสคริปต์ขาดการเชื่อมต่อช่วง COMMIT ให้ตรวจจำนวนและไฟล์ก่อน retry; หากมีข้อมูลแล้วสคริปต์จะหยุดเพื่อป้องกันเขียนทับ
5. ถอน export route และ environment ชั่วคราวทันทีหลังย้าย ตรวจว่าปลายทางเก่าตอบ 404
6. ตรวจ public search, ตัวกรองทั้ง 6 ชั้น, สถิติสีแดงเมื่อไม่ตรงรายชื่อ, login/logout, การปฏิเสธผู้ไม่มีสิทธิ์, import/export, ถังขยะ/กู้คืนและทะเบียนด้วยข้อมูลจริง ก่อนสลับ production

ห้ามนำไฟล์ Excel รายชื่อ ผลส่งออก database หรือ secrets ขึ้น GitHub ข้อมูลอ้างอิงวัด/สถานศึกษาที่ได้รับอนุญาตไว้แล้วเป็นคนละชุดกับรายชื่อผู้สอบได้

## ลืมรหัสผ่านและตั้งรหัสใหม่

1. Supabase → Authentication → URL Configuration: ตั้ง Site URL เป็น `https://newspasslist.vercel.app` และเพิ่ม Redirect URL แบบตรงตัว `https://newspasslist.vercel.app/auth/callback` สำหรับ local ใช้ `http://localhost:3000/auth/callback` เฉพาะเมื่อต้องทดสอบ local
2. ตั้ง SMTP ด้วย sender email, username และรหัส SMTP ที่ถูกต้อง หากใช้ Gmail ให้ใช้ App password ของ Google ในช่อง SMTP Password; รหัสนี้ใช้ส่งเมล ไม่ใช่รหัสผ่านของบัญชีผู้ใช้เว็บ
3. ใช้ Reset Password email template ที่มีลิงก์ `{{ .ConfirmationURL }}` (ค่าเริ่มต้นของ Supabase) เว็บเรียก `resetPasswordForEmail` แบบ PKCE โดยกำหนด callback ชัดเจน อย่าแทนลิงก์ด้วย Site URL เปล่า
4. ผู้ใช้เปิด `/login` → **ลืมรหัสผ่าน?** → กรอกอีเมล → เปิดลิงก์จากอีเมลในเบราว์เซอร์และอุปกรณ์เดิม → กรอกรหัสใหม่อย่างน้อย 12 ตัวอักษรสองครั้ง → เข้าระบบด้วยรหัสใหม่ ลิงก์หมดอายุหรือใช้แล้วจะกลับไปหน้าขอลิงก์ใหม่

`/auth/callback` ยังรองรับ TokenHash เฉพาะ `type=recovery` หากดูแล custom template อยู่แล้ว รูปแบบคือ `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery` อย่าใช้ร่วมกับ confirmation/sign-up template ที่เป็น OTP ประเภทอื่น

การขอลิงก์ไม่สร้างบัญชีใหม่ ไม่เพิ่มสิทธิ์ผู้ดูแล และแสดงข้อความเดียวกันสำหรับอีเมลที่ไม่มีบัญชี การเปลี่ยนรหัสใช้ตัวตนจาก `getUser()` ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่มี service-role key ใน browser รหัสผ่านและ token ไม่ถูกบันทึกใน application logs หลังสำเร็จระบบเพิกถอน refresh sessions ผ่าน global sign-out แล้วกลับหน้า login; access tokens เดิมอาจยังใช้ได้จนหมดอายุตามนโยบาย Supabase

Supabase Auth มีประวัติการเปลี่ยนรหัสของตนเอง ส่วน `password-reset` ใน `passlist.audit_events` เป็นบันทึกเสริม หากฐานข้อมูลแอปไม่พร้อมจะไม่ทำให้การเปลี่ยนรหัสที่สำเร็จแล้วกลายเป็นหน้าผิดพลาด การเข้า `/admin` ยังต้องมี `DATABASE_URL`, application role และสิทธิ์ที่ถูกต้อง

ตรวจระบบโดยไม่ส่งอีเมลจริงหรือเปลี่ยนรหัสบัญชีจริงด้วย `node --experimental-transform-types --test tests/password-recovery.test.mjs` และ `pnpm test:recovery:http` คำสั่งหลังรัน Next.js และ Auth จำลองภายในเครื่อง ตรวจ PKCE cookies, callback, แบบฟอร์ม, การเปลี่ยนรหัสและออกจากระบบครบเส้นทาง การส่งอีเมลถึงกล่องจริงและการตั้งรหัสจริงให้เจ้าของบัญชีทำผ่านหน้าฟอร์ม

## ตรวจซอร์สโดยไม่แก้ข้อมูลจริง

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
node --experimental-transform-types tools/check-postgres-queries.mjs
```

คำสั่งสุดท้ายสร้าง SQL ด้วยข้อมูลสมมติใน .sites-runtime ให้ตรวจบน PostgreSQL ภายใน transaction ที่ ROLLBACK ไม่มีคำสั่งนำเข้าข้อมูลจริง การ build/test ผ่านยังไม่ยืนยันว่า credentials, Auth หรือ production พร้อมแล้ว
