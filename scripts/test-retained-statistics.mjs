import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
const out='.sites-runtime/retained-statistics-test';fs.mkdirSync(out,{recursive:true});
execFileSync('node_modules/.bin/tsc',['lib/retained-statistics.ts','types/exceljs-browser.d.ts','--outDir',out,'--module','commonjs','--target','ES2022','--esModuleInterop','--skipLibCheck'],{stdio:'inherit'});
fs.writeFileSync(out+'/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['--test','tests/retained-statistics.cjs'],{stdio:'inherit'});
