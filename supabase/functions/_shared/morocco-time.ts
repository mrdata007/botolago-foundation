// Morocco's clock for the email renderer. A copy of the rule in
// src/lib/morocco-time.ts (the edge runtime cannot import from src/); a test
// in src/lib/morocco-time.test.ts fails if the two ever disagree.
//
// From 2026-09-20T01:00:00Z Morocco is UTC+0 all year (decree n° 2.26.530,
// BO n° 7521; IANA tz 2026c). Runtimes carrying older time-zone data say
// UTC+1, so asking `Intl` for Africa/Casablanca gives an hour that depends on
// the runtime. Earlier instants are asked of `Intl`, where every release agrees.

export const MOROCCO_TIME_ZONE = "Africa/Casablanca";
export const MOROCCO_PERMANENT_UTC_FROM_MS = Date.UTC(2026, 8, 20, 1, 0, 0);

let legacyParts: Intl.DateTimeFormat | null = null;

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
  return asIfUtc - Math.floor(instantMs / 1000) * 1000;
}

export function moroccoOffsetMs(instantMs: number): number {
  return instantMs >= MOROCCO_PERMANENT_UTC_FROM_MS ? 0 : legacyOffsetMs(instantMs);
}

/**
 * The instant to hand `Intl` together with `timeZone: "UTC"` so that it prints
 * Morocco's wall clock. An invalid date is returned unchanged.
 */
export function shiftToMorocco(instant: Date): Date {
  const ms = instant.getTime();
  return Number.isFinite(ms) ? new Date(ms + moroccoOffsetMs(ms)) : instant;
}
