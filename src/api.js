const API_PREFIX = '/api';
async function request(path, options = {}) {
  const response = await fetch(`${API_PREFIX}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.message || '本地服务暂时不可用，请稍后重试。'); error.code = payload.code; error.redirectUrl = payload.redirectUrl || ''; throw error; }
  return payload;
}
const post = (url, data) => request(url, { method: 'POST', body: JSON.stringify(data) });
export const couponApi = {
  status: () => request('/status'),
  runs: () => request('/runs'),
  requestOtp: (phone, termsAccepted) => post('/auth/otp/request', { phone, termsAccepted }),
  verifyOtp: (phone, code) => post('/auth/otp/verify', { phone, code }),
  saveSchedule: (time, enabled = true) => post('/schedule', { time, enabled }),
  issue: () => post('/coupons/issue', {}),
};
export function getNextRunLabel(iso) {
  if (!iso) return '未安排';
  const date = new Date(iso);
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
