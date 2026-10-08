/**
 * What every drawing starts from: the profile cleaned to what the object can show (a number is an
 * integer from 1 to 99 or a dash, a serial is digits, a tier is one of the five), the strings of
 * the interface language, the yarns, and the one sentence a screen reader hears.
 */
import { cardLabel } from "../copy";
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
    // a name is 24 characters on the scarf; the label may carry a few more, never a page of them
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
 * The one-sentence accessible name of a card: `cardLabel` of `../copy.ts` (« Carte de manager,
 * Ali, 84 OVR, PRO, Raja CA, Fondateur 2026, BOT #482913 ») on the profile as the object can show
 * it, so what is spoken is what is drawn: a number that is out of range reads as « pas encore de
 * note », as it is drawn as a dash.
 */
export function label(profile: CardProfile, s: CardStrings): string {
  return cardLabel(cleanProfile(profile), s);
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

/** The root's aria-label, ready for an attribute. */
export const labelAttr = (p: CardProfile, s: CardStrings): string =>
  esc(stripControls(label(p, s)));
