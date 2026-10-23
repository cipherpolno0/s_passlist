import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
export async function proxy(request:NextRequest){
 let response=NextResponse.next({request});
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return response;
 const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>request.cookies.getAll(),setAll:(items,headers)=>{for(const item of items)request.cookies.set(item.name,item.value);response=NextResponse.next({request});for(const item of items)response.cookies.set(item.name,item.value,item.options);for(const [name,value] of Object.entries(headers||{}))response.headers.set(name,value);}}});
 await supabase.auth.getUser();return response;
}
export const config={matcher:['/admin/:path*','/login','/forgot-password','/reset-password','/auth/:path*','/api/:path*']};
