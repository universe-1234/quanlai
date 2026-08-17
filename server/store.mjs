import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

async function ensureDataDir() {
  await mkdir(config.dataDir, { recursive: true, mode: DIR_MODE });
}

export async function readJson(name, fallback = null) {
  await ensureDataDir();
  try {
    return JSON.parse(await readFile(path.join(config.dataDir, name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(name, value) {
  await ensureDataDir();
  const filePath = path.join(config.dataDir, name);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: FILE_MODE });
  return filePath;
}

export function maskPhone(phone) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
