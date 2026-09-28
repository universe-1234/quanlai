import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuanlaiServer} from '../server/index.mjs';
import {AppError} from '../server/errors.mjs';

test('HTTP状态、记录、关闭、忙碌、输入错误与同源限制',async t=>{
 let enabled=true;
 const server=createQuanlaiServer({appService:{status:async()=>({ok:true,schedule:{enabled}}),getRuns:async()=>[],saveSchedule:async input=>{enabled=input.enabled;return {ok:true,enabled};},run:async()=>{throw new AppError('BUSY',409);}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await(await fetch(url+'/api/status')).json()).schedule.enabled,true);
 assert.deepEqual(await(await fetch(url+'/api/runs')).json(),{runs:[]});
 assert.equal((await fetch(url+'/api/coupons/issue',{method:'POST',body:'{}'})).status,409);
 assert.equal((await fetch(url+'/api/schedule',{method:'POST',body:'{"enabled":false}'})).status,200);assert.equal(enabled,false);
 assert.equal((await fetch(url+'/api/schedule',{method:'POST',body:'{'})).status,400);
 assert.equal((await fetch(url+'/api/schedule',{method:'POST',headers:{Origin:'https://example.com'},body:'{}'})).status,403);
});
