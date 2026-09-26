/**
 * Builds the pitch demo into demo/dist/site:
 *
 *   app.html      the demo app, one file: its script, its styles, the fonts,
 *                 the crests and every photo are inside it
 *   index.html    the presenter page (content only: the Artifact host wraps
 *                 it in its own document), which shows app.html in a phone
 *   preview.html  the same presenter page as a whole document, to open
 *                 locally or host anywhere static next to app.html
 *
 * Usage: bun run demo:build
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEMO_STEPS } from "../src/steps";

const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = join(demoDir, "..");
const appDir = join(demoDir, "dist", "app");
const siteDir = join(demoDir, "dist", "site");

const vite = spawnSync("bunx", ["vite", "build", "--config", join(demoDir, "vite.config.ts")], {
  cwd: repoDir,
  stdio: "inherit",
});
if (vite.status !== 0) process.exit(vite.status ?? 1);

const dataUri = (file: string, type: string) =>
  `data:${type};base64,${readFileSync(file).toString("base64")}`;

/** `url(/fonts/x.woff2)` (the product's public folder) → the font itself. */
function embedFonts(css: string): string {
  return css.replace(/url\((["']?)(?:\.{0,2}\/)*fonts\/([\w.-]+\.woff2)\1\)/g, (_, _q, name) => {
    const file = join(repoDir, "public", "fonts", name);
    if (!existsSync(file)) throw new Error(`font not found: ${name}`);
    return `url(${dataUri(file, "font/woff2")})`;
  });
}

// ---- app.html: fold the built script and stylesheet into the page ----------

let html = readFileSync(join(appDir, "index.html"), "utf8");
const assets = join(appDir, "assets");
for (const name of readdirSync(assets)) {
  const path = join(assets, name);
  if (name.endsWith(".css")) {
    const css = embedFonts(readFileSync(path, "utf8"));
    html = html.replace(
      new RegExp(`<link[^>]+href="\\./assets/${name.replace(/\./g, "\\.")}"[^>]*>`),
      () => `<style>${css}</style>`,
    );
  } else if (name.endsWith(".js")) {
    const js = readFileSync(path, "utf8").replace(/<\/script/gi, "<\\/script");
    html = html.replace(
      new RegExp(`<script[^>]+src="\\./assets/${name.replace(/\./g, "\\.")}"[^>]*></script>`),
      () => `<script type="module">${js}</script>`,
    );
  }
}
if (/src="\.\/assets\/|href="\.\/assets\//.test(html)) {
  throw new Error("app.html still points at a separate asset");
}
// The first stylesheet should arrive before the first script.
html = html.replace(
  /(<script type="module">[\s\S]*?<\/script>)([\s\S]*?)(<style>[\s\S]*?<\/style>)/,
  "$3$2$1",
);

// ---- index.html: the presenter ---------------------------------------------

const fontFaces = [
  [
    "Changa",
    "changa-latin-wght-normal.woff2",
    "U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122, U+2190-2193",
  ],
  [
    "Changa",
    "changa-latin-ext-wght-normal.woff2",
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+1E00-1E9F",
  ],
  [
    "Manrope",
    "manrope-latin-wght-normal.woff2",
    "U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122, U+2190-2193",
  ],
  [
    "Manrope",
    "manrope-latin-ext-wght-normal.woff2",
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+1E00-1E9F",
  ],
  [
    "Noto Sans Arabic",
    "noto-sans-arabic-arabic-wght-normal.woff2",
    "U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFC",
  ],
]
  .map(
    ([family, file, range]) =>
      `@font-face{font-family:"${family}";font-style:normal;font-weight:200 800;font-display:swap;src:url(${dataUri(
        join(repoDir, "public", "fonts", file),
        "font/woff2",
      )}) format("woff2");unicode-range:${range};}`,
  )
  .join("\n");

const presenter = readFileSync(join(demoDir, "presenter", "presenter.html"), "utf8")
  .replace("/*{{FONT_FACES}}*/", () => fontFaces)
  .replace("/*{{STEPS_JSON}}*/ []", () => JSON.stringify(DEMO_STEPS))
  .replace("{{STAGE_PHOTO}}", () =>
    dataUri(join(repoDir, "src", "assets", "photos", "welcome-wide.webp"), "image/webp"),
  )
  .replace("{{WORDMARK_SVG}}", () =>
    dataUri(
      join(repoDir, "src", "assets", "brand", "botolago-wordmark-light.svg"),
      "image/svg+xml",
    ),
  )
  .replace("{{MARK_SVG}}", () =>
    dataUri(join(repoDir, "src", "assets", "brand", "botolago-mark-light.svg"), "image/svg+xml"),
  );
if (presenter.includes("{{")) throw new Error("presenter.html has an unfilled placeholder");

rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });
writeFileSync(join(siteDir, "app.html"), html);
writeFileSync(join(siteDir, "index.html"), presenter);
writeFileSync(
  join(siteDir, "preview.html"),
  `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n</head>\n<body>\n${presenter}\n</body>\n</html>\n`,
);

const size = (file: string) =>
  `${(readFileSync(join(siteDir, file)).length / 1024 / 1024).toFixed(2)} MB`;
console.log(`demo/dist/site/app.html      ${size("app.html")}`);
console.log(`demo/dist/site/index.html    ${size("index.html")}`);
console.log(`demo/dist/site/preview.html  ${size("preview.html")}`);
