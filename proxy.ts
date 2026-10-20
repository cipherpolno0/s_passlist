import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
import {authConfigured,publicConfig} from './lib/supabase/config';
export async function proxy(request: NextRequest) {
  let response=NextResponse.next({request});
  response.headers.set('Cache-Control','private, no-store');
  if(!authConfigured())return response;
  const {url,key}=publicConfig();
  const supabase=createServerClient(url,key,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll(values,headers){
      for(const {name,value} of values)request.cookies.set(name,value);
      response=NextResponse.next({request});
      for(const {name,value,options} of values)response.cookies.set(name,value,options);
      for(const [name,value] of Object.entries(headers??{}))response.headers.set(name,value);
      response.headers.set('Cache-Control','private, no-store');
    },
  }});
  await supabase.auth.getUser();
  return response;
}
export const config={matcher:['/admin/:path*','/api/:path*','/auth/:path*','/reset-password']};
