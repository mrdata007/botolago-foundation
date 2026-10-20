import { expect, test } from "bun:test";
import captured from "./fixtures/native-participation-17256972.json";
import { buildApiRatingLineups, buildConfirmedApiRatingLineups } from "./fantasy-api-ratings.ts";
import { parseSofascoreLineups } from "./sofascore-performance-parse.ts";

const sample = () => structuredClone(captured);
const yahya = (r: ReturnType<typeof buildApiRatingLineups>) =>
  r.players.find((p) => p.externalId === "919712")!;

test("real confirmed lineup/timeline resolve only the unused metadata row, using distinct native IDs", () => {
  const before = buildApiRatingLineups(parseSofascoreLineups(captured.lineups));
  const after = buildConfirmedApiRatingLineups(captured.lineups, captured.incidents);
  expect(yahya(before).uncertain).toBe(true);
  expect(yahya(after)).toMatchObject({
    appeared: false,
    uncertain: false,
    minutes: null,
    rating: null,
  });
  expect(after.players.find((p) => p.externalId === "2265493")).toMatchObject({
    appeared: true,
    uncertain: false,
  });
  expect(
    after.players.map((p) => ({
      ...p,
      uncertain: before.players.find((b) => b.externalId === p.externalId)!.uncertain,
    })),
  ).toEqual(before.players);
  expect(after.missingRatingIds).toEqual(["1526456"]);
  expect(after.ready).toBe(false); // The six-minute appearance still needs the database's approved policy.
});

test("names cannot merge Yahya with Yassine", () => {
  const x = sample();
  for (const side of ["home", "away"] as const)
    for (const p of x.lineups[side].players) p.player.name = "Same display name";
  expect(yahya(buildConfirmedApiRatingLineups(x.lineups, x.incidents)).uncertain).toBe(false);
});

test.each([
  "missing FT",
  "unconfirmed",
  "missing substitution",
  "wrong entering ID",
  "wrong side",
  "missing participant minutes",
  "unknown stats",
  "unreadable incidents",
])("%s cannot certify an unused player", (scenario) => {
  const x = sample();
  if (scenario === "missing FT")
    x.incidents.incidents = x.incidents.incidents.filter((i) => i.incidentType !== "period");
  if (scenario === "unconfirmed") x.lineups.confirmed = false;
  if (scenario === "missing substitution")
    x.incidents.incidents = x.incidents.incidents.filter((i) => i.id !== 127082497);
  if (scenario === "wrong entering ID") {
    const i = x.incidents.incidents.find((i) => i.id === 127082497)!;
    i.playerIn = { id: 919712, name: "Yahya Jabrane" };
  }
  if (scenario === "wrong side")
    x.incidents.incidents.find((i) => i.id === 127082497)!.isHome = false;
  if (scenario === "missing participant minutes")
    delete (
      x.lineups.home.players.find((p) => p.player.id === 2265493)!.statistics as Record<
        string,
        unknown
      >
    ).minutesPlayed;
  if (scenario === "unknown stats")
    (
      x.lineups.home.players.find((p) => p.player.id === 919712)!.statistics as Record<
        string,
        unknown
      >
    ).totalPass = 1;
  const result = buildConfirmedApiRatingLineups(
    x.lineups,
    scenario === "unreadable incidents" ? { error: "unavailable" } : x.incidents,
  );
  expect(yahya(result).uncertain).toBe(true);
  expect(yahya(result).rating).toBeNull();
});
