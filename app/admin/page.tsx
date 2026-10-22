import {canManageData,auditContext} from '../../lib/audit-context';
import {requireChatGPTUser} from '../chatgpt-auth';
import PasslistApp from '../components/PasslistApp';
export const dynamic='force-dynamic';
export default async function AdminPage(){const user=await requireChatGPTUser('/admin');if(!canManageData(user))return <main><h1>พื้นที่สำหรับผู้ดูแลระบบ</h1><p>บัญชีนี้ไม่มีสิทธิ์นำเข้าหรือแก้ไขข้อมูล</p><a href="/">กลับหน้าสืบค้น</a></main>;return <PasslistApp role={auditContext()?.access?.role||'viewer'}/>;}
