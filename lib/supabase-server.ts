import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export async function supabaseServer(){
 const store=await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>store.getAll(),setAll:items=>{try{for(const item of items)store.set(item.name,item.value,item.options);}catch{/* Server components cannot write cookies; proxy refreshes them. */}}}});
}
