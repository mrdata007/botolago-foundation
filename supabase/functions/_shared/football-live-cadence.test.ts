import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LIVE_CADENCE_IN_PLAY_SECONDS,
  LIVE_CADENCE_POST_FINAL_SECONDS,
  LIVE_CADENCE_PRE_KICKOFF_SECONDS,
  LIVE_CADENCE_UNCERTAIN_SECONDS,
  LIVE_INTERRUPTED_STATUSES,
  LIVE_NOT_STARTED_STATUSES,
  LIVE_PLAY_STATUSES,
  liveRefreshCadenceSeconds,
  shouldInvokeLiveRefresh,
  type LiveCadenceFixture,
} from "./football-live-cadence.ts";

const NOW = new Date("2026-10-17T19:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

function fixture(overrides: Partial<LiveCadenceFixture> = {}): LiveCadenceFixture {
  return {
    status: "scheduled",
    kickoffAt: minutes(600),
    finalizedAt: null,
    kickoffConfirmed: true,
    currentSeason: true,
    ...overrides,
  };
}

describe("liveRefreshCadenceSeconds", () => {
  test("idle with no fixtures or nothing near", () => {
    expect(liveRefreshCadenceSeconds([], NOW)).toBeNull();
    expect(liveRefreshCadenceSeconds([fixture()], NOW)).toBeNull();
  });

  test("60 s for every in-play status, half-time, extra time and penalties included", () => {
    for (const status of [
      "live_first_half",
      "half_time",
      "live_second_half",
      "extra_time",
      "penalties",
    ]) {
      expect(liveRefreshCadenceSeconds([fixture({ status, kickoffAt: minutes(-50) })], NOW)).toBe(
        LIVE_CADENCE_IN_PLAY_SECONDS,
      );
    }
    expect(LIVE_CADENCE_IN_PLAY_SECONDS).toBe(60);
  });

  test("in play beats every slower class", () => {
    const cadence = liveRefreshCadenceSeconds(
      [
        fixture({ status: "scheduled", kickoffAt: minutes(5) }),
        fixture({ status: "finished", kickoffAt: minutes(-200), finalizedAt: minutes(-30) }),
        fixture({ status: "half_time", kickoffAt: minutes(-60) }),
      ],
      NOW,
    );
    expect(cadence).toBe(60);
  });

  test("stops at full time: finished falls back to the post-final cadence, then idle", () => {
    const finished = (finalizedMinutesAgo: number) =>
      fixture({
        status: "finished",
        kickoffAt: minutes(-150),
        finalizedAt: minutes(-finalizedMinutesAgo),
      });
    expect(liveRefreshCadenceSeconds([finished(1)], NOW)).toBe(LIVE_CADENCE_POST_FINAL_SECONDS);
    expect(liveRefreshCadenceSeconds([finished(119)], NOW)).toBe(LIVE_CADENCE_POST_FINAL_SECONDS);
    expect(liveRefreshCadenceSeconds([finished(121)], NOW)).toBeNull();
    expect(
      liveRefreshCadenceSeconds(
        [fixture({ status: "finished", kickoffAt: minutes(-150), finalizedAt: null })],
        NOW,
      ),
    ).toBeNull();
  });

  test("a fixture the provider never closes stops after 24 hours", () => {
    expect(
      liveRefreshCadenceSeconds(
        [fixture({ status: "live_second_half", kickoffAt: minutes(-24 * 60 + 1) })],
        NOW,
      ),
    ).toBe(60);
    expect(
      liveRefreshCadenceSeconds(
        [fixture({ status: "live_second_half", kickoffAt: minutes(-24 * 60 - 1) })],
        NOW,
      ),
    ).toBeNull();
  });

  test("outside the current season, or without a confirmed kickoff, never starts polling", () => {
    expect(
      liveRefreshCadenceSeconds(
        [fixture({ status: "live_first_half", kickoffAt: minutes(-30), currentSeason: false })],
        NOW,
      ),
    ).toBeNull();
    expect(
      liveRefreshCadenceSeconds(
        [fixture({ status: "live_first_half", kickoffAt: minutes(-30), kickoffConfirmed: false })],
        NOW,
      ),
    ).toBeNull();
  });

  test("postponed, cancelled and abandoned fixtures are not polled", () => {
    for (const status of ["postponed", "cancelled", "abandoned"]) {
      expect(
        liveRefreshCadenceSeconds([fixture({ status, kickoffAt: minutes(-30) })], NOW),
      ).toBeNull();
    }
  });

  test("delayed, suspended, or past kickoff without a status: every 2 minutes", () => {
    for (const status of ["delayed", "suspended"]) {
      expect(liveRefreshCadenceSeconds([fixture({ status, kickoffAt: minutes(-20) })], NOW)).toBe(
        LIVE_CADENCE_UNCERTAIN_SECONDS,
      );
    }
    for (const status of ["scheduled", "not_started"]) {
      expect(liveRefreshCadenceSeconds([fixture({ status, kickoffAt: minutes(-2) })], NOW)).toBe(
        120,
      );
      expect(
        liveRefreshCadenceSeconds([fixture({ status, kickoffAt: minutes(-181) })], NOW),
      ).toBeNull();
    }
  });

  test("a kickoff within ten minutes: every 5 minutes", () => {
    expect(liveRefreshCadenceSeconds([fixture({ kickoffAt: minutes(6) })], NOW)).toBe(
      LIVE_CADENCE_PRE_KICKOFF_SECONDS,
    );
    expect(liveRefreshCadenceSeconds([fixture({ kickoffAt: minutes(11) })], NOW)).toBeNull();
  });
});

describe("shouldInvokeLiveRefresh", () => {
  test("idle when there is no cadence", () => {
    expect(shouldInvokeLiveRefresh(null, null, NOW)).toBe("idle");
    expect(shouldInvokeLiveRefresh(null, minutes(-1), NOW)).toBe("idle");
  });

  test("a 60 s cadence calls on every minute tick, a late pg_cron start included", () => {
    const secondsAgo = (n: number) => new Date(NOW.getTime() - n * 1000);
    expect(shouldInvokeLiveRefresh(60, null, NOW)).toBe("invoke");
    expect(shouldInvokeLiveRefresh(60, secondsAgo(30), NOW)).toBe("waiting");
    expect(shouldInvokeLiveRefresh(60, secondsAgo(41), NOW)).toBe("invoke");
    expect(shouldInvokeLiveRefresh(60, secondsAgo(58), NOW)).toBe("invoke");
  });

  test("slower cadences keep their own pace", () => {
    const secondsAgo = (n: number) => new Date(NOW.getTime() - n * 1000);
    expect(shouldInvokeLiveRefresh(120, secondsAgo(90), NOW)).toBe("waiting");
    expect(shouldInvokeLiveRefresh(120, secondsAgo(105), NOW)).toBe("invoke");
    expect(shouldInvokeLiveRefresh(300, secondsAgo(180), NOW)).toBe("waiting");
  });
});

describe("the SQL tick says the same thing", () => {
  const sql = readFileSync(
    join(import.meta.dir, "../../migrations/20261013110100_football_live_refresh_60s.sql"),
    "utf8",
  );
  const listOf = (statuses: readonly string[]) => statuses.map((s) => `'${s}'`).join(", ");

  test("same in-play, interrupted and not-started statuses", () => {
    const flat = sql.replace(/\s+/g, " ");
    expect(flat).toContain(`fixture.status in (${listOf(LIVE_PLAY_STATUSES)})`);
    expect(flat).toContain(`fixture.status in (${listOf(LIVE_INTERRUPTED_STATUSES)})`);
    expect(flat).toContain(`fixture.status in (${listOf(LIVE_NOT_STARTED_STATUSES)})`);
  });

  test("same cadences and windows", () => {
    expect(sql).toContain(`interval '${LIVE_CADENCE_IN_PLAY_SECONDS} seconds'`);
    expect(sql).toContain("interval '2 minutes'");
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("now_at - interval '24 hours' and now_at + interval '10 minutes'");
    expect(sql).toContain("now_at - interval '3 hours' and now_at");
    expect(sql).toContain("fixture.finalized_at >= now_at - interval '2 hours'");
    expect(sql).toContain("+ interval '20 seconds'");
  });
});
