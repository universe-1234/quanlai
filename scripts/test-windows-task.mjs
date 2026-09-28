import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { createTaskAdapter } from '../server/system-schedule.mjs';
const exec=promisify(execFile);
const dir=await mkdtemp(path.join(os.tmpdir(),'Quanlai Task QA '));
const taskName=`QuanLai QA ${process.pid}`;
const script=path.join(dir,'record.mjs');
await writeFile(script,`import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(path.join(dir,'ran.txt'))},'mock-only');`);
const action={execute:process.execPath,arguments:`"${script}"`,workingDirectory:dir};
const tasks=createTaskAdapter({taskName,action});
try {
 await tasks.register('23:59'); assert.equal(tasks.matches(await tasks.query(),'23:59'),true);
 await exec('schtasks.exe',['/Run','/TN',taskName],{windowsHide:true});
 let result='';for(let i=0;i<30;i++){try{result=await readFile(path.join(dir,'ran.txt'),'utf8');break;}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.equal(result,'mock-only');await tasks.remove();assert.equal((await tasks.query()).exists,false);
 console.log('PASS: dedicated Windows daily/logon/resume task, spaced path execution, query and removal');
}catch(e){console.error(e.cause?.stderr || e.message);throw e;}finally{await tasks.remove();await rm(dir,{recursive:true,force:true});}
