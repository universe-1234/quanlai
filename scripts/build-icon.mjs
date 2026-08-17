import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const source = await readFile(new URL("../build/icon.svg", import.meta.url));
const png = await sharp(source).resize(512, 512).png().toBuffer();
await writeFile(new URL("../build/icon.png", import.meta.url), png);
console.log("应用图标已生成：build/icon.png");
