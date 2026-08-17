const API_PREFIX = "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_PREFIX}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "服务暂时不可用，请稍后重试");
    error.code = payload.code || "REQUEST_FAILED";
    error.redirectUrl = payload.redirectUrl || "";
    throw error;
  }

  return payload;
}

export const couponApi = {
  status() {
    return request("/status");
  },

  requestOtp(phone, termsAccepted) {
    return request("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone, termsAccepted }),
    });
  },

  verifyOtp(phone, code) {
    return request("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    });
  },

  saveSchedule(time) {
    return request("/schedule", {
      method: "POST",
      body: JSON.stringify({ time, enabled: true }),
    });
  },
};

export function getNextRunLabel(time) {
  const [hour, minute] = time.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const dayLabel = next.toDateString() === tomorrow.toDateString() ? "明天" : "今天";
  return `${dayLabel} ${time}`;
}
