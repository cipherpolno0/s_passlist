import {requireChatGPTUser} from '../../chatgpt-auth';
import {auditContext} from '../../../lib/audit-context';
import SecurityConsole from '../../components/SecurityConsole';
export const dynamic='force-dynamic';
export default async function StaffPage(){await requireChatGPTUser('/admin/staff');if(auditContext()?.access?.role!=='admin')return <main>เฉพาะผู้ดูแลหลัก <a href="/admin">ย้อนกลับ</a></main>;return <SecurityConsole mode="staff"/>;}
