import { describe, expect, it } from "bun:test";

import { fixtureIdFromSearch } from "./fixture-selection";
import { FIXTURES, type FixtureId } from "./fixtures";
import { MockManagerCardRepository } from "./mock-repository";

const context = { actorId: null, requestId: "test" };
const repositoryFor = (id: FixtureId | null) => new MockManagerCardRepository(() => id);

describe("MockManagerCardRepository", () => {
  it("answers each fixture's own card, status and, by default, the rated one", async () => {
    expect((await repositoryFor("founder").myCard()).available).toBe(true);
    const answer = await repositoryFor(null).myCard();
    expect(answer.available && answer.card?.ovr).toBe(84);
    expect(await repositoryFor("featureOff").status()).toMatchObject({ enabled: false });
    expect(await repositoryFor("rated").status()).toEqual({
      enabled: true,
      minRated: 3,
      minConfirmed: 5,
    });
  });

  it("fails every card read on the network for the offline fixture", async () => {
    const repository = repositoryFor("offline");
    await expect(repository.myCard()).rejects.toMatchObject({ code: "network" });
    await expect(repository.cards(["x"], context)).rejects.toMatchObject({ code: "network" });
    await expect(
      repository.myHistory({ seasonId: null, beforeSeq: null, limit: 20 }),
    ).rejects.toMatchObject({ code: "network" });
  });

  it("answers { available: false } for the unavailable fixture, and no card for noCard", async () => {
    expect(await repositoryFor("unavailable").myCard()).toEqual({ available: false });
    expect(await repositoryFor("unavailable").cards(["x"], context)).toEqual({ available: false });
    expect(await repositoryFor("noCard").myCard()).toEqual({ available: true, card: null });
  });

  it("acknowledges the pending moments once, then ignores them, and stops listing them", async () => {
    const repository = repositoryFor("returning");
    const keys = FIXTURES.returning.card!.moments.map((moment) => moment.key);
    const first = await repository.ackMoments([...keys, "nope"]);
    expect(first.acknowledged).toEqual(keys);
    expect(first.ignored).toEqual(["nope"]);
    const after = await repository.myCard();
    expect(after.available && after.card?.moments).toEqual([]);
    expect((await repository.ackMoments(keys)).ignored).toEqual(keys);
    // Another fixture is untouched, and the fixture itself is not mutated.
    expect(FIXTURES.returning.card!.moments).toHaveLength(2);
  });

  it("answers a batch from the fixture's league, the caller's own card, and a stable sample for any other id", async () => {
    const repository = repositoryFor("rated");
    const league = FIXTURES.rated.league!;
    const own = FIXTURES.rated.card!;
    const answer = await repository.cards(
      [league.members[0]!.teamId, own.teamId, "me", "m1", "m1", "m2"],
      context,
    );
    if (!answer.available) throw new Error("off");
    expect(answer.cards.map((card) => card.teamId)).toEqual([
      league.members[0]!.teamId,
      own.teamId,
      "me",
      "m1",
      "m2",
    ]);
    expect(answer.cards[2]!.ovr).toBe(own.ovr);
    const again = await repository.cards(["m1"], context);
    expect(again.available && again.cards[0]).toEqual(answer.cards[3]!);
  });

  it("pages the history by journée, newest first, with a keyset", async () => {
    const repository = repositoryFor("seasonClosed");
    const first = await repository.myHistory({ seasonId: null, beforeSeq: null, limit: 20 });
    if (!first.available) throw new Error("off");
    expect(first.items).toHaveLength(20);
    expect(first.items[0]!.gameweekSeq).toBe(30);
    expect(first.nextBeforeSeq).toBe(11);
    const second = await repository.myHistory({ seasonId: null, beforeSeq: 11, limit: 20 });
    if (!second.available) throw new Error("off");
    expect(second.items.map((row) => row.gameweekSeq)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(second.nextBeforeSeq).toBeNull();
  });

  it("reads another season's history by its id", async () => {
    const repository = repositoryFor("seasonStarted");
    const current = await repository.myHistory({ seasonId: null, beforeSeq: null, limit: 20 });
    expect(current.available && current.items).toEqual([]);
    const previous = await repository.myHistory({
      seasonId: FIXTURES.seasonStarted.card!.seasons[1]!.seasonId,
      beforeSeq: null,
      limit: 20,
    });
    expect(previous.available && previous.items[0]?.seasonLabel).toBe("2026/27");
  });
});

describe("fixtureIdFromSearch", () => {
  it("reads ?mc= from a search string, and nothing unsafe", () => {
    expect(fixtureIdFromSearch("?mc=founder")).toBe("founder");
    expect(fixtureIdFromSearch("?x=1&mc=rated&y=2")).toBe("rated");
    expect(fixtureIdFromSearch("mc=tierUp")).toBe("tierUp");
    expect(fixtureIdFromSearch("")).toBeNull();
    expect(fixtureIdFromSearch(null)).toBeNull();
    expect(fixtureIdFromSearch("?mc=")).toBeNull();
    expect(fixtureIdFromSearch("?mc=<script>")).toBeNull();
    expect(fixtureIdFromSearch(`?mc=${"a".repeat(41)}`)).toBeNull();
  });
});
