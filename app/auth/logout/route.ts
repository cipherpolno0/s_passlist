import {supabaseServer} from '../../../lib/supabase-server';
export async function GET(request:Request){await(await supabaseServer()).auth.signOut();return Response.redirect(new URL('/',request.url),303);}
