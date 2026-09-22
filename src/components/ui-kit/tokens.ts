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
  // leading (BG-0124) — redeclared under :lang(ar)/[dir="rtl"], because the
  // Arabic face needs a taller line box than the Latin one at the same px.
  "--ui-leading-flat",
  "--ui-leading-copy",
  "--ui-leading-prose",
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
  "--ui-scrim",
  // ink
  "--ui-ink",
  "--ui-ink-deep",
  "--ui-ink-fg",
  "--ui-on-ink",
  "--ui-on-ink-plain",
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
  "--ui-shadow-overlay",
  "--ui-shadow-column",
  // Fantasy domain — the pitch
  "--ui-pitch-turf-a",
  "--ui-pitch-turf-b",
  "--ui-pitch-bench",
  "--ui-pitch-line",
  "--ui-on-pitch",
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
  "--ui-scrim",
  "--ui-ink",
  "--ui-ink-deep",
  "--ui-ink-fg",
  "--ui-on-ink",
  "--ui-on-ink-plain",
  "--ui-on-grad-header",
  "--ui-accent-spring",
  "--ui-accent-sky",
  "--ui-positive",
  "--ui-negative",
  "--ui-caution",
  "--ui-live",
  "--ui-live-fg",
  "--ui-on-positive",
  "--ui-on-negative",
  "--ui-on-caution",
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
  "--ui-shadow-overlay",
  "--ui-pitch-turf-a",
  "--ui-pitch-turf-b",
  "--ui-pitch-bench",
  "--ui-pitch-line",
  "--ui-on-pitch",
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
} as const satisfies Partial<Record<UiToken, string>>;

const WEIGHT_CLASS = {
  "--ui-weight-normal": "[font-weight:var(--ui-weight-normal)]",
  "--ui-weight-body": "[font-weight:var(--ui-weight-body)]",
  "--ui-weight-strong": "[font-weight:var(--ui-weight-strong)]",
  "--ui-weight-heavy": "[font-weight:var(--ui-weight-heavy)]",
  "--ui-weight-hero": "[font-weight:var(--ui-weight-hero)]",
} as const satisfies Partial<Record<UiToken, string>>;

const size = (token: keyof typeof SIZE_CLASS) => SIZE_CLASS[token];
const weight = (token: keyof typeof WEIGHT_CLASS) => WEIGHT_CLASS[token];

/**
 * Numerals are always tabular and always a step tighter than prose — and the
 * tightening is `ltr:`-only, because Arabic-Indic digits sit in joined text.
 */
const STAT_BASE =
  "fpl-tabular ltr:tracking-[var(--ui-stat-tracking)] leading-[var(--ui-leading-flat)]";

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
    card: "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)] rounded-[var(--ui-radius-control)] shadow-[var(--ui-shadow-card)]",
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
    sheet: "rounded-[var(--ui-radius-sheet)]",
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
