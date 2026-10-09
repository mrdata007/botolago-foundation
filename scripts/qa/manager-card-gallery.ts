/**
 * Writes a scratch gallery of the Éclat card as static HTML, to look at it and to measure it:
 *
 *   bun scripts/qa/manager-card-gallery.ts <out-dir> [fonts-css-url]
 *
 * `compare-<theme>.html` draws the cards of the direction mock (`mock.html`, in the collectible
 * design's folder under `docs/product/`) with the same data and the same page, so a picture of each
 * can be set beside the mock's; `all-<theme>.html` draws every fixture of the Manager Card section in both languages, the
 * six tiers, the long names, the face-à-face card at its three widths and the tokens at every size.
 * It needs a server that answers `/eclat.css` (the card's stylesheet) and the app's fonts
 * (`/fonts/…`, `fonts-css-url`, default `/mock-fonts.css`).
 *
 * No tilt is mounted: the cards are at their rest pose, flat and crisp, which is what the mock
 * shows at rest. Nothing here is imported by the app.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FIXTURE_IDS, FIXTURES } from "../../src/backend/manager-card/fixtures";
import { dictionaries, type TranslationKey } from "../../src/i18n/dictionaries";

import { cardStrings, type Translate } from "../../src/components/manager-card/copy";
import { fromMyCard, guestProfile } from "../../src/components/manager-card/to-profile";
import type {
  CardProfile,
  CardStrings,
  CardTheme,
  TokenSize,
} from "../../src/components/manager-card/types";
import { cardImage, founderDetail, fullCard } from "../../src/components/manager-card/eclat/full";
import { tierWord } from "../../src/components/manager-card/eclat/foil";
import { esc, makeView } from "../../src/components/manager-card/eclat/view";
import { tokenMarkup } from "../../src/components/manager-card/eclat/token";
import {
  MOCK_ARABIC,
  MOCK_CARDS,
  MOCK_NAMES,
  MOCK_TOKENS,
  type MockCard,
} from "../../src/components/manager-card/eclat/test-data";
import { AR, FR } from "../../src/components/manager-card/eclat/test-data";

const out = process.argv[2];
if (!out) throw new Error("usage: gallery.ts <out-dir> [fonts-css-url]");
const fonts = process.argv[3] ?? "/mock-fonts.css";
mkdirSync(out, { recursive: true });

const tFor =
  (lang: "fr" | "ar"): Translate =>
  (key: TranslationKey) =>
    (dictionaries[lang] as Record<string, string>)[key] ?? key;
/** The app's own words for the fixtures; the mock's for the mock's cards (the same but for LASTREET). */
const APP = { fr: cardStrings(tFor("fr"), "fr"), ar: cardStrings(tFor("ar"), "ar") };
const MOCK: Record<"fr" | "ar", CardStrings> = { fr: FR, ar: AR };

const css = `
:root{--page:#f4f6f9;--ink:#111827;--muted:#4f5b70}
:root[data-theme="dark"]{--page:#0b1020;--ink:#e7ecf3;--muted:#a3aec0}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:15px/1.5 Manrope,system-ui,sans-serif}
h1{font:800 22px/1.2 Changa,sans-serif;margin:0;padding:24px 16px 8px;max-width:1240px;margin-inline:auto}
h2{font:800 17px/1.3 Changa,sans-serif;max-width:1240px;margin:28px auto 0;padding:0 16px}
.row{max-width:1240px;margin:0 auto;padding:24px 16px;display:flex;flex-wrap:wrap;gap:36px 28px;justify-content:center;align-items:flex-end}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:14px}
figcaption{font-size:13px;color:var(--muted);text-align:center}
.stage{width:min(296px,calc(100vw - 32px));padding:6px 0 18px}
.stage--s{width:min(240px,calc(100vw - 32px))}
.stage--m{width:264px}
.stage--g4{width:min(var(--g4w),calc(50vw - 24px));padding:0}
.g4pair{display:flex;flex-direction:column;align-items:center;gap:10px}
.g4pair__cards{display:flex;gap:12px;align-items:flex-end}
.grid{display:grid;grid-template-columns:auto repeat(5,auto);gap:14px 22px;align-items:end;justify-items:center}
.grid .h,.grid .t{font-size:12px;color:var(--muted)}
.grid .t{justify-self:end;align-self:center}
.art{width:353px;position:relative}
.art svg{display:block;width:100%;height:auto}
.detail{width:22rem}
`;

/**
 * The mock's page, without its card: its own page styles and its header, so the cards sit at the
 * same offsets on both pages and a picture of each can be set beside the other pixel for pixel.
 */
function mockChrome(): { css: string; top: string } {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  // the mock sits in a `manager-card-…` folder of docs/product, named for the design's direction
  const product = join(root, "docs/product");
  const folder = readdirSync(product).find(
    (d) => d.startsWith("manager-card-") && existsSync(join(product, d, "mock.html")),
  );
  if (!folder) throw new Error("the direction mock was not found under docs/product");
  const html = readFileSync(join(product, folder, "mock.html"), "utf8");
  const css = html.slice(
    html.indexOf("<style>") + "<style>".length,
    html.indexOf("/* ---------- the card (eclat.css, abridged)"),
  );
  const top = html.slice(html.indexOf("<header>"), html.indexOf('<div class="row" id="full">'));
  return { css, top };
}

const page = (title: string, theme: CardTheme, body: string): string =>
  `<!doctype html><html lang="fr" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="${fonts}"><link rel="stylesheet" href="/eclat.css"><style>${css}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;

const dirOf = (lang: "fr" | "ar"): "ltr" | "rtl" => (lang === "ar" ? "rtl" : "ltr");
const stage = (html: string, cls = "", dir: "ltr" | "rtl" = "ltr"): string =>
  `<div class="stage ${cls}"${dir === "rtl" ? ' dir="rtl" lang="ar"' : ""}>${html}</div>`;
const fig = (inner: string, caption: string): string =>
  `<figure>${inner}<figcaption>${esc(caption)}</figcaption></figure>`;

const mockRow = (cards: readonly MockCard[], theme: CardTheme, cls = ""): string =>
  cards
    .map((c) =>
      fig(
        stage(
          fullCard(c.profile, { strings: MOCK[c.lang], theme }),
          cls,
          c.lang === "ar" && cls ? "rtl" : "ltr",
        ),
        c.caption,
      ),
    )
    .join("");

const TOKEN_SIZES: TokenSize[] = [80, 64, 56, 44, 32, 28, 24];
/** The mock's own sizes (48 is the owner's check size, not one the app draws). */
const MOCK_SIZES = [80, 64, 48, 32, 24] as unknown as TokenSize[];
const tokensGrid = (
  profiles: readonly CardProfile[],
  theme: CardTheme,
  lang: "fr" | "ar",
  sizes: readonly TokenSize[] = TOKEN_SIZES,
) => {
  const head = sizes.map((s) => `<span class="h">${s} px</span>`).join("");
  const rows = profiles
    .map(
      (p) =>
        `<span class="t">${p.tier ? tierWord(p.tier, MOCK.fr) : "base"} ${p.ovr ?? "—"}</span>` +
        sizes.map((s) => tokenMarkup(makeView(p, MOCK[lang]), s, theme)).join(""),
    )
    .join("");
  return `<div class="grid" style="grid-template-columns:auto repeat(${sizes.length},auto)"${lang === "ar" ? ' dir="rtl"' : ""}><span></span>${head}${rows}</div>`;
};

for (const theme of ["light", "dark"] as const) {
  /* the mock's own page: the same cards, the same widths */
  const arabic = MOCK_ARABIC.map((c) =>
    fig(stage(fullCard(c.profile, { strings: MOCK.ar, theme }), "", "rtl"), c.caption),
  ).join("");
  const names = MOCK_NAMES.map((c) =>
    fig(
      stage(fullCard(c.profile, { strings: MOCK[c.lang], theme }), "stage--s", dirOf(c.lang)),
      c.caption,
    ),
  ).join("");
  const g4 = [
    [200, "200 px", [MOCK_CARDS[3]!, MOCK_CARDS[5]!], "fr"],
    [160, "160 px", [MOCK_CARDS[3]!, MOCK_CARDS[5]!], "fr"],
    [160, "160 px, arabe", [MOCK_ARABIC[0]!, MOCK_ARABIC[2]!], "ar"],
    [136, "136 px (écran de 320 px)", [MOCK_CARDS[0]!, MOCK_CARDS[4]!], "fr"],
  ] as const;
  const g4html = g4
    .map(
      ([w, cap, pair, lang]) =>
        `<figure class="g4pair" data-g4w="${w}"><div class="g4pair__cards"${lang === "ar" ? ' dir="rtl" lang="ar"' : ""}>${pair
          .map(
            (c) =>
              `<div class="stage stage--g4" style="--g4w:${w}px">${fullCard(c.profile, { strings: MOCK[lang], theme, compact: true })}</div>`,
          )
          .join("")}</div><figcaption>${cap}</figcaption></figure>`,
    )
    .join("");
  const tokens = tokensGrid(MOCK_TOKENS, theme, "fr", MOCK_SIZES);
  const chrome = mockChrome();
  writeFileSync(
    join(out, `compare-${theme}.html`),
    `<!doctype html><html lang="fr" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Éclat · the mock's cards</title><link rel="stylesheet" href="${fonts}"><link rel="stylesheet" href="/eclat.css"><style>${chrome.css}</style></head><body>${chrome.top}` +
      `<div class="row" id="full">${mockRow(MOCK_CARDS, theme)}</div>` +
      `<h2>Interface arabe</h2><div class="row" id="arabic" dir="rtl" lang="ar">${arabic}</div>` +
      `<h2>Noms longs</h2><div class="row" id="names">${names}</div>` +
      `<h2>Face-à-face (G4) · 200 · 160 · 136 px</h2><div class="row" id="g4">${g4html}</div>` +
      `<h2>Petites tailles · 80 · 64 · 48 · 32 · 24 px</h2><div class="row" id="tokens">${tokens}</div></body></html>`,
  );

  /* every fixture, in both languages */
  const fixtureCards: [string, CardProfile][] = [];
  for (const id of FIXTURE_IDS) {
    const card = FIXTURES[id].card;
    if (card) fixtureCards.push([id, fromMyCard(card, { sample: true })]);
  }
  fixtureCards.push(["guest", guestProfile()]);
  const fx = (lang: "fr" | "ar") =>
    fixtureCards
      .map(([id, p]) =>
        fig(
          stage(fullCard(p, { strings: APP[lang], theme }), "stage--m", dirOf(lang)),
          `${id} · ${lang}`,
        ),
      )
      .join("");
  const tierCards = MOCK_CARDS.map((c) => c.profile);
  const tiers = (lang: "fr" | "ar") =>
    tierCards
      .map((p) =>
        fig(
          stage(fullCard(p, { strings: MOCK[lang], theme }), "", dirOf(lang)),
          `${p.tier ?? "base"} · ${lang}`,
        ),
      )
      .join("");
  // the founder's crop and the share picture's art, in both languages
  const founder = (lang: "fr" | "ar") =>
    fig(
      `<div class="detail"${lang === "ar" ? ' dir="rtl"' : ""}>${founderDetail(MOCK_CARDS[5]!.profile, { strings: MOCK[lang], theme }) ?? ""}</div>`,
      `detail(founder) · ${lang}`,
    );
  const share = (lang: "fr" | "ar") => {
    const art = cardImage(MOCK_CARDS[5]!.profile, MOCK[lang]);
    const runs = art.texts
      .map(
        (t) =>
          `<text x="${t.x}" y="${t.y}" font-size="${t.size}" fill="${t.colour}" text-anchor="middle" direction="${t.dir}" style="font-family:${t.face === "serif" ? '"Instrument Serif"' : t.face === "body" ? "Manrope" : t.face === "arabic" ? '"Noto Sans Arabic"' : "Changa"};font-weight:${t.weight};${t.tracking ? `letter-spacing:${t.tracking}px;` : ""}"${t.rotate ? ` transform="rotate(${t.rotate} ${t.x} ${t.y})"` : ""}>${esc(t.text)}</text>`,
      )
      .join("");
    // the runs are in image pixels, the art in card units
    const svg = art.svg.replace(
      "</svg>",
      `<g transform="scale(${1000 / art.width})">${runs}</g></svg>`,
    );
    return fig(
      `<div class="art">${svg.replace(/width="\d+" height="\d+"/, 'width="100%"')}</div>`,
      `image() art + runs · ${lang} (${art.texts.length} runs)`,
    );
  };
  writeFileSync(
    join(out, `all-${theme}.html`),
    page(
      "Éclat · every fixture, tier and size",
      theme,
      `<h2>Les six marches · français</h2><div class="row">${tiers("fr")}</div>` +
        `<h2>Les six marches · arabe</h2><div class="row" dir="rtl" lang="ar">${tiers("ar")}</div>` +
        `<h2>Fixtures · français</h2><div class="row">${fx("fr")}</div>` +
        `<h2>Fixtures · arabe</h2><div class="row" dir="rtl" lang="ar">${fx("ar")}</div>` +
        `<h2>Détail du fondateur et image de partage</h2><div class="row">${founder("fr")}${founder("ar")}${share("fr")}${share("ar")}</div>` +
        `<h2>Jetons · français</h2><div class="row">${tokensGrid(MOCK_TOKENS, theme, "fr")}</div>` +
        `<h2>Jetons · arabe</h2><div class="row">${tokensGrid(MOCK_TOKENS, theme, "ar")}</div>`,
    ),
  );
}
console.log("wrote", out);
