import { randomUUID } from 'node:crypto';
import { store as defaultStore, maskPhone } from './store.mjs';
import { systemTasks } from './system-schedule.mjs';
import { getBridgeStatus, issueOfficialCoupons } from './workbuddy-skill.mjs';
import { AppError, publicError, safeCoupons } from './errors.mjs';

export const localDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const localTime = date => `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
const emptySchedule = () => ({ enabled: false, time: '00:00' });
export function createService({ store = defaultStore, tasks = systemTasks, bridge = { status: getBridgeStatus, issue: issueOfficialCoupons }, now = () => new Date() } = {}) {
  async function schedule() {
    const value = await store.read('schedule.json', emptySchedule());
    if (!value || typeof value.enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time || '')) return store.corrupt('schedule.json');
    return value;
  }
  async function history() {
    const value = await store.read('runs.json', []);
    if (!Array.isArray(value) || value.some(r => !r || typeof r.id !== 'string' || !['running','success','failed','interrupted'].includes(r.status))) return store.corrupt('runs.json');
    return value;
  }
  async function recoverRuns() {
    if (await store.isLocked('execution')) return;
    await store.locked('state', async () => {
      if (await store.isLocked('execution')) return;
      const runs = await history();
      if (runs.some(r => r.status === 'running')) await store.write('runs.json', runs.map(r => r.status === 'running' ? { ...r, status: 'interrupted', finishedAt: now().toISOString(), error: { code: 'INTERRUPTED', message: '上次执行意外中断，请确认结果后手动重试。' } } : r));
    });
  }
  async function getRuns() { await recoverRuns(); return history(); }
  async function taskStatus(current) {
    try {
      const task = await tasks.query();
      const consistent = tasks.native ? (current.enabled ? tasks.matches(task, current.time) : !task.exists) : true;
      return { provider: tasks.native ? 'windows-task-scheduler' : 'in-process', state: consistent ? (current.enabled ? 'ready' : 'disabled') : 'mismatch', cleanupPending: !current.enabled && !!task.exists };
    } catch { return { provider: tasks.native ? 'windows-task-scheduler' : 'in-process', state: 'error', error: publicError(new AppError('TASK_ERROR')) }; }
  }
  async function accountStatus() {
    try {
      const a = await bridge.status();
      return { available: !!a.available, loggedIn: !!a.loggedIn, phoneMasked: maskPhone(a.phoneMasked || ''), ...(a.error ? { error: publicError({ code: a.code }) } : {}) };
    } catch(e) { return { available: e.code !== 'SKILL_NOT_INSTALLED', loggedIn: false, error: publicError(e) }; }
  }
  async function status() {
    const [account, current, runs] = await Promise.all([accountStatus(), schedule(), getRuns()]);
    const system = await taskStatus(current);
    const today = localDay(now());
    const attempted = current.lastAutoAttemptDate === today || current.lastSuccessDate === today || current.lastRunDate === today;
    let nextRunAt = null;
    if (current.enabled && system.state === 'ready') {
      const date = new Date(now()); const [h,m] = current.time.split(':').map(Number); date.setHours(h,m,0,0);
      if (attempted) date.setDate(date.getDate()+1);
      else if (date < now()) date.setTime(now().getTime());
      nextRunAt = date.toISOString();
    }
    return { ok: true, service: account.available ? 'normal' : 'unavailable', bridge: account, schedule: current, systemSchedule: system, nextRunAt, running: await store.isLocked('execution'), latestRun: runs[0] || null };
  }
  async function saveSchedule(input) {
    if (typeof input.enabled !== 'boolean' || (input.enabled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || ''))) throw new AppError('INVALID_INPUT', 400);
    return store.locked('state', async () => {
      let previous;
      try { previous = await schedule(); } catch(e) { if (input.enabled) throw e; previous = emptySchedule(); }
      if (!input.enabled) {
        const current = { ...previous, enabled: false, updatedAt: now().toISOString() };
        await store.write('schedule.json', current);
        try { await tasks.remove(); return { ok: true, ...current, cleanupPending: false }; }
        catch { return { ok: true, ...current, cleanupPending: true, warning: '已禁止自动领取，但系统任务清理失败。请重试关闭；正在执行的领取不会被取消。' }; }
      }
      const account = await accountStatus();
      if (!account.available) throw new AppError('SKILL_NOT_INSTALLED', 503);
      if (account.error) throw new AppError(account.error.code, 502);
      if (!account.loggedIn) throw new AppError('LOGIN_REQUIRED', 401);
      try {
        await tasks.register(input.time);
        const current = { ...previous, enabled: true, time: input.time, updatedAt: now().toISOString() };
        await store.write('schedule.json', current);
        return { ok: true, ...current };
      } catch {
        try { if (previous.enabled) await tasks.register(previous.time); else await tasks.remove(); }
        catch { await store.write('task-error.json', { code: 'TASK_ERROR', at: now().toISOString() }); }
        throw new AppError('TASK_ERROR', 503);
      }
    });
  }
  async function reconcile() {
    return store.locked('state', async () => {
      const current = await schedule();
      const task = await tasks.query();
      if (current.enabled && !tasks.matches(task, current.time)) await tasks.register(current.time);
      else if (!current.enabled && task.exists) await tasks.remove();
    });
  }
  async function run(reason = 'manual') {
    const automatic = reason !== 'manual';
    const release = await store.acquire('execution', 150);
    let record;
    try {
      const skip = await store.locked('state', async () => {
        const current = await schedule(); const date = now(); const day = localDay(date);
        if (automatic) {
          if (!current.enabled) return 'disabled';
          if (localTime(date) < current.time) return 'not_due';
          if ([current.lastAutoAttemptDate, current.lastSuccessDate, current.lastRunDate].includes(day)) return 'already_attempted';
        }
        const runs = await history();
        const recovered = runs.map(r => r.status === 'running' ? { ...r, status: 'interrupted', finishedAt: date.toISOString(), error: { code: 'INTERRUPTED', message: '上次执行意外中断，请确认结果后手动重试。' } } : r);
        record = { id: randomUUID(), source: automatic ? 'automatic' : 'manual', startedAt: date.toISOString(), localDate: day, status: 'running' };
        // Persist the day marker before making any external request. A crash cannot cause repeated auto retries.
        if (automatic) await store.write('schedule.json', { ...current, lastAutoAttemptDate: day });
        await store.write('runs.json', [record, ...recovered].slice(0,100));
        return null;
      });
      if (skip) return { ok: true, skipped: skip };
      try {
        const account = await accountStatus();
        if (!account.available) throw new AppError('SKILL_NOT_INSTALLED', 503);
        if (account.error) throw new AppError(account.error.code, 502);
        if (!account.loggedIn) throw new AppError('LOGIN_REQUIRED', 401);
        const result = await bridge.issue();
        if (result?.ok !== true || !Number.isFinite(result.couponCount) || result.couponCount < 0 || !Array.isArray(result.coupons)) throw new AppError('SKILL_FORMAT', 502);
        record = { ...record, status: 'success', couponCount: result.couponCount, coupons: safeCoupons(result.coupons) };
      } catch(error) { record = { ...record, status: 'failed', error: publicError(error) }; }
      record.finishedAt = now().toISOString();
      await store.locked('state', async () => {
        const current = await schedule();
        if (record.status === 'success') await store.write('schedule.json', { ...current, lastSuccessDate: record.localDate });
        const runs = await history();
        await store.write('runs.json', [record, ...runs.filter(r => r.id !== record.id)].slice(0,100));
      });
      return { ok: record.status === 'success', runId: record.id, run: record, couponCount: record.couponCount, coupons: record.coupons, ...(record.error ? { error: record.error } : {}) };
    } finally { await release(); }
  }
  return { status, saveSchedule, run, getRuns, reconcile };
}
export const service = createService();
