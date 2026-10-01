import { describe, expect, test } from "bun:test";
import {
  parseFlashscoreData,
  parseFlashscoreLineups,
  parseFlashscoreStatistics,
  parseFlashscoreSummary,
} from "../football/provider/flashscore-adapter";
import type { PerformanceIncident } from "../football/provider/performance-contracts";
import { providerFixture } from "../football/provider/performance-fixtures";
import {
  parseSofascoreDetail,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "../football/provider/sofascore-adapter";
import {
  reconcileMatch,
  type ProviderMatchData,
  type ReconcileInput,
  type ReconcileResult,
  type ReconciledPlayer,
} from "./provider-reconciler";

/** The seven matches both providers cover (Sofascore id, Flashscore id). */
const MATCHES = {
  touargaFus: ["16958239", "88o4wcDb"],
  dhjCodm: ["16958236", "vZ4vNyTH"],
  wacTemara: ["17132472", "pW7nLFcU"],
  tiznitTanger: ["16958238", "0rrduJrn"],
  masZemamra: ["17132481", "W81WOcb5"],
  tetouanBerkane: ["17132482", "nLBqJSRq"],
  kacmHusa: ["17132480", "GYlCyyrB"],
} as const;
type MatchKey = keyof typeof MATCHES;

const OBSERVED_AT = "2026-10-01T12:00:00.000Z";

function load(key: MatchKey): { sofascore: ProviderMatchData; flashscore: ProviderMatchData } {
  const [s, f] = MATCHES[key];
  const sofa = (name: string) => providerFixture("sofascore", `${s}.${name}`);
  const flash = (name: string) => providerFixture("flashscore", `${f}.${name}`);
  return {
    sofascore: {
      summary: parseSofascoreDetail(sofa("detail")),
      lineups: parseSofascoreLineups(sofa("lineups")),
      incidents: parseSofascoreIncidents(sofa("incidents")),
      statistics: parseSofascoreStatistics(sofa("statistics")),
    },
    flashscore: {
      summary: parseFlashscoreData(flash("data")),
      lineups: parseFlashscoreLineups(flash("lineups")),
      incidents: parseFlashscoreSummary(flash("summary")),
      statistics: parseFlashscoreStatistics(flash("statistics")),
    },
  };
}

const run = (key: MatchKey, change?: (input: ReconcileInput) => ReconcileInput) => {
  const input: ReconcileInput = { observedAt: OBSERVED_AT, ...load(key) };
  return reconcileMatch(change ? change(input) : input);
};

const player = (
  result: ReconcileResult,
  side: "home" | "away",
  shirt: number,
): ReconciledPlayer => {
  const found = result.players.find((p) => p.side === side && p.shirtNumber === shirt);
  if (!found) throw new Error(`no ${side} player #${shirt}`);
  return found;
};

const codes = (result: ReconcileResult) => result.discrepancies.map((d) => d.code);

const withFlash =
  (change: (data: ProviderMatchData) => ProviderMatchData) =>
  (input: ReconcileInput): ReconcileInput =>
    input.flashscore ? { ...input, flashscore: change(input.flashscore) } : input;

const withSofa =
  (change: (data: ProviderMatchData) => ProviderMatchData) =>
  (input: ReconcileInput): ReconcileInput =>
    input.sofascore ? { ...input, sofascore: change(input.sofascore) } : input;

const isGoal = (i: PerformanceIncident) => i.kind === "goal" || i.kind === "penalty_goal";

describe("Touarga 2-1 FUS (Sofascore limited coverage)", () => {
  const result = run("touargaFus");

  test("scores in simple mode: saves are unknown, nothing is derived from shots on target", () => {
    expect(result.scorableMode).toBe("simple");
    const keepers = result.players.filter((p) => p.position === "G" && p.started);
    expect(keepers).toHaveLength(2);
    for (const keeper of keepers) {
      expect(keeper.stats.saves).toBeUndefined();
      expect(keeper.evidence.saves?.state).toBe("unknown");
    }
    // Flashscore does list shots on target (3 and 4) for this match: unused.
  });

  test("assists come from Flashscore: Kajai for Ajerrar, Ait Lamkadem for Lotfi", () => {
    const kajai = player(result, "home", 13);
    const aitLamkadem = player(result, "home", 21);
    const ajerrar = player(result, "home", 27);
    const lotfi = player(result, "home", 20);
    expect([ajerrar.stats.goals, lotfi.stats.goals]).toEqual([1, 1]);
    expect(kajai.stats.assists).toBe(1);
    expect(aitLamkadem.stats.assists).toBe(1);
    expect(kajai.evidence.assists).toMatchObject({ state: "verified", source: "flashscore" });
    // Sofascore's zero assists is never used as evidence.
    expect(ajerrar.stats.assists).toBe(0);
    expect(ajerrar.evidence.assists?.source).toBe("flashscore");
  });

  test("the FUS penalty counts as a goal; the providers' labels differ and that is noted", () => {
    const lahtimi = player(result, "away", 9);
    expect(lahtimi.stats.goals).toBe(1);
    expect(lahtimi.stats.penaltiesMissed).toBe(0);
    expect(result.discrepancies.filter((d) => d.code === "penalty_label_differs")).toHaveLength(1);
    expect(result.discrepancies.filter((d) => d.level === "fixture")).toHaveLength(0);
  });

  test("Regragui, Rhailouf and Chaynane (90+4') have one yellow card each", () => {
    for (const shirt of [15, 31, 29]) {
      expect(player(result, "home", shirt).stats.yellowCards).toBe(1);
    }
    // The two FUS yellows (34' and 78') are in both providers too.
    expect(result.players.reduce((n, p) => n + (p.stats.yellowCards ?? 0), 0)).toBe(5);
    expect(result.players.reduce((n, p) => n + (p.stats.redCards ?? 0), 0)).toBe(0);
  });

  test("minutes and clean sheets follow the substitution times and the goals", () => {
    const regragui = player(result, "home", 15); // off at 59'
    expect(regragui.stats.minutes).toBe(59);
    expect(regragui.stats.goalsConceded).toBe(0);
    expect(regragui.stats.cleanSheet).toBe(false);
    expect(player(result, "away", 9).stats.goalsConceded).toBe(2);
  });

  test("a player the providers put on either side of 60 minutes is held back, not guessed", () => {
    // Sofascore takes Nanah off at 60', Flashscore at 59': 60 minutes earns the
    // full appearance point and 59 does not. The 5-minute window would otherwise
    // hide that difference.
    const nanah = player(result, "home", 3);
    expect(nanah.mode).toBe("incomplete");
    expect(nanah.stats.minutes).toBeUndefined();
    expect(nanah.evidence.minutes?.state).toBe("unknown");
    expect(codes(result)).toContain("timeline_disagrees");
    expect(result.mode).toBe("incomplete");
    expect(result.heldBack).toBe(1);
  });

  test("Sofascore ratings are kept for display only", () => {
    expect(result.players.every((p) => !("rating" in p.stats))).toBe(true);
  });
});

describe("Tiznit 1-3 Tanger (Sofascore's home lineup has 10 starters)", () => {
  const result = run("tiznitTanger");

  test("the Flashscore lineup is used for that side, and the evidence says so", () => {
    expect(codes(result)).toContain("lineup_fallback");
    const homeStarters = result.players.filter((p) => p.side === "home" && p.started);
    expect(homeStarters).toHaveLength(11);
    const alone = result.players.filter((p) => p.identity === "single_source");
    expect(alone.map((p) => p.displayName)).toEqual(["Bouhbouh H."]);
    expect(alone[0]?.evidence.minutes).toMatchObject({ state: "verified", source: "flashscore" });
    expect(alone[0]?.evidence.minutes?.references).toContain("lineup-used-alone:flashscore:home");
    expect(alone[0]?.evidence.minutes?.references).toContain("other-lineup-broken:sofascore");
    // The away side's lineups are both sound: nothing there is single-source.
    expect(
      result.players
        .filter((p) => p.side === "away")
        .every(
          (p) =>
            p.identity !== "single_source" &&
            !p.evidence.goals?.references.some((r) => r.startsWith("lineup-used-alone")),
        ),
    ).toBe(true);
  });

  test("assists from both providers; saves verified from Sofascore", () => {
    const assisters = result.players
      .filter((p) => (p.stats.assists ?? 0) > 0)
      .map((p) => [p.side, p.shirtNumber, p.stats.assists, p.evidence.assists?.source]);
    // Four assists in all; Flashscore is silent on one that Sofascore names.
    expect(assisters.reduce((sum, row) => sum + (row[2] as number), 0)).toBe(4);
    expect(assisters.some((row) => row[3] === "sofascore")).toBe(true);
    expect(assisters.some((row) => row[3] === "sofascore+flashscore")).toBe(true);
    const keepers = result.players.filter((p) => p.position === "G" && p.started);
    expect(keepers.map((k) => k.stats.saves)).toEqual([3, 2]);
    for (const keeper of keepers) {
      expect(keeper.evidence.saves).toMatchObject({ state: "verified", source: "sofascore" });
    }
  });

  test("three players stay held back: Sofascore has no incident for the two 84' substitutions", () => {
    expect(result.mode).toBe("incomplete");
    expect(result.scorableMode).toBe("full");
    expect(result.heldBack).toBe(3);
    expect(
      result.players
        .filter((p) => p.mode === "incomplete")
        .map((p) => p.shirtNumber)
        .sort(),
    ).toEqual([10, 21, 40]);
  });

  test("no fallback when both lineups are sound, and none when both are broken", () => {
    expect(codes(run("masZemamra"))).not.toContain("lineup_fallback");
    const dropStarter = (data: ProviderMatchData): ProviderMatchData => ({
      ...data,
      lineups: {
        ...data.lineups,
        players: data.lineups.players.filter(
          (p) => !(p.side === "home" && p.starter && p.shirtNumber === 9),
        ),
      },
    });
    const both = run("masZemamra", (input) => withFlash(dropStarter)(withSofa(dropStarter)(input)));
    expect(both.mode).toBe("review");
    expect(codes(both)).toContain("starters_count");
  });
});

describe("DHJ 2-6 CODM", () => {
  test("each provider's own incident list adds up to 8 goals, 2 for the home side and 6 for the away", () => {
    const { sofascore, flashscore } = load("dhjCodm");
    for (const data of [sofascore, flashscore]) {
      const goals = data.incidents.filter(isGoal);
      expect(goals).toHaveLength(8);
      expect(goals.filter((g) => g.side === "home")).toHaveLength(2);
      expect(goals.filter((g) => g.side === "away")).toHaveLength(6);
    }
  });

  test("the penalty minutes (10'/13' against 13'/22') are within 10, but one scorer is numbered 6 in Sofascore and 21 in Flashscore, so the match goes to review", () => {
    const result = run("dhjCodm");
    expect(result.mode).toBe("review");
    expect(result.players).toEqual([]);
    const reasons = result.discrepancies.filter((d) => d.code === "goal_mismatch");
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.message).toContain("do not name the same away scorer");
  });

  test("if the owner lets a goal pair a differently numbered scorer, all 8 goals reconcile with 2-6", () => {
    const result = run("dhjCodm", (input) => ({ ...input, linkIdentityByGoal: true }));
    expect(result.mode).not.toBe("review");
    expect(result.players.reduce((n, p) => n + (p.stats.goals ?? 0), 0)).toBe(8);
    expect(codes(result)).toContain("identity_linked_by_goal");
    const elJanati = result.players.find(
      (p) =>
        p.sofascoreId !== null && p.shirtNumber === 6 && p.side === "away" && p.stats.goals === 1,
    );
    expect(elJanati?.identity).toBe("incident");
    // Ten players remain held back: same-minute goal and substitution, and shirt 6 twice.
    expect(result.heldBack).toBe(10);
  });

  test("the option cannot turn a real scorer disagreement into a match", () => {
    const result = run("masZemamra", (input) =>
      withFlash((data) => {
        let changed = false;
        const incidents = data.incidents.map((i) => {
          if (changed || i.kind !== "goal" || !i.player) return i;
          changed = true;
          return { ...i, player: { externalId: "someone-else", name: "Someone Else" } };
        });
        return { ...data, incidents };
      })({ ...input, linkIdentityByGoal: true }),
    );
    expect(result.mode).toBe("review");
  });
});

describe("goals: same scorers in the same order, up to 10 minutes apart", () => {
  const shiftGoals = (minutes: number) =>
    withFlash((data) => ({
      ...data,
      incidents: data.incidents.map((i) => (isGoal(i) ? { ...i, minute: i.minute + minutes } : i)),
    }));

  test("10 minutes apart still reconciles", () => {
    const result = run("masZemamra", shiftGoals(10));
    expect(result.mode).not.toBe("review");
    expect(result.players.reduce((n, p) => n + (p.stats.goals ?? 0), 0)).toBe(3);
  });

  test("11 minutes apart goes to review", () => {
    const result = run("masZemamra", shiftGoals(11));
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("goal_mismatch");
  });

  test("a wider goal window never changes anyone's points: a player whose clean sheet or minutes turn on it is held back", () => {
    const base = run("masZemamra");
    const shifted = run("masZemamra", shiftGoals(10));
    for (const player of shifted.players) {
      const before = base.players.find((p) => p.sofascoreId === player.sofascoreId);
      for (const field of ["minutes", "goalsConceded", "cleanSheet"] as const) {
        const value = player.stats[field];
        if (value !== undefined) expect(value).toBe(before?.stats[field]);
      }
    }
  });

  test("the same scorers in a different order go to review", () => {
    // KACM-HUSA's away side scores three times, by different players.
    const result = run("kacmHusa", (input) =>
      withFlash((data) => {
        const away = data.incidents.filter((i) => isGoal(i) && i.side === "away");
        const first = away.find((i) => i.player?.externalId !== away[0]?.player?.externalId);
        const [second] = away;
        if (!first || !second) throw new Error("test needs two away goals by different players");
        const incidents = data.incidents.map((i) =>
          i === first
            ? { ...i, player: second.player }
            : i === second
              ? { ...i, player: first.player }
              : i,
        );
        return { ...data, incidents };
      })(input),
    );
    expect(result.mode).toBe("review");
    expect(result.players).toEqual([]);
  });
});

describe("a disagreement on a scorer", () => {
  test("sends the whole match to review and scores nothing", () => {
    const result = run(
      "masZemamra",
      withFlash((data) => {
        let changed = false;
        const incidents = data.incidents.map((i) => {
          if (changed || i.kind !== "goal" || !i.player) return i;
          changed = true;
          return { ...i, player: { externalId: "someone-else", name: "Someone Else" } };
        });
        return { ...data, incidents };
      }),
    );
    expect(result.mode).toBe("review");
    expect(result.players).toEqual([]);
    expect(codes(result)).toContain("goal_mismatch");
  });

  test("so does a goal missing from one list", () => {
    const result = run(
      "masZemamra",
      withFlash((data) => {
        const goalAt = data.incidents.findIndex((i) => i.kind === "goal");
        return { ...data, incidents: data.incidents.filter((_, index) => index !== goalAt) };
      }),
    );
    expect(result.mode).toBe("review");
    expect(result.players).toEqual([]);
  });
});

describe("cards and substitutions: matched per player, up to 5 minutes apart", () => {
  // Tetouan: Kassou's yellow is at 51' in Sofascore and 55' in Flashscore.
  const KASSOU = "1140960";
  const moveKassouYellow = (to: number) =>
    withFlash((data) => ({
      ...data,
      incidents: data.incidents.map((i) =>
        i.kind === "yellow_card" && i.minute === 55 ? { ...i, minute: to } : i,
      ),
    }));
  const kassou = (result: ReconcileResult) => {
    const found = result.players.find((p) => p.sofascoreId === KASSOU);
    if (!found) throw new Error("no Kassou");
    return found;
  };

  test("51' against 55' is one verified yellow card", () => {
    const result = run("tetouanBerkane");
    expect(kassou(result).stats.yellowCards).toBe(1);
    expect(kassou(result).evidence.yellowCards?.state).toBe("verified");
  });

  test("5 minutes apart is accepted, 6 holds only that player back", () => {
    expect(kassou(run("tetouanBerkane", moveKassouYellow(56))).stats.yellowCards).toBe(1);
    const six = run("tetouanBerkane", moveKassouYellow(57));
    expect(kassou(six).stats.yellowCards).toBeUndefined();
    expect(kassou(six).mode).toBe("incomplete");
    expect(six.mode).toBe("incomplete");
    expect(six.heldBack).toBe(3);
    expect(codes(six)).toContain("card_mismatch");
  });

  test("a card only one provider lists holds that player back, not the match", () => {
    const result = run(
      "tetouanBerkane",
      withFlash((data) => ({
        ...data,
        incidents: data.incidents.filter((i) => !(i.kind === "yellow_card" && i.minute === 55)),
      })),
    );
    expect(kassou(result).evidence.yellowCards?.state).toBe("unknown");
    expect(result.mode).toBe("incomplete");
  });

  test("when the providers name different players for a substitution, only those players are held back", () => {
    const result = run("tetouanBerkane");
    expect(result.mode).toBe("incomplete");
    expect(result.scorableMode).toBe("full");
    expect(result.heldBack).toBe(2);
    expect(
      result.players
        .filter((p) => p.mode === "incomplete")
        .map((p) => p.shirtNumber)
        .sort(),
    ).toEqual([18, 38]);
    expect(result.players.filter((p) => p.mode === "full")).toHaveLength(37);
    expect(codes(result)).toContain("substitution_mismatch");
  });
});

describe("KACM 2-3 HUSA (a missed penalty)", () => {
  const result = run("kacmHusa");

  test("the missed penalty is credited to the player who missed it, in both providers", () => {
    const missers = result.players.filter((p) => (p.stats.penaltiesMissed ?? 0) > 0);
    expect(missers).toHaveLength(1);
    expect(missers[0]?.stats.penaltiesMissed).toBe(1);
    expect(missers[0]?.evidence.penaltiesMissed).toMatchObject({
      state: "verified",
      source: "sofascore+flashscore",
    });
    // The scored penalties of the same match are goals, not misses.
    expect(result.players.reduce((n, p) => n + (p.stats.goals ?? 0), 0)).toBe(5);
  });

  test("whether the keeper saved it is not established, so penalties saved stays unknown", () => {
    const against = result.players.filter((p) => p.evidence.penaltiesSaved?.state === "unknown");
    expect(against.length).toBeGreaterThan(0);
    expect(against.every((p) => p.position === "G" && p.stats.penaltiesSaved === undefined)).toBe(
      true,
    );
    expect(codes(result)).toContain("penalty_saved_unknown");
    expect(result.mode).toBe("simple");
  });
});

describe("MAS 2-1 Zemamra (full coverage, everything agrees)", () => {
  const result = run("masZemamra");

  test("every player is fully scorable and every field is verified", () => {
    expect(result.mode).toBe("full");
    expect(result.heldBack).toBe(0);
    expect(result.players.every((p) => p.mode === "full")).toBe(true);
    expect(result.unmatched).toEqual([]);
  });

  test("saves are Sofascore's own, and a keeper who never played has none", () => {
    const keepers = result.players.filter((p) => p.position === "G");
    expect(keepers.length).toBeGreaterThanOrEqual(3);
    for (const keeper of keepers) expect(typeof keeper.stats.saves).toBe("number");
    expect(keepers.filter((k) => !k.started && k.stats.minutes === 0)).not.toHaveLength(0);
  });

  test("evidence carries both provider event ids, plus digests when supplied", () => {
    const withDigests = run("masZemamra", (input) => ({
      ...input,
      digests: { sofascore: "aaaa", flashscore: "bbbb" },
    }));
    const references = withDigests.players[0]?.evidence.goals?.references ?? [];
    expect(references.slice(0, 4)).toEqual([
      "sofascore:17132481",
      "flashscore:W81WOcb5",
      "sha256:aaaa",
      "sha256:bbbb",
    ]);
  });
});

describe("identity: never a name, and never a shirt number on its own where points are at stake", () => {
  const result = run("masZemamra");

  test("players named in an incident are paired on that incident; the rest on shirt number, and say so", () => {
    const byBasis = (basis: string) => result.players.filter((p) => p.identity === basis);
    expect(byBasis("incident").length).toBeGreaterThan(0);
    expect(byBasis("shirt").length).toBeGreaterThan(0);
    for (const p of byBasis("shirt")) {
      // Nothing was attributed to them by either provider.
      expect(p.stats.goals).toBe(0);
      expect(p.stats.yellowCards).toBe(0);
      expect(p.stats.assists).toBe(0);
      expect(p.evidence.goals?.references).toContain("identity:shirt-only");
    }
    for (const p of byBasis("incident")) {
      expect(p.evidence.goals?.references).not.toContain("identity:shirt-only");
    }
  });

  test("renaming every Flashscore player changes nothing", () => {
    const renamed = run(
      "masZemamra",
      withFlash((data) => ({
        ...data,
        lineups: {
          ...data.lineups,
          players: data.lineups.players.map((p) => ({ ...p, name: "Nobody" })),
        },
      })),
    );
    expect(renamed).toEqual(result);
  });

  test("players the providers spell differently are paired by shirt number", () => {
    const touarga = run("touargaFus");
    const lahtimi = player(touarga, "away", 9);
    expect(lahtimi.sofascoreId).not.toBe(lahtimi.flashscoreId);
    expect(lahtimi.displayName).toBe("Mountassir Lahtimi");
    expect(lahtimi.identity).toBe("incident");
  });

  test("a player who cannot be paired is listed for review, never created", () => {
    const touarga = run("touargaFus");
    expect(touarga.unmatched.length).toBeGreaterThan(0);
    for (const u of touarga.unmatched) {
      expect(
        touarga.players.some(
          (p) => p.sofascoreId === u.providerId || p.flashscoreId === u.providerId,
        ),
      ).toBe(false);
    }
    expect(touarga.players.length).toBeLessThanOrEqual(
      load("touargaFus").sofascore.lineups.players.length,
    );
  });

  test("a Flashscore keeper against a Sofascore outfield player is not the same player", () => {
    const conflict = run(
      "masZemamra",
      withFlash((data) => ({
        ...data,
        lineups: {
          ...data.lineups,
          players: data.lineups.players.map((p) =>
            p.side === "home" && p.shirtNumber === 8 ? { ...p, position: "G" as const } : p,
          ),
        },
      })),
    );
    expect(conflict.players.some((p) => p.side === "home" && p.shirtNumber === 8)).toBe(false);
    expect(conflict.unmatched.filter((u) => u.reason === "position_conflict")).toHaveLength(2);
    expect(conflict.mode).toBe("incomplete");
  });
});

describe("limited coverage: assists are unknown, not zero", () => {
  test("a goal that no provider gives an assister for leaves assists unknown for the side", () => {
    const result = run(
      "touargaFus",
      withFlash((data) => {
        const at = data.incidents.findIndex((i) => i.kind === "goal" && i.side === "home");
        return {
          ...data,
          incidents: data.incidents.map((i, index) => (index === at ? { ...i, assist: null } : i)),
        };
      }),
    );
    expect(result.scorableMode).toBe("simple");
    const home = result.players.filter((p) => p.side === "home" && p.shirtNumber !== null);
    const named = home.find((p) => p.stats.assists === 1);
    expect(named).toBeDefined();
    const others = home.filter((p) => p !== named);
    expect(others.every((p) => p.stats.assists === undefined)).toBe(true);
    expect(others.every((p) => p.evidence.assists?.state === "unknown")).toBe(true);
    expect(codes(result)).toContain("assist_unconfirmed");
  });
});

describe("whole-match guards", () => {
  test("a missing provider means review", () => {
    const result = run("masZemamra", (input) => ({ ...input, flashscore: null }));
    expect(result.mode).toBe("review");
    expect(codes(result)).toEqual(["provider_missing"]);
  });

  test("different final scores mean review", () => {
    const result = run(
      "masZemamra",
      withFlash((data) => ({ ...data, summary: { ...data.summary, homeScore: 5 } })),
    );
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("score_mismatch");
  });

  test("goals that do not add up to the score in either provider mean review", () => {
    const result = run(
      "masZemamra",
      withFlash((data) => ({
        ...data,
        incidents: data.incidents.filter(
          (i, index) => !(isGoal(i) && index === data.incidents.findIndex(isGoal)),
        ),
      })),
    );
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("score_mismatch");
  });

  test("a label not seen in Phase 0 that could change a score means review", () => {
    const result = run(
      "masZemamra",
      withFlash((data) => ({
        ...data,
        incidents: [
          ...data.incidents,
          { ...data.incidents[0]!, kind: "unknown" as const, rawType: "RED_CARD" },
        ],
      })),
    );
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("unknown_incident");
  });

  test("an own goal in Sofascore's statistics that no incident explains means review", () => {
    const result = run(
      "masZemamra",
      withSofa((data) => ({
        ...data,
        lineups: {
          ...data.lineups,
          players: data.lineups.players.map((p, index) =>
            index === 0 && p.stats ? { ...p, stats: { ...p.stats, ownGoals: 1 } } : p,
          ),
        },
      })),
    );
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("own_goal_unconfirmed");
  });

  test("keeper saves plus goals conceded must equal the shots on target faced", () => {
    const result = run(
      "masZemamra",
      withSofa((data) => ({
        ...data,
        lineups: {
          ...data.lineups,
          players: data.lineups.players.map((p) =>
            p.position === "G" && p.starter && p.stats && p.stats.saves !== null
              ? { ...p, stats: { ...p.stats, saves: p.stats.saves + 1 } }
              : p,
          ),
        },
      })),
    );
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("saves_identity");
  });
});

describe("the seven matches both providers cover, as delivered", () => {
  const outcomes = (options: Partial<ReconcileInput> = {}) =>
    Object.fromEntries(
      (Object.keys(MATCHES) as MatchKey[]).map((key) => {
        const r = run(key, (input) => ({ ...input, ...options }));
        return [key, [r.mode, r.scorableMode, r.heldBack]];
      }),
    );

  test("default rules", () => {
    expect(outcomes()).toEqual({
      touargaFus: ["incomplete", "simple", 1],
      dhjCodm: ["review", null, 0],
      wacTemara: ["review", null, 0],
      tiznitTanger: ["incomplete", "full", 3],
      masZemamra: ["full", "full", 0],
      tetouanBerkane: ["incomplete", "full", 2],
      kacmHusa: ["simple", "simple", 0],
    });
  });

  test("with the goal-pairs-the-scorer option on (not recommended)", () => {
    expect(outcomes({ linkIdentityByGoal: true })).toMatchObject({
      dhjCodm: ["incomplete", "simple", 10],
      wacTemara: ["incomplete", "simple", 13],
    });
  });
});
