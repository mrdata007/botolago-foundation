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
// `--phase=before`: the same screens on the base tree (no card surface), scrolled to what stands where
// the card surface will, so each pair compares like with like.
const PHASE = flag("phase", "after");

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
    before: 'a[href="/fantasy/rules"]',
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
    before: 'a[href="/fantasy/transfers"]@last',
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
    before: 'a[href="/fantasy/transfers"]@last',
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
    id: "hub-owner-born",
    before: 'a[href="/fantasy/transfers"]@last',
    path: "/fantasy",
    auth: "owner",
    mc: "born0",
    scroll: '[data-testid="hub-card-block"]',
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "hub-owner-insufficient",
    before: 'a[href="/fantasy/transfers"]@last',
    path: "/fantasy",
    auth: "owner",
    mc: "insufficient3",
    scroll: '[data-testid="hub-card-block"]',
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "hub-owner-seasonClosed",
    before: 'a[href="/fantasy/transfers"]@last',
    path: "/fantasy",
    auth: "owner",
    mc: "seasonClosed",
    scroll: '[data-testid="hub-card-block"]',
    langs: ["fr"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "hub-pepites-tile",
    before: 'a[href="/fantasy/top-players"]',
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
    before: 'form button[type="submit"]',
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
    before: 'form button[type="submit"]',
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
    id: "first-transfer-line",
    path: "/fantasy/transfers",
    auth: "owner",
    mc: "insufficient3",
    act: "transfer",
    scroll: '[data-testid="first-transfer-line"]',
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "create-name-return",
    path: "/fantasy/create",
    auth: "owner",
    mc: "rated",
    prep: "noTeam",
    act: "return",
    langs: ["fr", "ar"],
    themes: ["light"],
    viewports: [[390, 844]],
  },
  {
    id: "league-band",
    before: "table",
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
          const target = PHASE === "before" ? shot.before : shot.scroll;
          if (target) {
            const last = target.endsWith("@last");
            const found = page.locator(last ? target.slice(0, -"@last".length) : target);
            await (last ? found.last() : found.first())
              .evaluate((node) => node.scrollIntoView({ block: "center" }))
              .catch(() => errors.push(`no ${target}`));
            await page.waitForTimeout(500);
          }
          const name = `${shot.id}-${shot.mc}-${lang}-${theme}-${width}.png`;
          await page.screenshot({ path: join(OUT, name) });
          const record = { name, url: page.url(), errors: errors.slice(0, 4) };
          if (MEASURE) record.measure = await measure(page);
          record.focus = await page.evaluate(() => {
            const active = document.activeElement;
            return active
              ? `${active.tagName.toLowerCase()} ${active.getAttribute("type") ?? ""} ${active.getAttribute("placeholder") ?? active.textContent?.trim().slice(0, 30) ?? ""}`.trim()
              : null;
          });
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

/**
 * M1c, back in the builder: a squad built as a visitor, taken over by the account made since. In
 * mock mode a visitor's draft lives under the device's own key, so the visitor's key is written
 * from it (what the real builder does for a visitor) and the page is loaded again.
 */
async function returnFromSignUp(page) {
  await fillSquadAndGoToName(page);
  // A name typed as a visitor: the save button is then enabled and takes the focus.
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

/** Mark a defender out, take the first affordable same-position player in, then « Suivant »: the confirmation. */
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

async function act(page, name) {
  if (name === "return") await returnFromSignUp(page);
  if (name === "transfer") await makeTransfer(page);
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

/** The surfaces this package draws: what the measures below look at, and nothing else on the page. */
const MINE = [
  "fantasy-intro-card-point",
  "card-save-line",
  "card-builder-return-line",
  "hub-card-block",
  "rank-card-token",
  "recap-card-line",
  "first-transfer-line",
  "fantasy-hub-pepites-tile",
  "league-card-band",
  "league-compare-link",
  "league-row-mini",
  "card-hint-cap",
  "card-hint-sel",
  "card-hint-trf",
  // WP4's panel, in the slot this package gives it: measured for the page it sits in.
  "card-born-panel",
];

/**
 * Element rectangles, never scrollWidth (`html, body { overflow-x: clip }` hides overflow): for
 * each surface of this package and everything inside it, what leaves the viewport, which control
 * is under 44 x 44 (an `aria-hidden` mini is not a control), the animations running, and the
 * contrast of each text read from the rasterised pixels: the text colour is painted on a canvas to
 * get its sRGB value (`oklch` does not parse naively), the backdrop is the modal colour of the
 * element's own screenshot, and the ratio is WCAG's. Large text (24 px, or 18.66 px bold) needs 3,
 * the rest 4.5.
 */
async function measure(page) {
  const found = await page.evaluate((mine) => {
    const viewport = document.documentElement.clientWidth;
    const paint = (color) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a];
    };
    const roots = mine.flatMap((id) => [...document.querySelectorAll(`[data-testid="${id}"]`)]);
    const out = {
      viewport,
      surfaces: roots.map((root) => root.getAttribute("data-testid")),
      offscreen: [],
      smallTargets: [],
      texts: [],
      // Running animations anywhere on the page, and the ones that belong to a surface of this
      // package. A finished page animation (the pitch's one-time rise) is not a running one.
      animations: document.getAnimations().filter((a) => a.playState === "running").length,
      animationsInSurfaces: document
        .getAnimations()
        .filter((a) => roots.some((root) => root.contains(a.effect?.target ?? null))).length,
    };
    const seen = new Set();
    for (const root of roots) {
      for (const node of [root, ...root.querySelectorAll("*")]) {
        if (seen.has(node)) continue;
        seen.add(node);
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > viewport + 1 || rect.left < -1) {
          out.offscreen.push(
            `${node.tagName.toLowerCase()} ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          );
        }
        const interactive = node.matches("a, button") && !node.closest('[aria-hidden="true"]');
        if (interactive && (rect.width < 43.5 || rect.height < 43.5)) {
          out.smallTargets.push(
            `${node.tagName.toLowerCase()} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
          );
        }
        const hasText = [...node.childNodes].some(
          (child) => child.nodeType === 3 && child.textContent.trim(),
        );
        if (
          hasText &&
          !node.closest(".sr-only") &&
          getComputedStyle(node).visibility !== "hidden"
        ) {
          const style = getComputedStyle(node);
          const size = parseFloat(style.fontSize);
          const bold = Number(style.fontWeight) >= 700;
          out.texts.push({
            text: node.textContent.trim().slice(0, 40),
            rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
            fg: paint(style.color),
            large: size >= 24 || (size >= 18.66 && bold),
          });
        }
      }
    }
    return out;
  }, MINE);

  const lum = ([r, g, b]) => {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const contrast = [];
  for (const item of found.texts) {
    const { x, y, width, height } = item.rect;
    if (y + height < 0 || y > (await page.viewportSize()).height || width < 2 || height < 2)
      continue;
    const clip = {
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.min(width, found.viewport - Math.max(0, x)),
      height,
    };
    if (clip.width < 2) continue;
    const shot = await page.screenshot({ clip, animations: "disabled" });
    const backdrop = await page.evaluate(
      async ([b64, fg]) => {
        const image = new Image();
        image.src = `data:image/png;base64,${b64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        // The backdrop is what most of the box is painted with, glyph pixels apart: the pixels
        // that are not the text's own colour (nor its anti-aliasing), grouped by colour, the
        // largest group averaged.
        const buckets = new Map();
        for (let index = 0; index < data.length; index += 4) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          if (Math.abs(r - fg[0]) + Math.abs(g - fg[1]) + Math.abs(b - fg[2]) < 90) continue;
          const key = `${r >> 4},${g >> 4},${b >> 4}`;
          const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
          bucket.count += 1;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
          buckets.set(key, bucket);
        }
        const [top] = [...buckets.values()].sort((a, b) => b.count - a.count);
        return top ? [top.r / top.count, top.g / top.count, top.b / top.count] : fg;
      },
      [shot.toString("base64"), item.fg],
    );
    const value = ratio(item.fg, backdrop);
    contrast.push({
      text: item.text,
      ratio: Math.round(value * 100) / 100,
      needs: item.large ? 3 : 4.5,
      ok: value >= (item.large ? 3 : 4.5),
    });
  }
  return {
    viewport: found.viewport,
    surfaces: found.surfaces,
    offscreen: found.offscreen.slice(0, 10),
    smallTargets: found.smallTargets.slice(0, 10),
    animations: found.animations,
    animationsInSurfaces: found.animationsInSurfaces,
    contrastFailures: contrast.filter((entry) => !entry.ok),
    contrastChecked: contrast.length,
    contrastLowest: contrast.length ? Math.min(...contrast.map((entry) => entry.ratio)) : null,
  };
}

if (import.meta.main) await main();
