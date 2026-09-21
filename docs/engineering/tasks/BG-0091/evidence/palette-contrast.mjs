import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4319";

const PAIRS = [
  ["--ui-on-surface", "--ui-page", "body copy on page"],
  ["--ui-on-surface", "--ui-surface", "body copy on card"],
  ["--ui-on-surface-muted", "--ui-surface", "muted copy on card"],
  ["--ui-on-surface-muted", "--ui-page", "muted copy on page"],
  ["--ui-on-surface-faint", "--ui-surface", "placeholder on field"],
  ["--ui-ink-fg", "--ui-surface", "brand text on card"],
  ["--ui-ink-fg", "--ui-page", "brand text on page"],
  ["--ui-ink-fg", "--ui-surface-sunken", "brand text on sunken"],
  ["--ui-on-ink", "--ui-ink", "cyan on ink fill"],
  ["--ui-on-ink-plain", "--ui-ink", "plain on ink fill"],
  ["--ui-positive", "--ui-surface", "positive as text"],
  ["--ui-negative", "--ui-surface", "negative as text"],
  ["--ui-ink-deep", "--ui-caution", "ink-deep on amber fill"],
  ["--ui-on-pitch", "--ui-pitch-turf-a", "pitch label on turf A"],
  ["--ui-on-pitch", "--ui-pitch-turf-b", "pitch label on turf B"],
  ["--ui-on-pitch", "--ui-pitch-bench", "bench label"],
  ["--ui-on-fdr-1", "--ui-fdr-1", "FDR 1"],
  ["--ui-on-fdr-2", "--ui-fdr-2", "FDR 2"],
  ["--ui-on-fdr-3", "--ui-fdr-3", "FDR 3"],
  ["--ui-on-fdr-4", "--ui-fdr-4", "FDR 4"],
  ["--ui-on-fdr-5", "--ui-fdr-5", "FDR 5"],
  ["--ui-ink-deep", "--ui-accent-spring", "action-gradient start stop"],
  ["--ui-ink-deep", "--ui-accent-sky", "action-gradient end stop"],
];

const browser = await chromium.launch();
const out = [];
for (const theme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((theme) => {
    const apply = () => {
      const root = document.documentElement;
      if (!root) return;
      root.classList.toggle("dark", theme === "dark");
      root.style.colorScheme = theme;
    };
    document.addEventListener("DOMContentLoaded", apply);
    apply();
    const attach = () => {
      const root = document.documentElement;
      if (root)
        new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["class"] });
    };
    attach();
    document.addEventListener("DOMContentLoaded", attach);
  }, theme);
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(400);
  const rows = await page.evaluate((pairs) => {
    const raster = (color, over) => {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (over) {
        ctx.fillStyle = over;
        ctx.fillRect(0, 0, 1, 1);
      }
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const lum = ([r, g, b]) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const x = lum(a),
        y = lum(b);
      return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
    };
    return pairs.map(([fgToken, bgToken, name]) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${fgToken})`;
      probe.style.backgroundColor = `var(${bgToken})`;
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const bg = cs.backgroundColor;
      const value = ratio(raster(cs.color, bg), raster(bg));
      const resolved = { fg: cs.color, bg };
      probe.remove();
      return { name, fgToken, bgToken, ratio: value, ...resolved };
    });
  }, PAIRS);
  for (const row of rows) out.push({ theme, ...row });
  await context.close();
}
await browser.close();
writeFileSync(process.argv[2] ?? "/tmp/palette.json", JSON.stringify(out, null, 2));
for (const row of out) {
  const flag = row.ratio < 4.5 ? (row.ratio >= 3 ? "  (3:1 large-only)" : "  *** FAIL") : "";
  console.log(
    `${row.theme.padEnd(5)} ${row.name.padEnd(30)} ${String(row.ratio).padStart(6)}${flag}`,
  );
}
