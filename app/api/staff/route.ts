import {auditContext,auditDatabase} from '../../../lib/audit-context';
import {isRootAdmin} from '../../../lib/access';
import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){const c=auditContext();if(c?.access?.role!=='admin')return json({error:'เฉพาะผู้ดูแลหลัก'},403);const rows=await auditDatabase().prepare('SELECT email,role,active,reason,granted_by,updated_at FROM staff_access WHERE owner_id=? ORDER BY email').bind(c.ownerId).all();return json({items:rows.results});}
export async function POST(req:Request){
 const c=auditContext();if(c?.access?.role!=='admin')return json({error:'เฉพาะผู้ดูแลหลัก'},403);
 try{
  const body=await req.json() as Record<string,unknown>,email=String(body.email||'').trim().toLowerCase(),role=String(body.role||''),reason=String(body.reason||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('อีเมลไม่ถูกต้อง');
  if(!['editor','viewer'].includes(role)||typeof body.active!=='boolean')throw new Error('บทบาทหรือสถานะไม่ถูกต้อง');
  if(reason.length<5||reason.length>500)throw new Error('ระบุเหตุผลอย่างน้อย 5 ตัวอักษร และไม่เกิน 500 ตัวอักษร');
  if(isRootAdmin(email,env.ADMIN_EMAILS||''))throw new Error('บัญชีผู้ดูแลหลักกำหนดจากการตั้งค่าระบบ');
  const db=auditDatabase();
  const row=await db.prepare('SELECT owner_id FROM staff_access WHERE email=?').bind(email).first<{owner_id:string}>();if(row&&row.owner_id!==c.ownerId)return json({error:'บัญชีนี้ได้รับมอบหมายจากผู้ดูแลรายอื่นอยู่แล้ว'},409);
  await db.prepare(`INSERT INTO staff_access(email,owner_id,role,active,reason,granted_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,active=excluded.active,reason=excluded.reason,granted_by=excluded.granted_by,updated_at=excluded.updated_at WHERE staff_access.owner_id=excluded.owner_id`).bind(email,c.ownerId,role,body.active?1:0,reason,c.actorId,new Date().toISOString()).run();
  return json({ok:true});
 }catch(error){return json({error:error instanceof Error?error.message:'บันทึกสิทธิ์ไม่สำเร็จ'},400);}
}
