import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createTaskAdapter } from '../server/system-schedule.mjs';
import { createStore } from '../server/store.mjs';
const exec=promisify(execFile), sleep=ms=>new Promise(r=>setTimeout(r,ms));
if (process.platform !== 'win32') throw Error('Windows only');
const pkg=JSON.parse(await readFile('package.json','utf8'));
// Only the separate QA app is ever installed/uninstalled by this script.
const installer=path.resolve(`release-qa/QuanLai-Setup-${pkg.version}-x64.exe`);
const root=await mkdtemp(path.join(os.tmpdir(),'QuanLai Install QA '));
const installed=path.join(root,'App With Spaces'), data=path.join(root,'data'), skill=path.join(root,'mock-skill');
const exe=path.join(installed,'QuanLai QA.exe'), uninstaller=path.join(installed,'Uninstall QuanLai QA.exe');
const taskName=`QuanLai Install QA ${process.pid}`;
await mkdir(path.join(skill,'scripts'),{recursive:true}); await mkdir(data);
await mkdir('output/windows',{recursive:true});
await writeFile(path.join(skill,'scripts','auth.py'),'import json\nprint(json.dumps({"success":True,"valid":True,"phone_masked":"138****8000"}))\n');
await writeFile(path.join(skill,'scripts','issue.py'),`import json, os\nwith open(os.path.join(os.environ['QUANLAI_DATA_DIR'], 'calls.txt'), 'a') as f: f.write('mock\\n')\nprint(json.dumps({"success":True,"coupon_count":1,"coupons":[{"name":"QA mock coupon","discount_amount":"5","valid_end":"2026-09-30"}]}))\n`);
const env={...process.env,QUANLAI_DATA_DIR:data,QUANLAI_TASK_NAME:taskName,QUANLAI_SKILL_ROOT:skill,QUANLAI_PYTHON:path.join(installed,'resources/runtime/python/python.exe'),QUANLAI_PORT:'0'};
delete env.ELECTRON_RUN_AS_NODE;
const quote=v=>`'${v.replaceAll("'","''")}'`;
async function silent(file,args){
 const script=`$p=Start-Process -FilePath ${quote(file)} -ArgumentList ${quote(args)} -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`;
 return exec('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env,windowsHide:true,timeout:120000});
}
const store=createStore(data); let app, taskAdapter=createTaskAdapter({taskName}), installedOk=false;
try {
 await silent(installer,`/S /D=${installed}`); await access(exe); installedOk=true;
 app=await electron.launch({executablePath:exe,env,timeout:60000});
 const page=await app.firstWindow(); await page.getByRole('heading',{name:'已登录',exact:true}).waitFor({timeout:60000});
 await page.getByLabel('每天执行时间').fill('23:59');
 await page.getByRole('button',{name:'开启自动领取'}).click();
 await page.getByRole('heading',{name:'已开启',exact:true}).waitFor({timeout:60000});
 const task=await taskAdapter.query(); assert.equal(task.execute,exe); assert.ok(task.arguments.includes(data));
 await page.screenshot({path:'output/windows/installed-qa.png',fullPage:true});
 await app.close(); app=null;
 await store.write('schedule.json',{...(await store.read('schedule.json')),time:'00:00'});
 await exec('schtasks.exe',['/Run','/TN',taskName],{windowsHide:true});
 let runs=[];
 for(let i=0;i<60;i++){runs=await store.read('runs.json',[]);if(runs[0]?.status==='success')break;await sleep(500);}
 assert.equal(runs[0]?.status,'success'); assert.equal(runs[0].source,'automatic');
 assert.equal(runs[0].coupons[0].discount_amount,'5');
 await exec(exe,['--disable-auto'],{env,windowsHide:true,timeout:30000});
 assert.equal((await store.read('schedule.json')).enabled,false);assert.equal((await taskAdapter.query()).exists,false);
 await exec(exe,['--issue-auto'],{env,windowsHide:true,timeout:30000});
 assert.equal((await readFile(path.join(data,'calls.txt'),'utf8')).trim(),'mock');
 taskAdapter=createTaskAdapter({taskName,action:{execute:task.execute,arguments:task.arguments,workingDirectory:task.workingDirectory}});
 await store.write('schedule.json',{enabled:true,time:'23:59'});await taskAdapter.register('23:59');
 await silent(uninstaller,'/S'); installedOk=false;
 assert.equal((await taskAdapter.query()).exists,false);assert.equal((await store.read('schedule.json')).enabled,false);
 await assert.rejects(access(exe));
 const report={passed:true,version:pkg.version,checks:['QA installation path contains spaces','installed Electron UI opened','task points to installed executable with isolated arguments','window closed and Windows task executed mock upstream','disabled background entry makes no request','uninstall disables state and removes QA task'],realSms:false,realCoupons:false};
 await writeFile('output/windows/install-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {
 if(app)await app.close();
 await taskAdapter.remove();
 if(installedOk)await silent(uninstaller,'/S');
}
