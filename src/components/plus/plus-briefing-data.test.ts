import { beforeEach, describe, expect, it } from "bun:test";

import type { BriefingMember } from "@/backend/premium/briefing";

import {
  captainCandidates,
  defaultReplace,
  formatMillions,
  journeeCounts,
  lastMinutes,
  publishedTotal,
  readVisit,
  snapshotOf,
  squadFacts,
  transferRows,
  visitChanges,
  writeVisit,
} from "./plus-briefing-data";
import { EXAMPLE_PREVIOUS_VISIT, exampleBriefing } from "./plus-briefing-example";

const view = (): BriefingMember => exampleBriefing();
const named = (v: BriefingMember, name: string) => v.squad.find((p) => p.name === name)!;

describe("the squad, sorted into what is known", () => {
  it("calls absent only what the provider lists, and no-information only a fact: 0 minutes in the last published journée", () => {
    const v = view();
    const facts = squadFacts(v);
    expect(facts.absent.map((p) => p.name)).toEqual(["Abdelilah Hafidi"]);
    expect(facts.noInfo.map((p) => p.name)).toEqual(["Munir Mohamedi", "Mohamed Nahiri"]);
    expect(facts.others).toHaveLength(12);
    expect(facts.feedListed).toBe(4);
    // A player is in exactly one list.
    expect(facts.absent.length + facts.noInfo.length + facts.others.length).toBe(15);
  });

  it("reads the minutes of the latest journée that has any, never of a pending one", () => {
    const v = view();
    expect(lastMinutes(named(v, "Mohamed Nahiri"))).toEqual({ sequence: 10, minutes: 0 });
    // El Kaabi's J10 is pending: his last minutes are J9's.
    expect(lastMinutes(named(v, "Ayoub El Kaabi"))).toEqual({ sequence: 9, minutes: 90 });
    expect(lastMinutes({ ...named(v, "Anas Zniti"), form: [] })).toBeNull();
  });

  it("opens the replacement card on the absent player, else the first with no minutes, else the first", () => {
    const v = view();
    expect(defaultReplace(squadFacts(v), v)).toBe(named(v, "Abdelilah Hafidi").fantasyPlayerId);
    const healthy: BriefingMember = {
      ...v,
      squad: v.squad.map((p) => ({ ...p, absence: null })),
    };
    expect(defaultReplace(squadFacts(healthy), healthy)).toBe(
      named(v, "Munir Mohamedi").fantasyPlayerId,
    );
    const quiet: BriefingMember = {
      ...healthy,
      squad: healthy.squad.map((p) => ({ ...p, form: p.form.map((c) => ({ ...c, minutes: 90 })) })),
    };
    expect(defaultReplace(squadFacts(quiet), quiet)).toBe(v.squad[0]!.fantasyPlayerId);
  });
});

describe("published points", () => {
  it("adds published points only: pending and no-rating add nothing and count no journée", () => {
    const v = view();
    expect(publishedTotal(named(v, "Bouly Sambou"))).toEqual({ total: 23, journees: 3 });
    expect(publishedTotal(named(v, "Ayoub El Kaabi"))).toEqual({ total: 15, journees: 2 });
    const rated = named(v, "Reda Slim");
    const noRating = {
      ...rated,
      form: rated.form.map((c, i) =>
        i === 0 ? { ...c, state: "no_rating" as const, points: null } : c,
      ),
    };
    expect(publishedTotal(noRating)).toEqual({ total: 6, journees: 1 });
  });

  it("compares the current captain, the vice-captain and the best published starters, three at most, with no preselection", () => {
    const v = view();
    const names = captainCandidates(v).map((p) => p.name);
    expect(names).toEqual(["Bouly Sambou", "Mohamed Rabie Hrimat", "Ayoub El Kaabi"]);
    // An absent starter is never offered.
    const hurt = {
      ...v,
      squad: v.squad.map((p) =>
        p.name === "Bouly Sambou"
          ? {
              ...p,
              absence: {
                category: "injury" as const,
                expectedReturnOn: null,
                gamesMissed: null,
                asOf: "2026-10-13T09:00:00+01:00",
                source: "provider" as const,
              },
            }
          : p,
      ),
    };
    expect(captainCandidates(hurt).map((p) => p.name)).not.toContain("Bouly Sambou");
    expect(captainCandidates({ ...v, squad: [] })).toEqual([]);
  });

  it("counts who has a figure for a journée and who is still waiting", () => {
    const v = view();
    expect(journeeCounts(v, 10)).toEqual({ rated: 9, waiting: 6, noRating: 0 });
    expect(journeeCounts(v, 9)).toEqual({ rated: 13, waiting: 2, noRating: 0 });
  });
});

describe("transfers", () => {
  it("costs transfers by the same rule as the transfer screen: one free, 4 points each after", () => {
    expect(transferRows(1)).toEqual([
      { transfers: 1, paid: 0, hitPoints: 0 },
      { transfers: 2, paid: 1, hitPoints: 4 },
      { transfers: 3, paid: 2, hitPoints: 8 },
    ]);
    expect(transferRows(0)[0]).toEqual({ transfers: 1, paid: 1, hitPoints: 4 });
    expect(transferRows(2)[1]!.hitPoints).toBe(0);
  });

  it("writes millions with one decimal using the core Fantasy locale in both languages", () => {
    expect(formatMillions("fr", 7.8)).toBe("7,8");
    expect(formatMillions("ar", 7.8)).toBe(
      new Intl.NumberFormat("ar-MA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
        7.8,
      ),
    );
    expect(formatMillions("fr", 7)).toBe("7,0");
  });
});

describe("« Depuis votre visite »", () => {
  it("claims nothing on a first visit", () => {
    expect(visitChanges(null, view())).toEqual([]);
  });

  it("reports a newly published journée, newly listed absences and a lost place, from the last snapshot only", () => {
    const changes = visitChanges(EXAMPLE_PREVIOUS_VISIT, view());
    expect(changes.map((c) => c.kind)).toEqual(["published", "published", "absent", "overtaken"]);
    expect(changes[0]).toMatchObject({ kind: "published", sequence: 9, rated: 13, waiting: 2 });
    expect(changes[2]).toEqual({ kind: "absent", names: ["Abdelilah Hafidi"] });
    expect(changes[3]).toEqual({ kind: "overtaken", names: ["Sami"], rank: 3, size: 5 });
  });

  it("says nothing changed when nothing did, and a gain is a rank change, not an overtaking", () => {
    const v = view();
    expect(visitChanges(snapshotOf(v, "2026-10-14T10:00:00Z"), v)).toEqual([]);
    const better = {
      ...snapshotOf(v, "2026-10-14T10:00:00Z"),
      rank: 5,
      ahead: ["Sami", "Yassine", "Z"],
    };
    expect(visitChanges(better, v)).toEqual([{ kind: "rank", from: 5, rank: 3, size: 5 }]);
  });
});

describe("the device's memory", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
  });

  it("keeps one snapshot per reader on this device and reads it back", () => {
    const snap = snapshotOf(view(), "2026-10-15T10:00:00Z");
    writeVisit("u1", snap);
    expect(readVisit("u1")).toEqual(snap);
    expect(readVisit("u2")).toBeNull();
  });

  it("reads a damaged entry as nothing", () => {
    store.set("bg.briefing.visit.u1", "{not json");
    expect(readVisit("u1")).toBeNull();
    store.set("bg.briefing.visit.u1", JSON.stringify({ at: 1 }));
    expect(readVisit("u1")).toBeNull();
  });

  it("works with storage that throws", () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(readVisit("u1")).toBeNull();
    expect(() => writeVisit("u1", snapshotOf(view(), "2026-10-15T10:00:00Z"))).not.toThrow();
  });
});
