import {requireChatGPTUser} from '../../chatgpt-auth';
import {pageAccess} from '../../../lib/audit-request';
import SecurityConsole from '../../components/SecurityConsole';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/admin/audit');const access=await pageAccess('/admin/audit');if(access?.role!=='admin')return <main>เฉพาะผู้ดูแลหลัก <a href="/admin">ย้อนกลับ</a></main>;return <SecurityConsole mode="audit"/>;}
