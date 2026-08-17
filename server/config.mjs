import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";

const home = os.homedir();
const defaultDataDir = process.platform === "win32"
  ? path.join(process.env.APPDATA || home, "券来")
  : path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "quanlai");

const defaultSkillRoot = path.join(home, ".workbuddy", "skills", "meituan-coupon__skillhub");
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
  mode: "workbuddy-skill",
  port: Number(process.env.QUANLAI_PORT || 4173),
  dataDir: process.env.QUANLAI_DATA_DIR || defaultDataDir,
  staticDir: path.resolve("dist/client"),
  skillRoot: process.env.WORKBUDDY_MEITUAN_SKILL_ROOT || defaultSkillRoot,
  pythonExe: process.env.WORKBUDDY_PYTHON || pythonCandidates.find((candidate) => candidate === "python3" || existsSync(candidate)) || pythonCandidates[0],
};

export function skillPaths() {
  const scripts = path.join(config.skillRoot, "scripts");
  return {
    auth: path.join(scripts, "auth.py"),
    issue: path.join(scripts, "issue.py"),
    query: path.join(scripts, "query.py"),
  };
}
