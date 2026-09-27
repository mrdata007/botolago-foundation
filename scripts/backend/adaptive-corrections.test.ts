import { expect, test } from "bun:test";
import { prepareAdaptiveCorrection } from "./adaptive-corrections";
const id = (n: number) => `ca000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = () => ({
  expectedDigest: null,
  reason: "Official match report checked",
  reviewer: "operator",
  references: ["official:sheet:1"],
  homeScore: 0,
  awayScore: 0,
  anonymousStarters: 0,
  anonymousByTeam: {},
  participationComplete: true,
  disciplineComplete: true,
  players: Array.from({ length: 22 }, (_, i) => ({
    playerId: id(i + 1),
    teamId: id(100 + Math.floor(i / 11)),
    started: true,
    stats: {},
    evidence: {},
    timeline: {
      complete: true,
      orderingVerified: true,
      appeared: true,
      started: true,
      enteredAt: null,
      exitedAt: 60,
      concededAt: [],
    },
  })),
});
test("reviewed timeline retains proof and simple-only derived participation", () => {
  const out = prepareAdaptiveCorrection(input(), "2026-09-27T12:00:00Z");
  expect(out.players[0]!.stats.minutes).toBe(60);
  expect(out.players[0]!.evidence.minutes!.state).toBe("derived");
  expect(out.players[0]!.evidence.minutes!.references).toEqual(["official:sheet:1"]);
});
test("conflicting identities and ambiguous defensive ordering need review", () => {
  const doc = input();
  doc.players[1]!.playerId = doc.players[0]!.playerId;
  expect(() => prepareAdaptiveCorrection(doc, "2026-09-27T12:00:00Z")).toThrow(
    "adaptive_duplicate_identity",
  );
  const ambiguous = input();
  ambiguous.players[0]!.timeline.concededAt = [60];
  expect(() => prepareAdaptiveCorrection(ambiguous, "2026-09-27T12:00:00Z")).toThrow(
    "participation_event_order_ambiguous",
  );
});

test("final ranking estimates require explicit acceptance and retain their assumption", () => {
  const base = input();
  const doc = {
    ...base,
    players: base.players.map((p) => ({
      ...p,
      timeline: undefined,
      stats: { minutes: 59 },
      evidence: {
        minutes: {
          state: "estimated",
          source: "reviewed-best-available",
          observedAt: "2026-09-27T12:00:00Z",
          references: ["report:fixture:1"],
          reason: "Use published substitution minute",
        },
      },
    })),
  };
  expect(() => prepareAdaptiveCorrection(doc, "2026-09-27T12:00:00Z")).toThrow(
    "adaptive_estimate_acceptance_required",
  );
  const accepted = {
    ...doc,
    estimateAcceptance: {
      policy: "best-available-v1",
      finalForRankings: true,
      assumptions: ["Use published substitution minute"],
    },
  };
  const out = prepareAdaptiveCorrection(accepted, "2026-09-27T12:00:00Z");
  expect(out.players[0]!.stats.minutes).toBe(59);
  expect(out.players[0]!.evidence.minutes!.state).toBe("estimated");
  expect(out.estimateAcceptance!.finalForRankings).toBe(true);
  expect(() =>
    prepareAdaptiveCorrection(
      { ...accepted, estimatedNonParticipants: [id(1)] },
      "2026-09-27T12:00:00Z",
    ),
  ).toThrow("adaptive_conflicting_participation");
  doc.players[0]!.evidence.minutes.source = "unreviewed";
  expect(() => prepareAdaptiveCorrection(accepted, "2026-09-27T12:00:00Z")).toThrow(
    "adaptive_estimate_evidence_invalid",
  );
});
