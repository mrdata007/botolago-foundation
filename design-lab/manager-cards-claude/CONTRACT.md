# Concept module contract

Every concept is two files, `src/concepts/NN.js` and `src/concepts/NN.css`, loaded by
plain `<script>` / `<link>` tags (no modules, no build step needed to view it). A refined
version is `NN-v2.js` / `NN-v2.css` and registers with `refinedFrom`.

## Registration

```js
(function () {
  const MC = window.MC;
  const c = {
    id: "c03",               // "cNN", refined: "cNN-v2"
    n: 3,                    // concept number
    refinedFrom: undefined,  // "c03" on a refined version
    name: "…", nameAr: "…",  // concept name (English) and Arabic
    category: "safe" | "bold" | "youth" | "wildcard",
    philosophy: "one sentence", philosophyAr: "…",
    idea: ["design explanation paragraphs"],
    belonging: ["why people would care, compare, screenshot"],
    founderMark: ["how FOUNDER 2026 is made precious"],
    small: ["what survives at 44–80px and 24–32px"],
    rtl: ["how Arabic / right-to-left is handled"],
    tiers: { HOMA: "…", STADE: "…", PRO: "…", CHAMPION: "…", LEGEND: "…" },
    legend: ["the LEGEND moment"],
    advantages: ["…"], risks: ["…"],
    gridWidth: 236,          // optional: card width in the collection grid
    detailWidth: 380,        // optional: card width in the detail sheet
    full(p, o) {},           // → HTML string
    token(p, o) {},          // → HTML string
    row(p, o) {},            // → HTML string
    share(p, o) {},          // → HTML string
    mount(el, o) {},         // optional: attach pointer interaction to a rendered full card
  };
  MC.register(c);
})();
```

## Render functions

All return HTML strings. `p` is a frozen profile (`MC.ALI`, `MC.withTier(tier)`, or
`MC.sample(s)`): `p.name.lat / p.name.ar`, `p.ovr`, `p.tier`, `p.country`, `p.season`,
`p.id`, `p.serial`, `p.founder` (2026 or null), `p.stats.{CAP,SEL,TRF,CON}`, `p.club`.
`o.lang` is `"lat"` (default) or `"ar"`. Strings come from `MC.s(o)`; the name from
`MC.nameOf(p, o)`.

- **full(p, o)**: the whole card. It fills the width it is given and scales with it
  (an SVG `viewBox`, or `cqi` units). The gallery and the preview wrap every card in a
  `container-type: inline-size` slot, so `1cqi` is always 1% of the card's width, on the
  root and inside it. It sets its own height (aspect ratio is part of the silhouette). It renders every tier from `p.tier`.
  `o.thumb` is true at ~90px wide (the tier strip): keep the silhouette, drop fine text.
  `o.motion` may enable a signature motion; it must stop under `prefers-reduced-motion`.
- **token(p, o)**: the identity mark alone, for the leaderboard (44–80px) and the mini
  identity (24–32px). `o.size` is the target height in px; `o.mini` is true at ≤32px.
  It must stay recognisable as this concept and show the OVR or the tier where it can.
- **row(p, o)**: the concept's own leaderboard row ("compact card"), up to 358px wide,
  56–72px tall. `o.rank`, `o.pts`, `o.me` are passed.
- **share(p, o)**: a 360×640 story composition (exports at 1080×1920).

## Rules

- Scope every CSS selector under the concept's class (`.c03 …`). No global selectors,
  no `:root` variables, no `@font-face` (faces are already loaded: Changa, Manrope,
  Noto Sans Arabic, Handjet, Big Shoulders Display, Reem Kufi, Lalezar,
  Saira Stencil One, Alexandria).
- Unique SVG ids per render: `MC.uid("c03")`. The same card appears many times per page.
- Arabic: `dir="rtl"` on the root, Arabic text in Changa / Noto Sans Arabic / Reem Kufi /
  Lalezar / Alexandria / Handjet, **no letter-spacing on Arabic**, Western digits kept
  left-to-right (`MC.ltr()` in HTML, `direction="ltr"` + `unicode-bidi` in SVG).
- Shared art only: `MC.avatar()` (same figure everywhere; colours, framing and treatment
  may change), `MC.crest()`, `MC.flag()`, `MC.logo()`. No photos, no external URLs.
- Free to play and independent: nothing that looks like money, betting, a bank card,
  official league status, or a serial that implies scarcity for sale.
- Root element gets `role="img"` and `aria-label="${MC.label(p, o)}"`.

## Onboarding states

Added for the onboarding screens (`ONBOARDING.md`, `ONBOARDING_PLAN.md` section 7). The
fixtures live in `src/onboarding/states.js` (`MC.ONB.FIX`); `states.html?c=07&v=v2` shows every
fixture for one direction. **A profile without these fields (every gallery profile) must render
exactly as before**: each field below is optional, and its absence means "as today".

| Field | Values | What the object does |
|---|---|---|
| `p.ovr` | number or `null` | `null`: the number carrier shows a dash "—", never 0, never blank. |
| `p.tier` | tier or `null` | `null`: the base material with no tier word (decision 4). Never HOMA printed before a rating. |
| `p.counted`, `p.minRated` | integers, e.g. 1 and 3 | While `ovr` is null, draw `counted` of `minRated` marks natively on the object (filled and empty). With a number, marks are optional (a direction may keep them complete or drop them). Absent: no marks. |
| `p.provisional` | boolean | No change to the art. The « Provisoire » chip is app-level, beside the object. |
| `p.serial`, `p.id` | `"482913"`, `"BOT #482913"`, or both `null` | `null`: the ID carrier shows a dash. No sentence, no placeholder. |
| `p.founder` | 2026 or `null` | `null`: no founder part at all, no ghost. |
| `p.club` | club object or `null` | `null`: the object's own material, no disc (lab rule 15). |
| `p.name` | `{lat, ar}` or `null` | `null` (a guest before naming): the name carrier is drawn empty, never "?" or "Nom". |
| `p.stats.X` | number or `null` | `null`: a dash in that stat's place. `p.statReason.X` (optional) holds the server reason code. |
| `o.beat` | `"make"`, `"first"` or absent | One optional motion of 600ms or less ("make": the object makes its belonging parts on birth, ≤700ms; "first": the beat over a visible first number). The number and serial are fully visible in the first painted frame and never animate. Off under `prefers-reduced-motion`. No flip, count-up, cover, blur or confetti. |

`MC.label(p, o)` already speaks these states (« pas encore de note » / «لا تقييم بعد», « 1
journée comptée sur 3 »), so the root keeps `aria-label="${MC.label(p, o)}"`.

`full()` and `token()` support every row above; `row()` supports the dash and shows
« en formation k/N » / «قيد التكوين k/N» (from `MC.onbStr(o)`) in place of the number while
forming. Banned in every state: a padlock, lock, question mark, sealed or wrapped object, frost
or blur over the number (each reads as a loot box or a scratch card). The forming object is the
finished object with an empty carrier, like a new scarf with no rows yet.
