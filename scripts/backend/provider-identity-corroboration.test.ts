import { describe, expect, test } from "bun:test";
import {
  requestsNeeded,
  runCorroboration,
  type FetchProvider,
  type PairInput,
} from "./provider-identity-corroboration";

const NOW = new Date("2026-10-03T00:00:00Z");
// SYNTHETIC: 1995-06-15 as unix seconds.
const DOB = 803_174_400;

const pairs: PairInput[] = [
  { m: "100", s: "1", f: "fa" },
  { m: "100", s: "2", f: "fb" },
  { m: "200", s: "3", f: "fa" },
];

const fake =
  (flashDob: Record<string, string | undefined>, calls: string[]): FetchProvider =>
  async (provider, path) => {
    calls.push(`${provider}:${path}`);
    if (provider === "sofascore") {
      return {
        status: 200,
        body: {
          home: {
            players: [
              { player: { id: 1, dateOfBirthTimestamp: DOB } },
              { player: { id: 3, dateOfBirthTimestamp: DOB } },
            ],
          },
          away: { players: [{ player: { id: 2, dateOfBirthTimestamp: DOB } }] },
        },
      };
    }
    const id = /player_id=([^&]+)/.exec(path)?.[1] ?? "";
    return { status: 200, body: { DATA: { ID: id, BIRTHDAY_TIME: flashDob[id] } } };
  };

describe("SYNTHETIC: corroboration collector", () => {
  test("each match and each Flashscore player is fetched once and reused", async () => {
    const calls: string[] = [];
    const report = await runCorroboration({
      pairs,
      now: NOW,
      fetchProvider: fake({ fa: "1995-06-15", fb: "1990-01-02" }, calls),
    });
    expect(requestsNeeded(pairs)).toEqual({ sofascore: 2, flashscore: 2 });
    expect(calls).toHaveLength(4);
    expect(report.requests).toEqual({ sofascore: 2, flashscore: 2 });
    expect(report.results.map((r) => r.dob)).toEqual(["AGREE", "DISAGREE", "AGREE"]);
    expect(report.summary).toEqual({ AGREE: 2, DISAGREE: 1 });
  });

  test("the cap is checked before the first request", async () => {
    const calls: string[] = [];
    await expect(
      runCorroboration({ pairs, now: NOW, maxRequests: 3, fetchProvider: fake({}, calls) }),
    ).rejects.toThrow("Refused");
    expect(calls).toEqual([]);
  });

  test("a failed request is recorded, not retried, and its pairs are NOT_FETCHED", async () => {
    const calls: string[] = [];
    const base = fake({ fa: "1995-06-15", fb: "1995-06-15" }, calls);
    const report = await runCorroboration({
      pairs,
      now: NOW,
      fetchProvider: async (provider, path) =>
        path.includes("player_id=fb") ? { status: 429, body: null } : base(provider, path),
    });
    expect(calls.filter((c) => c.includes("player_id=fb"))).toHaveLength(0);
    expect(report.failed).toEqual([{ provider: "flashscore", id: "fb", status: 429 }]);
    expect(report.results.map((r) => r.dob)).toEqual(["AGREE", "NOT_FETCHED", "AGREE"]);
  });

  test("the printed report carries no date, timestamp or name", async () => {
    const report = await runCorroboration({
      pairs,
      now: NOW,
      fetchProvider: fake({ fa: "1995-06-15", fb: "1995-06-15" }, []),
    });
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/1995|803174400|06-15/);
  });
});
