import 'server-only';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {publicConfig} from './config';
export async function createClient() {
  const jar=await cookies(),{url,key}=publicConfig();
  return createServerClient(url,key,{cookies:{
    getAll:()=>jar.getAll(),
    setAll(values){try{for(const {name,value,options} of values)jar.set(name,value,options);}catch{/* Server Component: proxy persists refreshed cookies. */}},
  }});
}
