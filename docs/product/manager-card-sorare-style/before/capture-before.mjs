/**
 * The BEFORE set of the Manager Card collectible redesign (plan 13, WP0): every surface that draws
 * the card, as the incumbent Écharpe card draws it on `main` (8fae526c), with the section's
 * development preview on and the mock data modes. Nothing here touches a database.
 *
 *   # in a detached checkout of main (never in a tree under change), on its own port:
 *   VITE_FOOTBALL_DATA_MODE=mock VITE_FANTASY_DATA_MODE=mock VITE_AUTH_MODE=mock \
 *   VITE_MANAGER_CARD_DATA_MODE=mock VITE_NEWS_DATA_MODE=mock VITE_NOTIFICATIONS_DATA_MODE=mock \
 *   VITE_PRIZES_DATA_MODE=mock VITE_PREDICTIONS_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock \
 *   VITE_MANAGER_CARD_PREVIEW=1 VITE_PEPITES_PREVIEW=1 \
 *     bun run dev -- --host 127.0.0.1 --port 4190 --strictPort
 *
 *   node docs/product/manager-card-sorare-style/before/capture-before.mjs \
 *        [--base=http://127.0.0.1:4190] [--out=<dir>] [--only=<screen>[,<screen>]] [--jobs=3]
 *        [--match=<regex on the file name>] [--list] [--skip-existing]
 *
 * File names: `<screen>-<fixture>-<lang>-<theme>-<width>.png` (390 wide at 2x, 1440 wide at 1x;
 * `lang` fr | ar, `theme` light | dark). The share picture is the 1080 x 1920 image itself:
 * `picture-<fixture>-<lang>-<theme>-1080.png`. `capture-log.json` records, for every picture, the
 * final URL, console errors, failed requests, and whether a card was drawn and by which renderer.
 *
 * What this reuses: the seeding and the Fantasy scenes of `manager-card-section/wp5/capture.mjs`,
 * the Gradins scenes of `manager-card-section/wp6b/capture.mjs`, and the share-picture extraction
 * of `manager-card-section/wp4/capture/capture.mjs`. Differences from them: one script for every
 * surface, a fixed clock (so a countdown reads the same in the before and the after), a worker pool,
 * the card's "ready" attribute awaited rather than a fixed sleep, and a retry for a shot that fails.
 *
 * The clock is fixed at one instant and motion is reduced, so no countdown differs and nothing is
 * mid-animation. The mock sign-in is the demo account of `src/services/auth-mock.ts`, seeded into
 * storage. START YOUR OWN SERVER ON YOUR OWN PORT: another worktree's server on a shared port
 * measures the wrong tree.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const BASE = flag("base", "http://127.0.0.1:4190");
const OUT = flag("out", here);
const ONLY = flag("only", "").split(",").filter(Boolean);
const JOBS = Number(flag("jobs", "3"));
const SKIP_EXISTING = args.includes("--skip-existing");
const MATCH = flag("match", "") ? new RegExp(flag("match", "")) : null;
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FIXED_TIME = new Date(process.env.CAPTURE_TIME ?? "2026-10-08T20:00:00Z");

const LANGS = ["fr", "ar"];
const THEMES = ["light", "dark"];
const WIDTHS = [390, 1440];
const ALL = { langs: LANGS, themes: THEMES, widths: WIDTHS };
const PHONE_LIGHT = { langs: LANGS, themes: ["light"], widths: [390] };
const PHONE = { langs: LANGS, themes: THEMES, widths: [390] };
const PHONE_FR_LIGHT = { langs: ["fr"], themes: ["light"], widths: [390] };

/** The mock auth's demo account (`src/services/auth-mock.ts`), as wp5 and wp6b seed it. */
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

/**
 * The two other accounts the account path needs (`manager-card-section/wp6/capture.mjs`): a visitor
 * who has just registered (profile not complete) and a finished account, as the mock auth reads them.
 */
const ACCOUNTS = {
  new: {
    id: "usr_wp6_new",
    email: "karim@botolago.test",
    displayName: "Karim",
    username: "karim_k",
    profileComplete: false,
  },
  done: {
    id: "usr_wp6_done",
    email: "karim@botolago.test",
    displayName: "Karim",
    username: "karim_k",
    profileComplete: true,
    favoriteClubId: "war",
  },
};

/* ------------------------------------------------------------------------------------------------
   Acts: what a scene does to the page after it has loaded and the card has been drawn.
   ------------------------------------------------------------------------------------------------ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A hero (first rating, tier, founder, season closed) carries the stage's card; the home state is what is under it. */
async function closeHero(page) {
  const close = page.getByTestId("moment-hero-close");
  if ((await close.count()) > 0) {
    await close.first().click();
    await page.waitForTimeout(1300);
  }
}

async function scrollTo(page, testId, block = "center") {
  await page
    .getByTestId(testId)
    .first()
    .evaluate((node, where) => {
      node.scrollIntoView({ block: where });
      // Under the sticky top bar: leave the block's heading in view.
      if (where === "start") window.scrollBy(0, -88);
    }, block);
  await page.waitForTimeout(500);
}

/** G4: the first row that is not mine opens « Face à face ». */
async function openHeadToHead(page) {
  const row = page.locator('tr:not([data-own]) [data-testid="gradins-people-open"]').first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  await row.click();
  await page.getByTestId("gradins-h2h").waitFor({ timeout: 10000 });
  await page.waitForTimeout(1800);
}

/** G2's « Revoir » list: the replay sheet of one item. */
async function openReplay(page, index = 0) {
  const button = page.getByTestId("gradins-revoir").locator("button").nth(index);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.getByTestId("replay-sheet").waitFor({ timeout: 10000 });
  await page.waitForTimeout(1800);
}

/** The share sheet from G1, with the picture drawn. */
async function openShare(page) {
  await closeHero(page);
  const button = page.locator('[data-testid="gradins-share"]:visible').first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForFunction(
    () => {
      const image = document.querySelector('[data-testid="card-share-image"]');
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    },
    undefined,
    { timeout: 20000 },
  );
  await page.waitForTimeout(800);
}

/** The visitor tries a club's colours on (nothing is stored): the third crest, with the stage above it. */
async function tryOnClub(page) {
  const crests = page.locator('[data-testid="gradins-try-on"] button');
  await crests.nth(2).scrollIntoViewIfNeeded();
  await crests.nth(2).click();
  await page.waitForTimeout(900);
  // Put the stage and the row of crests in one frame: the row's bottom edge at the viewport's bottom.
  await page
    .getByTestId("gradins-try-on")
    .evaluate((node) => node.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(500);
}

/** The builder with 15 players, then « Suivant »: the name step (wp5). */
async function fillSquadAndGoToName(page) {
  for (let filled = 0; filled < 15; filled += 1) {
    const empty = page.getByRole("button", { name: /^(Ajouter un joueur|إضافة لاعب) — /i }).first();
    if ((await empty.count()) === 0) break;
    await empty.click();
    const dialog = page.getByRole("dialog").first();
    const rows = dialog.locator("li button:not([disabled])");
    const total = await rows.count();
    for (let index = total - 1; index >= 0; index -= 1) {
      await rows.nth(index).click();
      const closed = await dialog.waitFor({ state: "hidden", timeout: 1200 }).then(
        () => true,
        () => false,
      );
      if (closed) break;
    }
  }
  await page.getByRole("button", { name: /^(Suivant|التالي)$/ }).click();
  await page.waitForTimeout(800);
}

/** M1c, back in the builder: a squad built as a visitor, taken over by the account made since (wp5). */
async function returnFromSignUp(page) {
  await fillSquadAndGoToName(page);
  await page.locator("form input").first().fill("Atlas Stars");
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const raw = localStorage.getItem("botolago.fantasy.drafts");
    const map = raw ? JSON.parse(raw) : {};
    for (const [flat, entry] of Object.entries(map)) {
      if (entry.key?.uid !== "__local__" || entry.key.kind !== "create-team") continue;
      const key = { ...entry.key, uid: "__guest__" };
      map[`${key.uid}::${key.teamId}::${key.baseVersion}::${key.kind}`] = { ...entry, key };
      delete map[flat];
    }
    localStorage.setItem("botolago.fantasy.drafts", JSON.stringify(map));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(6000);
}

/** Mark a defender out, take the first affordable same-position player in, then « Suivant » (wp5). */
async function makeTransfer(page) {
  await page.locator(`main button[aria-label*=", "]`).nth(2).click();
  await page
    .getByRole("button", { name: /Transférer|نقل/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog").first();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  const rows = dialog.locator("li button:not([disabled])");
  const total = await rows.count();
  for (let index = total - 1; index >= 0; index -= 1) {
    await rows.nth(index).click();
    const closed = await dialog.waitFor({ state: "hidden", timeout: 1200 }).then(
      () => true,
      () => false,
    );
    if (closed) break;
  }
  await page.getByRole("button", { name: /^(Suivant|التالي)$/ }).click();
  await page.waitForTimeout(1200);
}

/** Profile setup, step 1: a name typed (the token beside it). */
async function typeSetupName(page) {
  const field = page.locator("#displayName");
  await field.waitFor();
  await field.fill("Karim");
  await page.waitForTimeout(250);
}

/** Profile setup, step 2: « Suivant », then a club tapped (the token takes its colours). */
async function tapSetupClub(page) {
  await page.locator("#displayName").waitFor();
  await page.getByRole("button", { name: /Suivant|التالي/ }).click();
  const rows = page.locator("button[aria-pressed][data-club]");
  await rows.nth(2).waitFor();
  await rows.nth(2).click();
  await page.waitForTimeout(300);
}

/** The account-deletion dialog, with the card's line in it. */
async function openDeletion(page) {
  await page.getByRole("button", { name: /Supprimer mon compte|حذف حسابي/ }).click();
  await page.waitForSelector("[role=dialog]");
  await page.waitForTimeout(400);
}

const FANTASY_ACTS = {
  return: returnFromSignUp,
  transfer: makeTransfer,
  "hint-cap": async (page) => {
    await page.locator(`main button[aria-label*=", "]`).nth(2).click();
    await page.waitForTimeout(900);
  },
  "hint-sel": async (page) => {
    await page.locator(`main button[aria-label*=", "]`).nth(2).click();
    await page.getByRole("button", { name: /Remplacer|تبديل/ }).click();
    await page.waitForTimeout(900);
  },
};

/* ------------------------------------------------------------------------------------------------
   The scenes. One entry is one picture family: a screen, a fixture, where it is, who is looking, how
   it is reached, and which languages, themes and widths it is taken at.
   ------------------------------------------------------------------------------------------------ */

const SCENES = [];
const scene = (entry) => SCENES.push({ auth: "owner", ...entry });

// G1, the stage and the page under it: after the hero (if any) is dismissed.
for (const fixture of ["rated", "forming1", "founder", "legend", "homa", "clubNull"]) {
  scene({
    screen: "g1",
    fixture,
    path: `/gradins?mc=${fixture}`,
    act: closeHero,
    ...ALL,
  });
}
for (const fixture of ["longNameLatin", "arabicName"]) {
  scene({ screen: "g1", fixture, path: `/gradins?mc=${fixture}`, act: closeHero, ...PHONE });
}
// The signed-out view, and with a club's colours tried on.
scene({ screen: "g1", fixture: "guest", path: "/gradins", auth: "guest", ...ALL });
scene({
  screen: "g1",
  fixture: "guestTryOn",
  path: "/gradins",
  auth: "guest",
  act: tryOnClub,
  ...ALL,
});

// The hero of a moment (M4): the card in the slot, as it arrives.
for (const fixture of ["rated", "founder", "legend"]) {
  scene({ screen: "hero", fixture, path: `/gradins?mc=${fixture}`, ready: "hero", ...ALL });
}
for (const fixture of ["tierUp", "seasonClosed", "returning", "launchArrival"]) {
  scene({
    screen: "hero",
    fixture,
    path: `/gradins?mc=${fixture}`,
    ready: "hero",
    ...PHONE_LIGHT,
  });
}
// The born panel (M2) on G1 and on the team page.
scene({
  screen: "born",
  fixture: "born0Serial",
  path: "/gradins?mc=born0Serial",
  ready: "born",
  ...PHONE_LIGHT,
});
scene({
  screen: "teamBorn",
  fixture: "born0Serial",
  path: "/fantasy/team?mc=born0Serial",
  ready: "born",
  ...PHONE,
});

// G2, « Votre carte »: the page, then the tier ladder and the founder block in frame.
for (const fixture of ["rated", "founder"]) {
  scene({ screen: "g2", fixture, path: `/gradins/carte?mc=${fixture}`, ...ALL });
}
scene({
  screen: "g2Ladder",
  fixture: "rated",
  path: "/gradins/carte?mc=rated",
  act: (page) => scrollTo(page, "gradins-tier-ladder"),
  ...ALL,
});
scene({
  screen: "g2Founder",
  fixture: "founder",
  path: "/gradins/carte?mc=founder",
  act: (page) => scrollTo(page, "gradins-founder"),
  ...ALL,
});
// G3, « Les vôtres » (the league band and its minis, the rows and their tokens) and G4, « Face à face ».
scene({ screen: "g3", fixture: "rated", path: "/gradins/les-votres?mc=rated", ...ALL });
scene({
  screen: "g4",
  fixture: "rated",
  path: "/gradins/les-votres?mc=rated",
  act: openHeadToHead,
  ...ALL,
});
// G6, the seasons (the rack).
scene({ screen: "g6", fixture: "rated", path: "/gradins/saisons?mc=rated", ...ALL });
scene({
  screen: "g6",
  fixture: "seasonClosed",
  path: "/gradins/saisons?mc=seasonClosed",
  ...PHONE_LIGHT,
});
scene({
  screen: "g6",
  fixture: "returning",
  path: "/gradins/saisons?mc=returning",
  ...PHONE_LIGHT,
});
// G1 lower down: the people, the club's mates and the seasons, where tokens and minis hang.
for (const [screen, testId] of [
  ["g1People", "gradins-people"],
  ["g1Club", "gradins-club"],
  ["g1Seasons", "gradins-seasons"],
]) {
  scene({
    screen,
    fixture: "rated",
    path: "/gradins?mc=rated",
    act: async (page) => {
      await closeHero(page);
      await scrollTo(page, testId, "start");
    },
    ...PHONE,
  });
}
// The signed-out page's four points (24 px minis).
scene({
  screen: "g1GuestPoints",
  fixture: "guest",
  path: "/gradins",
  auth: "guest",
  act: (page) => scrollTo(page, "gradins-guest-points", "start"),
  ...PHONE,
});
// The account path (wp6): profile setup beside the card's token, and the deletion dialog's line.
scene({
  screen: "setup-name",
  fixture: "rated",
  path: "/auth/profile-setup?next=/fantasy/create&mc=rated",
  auth: "new",
  act: typeSetupName,
  ...ALL,
});
scene({
  screen: "setup-club",
  fixture: "rated",
  path: "/auth/profile-setup?next=/fantasy/create&mc=rated",
  auth: "new",
  act: tapSetupClub,
  ...ALL,
});
scene({
  screen: "profile-delete",
  noReady: true,
  fixture: "rated",
  path: "/profile?mc=rated",
  auth: "done",
  act: openDeletion,
  ...PHONE,
});

// The replay sheet and the share sheet.
scene({
  screen: "replay",
  fixture: "returning",
  path: "/gradins/carte?mc=returning",
  act: (page) => openReplay(page, 0),
  ...ALL,
});
scene({
  screen: "replay",
  fixture: "founder",
  path: "/gradins/carte?mc=founder",
  act: (page) => openReplay(page, 0),
  ...PHONE_LIGHT,
});
scene({ screen: "share", fixture: "rated", path: "/gradins?mc=rated", act: openShare, ...ALL });
for (const fixture of ["founder", "legend"]) {
  scene({
    screen: "share",
    fixture,
    path: `/gradins?mc=${fixture}`,
    act: openShare,
    ...PHONE_LIGHT,
  });
}
// The share picture itself, 1080 x 1920: not a screenshot, the image the sheet draws. A card with no
// number has no share sheet (the page offers the invitation instead), so no picture of `forming1`.
for (const fixture of [
  "rated",
  "founder",
  "legend",
  "homa",
  "clubNull",
  "longNameLatin",
  "arabicName",
]) {
  scene({
    screen: "picture",
    fixture,
    path: `/gradins?mc=${fixture}`,
    act: openShare,
    picture: true,
    langs: LANGS,
    themes: ["light"],
    widths: [1080],
    viewport: { width: 390, height: 844, scale: 2 },
  });
}
// One dark picture, to show the picture does not depend on the theme.
scene({
  screen: "picture",
  fixture: "rated",
  path: "/gradins?mc=rated",
  act: openShare,
  picture: true,
  langs: ["fr"],
  themes: ["dark"],
  widths: [1080],
  viewport: { width: 390, height: 844, scale: 2 },
});

// Fantasy, inline (wp5): the hub block, the guest intro point, the save line, the rankings row's
// token, the league band, the hints, and the first-transfer line.
const fantasy = (entry) => scene({ screen: entry.id, ...entry, auth: entry.auth ?? "owner" });
fantasy({
  id: "hub-guest-intro",
  fixture: "rated",
  path: "/fantasy?mc=rated",
  auth: "guest",
  scroll: "fantasy-intro-card-point",
  ...ALL,
});
for (const fixture of ["forming1", "rated"]) {
  fantasy({
    id: "hub-owner",
    fixture,
    path: `/fantasy?mc=${fixture}`,
    scroll: "hub-card-block",
    ...ALL,
  });
}
for (const fixture of ["born0", "insufficient3"]) {
  fantasy({
    id: "hub-owner",
    fixture,
    path: `/fantasy?mc=${fixture}`,
    scroll: "hub-card-block",
    ...PHONE_LIGHT,
  });
}
fantasy({
  id: "hub-owner",
  fixture: "seasonClosed",
  path: "/fantasy?mc=seasonClosed",
  scroll: "hub-card-block",
  ...PHONE_FR_LIGHT,
});
for (const fixture of ["homa", "legend"]) {
  fantasy({
    id: "hub-owner",
    fixture,
    path: `/fantasy?mc=${fixture}`,
    scroll: "hub-card-block",
    ...PHONE_FR_LIGHT,
  });
}
fantasy({
  id: "create-name-guest",
  noReady: true,
  fixture: "rated",
  path: "/fantasy/create?mc=rated",
  auth: "guest",
  prep: "noTeam",
  step: "name",
  scroll: "card-save-line",
  ...PHONE_LIGHT,
});
fantasy({
  id: "create-name-signedin",
  noReady: true,
  fixture: "rated",
  path: "/fantasy/create?mc=rated",
  auth: "noTeam",
  prep: "noTeam",
  step: "name",
  scroll: "card-save-line",
  ...PHONE_LIGHT,
});
fantasy({
  id: "create-name-return",
  noReady: true,
  fixture: "rated",
  path: "/fantasy/create?mc=rated",
  prep: "noTeam",
  fantasyAct: "return",
  ...PHONE_LIGHT,
});
fantasy({
  id: "team-born",
  fixture: "born0",
  path: "/fantasy/team?mc=born0",
  ready: "born",
  ...PHONE_LIGHT,
});
fantasy({
  id: "rankings-token",
  fixture: "rated",
  path: "/fantasy/rankings?mc=rated",
  ...ALL,
});
fantasy({
  id: "rankings-token",
  fixture: "forming1",
  path: "/fantasy/rankings?mc=forming1",
  ...PHONE_LIGHT,
});
fantasy({
  id: "hint-cap",
  noReady: true,
  fixture: "forming1",
  path: "/fantasy/team?mc=forming1",
  fantasyAct: "hint-cap",
  ...PHONE_LIGHT,
});
fantasy({
  id: "hint-sel",
  noReady: true,
  fixture: "forming1",
  path: "/fantasy/team?mc=forming1",
  fantasyAct: "hint-sel",
  ...PHONE_FR_LIGHT,
});
fantasy({
  id: "hint-trf",
  noReady: true,
  fixture: "forming1",
  path: "/fantasy/transfers?mc=forming1",
  ...PHONE_LIGHT,
});
fantasy({
  id: "first-transfer-line",
  noReady: true,
  fixture: "insufficient3",
  path: "/fantasy/transfers?mc=insufficient3",
  fantasyAct: "transfer",
  scroll: "first-transfer-line",
  ...PHONE_LIGHT,
});
fantasy({
  id: "league-band",
  fixture: "rated",
  path: "/fantasy/leagues/lg1?mc=rated",
  ...ALL,
});

/* ------------------------------------------------------------------------------------------------
   The runner.
   ------------------------------------------------------------------------------------------------ */

const VIEWPORT = (width) => ({ width, height: width === 1440 ? 900 : 844 });

function expand() {
  const jobs = [];
  for (const entry of SCENES) {
    if (ONLY.length > 0 && !ONLY.includes(entry.screen)) continue;
    for (const width of entry.widths) {
      for (const lang of entry.langs) {
        for (const theme of entry.themes) {
          jobs.push({
            ...entry,
            lang,
            theme,
            width,
            name: `${entry.screen}-${entry.fixture}-${lang}-${theme}-${width}`,
          });
          if (MATCH && !MATCH.test(jobs[jobs.length - 1].name)) jobs.pop();
        }
      }
    }
  }
  return jobs;
}

async function newContext(browser, job) {
  const viewport = job.viewport ?? { ...VIEWPORT(job.width), scale: job.width === 1440 ? 1 : 2 };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.scale,
    locale: job.lang === "ar" ? "ar" : "fr-FR",
    colorScheme: job.theme,
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ([lang, theme, auth, prep, demo, account]) => {
      localStorage.setItem("botolago.prizes.welcome.v1", "1");
      localStorage.setItem("botolago.welcomed", "1");
      localStorage.setItem("botolago.language", lang);
      localStorage.setItem("botolago.theme", theme);
      sessionStorage.setItem("botolago.splashShown", "1");
      if (account) {
        const user = {
          ...account,
          language: lang,
          notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
          createdAt: "2026-10-01T10:00:00.000Z",
          verified: true,
          provider: "email",
          passwordDigest: "mock:0",
        };
        localStorage.setItem("botolago.auth.users", JSON.stringify([user]));
        localStorage.setItem(
          "botolago.auth.session",
          JSON.stringify({ kind: "user", userId: user.id, createdAt: user.createdAt }),
        );
      } else if (auth !== "guest" && !localStorage.getItem("botolago.auth.session")) {
        localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
        localStorage.setItem(
          "botolago.auth.session",
          JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
        );
      }
      if (prep === "noTeam" || auth === "noTeam") {
        localStorage.setItem("botolago.fantasy.team", JSON.stringify({ squad: [] }));
      }
    },
    [
      job.lang,
      job.theme,
      job.auth,
      job.prep ?? "",
      DEMO_USER(job.lang),
      ACCOUNTS[job.auth] ?? null,
    ],
  );
  return context;
}

/** What the page has drawn, to be recorded with the picture. */
function drawn(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      '[data-mc-ready="1"] [role="img"], [role="img"][class*="mc-"]',
    );
    const cards = document.querySelectorAll('[role="img"][class*="mc-"]').length;
    const tokens = document.querySelectorAll(".mc-token").length;
    return {
      lang: document.documentElement.getAttribute("data-lang"),
      dir: document.documentElement.getAttribute("dir"),
      cards,
      tokens,
      ready: document.querySelectorAll('[data-mc-ready="1"]').length,
      root: root ? String(root.getAttribute("class")).slice(0, 60) : null,
    };
  });
}

async function shoot(browser, job) {
  const context = await newContext(browser, job);
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`);
  });
  page.on("pageerror", (error) =>
    problems.push(`pageerror: ${String(error.message).slice(0, 200)}`),
  );
  page.on("requestfailed", (request) => {
    if (!(request.failure()?.errorText ?? "").includes("ERR_ABORTED"))
      problems.push(`requestfailed: ${request.url().slice(0, 120)}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      problems.push(`http ${response.status()}: ${response.url().slice(0, 120)}`);
  });
  try {
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto(BASE + job.path, { waitUntil: "load" });
    await page.waitForSelector(`html[data-lang="${job.lang}"]`, { timeout: 20000 });
    // The card is drawn on the client when its renderer chunk arrives: wait for it, then settle.
    const waitFor =
      job.ready === "hero"
        ? '[data-testid="moment-hero"] [data-mc-ready="1"]'
        : job.ready === "born"
          ? '[data-testid="card-born-panel"] [data-mc-ready="1"]'
          : '[data-mc-ready="1"]';
    if (!job.noReady) {
      await page
        .waitForSelector(waitFor, { timeout: 25000 })
        .catch(() => problems.push(`no ${waitFor}`));
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(job.ready ? 2200 : 1600);

    if (job.step === "name") await fillSquadAndGoToName(page);
    if (job.fantasyAct) await FANTASY_ACTS[job.fantasyAct](page);
    if (job.act) await job.act(page);
    if (job.scroll) {
      await scrollTo(page, job.scroll).catch(() => problems.push(`no ${job.scroll}`));
    }

    const file = join(OUT, `${job.name}.png`);
    if (job.picture) {
      const dataUrl = await page.evaluate(async () => {
        const image = document.querySelector('[data-testid="card-share-image"]');
        if (!(image instanceof HTMLImageElement)) return null;
        const blob = await (await fetch(image.src)).blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      });
      if (!dataUrl) throw new Error("no share image");
      writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
    } else {
      await page.screenshot({ path: file });
    }
    const record = {
      name: job.name,
      url: page.url().replace(BASE, ""),
      drawn: await drawn(page),
      problems,
    };
    await context.close();
    return record;
  } catch (error) {
    await context.close();
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { problems });
  }
}

async function main() {
  const jobs = expand();
  if (args.includes("--list")) {
    for (const job of jobs) console.log(job.name);
    console.log(`${jobs.length} pictures`);
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const todo = jobs.filter((job) => !(SKIP_EXISTING && existsSync(join(OUT, `${job.name}.png`))));
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const log = [];
  const failed = [];
  let next = 0;
  async function worker() {
    for (;;) {
      const job = todo[next++];
      if (!job) return;
      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const record = await shoot(browser, job);
          log.push(record);
          console.log(
            `${record.name}${record.problems.length ? `  [${record.problems.length} problem(s): ${record.problems[0]}]` : ""}`,
          );
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.log(`retry ${job.name}: ${String(error.message).split("\n")[0]}`);
        }
      }
      if (lastError) {
        failed.push({ name: job.name, error: String(lastError.message).split("\n")[0] });
        console.log(`FAILED ${job.name}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
  await browser.close();
  // An incremental run (`--only`, `--match`, `--skip-existing`) updates the log instead of replacing it:
  // a picture taken again replaces its entry, and a failure that has since been captured is dropped.
  const logFile = join(OUT, "capture-log.json");
  let merged = log;
  let stillFailed = failed;
  if (existsSync(logFile)) {
    const previous = JSON.parse(readFileSync(logFile, "utf8"));
    const taken = new Set(log.map((record) => record.name));
    merged = [...previous.pictures.filter((record) => !taken.has(record.name)), ...log];
    stillFailed = [
      ...previous.failed.filter(
        (item) => !taken.has(item.name) && !failed.some((f) => f.name === item.name),
      ),
      ...failed,
    ];
  }
  merged.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(
    logFile,
    `${JSON.stringify({ base: BASE, fixedTime: FIXED_TIME.toISOString(), pictures: merged, failed: stillFailed }, null, 2)}\n`,
  );
  console.log(`${log.length} captured, ${failed.length} failed`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
