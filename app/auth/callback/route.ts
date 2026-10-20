import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '../../../lib/supabase/server';
import {safeReturnPath} from '../../../lib/auth-path';
export async function GET(request:NextRequest){
 const url=request.nextUrl,code=url.searchParams.get('code');
 if(code){const supabase=await createClient();const {error}=await supabase.auth.exchangeCodeForSession(code);
  if(!error){const next=url.searchParams.get('next');const destination=next==='/reset-password'?next:safeReturnPath(next);const response=NextResponse.redirect(new URL(destination,url.origin));response.headers.set('Cache-Control','private, no-store');return response;}}
 return NextResponse.redirect(new URL('/login?error=callback',url.origin));
}
