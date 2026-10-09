/**
 * M2: how much of the team page's first screen the born panel takes, and whether the pitch's first
 * row (the goalkeeper) is still visible under it. Measured from element rectangles at 390 x 844,
 * in French and Arabic, with the panel (`?mc=born0`) and without it (`?mc=forming1`, no panel).
 *
 *   node docs/product/manager-card-section/wp5/m2-panel-measure.mjs [--base=http://127.0.0.1:4185]
 *
 * It prints one JSON line per case and the same table as markdown. The bottom navigation covers
 * the last pixels of the viewport, so a row counts as visible when it ends above the navigation's
 * top edge.
 */
const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const base =
  process.argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length) ??
  "http://127.0.0.1:4185";

const DEMO_USER = (lang) => ({
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
for (const lang of ["fr", "ar"]) {
  for (const mc of ["forming1", "born0"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.addInitScript(
      ([lang, demo]) => {
        localStorage.setItem("botolago.prizes.welcome.v1", "1");
        localStorage.setItem("botolago.welcomed", "1");
        localStorage.setItem("botolago.language", lang);
        localStorage.setItem("botolago.theme", "light");
        sessionStorage.setItem("botolago.splashShown", "1");
        localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
        localStorage.setItem(
          "botolago.auth.session",
          JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
        );
      },
      [lang, DEMO_USER(lang)],
    );
    await page.goto(`${base}/fantasy/team?mc=${mc}`, { waitUntil: "load" });
    await page.waitForTimeout(Number(process.env.WAIT ?? 6000));
    const found = await page.evaluate(() => {
      const rect = (node) => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          height: Math.round(r.height),
        };
      };
      const panel = document.querySelector('[data-testid="card-born-panel"]');
      const pitch = document.querySelector('[class*="--ui-pitch-bench"]');
      const firstCard = pitch?.querySelector("button, a, [role='button']") ?? null;
      const nav = [...document.querySelectorAll("nav")]
        .map((node) => ({ node, r: node.getBoundingClientRect() }))
        .filter(({ r }) => r.bottom >= window.innerHeight - 1 && r.height > 40)
        .map(({ r }) => Math.round(r.top))[0];
      return {
        viewport: window.innerHeight,
        navTop: nav ?? null,
        panel: rect(panel),
        pitch: rect(pitch),
        firstRowCard: rect(firstCard),
      };
    });
    const visibleLimit = found.navTop ?? found.viewport;
    const card = found.firstRowCard;
    const record = {
      lang,
      mc,
      ...found,
      firstRowVisible: card ? card.bottom <= visibleLimit : null,
      firstRowShortBy: card ? Math.max(0, card.bottom - visibleLimit) : null,
    };
    rows.push(record);
    console.log(JSON.stringify(record));
    await context.close();
  }
}
await browser.close();

console.log("\n| language | card | panel height | first row ends at | visible limit | short by |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const row of rows) {
  console.log(
    `| ${row.lang} | ${row.mc === "born0" ? "born (panel)" : "forming (no panel)"} | ${row.panel ? `${row.panel.height}px` : "none"} | ${row.firstRowCard ? `${row.firstRowCard.bottom}px` : "?"} | ${row.navTop ?? row.viewport}px | ${row.firstRowShortBy === null ? "?" : `${row.firstRowShortBy}px`} |`,
  );
}
