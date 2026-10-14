// When the database calls football-live-refresh for the live job, and how often.
//
// The decision is made in SQL by app_private.football_live_refresh_tick()
// (migration 20261013110000), because pg_cron is what calls the function. This
// file is the same decision as a pure function so it can be read and tested in
// one place; football-live-cadence.test.ts also checks that the SQL lists the
// same statuses and windows, so the two cannot drift apart unnoticed.
//
// Cadence, first match wins:
//   60 s    a current-season fixture is in play: first half, half-time, second
//           half, extra time, penalties.
//   120 s   a fixture is delayed or suspended (kicked off within the last 24 h),
//           or kickoff has passed without the feed saying so (last 3 h): the
//           start is caught within two minutes.
//   300 s   a fixture kicks off within 10 minutes.
//   1800 s  a fixture was finalized within the last 2 hours (post-match refresh
//           of events, lineups and statistics, unchanged).
//   null    idle: nothing is called.
// Stop: a fixture leaves the 60 s class when its status becomes `finished` (or
// any other non-play status). The post-final 1800 s refresh then takes over.

export const LIVE_PLAY_STATUSES: readonly string[] = [
  "live_first_half",
  "half_time",
  "live_second_half",
  "extra_time",
  "penalties",
];
export const LIVE_INTERRUPTED_STATUSES: readonly string[] = ["delayed", "suspended"];
export const LIVE_NOT_STARTED_STATUSES: readonly string[] = ["scheduled", "not_started"];

export const LIVE_CADENCE_IN_PLAY_SECONDS = 60;
export const LIVE_CADENCE_UNCERTAIN_SECONDS = 120;
export const LIVE_CADENCE_PRE_KICKOFF_SECONDS = 300;
export const LIVE_CADENCE_POST_FINAL_SECONDS = 1800;
/** pg_cron can start a tick a few seconds late; this keeps 60 s from slipping to 120 s. */
export const LIVE_CADENCE_SLACK_SECONDS = 20;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export interface LiveCadenceFixture {
  readonly status: string;
  readonly kickoffAt: Date;
  readonly finalizedAt: Date | null;
  /** app_private.fantasy_kickoff_confirmed(kickoff_at): the kickoff time is real. */
  readonly kickoffConfirmed: boolean;
  /** The fixture's season is the current one. */
  readonly currentSeason: boolean;
}

export function liveRefreshCadenceSeconds(
  fixtures: readonly LiveCadenceFixture[],
  now: Date,
): number | null {
  const at = now.getTime();
  const current = fixtures.filter((f) => f.currentSeason);
  const confirmed = current.filter((f) => f.kickoffConfirmed);
  const kickoff = (f: LiveCadenceFixture) => f.kickoffAt.getTime();

  const inPlay = confirmed.some(
    (f) =>
      LIVE_PLAY_STATUSES.includes(f.status) &&
      kickoff(f) >= at - 24 * HOUR_MS &&
      kickoff(f) <= at + 10 * MINUTE_MS,
  );
  if (inPlay) return LIVE_CADENCE_IN_PLAY_SECONDS;

  const uncertain = confirmed.some(
    (f) =>
      (LIVE_INTERRUPTED_STATUSES.includes(f.status) &&
        kickoff(f) >= at - 24 * HOUR_MS &&
        kickoff(f) <= at + 10 * MINUTE_MS) ||
      (LIVE_NOT_STARTED_STATUSES.includes(f.status) &&
        kickoff(f) >= at - 3 * HOUR_MS &&
        kickoff(f) <= at),
  );
  if (uncertain) return LIVE_CADENCE_UNCERTAIN_SECONDS;

  const soon = confirmed.some(
    (f) =>
      LIVE_NOT_STARTED_STATUSES.includes(f.status) &&
      kickoff(f) > at &&
      kickoff(f) <= at + 10 * MINUTE_MS,
  );
  if (soon) return LIVE_CADENCE_PRE_KICKOFF_SECONDS;

  const justFinal = current.some(
    (f) =>
      f.status === "finished" &&
      f.finalizedAt !== null &&
      f.finalizedAt.getTime() >= at - 2 * HOUR_MS,
  );
  if (justFinal) return LIVE_CADENCE_POST_FINAL_SECONDS;

  return null;
}

/** Whether the tick should call the function now, given the cadence and the last call. */
export function shouldInvokeLiveRefresh(
  cadenceSeconds: number | null,
  lastInvokedAt: Date | null,
  now: Date,
): "idle" | "waiting" | "invoke" {
  if (cadenceSeconds === null) return "idle";
  if (
    lastInvokedAt !== null &&
    lastInvokedAt.getTime() > now.getTime() - (cadenceSeconds - LIVE_CADENCE_SLACK_SECONDS) * 1000
  ) {
    return "waiting";
  }
  return "invoke";
}
