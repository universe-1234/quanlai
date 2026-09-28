import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function fixture(page, {loggedIn=true, enabled=false, failed=false}={}) {
 const state={ok:true,bridge:{available:true,loggedIn,phoneMasked:'138****8000'},schedule:{enabled,time:'10:00'},systemSchedule:{state:enabled?'ready':'disabled',provider:'windows-task-scheduler'},nextRunAt:enabled?'2026-09-27T02:00:00Z':null,running:false};
 let records=failed?[{id:'previous',source:'automatic',startedAt:'2026-09-26T02:00:00Z',status:'failed',error:{message:'请求超时，请检查网络后手动重试。'}}]:[];
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());let body;
  if(url.pathname==='/api/status')body=state;
  else if(url.pathname==='/api/runs')body={runs:records};
  else if(url.pathname==='/api/schedule'){const p=route.request().postDataJSON();state.schedule={...state.schedule,...p};state.systemSchedule.state=p.enabled?'ready':'disabled';state.nextRunAt=p.enabled?'2026-09-27T02:00:00Z':null;body={ok:true,...state.schedule};}
  else if(url.pathname==='/api/auth/otp/request')body={ok:true,retryAfter:60};
  else if(url.pathname==='/api/auth/otp/verify'){state.bridge.loggedIn=true;body={ok:true};}
  else if(url.pathname==='/api/coupons/issue'){
   await new Promise(r=>setTimeout(r,400));records=[{id:'new',source:'manual',startedAt:new Date().toISOString(),status:'success',couponCount:2,coupons:[{name:'示例餐饮券（模拟数据）',amount:'5元',threshold:'满30元',validity:'以平台显示为准'}]},...records];body={ok:true,couponCount:2};
  }
  await route.fulfill({json:body??{}});
 });
 await page.goto('/');await expect(page.getByText('本地服务已连接')).toBeVisible();
 return state;
}
test('首次登录、同意规则、六位验证码、开启自动任务',async({page})=>{
 await fixture(page,{loggedIn:false});await page.getByLabel('手机号',{exact:true}).fill('13800138000');
 await expect(page.getByRole('button',{name:'获取验证码'})).toBeDisabled();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'获取验证码'}).click();
 for(let i=1;i<=6;i++)await page.getByLabel(`验证码第 ${i} 位`).fill(String(i));
 await page.getByRole('button',{name:'验证并登录'}).click();await expect(page.getByRole('heading',{name:'已登录',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'开启自动领取'}).click();await expect(page.getByRole('heading',{name:'已开启',exact:true})).toBeVisible();
});
test('重开页面恢复状态、修改时间、关闭任务、手动领取',async({page})=>{
 const state=await fixture(page,{enabled:true});await expect(page.getByLabel('手机号',{exact:true})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('heading',{name:'已开启',exact:true})).toBeVisible();
 await page.getByLabel('每天执行时间').fill('12:30');await page.getByRole('button',{name:'保存时间'}).click();await expect.poll(()=>state.schedule.time).toBe('12:30');
 await page.getByRole('button',{name:'关闭自动领取'}).click();await expect(page.getByRole('heading',{name:'已关闭',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'立即领取'}).click();await expect(page.getByRole('button',{name:'正在领取…'})).toBeDisabled();
 await expect(page.getByText('领取完成，本次返回 2 张券。')).toBeVisible();await page.getByText('查看券信息').click();await expect(page.getByText('示例餐饮券（模拟数据）')).toBeVisible();
});
test('失效登录仍可关闭；失败记录可重试；实际界面截图',async({page})=>{
 const state=await fixture(page,{loggedIn:false,enabled:true,failed:true});await page.getByRole('button',{name:'关闭自动领取'}).click();expect(state.schedule.enabled).toBe(false);
 state.bridge.loggedIn=true;await page.reload();await page.getByRole('button',{name:'手动重试'}).click();await expect(page.getByText('领取完成，本次返回 2 张券。')).toBeVisible();
 await mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/management.png',fullPage:true});
});
test('领取尚未结束时，可以关闭之后的自动任务',async({page})=>{
 const state=await fixture(page,{enabled:true});
 await page.getByRole('button',{name:'立即领取'}).click();
 await page.getByRole('button',{name:'关闭自动领取'}).click();
 await expect.poll(()=>state.schedule.enabled).toBe(false);
 await expect(page.getByText('领取完成，本次返回 2 张券。')).toBeVisible();
});

test('375px、横屏和200%字号无水平溢出，空记录可读',async({page})=>{
 await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:'reduce'});await fixture(page,{loggedIn:false});
 await expect(page.getByText('暂时没有执行记录')).toBeVisible();
 expect(await page.getByLabel('验证码第 1 位').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(30);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'output/playwright/narrow.png',fullPage:true});
 await page.setViewportSize({width:812,height:375});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.addStyleTag({content:'html {font-size:200%}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
