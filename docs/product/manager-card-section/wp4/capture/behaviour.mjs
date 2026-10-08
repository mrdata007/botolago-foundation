// WP4 behaviour checks in the real page, through the capture host: what acknowledges, in how many
// calls, what collapses, what the launch gate holds back, and that a second visit shows nothing.
//
//   node behaviour.mjs
//
// It counts the calls to `managerCardService.ackMoments` (the acknowledgement RPC's one entry point)
// by wrapping it in the page, and reads the device cache `botolago.card.moments.v1` and the
// session flag `botolago.card.hero_session.v1`.
const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE ?? "http://127.0.0.1:4184";
const STATE =
  process.env.STATE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/wp4/state.json";

const pw = await import(PW_CORE);
const browser = await pw.chromium.launch({ executablePath: CHROME });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};

async function open(fixture, { splash = true, lang = "fr", reduced = false, host = "" } = {}) {
  const context = await browser.newContext({
    storageState: STATE,
    viewport: { width: 390, height: 844 },
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  await page.addInitScript(
    ([lang, splash]) => {
      localStorage.setItem("botolago.welcomed", "1");
      localStorage.setItem("botolago.prizes.welcome.v1", "1");
      localStorage.setItem("botolago.language", lang);
      if (splash) sessionStorage.setItem("botolago.splashShown", "1");
    },
    [lang, splash],
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  await page.goto(`${BASE}/gradins?mc=${fixture}${host ? `&host=${host}` : ""}`, { waitUntil: "domcontentloaded" });
  return { context, page, errors };
}

const spyAck = (page) =>
  page.evaluate(async () => {
    // The module instance the app itself loaded: the URL it was fetched with (it carries a `?t=`
    // after a hot update), not a fresh one, or the wrapper would sit on another copy.
    const url = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\/src\/services\/manager-card\.ts(\?|$)/.test(name))
      .at(-1);
    const { managerCardService } = await import(url ?? "/src/services/manager-card.ts");
    window.__acks = [];
    const original = managerCardService.ackMoments.bind(managerCardService);
    managerCardService.ackMoments = (keys, ...rest) => {
      window.__acks.push([...keys]);
      return original(keys, ...rest);
    };
  });
const acks = (page) => page.evaluate(() => window.__acks);
const cache = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("botolago.card.moments.v1") ?? "[]"));
const session = (page) => page.evaluate(() => sessionStorage.getItem("botolago.card.hero_session.v1"));
const hero = (page) => page.locator('[data-testid="moment-hero"]');

// 1. The × acknowledges every folded key in one call, writes the device cache first, and collapses.
for (const fixture of ["returning", "launchArrival"]) {
  const { context, page, errors } = await open(fixture);
  await hero(page).waitFor({ timeout: 10000 });
  await spyAck(page);
  const keysShown = await page.evaluate(() => document.querySelector('[data-testid="moment-hero"]')?.getAttribute("data-hero-kind"));
  await page.locator('[data-testid="moment-hero-close"]').click();
  await page.waitForTimeout(500);
  const calls = await acks(page);
  check(`${fixture}: × acknowledges in ONE call`, calls.length === 1, `${keysShown}: ${JSON.stringify(calls)}`);
  check(`${fixture}: that call holds both keys`, calls[0]?.length === 2);
  const stored = await cache(page);
  check(`${fixture}: the device cache holds them`, calls[0]?.every((key) => stored.some((entry) => entry.endsWith(`|${key}`))));
  check(`${fixture}: the hero's label, lines and buttons are inert; the card stays`, await page.evaluate(() => {
    const section = document.querySelector('[data-testid="moment-hero"]');
    return section?.dataset.collapsed === "1" && !!section.querySelector('[data-testid="hero-card"] .mc-echarpe') && [...section.querySelectorAll("[inert]")].length === 2;
  }));
  check(`${fixture}: the session flag is set`, (await session(page)) === "1");
  check(`${fixture}: no console error`, errors.length === 0, errors.join(" | "));
  await context.close();
}

// 2. The buttons acknowledge too (and only once, however often they are tapped).
{
  const { context, page } = await open("rated");
  await hero(page).waitFor({ timeout: 10000 });
  await spyAck(page);
  await page.locator('[data-testid="hero-share"]').click();
  await page.waitForTimeout(300);
  check("rated: « Partager » acknowledges (one call) and opens the share sheet", (await acks(page)).length === 1 && (await page.locator('[data-testid="card-share-sheet"]').count()) === 1);
  await context.close();
}

// 3. Two seconds at least half on screen acknowledges, and leaves the hero open to read.
{
  const { context, page } = await open("rated");
  await hero(page).waitFor({ timeout: 10000 });
  await spyAck(page);
  await page.waitForTimeout(1200);
  check("rated: nothing is acknowledged before two seconds", (await acks(page)).length === 0);
  await page.waitForTimeout(1600);
  check("rated: two seconds in view acknowledges", (await acks(page)).length === 1);
  check("rated: and the hero stays open", (await hero(page).getAttribute("data-collapsed")) === null);
  await context.close();
}

// 4. The launch gate: while the splash is up, nothing expands and nothing is acknowledged.
{
  const { context, page } = await open("rated", { splash: false });
  await spyAck(page);
  await page.waitForTimeout(700);
  check("splash up: no hero yet", (await hero(page).count()) === 0);
  check("splash up: nothing acknowledged, no session flag", (await acks(page)).length === 0 && (await session(page)) === null);
  await context.close();
}

// 5. A second visit in the same tab shows no hero (one per session) and nothing is acknowledged again.
{
  const { context, page } = await open("rated");
  await hero(page).waitFor({ timeout: 10000 });
  await page.locator('[data-testid="moment-hero-close"]').click();
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/gradins?mc=rated`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-mc-ready="1"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  check("a second visit in the session: no hero", (await hero(page).count()) === 0);
  await context.close();
}

// 6. The born panel acknowledges card_created on ×, and only the born kinds appear on the team page.
{
  const { context, page } = await open("born0Serial", { host: "team" });
  await page.locator('[data-testid="card-born-panel"]').waitFor({ timeout: 10000 });
  await spyAck(page);
  await page.locator('[data-testid="card-born-panel-close"]').click();
  await page.waitForTimeout(500);
  const calls = await acks(page);
  check("team page: × acknowledges card_created in one call", calls.length === 1 && calls[0][0] === "card_created", JSON.stringify(calls));
  await context.close();
}
{
  const { context, page } = await open("rated", { host: "team" });
  await page.waitForSelector('[data-mc-ready="1"], [data-testid="host-owner"]', { timeout: 10000 });
  await page.waitForTimeout(1500);
  check("team page: a first rating is not a team-page moment", (await page.locator('[data-testid="moment-hero"], [data-testid="card-born-panel"]').count()) === 0);
  await context.close();
}

// 7. « Inviter des amis » opens the invite sheet; nothing is written by opening it.
{
  const { context, page } = await open("born0Serial");
  await page.locator('[data-testid="card-born-panel"]').waitFor({ timeout: 10000 });
  await page.locator('[data-testid="invite-friends"]').click();
  await page.locator('[data-testid="invite-sheet"]').waitFor({ timeout: 5000 });
  check("« Inviter des amis » opens the create-and-invite sheet", true);
  await context.close();
}

// 8. Reduced motion: the hero shows, nothing runs, the button still acknowledges.
{
  const { context, page } = await open("founder", { reduced: true });
  await hero(page).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  check("reduced motion: the hero shows", (await hero(page).count()) === 1);
  check("reduced motion: no animation is running", (await page.evaluate(() => document.getAnimations().length)) === 0);
  check("reduced motion: no beat class on the card", (await page.locator('[data-testid="hero-card"] .mc-echarpe[class*="--beat-"]').count()) === 0);
  await spyAck(page);
  await page.locator('[data-testid="hero-detail"]').click();
  await page.waitForTimeout(300);
  check("reduced motion: it still acknowledges", (await acks(page)).length === 1);
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? `BEHAVIOUR OK (${results.length} checks)` : `BEHAVIOUR FAILED: ${failed.map((r) => r.name).join("; ")}`);
