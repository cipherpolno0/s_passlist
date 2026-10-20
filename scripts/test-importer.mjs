import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
fs.mkdirSync('.sites-runtime/test-build',{recursive:true});
execFileSync('node_modules/.bin/tsc',['lib/excel.ts','lib/thai-workbook.ts','lib/certificate-number.ts','lib/constants.ts','types/exceljs-browser.d.ts','--outDir','.sites-runtime/test-build','--module','commonjs','--target','ES2022','--esModuleInterop','--skipLibCheck'],{stdio:'inherit'});
fs.writeFileSync('.sites-runtime/test-build/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['--test','tests/importer.cjs'],{stdio:'inherit'});
