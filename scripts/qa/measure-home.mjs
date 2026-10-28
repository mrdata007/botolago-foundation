// Sprint performance measurement: loads one page at phone size (375 px) and
// records what the browser downloaded. Usage:
//   node scripts/qa/measure-home.mjs <url> <out-dir>
// Writes <out-dir>/playwright-<label>.json. Lighthouse runs separately.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [url = "http://127.0.0.1:4173/", outDir = "audit/tmp", label = "home"] =
  process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const requests = [];
let started = 0;
page.on("requestfinished", async (request) => {
  const at = Date.now() - started;
  const response = await request.response();
  const sizes = await request.sizes().catch(() => null);
  requests.push({
    url: request.url(),
    type: request.resourceType(),
    status: response?.status() ?? 0,
    bytes: sizes ? sizes.responseBodySize : 0,
    at,
  });
});
// MEASURE_LANG=ar measures the page as an Arabic reader gets it (the stored
// language choice); MEASURE_SLOW=1 slows the network to a phone's 4G so late
// fonts and images show their effect on layout.
if (process.env.MEASURE_LANG) {
  await page.addInitScript((lang) => {
    try {
      localStorage.setItem("botolago.language", lang);
    } catch {
      /* ignore */
    }
  }, process.env.MEASURE_LANG);
}
if (process.env.MEASURE_SLOW) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}
await page.addInitScript(() => {
  window.__cls = 0;
  window.__shifts = [];
  window.__lcp = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      window.__cls += entry.value;
      window.__shifts.push({
        at: Math.round(entry.startTime),
        value: Number(entry.value.toFixed(4)),
        nodes: entry.sources.map((source) => {
          const node = source.node;
          if (!node || node.nodeType !== 1) return node?.nodeName ?? "?";
          return `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}`;
        }),
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    window.__lcp = entries[entries.length - 1].startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
});
started = Date.now();
await page.goto(url, { waitUntil: "load" });
// Everything finished by now is the first load. The app then waits for the
// page to settle and fetches the other sections' code in the background
// (src/lib/section-warmup.ts); give that time and count it separately.
await page.waitForTimeout(1000);
const firstLoadEnd = Date.now() - started;
await page.waitForTimeout(9000);
const timing = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  return {
    domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
    loadMs: Math.round(nav.loadEventEnd),
    lcpMs: Math.round(window.__lcp),
    cls: Number(window.__cls.toFixed(4)),
    shifts: window.__shifts,
  };
});
await browser.close();

const isJs = (r) => r.type === "script" || /\.m?js(\?|$)/.test(r.url);
const first = requests.filter((r) => r.at <= firstLoadEnd);
const js = first.filter(isJs);
const allJs = requests.filter(isJs);
const summary = {
  url,
  measuredAt: new Date().toISOString(),
  firstLoad: {
    requests: first.length,
    jsFiles: js.length,
    jsBytes: js.reduce((sum, r) => sum + r.bytes, 0),
  },
  includingBackgroundWarmup: {
    requests: requests.length,
    jsFiles: allJs.length,
    jsBytes: allJs.reduce((sum, r) => sum + r.bytes, 0),
  },
  ...timing,
  jsUrls: js.map((r) => r.url.replace(/^https?:\/\/[^/]+/, "")),
};
writeFileSync(`${outDir}/playwright-${label}.json`, JSON.stringify({ summary, requests }, null, 2));
const { jsUrls, ...printable } = summary;
console.log(JSON.stringify(printable, null, 2));
