import type {Access} from './audit-context';
export function isRootAdmin(email:string,adminEmails:string){return adminEmails.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());}
export async function resolveAccess(db:D1Database,userId:string,email:string,adminEmails:string):Promise<Access|null>{
 if(!userId||!email)return null;
 if(isRootAdmin(email,adminEmails))return {userId,email,ownerId:process.env.DATA_OWNER_ID||userId,role:'admin'};
 const row=await db.prepare('SELECT owner_id,role FROM staff_access WHERE email=? AND active=1').bind(email.trim().toLowerCase()).first<{owner_id:string;role:'viewer'|'editor'}>();
 return row?{userId,email,ownerId:row.owner_id,role:row.role}:null;
}
export function allowedRequest(access:Access|null,path:string,method:string,action:string){
 if(!access)return false;
 if(path.startsWith('/api/audit')||path.startsWith('/api/staff')||path.startsWith('/admin/audit')||path.startsWith('/admin/staff'))return access.role==='admin';
 if(method==='GET'||method==='HEAD'){if(access.role==='viewer'&&path==='/api/passlist'&&['preview','issues','registry-report'].includes(action))return false;return true;}
 if(access.role==='admin')return true;
 return access.role==='editor'&&!['/api/temple-registry','/api/organization-registry'].includes(path)&&!['purge-record','delete-batch'].includes(action);
}
