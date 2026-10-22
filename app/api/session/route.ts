import {auditContext} from '../../../lib/audit-context';
export const dynamic='force-dynamic';
export async function GET(req:Request){const c=auditContext();return Response.json({signedIn:!!c?.actorId,role:c?.access?.role||null},{headers:{'Cache-Control':'no-store'}});}
export async function POST(req:Request){if(!auditContext()?.actorId)return Response.json({error:'กรุณาเข้าสู่ระบบ'},{status:401});return Response.redirect(new URL('/signout-with-chatgpt?return_to=/',req.url),303);}
