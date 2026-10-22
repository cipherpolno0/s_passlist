import {requestContext,logAccess} from '../../../lib/audit-request';
import {withAuditContext} from '../../../lib/audit-context';
import {supabaseServer} from '../../../lib/supabase-server';
export const dynamic='force-dynamic';
export async function GET(req:Request){const c=await requestContext(req);return Response.json({signedIn:!!c.actorId,role:c.access?.role||null},{headers:{'Cache-Control':'no-store'}});}
export async function POST(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return new Response('Forbidden',{status:403});const c=await requestContext(req);c.action='logout';await withAuditContext(c,()=>logAccess(c,303));await(await supabaseServer()).auth.signOut();return Response.redirect(new URL('/',req.url),303);}
