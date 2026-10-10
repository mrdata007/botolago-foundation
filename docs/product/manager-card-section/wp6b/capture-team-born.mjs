/**
 * WP6b item 1: the team page's born panel at 390 x 844, French and Arabic, the card with and
 * without a serial, light and dark, motion reduced. Prints the panel's height and where the pitch's
 * first row ends against the bottom navigation, from element rectangles.
 *
 *   BASE=http://127.0.0.1:4186 OUT=docs/product/manager-card-section/wp6b/after node docs/product/manager-card-section/wp6b/capture-team-born.mjs
 */
const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const base = process.env.BASE ?? "http://127.0.0.1:4186";
const out = process.env.OUT ?? "docs/product/manager-card-section/wp6b/after";

const DEMO = (lang) => ({
  id: "usr_demo",
  email: "demo@botolago.ma",
  displayName: "Rachid Demo",
  username: "rachid_demo",
  language: lang,
  notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
  profileComplete: true,
  createdAt: "2026-09-01T00:00:00Z",
  verified: true,
  provider: "email",
  favoriteClubId: "war",
  passwordDigest: "x",
});

const pw = await import(PW_CORE);
const browser = await pw.chromium.launch({ executablePath: CHROME });
const rows = [];
for (const [mc, lang, theme] of [
  ["born0", "fr", "light"],
  ["born0", "ar", "light"],
  ["born0Serial", "fr", "light"],
  ["born0Serial", "ar", "light"],
  ["born0Serial", "fr", "dark"],
  ["born0Serial", "ar", "dark"],
]) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.addInitScript(
    ([lang, demo, theme]) => {
      localStorage.setItem("botolago.prizes.welcome.v1", "1");
      localStorage.setItem("botolago.welcomed", "1");
      localStorage.setItem("botolago.language", lang);
      localStorage.setItem("botolago.theme", theme);
      sessionStorage.setItem("botolago.splashShown", "1");
      localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
      localStorage.setItem(
        "botolago.auth.session",
        JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
      );
    },
    [lang, DEMO(lang), theme],
  );
  await page.goto(`${base}/fantasy/team?mc=${mc}`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid="card-born-panel"]', { timeout: 20000 });
  await page.waitForTimeout(4000);
  const found = await page.evaluate(() => {
    const rect = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
    };
    const panel = document.querySelector('[data-testid="card-born-panel"]');
    const pitch = document.querySelector('[class*="--ui-pitch-bench"]');
    const first = pitch?.querySelector("button, a, [role='button']") ?? null;
    const nav = [...document.querySelectorAll("nav")]
      .map((node) => node.getBoundingClientRect())
      .filter((r) => r.bottom >= window.innerHeight - 1 && r.height > 40)
      .map((r) => Math.round(r.top))[0];
    const controls = [...panel.querySelectorAll("button, a")].map((node) => {
      const r = node.getBoundingClientRect();
      return {
        name: node.getAttribute("aria-label") ?? node.textContent.trim(),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    return {
      panel: rect(panel),
      firstRow: rect(first),
      navTop: nav ?? innerHeight,
      controls,
      heading: panel.querySelector("h2")?.textContent,
    };
  });
  const record = {
    mc,
    lang,
    theme,
    ...found,
    firstRowVisible: found.firstRow.bottom <= found.navTop,
  };
  rows.push(record);
  console.log(JSON.stringify(record));
  await page.screenshot({ path: `${out}/team-born-${mc}-${lang}-${theme}-390.png` });
  await context.close();
}
await browser.close();
const bad = rows.filter(
  (row) => !row.firstRowVisible || row.controls.some((c) => c.w < 44 || c.h < 44),
);
if (bad.length) {
  console.error("FAIL", JSON.stringify(bad));
  process.exit(1);
}
