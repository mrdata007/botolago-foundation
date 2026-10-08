import { describe, expect, it } from "bun:test";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURES, type FixtureId } from "@/backend/manager-card/fixtures";

import { createMomentStore, linesOf, type GateInput, type GateSession } from "./moment-store";

/**
 * What the gate remembers: one hero per surface per account, decided once and kept, the session
 * flag set when it is shown, the lines that carry a moment kept after they are acknowledged.
 */

const card = (id: FixtureId): MyCardDto => FIXTURES[id].card!;

function session(initial = false): GateSession & { shown: number } {
  let shown = initial;
  const value = {
    shown: 0,
    heroShown: () => shown,
    markHeroShown: () => {
      shown = true;
      value.shown += 1;
    },
  };
  return value;
}

const input = (c: MyCardDto, over: Partial<GateInput> = {}): GateInput => ({
  card: c,
  minutesToDeadline: 2000,
  launchGateOpen: true,
  blocked: false,
  ...over,
});

describe("deciding", () => {
  it("decides a hero once, sets the session flag, and keeps it", () => {
    const flag = session();
    const store = createMomentStore(flag);
    const rated = card("rated");
    expect(store.evaluate("gradins", input(rated))).toBe(true);
    expect(store.get("gradins").hero?.kind).toBe("first_fresh");
    expect(flag.shown).toBe(1);
    // The same card again: nothing changes, the flag is not set twice.
    expect(store.evaluate("gradins", input(rated))).toBe(false);
    expect(flag.shown).toBe(1);
  });

  it("keeps the hero when its moments are acknowledged and leave the card", () => {
    const store = createMomentStore(session());
    const rated = card("rated");
    store.evaluate("gradins", input(rated));
    const gone: MyCardDto = { ...rated, moments: [] };
    store.evaluate("gradins", input(gone));
    expect(store.get("gradins").hero?.kind).toBe("first_fresh");
  });

  it("does not decide before the launch gate opens", () => {
    const flag = session();
    const store = createMomentStore(flag);
    expect(store.evaluate("gradins", input(card("rated"), { launchGateOpen: false }))).toBe(false);
    expect(store.get("gradins").hero).toBeNull();
    expect(flag.shown).toBe(0);
  });

  it("a session that already showed a hero shows no other, but a decided hero stays", () => {
    const store = createMomentStore(session(true));
    store.evaluate("gradins", input(card("rated")));
    expect(store.get("gradins").hero).toBeNull();

    const flag = session();
    const own = createMomentStore(flag);
    own.evaluate("gradins", input(card("rated")));
    expect(own.get("gradins").hero).not.toBeNull();
    // Looking again with the flag now set does not take the decided hero away.
    own.evaluate("gradins", input(card("rated")));
    expect(own.get("gradins").hero).not.toBeNull();
  });

  it("the team page and Gradins decide separately, and one hero per session holds across them", () => {
    const flag = session();
    const store = createMomentStore(flag);
    const born = card("born0");
    store.evaluate("team", input(born));
    expect(store.get("team").hero?.kind).toBe("born_new");
    // Gradins, in the same session, shows none: the flag was set by the panel.
    store.evaluate("gradins", input(born));
    expect(store.get("gradins").hero).toBeNull();
    expect(flag.shown).toBe(1);
  });

  it("a decision with no hero looks again when the card changes", () => {
    const store = createMomentStore(session());
    const none = { ...card("rated"), moments: [] };
    store.evaluate("gradins", input(none));
    expect(store.get("gradins").hero).toBeNull();
    store.evaluate("gradins", input(card("rated")));
    expect(store.get("gradins").hero?.kind).toBe("first_fresh");
  });

  it("a different account starts again: the first one's hero is not carried over", () => {
    const flag = session();
    const store = createMomentStore(flag);
    store.evaluate("gradins", input(card("rated")));
    const other: MyCardDto = {
      ...card("tierUp"),
      teamId: "3c000002-0000-4000-8000-0000000000ff",
    };
    store.evaluate("gradins", input(other));
    // One hero per session: the session already showed one, so the second account sees none, and
    // the first account's hero is gone from the surface.
    expect(store.get("gradins").hero).toBeNull();
    expect(store.get("gradins").acked).toBe(false);
  });

  it("nothing opens while the import prompt or the step-up notice is open", () => {
    const store = createMomentStore(session());
    store.evaluate("gradins", input(card("rated"), { blocked: true }));
    expect(store.get("gradins").hero).toBeNull();
  });

  it("the deadline window holds a hero back and the next look, after it, shows it", () => {
    const store = createMomentStore(session());
    store.evaluate("gradins", input(card("rated"), { minutesToDeadline: 20 }));
    expect(store.get("gradins").hero).toBeNull();
    store.evaluate("gradins", input(card("rated"), { minutesToDeadline: 600 }));
    expect(store.get("gradins").hero).not.toBeNull();
  });
});

describe("acknowledging", () => {
  it("stills the beat and marks the hero done, on every surface that holds the keys", () => {
    const store = createMomentStore(session());
    store.evaluate("gradins", input(card("rated")));
    const before = store.get("gradins");
    expect(before.hero?.beat).toBe("first");
    expect(before.acked).toBe(false);
    store.markAcked(before.hero!.keys);
    const after = store.get("gradins");
    expect(after.acked).toBe(true);
    expect(after.hero?.beat).toBeNull();
    expect(after.hero?.kind).toBe("first_fresh");
  });

  it("an acknowledgement by being seen leaves the hero open; closing it afterwards collapses it", () => {
    const store = createMomentStore(session());
    store.evaluate("gradins", input(card("rated")));
    const keys = store.get("gradins").hero!.keys;
    store.markAcked(keys, false);
    expect(store.get("gradins")).toMatchObject({ acked: true, collapsed: false });
    expect(store.get("gradins").hero?.beat).toBeNull();
    store.markAcked(keys);
    expect(store.get("gradins")).toMatchObject({ acked: true, collapsed: true });
  });

  it("the × or a button collapses it at once", () => {
    const store = createMomentStore(session());
    store.evaluate("gradins", input(card("rated")));
    store.markAcked(store.get("gradins").hero!.keys);
    expect(store.get("gradins")).toMatchObject({ acked: true, collapsed: true });
  });

  it("keys that are not the hero's change nothing", () => {
    const store = createMomentStore(session());
    store.evaluate("gradins", input(card("rated")));
    const before = store.get("gradins");
    store.markAcked(["founder_granted"]);
    expect(store.get("gradins")).toBe(before);
  });

  it("notifies subscribers when something changes, and not otherwise", () => {
    const store = createMomentStore(session());
    let calls = 0;
    const off = store.subscribe(() => (calls += 1));
    store.evaluate("gradins", input(card("rated")));
    store.evaluate("gradins", input(card("rated")));
    expect(calls).toBe(1);
    store.markAcked(["nothing"]);
    expect(calls).toBe(1);
    off();
    store.markAcked(store.get("gradins").hero!.keys);
    expect(calls).toBe(1);
  });
});

describe("the lines", () => {
  it("keeps a line that carries a moment after it is acknowledged", () => {
    const store = createMomentStore(session());
    const cleared = card("cleared");
    store.evaluate("gradins", input(cleared));
    expect(store.get("gradins").momentLines.map((line) => line.kind)).toEqual([
      "provisional_cleared",
    ]);
    store.evaluate("gradins", input({ ...cleared, moments: [] }));
    expect(store.get("gradins").momentLines.map((line) => line.kind)).toEqual([
      "provisional_cleared",
    ]);
  });

  it("linesOf puts the moment lines first, then the card's own state lines, in one order", () => {
    const started = card("seasonStarted");
    const store = createMomentStore(session());
    store.evaluate("gradins", input(started));
    const lines = linesOf(started, store.get("gradins").momentLines);
    expect(lines).toEqual([{ kind: "season_started", keys: [started.moments[0]!.key] }]);

    // After the moment is acknowledged and gone, the state line carries on without a key.
    const later = linesOf({ ...started, moments: [] }, store.get("gradins").momentLines);
    expect(later).toHaveLength(1);

    const down = linesOf(card("tierDown"), []);
    expect(down).toEqual([{ kind: "tier_down", keys: [] }]);
  });
});

describe("blocking", () => {
  it("counts blockers and tells subscribers", () => {
    const store = createMomentStore(session());
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.block(true);
    store.block(true);
    expect(store.blockers).toBe(2);
    store.block(false);
    store.block(false);
    store.block(false);
    expect(store.blockers).toBe(0);
    expect(calls).toBe(5);
  });
});
