import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AppError } from './errors.mjs';
import { runtimeArguments } from './runtime-options.mjs';

const exec = promisify(execFile);
export const TASK_NAME = process.env.QUANLAI_TASK_NAME || 'QuanLai Daily Coupon';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
export function taskAction() {
  const electron = Boolean(process.versions.electron);
  return {
    execute: process.execPath,
    arguments: (electron ? (process.defaultApp ? `"${root}" --issue-auto` : '--issue-auto') : `--env-file-if-exists="${path.join(root, '.env')}" "${path.join(root, 'scripts/issue.mjs')}" --auto`) + (runtimeArguments() ? ` ${runtimeArguments()}` : ''),
    workingDirectory: electron ? path.dirname(process.execPath) : root,
  };
}
async function powershell(command) {
  try {
    const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); ${command}`, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
    return result.stdout.trim();
  } catch (cause) { throw Object.assign(new AppError('TASK_ERROR', 503), { cause }); }
}
export function createTaskAdapter({ taskName = TASK_NAME, action = taskAction(), platform = process.platform } = {}) {
  const native = platform === 'win32';
  async function query() {
    if (!native) return { exists: false, provider: 'in-process' };
    const output = await powershell(`$t = Get-ScheduledTask -TaskName ${quote(taskName)} -ErrorAction SilentlyContinue; if ($t) { $daily = @($t.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskDailyTrigger' }); @{ exists=$true; enabled=($t.State -ne 'Disabled'); execute=$t.Actions[0].Execute; arguments=$t.Actions[0].Arguments; workingDirectory=$t.Actions[0].WorkingDirectory; time=($daily | Select-Object -First 1 -ExpandProperty StartBoundary); triggerCount=@($t.Triggers).Count; startWhenAvailable=$t.Settings.StartWhenAvailable } | ConvertTo-Json -Compress } else { '{"exists":false}' }`);
    try { return { ...JSON.parse(output), provider: 'windows-task-scheduler' }; } catch { throw new AppError('TASK_ERROR', 503); }
  }
  function matches(task, time) {
    return !native || Boolean(task.exists && task.enabled && task.execute === action.execute && task.arguments === action.arguments && task.workingDirectory === action.workingDirectory && String(task.time).slice(11, 16) === time && task.triggerCount === 3 && task.startWhenAvailable);
  }
  async function register(time) {
    if (!native) return { registered: false, provider: 'in-process' };
    await powershell([
      `$action = New-ScheduledTaskAction -Execute ${quote(action.execute)} -Argument ${quote(action.arguments)} -WorkingDirectory ${quote(action.workingDirectory)}`,
      `$daily = New-ScheduledTaskTrigger -Daily -At ${quote(time)}`,
      '$logon = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)',
      "$resume = New-CimInstance -ClientOnly -CimClass (Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskEventTrigger) -Property @{ Enabled=$true; Subscription='<QueryList><Query Id=\"0\" Path=\"System\"><Select Path=\"System\">*[System[Provider[@Name=\"Microsoft-Windows-Power-Troubleshooter\"] and EventID=1]]</Select></Query></QueryList>' }",
      '$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)',
      '$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited',
      `Register-ScheduledTask -TaskName ${quote(taskName)} -Action $action -Trigger @($daily,$logon,$resume) -Settings $settings -Principal $principal -Description 'QuanLai: local daily coupon task; login/resume checks only today.' -Force | Out-Null`,
    ].join('; '));
    const task = await query();
    if (!matches(task, time)) throw new AppError('TASK_ERROR', 503);
    return { registered: true, provider: task.provider };
  }
  async function remove() {
    if (!native) return;
    await powershell(`$t=Get-ScheduledTask -TaskName ${quote(taskName)} -ErrorAction SilentlyContinue; if ($t) { $t | Unregister-ScheduledTask -Confirm:$false }; if (Get-ScheduledTask -TaskName ${quote(taskName)} -ErrorAction SilentlyContinue) { throw 'task remains' }`);
  }
  return { query, matches, register, remove, native };
}
export const systemTasks = createTaskAdapter();
export const registerSystemSchedule = systemTasks.register;
