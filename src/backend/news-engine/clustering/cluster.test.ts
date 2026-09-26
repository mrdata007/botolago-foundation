import { describe, expect, test } from "bun:test";

import {
  CANDIDATE_MATCH_THRESHOLD,
  canonicalEventType,
  clusterClaimStatus,
  decideCluster,
  detectConflict,
  scoreCandidate,
} from "./cluster";
import type { ClusterCandidate, NewsEngineGateway } from "../gateway/contracts";
import type { ExtractedFacts, ResolvedEntities } from "../contracts";

const RAJA = "11111111-1111-1111-1111-111111111111";
const HUSA = "22222222-2222-2222-2222-222222222222";
const PLAYER = "33333333-3333-3333-3333-333333333333";
const OTHER_PLAYER = "44444444-4444-4444-4444-444444444444";

function gatewayReturning(candidates: ClusterCandidate[]): NewsEngineGateway {
  return {
    matchClusters: async () => candidates,
  } as unknown as NewsEngineGateway;
}

function facts(overrides: Partial<ExtractedFacts> = {}): ExtractedFacts {
  return {
    eventType: "official_signing",
    eventDate: "2026-09-21",
    competitionMention: null,
    teamMentions: [],
    playerMentions: [],
    score: null,
    claims: [],
    quotes: [],
    bestClaimStatus: "official",
    confidence: 0.9,
    ...overrides,
  };
}

function entities(overrides: Partial<ResolvedEntities> = {}): ResolvedEntities {
  return {
    teamIds: [RAJA],
    playerIds: [PLAYER],
    competitionId: null,
    unresolved: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<ClusterCandidate> = {}): ClusterCandidate {
  return {
    clusterId: "cluster-1",
    clusterKey: "official_signing:existing",
    eventType: "official_signing",
    eventDate: "2026-09-21",
    storyId: null,
    status: "clustered",
    itemCount: 1,
    sharedTeams: 1,
    sharedPlayers: 1,
    score: 3,
    ...overrides,
  };
}

describe("canonicalEventType", () => {
  test("a rumour and its official confirmation share one cluster type", () => {
    // 09:00 negotiations reported, 17:00 club announces: one story.
    expect(canonicalEventType("official_signing")).toBe(canonicalEventType("transfer_rumour"));
    expect(canonicalEventType("contract_renewal")).toBe(canonicalEventType("transfer_rumour"));
  });

  test("unrelated event types stay distinct", () => {
    expect(canonicalEventType("match_result")).not.toBe(canonicalEventType("injury"));
  });
});

describe("decideCluster", () => {
  test("three reports of one signing produce one deterministic key", async () => {
    const gateway = gatewayReturning([]);
    const first = await decideCluster(gateway, facts(), entities());
    const second = await decideCluster(
      gateway,
      facts({ eventType: "transfer_rumour" }),
      entities({ teamIds: [RAJA], playerIds: [PLAYER] }),
    );
    expect(first.clusterKey).toBe(second.clusterKey);
  });

  test("joins an existing cluster when a strong candidate matches", async () => {
    const existing = candidate({ clusterKey: "official_signing:already-known" });
    const decision = await decideCluster(gatewayReturning([existing]), facts(), entities());
    expect(decision.clusterKey).toBe("official_signing:already-known");
    expect(decision.matchSignal).toBe("shared_player_event");
  });

  test("does not merge on a single shared club", async () => {
    // Two different Raja stories on the same day must stay separate.
    const weak = candidate({
      clusterKey: "official_signing:someone-else",
      sharedTeams: 1,
      sharedPlayers: 0,
    });
    const decision = await decideCluster(
      gatewayReturning([weak]),
      facts(),
      entities({ teamIds: [RAJA], playerIds: [OTHER_PLAYER] }),
    );
    expect(decision.clusterKey).not.toBe("official_signing:someone-else");
    expect(decision.matchSignal).toBe("deterministic_key");
  });

  test("skips candidate matching entirely when nothing resolved", async () => {
    let called = false;
    const gateway = {
      matchClusters: async () => {
        called = true;
        return [];
      },
    } as unknown as NewsEngineGateway;
    const decision = await decideCluster(
      gateway,
      facts(),
      entities({ teamIds: [], playerIds: [] }),
      ["الوداد"],
    );
    expect(called).toBe(false);
    expect(decision.matchSignal).toBe("deterministic_key");
  });

  test("an exact key match short-circuits scoring", async () => {
    const first = await decideCluster(gatewayReturning([]), facts(), entities());
    const exact = candidate({ clusterKey: first.clusterKey, sharedTeams: 0, sharedPlayers: 0 });
    const decision = await decideCluster(gatewayReturning([exact]), facts(), entities());
    expect(decision.clusterKey).toBe(first.clusterKey);
    expect(decision.similarity).toBe(1);
  });
});

describe("scoreCandidate", () => {
  test("weights a shared player above a shared club", () => {
    const playerOnly = scoreCandidate(candidate({ sharedTeams: 0, sharedPlayers: 1 }), {
      teamIds: [RAJA],
      playerIds: [PLAYER],
    });
    const teamOnly = scoreCandidate(candidate({ sharedTeams: 1, sharedPlayers: 0 }), {
      teamIds: [RAJA],
      playerIds: [PLAYER],
    });
    expect(playerOnly).toBeGreaterThan(teamOnly);
  });

  test("returns zero when there is nothing to compare", () => {
    expect(scoreCandidate(candidate(), { teamIds: [], playerIds: [] })).toBe(0);
  });

  test("the match threshold is above a single shared club", () => {
    expect(CANDIDATE_MATCH_THRESHOLD).toBeGreaterThan(1);
  });
});

describe("detectConflict", () => {
  const withScore = (sourceName: string, home: number, away: number) => ({
    sourceName,
    facts: { score: { home, away }, bestClaimStatus: "official" as const, eventDate: "2026-09-21" },
  });

  test("flags two different final scores without choosing one", () => {
    const conflict = detectConflict([withScore("A", 2, 1), withScore("B", 3, 1)]);
    expect(conflict).toContain("disagree on the final score");
    expect(conflict).toContain("A: 2-1");
    expect(conflict).toContain("B: 3-1");
  });

  test("agrees when the sources agree", () => {
    expect(detectConflict([withScore("A", 2, 1), withScore("B", 2, 1)])).toBeNull();
  });

  test("flags conflicting event dates", () => {
    const conflict = detectConflict([
      {
        sourceName: "A",
        facts: { score: null, bestClaimStatus: "reported", eventDate: "2026-09-21" },
      },
      {
        sourceName: "B",
        facts: { score: null, bestClaimStatus: "reported", eventDate: "2026-09-22" },
      },
    ]);
    expect(conflict).toContain("disagree on the event date");
  });

  test("flags an official claim sitting alongside a denial", () => {
    const conflict = detectConflict([
      { sourceName: "A", facts: { score: null, bestClaimStatus: "official", eventDate: null } },
      { sourceName: "B", facts: { score: null, bestClaimStatus: "disputed", eventDate: null } },
    ]);
    expect(conflict).toContain("denial or dispute");
  });

  test("ignores items with no extracted facts", () => {
    expect(detectConflict([{ sourceName: "A", facts: null }])).toBeNull();
  });
});

describe("clusterClaimStatus", () => {
  test("takes the strongest status in the cluster", () => {
    expect(
      clusterClaimStatus([
        { facts: { bestClaimStatus: "rumour" } },
        { facts: { bestClaimStatus: "official" } },
        { facts: { bestClaimStatus: "reported" } },
      ]),
    ).toBe("official");
  });

  test("defaults to rumour when nothing is known", () => {
    expect(clusterClaimStatus([{ facts: null }])).toBe("rumour");
  });
});
