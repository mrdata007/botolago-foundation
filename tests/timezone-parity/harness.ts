/**
 * Everything the app prints from Morocco's clock, for a fixed list of instants.
 *
 * This file is bundled once and run in several runtimes that carry different
 * time-zone data (see run.ts). The app's output must be identical in all of
 * them: that is what keeps the server's HTML and the browser's first render
 * the same. The `meta` block (what each runtime's own `Intl` says) is allowed
 * to differ, and is there to show that the runtimes really do disagree.
 */
import { formatDeadline } from "../../src/components/fpl/deadline";
import {
  formatDayHeading,
  formatKickoffTime,
  formatLockMoment,
  matchDay,
} from "../../src/components/predictions/predictions-copy";
import {
  casablancaLocalToIso,
  isoToCasablancaLocal,
} from "../../src/components/pepites/admin/admin-format";
import { isWithinQuietHours } from "../../src/backend/notifications/quiet-hours";
import {
  addMatchDays,
  isSameMatchDay,
  matchDayFromKey,
  matchDayKey,
  matchZoneHour,
  startOfMatchDay,
} from "../../src/lib/match-kickoff";
import { moroccoDateTimeFormat } from "../../src/lib/morocco-time";
import { formatDay, formatTime } from "../../supabase/functions/_shared/notification-email-render";

export const INSTANTS = [
  "2026-01-15T12:00:00Z",
  "2026-02-14T23:30:00Z", // the evening before Ramadan 2026
  "2026-02-15T00:30:00Z",
  "2026-03-21T23:30:00Z", // the end of Ramadan 2026
  "2026-03-22T00:30:00Z",
  "2026-09-12T22:59:00Z",
  "2026-09-12T23:00:00Z",
  "2026-09-19T12:00:00Z",
  "2026-09-20T00:59:00Z", // the last minute of UTC+1
  "2026-09-20T01:00:00Z", // the change to UTC+0
  "2026-09-20T01:30:00Z",
  "2026-09-25T23:30:00Z",
  "2026-09-26T00:30:00Z",
  "2026-10-02T16:00:00Z", // the case the staging database got wrong
  "2026-10-02T23:59:00Z",
  "2026-10-03T00:00:00Z",
  "2026-12-31T23:30:00Z",
  "2027-02-10T12:00:00Z", // Ramadan 2027: no longer a different offset
  "2027-03-15T20:00:00Z",
  "2027-07-01T19:00:00Z",
  "2028-01-15T12:00:00Z",
  "2030-06-01T12:00:00Z",
];

function one(iso: string) {
  const date = new Date(iso);
  const local = isoToCasablancaLocal(iso);
  return {
    kickoffFr: formatKickoffTime(iso, "fr"),
    kickoffAr: formatKickoffTime(iso, "ar"),
    lockFr: formatLockMoment(iso, "fr"),
    dayHeadingFr: formatDayHeading(iso, "fr"),
    dayHeadingAr: formatDayHeading(iso, "ar"),
    matchDay: matchDay(iso),
    deadlineFr: formatDeadline(iso, "fr", { weekday: "short" }),
    deadlineAr: formatDeadline(iso, "ar"),
    dayKey: matchDayKey(date),
    zoneHour: matchZoneHour(date),
    startOfDay: startOfMatchDay(date).toISOString(),
    nextDay: addMatchDays(date, 1).toISOString(),
    previousDay: addMatchDays(date, -1).toISOString(),
    sameDayAsKey: isSameMatchDay(date, matchDayFromKey(matchDayKey(date))),
    adminLocal: local,
    adminBack: casablancaLocalToIso(local),
    emailTimeFr: formatTime(date, "fr", "Africa/Casablanca"),
    emailTimeAr: formatTime(date, "ar", "Africa/Casablanca"),
    emailDayFr: formatDay(date, "fr", "Africa/Casablanca"),
    generic: moroccoDateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
    quietNight: isWithinQuietHours(date, {
      enabled: true,
      start: "22:00",
      end: "07:00",
      timezone: "Africa/Casablanca",
    }),
  };
}

export function run() {
  const results: Record<string, ReturnType<typeof one>> = {};
  for (const iso of INSTANTS) results[iso] = one(iso);
  // What this runtime's own Intl says, which is allowed to differ.
  const raw = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Casablanca",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date("2026-10-02T16:00:00Z"));
  const meta = {
    runtimeIntlSays16hZAs: raw,
    tzData:
      (globalThis as { process?: { versions?: { tz?: string } } }).process?.versions?.tz ?? null,
  };
  return { meta, results };
}

const output = run();
(globalThis as { __PARITY__?: unknown }).__PARITY__ = output;
const proc = (globalThis as { process?: { stdout?: { write(text: string): void } } }).process;
if (proc?.stdout) proc.stdout.write(JSON.stringify(output));
