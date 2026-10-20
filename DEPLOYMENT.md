# Next.js + Vercel + Supabase

เป้าหมาย: GitHub `cipherpolno0/s_passlist`, Supabase `news_passlist`
(`ywtewiwhwurvuslarmme`), Vercel `kungrobcipher-8723/news_passlist`.
ซอร์สฐานคือ Sites เวอร์ชัน 38 เว็บต้นทางยังเป็น Cloudflare รุ่นเดิมจนกว่าจะสลับโฮสต์จริง

## สิ่งที่เปลี่ยน

- `npm run build` เรียก `next build` และสร้าง `.next/routes-manifest.json` จริง
- Next.js App Router + React + TypeScript + Tailwind; ใช้ Node.js 22.13 ขึ้นไป
- PostgreSQL ผ่าน `postgres` ใช้ transaction pooler และ `prepare:false` สำหรับ serverless
- ตาราง 11 ตารางอยู่ใน schema ส่วนตัว `passlist`; เปิด RLS ทุกตารางและไม่มี browser grants
- Next.js API เป็นผู้ตรวจสิทธิ์เจ้าของข้อมูลและการเผยแพร่; `/api/public` ส่งเฉพาะคอลัมน์ที่อนุญาต
- Supabase Auth แบบ email/password ใช้ cookie SSR และ `getUser()` ตรวจตัวตนฝั่งเซิร์ฟเวอร์
- ผู้ดูแลกำหนดด้วยอีเมลที่ยืนยันแล้วและ `ADMIN_EMAILS` ฝั่งเซิร์ฟเวอร์ ไม่มีการเชื่อถือ Sites headers หรือ user metadata เพื่ออนุมัติสิทธิ์
- Supabase Storage แบบ private: `passlist-private` สำหรับต้นฉบับ/preview/export และ `passlist-uploads` สำหรับอัปโหลดชั่วคราว
- อัปโหลดตรงไป Storage ด้วย signed upload URL จำกัด 10 MB แล้ว Next.js ตรวจเจ้าของและอ่านไฟล์ต่อ
- ดาวน์โหลดต้นฉบับและผลส่งออกขนาดใหญ่ผ่าน signed URL อายุ 60 วินาที
- งานเติมข้อมูลเก่าทำเป็นคำขอที่มีขอบเขต/lease ผ่าน `/api/maintenance` ขณะเปิดหน้าผู้ดูแล แทน Cloudflare `waitUntil`

## ติดตั้ง Supabase

1. สร้างหรือใช้โปรเจกต์ `ywtewiwhwurvuslarmme` ตามเป้าหมาย ห้ามใช้โปรเจกต์อื่นแทน
2. คัดลอก `.env.example` เป็น `.env.local` แล้วตั้งค่าจาก Connect/API settings ของโปรเจกต์จริง
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `DATABASE_URL`: transaction pooler URI port 6543 ใช้บัญชี backend ที่เข้าถึง schema `passlist` ได้ รหัสผ่านใน URI ต้อง URL-encode
   - `SUPABASE_SECRET_KEY`: Supabase server secret หรือ legacy service-role key ใช้เฉพาะเซิร์ฟเวอร์
   - `SUPABASE_STORAGE_BUCKET=passlist-private`
   - `SUPABASE_UPLOAD_BUCKET=passlist-uploads`
   - `ADMIN_EMAILS`: อีเมลผู้ดูแลที่ยืนยันแล้ว คั่นด้วย comma
3. รัน `npm ci` แล้ว `npm run db:migrate` ด้วย DATABASE_URL ของโปรเจกต์เป้าหมาย
   migration จะสร้าง schema, indexes, helper functions, RLS และ private buckets เป็น transaction
   การรันซ้ำไม่เปลี่ยน migration ที่ติดตั้งแล้ว; checksum ไม่ตรงจะหยุด
   ถ้ารันผ่าน SQL Editor ให้รันไฟล์ `supabase/migrations/*.sql` ตามลำดับ ตามด้วย `supabase/storage.sql` เพียงครั้งเดียว
4. ใน Supabase Auth สร้าง/เชิญบัญชีผู้ดูแลและยืนยันอีเมล ใช้ UUID ของบัญชีใหม่นี้เมื่อต้องย้ายข้อมูลเจ้าของเดิม
   ไม่เปิดสมัครสมาชิกบนหน้าเว็บ ผู้ใช้ทั่วไปสืบค้นได้โดยไม่ต้องเข้าสู่ระบบ
5. ตั้ง Auth Site URL เป็นโดเมนจริงของ Vercel และเพิ่ม Redirect URL
   `https://<โดเมนจริง>/auth/callback` (พร้อม query `next=/reset-password` หากใช้ allowlist แบบ exact)
   สำหรับ local เพิ่ม `http://localhost:3000/auth/callback`
   ตั้ง SMTP สำหรับอีเมล reset ใน production
6. รัน `npm run db:check` เพื่อตรวจ schema/RLS และ private buckets โดยไม่แก้ข้อมูลผลสอบ

RLS ใน schema ส่วนตัวไม่มี policies ให้ anon/authenticated ตั้งใจให้เข้าทาง Next.js API เท่านั้น
DATABASE_URL ต้องเป็น server-only connection ที่มีสิทธิ์บน schema และเข้าถึงข้อมูลได้ เช่น project postgres connection
อย่าเปิด schema `passlist` ใน Data API หรือใส่ DATABASE_URL/secret key ในตัวแปร NEXT_PUBLIC_

## ย้ายข้อมูลเดิมอย่างมีการตรวจสอบ

โค้ดเปลี่ยนแพลตฟอร์มไม่ได้คัดลอกข้อมูล production โดยอัตโนมัติ ต้องมี D1 SQLite backup
และ R2 object export ก่อนย้ายจริง เก็บไฟล์เหล่านี้เป็นความลับและห้าม commit ขึ้น GitHub

1. ส่งออก D1 เป็น SQLite database และ R2 เป็นโฟลเดอร์คง object keys `source/<batch-id>` และ `preview/<batch-id>`
2. สร้างไฟล์ส่วนตัว `owners.json` รูปแบบ `{"<Sites owner ID>":"<Supabase Auth UUID>"}`
3. ตรวจแบบ dry run ก่อน:
   `node --env-file=.env.local scripts/import-sites-data.mjs --sqlite /private/backup.sqlite --objects /private/r2 --owner-map /private/owners.json`
4. เมื่อจำนวนแถว/ไฟล์ถูกต้อง เพิ่ม `--apply` สคริปต์จะตรวจว่าบัญชีผู้ดูแลใหม่มีจริง ตรวจปลายทางว่าง
   คัดลอกและตรวจ SHA-256 ของ object เดิมก่อนยอมใช้ซ้ำ แล้วนำเข้าตารางใน transaction พร้อมตรวจจำนวนแถว
   จะไม่เขียนทับข้อมูลที่มีอยู่ในปลายทาง ถ้า DB import ล้มเหลว object ที่คัดลอกแล้วจะคงเป็นสำเนาเพื่อให้ retry ได้
5. ตรวจผลสืบค้น สถิติ รายชื่อ และไฟล์ต้นฉบับก่อนสลับผู้ใช้ไปโดเมนใหม่

SQLite migrations ใน `drizzle/` และ tests ใน `tests/legacy-cloudflare/` เป็นประวัติเดิม ห้ามนำ SQLite migrations ไปรันบน PostgreSQL

## ตั้ง Vercel

เชื่อม GitHub repository ข้างต้นกับ `news_passlist` และใช้ repository root:

| Setting | Value |
|---|---|
| Framework | Next.js |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | ค่าเริ่มต้น Next.js; ไม่ตั้ง `dist` |
| Node.js | 22.x หรือ 24.x |

ตั้ง env ทั้งหมดตาม `.env.example` ใน Vercel environment ที่ต้องการก่อน build
Publishable key และ URL ถูกฝังใน client ตอน build จึงต้อง redeploy เมื่อเปลี่ยนค่า
แยก credentials/database สำหรับ Preview จาก Production แล้วทดสอบ preview ก่อนสลับ production
ไม่จำเป็นต้องตั้ง custom domain เพื่อแก้ build failure

## ดูแลไฟล์ชั่วคราว

`uploads/` ลบทันทีหลังเซิร์ฟเวอร์รับไฟล์สำเร็จ แต่การอัปโหลดที่ยกเลิกและ `exports/` อาจค้างอยู่
ใช้ `node --env-file=.env.local scripts/cleanup-storage.mjs` เพื่อตรวจจำนวนไฟล์เก่ากว่า 24 ชั่วโมง
และเพิ่ม `--apply` เพื่อลบเฉพาะสอง prefix นี้ ห้ามลบ `source/` หรือ `preview/`

## ตรวจสอบ

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run db:check
```

`npm test` ใช้ข้อมูลทดสอบและ PostgreSQL engine ผ่าน PGlite ไม่แตะ Supabase production
การ build ผ่านไม่ยืนยันว่า production ตั้ง secrets/schema/email ถูกต้อง ต้องตรวจบนโปรเจกต์จริงหลังได้สิทธิ์
