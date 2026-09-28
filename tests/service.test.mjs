import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createStore } from '../server/store.mjs';
import { createService } from '../server/service.mjs';
import { AppError, publicError, safeCoupons } from '../server/errors.mjs';

test('真实子进程持锁拒绝重复领取，杀死进程后安全恢复', async t => {
 const f = await fixture(t);
 const child = fork(new URL('./fixtures/lock-worker.mjs', import.meta.url), [f.dir], { stdio:['ignore','ignore','pipe','ipc'] });
 t.after(() => { if (child.exitCode === null) child.kill(); });
 await once(child, 'message');
 await assert.rejects(f.service.run(), {code:'BUSY'});
 const exited = once(child,'exit'); child.kill(); await exited;
 assert.equal((await f.service.run()).ok,true);
});

test('合法 JSON 的错误结构也保留诊断副本', async t => {
 const f = await fixture(t); await f.store.write('schedule.json', {enabled:'false'});
 await assert.rejects(f.service.status(), {code:'STATE_CORRUPT'});
 assert.deepEqual(JSON.parse(await readFile(path.join(f.dir,'schedule.json.corrupt'),'utf8')), {enabled:'false'});
});

test('状态请求超时保留网络类别，且真正上游字段不会被丢弃', async t => {
 const f = await fixture(t); f.bridge.status = async () => { throw new AppError('SKILL_TIMEOUT'); };
 assert.equal((await f.service.run()).error.code, 'SKILL_TIMEOUT');
 const c = {name:'券',discount_amount:'5',use_condition:'满30元可用',valid_start:'2026-09-26',valid_end:'2026-09-27',user_token:'secret'};
 assert.deepEqual(safeCoupons([c])[0], {name:'券',discount_amount:'5',use_condition:'满30元可用',valid_start:'2026-09-26',valid_end:'2026-09-27'});
});

test('回收锁的进程异常退出也能恢复', async t => {
 const f = await fixture(t);
 for (const name of ['execution.lock','execution.lock/reclaim']) {
   await mkdir(path.join(f.dir,name),{recursive:true});
   await writeFile(path.join(f.dir,name,'owner.json'),JSON.stringify({pid:2147483647,token:'dead'}));
 }
 const release = await f.store.acquire('execution',200); await release();
});

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'quanlai-test-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  const store = createStore(dir);
  let date = new Date(2026,8,26,12,0), task = { exists:false }, loggedIn = true, fail = false, issues = 0;
  const tasks = { native:true, query:async()=>task, matches:(q,time)=>q.exists && q.time===time && q.version===2,
    register:async time=>{task={exists:true,time,version:2};}, remove:async()=>{task={exists:false};} };
  const bridge = { status:async()=>({ available:true,loggedIn,phoneMasked:'13800138000' }), issue:async()=>{issues++;if(fail)throw new AppError('SKILL_TIMEOUT');return {ok:true,couponCount:1,coupons:[{name:'测试券',user_token:'secret'}]};} };
  const options={store,tasks,bridge,now:()=>new Date(date)};
  const service=createService(options);
  return {dir,store,tasks,bridge,service,options,setDate:v=>date=v,setLogin:v=>loggedIn=v,setFail:v=>fail=v,getIssues:()=>issues,setTask:v=>task=v};
}
test('开启、改时、关闭；关闭不依赖登录，移除缺失任务也成功',async t=>{
 const f=await fixture(t);await f.service.saveSchedule({enabled:true,time:'10:00'});
 assert.equal((await f.service.status()).systemSchedule.state,'ready');
 await f.service.saveSchedule({enabled:true,time:'11:00'});assert.equal((await f.tasks.query()).time,'11:00');
 f.setLogin(false);await f.service.saveSchedule({enabled:false});await f.service.saveSchedule({enabled:false});
 assert.equal((await f.service.status()).schedule.enabled,false);assert.equal((await f.tasks.query()).exists,false);
});
test('关闭失败时先禁止执行，状态明确且允许再次清理',async t=>{
 const f=await fixture(t);await f.service.saveSchedule({enabled:true,time:'10:00'});
 f.tasks.remove=async()=>{throw Error('private path');};
 assert.equal((await f.service.saveSchedule({enabled:false})).cleanupPending,true);
 assert.equal((await f.service.run('auto')).skipped,'disabled');assert.equal(f.getIssues(),0);
 assert.equal((await f.service.status()).systemSchedule.cleanupPending,true);
});
test('注册失败保留原有效配置并回滚任务',async t=>{
 const f=await fixture(t);await f.service.saveSchedule({enabled:true,time:'10:00'});
 const register=f.tasks.register;f.tasks.register=async time=>{if(time==='11:00')throw Error('fail');return register(time);};
 await assert.rejects(f.service.saveSchedule({enabled:true,time:'11:00'}),{code:'TASK_ERROR'});
 assert.equal((await f.service.status()).schedule.time,'10:00');assert.equal((await f.tasks.query()).time,'10:00');
});
test('回滚失败暴露任务不一致而非假成功',async t=>{
 const f=await fixture(t);await f.service.saveSchedule({enabled:true,time:'10:00'});
 f.tasks.register=async()=>{f.setTask({exists:false});throw Error('fail');};
 await assert.rejects(f.service.saveSchedule({enabled:true,time:'11:00'}));
 assert.equal((await f.service.status()).systemSchedule.state,'mismatch');
});
test('当天恢复补领一次；失败也不自动重复，次日可以再次领取',async t=>{
 const f=await fixture(t);await f.service.saveSchedule({enabled:true,time:'10:00'});f.setFail(true);
 assert.equal((await f.service.run('startup')).ok,false);
 assert.equal((await f.service.run('resume')).skipped,'already_attempted');assert.equal(f.getIssues(),1);
 f.setDate(new Date(2026,8,27,9,0));assert.equal((await f.service.run('auto')).skipped,'not_due');
 f.setDate(new Date(2026,8,27,12,0));f.setFail(false);assert.equal((await f.service.run('auto')).ok,true);assert.equal(f.getIssues(),2);
});
test('手动失败可重试；当天手动成功阻止自动领取',async t=>{
 const f=await fixture(t);await f.service.saveSchedule({enabled:true,time:'10:00'});f.setFail(true);
 assert.equal((await f.service.run()).ok,false);f.setFail(false);assert.equal((await f.service.run()).ok,true);
 assert.equal((await f.service.run('auto')).skipped,'already_attempted');
});
test('过期登录自动失败留痕，关闭依然可用',async t=>{
 const f=await fixture(t);await f.service.saveSchedule({enabled:true,time:'10:00'});f.setLogin(false);
 const result=await f.service.run('auto');assert.equal(result.run.error.code,'LOGIN_REQUIRED');assert.equal(f.getIssues(),0);
 assert.equal((await f.service.run('auto')).skipped,'already_attempted');await f.service.saveSchedule({enabled:false});
});
test('新服务实例恢复账号、设置与历史；脱敏字段不泄露',async t=>{
 const f=await fixture(t);await f.service.saveSchedule({enabled:true,time:'10:00'});await f.service.run();
 const s=await createService(f.options).status();assert.equal(s.bridge.phoneMasked,'138****8000');assert.equal(s.latestRun.status,'success');assert.equal(s.schedule.enabled,true);
 assert.equal(JSON.stringify(await f.service.getRuns()).includes('secret'),false);
});
test('并发入口只调用上游一次，关闭不阻塞正在执行的请求',async t=>{
 const f=await fixture(t);await f.service.saveSchedule({enabled:true,time:'10:00'});
 let finish,started;const waiting=new Promise(r=>started=r);f.bridge.issue=async()=>{started();await new Promise(r=>finish=r);return {ok:true,couponCount:0,coupons:[]};};
 const first=f.service.run();await waiting;
 await assert.rejects(createService(f.options).run('auto'),{code:'BUSY'});
 await f.service.saveSchedule({enabled:false});finish();assert.equal((await first).ok,true);assert.equal((await f.service.status()).schedule.enabled,false);
});
test('异常退出的执行恢复为中断；死进程锁可以回收',async t=>{
 const f=await fixture(t);const record={id:'old',status:'running',source:'automatic',startedAt:'2026-09-26T01:00:00Z'};
 await f.store.write('runs.json',[record]);await mkdir(path.join(f.dir,'execution.lock'));await writeFile(path.join(f.dir,'execution.lock','owner.json'),JSON.stringify({pid:2147483647,token:'dead'}));
 assert.equal((await f.service.getRuns())[0].status,'interrupted');
 const release=await f.store.acquire('execution',200);await release();
});
test('配置损坏保留副本且不静默恢复；仍可关闭自动领取',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.dir,'schedule.json'),'{broken');
 await assert.rejects(f.service.status(),{code:'STATE_CORRUPT'});
 assert.equal(await readFile(path.join(f.dir,'schedule.json.corrupt'),'utf8'),'{broken');
 await f.service.saveSchedule({enabled:false});assert.equal((await f.service.status()).schedule.enabled,false);
});
test('历史损坏时拒绝执行，不丢弃证据',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.dir,'runs.json'),'oops');
 await assert.rejects(f.service.run(),{code:'STATE_CORRUPT'});assert.equal(f.getIssues(),0);
 assert.equal(await readFile(path.join(f.dir,'runs.json.corrupt'),'utf8'),'oops');
});
test('历史最多100条并保留最新结果',async t=>{
 const f=await fixture(t);await f.store.write('runs.json',Array.from({length:100},(_,i)=>({id:`old-${i}`,status:'success'})));
 const result=await f.service.run();const runs=await f.service.getRuns();assert.equal(runs.length,100);assert.equal(runs[0].id,result.runId);assert.equal(runs.at(-1).id,'old-98');
});
test('旧配置保留，启动修复旧任务参数',async t=>{
 const f=await fixture(t);await f.store.write('schedule.json',{enabled:true,time:'10:00',lastRunDate:'2026-09-26'});f.setTask({exists:true,time:'10:00',version:1});
 await f.service.reconcile();assert.equal((await f.service.status()).systemSchedule.state,'ready');assert.equal((await f.service.run('auto')).skipped,'already_attempted');
});
test('系统任务查询失败明确报告；禁用时无下一次执行',async t=>{
 const f=await fixture(t);f.tasks.query=async()=>{throw Error('private');};
 const s=await f.service.status();assert.equal(s.systemSchedule.state,'error');assert.equal(s.nextRunAt,null);
});
test('所有公开错误使用固定信息，券字段只保存白名单',()=>{
 assert.equal(publicError(new Error('C:\\secret token=abc')).code,'INTERNAL_ERROR');
 const value=safeCoupons([{name:'券 13800138000',token:'abc',url:'private',amount:10}]);
 assert.equal(JSON.stringify(value).includes('13800138000'),false);assert.equal('token' in value[0],false);assert.equal('url' in value[0],false);
});
test('非法输入与错误格式组件结果不显示成功',async t=>{
 const f=await fixture(t);await assert.rejects(f.service.saveSchedule({enabled:'yes',time:'30:99'}),{code:'INVALID_INPUT'});
 f.bridge.issue=async()=>({ok:true,coupons:[]});assert.equal((await f.service.run()).run.error.code,'SKILL_FORMAT');
});
