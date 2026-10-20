import AuthForm from '../components/AuthForm';
import {authConfigured} from '../../lib/supabase/config';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{next?:string;error?:string;updated?:string}>}){
 const params=await searchParams;
 return <>{params.error?<p className="alert error" role="alert">ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่</p>:null}{params.updated?<p role="status">เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบอีกครั้ง</p>:null}<AuthForm mode="login" next={params.next} configured={authConfigured()}/></>;
}
