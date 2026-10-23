import { gunzipSync, strFromU8 } from 'fflate';
import bundledSeed from '../data/temple-registry-v1.seed.json';
import { normalizeProvince } from './scope';

export const TEMPLE_REGISTRY_VERSION='report-temple-2026-10-20-v1';
export const TEMPLE_REGISTRY_SOURCE='Report_Temple.xlsx';
export const TEMPLE_REGISTRY_SHA256='67aef90928017f25b9bdd68ceddff89968945fbd52519afe92e350c3fe285a1c';
export const TEMPLE_REGISTRY_ROWS=44704;
export const TEMPLE_REGISTRY_CHUNK=500;

export type TempleSeedRow=[number,string,string,string,string,string,string];
let seedCache:TempleSeedRow[]|undefined;

export function templeNameKey(value:string){
 return String(value||'').normalize('NFC').replace(/^(?:สำนักเรียน)?วัด\s*/,'').replace(/[\s\u200b\ufeff.()\-_/：:*]/g,'').toLowerCase();
}
function compact(value:string){return String(value||'').normalize('NFC').replace(/[\s\u200b\ufeff.()\-_/：:*]/g,'').toLowerCase();}
export function templeAddressKey(value:string,kind:'subdistrict'|'district'|'province'){
 let input=String(value||'').normalize('NFC');
 if(kind==='subdistrict')input=input.replace(/^(?:ตำบล|ต\.|แขวง)\s*/,'');
 if(kind==='district')input=input.replace(/^(?:อำเภอ|อ\.|เขต)\s*/,'');
 if(kind==='province')input=normalizeProvince(input)||input.replace(/^(?:จังหวัด|จว\.|จ\.)\s*/,'');
 return compact(input);
}

export function getTempleRegistrySeed():TempleSeedRow[]{
 if(seedCache)return seedCache;
 const decoded=atob(bundledSeed.trim());
 const compressed=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 const parsed=JSON.parse(strFromU8(gunzipSync(compressed))) as unknown;
 if(!Array.isArray(parsed)||parsed.length!==TEMPLE_REGISTRY_ROWS||parsed.some(row=>!Array.isArray(row)||row.length!==7))throw new Error('จำนวนแถวในทะเบียนวัดอ้างอิงไม่ตรงกับต้นฉบับ');
 seedCache=parsed as TempleSeedRow[];
 return seedCache;
}
