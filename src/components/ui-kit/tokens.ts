/**
 * BotolaGO UI Kit — token manifest and class tokens.
 *
 * `UI_TOKENS` mirrors the `--ui-*` custom properties declared in
 * `src/styles.css`. It is the list `ui-kit.contract.test.ts` pins against the
 * stylesheet, so a token added on one side and forgotten on the other fails a
 * test rather than rendering as `unset`.
 *
 * `ui` is the class-token map. It exists so a page can adopt the design
 * language without importing a component — `className={ui.text.body}` is the
 * supported way to write "Fantasy body text" anywhere in the product.
 *
 * Rules that hold everywhere in this folder, all enforced by the contract
 * test:
 *
 *   1. Logical properties only. No `ml-/mr-/pl-/pr-`, no `left-/right-`,
 *      no `text-left/text-right`, no `border-l/border-r`. Arabic is a
 *      first-class language here, not a mirror mode bolted on later.
 *   2. Never letter-space Arabic. Arabic letterforms join; spacing them
 *      apart in either direction breaks the word. Any `tracking-*` must be
 *      `ltr:`-prefixed so it applies to Latin only. This is the open defect
 *      BG-0069 and it must not be reproduced in new code.
 *   3. `--ui-ink` is a fill/border colour, never a foreground. Text and
 *      icons in the brand colour use `--ui-ink-fg` (`ui.tone.ink`), which
 *      is theme-correct; `--ui-ink` is a dark navy in BOTH themes and
 *      measured 1.25:1 as a foreground on dark (BG-0083).
 */

/** Every `--ui-*` custom property the kit relies on. */
export const UI_TOKENS = [
  // type ramp
  "--ui-text-hero",
  "--ui-text-title",
  "--ui-text-section",
  "--ui-text-subtitle",
  "--ui-text-body",
  "--ui-text-secondary",
  "--ui-text-meta",
  "--ui-text-label",
  "--ui-text-micro",
  // the display face (Option A: Changa) and its two ramps, plus the body
  // face as a token, for a glyph inside display text Changa does not have
  "--ui-font-display",
  "--ui-font-body",
  "--ui-display-mega",
  "--ui-display-hero",
  "--ui-display-section",
  "--ui-score-hero",
  "--ui-score-lg",
  "--ui-score-md",
  "--ui-score-sm",
  "--ui-score-row",
  // leading (BG-0124) — redeclared under :lang(ar)/[dir="rtl"], because the
  // Arabic face needs a taller line box than the Latin one at the same px.
  "--ui-leading-flat",
  "--ui-leading-copy",
  "--ui-leading-prose",
  "--ui-leading-display",
  "--ui-leading-figure",
  // stat ramp (numerals)
  "--ui-stat-hero",
  "--ui-stat-lg",
  "--ui-stat-md",
  "--ui-stat-sm",
  "--ui-stat-tracking",
  // weights
  "--ui-weight-normal",
  "--ui-weight-body",
  "--ui-weight-strong",
  "--ui-weight-heavy",
  "--ui-weight-hero",
  // radii
  "--ui-radius-tight",
  "--ui-radius-control",
  "--ui-radius-segment",
  "--ui-radius-track",
  "--ui-radius-card",
  "--ui-radius-sheet",
  "--ui-radius-column",
  // spacing scale
  "--ui-space-1",
  "--ui-space-2",
  "--ui-space-3",
  "--ui-space-4",
  "--ui-space-5",
  "--ui-space-6",
  // density
  "--ui-gutter",
  "--ui-gap",
  "--ui-gap-lg",
  "--ui-tap-min",
  "--ui-row-min",
  "--ui-column-max",
  "--ui-content-max",
  // surfaces
  "--ui-page",
  "--ui-surface",
  "--ui-surface-sunken",
  "--ui-on-surface",
  "--ui-on-surface-muted",
  "--ui-on-surface-faint",
  "--ui-rule",
  "--ui-rule-strong",
  "--ui-scrim",
  "--ui-scorebox",
  "--ui-on-scorebox",
  // ink
  "--ui-ink",
  "--ui-ink-deep",
  "--ui-ink-fg",
  "--ui-on-ink",
  "--ui-on-ink-plain",
  "--ui-on-ink-muted",
  "--ui-on-grad-header",
  // the dark-mesh register (welcome, auth, first-launch chooser)
  "--ui-on-mesh",
  "--ui-on-mesh-muted",
  "--ui-on-mesh-faint",
  "--ui-mesh-glass",
  "--ui-mesh-rule",
  // accents
  "--ui-accent-spring",
  "--ui-accent-sky",
  "--ui-on-action-positive",
  // status
  "--ui-positive",
  "--ui-negative",
  "--ui-caution",
  "--ui-live",
  "--ui-live-fg",
  // the foreground each status fill carries
  "--ui-on-positive",
  "--ui-on-negative",
  "--ui-on-caution",
  // club colour (Option A) — ink defaults here; per element via `clubStyle()`
  // and the `[data-club]` layer
  "--ui-club",
  "--ui-on-club",
  "--ui-club-edge",
  "--ui-club-fg",
  "--ui-club-tint",
  // the per-route decorative wash
  "--ui-wash-home",
  "--ui-wash-news",
  "--ui-wash-matches",
  "--ui-wash-fantasy",
  "--ui-wash-profile",
  "--ui-wash-neutral",
  // gradients
  "--ui-grad-action",
  "--ui-grad-header",
  "--ui-grad-hero",
  // elevation
  "--ui-shadow-card",
  "--ui-shadow-raised",
  "--ui-shadow-lifted",
  "--ui-shadow-overlay",
  "--ui-shadow-column",
  // Fantasy domain — the pitch
  "--ui-pitch-turf-a",
  "--ui-pitch-turf-b",
  "--ui-pitch-bench",
  "--ui-pitch-line",
  "--ui-on-pitch",
  // the player plate's figure band (points / price / fixture)
  "--ui-plate-figure",
  // the match lineup pitch
  "--ui-lineup-turf-a",
  "--ui-lineup-turf-b",
  // Fantasy domain — fixture difficulty
  "--ui-fdr-1",
  "--ui-fdr-2",
  "--ui-fdr-3",
  "--ui-fdr-4",
  "--ui-fdr-5",
  "--ui-on-fdr-1",
  "--ui-on-fdr-2",
  "--ui-on-fdr-3",
  "--ui-on-fdr-4",
  "--ui-on-fdr-5",
] as const;

export type UiToken = (typeof UI_TOKENS)[number];

/**
 * Tokens that must be re-declared under `.dark`. Sizes, radii and spacing are
 * theme-independent; anything that carries a colour is not.
 */
export const UI_THEMED_TOKENS: readonly UiToken[] = [
  "--ui-page",
  "--ui-surface",
  "--ui-surface-sunken",
  "--ui-on-surface",
  "--ui-on-surface-muted",
  "--ui-on-surface-faint",
  "--ui-rule",
  "--ui-rule-strong",
  "--ui-scrim",
  "--ui-scorebox",
  "--ui-on-scorebox",
  "--ui-ink",
  "--ui-ink-deep",
  "--ui-ink-fg",
  "--ui-on-ink",
  "--ui-on-ink-plain",
  "--ui-on-grad-header",
  "--ui-accent-spring",
  "--ui-accent-sky",
  "--ui-on-action-positive",
  "--ui-positive",
  "--ui-negative",
  "--ui-caution",
  "--ui-live",
  "--ui-live-fg",
  "--ui-on-positive",
  "--ui-on-negative",
  "--ui-on-caution",
  // Plain aliases of the ink family, redeclared identically under `.dark`
  // (the `--ui-wash-neutral` precedent). Per element they are re-pointed by
  // the `[data-club]` layer, which has its own light and dark rule.
  "--ui-club",
  "--ui-on-club",
  "--ui-club-edge",
  "--ui-club-fg",
  "--ui-club-tint",
  "--ui-wash-home",
  "--ui-wash-news",
  "--ui-wash-matches",
  "--ui-wash-fantasy",
  "--ui-wash-profile",
  "--ui-wash-neutral",
  "--ui-grad-header",
  "--ui-grad-hero",
  "--ui-shadow-card",
  "--ui-shadow-raised",
  "--ui-shadow-lifted",
  "--ui-shadow-overlay",
  "--ui-pitch-bench",
  "--ui-pitch-line",
  "--ui-on-pitch",
  "--ui-plate-figure",
  "--ui-lineup-turf-a",
  "--ui-lineup-turf-b",
  "--ui-fdr-1",
  "--ui-fdr-2",
  "--ui-fdr-3",
  "--ui-fdr-4",
  "--ui-fdr-5",
  "--ui-on-fdr-1",
  "--ui-on-fdr-2",
  "--ui-on-fdr-3",
  "--ui-on-fdr-4",
  "--ui-on-fdr-5",
];

/**
 * Colour-bearing tokens that are NOT redeclared under `.dark` because they
 * are composed entirely from tokens that are — redeclaring them would be a
 * second copy of the same values, i.e. exactly the drift this manifest
 * exists to prevent. The contract test checks that each one's light value
 * only references themed tokens.
 */
export const UI_DERIVED_TOKENS: readonly UiToken[] = [
  "--ui-grad-action",
  // The mesh register is `--ui-on-ink-plain` at five opacities. That token
  // flips with the theme, so these follow it; redeclaring them under `.dark`
  // would be a second copy of the same values.
  "--ui-on-mesh",
  "--ui-on-mesh-muted",
  "--ui-on-mesh-faint",
  "--ui-mesh-glass",
  "--ui-mesh-rule",
  // The quieter foreground on an ink fill: plain on-ink mixed into the ink
  // itself, so it follows both.
  "--ui-on-ink-muted",
  // Option A's pastel Fantasy turf: the two action-gradient stops over the
  // surface. All three flip, so the dark turf needs no second copy.
  "--ui-pitch-turf-a",
  "--ui-pitch-turf-b",
];

/**
 * Tailwind scans source files for *literal* class strings. A class built by
 * interpolation — `text-[length:var(${token})]` — is never seen, so the
 * utility is never generated and the element silently falls back to the
 * inherited 16px/400. Every size and weight below is therefore spelled out
 * in full exactly once, here, where the scanner can read it. Do not rewrite
 * these as template literals.
 */
const SIZE_CLASS = {
  "--ui-text-hero": "text-[length:var(--ui-text-hero)]",
  "--ui-text-title": "text-[length:var(--ui-text-title)]",
  "--ui-text-section": "text-[length:var(--ui-text-section)]",
  "--ui-text-subtitle": "text-[length:var(--ui-text-subtitle)]",
  "--ui-text-body": "text-[length:var(--ui-text-body)]",
  "--ui-text-secondary": "text-[length:var(--ui-text-secondary)]",
  "--ui-text-meta": "text-[length:var(--ui-text-meta)]",
  "--ui-text-label": "text-[length:var(--ui-text-label)]",
  "--ui-text-micro": "text-[length:var(--ui-text-micro)]",
  "--ui-stat-hero": "text-[length:var(--ui-stat-hero)]",
  "--ui-stat-lg": "text-[length:var(--ui-stat-lg)]",
  "--ui-stat-md": "text-[length:var(--ui-stat-md)]",
  "--ui-stat-sm": "text-[length:var(--ui-stat-sm)]",
  "--ui-display-mega": "text-[length:var(--ui-display-mega)]",
  "--ui-display-hero": "text-[length:var(--ui-display-hero)]",
  "--ui-display-section": "text-[length:var(--ui-display-section)]",
  "--ui-score-hero": "text-[length:var(--ui-score-hero)]",
  "--ui-score-lg": "text-[length:var(--ui-score-lg)]",
  "--ui-score-md": "text-[length:var(--ui-score-md)]",
  "--ui-score-sm": "text-[length:var(--ui-score-sm)]",
  "--ui-score-row": "text-[length:var(--ui-score-row)]",
} as const satisfies Partial<Record<UiToken, string>>;

const WEIGHT_CLASS = {
  "--ui-weight-normal": "[font-weight:var(--ui-weight-normal)]",
  "--ui-weight-body": "[font-weight:var(--ui-weight-body)]",
  "--ui-weight-strong": "[font-weight:var(--ui-weight-strong)]",
  "--ui-weight-heavy": "[font-weight:var(--ui-weight-heavy)]",
  "--ui-weight-hero": "[font-weight:var(--ui-weight-hero)]",
} as const satisfies Partial<Record<UiToken, string>>;

const FONT_CLASS = {
  "--ui-font-display": "[font-family:var(--ui-font-display)]",
  "--ui-font-body": "[font-family:var(--ui-font-body)]",
} as const satisfies Partial<Record<UiToken, string>>;

const size = (token: keyof typeof SIZE_CLASS) => SIZE_CLASS[token];
const weight = (token: keyof typeof WEIGHT_CLASS) => WEIGHT_CLASS[token];

/**
 * Numerals are always tabular and always a step tighter than prose — and the
 * tightening is `ltr:`-only, because Arabic-Indic digits sit in joined text.
 *
 * Manrope, always: this is the ramp for a figure read down a COLUMN, and
 * Changa has no tabular figures. It must never pick up the display face —
 * the contract test holds it to that.
 */
const STAT_BASE =
  "fpl-tabular ltr:tracking-[var(--ui-stat-tracking)] leading-[var(--ui-leading-flat)]";

/**
 * Every display step: the Changa family and its own leading. Weight tops out
 * at heavy (800) — Changa has no 900, so `--ui-weight-hero` never appears.
 */
const DISPLAY = FONT_CLASS["--ui-font-display"];

/**
 * The design language as class tokens. Compose with `cn()`.
 */
export const ui = {
  /**
   * Type ramp. Every step now carries a leading token rather than a Tailwind
   * `leading-*` chosen per component — see BG-0124. `flat` is the floor for
   * anything that has to fit one line; `copy` is for text that wraps.
   *
   * Nothing here may use `leading-none`. A font's ink does not fit inside its
   * own em, and every one of these steps can land inside a `truncate`, which
   * hides the overflow and cuts the difference off.
   */
  text: {
    hero: `${size("--ui-text-hero")} ${weight("--ui-weight-hero")} leading-[var(--ui-leading-flat)]`,
    title: `${size("--ui-text-title")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-flat)]`,
    section: `${size("--ui-text-section")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-flat)]`,
    subtitle: `${size("--ui-text-subtitle")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-flat)]`,
    body: `${size("--ui-text-body")} ${weight("--ui-weight-body")} leading-[var(--ui-leading-copy)]`,
    bodyStrong: `${size("--ui-text-body")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-copy)]`,
    secondary: `${size("--ui-text-secondary")} leading-[var(--ui-leading-copy)]`,
    meta: `${size("--ui-text-meta")} ${weight("--ui-weight-body")} leading-[var(--ui-leading-copy)]`,
    label: `${size("--ui-text-label")} ${weight("--ui-weight-heavy")} uppercase ltr:tracking-wide leading-[var(--ui-leading-flat)]`,
    micro: `${size("--ui-text-micro")} ${weight("--ui-weight-body")} leading-[var(--ui-leading-flat)]`,
    /**
     * Long-form paragraphs: the rules page, help answers, Terms and Privacy.
     * The only step at `normal` weight — continuous copy set at 600 reads as a
     * page of emphasis, and Terms alone is 7,882 characters.
     */
    prose: `${size("--ui-text-body")} ${weight("--ui-weight-normal")} leading-[var(--ui-leading-prose)]`,
    /** Numbers that must line up column to column. */
    tabular: "fpl-tabular",
  },

  /**
   * Stat ramp — numerals only (points, price, rank, score). Use these, not
   * `ui.text.*`, for anything a reader scans as a figure.
   */
  stat: {
    hero: `${size("--ui-stat-hero")} ${weight("--ui-weight-hero")} ${STAT_BASE}`,
    lg: `${size("--ui-stat-lg")} ${weight("--ui-weight-hero")} ${STAT_BASE}`,
    md: `${size("--ui-stat-md")} ${weight("--ui-weight-heavy")} ${STAT_BASE}`,
    sm: `${size("--ui-stat-sm")} ${weight("--ui-weight-strong")} ${STAT_BASE}`,
  },

  /**
   * Font families, for the one-off case a ramp step does not cover. `display`
   * is Changa; `body` is the body stack (Manrope, or Noto Sans Arabic in
   * Arabic) — use it on the prime of a minute inside display text, since
   * Changa has no U+2032: `<bdi>63<span className={ui.font.body}>′</span></bdi>`.
   */
  font: {
    display: FONT_CLASS["--ui-font-display"],
    body: FONT_CLASS["--ui-font-body"],
  },

  /**
   * Display ramp (Option A) — Changa, for words that announce: titles,
   * headings, tab labels, team names in headers. Every step carries
   * `--ui-leading-display` (1.25 Latin, 1.95 Arabic). No step is 900: Changa
   * stops at 800.
   *
   * Changing the size with `cn()` drops the leading (`text-*` and `leading-*`
   * are one group to tailwind-merge), so restate the leading after a size.
   */
  display: {
    /** 112/800 — the goal takeover's one word. */
    mega: `${DISPLAY} ${size("--ui-display-mega")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-display)]`,
    /** 46/800 — a hero headline ("Journée 14"), a player's surname. */
    hero: `${DISPLAY} ${size("--ui-display-hero")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-display)]`,
    /** 34/800 — the hub title (`UiPageTitle`), the login heading. */
    title: `${DISPLAY} ${size("--ui-text-hero")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-display)]`,
    /** 22/800 — a section heading ("À venir", "Mes ligues"). */
    section: `${DISPLAY} ${size("--ui-display-section")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-display)]`,
    /** 19/800 — the screen header title (`UiHeader`). */
    header: `${DISPLAY} ${size("--ui-text-title")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-display)]`,
    /** 16/800 — the header title when both flanks hold a control. */
    headerSm: `${DISPLAY} ${size("--ui-text-subtitle")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-display)]`,
    /** 16/600 — a tab label (`UiTabs` sets the active one heavy). */
    tab: `${DISPLAY} ${size("--ui-text-subtitle")} ${weight("--ui-weight-body")} leading-[var(--ui-leading-display)]`,
    /** 22/700 — a team name in the split score header. */
    teamLg: `${DISPLAY} ${size("--ui-display-section")} ${weight("--ui-weight-strong")} leading-[var(--ui-leading-display)]`,
    /** 19/700 — a team name in a card or a hero. */
    team: `${DISPLAY} ${size("--ui-text-title")} ${weight("--ui-weight-strong")} leading-[var(--ui-leading-display)]`,
    /** 17/700 — a team name on a lineup band. */
    teamSm: `${DISPLAY} ${size("--ui-text-section")} ${weight("--ui-weight-strong")} leading-[var(--ui-leading-display)]`,
  },

  /**
   * Score ramp (Option A) — Changa numerals for a figure that STANDS ALONE:
   * a score box, the Fantasy points number, a rank hero, a kickoff time in a
   * list row. NOT tabular (Changa has no tabular figures), so never for a
   * figure read down a column — that is `ui.stat.*`.
   *
   * Digits and figure punctuation ONLY. Leading is `--ui-leading-figure`,
   * the same 1.1 in both languages because the digits are the same Latin
   * glyphs — and Arabic LETTERS in Changa rise above that box (measured:
   * "الثالث" 2px over it at 20px, cut by `truncate`). A unit or an ordinal
   * ("pts", the "e" of "3e", their Arabic words) is a sibling span in
   * `ui.text.*` / `ui.display.*`, which carry each language's leading.
   *
   * A score is three flex children — never the string "1 – 1" — in a
   * container that INHERITS the page direction, each figure its own `<bdi>`:
   * `<div className="flex gap-2"><bdi>1</bdi><span aria-hidden>–</span><bdi>1</bdi></div>`.
   * Never a `<bdi>` as the flex container: it is `dir="auto"`, digits have
   * no strong direction, so it resolves to LTR and puts home on the LEFT in
   * Arabic.
   */
  score: {
    /** 52/800 — the match hero score box, the Fantasy card points. */
    hero: `${DISPLAY} ${size("--ui-score-hero")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-figure)]`,
    /** 40/800 — the live card score, H2H tallies, a team's points figure. */
    lg: `${DISPLAY} ${size("--ui-score-lg")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-figure)]`,
    /** 30/800 — a match-list card score, the rank hero figure. */
    md: `${DISPLAY} ${size("--ui-score-md")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-figure)]`,
    /** 24/800 — the compact bar score, a summary strip figure. */
    sm: `${DISPLAY} ${size("--ui-score-sm")} ${weight("--ui-weight-heavy")} leading-[var(--ui-leading-figure)]`,
    /** 20/700 — a kickoff time or score in a list row, an event minute, a rank figure. */
    row: `${DISPLAY} ${size("--ui-score-row")} ${weight("--ui-weight-strong")} leading-[var(--ui-leading-figure)]`,
  },

  /** Foreground colours. */
  tone: {
    default: "text-[color:var(--ui-on-surface)]",
    muted: "text-[color:var(--ui-on-surface-muted)]",
    faint: "text-[color:var(--ui-on-surface-faint)]",
    /** The brand foreground. Theme-correct — never `--ui-ink`, see BG-0083. */
    ink: "text-[color:var(--ui-ink-fg)]",
    onInk: "text-[color:var(--ui-on-ink)]",
    /** The foreground for the header/hero gradient band. */
    onGradHeader: "text-[color:var(--ui-on-grad-header)]",
    onInkPlain: "text-[color:var(--ui-on-ink-plain)]",
    /** The quieter line on an ink fill: a kicker or a label over a figure. */
    onInkMuted: "text-[color:var(--ui-on-ink-muted)]",
    /** A gain written ON the action gradient; `positive` fails there. */
    onActionPositive: "text-[color:var(--ui-on-action-positive)]",
    /** Text on a club fill (`--ui-club`), measured per theme by the club palette. */
    onClub: "text-[color:var(--ui-on-club)]",
    /**
     * The club colour as text on a surface or on the club tint. Falls back to
     * `--ui-on-surface` where no club colour clears 4.5:1, and always in dark.
     */
    club: "text-[color:var(--ui-club-fg)]",
    /**
     * The dark-mesh register: welcome, auth, the first-launch chooser.
     * Use these instead of `text-white/80` — a literal white is un-themed and
     * says "light theme" in a file that does not know which theme it is in.
     */
    onMesh: "text-[color:var(--ui-on-mesh)]",
    onMeshMuted: "text-[color:var(--ui-on-mesh-muted)]",
    onMeshFaint: "text-[color:var(--ui-on-mesh-faint)]",
    positive: "text-[color:var(--ui-positive)]",
    negative: "text-[color:var(--ui-negative)]",
    /** A match in progress. The FOREGROUND step, never the fill (BG-0104). */
    live: "text-[color:var(--ui-live-fg)]",
    /**
     * The foreground each status FILL carries. Never pick one yourself:
     * `--ui-positive` and `--ui-negative` invert across the themes — a
     * mid-tone in light, a light tint in dark — so the answer flips with
     * them. Same rule, and the same reason, as `--ui-on-fdr-N`.
     */
    onPositive: "text-[color:var(--ui-on-positive)]",
    onNegative: "text-[color:var(--ui-on-negative)]",
    onCaution: "text-[color:var(--ui-on-caution)]",
  },

  /** Surfaces. */
  surface: {
    page: "bg-[color:var(--ui-page)] text-[color:var(--ui-on-surface)]",
    card: "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)] rounded-[var(--ui-radius-card)] shadow-[var(--ui-shadow-card)]",
    /**
     * The plate a score sits on across a split club header. Light in BOTH
     * themes, with ink-deep digits (16.59 / 14.18), so it separates from any
     * club fill; pair with `ui.radius.card` and `ui.shadow.lifted`.
     */
    scorebox: "bg-[color:var(--ui-scorebox)] text-[color:var(--ui-on-scorebox)]",
    sunken: "bg-[color:var(--ui-surface-sunken)] text-[color:var(--ui-on-surface)]",
    ink: "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink)]",
    /** An ink fill carrying plain (non-cyan) foreground. */
    inkPlain: "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink-plain)]",
    /** Full-bleed bar: an opaque surface with a hairline rule, no glass. */
    bar: "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)]",
    /**
     * The glass tile on the dark mesh — the logo plate, the language chip.
     * A fill and a hairline, both themed; no literal `bg-white/10`.
     */
    mesh: "bg-[color:var(--ui-mesh-glass)] text-[color:var(--ui-on-mesh)] ring-1 ring-[color:var(--ui-mesh-rule)]",
    /** Sheets, modals and popovers: the raised surface above the scrim. */
    overlay:
      "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)] shadow-[var(--ui-shadow-overlay)]",
  },

  /** Hairline dividers — logical edges only, so RTL mirrors. */
  rule: {
    block: "border-b border-[color:var(--ui-rule)]",
    blockStart: "border-t border-[color:var(--ui-rule)]",
    inline: "border-s border-[color:var(--ui-rule)]",
    all: "border border-[color:var(--ui-rule)]",
    /**
     * A control boundary that must be seen (WCAG 1.4.11): a field outline,
     * an outline button. `--ui-rule` is a 1.2:1 hairline; this is ≥ 3:1.
     */
    strong: "border border-[color:var(--ui-rule-strong)]",
  },

  /** Elevation — the one shadow set. `lifted` is Option A's single raised step. */
  shadow: {
    card: "shadow-[var(--ui-shadow-card)]",
    raised: "shadow-[var(--ui-shadow-raised)]",
    /** The score box, a hero card, the primary call to action. */
    lifted: "shadow-[var(--ui-shadow-lifted)]",
    overlay: "shadow-[var(--ui-shadow-overlay)]",
  },

  /**
   * Club-colour edge bars, logical so they mirror. They replace the boards'
   * `box-shadow: inset 4px 0 0 <club>` — a physical x offset that stays on
   * the left in Arabic. Drawn as a 4px border, which on a rounded card
   * tapers into the corners exactly like the inset shadow did, and paints
   * `--ui-club-edge` (≥ 3:1 against the surface) — so put the element, or an
   * ancestor, under `clubStyle(club)`. Without one it is the ink.
   *
   * A two-sided row (home edge at the start, away edge at the end) puts each
   * side's `clubStyle` on its own cell, or uses 4px grid tracks with
   * `ui.edge.bar` — grid tracks mirror too.
   */
  edge: {
    /** A 4px bar on the inline-start edge (the right edge in Arabic). */
    start: "border-s-4 border-s-[color:var(--ui-club-edge)]",
    /** A 4px bar on the inline-end edge. */
    end: "border-e-4 border-e-[color:var(--ui-club-edge)]",
    /** A 4px bar along the bottom (block-end) edge — a club tile's base. */
    blockEnd: "border-b-4 border-b-[color:var(--ui-club-edge)]",
    /**
     * A free-standing 4px vertical bar, as a flex or grid child. Override its
     * background (`style={{ backgroundImage: "var(--ui-grad-action)" }}`) for
     * the gradient "your position" bar.
     */
    bar: "w-1 shrink-0 self-stretch rounded-full bg-[color:var(--ui-club-edge)]",
  },

  /**
   * Club colour, read from the `--ui-club*` tokens that `clubStyle(club)`
   * sets per element (see `src/lib/club-palette.ts`). Spread `clubStyle` on
   * the element or an ancestor; these classes only paint.
   */
  club: {
    /** A club block: the fill and the text measured for it. */
    fill: "bg-[color:var(--ui-club)] text-[color:var(--ui-on-club)]",
    /** The fill alone, for a bar or a segment that carries no text. */
    fillOnly: "bg-[color:var(--ui-club)]",
    /** The edge colour as a fill: a dot, a thin progress bar. ≥ 3:1. */
    edgeFill: "bg-[color:var(--ui-club-edge)]",
    /** A quiet club wash behind an icon disc or a quote. */
    tint: "bg-[color:var(--ui-club-tint)]",
    /**
     * A 1px inner ring in the edge colour. Invisible on most clubs (the edge
     * IS the fill) and exactly what a white or yellow kit needs to stay a
     * shape on a white card.
     */
    ring: "ring-1 ring-inset ring-[color:var(--ui-club-edge)]",
    /** A surface disc on a club block: a crest plate, an avatar. */
    inverse: "bg-[color:var(--ui-surface)] text-[color:var(--ui-club-fg)]",
    /** The diagonal texture (`--stripe-angle`, mirrored in Arabic). */
    stripes: "club-stripes",
  },

  /** Density. */
  space: {
    gutter: "px-[var(--ui-gutter)]",
    row: "min-h-[var(--ui-row-min)]",
    tap: "min-h-[var(--ui-tap-min)] min-w-[var(--ui-tap-min)]",
    column: "mx-auto w-full max-w-[var(--ui-column-max)]",
    /**
     * The READING column, 672px — wider than the 480px phone canvas and a
     * different thing from it. Three places had reached for a literal
     * `max-w-2xl` because `column` was the only width token and it meant the
     * other one.
     */
    content: "mx-auto w-full max-w-[var(--ui-content-max)]",
  },

  radius: {
    tight: "rounded-[var(--ui-radius-tight)]",
    control: "rounded-[var(--ui-radius-control)]",
    segment: "rounded-[var(--ui-radius-segment)]",
    track: "rounded-[var(--ui-radius-track)]",
    /** 14px — cards and list groups (`ui.surface.card` carries it). */
    card: "rounded-[var(--ui-radius-card)]",
    sheet: "rounded-[var(--ui-radius-sheet)]",
    /** Every control a thumb presses: buttons, chips, pills, icon buttons. */
    full: "rounded-full",
  },

  /** Safe-area padding — phone-first, matching the Fantasy headers. */
  safe: {
    top: "pt-[max(env(safe-area-inset-top),0.75rem)]",
    bottom: "pb-[max(env(safe-area-inset-bottom),0.5rem)]",
  },

  /**
   * Focus ring, identical everywhere so the product reads as one. Drawn in
   * `--ui-ink-fg`: the ring has to be visible against the page in BOTH
   * themes, which a fill colour is not.
   */
  /**
   * A transparent 44px target centred on a control that is PAINTED smaller —
   * a checkbox, a remove badge on a thumbnail, a dense icon button.
   *
   * Rule 5 has no exception for a small control, and growing the painted box
   * is usually not the answer: a 44px remove button covers half the avatar it
   * annotates. So the ink stays its designed size and the target grows behind
   * it. `inset-0` plus `m-auto` centres the pseudo-element without naming a
   * physical edge, so it needs no RTL counterpart.
   *
   * The element it sits on must be `relative`, and anything overlapping it
   * needs to sit above — this is a real 44px box, not a hint.
   */
  hitArea:
    "relative after:absolute after:inset-0 after:m-auto after:h-[var(--ui-tap-min)] after:w-[var(--ui-tap-min)] after:content-['']",

  focus:
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-ink-fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ui-page)]",
  /**
   * The same ring for a control sitting on the dark mesh rather than on the
   * page. `ui.focus` is drawn in `--ui-ink-fg`, a deep navy in the light
   * theme, which on the mesh is a ring you cannot see — so the mesh needs its
   * own, and the offset is transparent because there is no page colour behind
   * the control to punch through.
   */
  focusOnMesh:
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-on-mesh)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
} as const;
