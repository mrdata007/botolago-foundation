/**
 * SYNTHETIC tests of the replay's three stage verdicts (hand-built matches, see
 * provider-test-world.ts). The real-payload replay is provider-replay.real.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { replayFixture } from "./provider-replay";
import { OBSERVED_AT, build, fid, row, sid, snapshot } from "./provider-test-world";

const SHIRTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const app = (side: "home" | "away", shirt: number) =>
  `00000000-0000-4000-8000-${(side === "home" ? 1000 : 2000) + shirt}`.padEnd(36, "0");

/** Every provider id of the 22 starters mapped; `override` replaces one Flashscore mapping. */
const allMapped = async (override?: { side: "home" | "away"; shirt: number; to: string }) =>
  snapshot(
    (["home", "away"] as const).flatMap((side) =>
      SHIRTS.flatMap((shirt) => [
        row("sofascore", sid(side, shirt), app(side, shirt)),
        row(
          "flashscore",
          fid(side, shirt),
          override && override.side === side && override.shirt === shirt
            ? override.to
            : app(side, shirt),
        ),
      ]),
    ),
  );

describe("SYNTHETIC: IDENTITY_RESOLVED is only true when identities are really resolved", () => {
  test("positive control: every appeared id mapped consistently resolves identity", async () => {
    const r = replayFixture({ observedAt: OBSERVED_AT, ...build(), snapshot: await allMapped() });
    expect(r.stages.identityResolved).toBe(true);
    expect(r.after.statusCounts).toEqual({ reviewed_pair: 22 });
  });

  test("every id mapped, but a same-shirt pair mapped to different people: identity is NOT resolved", async () => {
    const r = replayFixture({
      observedAt: OBSERVED_AT,
      ...build(),
      snapshot: await allMapped({
        side: "home",
        shirt: 5,
        to: "00000000-0000-4000-8000-00000000ffff",
      }),
    });
    // Coverage alone would say "resolved": no id is unmapped.
    expect(r.coverage.sofascore.appearedUnresolvedIds).toEqual([]);
    expect(r.coverage.flashscore.appearedUnresolvedIds).toEqual([]);
    expect(r.stages.identityResolved).toBe(false);
    expect(r.stages.ingestionReady).toBe(false);
    expect(
      r.blockers.some((b) => b.startsWith("IDENTITY:") && b.includes("different app players")),
    ).toBe(true);
    expect(r.after.unmatchedAppeared).toBeGreaterThan(0);
  });

  test("one app player on both sides is an identity blocker, not an events blocker", async () => {
    const snap = await snapshot([
      row("sofascore", sid("home", 5), app("home", 5)),
      row("flashscore", fid("away", 5), app("home", 5)),
    ]);
    const r = replayFixture({ observedAt: OBSERVED_AT, ...build(), snapshot: snap });
    expect(r.stages.identityResolved).toBe(false);
    expect(r.blockers.some((b) => b.startsWith("IDENTITY:") && b.includes("opposite sides"))).toBe(
      true,
    );
    expect(r.blockers.some((b) => b.startsWith("EVENTS:") && b.includes("opposite sides"))).toBe(
      false,
    );
  });
});
