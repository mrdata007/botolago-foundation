/**
 * How long ago a live match's data was written, for the freshness line
 * ("Mis à jour il y a 2 min").
 *
 * The age is measured from the fixture's stored update time
 * (`Match.dataUpdatedAt`), not from the moment this device last asked: a read
 * that merely fetched an old row again is not an update. Without a stored time
 * (a source that gives none) the time of the last read stands in. A time in the
 * future (a device clock behind the server's) counts as now.
 */

/** Under this many seconds the line says "à l'instant" rather than "il y a 0 min". */
const JUST_NOW_MS = 60_000;

export type LiveAge = { unit: "now" } | { unit: "minute" | "hour"; value: number };

export function liveAge(
  match: { dataUpdatedAt?: string } | undefined,
  readAt: number,
  now: number,
): LiveAge | null {
  const stored = match?.dataUpdatedAt === undefined ? NaN : Date.parse(match.dataUpdatedAt);
  const at = Number.isFinite(stored) ? stored : readAt > 0 ? readAt : NaN;
  if (!Number.isFinite(at)) return null;
  const elapsed = Math.max(0, now - at);
  if (elapsed < JUST_NOW_MS) return { unit: "now" };
  const minutes = Math.floor(elapsed / 60_000);
  return minutes < 60
    ? { unit: "minute", value: minutes }
    : { unit: "hour", value: Math.floor(minutes / 60) };
}

/** "il y a 2 min" / "قبل دقيقتين", in the reader's language. */
export function formatLiveAge(age: Extract<LiveAge, { value: number }>, lang: "fr" | "ar"): string {
  return new Intl.RelativeTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    numeric: "always",
    style: "short",
  }).format(-age.value, age.unit);
}
