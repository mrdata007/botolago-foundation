// Run with: `bun test src/services/transfers-draft.test.ts`
//
// SOL-01 / SOL-02 (audit 2026-10-14).
//  - SOL-01: a half-filled transfer draft used to be saved with its incoming
//    ids compacted (`filter(Boolean)`) while its outgoing ids kept their places,
//    so on return the second incoming player sat against the FIRST leaver.
//  - SOL-02: an owned player the buying pool no longer lists (inactive or
//    ineligible) could not be resolved, so the screen drew an empty midfield
//    slot and could not replace him.
import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "./__test-shim";

import type { FantasyHubDto } from "@/backend/fantasy/contracts";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import { fantasyDraftsStore, type FantasyDraftKey } from "./fantasy-drafts-store";
import { V2CloudFantasyRepository } from "./fantasy-owned-repository";
import {
  ownedPlayerFallback,
  parseTransfersDraft,
  pickerPool,
  resolveKnownPlayers,
  serializeTransfersDraft,
  type OwnedPlayerRecord,
} from "./transfers-service";
import type { FantasyPlayer } from "@/types/fantasy";

const KEY: FantasyDraftKey = { uid: "u1", teamId: "t1", baseVersion: 4, kind: "transfers" };

beforeEach(() => fantasyDraftsStore.__resetAll());

/** Save, read back through the real store, parse: what leaving and returning does. */
function roundTrip(outIds: string[], inIds: (string | null)[]) {
  fantasyDraftsStore.save(KEY, serializeTransfersDraft(outIds, inIds));
  const entry = fantasyDraftsStore.read<unknown>(KEY);
  return entry ? parseTransfersDraft(entry.payload) : null;
}

describe("a saved transfer draft keeps its pairs (SOL-01)", () => {
  it("keeps the audit case: A and B leave, only B's replacement X is chosen", () => {
    const back = roundTrip(["A", "B"], [null, "X"]);
    expect(back).toEqual({ outIds: ["A", "B"], inIds: [null, "X"] });
  });

  it("keeps a first-slot-only pair and a trailing placeholder", () => {
    expect(roundTrip(["A", "B"], ["X", null])).toEqual({ outIds: ["A", "B"], inIds: ["X", null] });
  });

  it("keeps complete pairs and fully empty placeholders", () => {
    expect(roundTrip(["A", "B"], ["X", "Y"])).toEqual({ outIds: ["A", "B"], inIds: ["X", "Y"] });
    expect(roundTrip(["A", "B"], [null, null])).toEqual({
      outIds: ["A", "B"],
      inIds: [null, null],
    });
  });

  it("treats a missing incoming entry as an unfilled placeholder", () => {
    // `inIds` can be shorter than `outIds` in memory only through a bug; never pair by position then.
    expect(roundTrip(["A", "B"], ["X"])).toEqual({ outIds: ["A", "B"], inIds: ["X", null] });
  });

  it("an empty draft is no draft", () => {
    expect(roundTrip([], [])).toEqual(null);
  });
});

describe("an old-format draft is never paired wrongly (SOL-01)", () => {
  it("reads an old draft whose lists are the same length: no placeholder was dropped", () => {
    expect(parseTransfersDraft({ outIds: ["A", "B"], inIds: ["X", "Y"] })).toEqual({
      outIds: ["A", "B"],
      inIds: ["X", "Y"],
    });
  });

  it("keeps the leavers but drops the incoming of an old draft whose pairing cannot be known", () => {
    // out[A,B] / in[null,X] was saved as in[X]: X could be A's or B's.
    expect(parseTransfersDraft({ outIds: ["A", "B"], inIds: ["X"] })).toEqual({
      outIds: ["A", "B"],
      inIds: [null, null],
    });
  });

  it("an old draft with leavers and no incoming is a draft of pending leavers", () => {
    expect(parseTransfersDraft({ outIds: ["A"], inIds: [] })).toEqual({
      outIds: ["A"],
      inIds: [null],
    });
  });

  it("ignores malformed payloads", () => {
    for (const bad of [
      null,
      undefined,
      "x",
      42,
      {},
      { outIds: "A", inIds: [] },
      { outIds: ["A"], inIds: "X" },
      { outIds: [1], inIds: [] },
      { v: 2 },
      { v: 2, pairs: "A" },
      { v: 2, pairs: [{ outId: 3, inId: null }] },
      { v: 2, pairs: [{ outId: "A", inId: 3 }] },
      { v: 9, pairs: [{ outId: "A", inId: null }] },
    ]) {
      expect(parseTransfersDraft(bad)).toBeNull();
    }
  });

  it("drops repeated leavers and repeated or self-replacing incoming, keeping the pair", () => {
    expect(
      parseTransfersDraft({
        v: 2,
        pairs: [
          { outId: "A", inId: "X" },
          { outId: "A", inId: "Z" },
          { outId: "B", inId: "X" },
          { outId: "C", inId: "C" },
        ],
      }),
    ).toEqual({ outIds: ["A", "B", "C"], inIds: ["X", null, null] });
  });

  it("drops a leaver who is no longer in the squad, when the squad is known", () => {
    const payload = {
      v: 2,
      pairs: [
        { outId: "A", inId: "X" },
        { outId: "GONE", inId: "W" },
      ],
    };
    // Without the squad nothing can be said about GONE.
    expect(parseTransfersDraft(payload)?.outIds).toEqual(["A", "GONE"]);
    expect(parseTransfersDraft(payload, { squadIds: new Set(["A", "B"]) })).toEqual({
      outIds: ["A"],
      inIds: ["X"],
    });
  });
});

describe("a restored draft is checked against what the screen knows now (SOL-01)", () => {
  // Squad A, B (defenders) and D (midfielder). X, Y buyable defenders, M a buyable midfielder.
  // C is a defender who is owned now; R a defender who left the pool.
  const positions: Record<string, string> = {
    A: "DEF",
    B: "DEF",
    C: "DEF",
    D: "MID",
    X: "DEF",
    Y: "DEF",
    M: "MID",
    R: "DEF",
  };
  const options = {
    squadIds: new Set(["A", "B", "C", "D"]),
    buyableIds: new Set(["X", "Y", "M"]),
    positionOf: (id: string) => positions[id],
  };
  const restore = (pairs: Array<{ outId: string; inId: string | null }>) =>
    parseTransfersDraft({ v: 2, pairs }, options);

  it("keeps valid pairs, including a placeholder before a filled pair", () => {
    expect(
      restore([
        { outId: "A", inId: null },
        { outId: "B", inId: "Y" },
      ]),
    ).toEqual({ outIds: ["A", "B"], inIds: [null, "Y"] });
  });

  it("turns an incoming player who is owned now into a placeholder, not a double on the pitch", () => {
    expect(restore([{ outId: "A", inId: "C" }])).toEqual({ outIds: ["A"], inIds: [null] });
  });

  it("turns an incoming player who is himself a leaver into a placeholder", () => {
    expect(
      restore([
        { outId: "A", inId: "X" },
        { outId: "B", inId: "A" },
      ]),
    ).toEqual({ outIds: ["A", "B"], inIds: ["X", null] });
  });

  it("turns an incoming player who left the buying pool into a placeholder", () => {
    expect(restore([{ outId: "A", inId: "R" }])).toEqual({ outIds: ["A"], inIds: [null] });
  });

  it("turns an incoming player of another position into a placeholder", () => {
    expect(restore([{ outId: "A", inId: "M" }])).toEqual({ outIds: ["A"], inIds: [null] });
    expect(restore([{ outId: "D", inId: "M" }])).toEqual({ outIds: ["D"], inIds: ["M"] });
  });

  it("applies the same checks to an old-format draft", () => {
    expect(parseTransfersDraft({ outIds: ["A", "B"], inIds: ["C", "Y"] }, options)).toEqual({
      outIds: ["A", "B"],
      inIds: [null, "Y"],
    });
  });

  it("a draft with nothing left to restore is null, so the screen clears it", () => {
    expect(restore([{ outId: "GONE", inId: "X" }])).toBeNull();
  });
});

const poolPlayer = (id: string, over: Partial<FantasyPlayer> = {}): FantasyPlayer => ({
  id,
  name: { fr: id, ar: id },
  clubId: "club-1",
  position: "DEF",
  price: 5,
  totalPoints: 0,
  form: null,
  ownership: 0,
  status: "available",
  ...over,
});

const OWNED: Record<string, OwnedPlayerRecord> = {
  gone: { id: "gone", clubId: "club-9", position: "FWD", price: 7.4, status: "injured" },
  here: { id: "here", clubId: "club-1", position: "DEF", price: 5, status: "available" },
};

describe("an owned player missing from the buying pool (SOL-02)", () => {
  const pool = [poolPlayer("here"), poolPlayer("other")];
  const label = { fr: "Joueur indisponible", ar: "لاعب غير متاح" };

  it("is resolved with his own position, club and price, not a MID placeholder", () => {
    const known = resolveKnownPlayers(pool, OWNED, label);
    const gone = known.find((p) => p.id === "gone");
    expect(gone).toBeDefined();
    expect(gone!.position).toBe("FWD");
    expect(gone!.clubId).toBe("club-9");
    expect(gone!.price).toBe(7.4);
    expect(gone!.status).toBe("injured");
    expect(gone!.name).toEqual(label);
  });

  it("leaves the pool's own record alone when the owned player is in the pool", () => {
    const known = resolveKnownPlayers(pool, OWNED, label);
    expect(known.filter((p) => p.id === "here")).toHaveLength(1);
    expect(known.find((p) => p.id === "here")).toBe(pool[0]);
  });

  it("never adds him to the buying pool: the pool array is untouched", () => {
    const before = pool.map((p) => p.id);
    resolveKnownPlayers(pool, OWNED, label);
    expect(pool.map((p) => p.id)).toEqual(before);
    expect(pool.some((p) => p.id === "gone")).toBe(false);
  });

  it("does nothing without owned records (guest and local adapters)", () => {
    expect(resolveKnownPlayers(pool, undefined, label)).toBe(pool);
  });

  it("keeps him out of what a picker offers, and flags him as a stand-in", () => {
    const known = resolveKnownPlayers(pool, OWNED, label);
    expect(known.find((p) => p.id === "gone")!.placeholder).toBe(true);
    expect(pickerPool(known).map((p) => p.id)).toEqual(["here", "other"]);
    // Nothing to remove: the same array comes back.
    expect(pickerPool(pool)).toBe(pool);
  });

  it("maps any status the pool does not know to the safe 'injured' wording, as the pool does", () => {
    const fallback = ownedPlayerFallback(
      { id: "x", clubId: "c", position: "GK", price: 4, status: "retired" },
      label,
    );
    expect(fallback.status).toBe("injured");
    expect(fallback.totalPoints).toBe(0);
    expect(fallback.form).toBeNull();
  });
});

describe("the cloud snapshot carries every owned player (SOL-02)", () => {
  const SEASON = "00000000-0000-4000-8000-000000000001";
  const GW = "00000000-0000-4000-8000-000000000102";
  const OWNED_ID = "00000000-0000-4000-8000-000000000301";
  const CLUB = "00000000-0000-4000-8000-000000000601";
  const hub = (): FantasyHubDto => ({
    season: { id: SEASON, name: "2026/2027", status: "active" },
    gameweek: {
      id: GW,
      sequence: 2,
      name: "2",
      deadlineAt: "2099-10-02T14:30:00Z",
      status: "open",
      pointsState: "provisional",
    },
    enrolmentGameweek: null,
    team: {
      id: "00000000-0000-4000-8000-000000000201",
      seasonId: SEASON,
      currentGameweekId: GW,
      name: "Atlas Eleven",
      bank: 0,
      teamValue: 100,
      freeTransfers: 1,
      version: 3,
      status: "active",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-20T00:00:00Z",
      squad: [
        {
          membershipId: "00000000-0000-4000-8000-000000000401",
          fantasyPlayerId: OWNED_ID,
          footballPlayerId: "00000000-0000-4000-8000-000000000501",
          footballTeamId: CLUB,
          position: "FWD",
          price: 7.4,
          purchasePrice: 7.0,
          salePrice: 7.2,
          status: "inactive",
        },
      ],
      lineup: [],
      chips: { active: null, activeCancellable: true, used: [] },
    },
    rankingAvailable: true,
  });
  const spy = spyOn(SupabaseFantasyRepository.prototype, "getHub").mockImplementation(async () =>
    hub(),
  );
  afterAll(() => spy.mockRestore());

  it("keeps position, club and price of an owned player the pool does not list, and his sale value", async () => {
    const snapshot = await new V2CloudFantasyRepository("user-1").loadSnapshot();
    expect(snapshot.ownedPlayers?.[OWNED_ID]).toEqual({
      id: OWNED_ID,
      clubId: CLUB,
      position: "FWD",
      price: 7.4,
      status: "inactive",
    });
    expect(snapshot.salePrices?.[OWNED_ID]).toBe(7.2);
    const known = resolveKnownPlayers([], snapshot.ownedPlayers, { fr: "?", ar: "?" });
    expect(known.map((p) => [p.id, p.position, p.clubId])).toEqual([[OWNED_ID, "FWD", CLUB]]);
  });
});

describe("the transfers screen is wired to them (SOL-01, SOL-02)", () => {
  // The screen needs a browser and a signed-in account to run, so its wiring is pinned the way
  // `transfers-sale-value.test.ts` pins its sale value: by what the source does.
  const source = readFileSync(join(import.meta.dir, "../routes/fantasy.transfers.tsx"), "utf8");

  it("never compacts the incoming list when it saves a draft", () => {
    expect(source).not.toMatch(/(inIds|nextIn|draftIn)\.filter\(Boolean\)/);
    expect(source).toContain("serializeTransfersDraft(");
    expect(source).toContain("parseTransfersDraft(");
  });

  it("restores a draft only once the pool is loaded, and clears the screen when nothing is left", () => {
    expect(source).toMatch(/screen\.phase !== "ready"[^\n]*draftInit\.current/);
    expect(source).toMatch(/fantasyDraftsStore\.remove\(draftKey\);\s*setOutIds\(\[\]\);/);
  });

  it("never reaches for an unknown player with a non-null assertion in the preview", () => {
    expect(source).not.toMatch(/knownPlayers\.find\([^)]*\)\s*!/);
  });

  it("gives the pickers the pool only, never the lookup that holds the stand-ins", () => {
    expect(source).not.toMatch(/<AddPlayerScreen[^>]*players=\{knownPlayers\}/);
    expect(source).toMatch(/<AddPlayerScreen\s+players=\{pickerPlayers\}/);
  });
});
