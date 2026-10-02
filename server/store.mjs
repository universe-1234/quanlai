import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.mjs';
import { AppError } from './errors.mjs';

export function maskPhone(phone) { return /^1\d{10}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : /^\d{3}\*{4}\d{4}$/.test(phone || '') ? phone : ''; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
}
export function createStore(dir = config.dataDir) {
  const resolve = name => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new AppError('INVALID_INPUT', 400);
    return path.join(dir, name);
  };
  const ensure = () => mkdir(dir, { recursive: true, mode: 0o700 });
  async function corrupt(name) {
    await writeFile(resolve(`${name}.corrupt`), await readFile(resolve(name)), { mode: 0o600 });
    throw new AppError('STATE_CORRUPT');
  }
  async function read(name, fallback = null) {
    await ensure();
    try { return JSON.parse(await readFile(resolve(name), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return fallback;
      if (error instanceof SyntaxError) {
        return corrupt(name);
      }
      throw error;
    }
  }
  async function write(name, value) {
    await ensure();
    const tmp = resolve(`${name}.${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      await rename(tmp, resolve(name));
    } finally { await rm(tmp, { force: true }); }
  }
  async function owner(lock) {
    try { return JSON.parse(await readFile(path.join(lock, 'owner.json'), 'utf8')); } catch { return null; }
  }
  async function stale(lock) {
    const o = await owner(lock);
    if (o) return !alive(o.pid);
    try { return Date.now() - (await stat(lock)).mtimeMs > 10_000; } catch { return false; }
  }
  async function acquire(name, wait = 0) {
    await ensure();
    const lock = resolve(`${name}.lock`);
    const deadline = Date.now() + wait;
    do {
      try {
        await mkdir(lock);
        const token = randomUUID();
        await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, token }));
        return async () => { if ((await owner(lock))?.token === token) await rm(lock, { recursive: true, force: true }); };
      } catch (e) { if (e.code !== 'EEXIST') throw e; }
      if (await stale(lock)) {
        // Move the observed dead generation by its owner token, rather than deleting a new lock.
        const observed = await owner(lock);
        const claim = path.join(lock, 'reclaim');
        try {
          // A crashed reclaimer must not permanently strand an otherwise dead lock.
          if (await stale(claim)) await rm(claim, { recursive: true, force: true });
          await mkdir(claim);
          await writeFile(path.join(claim, 'owner.json'), JSON.stringify({ pid: process.pid, token: randomUUID() }));
          const current = await owner(lock);
          if (current?.token === observed?.token && await stale(lock)) {
            await rm(lock, { recursive: true, force: true });
          } else { await rm(claim, { recursive: true, force: true }); }
        } catch (e) { if (!['EEXIST', 'ENOENT', 'EPERM'].includes(e.code)) throw e; }
      }
      if (Date.now() >= deadline) break;
      await delay(25);
    } while (true);
    throw new AppError('BUSY', 409);
  }
  async function locked(name, fn, wait = 5000) {
    const release = await acquire(name, wait);
    try { return await fn(); } finally { await release(); }
  }
  async function isLocked(name) {
    const lock = resolve(`${name}.lock`);
    const o = await owner(lock);
    if (o) return alive(o.pid);
    try { return Date.now() - (await stat(lock)).mtimeMs <= 10_000; } catch { return false; }
  }
  return { read, write, acquire, locked, isLocked, corrupt, dir };
}
export const store = createStore();
export const readJson = store.read;
export const writeJson = store.write;
