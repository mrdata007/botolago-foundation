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
