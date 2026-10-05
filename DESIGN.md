---
name: BotolaGO
description: Moroccan football in French and Arabic (matches, news, Fantasy and Pépites), built for the phone first.
colors:
  floodlight-navy: "oklch(0.32 0.1 258)"
  tunnel-navy: "oklch(0.24 0.09 258)"
  fresh-turf: "oklch(0.88 0.19 152)"
  matchday-sky: "oklch(0.88 0.11 205)"
  terrace-mist: "oklch(0.975 0.004 250)"
  home-shirt-white: "oklch(1 0 0)"
  dugout-grey: "oklch(0.93 0.006 250)"
  chalk-line: "oklch(0.93 0.006 250)"
  goal-line-grey: "oklch(0.64 0.02 258)"
  scoreboard-black: "oklch(0.16 0.03 260)"
  programme-grey: "oklch(0.45 0.02 258)"
  bench-grey: "oklch(0.555 0.02 258)"
  tunnel-scrim: "color-mix(in oklab, oklch(0.16 0.03 260) 45%, transparent)"
  goal-green: "oklch(0.52 0.14 150)"
  relegation-magenta: "oklch(0.55 0.22 355)"
  yellow-card-amber: "oklch(0.82 0.17 80)"
  live-match-red: "oklch(0.62 0.22 27)"
  mown-grass-light: "oklch(0.536 0.129 153)"
  mown-grass-dark: "oklch(0.502 0.122 152)"
  logo-blue: "#0151fc"
  pepites-night: "#070d24"
  pepites-mint: "#5de39b"
  pepites-sky: "#7fd6f0"
  pepites-violet: "#7c6cf0"
typography:
  display:
    fontFamily: "Changa, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 800
    lineHeight: 1.25
  headline:
    fontFamily: "Changa, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.25
  title:
    fontFamily: "Changa, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.25
  screen-title:
    fontFamily: "Changa, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.25
  tab:
    fontFamily: "Changa, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.25
  tab-active:
    fontFamily: "Changa, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.25
  score-hero:
    fontFamily: "Changa, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 800
    lineHeight: 1.1
  score-row:
    fontFamily: "Changa, Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.55
  body-strong:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1.55
  prose:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  secondary:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.55
  meta:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.55
  label:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "0.025em"
  meta-strong:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.55
  meta-heavy:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1.55
  micro:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
  micro-strong:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.4
  micro-heavy:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "0.025em"
  stat-hero:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 900
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontFeature: '"tnum"'
  stat-sm:
    fontFamily: "Manrope, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontFeature: '"tnum"'
  pepites-mono:
    fontFamily: "IBM Plex Mono, Noto Sans Arabic, ui-monospace, monospace"
    fontWeight: 500
rounded:
  tight: "4px"
  control: "6px"
  segment: "8px"
  track: "10px"
  card: "14px"
  sheet: "16px"
  column: "28px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  gutter: "16px"
  tap-min: "44px"
  row-min: "48px"
components:
  button-primary:
    textColor: "{colors.tunnel-navy}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "48px"
    padding: "0 16px"
  button-ink:
    backgroundColor: "{colors.floodlight-navy}"
    textColor: "{colors.home-shirt-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "48px"
    padding: "0 16px"
  button-light:
    backgroundColor: "{colors.home-shirt-white}"
    textColor: "{colors.floodlight-navy}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "48px"
  button-soft:
    backgroundColor: "{colors.dugout-grey}"
    textColor: "{colors.scoreboard-black}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "48px"
  button-ghost:
    textColor: "{colors.floodlight-navy}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "48px"
  button-destructive:
    backgroundColor: "{colors.relegation-magenta}"
    textColor: "{colors.home-shirt-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "48px"
  icon-button-soft:
    backgroundColor: "{colors.dugout-grey}"
    textColor: "{colors.floodlight-navy}"
    rounded: "{rounded.full}"
    size: "44px"
  card:
    backgroundColor: "{colors.home-shirt-white}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.dugout-grey}"
    textColor: "{colors.scoreboard-black}"
    typography: "{typography.meta-strong}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "6px 12px"
  chip-selected:
    backgroundColor: "{colors.floodlight-navy}"
    textColor: "{colors.home-shirt-white}"
    typography: "{typography.meta-strong}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "6px 12px"
  badge-caution:
    backgroundColor: "{colors.yellow-card-amber}"
    textColor: "{colors.tunnel-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  live-pill:
    backgroundColor: "{colors.floodlight-navy}"
    textColor: "{colors.home-shirt-white}"
    typography: "{typography.micro-heavy}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  live-pill-md:
    backgroundColor: "{colors.floodlight-navy}"
    textColor: "{colors.home-shirt-white}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  input:
    backgroundColor: "{colors.home-shirt-white}"
    textColor: "{colors.scoreboard-black}"
    typography: "{typography.body}"
    rounded: "{rounded.track}"
    height: "44px"
    padding: "0 12px"
  tab:
    textColor: "{colors.programme-grey}"
    typography: "{typography.tab}"
    height: "48px"
  tab-active:
    textColor: "{colors.scoreboard-black}"
    typography: "{typography.tab-active}"
    height: "48px"
  segmented-track:
    backgroundColor: "{colors.dugout-grey}"
    rounded: "{rounded.track}"
  segmented-option-active:
    backgroundColor: "{colors.home-shirt-white}"
    textColor: "{colors.floodlight-navy}"
    rounded: "{rounded.segment}"
  segmented-pill-track:
    backgroundColor: "{colors.home-shirt-white}"
    rounded: "{rounded.full}"
  segmented-pill-option-active:
    backgroundColor: "{colors.floodlight-navy}"
    textColor: "{colors.home-shirt-white}"
    rounded: "{rounded.full}"
  top-bar:
    backgroundColor: "{colors.home-shirt-white}"
    textColor: "{colors.scoreboard-black}"
    padding: "0 16px"
  nav-link-active:
    backgroundColor: "{colors.floodlight-navy}"
    textColor: "{colors.home-shirt-white}"
    typography: "{typography.meta-heavy}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 16px"
  bottom-nav-item:
    textColor: "{colors.programme-grey}"
    typography: "{typography.micro-strong}"
    size: "44px"
  bottom-nav-item-active:
    textColor: "{colors.scoreboard-black}"
    typography: "{typography.micro-heavy}"
  bottom-nav-pill:
    textColor: "{colors.tunnel-navy}"
    rounded: "{rounded.full}"
    width: "56px"
    height: "32px"
  scorebox:
    backgroundColor: "{colors.home-shirt-white}"
    textColor: "{colors.tunnel-navy}"
    typography: "{typography.score-hero}"
    rounded: "{rounded.card}"
  sheet:
    backgroundColor: "{colors.home-shirt-white}"
    rounded: "{rounded.sheet}"
---

# Design System: BotolaGO

## Overview

**Creative North Star: "Club colours under floodlights"**

BotolaGO looks like a Moroccan match night seen from the phone in your hand. A deep floodlight navy sets the brand. White surfaces read like the scoreboard and the team sheet. Each club's own colours arrive on the screen as data: in the edge of a match row, the disc of a crest, the two halves of a match header. Heavy Changa display type gives titles, team names and scores the voice of a stadium board. The interface around them stays quiet: one light page, white cards, hairlines and a single soft lift. The mood is bold, calm and local: bold in the type and the club colour, calm in the surfaces and the motion, local because French and Arabic are equal first languages and the clubs are Botola Pro clubs.

This is an operating app first. Supporters check a score, a table, a deadline or a team in a few seconds, on a 390px-wide phone, often outdoors. Density is high where the data is dense (standings, live scores, Fantasy lists), but nothing is smaller than a 44px tap target and nothing relies on colour alone. Arabic is not a translation layer: it has its own body face, taller line boxes, a fully mirrored layout and no letter-spacing. The one stylistic rejection the owner has confirmed is laying out standings as a grid of cards. Standings are real tables.

Motion is short and physical: controls sink 3% under the finger, sheets settle in over 320ms, the active bottom-nav pill slides between tabs, and pages slide in from the reading side. All of it collapses under reduced motion. The detailed timings live in the sidecar and in the components below.

This file describes the system that ships today: Design System V2, look "Option A: Club colours", light theme only. It is a record of the incumbent design for refinement work, not a redesign brief.

**Key Characteristics:**

- Floodlight navy brand, white surfaces on a light grey page, and club colours supplied by data.
- One spring-to-sky action gradient that marks the primary action and "you are here".
- Changa display type at 800 for titles, team names and scores; Manrope (French) and Noto Sans Arabic (Arabic) for everything else.
- Mostly flat: hairline-weight card shadows and one lifted step for the score plate, hero cards and the primary call to action.
- Every pressed control is fully round; cards are 14px; sheets and feature cards 16px.
- A 44px tap floor, 48px rows, and a 16px gutter at every width.
- French and Arabic are equal: logical properties everywhere, Arabic leading instead of Arabic resizing, no Arabic letter-spacing.

### How to read this file

**Status labels.** Unlabelled statements are established: they are in the code and consistently followed, and many are pinned by tests. The labels mark everything else:

- **[Inconsistent]**: the code does more than one thing, or departs from its own rule.
- **[Open decision]**: the owner has not decided. Do not settle it inside a screen change.
- **[Decided]**: the owner has decided and the change is in a draft pull request, not yet on main. Until it merges, the surrounding text still describes what ships.
- **[Unverified]**: inferred from source or quoted from a code comment, not measured or rendered.

**Which source wins.** The code is the authority: `src/styles.css`, `src/components/ui-kit/tokens.ts` and `src/components/ui-kit/primitives.tsx`, held together by the ui-kit contract test (`src/components/ui-kit/ui-kit.contract.test.ts`). This file comes next. [docs/engineering/DESIGN_SYSTEM_V2.md](docs/engineering/DESIGN_SYSTEM_V2.md) stays the detailed technical reference, with the drift noted below. Product context, voice and terminology are in [PRODUCT.md](PRODUCT.md) and are not repeated here.

**Still authoritative in DESIGN_SYSTEM_V2.md:** §1 (rules 1 to 6); §2.1 to §2.2 (they lack the 400 prose step, and §2.1 still lists the meta step for tab labels, which are now Changa 16px); the §2.3 colour tables (the values match the code, except that the scrim is mixed from the text colour rather than the navy fill); §2.3a; §2.4 (it lacks the 672px and 1320px widths given under Layout); §2.5; §4's Frame (it lacks the desktop screen width and the wide header option), Controls, Overlays, Data, Fantasy, Badge and States tables; §5; §6. From §2.6 only the duration values and the reduced-motion clamp still hold; those same passages also say there is no animated route change and ban stagger, which are out of date. From §4 Shell, only the AppShell, PageBackground, ClubCrest, LiveStrip, SectionHeader and States entries still hold. Pépites token values are in [docs/engineering/pepites-v1.1-figma-notes/figma-spec.md](docs/engineering/pepites-v1.1-figma-notes/figma-spec.md) §0, §8 and §9.

**Out of date in DESIGN_SYSTEM_V2.md (do not follow):**

- the dark-mesh paragraph in §2.3 (the language chooser is now an opaque sheet, and the welcome screen is used only by a demo);
- the §2.6 lines banning stagger and saying there is no animated route change (both now ship);
- the §4 TopBar and BottomNav bullets (see Navigation);
- the §2.1a line saying Changa comes from Google Fonts at 600 to 800 (it is self-hosted, variable 200 to 800).

Also out of date: the status lines of `MOTION_PLAN.md` and `MOTION_PLAN_2.md`, `POLISH_PASS_PLAN.md` §3 and its §5 radius table, and code comments that call the admin console "always dark" (it now uses the light look).

**Evidence for this file.**

- **Code.** Read at `42be166` on `main`. Main later moved to `a6fac90`, which only adds the app and home-screen icons; no styling file changed.
- **Screens.** Captured from the public site, botolago.com, on 2026-10-05. That covers 18 signed-out pages at 390×844 and 1440×900, each in French and in Arabic, with reduced motion on.
  - The site was then serving `236afae`. Between that commit and `42be166`, nothing changed in `src/styles.css`, `src/fonts.css`, `src/components/ui-kit/` or `src/components/shell/`.
  - Two newer surfaces were not live and were not rendered: the home "Mes clubs" row and the public Fantasy recap page (`/journee/...`).
  - Signed-in surfaces were not rendered: My team and its pitch, transfers, profile, notifications and admin.
- **Tests.** `bun test src/components/ui-kit/` ran during this pass: 175 pass, 0 fail.
- **Not re-measured.** Contrast ratios and pixel heights quoted from code comments, which are marked [Unverified] where they matter.
- **Not committed.** The screenshots.

### Owner decisions (2026-10-05)

The owner settled the questions this file first recorded as open. Each change is on its own branch with a draft pull request. None is merged yet, so the sections below still describe what ships today, marked **[Decided]** where a decision applies.

- **Dark mode: on, following the phone's setting.** Anyone whose phone is set to dark sees dark at once, and Profile > Apparence offers Clair, Sombre and Système. The same change turns the logo white on dark, puts the toasts on kit colours and fixes the remaining dark-mode defects ([PR #356](https://github.com/mrdata007/botolago-foundation/pull/356)).
- **Pépites: looks like the rest of the app.** Its night bands, energy gradient, mono lines, slant and own palette go, and it is rebuilt on the kit. Its share images are a later step ([PR #357](https://github.com/mrdata007/botolago-foundation/pull/357)).
- **Arabic icons: directional icons mirror.** Chevrons and arrows already do. Sign in, sign out, undo, trend, sort, the question mark and icons that draw lines of text join them. Clocks, refresh, play, checkmarks, search, slashes, swap arrows and share stay as drawn. Six icons that were flipped twice are fixed ([PR #353](https://github.com/mrdata007/botolago-foundation/pull/353)).
- **App screen edges: `viewport-fit=cover`.** In the phone app the site reaches the screen edges, with safe-area padding wherever a bar would otherwise sit under the status bar, the home indicator or a landscape notch ([PR #354](https://github.com/mrdata007/botolago-foundation/pull/354)).
- **Fantasy menu lists: removed.** There is no Fantasy sub-navigation; the hub-and-back pattern stays ([PR #355](https://github.com/mrdata007/botolago-foundation/pull/355)).
- **Brand blue: a recommendation awaiting the owner's confirmation.** Two blues with two jobs: Logo Blue stays the colour of the brand assets and never becomes an interface colour, and Floodlight Navy stays the interface brand. In dark mode the logo uses its all-white files. The evidence is under Colors.

## Colors

A floodlit navy and white base, one spring-to-sky action gradient used with intent, and club colours that come from data rather than from the theme.

### Primary

- **Floodlight Navy**: the brand. As a fill it paints ink buttons, selected chips, the active option of pill-style segmented controls, the active desktop nav link, live and status pills, the notification badge and the banner strip. As a foreground it colours brand text, icons, links ("Tout voir", "Pronostiquer") and the focus ring. The code keeps these two jobs in two tokens that share this value in the light theme: a fill token (`--ui-ink`) and a brand-foreground token (`--ui-ink-fg`).
- **Tunnel Navy**: the deeper navy. It is the text colour on the action gradient and on amber, the digits in the white score plate, the Fantasy plate's figure band, and the base of the dark photo bands (the matches date strip, the landing hero) and of the scrim on photo cards.

### Secondary

- **Fresh Turf** and **Matchday Sky**: always used together, as the action gradient from turf at the top to sky at the bottom. It fills the primary button, the active bottom-nav pill, the Fantasy deadline pill, progress bars, the selected Fantasy player plate and the Fantasy promo card on Home. Mixed 45% each into white, the two make the pastel Fantasy pitch. Fresh Turf is also the text-selection colour.

### Tertiary

- **Club colours** (no fixed value): every club's fill, on-fill text, edge, foreground, tint and band colours are computed per club by the club palette (`src/lib/club-palette.ts`) and reach components only through `clubStyle()` and `clubMatchPalettes()`. They appear as 4px edge bars on match rows and news cards, as crest and player discs, and as the two halves of the match header.
  - When two clubs clash (a perceptual difference under 0.10), the away side switches to its second colour, then to navy, and last to a neutral slate (#5a667d).
  - Production has no club colours yet (BG-0112), so every club renders from the hand-made kits table in `src/lib/kits.ts` (for example Wydad #c8102e, Raja #0a8f3a). **[Unverified]** whether those values match each club's official colours.

### Neutral

- **Terrace Mist**: the page behind every route. Flat, with no per-route wash.
- **Home Shirt White**: cards, bars, sheets and the score plate.
- **Dugout Grey**: recessed surfaces: segmented tracks, table heads, unselected chips, soft buttons, hover and pressed washes, skeletons.
- **Chalk Line**: the 1px hairline between rows and under bars. It is for dividers only. The source rates it about 1.2:1 **[Unverified]**, too faint to mark a control's edge.
- **Goal-Line Grey**: a control boundary that must be seen, such as the outline of the Fantasy player search field. The source states 3:1 or better on white and on the page **[Unverified]**.
- **Scoreboard Black**: default text and icons.
- **Programme Grey**: secondary copy, inactive tabs and nav labels; the most-used text tone in the product.
- **Bench Grey**: placeholders and disabled copy.
- **Tunnel Scrim**: the navy dim behind sheets and modals.

### Status

- **Goal Green**: gains, a won form cell, the Confederation Cup zone bar, positive badges (a 20% tint with green text). It works as text and as a fill.
- **Relegation Magenta**: losses, errors, destructive buttons, a lost form cell, the relegation zone bar, negative badges (an 18% tint).
- **Yellow-Card Amber**: a fill only, because amber text fails contrast (about 1.78:1 per the source **[Unverified]**). Text on it is Tunnel Navy. It marks postponed and delayed matches, a doubtful Fantasy player and the yellow-card glyph.
- **Live-Match Red**: the breathing live dot, the elapsed-minute bar and the red-card glyph. Also a fill only. A separate live text colour exists in the tokens but nothing uses it.
- **Mown Grass Light / Dark**: the real-grass green of the match lineup pitch. The Fantasy pitch uses the pastel gradient turf instead. The Fantasy fixture difficulty scale (FDR 1 to 5, green to deep magenta) is tabulated in DESIGN_SYSTEM_V2 §2.3.
- News carries its own category plates (Latest, Transfers, Analysis, Interviews, For you) and photo gradients, used only inside News. Their values are in `src/styles.css`.

### Sub-brand: Pépites

- **[Decided]** Pépites will look like the rest of the app ([PR #357](https://github.com/mrdata007/botolago-foundation/pull/357)). Until that merges, this is what ships.
- **Pépites Night**, **Pépites Mint**, **Pépites Sky** and **Pépites Violet**: Pépites (جواهر in Arabic), the young-player data section, keeps its own look. It uses night bands with a slanted bottom edge, an "energy" gradient from mint through sky to violet, and IBM Plex Mono meta lines. Its palette also includes a page, an ink, text, muted, hairline and a five-step rating scale, written as hex values from its Figma spec. Only `src/components/pepites/` and the top bar's night tone read them.

### Named Rules

**The Ink Is Paint Rule.** Floodlight Navy as a fill or border uses the fill token. Navy text and icons use the brand-foreground token, never the fill token. The two share a value in the light theme. In dark the foreground token is a light blue, so the split matters as soon as dark mode is on. A contract test enforces this inside the kit only.

**The Earned Gradient Rule.** The spring-to-sky gradient is the action colour: the primary button, the active bottom-nav pill, the deadline pill, progress, a selected Fantasy plate and the Fantasy promo card. Text on it is always Tunnel Navy, and the gradient is never used as a text colour.

**The Data Brings The Colour Rule.** Club colour enters a component only through the club palette functions, never as a hard-coded hex. A component that shows two clubs takes the resolved match palette, so that a clash is already fixed.

### Inconsistencies and open decisions

- **[Inconsistent]** Option A moved selected and ink-filled controls from cyan text to white text. Cyan on navy survives in the banner strip, the notification badge, the Fantasy shirt marker, the admin icon tile and the landing hero (its kicker, second title line and timer icon).
- **[Inconsistent]** The legacy V1 layer is still declared. Two pieces of it still render:
  - The browser focus outline on anything not built on the kit uses the V1 electric blue (oklch(0.62 0.19 256)), not the navy focus ring.
  - The toasts carry V1 frosted-glass classes, but Sonner's own styles override most of them, so they render as Sonner's default white box with 8px corners. The dark-mode pull request moves them onto kit colours ([PR #356](https://github.com/mrdata007/botolago-foundation/pull/356)).
- **[Inconsistent]** Pépites writes its palette as hex values, with about 100 literal white classes, outside the kit tokens.
- **Brand blue: recommended, awaiting the owner's confirmation.** Both colour logo files fill Logo Blue (#0151fc, about oklch(0.524 0.26 263), also a stop in the News gradients), and so do the new app and home-screen icons (`store-assets/app-icon/`, generated by `scripts/brand/make-app-icons.py`). The interface brand is Floodlight Navy.
  - **Recommendation: two blues, two jobs.** Logo Blue stays the colour of the logo, the app and home-screen icons, the favicon, store and marketing art, and the News gradient stop. It never becomes an interface token for text, fills or controls. Floodlight Navy stays the interface brand. In dark mode the logo switches to its all-white files.
  - **Why.** Each blue already passes in its own job: Logo Blue measures 5.86:1 on white, and the navy 12.81:1, which is what lets one token serve as both text and fill. The two read as a bright and a deep member of one family, not as a mistake (a perceptual difference of 26, against the app's clash threshold of 10). Moving the interface to Logo Blue would drop the cyan-on-navy pairs to 4.25:1 and crowd the blue club colours. Recolouring the logo navy would change the owner's mark and leave it at 1.35:1 on the dark surface. Figures are computed from the colour values, not measured on screen.
  - Do not change either blue inside a screen change.
- **[Decided]** Dark mode: on, following the phone's setting ([PR #356](https://github.com/mrdata007/botolago-foundation/pull/356)). On main today:
  - Every themed colour token has a dark value, contract-tested, but dark mode is switched off (`DARK_MODE_ENABLED=false`) until ledger item BG-0084 closes. That item's evidence no longer matches the code.
  - In dark, a selected chip or segment painted with the navy fill barely differs from the grey track (about 1.13:1, computed). The pull request adds a selected-state token with its own dark value.
  - The logo's blue and black parts nearly vanish on the dark surface (2.95:1 and 1.21:1, computed). The pull request swaps in the white logo on dark.
  - The desktop column shadow, which the toasts also use, has no dark version.
- **[Decided]** The product has two different "night" colours today: Tunnel Navy on the landing hero and the date strip, and Pépites Night. Pépites Night goes with the Pépites restyle ([PR #357](https://github.com/mrdata007/botolago-foundation/pull/357)), leaving Tunnel Navy.

## Typography

**Display Font:** Changa (self-hosted variable font, weights 200 to 800, Latin and Arabic), with Manrope as the French fallback and Noto Sans Arabic as the Arabic fallback.
**Body Font:** Manrope (French; Latin only) with Inter and the system sans as fallbacks; Noto Sans Arabic (Arabic) with Segoe UI Arabic and Tahoma.
**Label/Mono Font:** No general-purpose mono. IBM Plex Mono (500 and 600, Latin only) is used for Pépites meta lines only, and Arabic text there falls back to Noto Sans Arabic, never to a monospace.

**Character:** Changa's squared, heavy letters are the stadium board: titles, team names, tab labels and scores. Manrope at a firm 600 body weight keeps dense data legible at small sizes. In Arabic, Changa still carries the display roles and Noto Sans Arabic takes the body. Every font is self-hosted and loads with `swap`.

### Hierarchy

The kit's sizes are fixed pixel steps at every width. Two places scale with the viewport: Pépites sets some sizes with viewport-based clamps, and the landing headline grows 1.4× from 1024px.

- **Display** (Changa 800): the hero headline, such as "JOURNÉE 2" over the stadium band, or a player's surname. A 112px "mega" step exists for the goal takeover's "BUT !" only.
- **Headline** (Changa 800): the hub page title under the top bar (Matches, Actualités, Fantasy, Clubs, Pronostics).
- **Title** (Changa 800): section headings such as "À venir".
- **Team and story steps** (Changa 700): 22, 19 and 17px, for photo story headlines, team names on the hero match card (19px) and on the match header (17px).
- **Screen title** (Changa 800): the centred title in a detail screen's header. It drops to 16px when controls sit on both sides of it.
- **Tab** (Changa 600, 800 when active): tab labels on the match page, the club page and similar.
- **Score** (Changa, never tabular): standalone figures.
  - The steps are hero 52px, 40, 30 and 24, all at 800, and a 20px row step at 700.
  - Line height is 1.1 in both languages.
  - Digits only. Arabic uses Latin digits.
- **Body** (Manrope 600): rows, buttons and supporting copy.
  - Body strong (800) is for button labels and row titles.
  - Secondary is a 14px step and meta a 13px step. Meta is set at 700 on chips and at 800 on small buttons and desktop nav links.
- **Prose** (Manrope 400): long-form reading such as the rules, help answers, legal pages and article bodies. It is the only step at 400.
- **Label** (Manrope 800, uppercase): kickers, eyebrows, column heads and badges. It is letter-spaced in French only.
- **Micro** (Manrope 600): captions. Bottom-nav labels use it at 700 (800 when active), and the small live pill at 800 in uppercase.
- **Stat** (Manrope, tabular figures, -0.01em in French only): figures that are read down a column, such as table cells, totals and summary tiles. The steps are 30 and 22 (900), 17 (800) and 13 (700).

**Arabic line heights.** These are the Arabic values for the steps above. French values are in the frontmatter.

- Flat lines (labels, headings, stats): 1.95.
- Copy: 1.9.
- Prose: 2.
- Display: 1.95.
- Figures: 1.1.
- Arabic body text that sets no step: 1.75.

### Named Rules

**The Leading Not Size Rule.** Arabic gets taller line boxes, never a different font size. The derivation and measurements are in [docs/qa/polish/README.md](docs/qa/polish/README.md).

**The No Arabic Tracking Rule.** Every letter-spacing applies in French only, and a global rule resets letter-spacing to normal in Arabic (BG-0069). Uppercase labels stay uppercase only where the script has case.

**The Two Kinds Of Number Rule.** Figures read down a column use the stat steps (Manrope, tabular). Standalone figures use the score steps (Changa, never tabular). A score is three separate pieces (home, dash, away) in a container that inherits the page direction, never one string inside a single direction-isolated span.

**The 800 Ceiling Rule.** Changa is never set at 900; its heaviest weight is 800.

### Inconsistencies and open decisions

- **[Inconsistent]** Tabular figures are applied to Changa in the match-row scores and the Pronostics stepper, but Changa has no tabular feature, so it does nothing. Match rows also stack the home and away scores in a column, which the rule above assigns to the stat steps.
- **[Inconsistent]** The desktop matchday strip prints a score as one string inside one direction-isolated span, which puts the home score on the wrong side in Arabic. This is inferred from the source: the strip only shows at 1024px and wider, and the Arabic desktop captures did not show a matchday score **[Unverified]**.
- **[Inconsistent]** Pépites uses about 154 literal pixel font sizes and sets its display type with no extra line height, the pattern that clipped glyphs elsewhere (BG-0124). Whether it clips there is **[Unverified]**.
- **[Inconsistent]** Article emphasis and quotes are set in italic with no Arabic exception. Neither Changa nor Noto Sans Arabic has an italic, so Arabic gets a synthesized slant **[Unverified]**.
- **[Inconsistent]** Toasts use V1 text sizing at weight 500, off the ramp.

## Layout

**Model.** A single column built for a 390px phone, which is the design and checking width.

- **Gutter.** 16px on both sides at every width.
- **Reading column.** 672px for content screens. From 768px it also caps the top bar's contents.
- **Phone canvas.** 480px, for screens that stay phone-shaped.
- **Desktop canvas.** 1320px from 1024px, for Home and the match page: three columns with 24px gaps. Home becomes 340px | fluid | 340px, and the match page gains a 340px prediction rail.

**Breakpoints** (Tailwind defaults, no overrides):

- **Below 360px.** The bottom nav and the matches chip rows tighten. When the top bar is narrower than 20rem, the wordmark gives way to the GO mark.
- **640px (sm).** The match header and the date strip become 16px cards, section spacing grows from 20px to 32px, and the standings won, drawn and lost columns return.
- **768px (md).** The bottom nav disappears and its destinations become round links in the top bar. Home moves to two columns. Desktop-width screens widen to 896px. Sign-in screens float as a raised column with 28px corners.
- **1024px (lg).** The 1320px canvas, the matchday strip under the top bar, a search field built into the top bar, three-column Home and the match prediction rail.
- **1440px.** Nothing changes. It is only a test width.

**Rhythm.**

- One 4px spacing scale (frontmatter). Tailwind steps that fall between scale values are also used, notably 20px between sections on a phone (32px from 640px).
- List rows are at least 48px, and every tap target is at least 44px.
- Content starts 16px below the bars (24px from 768px). Its bottom padding is 112px above the bottom nav (48px from 768px), or 32px where there is no nav.

**Frames.** Every route sits in one of two frames.

- **Main frame order.** Flat page, then the top bar (or a screen's own header), the hub title band, the matchday strip (from 1024px), the live strip, the content and the bottom nav.
- **Fantasy inner screens.** On phones they hide the global top bar and show only their own header. From 768px the Fantasy column becomes a raised column with 28px corners.

**Bars.**

- The top bar and the bottom nav never hide on scroll.
- The live strip, a row of live-score pills under the top bar, is the only bar that hides. It hides while scrolling down past the first 80px and returns on any scroll up.
- Safe areas use the device inset with a fallback (12px top, 8px bottom).
- **[Decided]** `viewport-fit=cover` with safe-area fixes ([PR #354](https://github.com/mrdata007/botolago-foundation/pull/354)). On main today the viewport tag lacks it, so in the iOS app the fallbacks always apply.

**French and Arabic.**

- **Language switch.** The server always sends French, left-to-right HTML. The app switches `lang` and `dir` after it loads, and switches to Arabic once the Arabic text bundle has arrived. **[Unverified]** whether a returning Arabic reader sees a French flash on reload.
- **Logical properties only.** Layout uses start, end, inline and block, never left or right. Source-scanning tests enforce this across the kit, the shell, legal pages and the match, club, Home and Fantasy screens. The Arabic captures mirror fully: the back pill sits on the right, the home team and its score sit on the right, and tab rows run right to left.
- **Home team first.** The home team always sits at the inline start, so match rows and score headers mirror without special cases.
- **Icons.** Four icons mirror in Arabic today: the left and right chevrons and arrows. **[Decided]** ([PR #353](https://github.com/mrdata007/botolago-foundation/pull/353)): sign in, sign out, undo, trend, sort, the question mark and icons that draw lines of text will mirror too. Clocks, refresh, play, checkmarks, search, slashes, swap arrows and share stay as drawn.
- **Forced left-to-right.** Codes, formations, emails, URLs and one-time-code fields stay left-to-right. Names and sums use Unicode isolates.
- **Directions in effects.** Gradients use keyword directions. Anything with a physical direction flips in Arabic: the club-stripe angle, page-transition slides and skeleton shimmer through direction variables, and the Pépites energy gradient and night band through their own right-to-left rules.

### Inconsistencies

- **[Inconsistent]** The 672px column is often written as a literal width (`max-w-2xl`) instead of the reading-column token.
- **[Inconsistent]** Two different ways of centring an absolutely placed element are in use.
- **[Inconsistent]** Carousel dot buttons in News and Pronostics are 24×32px, under the 44px floor.
- **[Inconsistent]** Most JavaScript smooth scrolls do not check reduced motion. Only the admin editor checks it, inline; the shared reduced-motion helper in `src/lib/motion.ts` is not used for scrolling.
- **[Inconsistent]** Six icons add a second mirror on top of the global one, so they point the wrong way in Arabic: four Pépites chevrons, the Home deadline-strip chevron and the Prizes chevron. The icons pull request fixes all six ([PR #353](https://github.com/mrdata007/botolago-foundation/pull/353)).
- **[Unverified]** An Arabic article opened from the French interface is an Arabic subtree in a French page. The Arabic font switch is keyed to the page, so the body may fall back to a system Arabic face.

## Elevation & Depth

Mostly flat, with one soft lift. The page is flat. Cards separate from it with a crisp contact edge and a faint ambient shadow, so they read as paper on the page rather than as a border. Exactly one shadow step means "raised": the lifted shadow, a long soft drop under the score plate, hero match cards, photo lead stories and the primary gradient button. Bars stay flat. The top bar has only a hairline. The bottom nav has a one-pixel upward shadow line. Sheets, modals and menus carry the overlay shadow over the navy scrim. Product surfaces are opaque. Background blur appears in three places: the legacy toast classes **[Inconsistent]**, the Save button on news photo cards, and the scrim behind the first-launch language chooser. The "glass" icon buttons on photo bands and club-colour blocks are a plain 16% tint with no blur.

### Shadow Vocabulary

- **Card** (`box-shadow: 0 1px 2px 0 color-mix(in oklab, var(--ui-ink) 10%, transparent), 0 4px 14px -8px color-mix(in oklab, var(--ui-ink) 14%, transparent)`): every white card, the light button, the selected chip, the active segment, the pill-style segmented track, the Fantasy pitch.
- **Raised** (`box-shadow: 0 -1px 0 0 color-mix(in oklab, var(--ui-ink) 8%, transparent)`): the bottom nav's top edge and the hover state of news row cards.
- **Lifted** (`box-shadow: 0 14px 26px -16px color-mix(in oklab, var(--ui-ink-deep) 55%, transparent)`): the one raised step. It goes under the score plate, the hero match card, photo story cards, the inverse crest disc and the primary gradient button.
- **Overlay** (`box-shadow: 0 -8px 24px -8px color-mix(in oklab, var(--ui-ink) 28%, transparent)`): bottom sheets, modals and menus.
- **Column** (`box-shadow: 0 18px 40px -18px rgba(20, 30, 60, 0.22), 0 6px 14px -6px rgba(20, 30, 60, 0.1)`): the raised phone column on desktop (sign-in, Fantasy). It comes from the legacy shadow layer and has no dark version.

### Named Rules

**The One Lift Rule.** Only the lifted shadow means "raised", and it belongs to the score plate, hero cards and the primary call to action. Everything else sits flat or on the card shadow. Do not invent new shadow values.

**The Flat Bars Rule.** The top bar is opaque white with a hairline and no shadow. A shell test pins this.

## Shapes

A soft, rounded geometry with a strict, named radius set:

- **Tight (4px):** form cells, fixture difficulty squares, micro tags and card glyphs.
- **Control (6px):** alerts, skeletons and menu rows.
- **Segment (8px):** the selected segment and the Fantasy plate bands.
- **Track (10px):** segmented-control tracks, inputs, menus and thumbnails.
- **Card (14px):** every card and list group.
- **Sheet (16px):** bottom sheets, modals, photo story cards, the hero match card, the match header from 640px, the date strip from 640px and the Fantasy pitch.
- **Column (28px):** the raised desktop column.

**Fully round is the control shape.** Every button, chip, pill, badge, icon button, desktop nav link, season picker and Pronostics stepper button is a full capsule or circle. The ui-kit contract test pins the card radius and the round controls.

**Discs carry identity.** Every crest and player photo is a circle (usually 28, 32, 40 or 56px; 24px in match rows; player photos also 96px). An inner edge ring keeps a white kit visible on a white card. A player with no photo gets a silhouette shirt in club colour. Fantasy kits are drawn as shirts, set in a grey disc in lists.

**Edges carry club colour.** 4px bars sit on the inline start and end edges: club colours on match rows, a club or category colour on the start edge of news row cards, and zone colours on the start edge of standings rows.

**Bands.** Stadium photo bands under a navy veil appear on the Home matchday hero, the matches date strip and the sign-in header. The date strip runs full-bleed on phones and becomes a 16px panel from 640px. Pépites night bands end in a slanted cut that rises toward the inline end and mirrors in Arabic.

**[Inconsistent]** Some radii fall off the scale: the Pronostics score box (18px), the toasts (their 22px class is overridden by Sonner's 8px default), the search-match highlight (2px) and Pépites' use of the V1 large radius. The legacy V1 radius scale is still declared beside the kit scale.

## Components

The feel is rounded, confident and quiet: full capsules, heavy labels, flat white surfaces, one gradient. The kit lives in `src/components/ui-kit/`. Build from it before writing new classes. DESIGN_SYSTEM_V2 §4 catalogues the full API.

### Buttons

- **Shape:** fully round (9999px). A full-size button spans the width at 48px with 16px side padding. A small button is inline, at least 44px on both axes, with 12px padding and a 13px label at 800.
- **Primary (gradient):** the spring-to-sky gradient with a Tunnel Navy label and the lifted shadow, for the screen's main action.
- **Ink:** Floodlight Navy fill with a white label, for a strong secondary action such as "Réessayer".
- **Light:** white with a navy label and the card shadow.
- **Soft:** a Dugout Grey fill, the quiet everyday button.
- **Outline / Ghost:** navy text on transparent, outline with a current-colour 1px border.
- **Destructive:** Relegation Magenta fill with a white label.
- **On the dark mesh:** a mesh tone gives soft and outline buttons a translucent white tint (ghost stays transparent), with white text and a white focus ring. Only the demo welcome screen uses it today; photo bands use glass icon buttons.
- **Press / Focus:** on press the control sinks to 97% scale and 96% brightness over 120ms. Focus draws a 2px navy ring offset by 2px over the page colour. Disabled gradient buttons fade to 45% and lose their shadow. Disabled ink and destructive buttons turn grey.

### Icon buttons

A 44px circle. **Soft** (Dugout Grey with a navy icon) is the default in bars: search, language ("FR" or "ع"), notifications and profile. **Glass** is a 16% tint of the club's on-colour, for club blocks and photo bands. **Ink** and **Ghost** fill out the set. Icons are 20px.

### Chips, pills and badges

- **Chips** (filters, day pickers): a 44px capsule. Unselected chips are Dugout Grey. Selected chips are Floodlight Navy with white text and the card shadow, marked as pressed or current for screen readers.
- **Pills** (14px at 800): navy, grey or gradient capsules for short facts. The Fantasy deadline is a gradient pill with a clock icon, a label and a countdown such as "1j 13h 59min".
- **Badges** (12px uppercase label): neutral grey, outlined, gradient, and status badges (a green or magenta tint with matching text; caution is solid amber with Tunnel Navy text).
- **Live pill:** a navy capsule with a small breathing Live-Match Red dot and its label. The small size (11px at 800, uppercase) appears on match rows and Pronostics cards; a medium size uses the label step.

### Cards / Containers

- **Corner Style:** 14px (feature and photo cards 16px).
- **Background:** Home Shirt White on Terrace Mist. Empty states sit on a Dugout Grey panel.
- **Shadow Strategy:** the card shadow at rest. Tappable cards rise 1px on hover and dip on press. Hero and photo cards carry the lifted shadow (see Elevation & Depth).
- **Border:** none. The shadow and the page tone separate the card.
- **Internal Padding:** 12, 16 (default) or 20px. List groups set the padding to none and let 48px rows run edge to edge with hairlines between them.

### Inputs / Fields

- **Style:** white, at least 44px tall, 10px corners, 12px side padding, 15px body text and a Bench Grey placeholder.
- **Focus:** the same 2px navy ring as every kit control.
- **Error / Disabled:** an error turns the border Relegation Magenta and links the message to the field.
- **[Inconsistent]** The default field border is the Chalk Line hairline, although the kit's own guidance says a field edge needs Goal-Line Grey. Some screens override it and the default does not.
- **[Inconsistent]** There are three looks for search:
  - the top-bar search: grey, borderless, a 44px capsule;
  - the Fantasy player search: white, a 48px capsule with a Goal-Line Grey border;
  - a plain field: 10px corners and a hairline.

### Tabs and segmented controls

- **Tabs:** a full-width white row with a hairline under it. Labels are Changa 16px; inactive tabs are Programme Grey. The active tab turns Scoreboard Black at 800 with a 4px bar along its bottom edge, navy by default and the club's colour on the match page. Arrow keys follow the reading direction.
- **Segmented:** a Dugout Grey track with 10px corners, where the active option is a white 8px segment with navy text and the card shadow. In the pill variant the track is a white capsule with the card shadow, and the active option is a Floodlight Navy capsule with white text.

### Navigation

- **Top bar:** sticky, opaque white, a hairline under it and no shadow.
  - The wordmark sits at the inline start. It is in Logo Blue, and is replaced by the GO mark when the bar is narrower than 20rem.
  - At the inline end sit round soft icon buttons: search, the notification bell (signed in only; a navy badge showing "n" or "9+" that shakes once when the count rises), the language switch ("FR" / "ع") and profile.
  - From 768px, a centred row of round links appears. The active link is a Floodlight Navy capsule with white text; inactive links are Programme Grey with a grey hover wash.
  - From 1024px on wide screens, search becomes a field inside the bar.
  - Detail screens replace the bar with their own header: a back pill, a centred kicker over the title, and actions.
- **Bottom nav (phones only):** a fixed white bar with a hairline and the raised shadow.
  - Five equal tabs: Accueil, Actualités, Fantasy, Matches and Pépites (الرئيسية, الأخبار, فانتازي, المباريات, جواهر). Matches is also active on Pronostics.
  - One gradient capsule (56×32px) slides behind the active icon over 320ms, and the new icon pops.
  - The active label turns Scoreboard Black at 800. Weight, colour and the current-page marker carry the state, because the pill alone is too faint: about 1.34:1 per the source **[Unverified]**.
  - The bar is about 76px tall in French and 82px in Arabic **[Unverified]**. It holds still during page transitions.
- **Page transitions:** pages slide in from the reading side and cross-fade over 260ms. They are off under reduced motion.
- **Fantasy:** no persistent Fantasy sub-navigation renders. The Fantasy hub leads on through cards, a 2×2 grid of shortcut tiles and icon rows. Inner screens use a header with a "Fantasy" kicker and a back link. Two Fantasy menu lists are defined and tested in the code but render nowhere. **[Decided]** No Fantasy sub-navigation; the unused lists are removed ([PR #355](https://github.com/mrdata007/botolago-foundation/pull/355)).
- **Pépites bar:** the same geometry in night tone. The active link is a white capsule with night text. It has no search and no bell.

### Lists and tables

- **Rows:** 48px minimum with a hairline at the block end. Settings and navigation rows start with a 36px grey icon disc holding an 18px navy icon, and end with a muted chevron that mirrors in Arabic.
- **Tables (standings and other ranked data):** real HTML tables inside a white card.
  - Heads are Dugout Grey in the uppercase label style. Figures are centred in the 13px stat step; points are end-aligned in the 17px stat step.
  - Club cells are 44px links with crest discs.
  - 4px zone bars at the row's start edge are explained in a legend: African Champions League in navy, Confederation Cup in green, relegation in magenta.
  - Form cells are 4px-radius squares with a letter: green for a win (V), grey for a draw (N), magenta for a loss (D).
  - Under 640px, the won, drawn and lost columns fold behind a toggle.
  - The row of your club, or of the club whose page you are on, takes that club's own tint.
- **[Inconsistent]** The standings table builds its own table instead of composing the kit's table pieces.
- **[Inconsistent]** The icon-disc row is hand-built in Profile and the Fantasy hub, with small differences between the copies.

### Overlays

- **Bottom sheet:** slides up over 320ms with a settling ease, and leaves over 180ms.
  - It is white, at most 672px wide and 88% of the viewport tall, with 16px top corners and the overlay shadow.
  - It has a Floodlight Navy title bar with white text, and a 44px round close control labelled "Fermer" / "إغلاق".
- **Modal:** centred, up to 26rem wide, with 16px corners. It zooms in from 95% over 180ms.
- **Menu:** a white dropdown with 10px corners, a hairline border and 48px rows. The selected row shows a navy check. The language menu uses the same rows, each language name tagged with its own language.

### States

- **Loading:** three grey shimmer skeletons with 6px corners. The shimmer sweeps in the reading direction.
- **Empty and error:** calm, filled panels with no alarm. The rendered empty state on Home is a Dugout Grey panel with the glyph in a white disc, a muted line and a navy text link ("Voir les derniers résultats →").
- **Retry:** errors offer an ink "Réessayer".
- **Alerts:** a 14% tint of the status colour with 6px corners and a 20px icon.
- **[Inconsistent]** There are two families of empty and error states: the kit's centred white card, and the shared grey panel shown above, whose error variant uses a magenta tint and border.

### Match row (signature)

- **Layout:** a white card row with a 4px club-colour bar at each end: home at the inline start, away at the inline end.
- **Kickoff column:** the kickoff time in the 20px score step, a live pill, or "Terminé" / "انتهت" in muted micro type at 700.
- **Teams:** two stacked lines, each a 24px crest and the club name. The winner is at 800 in full colour; the loser is at 700 and muted.
- **Scores:** at the end of each team line.
- **Hero variant (Home):** splits the card into the two club colours with a white score plate over the seam.

### Match header (signature)

- **Halves:** the match page opens on a header split into the two clubs' colours. It runs full-bleed on phones and becomes a 16px card with the lifted shadow from 640px.
- **Teams:** each half holds a 56px inverse crest disc, the team name in Changa 17px at 700, and the city.
- **Score plate:** a white plate with 14px corners and the lifted shadow sits in the middle, showing the 52px score, or the kickoff time before the match. A navy status pill ("Terminé", "انتهت") sits under it.
- **Live:** an elapsed-minute bar fills in Live-Match Red.
- **Compact bar:** when the header scrolls away, a compact club-coloured bar cross-fades in over 180ms.

### Story card (signature)

- **Lead and image cards:** a 16px photo card with the lifted shadow and a navy scrim. It carries a Changa headline in white and a club-colour pill ("À la une").
- **Row cards:** white, with a 4px club or category edge at the inline start, an 88×68px thumbnail with 10px corners, a 15px/800 title and a muted meta line.
- **Hover:** titles dim slightly and photos zoom over 320ms (to 103% on photo cards, 105% on row thumbnails).

### Fantasy pitch and player plate (signature)

- **Pitch:** a pastel turf from Fresh Turf to Matchday Sky with white mowing bands and markings. It sits in a 16px card with the card shadow, over a white bench strip.
- **Player plate:** a shirt over a white name band and a Tunnel Navy figure band (points, price, fixture). Selected plates switch the band to the gradient. Doubtful players get an amber band, and players who are out drop to 45% opacity.
- **Motion:** rows rise in with a 40ms stagger.
- **[Unverified]** These signed-in screens were not rendered for this pass.

### Pronostics stepper

- **Controls:** each team gets a minus / number / plus stepper with 44px round grey buttons.
- **Number box:** Changa 30px. It is empty with a dashed Chalk Line border and a "–", and solid with a navy 2px border once set. The number rolls up or down only after a tap.

## Do's and Don'ts

### Do:

- **Do** build from the kit tokens and primitives in `src/components/ui-kit/` before writing a new class, and check DESIGN_SYSTEM_V2 §4 for an existing primitive.
- **Do** use logical properties (start, end, inline, block) for every direction, and keyword directions for gradients.
- **Do** keep every tap target at least 44px and every list row at least 48px.
- **Do** make every button, chip, pill and icon button fully round, cards 14px and sheets 16px.
- **Do** set text on the action gradient and on amber in Tunnel Navy, white on navy, green and magenta fills, and the club's computed on-colour on club fills.
- **Do** bring club colour in only through the club palette, as 4px edges, crest discs or split halves.
- **Do** use the stat steps for figures read down a column and the score steps for standalone scores, with each score as three pieces.
- **Do** set long-form reading in the prose step (15px, 400, line height 1.7, or 2 in Arabic).
- **Do** take every duration and easing from the motion tokens, and let reduced motion turn them off.
- **Do** check every screen in French and Arabic, on a 390px phone and on desktop, before calling it done.
- **Do** give every close and icon-only control a translated label ("Fermer" / "إغلاق").

### Don't:

- **Don't** lay out standings as a grid of cards. Standings are a real table with tabular figures.
- **Don't** colour text or icons with the navy fill token; use the brand-foreground token.
- **Don't** letter-space Arabic, and don't change Arabic font size to compensate for the script. Adjust line height.
- **Don't** set Changa at 900 or give it tabular figures.
- **Don't** use the Chalk Line hairline as the edge of an input or other control; control edges need Goal-Line Grey.
- **Don't** print a score as one string inside a single direction-isolated span.
- **Don't** add colour literals, new shadow values or legacy V1 tokens (frosted glass, the V1 electric blue, V1 shadows and radii) to product screens.
- **Don't** build a screen that only works in light. Dark mode is decided ([PR #356](https://github.com/mrdata007/botolago-foundation/pull/356)); use kit tokens that carry dark values.
- **Don't** change the logo or paint interface elements in Logo Blue. The brand-blue recommendation awaits the owner's confirmation.
- **Don't** add Pépites-only styling (night bands, the energy gradient, mono lines, slant, its own palette). Pépites is moving onto the kit ([PR #357](https://github.com/mrdata007/botolago-foundation/pull/357)).
