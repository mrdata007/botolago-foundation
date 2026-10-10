/**
 * "Off means identical", measured for every Fantasy file this package edits (WP5, plan 3.7).
 *
 * Two development servers of the same app, the base tree and this branch, both with the section's
 * build switch OFF (no `VITE_MANAGER_CARD_PREVIEW`), are driven through the same scenarios with the
 * clock fixed; for each scenario the script writes the body's markup (scripts and the dev-only
 * `data-tsd-source` attribute removed, one tag per line), which element has focus, the storage keys
 * written, the same-origin requests made (module paths without their `?t=` stamp) and the console
 * errors, and, as `*.ssr.html`, the server's own markup before any script has run. Run it once per
 * server, then diff the two folders:
 *
 *   node off-compare.mjs --out=/tmp/off-base      # server on 4185 serving the base tree
 *   node off-compare.mjs --out=/tmp/off-branch    # server on 4185 serving this branch
 *   diff -r /tmp/off-base /tmp/off-branch         # empty: nothing changed
 *
 * Scenarios (390 × 844, light; French and Arabic where the text differs): the hub for a visitor
 * and for a manager (and with the prize welcome open), the builder (squad step, name step with the
 * focus it opens with), the team page (plain, captain sheet, substitution bar), transfers (plain,
 * confirmation), rankings, points, a private and a public league page.
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
const OUT = flag("out", "/tmp/off-compare");
const ONLY = flag("only", "").split(",").filter(Boolean);

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

const PLAYER = `main button[aria-label*=", "]`;

const SCENARIOS = [
  { id: "hub-guest", path: "/fantasy", auth: "guest" },
  { id: "hub-owner", path: "/fantasy", auth: "owner" },
  { id: "hub-owner-prize-welcome", path: "/fantasy", auth: "owner", welcome: false },
  { id: "create-squad-guest", path: "/fantasy/create", auth: "guest", empty: true },
  { id: "create-name-guest", path: "/fantasy/create", auth: "guest", empty: true, step: "name" },
  { id: "create-name-signedin", path: "/fantasy/create", auth: "owner", empty: true, step: "name" },
  { id: "team", path: "/fantasy/team", auth: "owner" },
  { id: "team-captain-sheet", path: "/fantasy/team", auth: "owner", act: "sheet" },
  { id: "team-substitution-bar", path: "/fantasy/team", auth: "owner", act: "substitute" },
  { id: "transfers", path: "/fantasy/transfers", auth: "owner" },
  { id: "transfers-confirm", path: "/fantasy/transfers", auth: "owner", act: "transfer" },
  { id: "rankings", path: "/fantasy/rankings", auth: "owner" },
  { id: "points", path: "/fantasy/points", auth: "owner" },
  { id: "league-private", path: "/fantasy/leagues/lg1", auth: "owner" },
  { id: "league-public", path: "/fantasy/leagues/lg3", auth: "owner" },
];

async function main() {
  const pw = await import(PW_CORE);
  const browser = await pw.chromium.launch({ executablePath: CHROME });
  mkdirSync(OUT, { recursive: true });
  // A development server compiles each page the first time it is asked for, and the first load of
  // a session shows the launch splash: ask for every page once, unrecorded.
  const warmup = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const warmPage = await warmup.newPage();
  for (const path of new Set(SCENARIOS.map((scenario) => scenario.path))) {
    await warmPage.goto(`${BASE}${path}`, { waitUntil: "load" }).catch(() => {});
    await warmPage.waitForTimeout(2500);
  }
  await warmup.close();
  for (const scenario of SCENARIOS) {
    if (ONLY.length > 0 && !ONLY.includes(scenario.id)) continue;
    for (const lang of ["fr", "ar"]) {
      // The builder and points pages are about structure, not language: French only.
      if (lang === "ar" && /^(create|points|transfers-confirm|team-substitution)/.test(scenario.id))
        continue;
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await context.clock.setFixedTime(new Date("2026-10-08T12:00:00Z"));
      const page = await context.newPage();
      await page.addInitScript(
        ([lang, scenario, demo]) => {
          if (scenario.welcome !== false) localStorage.setItem("botolago.prizes.welcome.v1", "1");
          localStorage.setItem("botolago.welcomed", "1");
          localStorage.setItem("botolago.language", lang);
          localStorage.setItem("botolago.theme", "light");
          sessionStorage.setItem("botolago.splashShown", "1");
          if (scenario.auth !== "guest") {
            localStorage.setItem("botolago.auth.users", JSON.stringify([demo]));
            localStorage.setItem(
              "botolago.auth.session",
              JSON.stringify({ kind: "user", userId: demo.id, createdAt: demo.createdAt }),
            );
          }
          if (scenario.empty)
            localStorage.setItem("botolago.fantasy.team", JSON.stringify({ squad: [] }));
        },
        [lang, scenario, DEMO(lang)],
      );
      const requests = new Set();
      const errors = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin === new URL(BASE).origin)
          requests.add(`${request.method()} ${url.pathname}`);
      });
      page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text().slice(0, 200));
      });
      // The server's own markup, before any script has run (scripts and the dev-only source
      // attribute removed, one tag per line).
      const served = await context.request.get(`${BASE}${scenario.path}`);
      const ssr = (await served.text())
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/ data-tsd-source="[^"]*"/g, "")
        .replace(/></g, ">\n<");
      writeFileSync(join(OUT, `${scenario.id}-${lang}.ssr.html`), `${ssr}\n`);
      await page
        .goto(`${BASE}${scenario.path}`, { waitUntil: "load" })
        .catch((error) => errors.push(`goto ${error.message}`));
      // Hydrated: the language provider has set `data-lang` on the document.
      await page.waitForSelector(`html[data-lang="${lang}"]`, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(Number(process.env.WAIT ?? 4500));
      try {
        if (scenario.step === "name") await fillSquadAndGoToName(page);
        if (scenario.act === "sheet") await openCaptainSheet(page);
        if (scenario.act === "substitute") await startSubstitution(page);
        if (scenario.act === "transfer") await makeTransfer(page);
      } catch (error) {
        errors.push(`scenario ${String(error).slice(0, 160)}`);
      }
      await page.waitForTimeout(800);
      const snapshot = await page.evaluate(() => {
        const clone = document.body.cloneNode(true);
        for (const node of clone.querySelectorAll("script, noscript")) node.remove();
        for (const node of clone.querySelectorAll("[data-tsd-source]"))
          node.removeAttribute("data-tsd-source");
        const active = document.activeElement;
        return {
          html: clone.innerHTML.replace(/></g, ">\n<"),
          focus: active
            ? `${active.tagName.toLowerCase()} type=${active.getAttribute("type")} aria=${active.getAttribute("aria-label")} placeholder=${active.getAttribute("placeholder")} testid=${active.getAttribute("data-testid")}`
            : null,
          local: Object.keys(localStorage).sort(),
          session: Object.keys(sessionStorage).sort(),
          title: document.title,
          url: location.pathname + location.search,
        };
      });
      const name = `${scenario.id}-${lang}`;
      writeFileSync(join(OUT, `${name}.html`), `${snapshot.html}\n`);
      writeFileSync(
        join(OUT, `${name}.meta.json`),
        `${JSON.stringify({ focus: snapshot.focus, local: snapshot.local, session: snapshot.session, title: snapshot.title, url: snapshot.url, requests: [...requests].sort(), errors }, null, 2)}\n`,
      );
      console.log(name, snapshot.html.length, errors.length ? `errors: ${errors.length}` : "");
      await context.close();
    }
  }
  await browser.close();
}

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

async function openCaptainSheet(page) {
  await page.locator(PLAYER).nth(2).click();
  await page.waitForTimeout(900);
}

async function startSubstitution(page) {
  await page.locator(PLAYER).nth(2).click();
  await page.getByRole("button", { name: /Remplacer|تبديل/ }).click();
  await page.waitForTimeout(900);
}

/** Mark a defender out, take the first affordable same-position player in, then « Suivant »: the confirmation. */
async function makeTransfer(page) {
  await page.locator(PLAYER).nth(2).click();
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

await main();
