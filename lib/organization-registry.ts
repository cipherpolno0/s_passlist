import {gunzipSync,strFromU8} from 'fflate';
import bundledSeed from '../data/organization-registry-v1.json';
import manifest from '../data/organization-registry-v1.manifest.json';
export const ORGANIZATION_VERSION=manifest.version;
export const ORGANIZATION_SOURCE=manifest.source;
export const ORGANIZATION_SHA256=manifest.sourceSha256;
export const ORGANIZATION_ROWS=manifest.rows;
export const ORGANIZATION_MANIFEST=manifest;
export type OrganizationSeedRow=[number,string,string,string,string];
let seed:OrganizationSeedRow[]|undefined;
export function organizationNameKey(value:string){return String(value||'').normalize('NFC').trim().replace(/^(?:ร\.\s*ร\.|รร\.)\s*/,'โรงเรียน').replace(/[\s\u200b\ufeff.()\-_/：:*]/g,'').toLowerCase();}
export function getOrganizationSeed(){if(seed)return seed;const compressed=Uint8Array.from(atob(bundledSeed.trim()),c=>c.charCodeAt(0));const rows=JSON.parse(strFromU8(gunzipSync(compressed))) as OrganizationSeedRow[];if(rows.length!==ORGANIZATION_ROWS||rows.some(row=>row.length!==5))throw new Error('จำนวนแถวทะเบียนองค์กรไม่ตรงต้นฉบับ');return seed=rows;}
