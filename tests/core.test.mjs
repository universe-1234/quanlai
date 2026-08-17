import test from "node:test";
import assert from "node:assert/strict";
import { maskPhone } from "../server/store.mjs";
import { buildSkillEnvironment, getBridgeInfo, parseSkillJson, SkillBridgeError } from "../server/workbuddy-skill.mjs";

test("手机号只以脱敏形式进入界面数据", () => {
  assert.equal(maskPhone("13800138000"), "138****8000");
});

test("可以解析官方 Skill 的单行 JSON", () => {
  const result = parseSkillJson('{"success":true,"phone_masked":"138****8000"}');
  assert.equal(result.success, true);
  assert.equal(result.phone_masked, "138****8000");
});

test("存在额外日志时读取最后一行 JSON", () => {
  const result = parseSkillJson('准备中\n{"success":true,"coupon_count":2}');
  assert.equal(result.coupon_count, 2);
});

test("无法解析的 Skill 输出会被拒绝", () => {
  assert.throws(() => parseSkillJson("not json"), SkillBridgeError);
});

test("桥接信息不会暴露脚本路径或令牌", () => {
  const result = getBridgeInfo();
  assert.equal(typeof result.available, "boolean");
  assert.match(result.mode, /official-skill$/);
  assert.equal("scripts" in result, false);
  assert.equal("userToken" in result, false);
});

test("官方 Skill 子进程避开缺少 socksio 时的 ALL_PROXY 冲突", () => {
  const result = buildSkillEnvironment({ ALL_PROXY: "socks5://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:2" });
  assert.equal(result.ALL_PROXY, undefined);
  assert.equal(result.HTTPS_PROXY, "http://127.0.0.1:2");
  assert.equal(result.PYTHONIOENCODING, "utf-8");
  assert.equal(result.PYTHONUTF8, "1");
});
