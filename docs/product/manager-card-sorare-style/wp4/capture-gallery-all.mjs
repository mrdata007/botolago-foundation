/**
 * The gallery of the brief ("every fixture x tier x theme x language at full, 80, 64, 56, 44, 32,
 * 28 and 24 px, captured once"), drawn by the app's own renderer in a real Gradins page of the
 * development server (its fonts, its stylesheet, its renderer chunk), laid out the way
 * `ManagerCard` and `CardToken` insert them (`.mc-card`, `.mc-token`, the same id scoping). No app
 * source is changed and nothing is mounted: the cards are at rest, flat and crisp.
 *
 *   BASE=http://127.0.0.1:4194 node docs/product/manager-card-sorare-style/wp4/capture-gallery-all.mjs \
 *     --out=<dir of PNGs> [--only=<kind>[,<kind>]]
 *
 * Per language (fr, ar) and theme (light, dark), seven sheets:
 *   full-fixtures        every fixture that has a card, and the unnamed guest, at 296 px (1x)
 *   full-tiers           the six tiers (base, LASTREET, STADE, PRO, CHAMPION, LEGEND) on four clubs,
 *                        at 264 px (1x)
 *   tokens-fixtures      every fixture, at its own tier, at 80, 64, 56, 48, 44, 32, 28 and 24 px (2x)
 *   tokens-tiers-<size>  the six tiers on every club of the mock league and on no club, at 80, 64,
 *                        48 and 32 px (2x)
 * Files: `<kind>-<lang>-<theme>.png`; `capture-log-gallery-all.json` records what each drew.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ctxFor, go, launch, watch } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const OUT = flag("out", "");
if (!OUT) throw new Error("--out=<dir> is required");
const ONLY = flag("only", "").split(",").filter(Boolean);
mkdirSync(OUT, { recursive: true });

/** Runs in the page. Builds one sheet and returns what it drew and its box. */
async function build({ lang, theme, kind }) {
  const [{ activeRenderer }, copy, i18n, scope, fixtures, toProfile, data] = await Promise.all([
    import("/src/components/manager-card/active-renderer.ts"),
    import("/src/components/manager-card/copy.ts"),
    import("/src/i18n/dictionaries.ts"),
    import("/src/components/manager-card/scope-ids.ts"),
    import("/src/backend/manager-card/fixtures.ts"),
    import("/src/components/manager-card/to-profile.ts"),
    import("/src/mocks/data.ts"),
  ]);
  const renderer = await activeRenderer.load();
  const dictionary = i18n.dictionaries[lang];
  const strings = copy.cardStrings((key) => dictionary[key], lang);
  const profileOf = (id) => toProfile.fromMyCard(fixtures.fixtureById(id).card);
  const clubs = data.clubs.map((club) => ({
    label: club.shortName?.fr ?? club.slug,
    club: toProfile.cardClubFromClub(club),
  }));
  const TIERS = [
    ["base", null, null, 0],
    ["LASTREET", "homa", 61, 1],
    ["STADE", "stade", 79, 2],
    ["PRO", "pro", 86, 3],
    ["CHAMPION", "champion", 89, 4],
    ["LEGEND", "legend", 94, 5],
  ];
  const stats = { cap: 84, sel: 78, trf: 81, con: 76 };
  const atTier = (profile, [, tier, ovr]) =>
    tier === null
      ? {
          ...profile,
          tier: null,
          ovr: null,
          provisional: false,
          stats: { cap: null, sel: null, trf: null, con: null },
          counted: 1,
          minRated: 3,
        }
      : { ...profile, tier, ovr, provisional: false, stats };

  document.getElementById("gallery-root")?.remove();
  const root = document.createElement("div");
  root.id = "gallery-root";
  root.dir = lang === "ar" ? "rtl" : "ltr";
  root.style.cssText =
    "position:absolute;top:0;left:0;z-index:2147483000;box-sizing:border-box;padding:24px;" +
    "background:var(--ui-page,#fff);color:var(--ui-ink-fg,#111);font:600 13px/1.3 system-ui,sans-serif;";
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
  const caption = (text, size = 12) => {
    const node = document.createElement("div");
    node.textContent = text;
    node.style.cssText = `margin-top:6px;text-align:center;opacity:.7;font-size:${size}px;direction:ltr;`;
    return node;
  };
  const count = { cards: 0, tokens: 0, rows: 0 };
  const grid = (columns, gap) => {
    const g = document.createElement("div");
    g.style.cssText = `display:grid;grid-template-columns:${columns};gap:${gap};align-items:end;justify-items:center;`;
    return g;
  };

  if (kind === "full-fixtures") {
    const width = 296;
    const ids = fixtures.FIXTURE_IDS.filter((id) => fixtures.fixtureById(id).card);
    const g = grid(`repeat(6, ${width}px)`, "28px 24px");
    for (const id of ids) {
      const cell = document.createElement("div");
      cell.append(full(profileOf(id), width), caption(id));
      g.append(cell);
      count.cards += 1;
    }
    const guest = document.createElement("div");
    guest.append(full(toProfile.guestProfile(), width), caption("guest (no name, no number)"));
    g.append(guest);
    count.cards += 1;
    root.append(g);
    root.style.width = `${6 * width + 5 * 24 + 48}px`;
  } else if (kind === "full-tiers") {
    const width = 264;
    const picks = [0, 1, 2, 3]
      .map((i) => clubs[Math.floor((i * clubs.length) / 4)])
      .filter(Boolean);
    const g = grid(`repeat(6, ${width}px)`, "26px 20px");
    const base = profileOf("rated");
    for (const { label, club } of picks)
      for (const t of TIERS) {
        const cell = document.createElement("div");
        cell.append(full(atTier({ ...base, club }, t), width), caption(`${t[0]} · ${label}`));
        g.append(cell);
        count.cards += 1;
      }
    root.append(g);
    root.style.width = `${6 * width + 5 * 20 + 48}px`;
  } else if (kind === "tokens-fixtures") {
    const sizes = [80, 64, 56, 48, 44, 32, 28, 24];
    const g = grid(`150px repeat(${sizes.length}, auto)`, "14px 26px");
    g.style.justifyItems = "center";
    const head = document.createElement("div");
    g.append(head);
    for (const s of sizes) {
      const h = caption(`${s} px`, 11);
      h.style.margin = "0";
      g.append(h);
    }
    const ids = fixtures.FIXTURE_IDS.filter((id) => fixtures.fixtureById(id).card);
    for (const id of [...ids, "guest"]) {
      const name = document.createElement("div");
      name.textContent = id;
      name.style.cssText = "justify-self:start;opacity:.7;direction:ltr;";
      g.append(name);
      const profile = id === "guest" ? toProfile.guestProfile() : profileOf(id);
      for (const s of sizes) {
        const cell = document.createElement("div");
        cell.style.cssText = "display:flex;align-items:flex-end;justify-content:center;";
        cell.append(token(profile, s));
        g.append(cell);
        count.tokens += 1;
      }
      count.rows += 1;
    }
    root.append(g);
    root.style.width = "980px";
  } else if (kind.startsWith("tokens-tiers-")) {
    const size = Number(kind.slice("tokens-tiers-".length));
    const g = grid(`150px repeat(${TIERS.length}, auto)`, "12px 26px");
    g.append(document.createElement("div"));
    for (const t of TIERS) {
      const h = caption(t[0], 11);
      h.style.margin = "0";
      g.append(h);
    }
    const base = profileOf("rated");
    const rows = [...clubs, { label: "no club", club: null }];
    for (const { label, club } of rows) {
      const name = document.createElement("div");
      name.textContent = label;
      name.style.cssText = "justify-self:start;opacity:.7;direction:ltr;";
      g.append(name);
      for (const t of TIERS) {
        const cell = document.createElement("div");
        cell.style.cssText = "display:flex;align-items:flex-end;justify-content:center;";
        cell.append(token(atTier({ ...base, club }, t), size));
        g.append(cell);
        count.tokens += 1;
      }
      count.rows += 1;
    }
    root.append(g);
    root.style.width = "760px";
  } else {
    throw new Error(`unknown sheet ${kind}`);
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

const KINDS = [
  "full-fixtures",
  "full-tiers",
  "tokens-fixtures",
  "tokens-tiers-80",
  "tokens-tiers-64",
  "tokens-tiers-48",
  "tokens-tiers-32",
].filter((k) => ONLY.length === 0 || ONLY.some((o) => k.startsWith(o)));
const browser = await launch();
const log = [];
for (const lang of ["fr", "ar"])
  for (const theme of ["light", "dark"])
    for (const dpr of [1, 2]) {
      const kinds = KINDS.filter((k) => (k.startsWith("full-") ? 1 : 2) === dpr);
      if (!kinds.length) continue;
      const ctx = await ctxFor(browser, {
        lang,
        theme,
        width: 1300,
        height: 900,
        dpr,
        reduced: true,
      });
      const page = await ctx.newPage();
      const problems = watch(page);
      await go(page, "/gradins?mc=forming1", lang);
      await page.waitForTimeout(1200);
      for (const kind of kinds) {
        const probe = await page.evaluate(build, { lang, theme, kind });
        await page.setViewportSize({
          width: Math.max(1300, probe.width + 8),
          height: Math.min(15000, probe.height + 8),
        });
        await page.waitForTimeout(500);
        const name = `${kind}-${lang}-${theme}`;
        const buffer = await page.screenshot({
          clip: { x: 0, y: 0, width: probe.width, height: probe.height },
        });
        writeFileSync(join(OUT, `${name}.png`), buffer);
        log.push({ name, dpr, ...probe, problems: [...problems] });
        console.log(name, JSON.stringify(probe));
      }
      await ctx.close();
    }
await browser.close();
writeFileSync(
  join(OUT, "capture-log-gallery-all.json"),
  `${JSON.stringify({ base: process.env.BASE, pictures: log }, null, 2)}\n`,
);
