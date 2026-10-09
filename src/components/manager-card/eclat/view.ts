/**
 * What every drawing starts from: the profile cleaned to what the object can show (a number is an
 * integer from 1 to 99 or a dash, a serial is digits, a tier is one of the five), the strings of the
 * interface language with the tier names the card prints, the ladder step, and the one sentence a
 * screen reader hears.
 */
import { cardLabel } from "../copy";
import { STAT_CODES, TIER_CODES } from "../types";
import type { CardProfile, CardStrings, StatCode, TierCode } from "../types";
import { FOIL, tierKeyOf, withTierNames, type Foil, type TierKey } from "./foil";

/** The em dash the card prints where a number does not exist yet. */
export const DASH = "—";

const ESC: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * The one escape: every manager-supplied string (the name, the club's initials, the season, the
 * serial, the label) goes through it before it reaches an attribute or a text node.
 */
export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ESC[c]!);
}

const intIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && Math.round(v) >= min && Math.round(v) <= max
    ? Math.round(v)
    : null;

/** The profile as the object can show it. Anything out of range reads as the object's empty part. */
export function cleanProfile(p: CardProfile): CardProfile {
  const stats = {} as Record<StatCode, number | null>;
  for (const k of STAT_CODES) stats[k] = intIn(p.stats?.[k], 1, 99);
  const tier = (TIER_CODES as readonly string[]).includes(p.tier as string)
    ? (p.tier as TierCode)
    : null;
  const season = String(p.season ?? "")
    .replace(/[^0-9/ .-]/g, "")
    .trim()
    .slice(0, 12);
  return {
    // the label may carry a long name, never a page of them; the art cuts it at a word (name.ts)
    name: typeof p.name === "string" ? p.name.slice(0, 80) : "",
    ovr: intIn(p.ovr, 1, 99),
    tier,
    provisional: !!p.provisional,
    counted: intIn(p.counted, 0, 999),
    minRated: intIn(p.minRated, 1, 999),
    season,
    serial: typeof p.serial === "string" && /^[0-9]{1,12}$/.test(p.serial) ? p.serial : null,
    founder: intIn(p.founder, 1000, 9999),
    club: p.club,
    stats,
    ...(p.sample ? { sample: true as const } : {}),
  };
}

export interface View {
  p: CardProfile;
  s: CardStrings;
  /** The interface language mirrors the card. */
  ar: boolean;
  /** The ladder step: `base` until there is a number and a tier. */
  tierKey: TierKey;
  F: Foil;
}

export function makeView(profile: CardProfile, strings: CardStrings): View {
  const p = cleanProfile(profile);
  const s = withTierNames(strings);
  const tierKey = tierKeyOf(p);
  return { p, s, ar: s.lang === "ar", tierKey, F: FOIL[tierKey] };
}

/** The serial's carrier: the id, or the same carrier with a dash. No sentence, no placeholder. */
export function serialLine(s: CardStrings, serial: string | null): string {
  if (serial) return s.serial(serial);
  const prefix = s.serial("").replace(/\s*#?\s*$/, "");
  return `${prefix} ${DASH}`;
}

/** What a label may not carry into an attribute: control and direction-override characters. */
export const stripControls = (text: string): string =>
  [...text]
    .filter((ch) => {
      const code = ch.codePointAt(0) as number;
      return !(
        code < 0x20 ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
      );
    })
    .join("");

/** The name as a screen reader hears it: no control or direction characters, no more than 60. */
export function spokenName(name: string): string {
  return String(name ?? "")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 60);
}

/**
 * The one-sentence accessible name of a card: `cardLabel` of `../copy.ts` (« Carte de manager,
 * Ali, 84 OVR, PRO, Raja CA, Fondateur 2026, BOT #482913 ») on the profile as the object can show
 * it, so what is spoken is what is drawn: a number that is out of range reads as « pas encore de
 * note », as it is drawn as a dash.
 */
export function label(profile: CardProfile, strings: CardStrings): string {
  return cardLabel(cleanProfile(profile), withTierNames(strings));
}

/** The root's aria-label, ready for an attribute. */
export const labelAttr = (p: CardProfile, s: CardStrings): string =>
  esc(stripControls(label(p, s)));

/** The one sentence a token speaks: who, the rating (or none yet), the tier, the founder line. */
export function tokenLabel(v: View): string {
  const { p, s } = v;
  const parts = [spokenName(p.name) || s.a11y.cardOf];
  if (p.ovr == null) {
    parts.push(s.a11y.noRating);
    if (p.minRated) parts.push(s.a11y.counted(p.counted ?? 0, p.minRated));
  } else parts.push(`${p.ovr} ${s.ovr}`);
  if (p.tier && p.ovr != null) parts.push(s.tiers[p.tier]);
  if (p.founder) parts.push(s.founderLine);
  return parts.join(s.a11y.separator);
}
