import {postgres} from '../../../lib/postgres';
export const dynamic='force-dynamic';
export async function GET(){try{await postgres().query('SELECT 1 FROM passlist.records LIMIT 1');return Response.json({ok:true,siteVersion:39},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});}}
