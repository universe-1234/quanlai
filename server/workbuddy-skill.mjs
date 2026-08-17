import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config, skillPaths } from "./config.mjs";

const execFileAsync = promisify(execFile);
const SENSITIVE_KEYS = new Set(["user_token", "device_token", "token", "authorization"]);

export class SkillBridgeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SkillBridgeError";
    this.code = details.code || "SKILL_ERROR";
    this.status = details.status || 502;
    this.redirectUrl = details.redirectUrl || "";
  }
}

export function parseSkillJson(output) {
  const text = String(output || "").trim();
  if (!text) throw new SkillBridgeError("官方 Skill 没有返回结果");
  const candidates = [text, ...text.split(/\r?\n/).reverse()];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // WorkBuddy 脚本正常输出单行 JSON；额外日志存在时继续尝试最后一行。
    }
  }
  throw new SkillBridgeError("无法解析官方 Skill 返回结果");
}

function stripSensitive(value) {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()))
      .map(([key, item]) => [key, stripSensitive(item)]),
  );
}

function bridgeInfo() {
  const scripts = skillPaths();
  const missing = [];
  if (!existsSync(config.skillRoot)) missing.push("Skill 目录");
  if (!existsSync(scripts.auth)) missing.push("auth.py");
  if (!existsSync(scripts.issue)) missing.push("issue.py");
  if (!existsSync(config.pythonExe) && config.pythonExe !== "python3") missing.push("Python 环境");
  return { available: missing.length === 0, missing, scripts };
}

export function buildSkillEnvironment(source = process.env) {
  const environment = { ...source, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };
  // httpx 会优先解析 ALL_PROXY；本机常见的 SOCKS 代理需要额外依赖。
  // 官方 Skill 仍可使用 HTTP_PROXY / HTTPS_PROXY，因此仅移除冲突项。
  delete environment.ALL_PROXY;
  delete environment.all_proxy;
  environment.SKILL_CACHE_PYTHON = config.pythonExe;
  environment.SKILL_CACHE_WORKSPACE = environment.SKILL_CACHE_WORKSPACE || path.join(config.dataDir, "skill-workspace");
  return environment;
}

async function runScript(script, args, timeout = 20_000) {
  const info = bridgeInfo();
  if (!info.available) {
    throw new SkillBridgeError(`未找到官方美团红包助手 Skill：缺少${info.missing.join("、")}`, { code: "SKILL_NOT_INSTALLED", status: 503 });
  }

  let stdout = "";
  try {
    const result = await execFileAsync(config.pythonExe, [script, ...args], {
      cwd: config.skillRoot,
      encoding: "utf8",
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env: buildSkillEnvironment(),
    });
    stdout = result.stdout;
  } catch (error) {
    stdout = error.stdout || "";
    if (!stdout) {
      const timeoutMessage = error.killed ? "官方 Skill 请求超时" : "官方 Skill 运行失败";
      throw new SkillBridgeError(timeoutMessage, { code: error.killed ? "SKILL_TIMEOUT" : "SKILL_PROCESS_ERROR" });
    }
  }

  const payload = parseSkillJson(stdout);
  if (payload.success === false) {
    throw new SkillBridgeError(payload.message || "官方 Skill 请求失败", {
      code: payload.error,
      status: payload.error === "SMS_VERIFY_CODE_ERROR" ? 400 : 502,
      redirectUrl: payload.redirect_url,
    });
  }
  return stripSensitive(payload);
}

export async function getBridgeStatus() {
  const info = bridgeInfo();
  if (!info.available) return { available: false, loggedIn: false, missing: info.missing };
  try {
    const payload = await runScript(info.scripts.auth, ["status"]);
    return {
      available: true,
      loggedIn: Boolean(payload.token_exists || payload.valid),
      phoneMasked: payload.phone_masked || "",
    };
  } catch (error) {
    return { available: true, loggedIn: false, error: error.message };
  }
}

export async function acceptTerms() {
  const { auth } = skillPaths();
  const check = await runScript(auth, ["terms-check"]);
  if (check.terms_accepted) return { accepted: true, existing: true };
  await runScript(auth, ["terms-accept"]);
  return { accepted: true, existing: false };
}

export async function requestOfficialOtp(phone, termsAccepted) {
  if (!termsAccepted) throw new SkillBridgeError("请先阅读并同意美团 Skill 服务使用规则", { code: "TERMS_REQUIRED", status: 400 });
  await acceptTerms();
  const payload = await runScript(skillPaths().auth, ["send-sms", "--phone", phone]);
  return { ok: true, expiresIn: 60, maskedPhone: payload.phone_masked || "" };
}

export async function verifyOfficialOtp(phone, code) {
  const payload = await runScript(skillPaths().auth, ["verify", "--phone", phone, "--code", code]);
  return { ok: true, maskedPhone: payload.phone_masked || "" };
}

export async function issueOfficialCoupons() {
  const payload = await runScript(skillPaths().issue, ["--auto"], 30_000);
  return {
    ok: true,
    isFirstIssue: Boolean(payload.is_first_issue),
    couponCount: Number(payload.coupon_count || 0),
    coupons: Array.isArray(payload.coupons) ? payload.coupons : [],
    requestId: payload.request_id || "",
  };
}

export function getBridgeInfo() {
  const info = bridgeInfo();
  return { available: info.available, missing: info.missing, mode: config.mode };
}
