import { runIssue } from "../server/scheduler.mjs";

import { publicError } from "../server/errors.mjs";

const automatic = process.argv.includes("--auto");

try {
  const result = await runIssue(automatic ? "auto" : "manual");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(publicError(error).message);
  process.exit(1);
}
