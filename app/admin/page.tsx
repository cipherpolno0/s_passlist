import Maintenance from '../components/Maintenance';
import {requireUser} from '../../lib/auth';
import {isAdminEmail} from '../../lib/admin';
import PasslistApp from '../components/PasslistApp';
export const dynamic='force-dynamic';
export default async function AdminPage(){const user=await requireUser('/admin');if(!isAdminEmail(user.email))return <main><h1>พื้นที่สำหรับผู้ดูแลระบบ</h1><p>บัญชีนี้ไม่มีสิทธิ์นำเข้าหรือแก้ไขข้อมูล</p><a href="/">กลับหน้าสืบค้น</a><form action="/auth/logout" method="post"><button>ออกจากระบบ</button></form></main>;return <><Maintenance/><PasslistApp/></>;}
