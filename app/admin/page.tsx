import {requireChatGPTUser} from '../chatgpt-auth';
import {pageAccess} from '../../lib/audit-request';
import PasslistApp from '../components/PasslistApp';
export const dynamic='force-dynamic';
export default async function AdminPage(){await requireChatGPTUser('/admin');const access=await pageAccess('/admin');if(!access)return <main><h1>พื้นที่สำหรับผู้ดูแลระบบ</h1><p>บัญชีนี้ไม่มีสิทธิ์นำเข้าหรือแก้ไขข้อมูล</p><a href="/">กลับหน้าสืบค้น</a></main>;return <PasslistApp role={access.role}/>;}
