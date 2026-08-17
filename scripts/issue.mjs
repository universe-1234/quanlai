import { runIssue } from "../server/scheduler.mjs";

const automatic = process.argv.includes("--auto");

try {
  const result = await runIssue(automatic ? "auto" : "manual");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
