import { describe, expect, test } from "bun:test";
import {
  parseFlashscoreData,
  parseFlashscoreLineups,
  parseFlashscoreStatistics,
  parseFlashscoreSummary,
} from "../football/provider/flashscore-adapter";
import type { PerformanceLineups } from "../football/provider/performance-contracts";
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

describe("Touarga 2-1 FUS (Sofascore limited coverage)", () => {
  const result = run("touargaFus");

  test("scores in simple mode: saves are unknown, nothing is derived from shots on target", () => {
    expect(result.mode).toBe("simple");
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
    for (const shirt of [15, 31, 29])
      expect(player(result, "home", shirt).stats.yellowCards).toBe(1);
    // The two FUS yellows (34' and 78') are in both providers too.
    expect(result.players.reduce((n, p) => n + (p.stats.yellowCards ?? 0), 0)).toBe(5);
    expect(result.players.reduce((n, p) => n + (p.stats.redCards ?? 0), 0)).toBe(0);
  });

  test("minutes and clean sheets follow the substitution times and the goals", () => {
    const regragui = player(result, "home", 15); // off at 59'
    expect(regragui.stats.minutes).toBe(59);
    expect(regragui.stats.goalsConceded).toBe(0);
    expect(regragui.stats.cleanSheet).toBe(false);
    const lahtimi = player(result, "away", 9);
    expect(lahtimi.stats.goalsConceded).toBe(2);
  });

  test("Sofascore ratings are kept for display only", () => {
    expect(result.players.every((p) => !("rating" in p.stats))).toBe(true);
  });
});

describe("Tiznit 1-3 Tanger", () => {
  test("goes to review as delivered: Sofascore's home lineup lists only 10 starters", () => {
    const result = run("tiznitTanger");
    expect(result.mode).toBe("review");
    expect(result.players).toHaveLength(0);
    expect(codes(result)).toContain("starters_count");
  });

  /**
   * The missing starter is repaired here in memory, only to show the rest of
   * the logic: Flashscore lists "Bouhbouh" as shirt 6 and a starter "Assouab"
   * as shirt 13, where Sofascore has Bouhbouh as 13 and no Assouab at all.
   */
  const repaired = (input: ReconcileInput): ReconcileInput => {
    if (!input.sofascore) return input;
    const players = input.sofascore.lineups.players.map((p) =>
      p.side === "home" && p.shirtNumber === 13 ? { ...p, shirtNumber: 6 } : p,
    );
    players.push({
      provider: "sofascore",
      externalId: "synthetic-assouab",
      name: "Assouab (synthetic)",
      side: "home",
      shirtNumber: 13,
      position: "D",
      starter: true,
      stats: {
        minutesPlayed: 90,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        saves: null,
        rating: null,
        penaltyMissed: 0,
      },
    });
    const lineups: PerformanceLineups = { ...input.sofascore.lineups, players };
    return { ...input, sofascore: { ...input.sofascore, lineups } };
  };

  test("with that gap repaired: assists from both providers, saves verified from Sofascore", () => {
    const result = run("tiznitTanger", repaired);
    expect(result.discrepancies.filter((d) => d.level === "fixture")).toEqual([]);
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
});

describe("DHJ 2-6 CODM", () => {
  test("each provider's own incident list adds up to 8 goals, 2 for the home side and 6 for the away", () => {
    const { sofascore, flashscore } = load("dhjCodm");
    for (const data of [sofascore, flashscore]) {
      const goals = data.incidents.filter((i) => i.kind === "goal" || i.kind === "penalty_goal");
      expect(goals).toHaveLength(8);
      expect(goals.filter((g) => g.side === "home")).toHaveLength(2);
      expect(goals.filter((g) => g.side === "away")).toHaveLength(6);
    }
  });

  test("but the two lists do not agree on who scored and when, so the match goes to review", () => {
    // Sofascore times two penalties at 10' and 13'; Flashscore at 13' and 22'.
    // The providers also give one scorer different shirt numbers (6 and 21).
    const result = run("dhjCodm");
    expect(result.mode).toBe("review");
    expect(result.players).toHaveLength(0);
    expect(codes(result)).toContain("goal_mismatch");
  });
});

describe("a disagreement on a scorer", () => {
  test("sends the whole match to review and scores nothing", () => {
    const result = run("masZemamra", (input) => {
      if (!input.flashscore) return input;
      let changed = false;
      const incidents = input.flashscore.incidents.map((i) => {
        if (changed || i.kind !== "goal" || !i.player) return i;
        changed = true;
        return { ...i, player: { externalId: "someone-else", name: "Someone Else" } };
      });
      return { ...input, flashscore: { ...input.flashscore, incidents } };
    });
    expect(result.mode).toBe("review");
    expect(result.players).toEqual([]);
    expect(codes(result)).toContain("goal_mismatch");
  });

  test("so does a goal missing from one list", () => {
    const result = run("masZemamra", (input) => {
      if (!input.flashscore) return input;
      const goalAt = input.flashscore.incidents.findIndex((i) => i.kind === "goal");
      const incidents = input.flashscore.incidents.filter((_, index) => index !== goalAt);
      return { ...input, flashscore: { ...input.flashscore, incidents } };
    });
    expect(result.mode).toBe("review");
    expect(result.players).toEqual([]);
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
    const references = withDigests.players[0]?.evidence.goals?.references;
    expect(references).toEqual([
      "sofascore:17132481",
      "flashscore:W81WOcb5",
      "sha256:aaaa",
      "sha256:bbbb",
    ]);
  });
});

describe("limited coverage: assists are unknown, not zero", () => {
  test("a goal that no provider gives an assister for leaves assists unknown for the side", () => {
    const result = run("touargaFus", (input) => {
      if (!input.flashscore) return input;
      const at = input.flashscore.incidents.findIndex(
        (i) => i.kind === "goal" && i.side === "home",
      );
      const incidents = input.flashscore.incidents.map((i, index) =>
        index === at ? { ...i, assist: null } : i,
      );
      return { ...input, flashscore: { ...input.flashscore, incidents } };
    });
    expect(result.mode).toBe("simple");
    const home = result.players.filter((p) => p.side === "home" && p.shirtNumber !== null);
    const named = home.find((p) => p.stats.assists === 1);
    expect(named).toBeDefined();
    const others = home.filter((p) => p !== named);
    expect(others.every((p) => p.stats.assists === undefined)).toBe(true);
    expect(others.every((p) => p.evidence.assists?.state === "unknown")).toBe(true);
    expect(codes(result)).toContain("assist_unconfirmed");
  });
});

describe("identity: side and shirt number, never name", () => {
  test("renaming every Flashscore player changes nothing", () => {
    const base = run("masZemamra");
    const renamed = run("masZemamra", (input) => {
      if (!input.flashscore) return input;
      const players = input.flashscore.lineups.players.map((p) => ({ ...p, name: "Nobody" }));
      return {
        ...input,
        flashscore: { ...input.flashscore, lineups: { ...input.flashscore.lineups, players } },
      };
    });
    expect(renamed).toEqual(base);
  });

  test("players the providers spell differently are paired by shirt number", () => {
    const result = run("touargaFus");
    const lahtimi = player(result, "away", 9);
    expect(lahtimi.sofascoreId).not.toBe(lahtimi.flashscoreId);
    expect(lahtimi.displayName).toBe("Mountassir Lahtimi");
  });

  test("a player who cannot be paired is listed for review, never created", () => {
    const result = run("touargaFus");
    expect(result.unmatched.length).toBeGreaterThan(0);
    for (const u of result.unmatched) {
      expect(
        result.players.some(
          (p) => p.sofascoreId === u.providerId || p.flashscoreId === u.providerId,
        ),
      ).toBe(false);
    }
    const pairedCount = result.players.length;
    const sofaCount = load("touargaFus").sofascore.lineups.players.length;
    expect(pairedCount).toBeLessThanOrEqual(sofaCount);
  });

  test("a Flashscore keeper against a Sofascore outfield player is not the same player", () => {
    const result = run("masZemamra", (input) => {
      if (!input.flashscore) return input;
      const players = input.flashscore.lineups.players.map((p) =>
        p.side === "home" && p.shirtNumber === 8 ? { ...p, position: "G" as const } : p,
      );
      return {
        ...input,
        flashscore: { ...input.flashscore, lineups: { ...input.flashscore.lineups, players } },
      };
    });
    expect(result.players.some((p) => p.side === "home" && p.shirtNumber === 8)).toBe(false);
    expect(result.unmatched.filter((u) => u.reason === "position_conflict")).toHaveLength(2);
    expect(result.mode).toBe("incomplete");
  });
});

describe("whole-match guards", () => {
  test("a missing provider means review", () => {
    const result = run("masZemamra", (input) => ({ ...input, flashscore: null }));
    expect(result.mode).toBe("review");
    expect(codes(result)).toEqual(["provider_missing"]);
  });

  test("different final scores mean review", () => {
    const result = run("masZemamra", (input) =>
      input.flashscore
        ? {
            ...input,
            flashscore: {
              ...input.flashscore,
              summary: { ...input.flashscore.summary, homeScore: 5 },
            },
          }
        : input,
    );
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("score_mismatch");
  });

  test("a label not seen in Phase 0 that could change a score means review", () => {
    const result = run("masZemamra", (input) => {
      if (!input.flashscore) return input;
      const incidents = [
        ...input.flashscore.incidents,
        { ...input.flashscore.incidents[0]!, kind: "unknown" as const, rawType: "RED_CARD" },
      ];
      return { ...input, flashscore: { ...input.flashscore, incidents } };
    });
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("unknown_incident");
  });

  test("an own goal in Sofascore's statistics that no incident explains means review", () => {
    const result = run("masZemamra", (input) => {
      if (!input.sofascore) return input;
      const players = input.sofascore.lineups.players.map((p, index) =>
        index === 0 && p.stats ? { ...p, stats: { ...p.stats, ownGoals: 1 } } : p,
      );
      return {
        ...input,
        sofascore: { ...input.sofascore, lineups: { ...input.sofascore.lineups, players } },
      };
    });
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("own_goal_unconfirmed");
  });

  test("keeper saves plus goals conceded must equal the shots on target faced", () => {
    const result = run("masZemamra", (input) => {
      if (!input.sofascore) return input;
      const players = input.sofascore.lineups.players.map((p) =>
        p.position === "G" && p.starter && p.stats && p.stats.saves !== null
          ? { ...p, stats: { ...p.stats, saves: p.stats.saves + 1 } }
          : p,
      );
      return {
        ...input,
        sofascore: { ...input.sofascore, lineups: { ...input.sofascore.lineups, players } },
      };
    });
    expect(result.mode).toBe("review");
    expect(codes(result)).toContain("saves_identity");
  });
});

describe("the seven matches both providers cover, as delivered", () => {
  test("outcome per match", () => {
    const outcome = Object.fromEntries(
      (Object.keys(MATCHES) as MatchKey[]).map((key) => [key, run(key).mode]),
    );
    expect(outcome).toEqual({
      touargaFus: "simple",
      dhjCodm: "review",
      wacTemara: "review",
      tiznitTanger: "review",
      masZemamra: "full",
      tetouanBerkane: "incomplete",
      kacmHusa: "simple",
    });
  });
});
