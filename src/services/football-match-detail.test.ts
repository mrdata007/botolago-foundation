import { afterEach, describe, expect, test } from "bun:test";
import { FootballError } from "@/backend/football/errors";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { MATCH_SECTIONS, footballService, toMatch } from "./football";

/**
 * Audit 2026-10-14, DATA-02: the score page was one all-or-nothing read. One
 * optional section (pressure, head to head ...) failing removed the valid score
 * and every healthy section with it. Now the header is always returned when it
 * could be read, and each section says on its own whether it loaded.
 */

const context = { actorId: null, requestId: "test" } as const;
const repository = MockFootballRepository.prototype;

// Each optional read, as the page makes it.
const READS = {
  headToHead: "getHeadToHead",
  timeline: "getTimeline",
  statistics: "getStatistics",
  lineups: "getLineups",
  pressure: "getPressure",
  absences: "getAbsences",
  header: "getMatchDetail",
} as const;

const stored = new Map<string, unknown>();
function failing(...names: (keyof typeof READS)[]) {
  for (const name of names) {
    const method = READS[name];
    if (!stored.has(method)) stored.set(method, (repository as never)[method]);
    (repository as never)[method] = async () => {
      throw new FootballError("data_unavailable", `${method} is down`);
    };
  }
}
afterEach(() => {
  for (const [method, original] of stored) (repository as never)[method] = original;
  stored.clear();
});

async function fixtureId() {
  const [fixture] = await new MockFootballRepository().getHomeMatches("fr", 1, context);
  return fixture!.id;
}

describe("the match page with a section down", () => {
  test("every section loaded: all report ok, none carries an error", async () => {
    const detail = await footballService.getMatchDetailPage(await fixtureId(), "fr");
    expect(Object.keys(detail.sections).sort()).toEqual([...MATCH_SECTIONS].sort());
    for (const section of MATCH_SECTIONS) {
      expect(detail.sections[section]).toEqual({ status: "ok", error: null });
    }
  });

  test("pressure down: the score, the teams and every other section still arrive", async () => {
    const id = await fixtureId();
    failing("pressure");
    const detail = await footballService.getMatchDetailPage(id, "fr");

    expect(detail.match.id).toBe(id);
    expect(detail.match.status).toBe("live");
    expect(detail.clubs.map((club) => club.id).sort()).toEqual(
      [detail.match.homeClubId, detail.match.awayClubId].sort(),
    );
    expect(detail.sections.pressure.status).toBe("failed");
    expect(detail.sections.pressure.error).toBe("data_unavailable");
    for (const section of MATCH_SECTIONS.filter((name) => name !== "pressure")) {
      expect(detail.sections[section]).toEqual({ status: "ok", error: null });
    }
    expect(detail.pressure).toHaveLength(0);
    expect(detail.live.elapsed).toBeGreaterThan(0);
  });

  test("head to head down: the match is the page, the meetings are marked failed", async () => {
    const id = await fixtureId();
    failing("headToHead");
    const detail = await footballService.getMatchDetailPage(id, "fr");

    expect(detail.match.id).toBe(id);
    expect(detail.clubs).toHaveLength(2);
    expect(detail.matches.map((match) => match.id)).toEqual([id]);
    expect(detail.sections.headToHead.status).toBe("failed");
    expect(detail.sections.timeline.status).toBe("ok");
    expect(detail.sections.statistics.status).toBe("ok");
  });

  test("every optional section down: the header alone is a page, each section says why it is empty", async () => {
    const id = await fixtureId();
    failing("headToHead", "timeline", "statistics", "lineups", "pressure", "absences");
    const detail = await footballService.getMatchDetailPage(id, "fr");

    expect(detail.match.id).toBe(id);
    for (const section of MATCH_SECTIONS) expect(detail.sections[section].status).toBe("failed");
  });

  test("a section the provider left empty is ok, not failed: no data is not an error", async () => {
    const detail = await footballService.getMatchDetailPage(await fixtureId(), "fr");
    // The mock provider publishes no lineups: it answered, with nothing.
    expect(detail.lineups).toHaveLength(0);
    expect(detail.sections.lineups).toEqual({ status: "ok", error: null });
  });

  test("an error that carries no code is reported as unknown, without its message", async () => {
    const id = await fixtureId();
    stored.set("getAbsences", repository.getAbsences);
    repository.getAbsences = async () => {
      throw new Error("connection string postgres://secret");
    };
    const detail = await footballService.getMatchDetailPage(id, "fr");
    expect(detail.sections.absences).toEqual({ status: "failed", error: "unknown" });
  });

  test("the header is the page: without it the read still fails", async () => {
    const id = await fixtureId();
    failing("header");
    await expect(footballService.getMatchDetailPage(id, "fr")).rejects.toThrow("getMatchDetail");
  });

  test("the sections are still asked for together, once each", async () => {
    const id = await fixtureId();
    const calls: string[] = [];
    for (const method of [
      "getHeadToHead",
      "getTimeline",
      "getStatistics",
      "getLineups",
      "getPressure",
      "getAbsences",
    ] as const) {
      const original = repository[method] as (...args: never[]) => Promise<unknown>;
      stored.set(method, original);
      (repository as never)[method] = function (this: unknown, ...args: never[]) {
        calls.push(method);
        return original.apply(this, args);
      };
    }
    await footballService.getMatchDetailPage(id, "fr");
    expect(calls.sort()).toEqual(
      [
        "getAbsences",
        "getHeadToHead",
        "getLineups",
        "getPressure",
        "getStatistics",
        "getTimeline",
      ].sort(),
    );
  });
});

describe("toMatch carries when the data last changed", () => {
  test("the later of the provider's change time and our row's last write", async () => {
    const [fixture] = await new MockFootballRepository().getHomeMatches("fr", 1, context);
    const dto = (provider: string, row: string) => ({
      ...fixture!,
      providerUpdatedAt: provider,
      updatedAt: row,
    });
    expect(toMatch(dto("2026-10-14T12:00:00Z", "2026-10-14T12:05:00Z")).dataUpdatedAt).toBe(
      "2026-10-14T12:05:00.000Z",
    );
    expect(toMatch(dto("2026-10-14T12:10:00Z", "2026-10-14T12:05:00Z")).dataUpdatedAt).toBe(
      "2026-10-14T12:10:00.000Z",
    );
  });

  test("an unreadable timestamp is left out, never replaced by now", async () => {
    const [fixture] = await new MockFootballRepository().getHomeMatches("fr", 1, context);
    const broken = { ...fixture!, providerUpdatedAt: "nope", updatedAt: "nope" };
    expect(toMatch(broken).dataUpdatedAt).toBeUndefined();
    const half = { ...fixture!, providerUpdatedAt: "nope", updatedAt: "2026-10-14T12:05:00Z" };
    expect(toMatch(half).dataUpdatedAt).toBe("2026-10-14T12:05:00.000Z");
  });
});
