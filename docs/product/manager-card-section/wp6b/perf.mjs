/**
 * Plan 6.6 / 9.20 on the real page: from the data on screen to the card drawn on G1, in Chromium
 * with the CPU throttled four times (`Emulation.setCPUThrottlingRate`), and the renderer's own
 * timings at the same throttle. « Data on screen » is the moment the rating line (ordinary DOM, drawn
 * from the card read) first exists; « card drawn » is `data-mc-ready="1"` on the stage. A development
 * server serves every module as its own file, so these are upper bounds for the production build.
 *
 *   BASE=http://127.0.0.1:4186 node docs/product/manager-card-section/wp6b/perf.mjs
 */
const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const base = process.env.BASE ?? "http://127.0.0.1:4186";
const RUNS = Number(process.env.RUNS ?? 5);
const pw = await import(PW_CORE);
const browser = await pw.chromium.launch({ executablePath: CHROME });
const DEMO = {
  id: "usr_demo",
  email: "demo@botolago.ma",
  displayName: "Rachid Demo",
  username: "rachid_demo",
  language: "fr",
  notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
  profileComplete: true,
  createdAt: "2026-09-01T00:00:00Z",
  verified: true,
  provider: "email",
  favoriteClubId: "war",
  passwordDigest: "x",
};

async function newPage(lang = "fr") {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.addInitScript(
    ([demo, lang]) => {
      localStorage.setItem("botolago.prizes.welcome.v1", "1");
      localStorage.setItem("botolago.welcomed", "1");
      localStorage.setItem("botolago.language", lang);
      sessionStorage.setItem("botolago.splashShown", "1");
      sessionStorage.setItem("botolago.card.hero_session.v1", "1");
      localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
      localStorage.setItem(
        "botolago.auth.session",
        JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
      );
      // when the rating line first exists, and when the card first says it is drawn
      window.__t = {};
      const look = () => {
        const line = document.querySelector('[data-testid="gradins-rating-line"]');
        const stage = document.querySelector('[data-testid="gradins-stage"][data-mc-ready="1"]');
        if (line && !window.__t.data) window.__t.data = performance.now();
        if (stage && !window.__t.card) window.__t.card = performance.now();
        if (!window.__t.card) requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    },
    [DEMO, lang],
  );
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return { context, page };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [];
for (const lang of ["fr", "ar"]) {
  const cold = [];
  const warm = [];
  for (let i = 0; i < RUNS; i += 1) {
    const { context, page } = await newPage(lang);
    await page.goto(`${base}/gradins?mc=forming1`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="gradins-stage"][data-mc-ready="1"]', {
      timeout: 60000,
    });
    const first = await page.evaluate(() => window.__t);
    cold.push(first.card - first.data);
    // a second visit in the same browser: modules and the card chunk are cached
    await page.evaluate(() => sessionStorage.setItem("botolago.card.hero_session.v1", "1"));
    await page.goto(`${base}/gradins?mc=forming1`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="gradins-stage"][data-mc-ready="1"]', {
      timeout: 60000,
    });
    const again = await page.evaluate(() => window.__t);
    warm.push(again.card - again.data);
    await context.close();
  }
  rows.push({
    lang,
    kind: "G1 data to card, first visit",
    ms: cold.map(Math.round),
    median: Math.round(median(cold)),
  });
  rows.push({
    lang,
    kind: "G1 data to card, second visit",
    ms: warm.map(Math.round),
    median: Math.round(median(warm)),
  });
}

// the renderer's own timings in the page, throttled four times
const { context, page } = await newPage("fr");
await page.goto(`${base}/gradins?mc=forming1`, { waitUntil: "load" });
await page.waitForSelector('[data-testid="gradins-stage"][data-mc-ready="1"]', { timeout: 60000 });
const timings = await page.evaluate(async () => {
  const { echarpeRenderer: R } = await import("/src/components/manager-card/echarpe/index.ts");
  const { PROFILES, FR, AR } = await import("/src/components/manager-card/echarpe/test-data.ts");
  const med = (fn, runs = 30) => {
    for (let i = 0; i < 3; i += 1) fn();
    const t = [];
    for (let i = 0; i < runs; i += 1) {
      const a = performance.now();
      fn();
      t.push(performance.now() - a);
    }
    return Math.round(t.sort((x, y) => x - y)[Math.floor(runs / 2)] * 100) / 100;
  };
  const out = {
    "full() rated, French": med(() => R.full(PROFILES.rated, { strings: FR, theme: "light" })),
    "full() founder, Arabic, dark": med(() =>
      R.full(PROFILES.founder, { strings: AR, theme: "dark" }),
    ),
    "full() legend": med(() => R.full(PROFILES.legend, { strings: FR, theme: "light" })),
    "token() 44 px": med(
      () => R.token(PROFILES.rated, { strings: FR, theme: "light", size: 44 }),
      100,
    ),
    "token() 24 px": med(
      () => R.token(PROFILES.rated, { strings: FR, theme: "light", size: 24 }),
      100,
    ),
  };
  // an Arabic name with no hand chart is sampled from Changa 800 on a canvas
  const arabic = PROFILES.arabicName ?? PROFILES.rated;
  const a = performance.now();
  R.full({ ...arabic, name: "عبد الرحمن بن سليمان" }, { strings: AR, theme: "light" });
  out["full() Arabic name sampled on a canvas (first draw)"] =
    Math.round((performance.now() - a) * 10) / 10;
  return out;
});
await context.close();
await browser.close();
console.log(JSON.stringify({ throttle: 4, g1: rows, renderer: timings }, null, 2));
