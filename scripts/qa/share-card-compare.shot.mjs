import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
const { PORT, OUT } = process.env;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pg = await b.newPage({ viewport: { width: 900, height: 900 } });
pg.on("pageerror", (e) => console.log("pageerror:", e.message));
await pg.goto(`http://localhost:${PORT}/index.html`);
await pg.waitForSelector("body[data-done]", { timeout: 90000 });
await pg.waitForTimeout(500);
await pg.screenshot({ path: `${OUT}/compare.png`, fullPage: true });
// the share pictures at full size (1080 x 1920), one file per case
const shots = await pg.evaluate(async () =>
  Promise.all([...document.querySelectorAll("img.share")].map(async (img) => {
    const blob = await (await fetch(img.src)).blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (const x of buf) s += String.fromCharCode(x);
    return { label: img.dataset.label, b64: btoa(s) };
  })));
for (const s of shots) writeFileSync(`${OUT}/share-${s.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`, Buffer.from(s.b64, "base64"));
await b.close();
