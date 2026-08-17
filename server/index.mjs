import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";
import { getBridgeStatus, requestOfficialOtp, SkillBridgeError, verifyOfficialOtp } from "./workbuddy-skill.mjs";
import { readJson, writeJson } from "./store.mjs";
import { runIssue, startScheduler } from "./scheduler.mjs";
import { registerSystemSchedule } from "./system-schedule.mjs";

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

async function handleApi(request, response, url) {
  try {
    if (url.pathname === "/api/status" && request.method === "GET") {
      const schedule = await readJson("schedule.json", { enabled: false, time: "00:00" });
      const bridge = await getBridgeStatus();
      return json(response, 200, { ok: true, mode: config.mode, service: bridge.available ? "normal" : "unavailable", bridge, schedule });
    }

    if (url.pathname === "/api/auth/otp/request" && request.method === "POST") {
      const payload = await body(request);
      if (!validPhone(payload.phone)) return json(response, 400, { message: "请输入正确的 11 位手机号" });
      if (!allowOtp(payload.phone)) return json(response, 429, { message: "发送太频繁，请 60 秒后再试" });
      const result = await requestOfficialOtp(payload.phone, payload.termsAccepted === true);
      return json(response, 200, { ok: true, expiresIn: result.expiresIn || 60, mode: config.mode, maskedPhone: result.maskedPhone });
    }

    if (url.pathname === "/api/auth/otp/verify" && request.method === "POST") {
      const payload = await body(request);
      if (!validPhone(payload.phone) || !/^\d{6}$/.test(payload.code || "")) return json(response, 400, { message: "手机号或验证码格式不正确" });
      const result = await verifyOfficialOtp(payload.phone, payload.code);
      return json(response, 200, { ok: true, maskedPhone: result.maskedPhone });
    }

    if (url.pathname === "/api/schedule" && request.method === "POST") {
      const payload = await body(request);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.time || "")) return json(response, 400, { message: "执行时间格式不正确" });
      const bridge = await getBridgeStatus();
      if (!bridge.loggedIn) return json(response, 401, { message: "请先完成手机号验证" });
      const schedule = { time: payload.time, enabled: Boolean(payload.enabled), updatedAt: new Date().toISOString() };
      await writeJson("schedule.json", schedule);
      const systemSchedule = await registerSystemSchedule(schedule.time);
      return json(response, 200, { ok: true, ...schedule, systemSchedule });
    }

    if (url.pathname === "/api/coupons/issue" && request.method === "POST") {
      return json(response, 200, await runIssue("manual"));
    }

    return json(response, 404, { message: "接口不存在" });
  } catch (error) {
    if (error instanceof SkillBridgeError) {
      return json(response, error.status, { message: error.message, code: error.code, redirectUrl: error.redirectUrl || undefined });
    }
    return json(response, 500, { message: error.message || "服务内部错误" });
  }
}

async function serveStatic(request, response, url) {
  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  let filePath = path.resolve(config.staticDir, relative);
  if (!filePath.startsWith(config.staticDir)) return json(response, 403, { message: "禁止访问" });
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

startScheduler((error) => console.error(`[scheduler] ${error.message}`));

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  if (url.pathname.startsWith("/api/")) return handleApi(request, response, url);
  try {
    return await serveStatic(request, response, url);
  } catch {
    return json(response, 500, { message: "页面加载失败" });
  }
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`券来已启动：http://127.0.0.1:${config.port}`);
  console.log("运行模式：本机官方美团红包助手 Skill 桥接");
});
