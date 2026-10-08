/**
 * WP5 captures (Fantasy inline and the Pépites tile). Every picture of INDEX.md is made by this
 * file, against a development server of this worktree on port 4185:
 *
 *   cd /home/user/mc-wp5 && VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock \
 *     VITE_AUTH_MODE=mock VITE_FANTASY_DATA_MODE=mock VITE_FOOTBALL_DATA_MODE=mock \
 *     VITE_PEPITES_DATA_MODE=mock bun run dev -- --host 127.0.0.1 --port 4185 --strictPort
 *   node docs/product/manager-card-section/wp5/capture.mjs [--only=<id>[,<id>]] [--out=<dir>]
 *        [--base=http://127.0.0.1:4185] [--list] [--measure]
 *
 * The first-launch storage is seeded like tests/e2e/support.ts (welcome, language, theme, splash).
 * A signed-in manager is the mock demo account (`auth.users` / `auth.session` in localStorage);
 * "noTeam" empties the mock Fantasy team (`botolago.fantasy.team`), so the builder opens on the
 * squad and the hub shows the guest intro to a signed-in account. `?mc=<fixture>` picks the card.
 * Names: `<screen>-<fixture>-<fr|ar>-<light|dark>-<390|1440>.png`.
 *
 * Environment: PW_CORE (playwright-core's index.mjs) and CHROME (a Chromium), as in
 * docs/product/manager-card-section/INDEX.md of the orchestrator.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PW_CORE =
  process.env.PW_CORE ??
  "/tmp/claude-0/-home-user-botolago-foundation/09f7cd8f-a9f8-5b6b-ae49-c115e311665e/scratchpad/tools/node_modules/playwright-core/index.mjs";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const BASE = flag("base", "http://127.0.0.1:4185");
const OUT = flag("out", new URL("./", import.meta.url).pathname);
const ONLY = flag("only", "").split(",").filter(Boolean);
const MEASURE = args.includes("--measure");

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
 * One entry per screen. `auth`: guest | owner | noTeam. `mc`: the card fixture. `scroll`: a CSS
 * selector to bring to the middle of the viewport before the picture. `act`: a function run on the
 * page before the picture. `viewports`: [[w, h], ...]; `langs`, `themes`.
 */
export const SHOTS = [
  {
    id: "hub-guest-intro",
    path: "/fantasy",
    auth: "guest",
    mc: "rated",
    scroll: '[data-testid="fantasy-intro-card-point"]',
    langs: ["fr", "ar"],
    themes: ["light", "dark"],
    viewports: [
      [390, 844],
      [1440, 900],
    ],
  },
  {
    id: "hub-owner-forming",
    path: "/fantasy",
    auth: "owner",
    mc: "forming1",
    scroll: '[data-testid="hub-card-block"]',
    langs: ["fr", "ar"],
    themes: ["light", "dark"],
    viewports: [
      [390, 844],
      [1440, 900],
    ],
  },
  {
    id: "hub-owner-rated",
    path: "/fantasy",
    auth: "owner",
    mc: "rated",
    scroll: '[data-testid="hub-card-block"]',
    langs: ["fr", "ar"],
    themes: ["light", "dark"],
    viewports: [
      [390, 844],
      [1440, 900],
    ],
  },
  {
    id: "hub-owner-late",
    path: "/fantasy",
    auth: "owner",
    mc: "forming1",
    scroll: '[data-testid="hub-card-block"]',
    langs: ["fr"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "hub-pepites-tile",
    path: "/fantasy",
    auth: "guest",
    mc: "rated",
    scroll: '[data-testid="fantasy-hub-pepites-tile"]',
    langs: ["fr", "ar"],
    themes: ["light", "dark"],
    viewports: [
      [390, 844],
      [1440, 900],
    ],
  },
  {
    id: "create-name-guest",
    path: "/fantasy/create",
    auth: "guest",
    mc: "rated",
    prep: "noTeam",
    step: "name",
    scroll: '[data-testid="card-save-line"]',
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "create-name-signedin",
    path: "/fantasy/create",
    auth: "noTeam",
    mc: "rated",
    prep: "noTeam",
    step: "name",
    scroll: '[data-testid="card-save-line"]',
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "team-born",
    path: "/fantasy/team",
    auth: "owner",
    mc: "born0",
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "rankings-token",
    path: "/fantasy/rankings",
    auth: "owner",
    mc: "forming1",
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "rankings-token-rated",
    path: "/fantasy/rankings",
    auth: "owner",
    mc: "rated",
    langs: ["fr"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "hint-cap",
    path: "/fantasy/team",
    auth: "owner",
    mc: "forming1",
    act: "hint-cap",
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "hint-sel",
    path: "/fantasy/team",
    auth: "owner",
    mc: "forming1",
    act: "hint-sel",
    langs: ["fr"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "hint-trf",
    path: "/fantasy/transfers",
    auth: "owner",
    mc: "forming1",
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "league-band",
    path: "/fantasy/leagues/lg1",
    auth: "owner",
    mc: "rated",
    langs: ["fr", "ar"],
    themes: ["light", "dark"],
    viewports: [
      [390, 844],
      [1440, 900],
    ],
  },
];

async function main() {
  if (args.includes("--list")) {
    console.log(SHOTS.map((shot) => shot.id).join("\n"));
    return;
  }
  const pw = await import(PW_CORE);
  const browser = await pw.chromium.launch({ executablePath: CHROME });
  mkdirSync(OUT, { recursive: true });
  const log = [];
  for (const shot of SHOTS) {
    if (ONLY.length > 0 && !ONLY.includes(shot.id)) continue;
    for (const [width, height] of shot.viewports) {
      for (const lang of shot.langs) {
        for (const theme of shot.themes) {
          const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: width < 800 ? 2 : 1,
            colorScheme: theme,
            reducedMotion: "reduce",
          });
          const page = await context.newPage();
          await page.addInitScript(
            ([lang, theme, auth, prep, demo]) => {
              localStorage.setItem("botolago.prizes.welcome.v1", "1");
              localStorage.setItem("botolago.welcomed", "1");
              localStorage.setItem("botolago.language", lang);
              localStorage.setItem("botolago.theme", theme);
              sessionStorage.setItem("botolago.splashShown", "1");
              if (auth !== "guest" && !localStorage.getItem("botolago.auth.session")) {
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
            [lang, theme, shot.auth, shot.prep ?? "", DEMO_USER(lang)],
          );
          const errors = [];
          page.on("pageerror", (error) => errors.push(String(error)));
          page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text().slice(0, 200));
          });
          const url = `${BASE}${shot.path}${shot.path.includes("?") ? "&" : "?"}mc=${shot.mc}`;
          await page
            .goto(url, { waitUntil: "load" })
            .catch((error) => errors.push(`goto ${error.message}`));
          await page.waitForTimeout(Number(process.env.WAIT ?? 4500));
          if (shot.step === "name") await fillSquadAndGoToName(page);
          if (shot.act) await act(page, shot.act);
          if (shot.scroll) {
            await page
              .locator(shot.scroll)
              .first()
              .evaluate((node) => node.scrollIntoView({ block: "center" }))
              .catch(() => errors.push(`no ${shot.scroll}`));
            await page.waitForTimeout(500);
          }
          const name = `${shot.id}-${shot.mc}-${lang}-${theme}-${width}.png`;
          await page.screenshot({ path: join(OUT, name) });
          const record = { name, url: page.url(), errors: errors.slice(0, 4) };
          if (MEASURE) record.measure = await measure(page, shot);
          log.push(record);
          console.log(JSON.stringify(record));
          await context.close();
        }
      }
    }
  }
  writeFileSync(join(OUT, "capture-log.json"), `${JSON.stringify(log, null, 2)}\n`);
  await browser.close();
}

/** The builder with 15 players, then « Suivant »: the name step. */
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

async function act(page, name) {
  if (name === "hint-cap") {
    await page.locator(`main button[aria-label*=", "]`).nth(2).click();
    await page.waitForTimeout(900);
  }
  if (name === "hint-sel") {
    await page.locator(`main button[aria-label*=", "]`).nth(2).click();
    await page.getByRole("button", { name: /Remplacer|تبديل/ }).click();
    await page.waitForTimeout(900);
  }
}

/** Element rectangles, never scrollWidth: what escapes the viewport, what is under 44 px. */
async function measure(page, shot) {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const out = { viewport, offscreen: [], smallTargets: [] };
    for (const node of document.querySelectorAll("main *, [data-testid]")) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > viewport + 1 || rect.left < -1) {
        out.offscreen.push(
          `${node.tagName.toLowerCase()}${node.getAttribute("data-testid") ? `[${node.getAttribute("data-testid")}]` : ""} ${Math.round(rect.left)}..${Math.round(rect.right)}`,
        );
      }
    }
    for (const node of document.querySelectorAll("a, button")) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.width < 44 - 0.5 || rect.height < 44 - 0.5) {
        out.smallTargets.push(
          `${node.tagName.toLowerCase()} ${Math.round(rect.width)}x${Math.round(rect.height)} "${(node.getAttribute("aria-label") || node.textContent || "").trim().slice(0, 30)}"`,
        );
      }
    }
    out.offscreen = out.offscreen.slice(0, 10);
    out.smallTargets = out.smallTargets.slice(0, 15);
    return out;
  });
}

if (import.meta.main) await main();
