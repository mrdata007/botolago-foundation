import { chromium } from "/home/user/mc-sorare/node_modules/playwright/index.mjs";
import sharp from "/home/user/botolago-app/node_modules/sharp/lib/index.js";
import fs from "node:fs";
const D = "/home/user/mc-sorare/docs/product/manager-card-sorare-style/design-v2-v3";
fs.mkdirSync(`${D}/compare`, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
let page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
const img = async (f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
async function sheet(name, title, rows, colW) {
  // rows: [{label, before, after}]
  let body = "";
  for (const r of rows)
    body += `<div class="lab">${r.label}</div><figure><img src="${await img(`${D}/before/${r.before}`)}"><figcaption>Revision 2 (before)</figcaption></figure><figure><img src="${await img(`${D}/after/${r.after ?? r.before}`)}"><figcaption>Revision 3 (after)</figcaption></figure>`;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e9ecf1;font:600 13px/1.4 system-ui,sans-serif;color:#1d2433}main{padding:20px;display:grid;grid-template-columns:${colW}px ${colW}px;gap:10px 20px;width:max-content}h1{grid-column:1/-1;margin:0 0 4px;font-size:17px}.lab{grid-column:1/-1;margin-top:10px;font-size:14px}figure{margin:0}img{display:block;width:${colW}px;height:auto;border-radius:6px;background:#0b1020}figcaption{margin-top:4px;color:#4f5b70}</style><main><h1>${title}</h1>${body}</main>`;
  await page.setContent(html);
  await page.waitForTimeout(300);
  const m = page.locator("main");
  const png = await m.screenshot();
  await sharp(png).webp({ quality: 88 }).toFile(`${D}/compare/${name}.webp`);
  console.log(name, (fs.statSync(`${D}/compare/${name}.webp`).size / 1024).toFixed(0) + " kB");
}
const ONLY390 = process.argv[2] === "390";
const GRIDS = process.argv[2] === "grids"; // only the three whole-page sheets (after capture-stitched.mjs)
if (!ONLY390 && !GRIDS)
  for (const t of ["base", "lastreet", "stade", "pro", "champion", "legend"])
    await sheet(
      `tier-${t}`,
      `${t === "lastreet" ? "LASTREET" : t.toUpperCase()}: revision 2 and revision 3, 296 px card at DPR 2, reduced motion (rest pose: revision 2 leans, revision 3 is flat and crisp)`,
      [
        { label: "Dark page", before: `tier-${t}-dark.png` },
        { label: "Light page", before: `tier-${t}-light.png` },
      ],
      336,
    );
if (!ONLY390 && !GRIDS)
  await sheet(
    "tilt",
    "Pointer over the top-trailing corner (motion on): PRO and LEGEND, dark page",
    [
      { label: "PRO", before: "tilt-pro-dark.png" },
      { label: "LEGEND", before: "tilt-legend-dark.png" },
    ],
    352,
  );
if (!ONLY390 && !GRIDS)
  await sheet(
    "arabic",
    "Arabic interface row, 1440 px, DPR 2",
    [
      { label: "Dark page", before: "arabic-dark.png" },
      { label: "Light page", before: "arabic-light.png" },
    ],
    760,
  );
if (!ONLY390 && !GRIDS)
  await sheet(
    "tokens",
    "Small sizes. Before: one flat LEGEND card at 80, 64, 56, 44, 32, 28, 24 px. After: every tier at 80, 64, 48, 32, 24 px",
    [
      { label: "Dark page", before: "tokens-dark.png" },
      { label: "Light page", before: "tokens-light.png" },
    ],
    640,
  );
if (!ONLY390)
  await sheet(
    "grid-1440",
    "Full grid at 1440 px, DPR 2 (whole page)",
    [
      { label: "Dark page", before: "full-1440-dark.png" },
      { label: "Light page", before: "full-1440-light.png" },
    ],
    720,
  );
// the phone-width pages are taller than WebP's 16383 px limit at DPR 2: compose them at DPR 1.5
page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1.5 });
await sheet(
  "grid-390-dark",
  "Phone width 390 px, DPR 2, dark page (whole page)",
  [{ label: "Dark page", before: "full-390-dark.png" }],
  390,
);
await sheet(
  "grid-390-light",
  "Phone width 390 px, DPR 2, light page (whole page)",
  [{ label: "Light page", before: "full-390-light.png" }],
  390,
);
await browser.close();
