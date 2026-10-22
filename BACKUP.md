# สำรองเว็บไซต์ s_passlist รุ่น 39

วันที่ 22 ตุลาคม 2569 (Asia/Bangkok)

ต้นทาง: https://s-passlist.kungrobcipher.chatgpt.site

Sites source commit: `478f37082fa9b8bd220c62cdb4437e187c688a9c`

สาขานี้เก็บซอร์สที่ติดตามใน Git ครบ 222 ไฟล์ของรุ่นที่เผยแพร่จริง พร้อมระบบประวัติการเข้าใช้งาน/เปลี่ยนข้อมูลและการมอบหมายสิทธิ์ รุ่นนี้ใช้ Sites / Cloudflare Workers + D1/R2 และ ChatGPT sign-in

ตรวจจำนวนไฟล์และ SHA-256 ได้จาก `BACKUP-MANIFEST.json` ใช้ `db/schema.ts` และ migrations ใน `drizzle/` สำหรับโครงสร้างฐานข้อมูล รวม migration 0012 และ triggers บันทึกหลักฐาน

ผ่านการตรวจ TypeScript, build และ integration tests ของ import/search/lifecycle, audit/permissions/concurrent actors และ retained statistics ก่อนสำรอง

## ขอบเขตการสำรอง

เป็นการสำรองซอร์ส โครงสร้างฐานข้อมูล ทะเบียนอ้างอิงที่เผยแพร่ไว้ใน repository นี้แล้ว และชุดทดสอบ ไม่รวมแถวข้อมูลจริงใน D1 ไฟล์ต้นฉบับ/preview ใน R2 รายชื่อผู้สอบ บัญชีผู้ใช้ รายการมอบหมายสิทธิ์ หรือประวัติหลักฐานจริง การกู้คืนข้อมูลจริงต้องใช้สำเนาฐานข้อมูลและไฟล์จัดเก็บแยกต่างหาก

## นำไปใช้งาน

เลือกสาขานี้แล้วดาวน์โหลด ZIP หรือ clone ด้วย Git ใช้ Node.js และ pnpm ตาม `package.json`/lockfile การพัฒนาและทดสอบอยู่ใน `README.md` ก่อนเผยแพร่ไปยังสภาพแวดล้อมใหม่ต้องตั้งค่าฐานข้อมูล ไฟล์จัดเก็บ ระบบยืนยันตัวตนและ ADMIN_EMAILS ใหม่ผ่านการตั้งค่าฝั่งเซิร์ฟเวอร์

ไฟล์ `.openai/hosting.json` ระบุ Site ต้นทางเพื่อรักษาที่มา ไม่ใช่ข้อมูลลับ และไม่ได้ให้สิทธิ์เผยแพร่ด้วยตัวเอง
