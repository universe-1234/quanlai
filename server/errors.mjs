export class AppError extends Error {
  constructor(code, status = 500) { super(code); this.code = code; this.status = status; }
}
const messages = {
  LOGIN_REQUIRED: "登录已失效，请重新登录后重试。",
  SKILL_NOT_INSTALLED: "领取组件不可用，请检查安装或重新安装应用。",
  SKILL_TIMEOUT: "请求超时，请检查网络后手动重试。",
  SKILL_PROCESS_ERROR: "领取组件运行失败，请检查网络或更新组件。",
  SKILL_FORMAT: "领取组件返回格式异常，请更新组件后重试。",
  TERMS_REQUIRED: "请先阅读并同意服务使用规则。",
  SMS_VERIFY_CODE_ERROR: "验证码无效，请核对或重新获取。",
  TASK_ERROR: "系统任务配置失败，请重试或检查 Windows 任务计划程序。",
  STATE_CORRUPT: "本地记录损坏，已保留诊断副本。请先关闭自动领取，再检查本地数据。",
  BUSY: "已有操作正在执行，请稍后重试。",
  INVALID_INPUT: "输入格式不正确，请检查后重试。",
  NETWORK_ERROR: "网络请求失败，请检查网络后重试。",
  INTERNAL_ERROR: "操作未完成，请重试；若持续失败，请检查本地数据与组件。",
  ACTIVITY_ENDED: "上游活动已结束，暂时无法领取。请关闭自动领取或稍后手动检查。",
  ALREADY_RECEIVED: "上游提示今天已领取，请在美团中查看已有优惠券。",
  QUOTA_EXHAUSTED: "上游活动额度已用完，请改天再试。",
};
export function publicError(error) {
  let code = error?.code;
  if (/TIMEOUT|ETIMEDOUT/.test(code || "")) code = "SKILL_TIMEOUT";
  if (/TOKEN|UNAUTHORIZED|LOGIN|AUTH_EXPIRED/.test(code || "")) code = "LOGIN_REQUIRED";
  if (/NETWORK|ECONN|ENOTFOUND/.test(code || "")) code = "NETWORK_ERROR";
  if (!messages[code]) code = "INTERNAL_ERROR";
  return { code, message: messages[code] };
}
export function displayText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).slice(0, 240).replace(/\b1\d{10}\b/g, "[手机号已隐藏]")
    .replace(/(?:[A-Za-z]:\\|\/Users\/|\/home\/)[^\s]*/g, "[路径已隐藏]")
    .replace(/(?:bearer\s+|(?:user[_-]?token|device[_-]?token|authorization|token)\s*[:=]\s*)\S+/gi, "[敏感字段已隐藏]");
}
export function safeCoupons(coupons) {
  if (!Array.isArray(coupons)) return [];
  return coupons.slice(0, 100).map(c => Object.fromEntries(
    ["name", "title", "coupon_name", "amount", "face_value", "threshold", "valid_until", "expire_time", "validity", "discount_amount", "use_condition", "valid_start", "valid_end", "issue_time"]
      .filter(k => c && ["string", "number"].includes(typeof c[k]))
      .map(k => [k, displayText(c[k])]),
  ));
}
