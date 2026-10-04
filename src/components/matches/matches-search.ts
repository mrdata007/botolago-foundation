import type { FootballSeason } from "@/services/football";

/**
 * The season the Matches tabs are showing, carried in the URL
 * (`?season=<id>`) so switching between Calendrier and Classement keeps it:
 * each tab is its own page, and each would otherwise open on the current
 * season. Only a past season travels — the current one is each tab's
 * default, so its links stay clean. An id no season has is ignored by the
 * page and it opens on the current season.
 */
export interface MatchesSearch {
  readonly season?: string;
}

export function validateMatchesSearch(search: Record<string, unknown>): MatchesSearch {
  return typeof search.season === "string" && search.season ? { season: search.season } : {};
}

/** The search a tab change carries: the season shown, unless it is the current one. */
export function seasonSearch(
  season: Pick<FootballSeason, "id" | "isCurrent"> | undefined,
): MatchesSearch {
  return season && !season.isCurrent ? { season: season.id } : {};
}

/** The status chips the calendar can open on; "all" is the default and stays out of the URL. */
export const CALENDAR_STATUSES = ["live", "upcoming", "finished"] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

/**
 * What the calendar (`/matches`) keeps in its URL: the season, plus the day
 * the reader picked (`?date=2026-09-27`) and the status chip (`?status=finished`).
 * A match opened from the list is a new history entry, so Retour lands on this
 * URL again; with the day and the chip in it, the list comes back as it was
 * left instead of reopening on today. A shared link opens on the same day.
 */
export interface CalendarSearch extends MatchesSearch {
  readonly date?: string;
  readonly status?: CalendarStatus;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day as a `YYYY-MM-DD` key: "2026-02-31" is not one. */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = DAY_KEY.exec(value);
  if (!parts) return false;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function validateCalendarSearch(search: Record<string, unknown>): CalendarSearch {
  const status = CALENDAR_STATUSES.find((candidate) => candidate === search.status);
  return {
    ...validateMatchesSearch(search),
    ...(isDayKey(search.date) ? { date: search.date } : {}),
    ...(status ? { status } : {}),
  };
}
