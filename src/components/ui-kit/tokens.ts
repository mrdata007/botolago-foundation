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
 * Two rules hold everywhere in this folder and are enforced by the contract
 * test:
 *
 *   1. Logical properties only. No `ml-/mr-/pl-/pr-`, no `left-/right-`,
 *      no `text-left/text-right`, no `border-l/border-r`. Arabic is a
 *      first-class language here, not a mirror mode bolted on later.
 *   2. Never letter-space Arabic. Arabic letterforms join; spacing them
 *      apart in either direction breaks the word. Any `tracking-*` must be
 *      `ltr:`-prefixed so it applies to Latin only. This is the open defect
 *      BG-0069 and it must not be reproduced in new code.
 */

/** Every `--ui-*` custom property the kit relies on. */
export const UI_TOKENS = [
  // type scale
  "--ui-text-hero",
  "--ui-text-title",
  "--ui-text-section",
  "--ui-text-subtitle",
  "--ui-text-body",
  "--ui-text-secondary",
  "--ui-text-meta",
  "--ui-text-label",
  "--ui-text-micro",
  // weights
  "--ui-weight-body",
  "--ui-weight-strong",
  "--ui-weight-heavy",
  "--ui-weight-hero",
  // radii
  "--ui-radius-control",
  "--ui-radius-segment",
  "--ui-radius-track",
  "--ui-radius-column",
  // density
  "--ui-gutter",
  "--ui-gap",
  "--ui-gap-lg",
  "--ui-tap-min",
  "--ui-row-min",
  "--ui-column-max",
  // surfaces
  "--ui-page",
  "--ui-surface",
  "--ui-surface-sunken",
  "--ui-on-surface",
  "--ui-on-surface-muted",
  "--ui-rule",
  // ink
  "--ui-ink",
  "--ui-ink-deep",
  "--ui-on-ink",
  "--ui-on-ink-plain",
  // status
  "--ui-positive",
  "--ui-negative",
  "--ui-caution",
  // gradients
  "--ui-grad-action",
  "--ui-grad-header",
  // elevation
  "--ui-shadow-card",
  "--ui-shadow-raised",
  "--ui-shadow-column",
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
  "--ui-rule",
  "--ui-ink",
  "--ui-ink-deep",
  "--ui-on-ink",
  "--ui-on-ink-plain",
  "--ui-grad-header",
  "--ui-shadow-card",
  "--ui-shadow-raised",
];

const size = (token: UiToken) => `text-[length:var(${token})]`;
const weight = (token: UiToken) => `[font-weight:var(${token})]`;

/**
 * The design language as class tokens. Compose with `cn()`.
 */
export const ui = {
  /** Type scale. Line heights follow Fantasy: tight for headings, 1.5 for copy. */
  text: {
    hero: `${size("--ui-text-hero")} ${weight("--ui-weight-hero")} leading-tight`,
    title: `${size("--ui-text-title")} ${weight("--ui-weight-heavy")} leading-tight`,
    section: `${size("--ui-text-section")} ${weight("--ui-weight-heavy")} leading-tight`,
    subtitle: `${size("--ui-text-subtitle")} ${weight("--ui-weight-heavy")} leading-tight`,
    body: `${size("--ui-text-body")} ${weight("--ui-weight-body")} leading-normal`,
    bodyStrong: `${size("--ui-text-body")} ${weight("--ui-weight-heavy")} leading-normal`,
    secondary: `${size("--ui-text-secondary")} leading-normal`,
    meta: `${size("--ui-text-meta")} ${weight("--ui-weight-body")} leading-normal`,
    label: `${size("--ui-text-label")} ${weight("--ui-weight-heavy")} uppercase ltr:tracking-wide`,
    micro: `${size("--ui-text-micro")} ${weight("--ui-weight-body")} leading-none`,
    /** Numbers that must line up column to column. */
    tabular: "fpl-tabular",
  },

  /** Foreground colours. */
  tone: {
    default: "text-[color:var(--ui-on-surface)]",
    muted: "text-[color:var(--ui-on-surface-muted)]",
    ink: "text-[color:var(--ui-ink)]",
    onInk: "text-[color:var(--ui-on-ink)]",
    positive: "text-[color:var(--ui-positive)]",
    negative: "text-[color:var(--ui-negative)]",
  },

  /** Surfaces. */
  surface: {
    page: "bg-[color:var(--ui-page)] text-[color:var(--ui-on-surface)]",
    card: "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)] rounded-[var(--ui-radius-control)] shadow-[var(--ui-shadow-card)]",
    sunken: "bg-[color:var(--ui-surface-sunken)] text-[color:var(--ui-on-surface)]",
    ink: "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink)]",
    /** Full-bleed bar: an opaque surface with a hairline rule, no glass. */
    bar: "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)]",
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
  },

  radius: {
    control: "rounded-[var(--ui-radius-control)]",
    segment: "rounded-[var(--ui-radius-segment)]",
    track: "rounded-[var(--ui-radius-track)]",
    full: "rounded-full",
  },

  /** Safe-area padding — phone-first, matching the Fantasy headers. */
  safe: {
    top: "pt-[max(env(safe-area-inset-top),0.75rem)]",
    bottom: "pb-[max(env(safe-area-inset-bottom),0.5rem)]",
  },

  /** Focus ring, identical everywhere so the product reads as one. */
  focus:
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ui-page)]",
} as const;
