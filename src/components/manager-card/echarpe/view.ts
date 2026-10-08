/**
 * What every drawing starts from: the profile cleaned to what the object can show (a number is an
 * integer from 1 to 99 or a dash, a serial is digits, a tier is one of the five), the strings of
 * the interface language, the yarns, and the one sentence a screen reader hears.
 */
import { STAT_CODES, TIER_CODES } from "../types";
import type { CardProfile, CardStrings, CardTheme, StatCode, TierCode } from "../types";
import { esc } from "./knit";
import { DASH } from "./motifs";
import { knitName, type KnitName } from "./knit-name";
import { palette, type Palette } from "./palette";

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
    name: typeof p.name === "string" ? p.name : "",
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
  /** The interface language mirrors the scarf. */
  ar: boolean;
  P: Palette;
  name: KnitName;
  /** « BOT #482913 », or the carrier with a dash. */
  serialText: string;
  /** The season, and the sample label on a development fixture. */
  note: string;
}

/** The serial's carrier: the id, or the same carrier with a dash. No sentence, no placeholder. */
export function serialLine(s: CardStrings, serial: string | null): string {
  if (serial) return s.serial(serial);
  const prefix = s.serial("").replace(/\s*#?\s*$/, "");
  return `${prefix} ${DASH}`;
}

export function makeView(profile: CardProfile, s: CardStrings): View {
  const p = cleanProfile(profile);
  return {
    p,
    s,
    ar: s.lang === "ar",
    P: palette(p),
    name: knitName(p.name),
    serialText: serialLine(s, p.serial),
    note: [p.season, p.sample ? s.sample : ""].filter(Boolean).join(" · "),
  };
}

/** The lit edge of the scarf on a dark ground; undyed wool keeps a thin edge on a light one too. */
export function rimOf(theme: CardTheme, P: Palette): string | null {
  if (theme === "dark") return "rgba(214,222,234,0.32)";
  return P.wool ? "#8a8170" : null;
}

/** The name as a screen reader hears it: no control or direction characters, no more than 60. */
export function spokenName(name: string): string {
  return String(name ?? "")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 60);
}

/**
 * The one-sentence accessible name of a card: who, the rating (or that there is none yet, and how
 * many journées are counted), the tier, the season, the serial, the founder line, the four ratings.
 */
export function cardLabel(profile: CardProfile, s: CardStrings): string {
  const p = cleanProfile(profile);
  const parts: string[] = [spokenName(p.name) || s.a11y.cardOf];
  if (p.ovr == null) {
    parts.push(s.a11y.noRating);
    if (p.minRated) parts.push(s.a11y.counted(p.counted ?? 0, p.minRated));
  } else parts.push(`${p.ovr} ${s.ovr}`);
  if (p.tier) parts.push(s.tiers[p.tier]);
  if (p.season) parts.push(p.season);
  if (p.serial) parts.push(s.serial(p.serial));
  if (p.founder) parts.push(s.founderLine);
  if (p.sample) parts.push(s.sample);
  const ratings = STAT_CODES.filter((k) => p.stats[k] != null).map(
    (k) => `${s.stats[k]} ${p.stats[k]}`,
  );
  if (ratings.length) parts.push(ratings.join(s.a11y.separator));
  return parts.join(s.a11y.separator);
}

/** A label ready for an attribute. */
export const labelAttr = (p: CardProfile, s: CardStrings): string => esc(cardLabel(p, s));
