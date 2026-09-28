import { service } from './service.mjs';
export const runIssue = service.run;
export function startScheduler(onError = console.error) {
  // Windows has daily/login/resume task triggers; do not add a competing JS timer.
  if (process.platform === 'win32') return null;
  const timer = setInterval(() => service.run('scheduled').catch(e => { if (e.code !== 'BUSY') onError(e.code || 'INTERNAL_ERROR'); }), 30_000);
  timer.unref(); return timer;
}
