import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export async function registerSystemSchedule(time) {
  if (process.platform !== "win32") {
    return { registered: false, provider: "in-process", message: "保持券来运行即可按时执行" };
  }

  const projectRoot = path.resolve(".");
  const issueScript = path.join(projectRoot, "scripts", "issue.mjs");
  const envFile = path.join(projectRoot, ".env");
  const actionArguments = `--env-file-if-exists="${envFile}" "${issueScript}" --auto`;
  const command = [
    `$action = New-ScheduledTaskAction -Execute ${quotePowerShell(process.execPath)} -Argument ${quotePowerShell(actionArguments)} -WorkingDirectory ${quotePowerShell(projectRoot)}`,
    `$trigger = New-ScheduledTaskTrigger -Daily -At ${quotePowerShell(time)}`,
    "$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries",
    "$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited",
    "Register-ScheduledTask -TaskName 'QuanLai Daily Coupon' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Runs the local QuanLai coupon task every day.' -Force | Out-Null",
  ].join(";");
  const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand], {
    cwd: path.resolve("."),
    encoding: "utf8",
    windowsHide: true,
    timeout: 20_000,
  });
  return { registered: true, provider: "windows-task-scheduler" };
}
