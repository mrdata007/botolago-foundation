/**
 * The switch-on checks of plan section 9 (5 and 8) against a development server started with
 * `VITE_MANAGER_CARD_PREVIEW=1` and the mock data modes:
 *
 *   node docs/product/manager-card-section/wp1/capture-on.mjs <baseUrl> <outDir>
 *
 * For French and Arabic, at 390 and 1440: the navigation reads Accueil, Actualites, Fantasy,
 * Matches, Gradins (the bar on a phone, the top bar's text links on a desktop); Fantasy is the
 * current item on every /pepites page and Gradins on every /gradins page; `html` carries
 * `data-gradins="live"`; `?mc=featureOff` gives today's bar and sends /gradins to /fantasy, with
 * no console error. Writes `on.json` and a screenshot of each page's navigation.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const [baseUrl, outDir] = process.argv.slice(2);
if (!baseUrl || !outDir) throw new Error("usage: capture-on.mjs <baseUrl> <outDir>");
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM });
const results = [];

async function look(path, lang, width, height, scale, shot) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    locale: lang === "ar" ? "ar" : "fr-FR",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.addInitScript((l) => {
    localStorage.setItem("botolago.welcomed", "1");
    localStorage.setItem("botolago.prizes.welcome.v1", "1");
    localStorage.setItem("botolago.language", l);
    sessionStorage.setItem("botolago.splashShown", "1");
  }, lang);
  const errors = [];
  const bad = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on(
    "response",
    (r) => r.status() >= 400 && bad.push(`${r.status()} ${new URL(r.url()).pathname}`),
  );
  await page.goto(baseUrl + path, { waitUntil: "networkidle" });
  await page.waitForSelector(`html[data-lang="${lang}"]`);
  await page.waitForTimeout(700);
  const nav = page.locator("nav[aria-label]:visible").last();
  const items = await nav.locator("a").evaluateAll((links) =>
    links.map((a) => ({
      href: a.getAttribute("href"),
      current: a.getAttribute("aria-current") === "page",
      text: a.textContent.trim(),
      box: (({ width: w, height: h }) => ({ w: Math.round(w), h: Math.round(h) }))(
        a.getBoundingClientRect(),
      ),
    })),
  );
  const live = await page.evaluate(() => document.documentElement.dataset.gradins ?? null);
  if (shot) await nav.screenshot({ path: join(outDir, `${shot}.png`) });
  if (shot && shot.startsWith("page-"))
    await page.screenshot({ path: join(outDir, `${shot}.png`) });
  const out = {
    path,
    lang,
    width,
    finalPath: new URL(page.url()).pathname,
    items,
    live,
    errors,
    bad,
  };
  await context.close();
  return out;
}

for (const lang of ["fr", "ar"]) {
  for (const [width, height, scale] of [
    [390, 844, 2],
    [1440, 900, 1],
  ]) {
    for (const path of [
      "/",
      "/fantasy",
      "/pepites",
      "/pepites/classement",
      "/gradins",
      "/gradins/carte",
    ]) {
      results.push(
        await look(
          path,
          lang,
          width,
          height,
          scale,
          `nav-${lang}-${width}-${path.replace(/\W+/g, "_")}`,
        ),
      );
    }
    results.push(
      await look("/?mc=featureOff", lang, width, height, scale, `nav-${lang}-${width}-featureOff`),
    );
    results.push(await look("/gradins?mc=featureOff", lang, width, height, scale, null));
  }
}
await browser.close();
writeFileSync(join(outDir, "on.json"), JSON.stringify(results, null, 2));

const ORDER = ["/", "/news", "/fantasy", "/matches", "/gradins"];
const TODAY = ["/", "/news", "/fantasy", "/matches", "/pepites"];
const failures = [];
for (const r of results) {
  const hrefs = r.items.map((i) => i.href);
  const off = r.path.includes("featureOff");
  const label = `${r.lang} ${r.width} ${r.path}`;
  if (off) {
    if (r.path.startsWith("/gradins")) {
      // The redirect drops `?mc=`, so the page it lands on is live again: only where it went is checked.
      if (r.finalPath !== "/fantasy") failures.push(`${label}: stayed on ${r.finalPath}`);
    } else {
      if (JSON.stringify(hrefs) !== JSON.stringify(TODAY))
        failures.push(`${label}: bar is ${hrefs}`);
      if (r.live !== null) failures.push(`${label}: html is marked live`);
    }
    if (r.errors.length) failures.push(`${label}: console ${r.errors.join(" | ")}`);
    continue;
  }
  if (JSON.stringify(hrefs) !== JSON.stringify(ORDER)) failures.push(`${label}: bar is ${hrefs}`);
  if (r.live !== "live") failures.push(`${label}: html is not marked live`);
  const current = r.items.filter((i) => i.current).map((i) => i.href);
  const want = r.path.startsWith("/pepites")
    ? ["/fantasy"]
    : r.path.startsWith("/gradins")
      ? ["/gradins"]
      : r.path === "/"
        ? ["/"]
        : [r.path];
  if (JSON.stringify(current) !== JSON.stringify(want))
    failures.push(`${label}: current is ${current}, wanted ${want}`);
  if (r.width === 390) {
    for (const i of r.items)
      if (i.box.w < 44 || i.box.h < 44)
        failures.push(`${label}: ${i.href} is ${i.box.w}x${i.box.h}`);
  }
  if (r.errors.length) failures.push(`${label}: console ${r.errors.join(" | ")}`);
  if (r.bad.length) failures.push(`${label}: responses ${r.bad.join(", ")}`);
}
console.log(`${results.length} page states checked`);
if (failures.length) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("SWITCH ON: the bar, the lit tab, the marker and the redirects are as planned.");
