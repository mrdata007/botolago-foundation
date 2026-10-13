/**
 * The full card and its founder detail: one root element a screen inserts as HTML.
 *
 *   <div class="mc-shield mc-shield--{metal} …" role="img" aria-label dir data-mc-tier style="--sh-…">
 *     <span class="mc-shield__shadow">            the soft shadow under the point
 *     <div class="mc-shield__persp"><div class="mc-shield__tilt">
 *       <span class="mc-shield__edge">             the card's thickness (a 2D offset at rest)
 *       <span class="mc-sl mc-sl--frame">          the metal, cut to the outline
 *       <span class="mc-sl mc-sl--face">           the face inside the frame: ribbon, wedge, band
 *       <span class="mc-sl mc-sl--art">            the monogram, the autograph and its swash
 *       <span class="mc-sl mc-sl--text">           club, stats, crest, founder, serial, sample
 *       <span class="mc-sl mc-sl--num">            the rating, OVR, the tier word or forming marks
 *       <svg class="mc-sl mc-sl--lines">           rim, bevel and inner line
 *       <span class="mc-sl mc-sl--foil">           the light: glare, prism (CHAMPION, LEGEND), sheen
 *       <svg class="mc-sl mc-sl--emblem">          the diamond hanging off the side
 *
 * Every size is in `cqw` of the root (a container), so the card is drawn from its width alone: the
 * stage's 232 to 336 px, the heroes', the face-à-face sheet's compact 136 to 200 px. The layout
 * uses logical properties, so the Arabic card mirrors (rating at the top right, emblem off the right
 * edge) with no transform on any text. Every manager-supplied string goes through `esc`; colours
 * come from `metal.ts` or are a checked club hex.
 */
import type { BeatRoot, RenderOptions } from "../renderer";
import type { BeatName, CardProfile, CardStrings } from "../types";
import { STAT_CODES } from "../types";
import { BEAT_MS } from "./beats";
import { EMBLEM_DIAMOND, EMBLEM_GLYPH, SHIELD, inset } from "./geometry";
import { cssVars } from "./metal";
import {
  fitSignature,
  initialsOf,
  measureEm,
  monogramSize,
  scriptOf,
  type MeasureEm,
} from "./name";
import {
  crestColours,
  esc,
  labelAttr,
  makeView,
  ovrText,
  statText,
  tierWord,
  type ShieldView,
} from "./view";

/** Whether the face prints « BOT #… · season » (owner's layout, 2026-10-13; see the README). */
export const SERIAL_ON_FACE = true;

/** The beats a card has something to light for. */
export function appliedBeat(v: ShieldView, beat: BeatName | undefined): BeatName | "" {
  if (!beat || !Object.hasOwn(BEAT_MS, beat)) return "";
  const { p } = v;
  switch (beat) {
    case "legend":
      return p.tier === "legend" && p.ovr != null ? "legend" : "";
    case "tier":
      return p.tier && p.tier !== "legend" && p.ovr != null ? "tier" : "";
    case "founder":
      return p.founder ? "founder" : "";
    case "first":
    case "tick":
      return p.ovr != null || (p.counted ?? 0) > 0 ? beat : "";
    default:
      return beat;
  }
}

/**
 * What `beat` adds to the root (`CardRenderer.beatRoot`): a class and `data-mc-beat`. Nothing else
 * in the markup depends on the beat (the newest forming mark is marked whether or not a beat
 * plays), so every beat is played in place. `full-beat-root.test.ts` pins it.
 */
export function beatRoot(profile: CardProfile, strings: CardStrings, beat: BeatName): BeatRoot {
  const applied = appliedBeat(makeView(profile, strings), beat);
  if (!applied) return { classes: [], attrs: {} };
  return { classes: [`mc-shield--beat-${applied}`], attrs: { "data-mc-beat": applied } };
}

const span = (cls: string, inner = "", extra = ""): string =>
  `<span class="${cls}"${extra}>${inner}</span>`;

/** The rating, « OVR » and the tier word under it, or the forming marks while there is no number. */
function rateBlock(v: ShieldView): string {
  const { p, s } = v;
  const number = span("mc-shield__ovr", esc(ovrText(v)), ' data-mc="ovr" dir="ltr"');
  const unit = p.ovr == null ? "" : span("mc-shield__ovrl", esc(s.ovr));
  let under = "";
  if (p.tier && (p.ovr != null || p.ladder)) {
    const word = tierWord(p.tier, s);
    const arabicWord = /\p{Script=Arabic}/u.test(word);
    // the word is fitted to its column: 7.2 cqw, less for a long Latin word (LASTREET, CHAMPION)
    const size = arabicWord
      ? Math.min(7.6, 34 / Math.max(1, [...word].length * 0.5))
      : Math.min(7.2, 33 / Math.max(1, [...word].length * 0.64));
    under = span(
      `mc-shield__tier${arabicWord ? " mc-shield__tier--ar" : ""}`,
      esc(word),
      ` dir="${arabicWord ? "rtl" : "ltr"}" style="font-size:${size.toFixed(2)}cqw"`,
    );
  } else if (p.ovr == null && p.minRated) {
    const k = Math.min(p.counted ?? 0, p.minRated);
    const n = Math.min(p.minRated, 7);
    let marks = "";
    for (let i = 0; i < n; i++) {
      const cls = [
        "mc-shield__mark",
        i < k ? "mc-shield__mark--on" : "",
        i === k - 1 ? "mc-shield__mark--new" : "",
      ]
        .filter(Boolean)
        .join(" ");
      marks += span(cls);
    }
    under = span("mc-shield__marks", marks, ' dir="ltr"');
  }
  return span("mc-shield__rate", span("mc-shield__ovr-row", number + unit) + under);
}

/** The monogram, the autograph and its swash. */
function artBlock(v: ShieldView, measure: MeasureEm): string {
  const fit = fitSignature(v.p.name, measure);
  if (!fit) return "";
  const initials = initialsOf(v.p.name);
  const monoScript = scriptOf(initials);
  const mono = initials
    ? span(
        `mc-shield__mono mc-shield__mono--${monoScript}`,
        `<bdi>${esc(initials)}</bdi>`,
        ` aria-hidden="true" style="font-size:${monogramSize(initials, monoScript)}cqw"`,
      )
    : "";
  const lines = fit.lines
    .map((line) =>
      span(
        "mc-shield__sig-line",
        `<bdi>${esc(line)}</bdi>`,
        ` dir="${fit.script === "arabic" ? "rtl" : "ltr"}"`,
      ),
    )
    .join("");
  return (
    mono +
    span(
      `mc-shield__sig mc-shield__sig--${fit.script}${fit.lines.length > 1 ? " mc-shield__sig--two" : ""}`,
      lines + span("mc-shield__swash"),
      ` aria-hidden="true" style="font-size:${fit.size}cqw"`,
    )
  );
}

function crestBlock(v: ShieldView): string {
  const club = v.p.club;
  if (!club) return "";
  if (club.crest) {
    return span(
      "mc-shield__crest mc-shield__crest--image",
      `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">` +
        `<circle cx="20" cy="20" r="18.6" fill="#f4f6f9" stroke="${club.primary}" stroke-width="2.4"/>` +
        `<image href="${esc(club.crest)}" x="8" y="8" width="24" height="24" preserveAspectRatio="xMidYMid meet"/></svg>`,
    );
  }
  const c = crestColours(club.primary);
  return span(
    "mc-shield__crest",
    `<bdi>${esc(club.initials.slice(0, 4))}</bdi>`,
    ` dir="ltr" style="background-color:${c.ground};border-color:${c.ring};color:${c.ink}"`,
  );
}

const STAR =
  '<svg class="mc-shield__star" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 1.6 L12.5 7.2 L18.6 7.8 L14 11.9 L15.3 17.9 L10 14.8 L4.7 17.9 L6 11.9 L1.4 7.8 L7.5 7.2Z"/></svg>';

function textBlock(v: ShieldView): string {
  const { p, s, ar } = v;
  let out = "";
  if (p.sample) out += span("mc-shield__sample", esc(s.sample));
  if (p.club) {
    const name = p.club.name[ar ? "ar" : "fr"] || p.club.name.fr;
    const arabic = /\p{Script=Arabic}/u.test(name);
    out += span(
      `mc-shield__club${arabic ? " mc-shield__club--ar" : ""}`,
      `<bdi>${esc(name)}</bdi>`,
    );
  }
  const stats = STAT_CODES.map((code) => {
    const word = s.stats[code];
    const arabic = /\p{Script=Arabic}/u.test(word);
    return span(
      "mc-shield__stat",
      span(`mc-shield__stat-l${arabic ? " mc-shield__stat-l--ar" : ""}`, esc(word)) +
        span("mc-shield__stat-v", esc(statText(p.stats[code])), ' dir="ltr"'),
    );
  }).join("");
  out += span("mc-shield__stats", stats);
  const founder = p.founder
    ? span("mc-shield__founder", STAR + span("mc-shield__founder-y", esc(p.founder)), ' dir="ltr"')
    : "";
  const crest = crestBlock(v);
  if (crest || founder) out += span("mc-shield__foot", crest + founder);
  if (SERIAL_ON_FACE) {
    const serial = s.serial(p.serial ?? "—");
    const line = p.season ? `${serial} · ${p.season}` : serial;
    out += span("mc-shield__serial", esc(line), ' dir="ltr"');
  }
  return out;
}

const EMBLEM = (v: ShieldView): string =>
  `<svg class="mc-sl mc-sl--emblem" viewBox="0 0 40 40" aria-hidden="true" focusable="false">` +
  `<path class="mc-shield__diamond" d="${EMBLEM_DIAMOND}"/>` +
  `<g class="mc-shield__glyph">${EMBLEM_GLYPH[v.key]}</g></svg>`;

const LINES =
  `<svg class="mc-sl mc-sl--lines" viewBox="0 0 100 136.6" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
  `<path class="mc-shield__rim" d="${SHIELD}"/>` +
  `<path class="mc-shield__hi" d="${SHIELD}" transform="${inset(0.993, 0.996)}"/>` +
  `<path class="mc-shield__in" d="${SHIELD}" transform="${inset(0.958, 0.97)}"/>` +
  `</svg>`;

export interface BodyOptions {
  compact?: boolean;
  measure?: MeasureEm;
}

/** The card's layers, without the root. */
export function body(v: ShieldView, o: BodyOptions = {}): string {
  const measure = o.measure ?? measureEm;
  return (
    `<span class="mc-shield__shadow" aria-hidden="true"></span>` +
    `<div class="mc-shield__persp"><div class="mc-shield__tilt">` +
    `<span class="mc-shield__edge" aria-hidden="true"></span>` +
    `<span class="mc-sl mc-sl--frame" aria-hidden="true"></span>` +
    `<span class="mc-sl mc-sl--face" aria-hidden="true"><span class="mc-shield__rib"></span><span class="mc-shield__wedge"></span><span class="mc-shield__band"></span></span>` +
    span("mc-sl mc-sl--art", artBlock(v, measure)) +
    span("mc-sl mc-sl--text", textBlock(v)) +
    span("mc-sl mc-sl--num", rateBlock(v)) +
    LINES +
    `<span class="mc-sl mc-sl--foil" aria-hidden="true"></span>` +
    EMBLEM(v) +
    `</div></div>`
  );
}

/** The root's classes for a card. */
export function rootClasses(
  v: ShieldView,
  o: { theme: string; compact?: boolean; beat?: BeatName | "" },
): string {
  return [
    "mc-shield",
    `mc-shield--${v.key}`,
    `mc-shield--${o.theme === "dark" ? "dark" : "light"}`,
    v.m.holo ? "mc-shield--holo" : "",
    v.m.dark ? "mc-shield--on-dark" : "mc-shield--on-metal",
    o.compact ? "mc-shield--compact" : "",
    o.beat ? `mc-shield--beat-${o.beat}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The full card: one root element, role="img", the label, dir from the interface language. */
export function fullCard(
  profile: CardProfile,
  options: RenderOptions,
  measure: MeasureEm = measureEm,
): string {
  const v = makeView(profile, options.strings);
  const beat = appliedBeat(v, options.beat);
  return (
    `<div class="${rootClasses(v, { theme: options.theme, compact: options.compact, beat })}" role="img" ` +
    `aria-label="${labelAttr(profile, options.strings)}" dir="${v.ar ? "rtl" : "ltr"}" data-mc-tier="${v.key}"` +
    (beat ? ` data-mc-beat="${beat}"` : "") +
    ` style="${cssVars(v.m)}">` +
    body(v, { compact: options.compact, measure }) +
    `</div>`
  );
}

/**
 * The founder's mark shown larger (G2's founder block): the foot of the same card, cropped to the
 * band, the stats, the crest with the founder's capsule and the serial. Null for anyone who is not a
 * founder. The card inside is drawn as the card is, without its role: the crop is the one image.
 */
export function founderDetail(
  profile: CardProfile,
  options: RenderOptions,
  measure: MeasureEm = measureEm,
): string | null {
  const v = makeView(profile, options.strings);
  if (!v.p.founder) return null;
  const beat = options.beat === "founder" ? "founder" : "";
  return (
    `<div class="mc-shield-detail" role="img" aria-label="${esc(options.strings.founderLine)}" dir="${v.ar ? "rtl" : "ltr"}" data-mc-tier="${v.key}"${beat ? ` data-mc-beat="${beat}"` : ""}>` +
    `<div class="mc-shield-detail__crop">` +
    `<div class="${rootClasses(v, { theme: options.theme, beat })} mc-shield--cropped" aria-hidden="true" dir="${v.ar ? "rtl" : "ltr"}" style="${cssVars(v.m)}">` +
    body(v, { measure }) +
    `</div></div></div>`
  );
}
