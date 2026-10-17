// Produce a self-contained, offline HTML artifact. Never writes to public/ or src/.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(process.argv[2] || path.join(root, "dist"));
await mkdir(dest, { recursive: true });
const fontDir = process.argv[3] ? path.resolve(process.argv[3]) : null;
const data = async (relative, mime) =>
  `data:${mime};base64,${(await readFile(fontDir && mime === "font/woff2" ? path.join(fontDir, path.basename(relative)) : path.resolve(root, relative))).toString("base64")}`;
let css = await readFile(path.join(root, "styles.css"), "utf8");
for (const m of [...css.matchAll(/url\(["']([^"']+)["']\)/g)])
  css = css.replace(m[0], `url('${await data(m[1], "font/woff2")}')`);
let js = await readFile(path.join(root, "app.js"), "utf8");
const light = await data("../../src/assets/brand/botolago-wordmark-light.svg", "image/svg+xml");
const color = await data("../../src/assets/brand/botolago-wordmark-color.svg", "image/svg+xml");
js = js.replaceAll("../../src/assets/brand/botolago-wordmark-light.svg", light)
  .replaceAll("../../src/assets/brand/botolago-wordmark-color.svg", color);
let html = await readFile(path.join(root, "index.html"), "utf8");
html = html
  .replace(/<link\b[^>]*href="styles.css"[^>]*>/, () => `<style>${css}</style>`)
  .replace('src="../../src/assets/brand/botolago-wordmark-light.svg"', `src="${light}"`)
  .replace(
    '<script src="app.js"></script>',
    () => `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`,
  );
await writeFile(path.join(dest, "manager-card-gallery.html"), html);
console.log("Built offline gallery: " + path.join(dest, "manager-card-gallery.html"));
