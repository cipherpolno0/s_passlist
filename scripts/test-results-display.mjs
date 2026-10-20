import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
const out='.sites-runtime/results-test';fs.mkdirSync(out,{recursive:true});
execFileSync('node_modules/.bin/tsc',['app/components/ExamResultsTable.tsx','app/components/ProvinceDirectory.tsx','--rootDir','.','--outDir',out,'--jsx','react-jsx','--module','commonjs','--target','ES2022','--esModuleInterop','--skipLibCheck'],{stdio:'inherit'});
fs.writeFileSync(out+'/package.json','{"type":"commonjs"}');
execFileSync(process.execPath,['--test','tests/results-display.cjs'],{stdio:'inherit'});
