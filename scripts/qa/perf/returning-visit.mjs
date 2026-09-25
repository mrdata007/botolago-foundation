// Returning-visitor lab measurement: language chosen, welcome done, splash
// already seen this session. Compares builds served side by side.
//
//   node scripts/qa/perf/returning-visit.mjs before=http://127.0.0.1:4811 after=http://127.0.0.1:4812
//
// Options (env): RUNS (default 3), CHROMIUM (browser executable, else
// Playwright's own). Mobile: 4x CPU slowdown, 150 ms RTT, 1.6 Mbps down /
// 750 kbps up, applied for real through CDP; desktop: no CPU slowdown, 40 ms,
// 10 Mbps. Versions alternate run by run; each metric is the median. Metrics
// come from the page's own largest-contentful-paint, layout-shift and
// longtask entries; TBT is long-task time over 50 ms after first paint.
// Point it at local builds only: it is not a load test.
import { chromium } from "playwright";

const versions = Object.fromEntries(process.argv.slice(2).map((arg) => arg.split("=")));
if (Object.keys(versions).length === 0) {
  console.error("usage: node scripts/qa/perf/returning-visit.mjs name=http://host:port ...");
  process.exit(2);
}
const runs = Number(process.env.RUNS ?? 3);
const profiles = {
  360: { width: 360, height: 780, mobile: true },
  390: { width: 390, height: 844, mobile: true },
  430: { width: 430, height: 932, mobile: true },
  desktop: { width: 1350, height: 940, mobile: false },
};
const specs = [
  ["390", "/"],
  ["390", "/matches"],
  ["390", "/matches/standings"],
  ["390", "/clubs"],
  ["360", "/"],
  ["430", "/"],
  ["desktop", "/"],
];

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);

async function measure(base, viewportKey, path) {
  const p = profiles[viewportKey];
  const context = await browser.newContext({
    viewport: { width: p.width, height: p.height },
    deviceScaleFactor: p.mobile ? 3 : 1,
    isMobile: p.mobile,
    hasTouch: p.mobile,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("botolago.language", "fr");
      localStorage.setItem("botolago.welcomed", "1");
      sessionStorage.setItem("botolago.splashShown", "1");
    } catch {
      // Storage blocked: the run measures a first visit instead.
    }
    const lab = { lcp: 0, cls: 0, fcp: 0, longTasks: [] };
    window.__lab = lab;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) lab.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) lab.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) lab.longTasks.push([entry.startTime, entry.duration]);
    }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") lab.fcp = entry.startTime;
      }
    }).observe({ type: "paint", buffered: true });
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send(
    "Network.emulateNetworkConditions",
    p.mobile
      ? { offline: false, latency: 150, downloadThroughput: 209715, uploadThroughput: 96000 }
      : { offline: false, latency: 40, downloadThroughput: 1310720, uploadThroughput: 1310720 },
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.mobile ? 4 : 1 });
  let scriptBytes = 0;
  const types = new Map();
  cdp.on("Network.responseReceived", (event) => types.set(event.requestId, event.type));
  cdp.on("Network.loadingFinished", (event) => {
    if (types.get(event.requestId) === "Script") scriptBytes += event.encodedDataLength;
  });
  await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3_000);
  const lab = await page.evaluate(() => window.__lab);
  await context.close();
  const tbt = lab.longTasks
    .filter(([start]) => start >= lab.fcp)
    .reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0);
  return { fcp: lab.fcp, lcp: lab.lcp, cls: lab.cls, tbt, scriptKB: scriptBytes / 1024 };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [];
for (const [viewportKey, path] of specs) {
  const results = Object.fromEntries(Object.keys(versions).map((name) => [name, []]));
  for (let i = 0; i < runs; i += 1) {
    for (const [name, base] of Object.entries(versions)) {
      results[name].push(await measure(base, viewportKey, path));
    }
  }
  for (const [name, list] of Object.entries(results)) {
    rows.push({
      viewport: viewportKey,
      page: path,
      version: name,
      fcpMs: Math.round(median(list.map((r) => r.fcp))),
      lcpMs: Math.round(median(list.map((r) => r.lcp))),
      tbtMs: Math.round(median(list.map((r) => r.tbt))),
      cls: Number(median(list.map((r) => r.cls)).toFixed(3)),
      scriptKB: Math.round(median(list.map((r) => r.scriptKB))),
    });
  }
}
await browser.close();
console.table(rows);
