# การเชื่อมต่อและเผยแพร่ s_passlist

สถานะตรวจสอบ 20 ตุลาคม 2569

## เว็บและซอร์สโค้ด

- เว็บปัจจุบัน: https://s-passlist.kungrobcipher.chatgpt.site/ เวอร์ชัน 38
- ซอร์สต้นทาง: `46b64dea161cd43aff50d3b2079aa24396c1d600`
- GitHub: https://github.com/cipherpolno0/s_passlist บัญชี `cipherpolno0` มีสิทธิ์เขียนและดูแล repository
- ผู้ใช้อนุญาตเผยแพร่ข้อมูลอ้างอิงวัด/สถานศึกษาและข้อมูลสรุปจากไฟล์แนบใน repository สาธารณะนี้ เมื่อ 20 ตุลาคม 2569 เวลา 19:34 น. (ประเทศไทย) ซอร์สเต็มจาก Sites เวอร์ชัน 38 พร้อมผลตรวจสอบอยู่ในชุด commit นี้
- ซอร์สชุดนี้มีหน้าเว็บ API ไลบรารี scripts ทะเบียนอ้างอิง และ SQLite migrations ครบ ไม่รวมไฟล์ environment, token, ฐานข้อมูลผลสอบ หรือไฟล์ Excel ของผู้ใช้งาน
- ช่อง “สอบได้” เป็นสีแดงเมื่อสถิติไม่เท่ากับจำนวนรายชื่อที่ยังใช้งานอยู่ในชุดข้อมูลนำเข้าสำเร็จ โดยเทียบปี จังหวัด ประเภท ชั้น และนิกาย/สังกัดเมื่อระบุ

## ข้อกำหนด runtime ปัจจุบัน

เว็บใช้ Vinext บน Cloudflare Workers, D1 binding `DB`, R2 binding `BUCKET` และ Sites authentication โดยกำหนดผู้ดูแลด้วย `ADMIN_EMAILS` ฝั่งเซิร์ฟเวอร์

ใช้ Node.js 22.13 ขึ้นไปและ pnpm ตามเวอร์ชันใน `package.json`; ติดตั้งด้วย `npm run install:ci` และ build ด้วย `npm run build` ต้องกำหนด D1/R2 และระบบยืนยันตัวตนจริงจึงจะให้บริการ API ได้ การ build สำเร็จเพียงอย่างเดียวไม่ได้แปลว่าได้เชื่อมฐานข้อมูล production แล้ว

ห้ามนำโค้ดรับ header `oai-authenticated-user-*` ไปเชื่อถือบนโฮสต์ทั่วไปโดยไม่มี trusted authentication proxy ของ Sites เพราะผู้เรียกอาจปลอม header ได้

## Vercel และ Supabase

- Vercel ทีมเป้าหมาย `kungrobcipher-8723`: การเชื่อมต่อปัจจุบันตอบกลับ HTTP 403 ไม่อนุญาตเข้าถึงทีม จึงยังตรวจหรือสร้างโปรเจกต์ `s_passlist` ไม่ได้
- Supabase โปรเจกต์ `zqdzfugqvmxwoteiptob`: การเชื่อมต่อปัจจุบันตอบกลับว่าไม่มีสิทธิ์ดำเนินการ จึงยังไม่รัน migration หรือเปลี่ยนแปลงข้อมูลในโปรเจกต์นี้
- ไม่ใช้โปรเจกต์ Supabase หรือทีม Vercel อื่นแทนเป้าหมายที่ผู้ใช้ระบุ

การย้ายไป Vercel + Supabase ต้องปรับ runtime, SQL/transaction, การเก็บไฟล์ และ authentication ก่อน: เปลี่ยน `cloudflare:workers` กับ D1 เป็น PostgreSQL/Supabase; แปลง SQLite migrations; ย้าย R2 เป็น storage ที่เข้าถึงจาก Vercel; เปลี่ยน Sites sign-in เป็น session ที่ตรวจสอบได้บน Vercel; ตรวจ RLS, สิทธิ์ผู้ดูแล, import/export, การคำนวณสถิติ และการกู้ข้อมูลก่อนสลับเว็บ production

โค้ดปัจจุบันยังไม่พร้อม deploy ตรงบน Vercel ด้วย `next build` และยังไม่มี PostgreSQL migration ที่ผ่านการทดสอบ อย่านำ SQLite migrations ใน `drizzle/` ไปรันบน Supabase โดยตรง

## ตรวจสอบซอร์ส

```sh
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-importer.mjs
node scripts/test-results-display.mjs
node scripts/test-retained-statistics.mjs
npm run build
node tests/statistics-source-smoke.mjs
```

Smoke test ใช้ D1/R2 จำลองแยกจากข้อมูลจริง ต้อง build ก่อนรัน
