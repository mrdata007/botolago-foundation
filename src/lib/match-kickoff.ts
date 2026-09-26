import type { Match } from "@/types/domain";

export const MATCH_TIME_ZONE = "Africa/Casablanca";

/**
 * A postponed or cancelled match has no confirmed DATE, not merely an
 * unconfirmed hour.
 *
 * Deliberately a separate predicate from `isKickoffTimeUnconfirmed`. That one
 * answers "is the clock time a placeholder?" and returns false for anything
 * that is not `scheduled` — so a postponed fixture fell straight through to
 * the formatted timestamp. On production that rendered FAR Rabat v Raja as
 *
 *   REPORTÉ · Ce match a été reporté. Nouvelle date à confirmer.
 *   COUP D'ENVOI  jeudi 24 septembre · 01:00
 *
 * where 01:00 is midnight UTC — the provider's placeholder — presented as a
 * kickoff a reader could plan around, contradicting the notice two lines
 * above it.
 *
 * Widening the time predicate would not have been enough: for these matches
 * the DAY is unknown too, so the whole date/time slot is replaced rather than
 * just its hour.
 *
 * Status alone cannot answer the question, which is why `dateUnconfirmed`
 * exists and wins wherever it is set. Four provider statuses collapse into
 * the domain `postponed` -- postponed, cancelled, suspended, abandoned -- and
 * a suspended or abandoned fixture already kicked off at the stored instant.
 * Going by status alone would erase a real historical date and offer "Date à
 * confirmer" for a match that has already been played.
 */
export function isKickoffDateUnconfirmed(
  match: Pick<Match, "status" | "dateUnconfirmed">,
): boolean {
  if (match.dateUnconfirmed !== undefined) return match.dateUnconfirmed;
  // The fallback, for fixtures built without provider context (the mocks).
  // The domain MatchStatus has no "cancelled" -- that is a presentation-only
  // upgrade MatchCard layers on top via ExtendedStatus, so the card ORs it in
  // rather than this predicate widening a type it does not own.
  return match.status === "postponed";
}

/**
 * The current provider calendar uses UTC midnight for dates without a verified
 * kickoff hour. Until the public DTO carries confirmation metadata, show these
 * scheduled dates without presenting the placeholder hour as confirmed.
 * This is presentation only; fixture timestamps and Fantasy deadlines stay intact.
 */
export function isKickoffTimeUnconfirmed(match: Pick<Match, "kickoff" | "status">): boolean {
  if (match.status !== "scheduled") return false;
  const kickoff = new Date(match.kickoff);
  return (
    Number.isFinite(kickoff.getTime()) &&
    kickoff.getUTCHours() === 0 &&
    kickoff.getUTCMinutes() === 0 &&
    kickoff.getUTCSeconds() === 0 &&
    kickoff.getUTCMilliseconds() === 0
  );
}

/* ------------------------------------------------------------------ */
/* Competition calendar days (BG-0100)                                 */
/* ------------------------------------------------------------------ */

/**
 * Match days belong to the competition, not to the viewer.
 *
 * A kickoff is a single instant, but "which day is this match on" is a
 * calendar question, and the only calendar the answer can sensibly come from
 * is the competition's own (`MATCH_TIME_ZONE`). Deriving it from the
 * browser's zone instead — `new Date(kickoff).getDate()` — files a 20:00
 * Casablanca kickoff under the previous day for a viewer in São Paulo and
 * under the next day for one in Sydney, while the match card beside it,
 * which pins the zone when it formats the time, keeps saying otherwise. One
 * page, two answers.
 *
 * Everything below reads and writes the competition calendar, so the day a
 * strip highlights, the day a request asks the backend for, the day a match
 * is filtered into and the day a heading names are all the same day for
 * every viewer on earth.
 */

const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: MATCH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zoneParts(instant: Date): ZoneParts {
  const out: Record<string, number> = {};
  for (const part of DAY_PARTS.formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out as unknown as ZoneParts;
}

/**
 * The competition-zone offset, in ms, in effect at `instant`.
 *
 * Morocco is not a fixed `+01:00`: the clock drops to `+00:00` for Ramadan
 * and back afterwards, so the offset has to be read at the instant in
 * question rather than hardcoded.
 */
function zoneOffsetMs(instant: Date): number {
  const p = zoneParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // `instant` carries sub-second precision the parts do not; drop it so the
  // difference is exactly the offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant of competition-zone midnight opening the given calendar day. */
function midnightOf(year: number, month: number, day: number): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day);
  // One correction pass resolves the ordinary case; a second settles the day
  // the offset itself changes, where the first guess can land on the wrong
  // side of the transition.
  let instant = new Date(wallAsUtc);
  for (let i = 0; i < 2; i += 1) instant = new Date(wallAsUtc - zoneOffsetMs(instant));
  return instant;
}

/** The competition calendar day a moment falls on, as `YYYY-MM-DD`. */
export function matchDayKey(value: Date): string {
  const p = zoneParts(value);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The competition-zone hour (0-23) a moment falls in. */
export function matchZoneHour(value: Date): number {
  return zoneParts(value).hour;
}

/** True when both moments fall on the same competition calendar day. */
export function isSameMatchDay(a: Date, b: Date): boolean {
  return matchDayKey(a) === matchDayKey(b);
}

/** Competition-zone midnight opening the day `value` falls on. */
export function startOfMatchDay(value: Date): Date {
  const p = zoneParts(value);
  return midnightOf(p.year, p.month, p.day);
}

/**
 * Competition-zone midnight `days` calendar days after the day `value` falls
 * on. Calendar arithmetic, not `+ 86_400_000` — across an offset change a day
 * is not 24 hours long.
 */
export function addMatchDays(value: Date, days: number): Date {
  const p = zoneParts(value);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return midnightOf(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Competition-zone midnight of a `YYYY-MM-DD` key. */
export function matchDayFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return midnightOf(year!, month!, day!);
}
