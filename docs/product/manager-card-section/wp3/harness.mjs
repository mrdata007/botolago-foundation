/**
 * Shared by `capture.mjs` and `probe.mjs` (WP3, Gradins screens): a browser against a development
 * server you started yourself, with the mock sign-in seeded in storage so a screen opens as the
 * manager (or as a visitor) without going through the form, and the few states the mock Fantasy
 * data cannot produce on its own (a manager with no team, no private league, a league with only
 * the manager in it) made by changing that mock module as the dev server serves it. Nothing here
 * touches a database: the dev server runs in mock modes.
 *
 *   BASE=http://127.0.0.1:4183   the server (start it with the command in INDEX.md)
 *   PW_CORE=<path to playwright-core's index.mjs>   default: the repo's own `playwright-core`
 *   CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const BASE = process.env.BASE ?? "http://127.0.0.1:4183";
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export async function launch() {
  const entry = process.env.PW_CORE
    ? pathToFileURL(process.env.PW_CORE).href
    : pathToFileURL(createRequire(import.meta.url).resolve("playwright-core")).href;
  const mod = await import(entry);
  const chromium = mod.chromium ?? mod.default?.chromium;
  return chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
}

const USER_ID = "usr_wp3_capture";

/** The mock demo account, signed in, as `auth-mock.ts` stores it. */
function seededUser() {
  return {
    id: USER_ID,
    email: "demo@botolago.ma",
    displayName: "Rachid Demo",
    username: "rachid_demo",
    language: "fr",
    notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
    profileComplete: true,
    createdAt: "2026-09-01T10:00:00.000Z",
    verified: true,
    provider: "email",
    favoriteClubId: "war",
    passwordDigest: "mock:0",
  };
}

/**
 * A browser context: language and theme chosen, past the splash, the language chooser and the prize
 * welcome (as `tests/e2e/support.ts` does), the mock account signed in unless `visitor`, and no
 * team when `noTeam`.
 */
export async function newContext(browser, opts) {
  const {
    lang,
    theme,
    width,
    height,
    scale = 2,
    visitor = false,
    noTeam = false,
    reduced = false,
  } = opts;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: theme,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await context.addInitScript(
    ([lang, theme, user, visitor, noTeam]) => {
      localStorage.setItem("botolago.welcomed", "1");
      localStorage.setItem("botolago.prizes.welcome.v1", "1");
      localStorage.setItem("botolago.language", lang);
      localStorage.setItem("botolago.theme", theme);
      sessionStorage.setItem("botolago.splashShown", "1");
      if (!visitor) {
        localStorage.setItem("botolago.auth.users", JSON.stringify([user]));
        localStorage.setItem(
          "botolago.auth.session",
          JSON.stringify({ kind: "user", userId: user.id, createdAt: user.createdAt }),
        );
      }
      if (noTeam) localStorage.setItem("botolago.fantasy.team", JSON.stringify({ squad: [] }));
    },
    [lang, theme, seededUser(), visitor, noTeam],
  );
  return context;
}

/** What the mock Fantasy data is changed to, by appending to the module as the dev server serves it. */
const MOCK_PATCHES = {
  /** No private league at all. */
  noLeague: `\n;leagues.splice(0, leagues.length, ...leagues.filter((l) => l.type !== "private"));`,
  /** Private leagues with only the manager in them. */
  alone: `\n;for (const k of Object.keys(leagueStandings)) leagueStandings[k] = leagueStandings[k].filter((r) => r.managerId === "me");`,
};

export async function patchMock(page, kind) {
  await page.unroute("**/src/mocks/fantasy-data.ts*").catch(() => {});
  if (!kind) return;
  await page.route("**/src/mocks/fantasy-data.ts*", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: body + MOCK_PATCHES[kind] });
  });
}

/** Opens a path and waits for the page to hydrate in the language and the card to be drawn. */
export async function open(page, path, lang, { settle = 2500 } = {}) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`html[data-lang="${lang}"]`, { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(settle);
}

export function logCollector(page) {
  const logs = [];
  page.on("console", (m) => {
    if (m.type() === "error") logs.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "";
    if (!reason.includes("ERR_ABORTED"))
      logs.push(`requestfailed: ${r.method()} ${r.url().slice(0, 140)} ${reason}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) logs.push(`${r.status()} ${r.url().slice(0, 140)}`);
  });
  return logs;
}
