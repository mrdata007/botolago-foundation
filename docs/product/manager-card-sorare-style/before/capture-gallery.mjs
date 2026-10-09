/**
 * The incumbent card (Écharpe v2) at every size, every tier and the edge states, on one page each:
 * the before counterpart of the after set's gallery (brief: "a gallery of every fixture x tier x
 * theme x language at full, 80, 64, 56, 44, 32, 28 and 24 px").
 *
 * There is no gallery route in the app. This script opens a real Gradins page of the dev server (so
 * the fonts, the stylesheet and the renderer chunk are the app's own), imports the app's own modules
 * in the page (`active-renderer`, `copy.cardStrings`, `scope-ids`, the fixtures and `to-profile`) and
 * lays out what `ManagerCard` and `CardToken` would insert for each profile, with the same wrappers
 * (`.mc-card`, `.mc-token`) and the same unique-id scoping. No app source is changed.
 *
 *   node docs/product/manager-card-sorare-style/before/capture-gallery.mjs \
 *        [--base=http://127.0.0.1:4190] [--out=<dir>]
 *
 * Files (language fr | ar, theme light | dark):
 *   gallery-full-tiers-<lang>-<theme>-1700.png    six tiers, the full card at 264 px (1x)
 *   gallery-full-states-<lang>-<theme>-1700.png   forming, founder, long Latin name, Arabic name,
 *                                                 no club, the unnamed guest (1x)
 *   gallery-tokens-<lang>-<theme>-1000.png        eight profiles x 80, 64, 56, 44, 32, 28, 24 px (2x)
 */
import { mkdirSync, writeFileSync } from "node:fs";
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
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FIXED_TIME = new Date(process.env.CAPTURE_TIME ?? "2026-10-08T20:00:00Z");

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

/** Runs in the page. Builds the gallery DOM for one language and theme and returns what it drew. */
async function build({ lang, theme, kind }) {
  const [{ activeRenderer }, copy, i18n, scope, fixtures, toProfile] = await Promise.all([
    import("/src/components/manager-card/active-renderer.ts"),
    import("/src/components/manager-card/copy.ts"),
    import("/src/i18n/dictionaries.ts"),
    import("/src/components/manager-card/scope-ids.ts"),
    import("/src/backend/manager-card/fixtures.ts"),
    import("/src/components/manager-card/to-profile.ts"),
  ]);
  const renderer = await activeRenderer.load();
  const dictionary = i18n.dictionaries[lang];
  const strings = copy.cardStrings((key) => dictionary[key], lang);
  const of = (id) => toProfile.fromMyCard(fixtures.fixtureById(id).card);
  const rated = of("rated");
  const withTier = (tier, ovr, stats) => ({ ...rated, tier, ovr, stats, provisional: false });
  const tiers = [
    ["base", of("forming1")],
    ["homa", of("homa")],
    ["stade", withTier("stade", 78, { cap: 82, sel: 76, trf: 80, con: 74 })],
    ["pro", rated],
    ["champion", withTier("champion", 90, { cap: 93, sel: 88, trf: 91, con: 86 })],
    ["legend", of("legend")],
  ];
  const states = [
    ["forming", of("forming1")],
    ["founder", of("founder")],
    ["longNameLatin", of("longNameLatin")],
    ["arabicName", of("arabicName")],
    ["clubNull", of("clubNull")],
    ["guest", toProfile.guestProfile()],
  ];

  document.getElementById("gallery-root")?.remove();
  const root = document.createElement("div");
  root.id = "gallery-root";
  root.style.cssText =
    "position:absolute;top:0;left:0;z-index:2147483000;box-sizing:border-box;padding:24px;" +
    "background:var(--ui-page,#fff);color:var(--ui-ink-fg,#111);direction:ltr;" +
    "font:600 13px/1.3 system-ui,sans-serif;";
  const full = (profile, width) => {
    const html = scope.scopeSvgIds(renderer.full(profile, { strings, theme }), scope.newIdScope());
    const cell = document.createElement("div");
    cell.className = "mc-card";
    cell.style.cssText = `width:${width}px;max-width:100%`;
    cell.innerHTML = `<div>${html}</div>`;
    return cell;
  };
  const token = (profile, size) => {
    const html = scope.scopeSvgIds(
      renderer.token(profile, { strings, theme, size }),
      scope.newIdScope(),
    );
    const box = renderer.tokenBox(profile, size);
    const cell = document.createElement("span");
    cell.className = "mc-token inline-block shrink-0 align-middle";
    cell.style.cssText = `width:${box.width}px;height:${box.height}px`;
    cell.innerHTML = `<span class="block">${html}</span>`;
    return cell;
  };
  const caption = (text) => {
    const node = document.createElement("div");
    node.textContent = text;
    node.style.cssText = "margin-top:8px;text-align:center;opacity:.7;";
    return node;
  };
  const rowOf = (items, make) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:16px;align-items:flex-start;margin-bottom:16px;";
    for (const [label, profile] of items) {
      const cell = document.createElement("div");
      cell.append(make(profile), caption(label));
      row.append(cell);
    }
    return row;
  };
  const count = { cards: 0, tokens: 0 };
  if (kind === "tiers" || kind === "states") {
    root.style.width = "1700px";
    root.append(rowOf(kind === "tiers" ? tiers : states, (profile) => full(profile, 264)));
    count.cards = kind === "tiers" ? tiers.length : states.length;
  } else {
    root.style.width = "1000px";
    const sizes = [80, 64, 56, 44, 32, 28, 24];
    const rows = [...tiers, ["founder", of("founder")], ["clubNull", of("clubNull")]];
    for (const [label, profile] of rows) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;gap:28px;align-items:flex-end;padding:12px 0;border-bottom:1px solid var(--ui-rule,#ddd);";
      const name = document.createElement("div");
      name.textContent = label;
      name.style.cssText = "width:96px;opacity:.7;align-self:center;";
      row.append(name);
      for (const size of sizes) {
        const cell = document.createElement("div");
        cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;";
        cell.append(token(profile, size));
        const label2 = document.createElement("div");
        label2.textContent = String(size);
        label2.style.cssText = "font-size:11px;opacity:.55;";
        cell.append(label2);
        row.append(cell);
        count.tokens += 1;
      }
      root.append(row);
    }
  }
  document.body.append(root);
  await document.fonts.ready;
  const box = root.getBoundingClientRect();
  return {
    ...count,
    renderer: renderer.id,
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
  };
}

const browser = await chromium.launch({ executablePath: CHROMIUM });
mkdirSync(OUT, { recursive: true });
const log = [];
for (const lang of ["fr", "ar"]) {
  for (const theme of ["light", "dark"]) {
    for (const kind of ["tiers", "states", "tokens"]) {
      const context = await browser.newContext({
        viewport: { width: kind === "tokens" ? 1000 : 1700, height: 900 },
        deviceScaleFactor: kind === "tokens" ? 2 : 1,
        locale: lang === "ar" ? "ar" : "fr-FR",
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        ([lang, theme, demo]) => {
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
        [lang, theme, DEMO(lang)],
      );
      const page = await context.newPage();
      const problems = [];
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(message.text().slice(0, 200));
      });
      page.on("pageerror", (error) =>
        problems.push(`pageerror: ${String(error.message).slice(0, 200)}`),
      );
      await page.clock.setFixedTime(FIXED_TIME);
      await page.goto(`${BASE}/gradins?mc=forming1`, { waitUntil: "load" });
      await page.waitForSelector(`html[data-lang="${lang}"]`, { timeout: 20000 });
      await page.waitForSelector('[data-mc-ready="1"]', { timeout: 25000 });
      await page.waitForTimeout(1200);
      const drawn = await page.evaluate(build, { lang, theme, kind });
      await page.setViewportSize({
        width: kind === "tokens" ? 1000 : 1700,
        height: Math.max(300, drawn.height + 8),
      });
      await page.waitForTimeout(600);
      const name = `gallery-${kind === "tokens" ? "tokens" : `full-${kind}`}-${lang}-${theme}-${kind === "tokens" ? 1000 : 1700}`;
      await page.screenshot({
        path: join(OUT, `${name}.png`),
        clip: { x: 0, y: 0, width: drawn.width + 0, height: drawn.height },
      });
      log.push({ name, ...drawn, problems });
      console.log(name, JSON.stringify(drawn), problems.length ? problems[0] : "");
      await context.close();
    }
  }
}
await browser.close();
writeFileSync(
  join(OUT, "capture-log-gallery.json"),
  `${JSON.stringify({ base: BASE, pictures: log }, null, 2)}\n`,
);
