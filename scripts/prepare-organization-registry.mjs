// Read-only extraction of the supplied workbook. Only the raw listing is imported.
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
const input=process.argv[2];if(!input)throw new Error('Pass the source workbook path');
const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(input);
const sheet=workbook.getWorksheet('รายชื่อสถานศึกษา');if(!sheet)throw new Error('Missing raw listing');
const rows=[];for(let i=2;i<=sheet.rowCount;i++){const row=sheet.getRow(i);const values=[1,2,3,4,5].map(c=>row.getCell(c).text.normalize('NFC').trim());if(!values[1])throw new Error('Missing organization name at row '+i);rows.push([Number(values[0]),...values.slice(1)]);}
if(rows.length!==49519||new Set(rows.map(r=>r[0])).size!==rows.length)throw new Error('Source row count/order mismatch');
const provinces=new Set(rows.map(r=>r[4]));if(provinces.size!==77)throw new Error('Province count mismatch');
const locations=new Map();for(const r of rows){const key=JSON.stringify(r.slice(1));locations.set(key,(locations.get(key)||0)+1);}
const summary={source:'รายชื่อสถานศึกษา_dhammastudy_2569.xlsx',version:'dhammastudy-organizations-2569-2026-10-20-v1',sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'),sheet:sheet.name,rows:rows.length,provinces:provinces.size,incompleteAddresses:rows.filter(r=>r.slice(2).some(v=>!v)).length,duplicateAddressGroups:[...locations.values()].filter(n=>n>1).length,duplicateExtraRows:[...locations.values()].reduce((n,v)=>n+v-1,0)};
fs.writeFileSync('data/organization-registry-v1.json',JSON.stringify(gzipSync(JSON.stringify(rows),{level:9}).toString('base64'))+'\n');
fs.writeFileSync('data/organization-registry-v1.manifest.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
