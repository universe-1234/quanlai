import { issueOfficialCoupons } from "./workbuddy-skill.mjs";
import { readJson, writeJson } from "./store.mjs";

let running = false;

export async function runIssue(reason = "manual") {
  if (running) return { ok: false, skipped: "already_running" };
  running = true;
  try {
    const result = await issueOfficialCoupons();
    return { ...result, reason, executedAt: new Date().toISOString() };
  } finally {
    running = false;
  }
}

export function startScheduler(onError = console.error) {
  const timer = setInterval(async () => {
    try {
      const schedule = await readJson("schedule.json", null);
      if (!schedule?.enabled) return;
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (currentTime !== schedule.time || schedule.lastRunDate === today) return;
      const result = await runIssue("scheduled");
      if (result.ok) await writeJson("schedule.json", { ...schedule, lastRunDate: today, lastRunAt: new Date().toISOString() });
    } catch (error) {
      onError(error);
    }
  }, 30_000);
  timer.unref();
  return timer;
}
