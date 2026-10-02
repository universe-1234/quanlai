import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.mjs";
import { requestOfficialOtp, verifyOfficialOtp } from "./workbuddy-skill.mjs";
import { startScheduler } from "./scheduler.mjs";
import { service } from "./service.mjs";
import { publicError } from "./errors.mjs";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml" };
const attempts = new Map();

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function body(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("请求内容过大");
  }
  return raw ? JSON.parse(raw) : {};
}

function validPhone(phone) {
  return typeof phone === "string" && /^1\d{10}$/.test(phone);
}

function allowOtp(phone) {
  const now = Date.now();
  const previous = attempts.get(phone) || 0;
  if (now - previous < 60_000) return false;
  attempts.set(phone, now);
  return true;
}

async function handleApi(request, response, url, appService, auth) {
  try {
    if (url.pathname === "/api/status" && request.method === "GET") {
      return json(response, 200, { ...await appService.status(), mode: config.mode });
    }

    if (url.pathname === "/api/auth/otp/request" && request.method === "POST") {
      const payload = await body(request);
      if (!validPhone(payload.phone)) return json(response, 400, { message: "请输入正确的 11 位手机号" });
      if (!allowOtp(payload.phone)) return json(response, 429, { message: "发送太频繁，请 60 秒后再试" });
      const result = await auth.requestOtp(payload.phone, payload.termsAccepted === true);
      return json(response, 200, { ok: true, retryAfter: result.retryAfter || 60, mode: config.mode, maskedPhone: result.maskedPhone });
    }

    if (url.pathname === "/api/auth/otp/verify" && request.method === "POST") {
      const payload = await body(request);
      if (!validPhone(payload.phone) || !/^\d{6}$/.test(payload.code || "")) return json(response, 400, { message: "手机号或验证码格式不正确" });
      const result = await auth.verifyOtp(payload.phone, payload.code);
      return json(response, 200, { ok: true, maskedPhone: result.maskedPhone });
    }

    if (url.pathname === "/api/schedule" && request.method === "POST") {
      const result = await appService.saveSchedule(await body(request));
      if (result.enabled) appService.run("schedule-change").catch(() => {});
      return json(response, 200, result);
    }

    if (url.pathname === "/api/coupons/issue" && request.method === "POST") {
      return json(response, 200, await appService.run("manual"));
    }

    if (url.pathname === "/api/runs" && request.method === "GET") return json(response, 200, { runs: await appService.getRuns() });

    return json(response, 404, { message: "接口不存在" });
  } catch (error) {
    const failure = publicError(error);
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    let redirectUrl;
    try { const url = new URL(error.redirectUrl); if (url.protocol === "https:" && (url.hostname === "meituan.com" || url.hostname.endsWith(".meituan.com"))) redirectUrl = url.href; } catch {}
    return json(response, status, { ...failure, redirectUrl });
  }
}

async function serveStatic(request, response, url) {
  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  let filePath = path.resolve(config.staticDir, relative);
  if (path.relative(path.resolve(config.staticDir), filePath).startsWith("..") || path.isAbsolute(path.relative(path.resolve(config.staticDir), filePath))) return json(response, 403, { message: "禁止访问" });
  try {
    if (!(await stat(filePath)).isFile()) throw Object.assign(new Error(), { code: "ENOENT" });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    filePath = path.join(config.staticDir, "index.html");
  }
  const content = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'",
  });
  response.end(content);
}

export function createQuanlaiServer({ appService = service, auth = { requestOtp: requestOfficialOtp, verifyOtp: verifyOfficialOtp } } = {}) {
  return http.createServer(async (request, response) => {
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host || "")) return json(response, 400, { message: "无效的本地地址" });
    if (request.method === "POST" && request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) return json(response, 403, { message: "禁止跨站请求" });
    let url;
    try { url = new URL(request.url, `http://${request.headers.host}`); }
    catch { return json(response, 400, { message: "无效的本地地址" }); }
    if (url.pathname.startsWith("/api/")) return handleApi(request, response, url, appService, auth);
    try {
      return await serveStatic(request, response, url);
    } catch {
      return json(response, 500, { message: "页面加载失败" });
    }
  });
}

export async function startQuanlaiServer({ port = config.port, onSchedulerError = console.error } = {}) {
  try { await service.reconcile(); } catch (error) { onSchedulerError(publicError(error).message); }
  const scheduler = startScheduler((error) => onSchedulerError(`[scheduler] ${error.message}`));
  const server = createQuanlaiServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  service.run("startup").catch(error => { if (error.code !== "BUSY") onSchedulerError(publicError(error).message); });
  return { server, scheduler, url: `http://127.0.0.1:${actualPort}` };
}

const directEntry = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (directEntry) {
  const started = await startQuanlaiServer({ onSchedulerError: console.error });
  console.log(`券来已启动：${started.url}`);
  console.log(`运行模式：${config.mode}`);
}
