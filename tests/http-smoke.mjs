// Starts a bounded production HTTP test server; no browser or production services.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const mock=createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/auth/v1/user'&&req.headers.authorization==='Bearer test-verified-token'){
  res.end(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',email:'admin@example.test',email_confirmed_at:'2026-10-20T00:00:00Z',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{full_name:'Test Admin'},created_at:'2026-10-20T00:00:00Z'}));
 }else{res.statusCode=401;res.end(JSON.stringify({message:'Invalid session'}));}
});
await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
const mockPort=mock.address().port;
const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${mockPort}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-public-key',ADMIN_EMAILS:'admin@example.test',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
const base=`http://127.0.0.1:${port}`;
try{
 let ready=false;for(let i=0;i<100;i++){try{const response=await fetch(base+'/login');if(response.status===200){ready=true;break;}}catch{}await delay(100);}
 assert.ok(ready,output);
 const forged={'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':'admin@example.test'};
 assert.equal((await fetch(base+'/api/passlist',{headers:forged})).status,401);
 const admin=await fetch(base+'/admin',{headers:forged,redirect:'manual'});assert.equal(admin.status,307);assert.match(admin.headers.get('location'),/^\/login\?next=/);
 const meta=await fetch(base+'/api/public?action=meta',{headers:forged});assert.deepEqual((await meta.json()).viewer,{signedIn:false,isAdmin:false});
 // An actual Supabase SSR cookie is revalidated with the mocked Auth server.
 const session={access_token:'test-verified-token',refresh_token:'test-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:'11111111-1111-4111-8111-111111111111'}};
 const cookie='sb-127-auth-token=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url');
 const verified=await fetch(base+'/api/public?action=meta',{headers:{cookie}});assert.deepEqual((await verified.json()).viewer,{signedIn:true,isAdmin:true});assert.match(verified.headers.get('cache-control'),/no-store/);
 const bad=await fetch(base+'/auth/logout',{method:'POST',headers:{Origin:'https://evil.test',cookie},redirect:'manual'});assert.equal(bad.status,403);
 const login=await fetch(base+'/login');assert.match(await login.text(),/เข้าสู่ระบบผู้ดูแล/);
 const reset=await fetch(base+'/reset-password');assert.equal(reset.status,200);assert.match(await reset.text(),/ตั้งรหัสผ่านใหม่/);
 console.log('Production HTTP smoke passed: real SSR cookie validation, forged-header rejection, login redirect, private cache headers, logout CSRF and auth pages.');
}finally{
 child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));await new Promise(resolve=>mock.close(resolve));
}
