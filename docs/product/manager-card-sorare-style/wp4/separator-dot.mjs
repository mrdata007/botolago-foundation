/**
 * Finding 6 of the index: the « · » between the rating and the tier on G1 in Arabic (light), which the repository's
 * contrast probe reads at 2.2:1. Reads the dot's CSS colour and the darkest and lightest pixels of its box (5 x 37
 * CSS px) on the branch (4194) and on `main` (4181). Both servers must already be running, started as
 * `run-measurements.sh` describes; the result of the run that was made is `results/separator-dot.txt`.
 *
 *   node docs/product/manager-card-sorare-style/wp4/separator-dot.mjs
 */
import { chromium } from "@playwright/test";
import sharp from "sharp";
const f = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const L = (r, g, b) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
for (const [name, base] of [
  ["branch 4194", "http://127.0.0.1:4194"],
  ["base 4181", "http://127.0.0.1:4181"],
]) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("botolago.welcomed", "1");
    localStorage.setItem("botolago.prizes.welcome.v1", "1");
    localStorage.setItem("botolago.language", "ar");
    sessionStorage.setItem("botolago.splashShown", "1");
    sessionStorage.setItem("botolago.card.hero_session.v1", "1");
    const demo = {
      id: "usr_demo",
      email: "demo@botolago.ma",
      displayName: "Rachid Demo",
      username: "rachid_demo",
      language: "ar",
      notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
      profileComplete: true,
      createdAt: "2026-09-01T00:00:00Z",
      verified: true,
      provider: "email",
      favoriteClubId: "war",
      passwordDigest: "x",
    };
    localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
    localStorage.setItem(
      "botolago.auth.session",
      JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
    );
  });
  const page = await ctx.newPage();
  await page.goto(base + "/curva?mc=forming1");
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="curva-rating-line"]');
    const dot = [...p.querySelectorAll(":scope > span")].find((s) => s.textContent.trim() === "·");
    const r = dot.getBoundingClientRect();
    const cs = getComputedStyle(dot);
    const c = document.createElement("canvas").getContext("2d");
    c.fillStyle = cs.color;
    c.fillRect(0, 0, 1, 1);
    const px = c.getImageData(0, 0, 1, 1).data;
    return {
      box: [r.x, r.y, r.width, r.height],
      color: [px[0], px[1], px[2]],
      fs: cs.fontSize,
      fam: cs.fontFamily.slice(0, 30),
    };
  });
  const buf = await page.screenshot({
    clip: { x: info.box[0], y: info.box[1], width: info.box[2], height: info.box[3] },
  });
  const { data } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let min = 2,
    max = 0;
  for (let i = 0; i < data.length; i += 3) {
    const l = L(data[i], data[i + 1], data[i + 2]);
    min = Math.min(min, l);
    max = Math.max(max, l);
  }
  console.log(
    name,
    "dot box",
    info.box.map((x) => +x.toFixed(1)).join(","),
    "css colour",
    info.color.join(","),
    "font",
    info.fs,
    "| pixels: darkest L",
    min.toFixed(3),
    "lightest",
    max.toFixed(3),
    "ratio",
    ((max + 0.05) / (min + 0.05)).toFixed(2),
    "| colour vs white",
    (1.05 / (L(...info.color) + 0.05)).toFixed(2),
  );
  await ctx.close();
}
await b.close();
