# ผลตรวจสอบซอร์ส s_passlist

ตรวจเมื่อ 20 ตุลาคม 2569 จาก Sites เวอร์ชัน 38, commit `46b64dea161cd43aff50d3b2079aa24396c1d600`

- TypeScript `tsc --noEmit`: ผ่าน
- Excel importer: ผ่าน 41 ข้อ
- ตารางแสดงผล: ผ่าน 12 ข้อ หลังปรับคำคาดหวังใน tests ให้ตรงกับหัวคอลัมน์ “เลขที่ ปกศ.” ที่ใช้อยู่จริง
- การอ่านสถิติจาก Excel เดิม: ผ่าน 10 ข้อ
- Vinext production build: ผ่านครบ 8 routes
- Statistics integration smoke test: ผ่าน บน D1/R2 จำลอง รวม migration ทั้ง 12 ไฟล์ การอ่านต้นฉบับอัตโนมัติ deduplication ความขัดแย้ง การส่งออก การลบ/คืนชุดข้อมูล และสิทธิ์เจ้าของข้อมูล
- เพิ่ม regression assertions การนับรายชื่อสำหรับนักธรรม/ธรรมศึกษา ทั้งตรี โท เอก: ตัวเลขตรงเมื่อมีสองรายชื่อ; ตัวเลขต่างเมื่อกรองนิกายเหลือหนึ่งรายชื่อ; จำกัดวัดและจับคู่สำนักเรียน; ไม่นับปี/จังหวัดอื่น ผู้ใช้คนอื่น ชุด draft และรายชื่อในถังขยะ

ไม่ได้ทดสอบใน browser เนื่องจากไม่มี browser QA ที่รองรับในสภาพแวดล้อมนี้ ไม่ได้แก้หรือย้ายข้อมูลจริง ไม่ได้ deploy Vercel และไม่ได้รัน PostgreSQL migration บน Supabase

ไฟล์โค้ดแอปในชุดนี้ตรงกับต้นทาง; การเปลี่ยนเพิ่มเติมอยู่ใน README, DEPLOYMENT.md, VERIFICATION.md และชุดทดสอบสองไฟล์ เว็บ Sites ที่เผยแพร่อยู่ยังเป็นเวอร์ชัน 38

## ตรวจชุด Next.js/PostgreSQL ต่อ 21 ตุลาคม 2569

- `pnpm test`: ผ่าน 73 รายการ รวมการ rollback importer เมื่อปลายทางไม่ว่าง/ข้อมูลต้นทางเปลี่ยน/ไฟล์ปลายทางไม่ตรง SHA-256
- `pnpm typecheck`: ผ่าน
- `pnpm build`: ผ่าน Next.js 16.3.4 สร้าง `.next/routes-manifest.json` แล้ว
- 33 application SQL statements: ตรวจ PREPARE และอ่านข้อมูลสมมติบน Supabase จริงด้วย transaction ที่ ROLLBACK ผ่าน
- ไม่ได้ทดสอบ credentials, login จริง, migration ข้อมูลจริง, browser หรือ Vercel deployment ของชุดนี้ เพราะขั้นตอน credentials/export ที่เคยถูกปฏิเสธยังต้องได้รับการอนุญาต
