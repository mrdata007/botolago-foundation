// Builds one self-contained HTML file from index.html: inlines every stylesheet,
// script, font and referenced review image. No network. Run from the repository root:
//   node design-lab/manager-cards-claude/build.mjs [outDir=design-lab/manager-cards-claude/dist]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] || join(here, "dist"));
const read = (p) => readFileSync(join(here, p), "utf8");
const mime = { ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
const dataUri = (abs) => `data:${mime[extname(abs)]};base64,${readFileSync(abs).toString("base64")}`;

let html = read("index.html");

// Stylesheets: inline, with url(...) assets resolved relative to each sheet.
html = html.replace(/<!--build:css-->([\s\S]*?)<!--\/build:css-->/, (_, block) => {
  const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const css = hrefs
    .filter((h) => existsSync(join(here, h)))
    .map((h) =>
      read(h).replace(/url\(([^)]+)\)/g, (m, u) => {
        const clean = u.replace(/["']/g, "");
        if (clean.startsWith("data:") || clean.startsWith("#")) return m;
        return `url(${dataUri(resolve(join(here, dirname(h)), clean))})`;
      }),
    )
    .join("\n");
  return `<style>\n${css}\n</style>`;
});

// Scripts: inline in order; review images referenced as "review/..." become data URIs.
html = html.replace(/<!--build:js-->([\s\S]*?)<!--\/build:js-->/, (_, block) => {
  const srcs = [...block.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  const js = srcs
    .filter((s) => existsSync(join(here, s)))
    .map((s) =>
      read(s)
        .replace(/"(review\/[^"]+\.(?:png|jpg|webp))"/g, (m, p) => (existsSync(join(here, p)) ? JSON.stringify(dataUri(join(here, p))) : m))
        .replace(/<\/script/gi, "<\\/script"),
    )
    .join("\n;\n");
  return `<script>\n${js}\n</script>`;
});

mkdirSync(outDir, { recursive: true });
const out = join(outDir, "manager-cards-claude.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
