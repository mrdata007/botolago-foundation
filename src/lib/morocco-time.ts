/**
 * Morocco's clock, owned by the application.
 *
 * Why this exists. From 2026-09-20 Morocco keeps UTC+0 all year (decree
 * n° 2.26.530, Bulletin officiel n° 7521 of 29 June 2026; IANA tz 2026c).
 * Before that it kept UTC+1, dropping to UTC+0 for Ramadan (tz 2026a and
 * earlier). Node 22.23.3 ships tz 2026c; Node 22.23.2 and Chromium 149 still
 * carry 2026a. Anything that asks `Intl` for `Africa/Casablanca` therefore
 * answers differently on the server and in the browser for every instant on or
 * after the change: the server's HTML says 16:00 and the browser says 17:00,
 * React reports "Hydration failed", and a lock time or kickoff is shown an hour
 * apart depending on who rendered it.
 *
 * The rule here is the same on every runtime, whatever time-zone data it
 * carries: instants on or after `MOROCCO_PERMANENT_UTC_FROM_MS` are UTC+0 and
 * earlier ones are asked of `Intl`, where every release agrees (the data
 * differ only after the change). The formatters shift the instant by that
 * offset and let `Intl` format it in plain UTC, so no runtime's own
 * `Africa/Casablanca` data is ever read for a result the user sees.
 *
 * If Morocco changes its clock again, this file is the one place to change; the
 * parity test (`tests/timezone-parity`) fails when the rule disagrees with a
 * runtime that has newer data.
 */

export const MOROCCO_TIME_ZONE = "Africa/Casablanca";

/** 2026-09-20T01:00:00Z: Morocco is UTC+0 from this instant, with no later change. */
export const MOROCCO_PERMANENT_UTC_FROM_MS = Date.UTC(2026, 8, 20, 1, 0, 0);

let legacyParts: Intl.DateTimeFormat | null = null;

/**
 * The offset `Intl` reports for instants before the change. Reading it is safe
 * only because every tz release since 2018 agrees for those instants.
 */
function legacyOffsetMs(instantMs: number): number {
  legacyParts ??= new Intl.DateTimeFormat("en-US", {
    timeZone: MOROCCO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, number> = {};
  for (const part of legacyParts.formatToParts(new Date(instantMs))) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  const asIfUtc = Date.UTC(
    out.year ?? 1970,
    (out.month ?? 1) - 1,
    out.day ?? 1,
    out.hour ?? 0,
    out.minute ?? 0,
    out.second ?? 0,
  );
  // The parts carry no sub-second precision; drop it so the difference is exactly the offset.
  return asIfUtc - Math.floor(instantMs / 1000) * 1000;
}

/** Morocco's offset from UTC, in milliseconds, in effect at `instantMs`. */
export function moroccoOffsetMs(instantMs: number): number {
  return instantMs >= MOROCCO_PERMANENT_UTC_FROM_MS ? 0 : legacyOffsetMs(instantMs);
}

export interface MoroccoParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock fields Morocco shows at `instant`. */
export function moroccoParts(instant: Date): MoroccoParts {
  const ms = instant.getTime();
  const wall = new Date(ms + moroccoOffsetMs(ms));
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    second: wall.getUTCSeconds(),
  };
}

/**
 * The instant at which Morocco's wall clock reads the given fields. Two
 * correction passes settle the ordinary case and the day the offset changes.
 */
export function moroccoWallToInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = wallAsUtc;
  for (let i = 0; i < 2; i += 1) instant = wallAsUtc - moroccoOffsetMs(instant);
  return new Date(instant);
}

export type MoroccoFormatOptions = Omit<Intl.DateTimeFormatOptions, "timeZone" | "timeZoneName">;

/**
 * A drop-in for `new Intl.DateTimeFormat(locales, { timeZone: "Africa/Casablanca", ...options })`
 * that does not depend on the runtime's `Africa/Casablanca` data. `format` and
 * `formatToParts` accept a `Date` or a number, like the original.
 *
 * `timeZone` and `timeZoneName` are refused: the first is the point of this
 * class, and the second would print "UTC".
 */
export class MoroccoDateTimeFormat {
  private readonly inner: Intl.DateTimeFormat;

  constructor(locales?: Intl.LocalesArgument, options: MoroccoFormatOptions = {}) {
    const asked = options as Intl.DateTimeFormatOptions;
    if (asked.timeZone !== undefined || asked.timeZoneName !== undefined) {
      throw new TypeError("MoroccoDateTimeFormat does not take timeZone or timeZoneName.");
    }
    this.inner = new Intl.DateTimeFormat(locales, { ...options, timeZone: "UTC" });
  }

  format(date?: Date | number): string {
    return this.inner.format(shifted(date));
  }

  formatToParts(date?: Date | number): Intl.DateTimeFormatPart[] {
    return this.inner.formatToParts(shifted(date));
  }

  formatRange(start: Date | number, end: Date | number): string {
    return this.inner.formatRange(shifted(start) ?? start, shifted(end) ?? end);
  }
}

function shifted(date: Date | number | undefined): Date | number | undefined {
  if (date === undefined) {
    const now = Date.now();
    return now + moroccoOffsetMs(now);
  }
  const ms = typeof date === "number" ? date : date.getTime();
  // An invalid date is passed through so `Intl` raises the same RangeError it always did.
  return Number.isFinite(ms) ? ms + moroccoOffsetMs(ms) : date;
}

export function moroccoDateTimeFormat(
  locales?: Intl.LocalesArgument,
  options: MoroccoFormatOptions = {},
): MoroccoDateTimeFormat {
  return new MoroccoDateTimeFormat(locales, options);
}
