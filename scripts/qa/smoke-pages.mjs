// Sprint smoke test: opens the main pages at phone size in French and Arabic,
// light and dark, and reports any browser error, failed script, or a page
// that did not come up. Screenshots go to <out-dir>.
//   node scripts/qa/smoke-pages.mjs <base-url> <out-dir>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [base = "http://127.0.0.1:4174", outDir = "audit/tmp/smoke"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const PAGES = [
  "/",
  "/matches",
  "/news",
  "/fantasy",
  "/fantasy/create",
  "/profile",
  "/auth/login",
  "/auth/register",
];
const VARIANTS = [
  { lang: "fr", scheme: "light" },
  { lang: "ar", scheme: "dark" },
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const results = [];
for (const variant of VARIANTS) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    colorScheme: variant.scheme,
  });
  await context.addInitScript((lang) => {
    try {
      localStorage.setItem("botolago.language", lang);
    } catch {
      /* ignore */
    }
  }, variant.lang);
  for (const path of PAGES) {
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
    });
    page.on("requestfailed", (request) => {
      if (/\.(js|css)$/.test(new URL(request.url()).pathname))
        problems.push(`failed: ${request.url()}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && /\/assets\//.test(response.url()))
        problems.push(`http ${response.status()}: ${response.url()}`);
    });
    const response = await page.goto(base + path, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => ({
      htmlLang: document.documentElement.lang,
      dir: document.documentElement.dir,
      text: document.body.innerText.slice(0, 80).replace(/\s+/g, " "),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    const name = `${variant.lang}-${variant.scheme}${path.replace(/\//g, "_") || "_home"}`;
    await page.screenshot({ path: `${outDir}/${name}.png` });
    results.push({ ...variant, path, status: response?.status(), ...state, problems });
    await page.close();
  }
  await context.close();
}
await browser.close();
writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 2));
for (const r of results)
  console.log(
    `${r.problems.length ? "PROBLEM" : "ok     "} ${r.lang}/${r.scheme} ${r.path} ${r.status} html-lang=${r.htmlLang} dir=${r.dir}${r.overflow ? " OVERFLOW" : ""}`,
    r.problems.length ? `\n   ${r.problems.slice(0, 6).join("\n   ")}` : "",
  );
