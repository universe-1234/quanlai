import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";

const home = os.homedir();
const resourcesPath = typeof process.resourcesPath === "string" ? process.resourcesPath : "";
const bundledRuntimeDir = resourcesPath ? path.join(resourcesPath, "runtime") : "";
const defaultDataDir = process.platform === "win32"
  ? path.join(process.env.APPDATA || home, "券来")
  : path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "quanlai");

const defaultSkillRoot = path.join(home, ".workbuddy", "skills", "meituan-coupon__skillhub");
const bundledSkillRoot = bundledRuntimeDir ? path.join(bundledRuntimeDir, "skills", "@meituan-skillhub", "meituan-coupons") : "";
const bundledPython = bundledRuntimeDir
  ? path.join(bundledRuntimeDir, "python", process.platform === "win32" ? "python.exe" : "bin/python3")
  : "";
const hasBundledRuntime = Boolean(
  bundledSkillRoot
  && bundledPython
  && existsSync(bundledSkillRoot)
  && existsSync(bundledPython),
);
const pythonCandidates = process.platform === "win32"
  ? [
      path.join(home, ".workbuddy", "binaries", "python", "envs", "default", "Scripts", "python.exe"),
      path.join(home, ".workbuddy", "binaries", "python", "versions", "3.13.12", "python.exe"),
    ]
  : [
      path.join(home, ".workbuddy", "binaries", "python", "envs", "default", "bin", "python"),
      "python3",
    ];

export const config = {
  mode: hasBundledRuntime ? "bundled-official-skill" : "local-official-skill",
  port: Number(process.env.QUANLAI_PORT || 4173),
  dataDir: process.env.QUANLAI_DATA_DIR || defaultDataDir,
  staticDir: process.env.QUANLAI_STATIC_DIR || path.resolve("dist/client"),
  skillRoot: process.env.QUANLAI_SKILL_ROOT
    || process.env.WORKBUDDY_MEITUAN_SKILL_ROOT
    || (bundledSkillRoot && existsSync(bundledSkillRoot) ? bundledSkillRoot : defaultSkillRoot),
  pythonExe: process.env.QUANLAI_PYTHON
    || process.env.WORKBUDDY_PYTHON
    || (bundledPython && existsSync(bundledPython) ? bundledPython : "")
    || pythonCandidates.find((candidate) => candidate === "python3" || existsSync(candidate))
    || pythonCandidates[0],
};

export function skillPaths() {
  const scripts = path.join(config.skillRoot, "scripts");
  return {
    auth: path.join(scripts, "auth.py"),
    issue: path.join(scripts, "issue.py"),
    query: path.join(scripts, "query.py"),
  };
}
