import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '../../../lib/supabase/server';
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return new Response('Forbidden',{status:403});
 const supabase=await createClient();await supabase.auth.signOut();
 const response=NextResponse.redirect(new URL('/',request.url),303);response.headers.set('Cache-Control','private, no-store');return response;
}
