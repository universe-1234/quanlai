import { execFile } from "node:child_process";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import extract from "extract-zip";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(".");
const runtimeDir = path.join(projectRoot, "build", "runtime");
const pythonDir = path.join(runtimeDir, "python");
const pythonExe = path.join(pythonDir, "python.exe");
const clawhubCli = path.join(projectRoot, "node_modules", "clawhub", "bin", "clawdhub.js");
const skillReference = "@meituan-skillhub/meituan-coupons";
const skillVersion = "1.0.0";
const skillRoot = path.join(runtimeDir, "skills", "@meituan-skillhub", "meituan-coupons");
const pythonVersion = "3.13.12";
const pythonArchiveUrl = `https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`;
const getPipUrl = "https://bootstrap.pypa.io/get-pip.py";

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function download(url, target) {
  if (process.platform === "win32") {
    const partial = `${target}.partial`;
    await rm(partial, { force: true });
    await execFileAsync("curl.exe", [
      "-fL",
      "--retry", "3",
      "--connect-timeout", "20",
      "--max-time", "300",
      "--output", partial,
      url,
    ], { encoding: "utf8", timeout: 320_000, windowsHide: true });
    await rename(partial, target);
    return;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`下载失败：${response.status} ${url}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function prepareSkill() {
  const authScript = path.join(skillRoot, "scripts", "auth.py");
  if (await exists(authScript)) return;
  await rm(path.join(runtimeDir, "skills"), { recursive: true, force: true });
  await execFileAsync(process.execPath, [
    clawhubCli,
    "--no-input",
    "--workdir", runtimeDir,
    "--dir", "skills",
    "install", skillReference,
    "--version", skillVersion,
  ], { cwd: projectRoot, encoding: "utf8", timeout: 120_000, windowsHide: true });
  if (!(await exists(authScript))) throw new Error("官方 Skill 安装后缺少 auth.py");
}

async function pythonReady() {
  if (!(await exists(pythonExe))) return false;
  try {
    await execFileAsync(pythonExe, ["-c", "import httpx,socksio; print(httpx.__version__)"], {
      encoding: "utf8",
      timeout: 20_000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function preparePython() {
  if (await pythonReady()) return;
  await rm(pythonDir, { recursive: true, force: true });
  await mkdir(pythonDir, { recursive: true });
  const archive = path.join(runtimeDir, "python-embed.zip");
  const getPip = path.join(pythonDir, "get-pip.py");
  await download(pythonArchiveUrl, archive);
  await extract(archive, { dir: pythonDir });

  const pthFile = path.join(pythonDir, "python313._pth");
  let pth = await readFile(pthFile, "utf8");
  pth = pth.replace(/^#import site$/m, "import site");
  if (!pth.includes("Lib/site-packages")) pth = `${pth.trim()}\nLib/site-packages\n`;
  await writeFile(pthFile, pth, "utf8");

  await download(getPipUrl, getPip);
  await execFileAsync(pythonExe, [getPip, "--no-warn-script-location"], {
    cwd: pythonDir,
    encoding: "utf8",
    timeout: 180_000,
    windowsHide: true,
  });
  await execFileAsync(pythonExe, ["-m", "pip", "install", "--no-cache-dir", "httpx[socks]==0.28.1"], {
    cwd: pythonDir,
    encoding: "utf8",
    timeout: 180_000,
    windowsHide: true,
  });
  await rm(archive, { force: true });
  await rm(getPip, { force: true });
  if (!(await pythonReady())) throw new Error("独立 Python 运行时验证失败");
}

await mkdir(runtimeDir, { recursive: true });
await prepareSkill();
await preparePython();
await writeFile(path.join(runtimeDir, "runtime-manifest.json"), `${JSON.stringify({
  pythonVersion,
  skillReference,
  skillVersion,
  skillSource: "https://clawhub.ai/meituan-skillhub/skills/meituan-coupons",
}, null, 2)}\n`, "utf8");
console.log(`独立运行时已准备：Python ${pythonVersion} / ${skillReference}@${skillVersion}`);
