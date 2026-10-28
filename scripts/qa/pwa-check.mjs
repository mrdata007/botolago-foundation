// FE-H2 check: installability, caching and offline behaviour of the service
// worker, against a production build (`http://127.0.0.1:4174` by default).
//   CHROMIUM_PATH=... node scripts/qa/pwa-check.mjs [base-url]
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:4174";
// A real profile, not an incognito context: browsers never offer to install
// from incognito, and Chromium reports that as an installability error.
const profile = await mkdtemp(join(tmpdir(), "pwa-check-"));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  viewport: { width: 375, height: 812 },
  isMobile: true,
});
const browser = { close: () => context.close() };
await context.addInitScript(() => localStorage.setItem("botolago.language", "fr"));
const page = context.pages()[0] ?? (await context.newPage());
const results = {};

// 1. First visit: the worker installs and takes control.
await page.goto(base + "/", { waitUntil: "load" });
await page
  .waitForFunction(() => navigator.serviceWorker?.controller !== null || false, null, {
    timeout: 15000,
  })
  .catch(() => {});
await page.waitForTimeout(1500);
results.controlledAfterFirstVisit = await page.evaluate(() => !!navigator.serviceWorker.controller);
const cdp = await context.newCDPSession(page);
results.installabilityErrors = (
  await cdp.send("Page.getInstallabilityErrors")
).installabilityErrors;
const manifest = await cdp.send("Page.getAppManifest");
results.manifestErrors = manifest.errors;

// 2. Second visit: the site's own files come from the worker's cache.
const fromWorker = [];
const fromNetwork = [];
const supabaseViaWorker = [];
page.on("response", (response) => {
  const url = response.url();
  if (/supabase\.co/.test(url) && response.fromServiceWorker()) supabaseViaWorker.push(url);
  if (!url.startsWith(base)) return;
  const path = new URL(url).pathname;
  if (!/^\/(assets|fonts|icons)\//.test(path)) return;
  (response.fromServiceWorker() ? fromWorker : fromNetwork).push(path);
});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(3000);
results.secondVisit = { fromWorkerCache: fromWorker.length, fromNetwork: fromNetwork.length };

// 3. What the cache holds: only the site's own files and the offline page.
results.cached = await page.evaluate(async () => {
  const out = [];
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) out.push(new URL(request.url).pathname);
  }
  return out;
});
results.cachedOtherThanFiles = results.cached.filter(
  (path) => !/^\/(assets|fonts|icons)\//.test(path) && path !== "/offline.html",
);
results.supabaseAnsweredByWorker = supabaseViaWorker.length;

// 4. Sign-in still reaches Supabase (a wrong password is refused by Supabase itself).
await page.goto(base + "/auth/login", { waitUntil: "load" });
await page.waitForTimeout(1500);
const authResponse = page
  .waitForResponse((r) => /supabase\.co\/auth\/v1\/token/.test(r.url()), { timeout: 15000 })
  .catch(() => null);
await page.locator('input[type="email"]').fill("pwa-check@example.com");
await page.locator('input[type="password"]').fill("not-the-password-1");
await page.locator('form button[type="submit"]').first().click();
const auth = await authResponse;
results.signIn = auth
  ? { status: auth.status(), viaWorker: auth.fromServiceWorker() }
  : "no request seen";

// 5. Offline: a page never opened shows the offline page, not a browser error.
await context.setOffline(true);
await page
  .goto(base + "/clubs", { waitUntil: "load" })
  .catch((e) => (results.offlineError = e.message));
results.offlinePage = await page.evaluate(() => ({
  title: document.title,
  text: document.body.innerText.replace(/\s+/g, " ").slice(0, 120),
}));
await context.setOffline(false);

await browser.close();
console.log(JSON.stringify(results, (k, v) => (k === "cached" ? `${v.length} entries` : v), 2));
