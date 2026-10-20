import {createClient} from '@supabase/supabase-js';
if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new Error('Missing private Storage configuration');
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}}),cutoff=Date.now()-24*60*60*1000;
async function collect(bucket,prefix,depth=0){
 if(depth>2)throw new Error('Unexpected storage folder depth');const files=[];
 for(let offset=0;;offset+=100){
  const {data,error}=await bucket.list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(error)throw new Error('Cannot list temporary storage');
  for(const object of data){const key=prefix+'/'+object.name;
   if(object.id){const time=Date.parse(object.updated_at||object.created_at);if(Number.isFinite(time)&&time<cutoff)files.push(key);}
   else files.push(...await collect(bucket,key,depth+1));
  }
  if(data.length<100)break;
 }
 return files;
}
for(const [bucketName,prefix] of [[process.env.SUPABASE_STORAGE_BUCKET||'passlist-private','exports'],[process.env.SUPABASE_UPLOAD_BUCKET||'passlist-uploads','uploads']]){
 const bucket=client.storage.from(bucketName),keys=await collect(bucket,prefix);
 console.log(`${prefix}: ${keys.length} expired temporary objects`);
 if(process.argv.includes('--apply'))for(let i=0;i<keys.length;i+=100){const {error}=await bucket.remove(keys.slice(i,i+100));if(error)throw new Error('Temporary object cleanup failed');}
}
