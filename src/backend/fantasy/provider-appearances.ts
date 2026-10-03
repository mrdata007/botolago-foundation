/**
 * Who has to be accounted for in a finished match, and on what evidence.
 *
 * Pure. The identity worklist, the replay coverage and the bridge all read
 * this, so a player cannot be accounted for in one and missing from another.
 *
 * A player is accounted for when ANY of these holds. They are kept apart, because
 * one does not imply the next and none of them is inferred from another:
 * - STARTER: the lineup says he started;
 * - SUBSTITUTED_IN: a substitution incident brings him on;
 * - MINUTES_WITHOUT_SUBSTITUTION_INCIDENT: Sofascore records positive minutes for
 *   a non-starter although no substitution incident brings him on (the incident
 *   feed is incomplete, or the two disagree);
 * - BENCH_INCIDENT_ONLY: not a starter, no substitution, no positive minutes, but
 *   named in a goal, assist, card or missed penalty. His participation is UNKNOWN:
 *   a card can be shown to an unused substitute, and nothing here says he played;
 * - INCIDENT_ONLY_NOT_IN_LINEUP: an incident names an id that is in no lineup.
 *   No lineup entry is invented for him.
 *
 * There is deliberately NO state for "did not play". Missing data, a failed
 * request, an absent incident or silence is never converted into verified
 * non-participation: the most this file can say is UNKNOWN.
 */
import type {
  MatchSide,
  PerformanceIncident,
  PerformanceLineupPlayer,
} from "../football/provider/performance-contracts";
import type { ProviderMatchData } from "./provider-reconciler";

export type ParticipationEvidence =
  | "STARTER"
  | "SUBSTITUTED_IN"
  | "MINUTES_WITHOUT_SUBSTITUTION_INCIDENT"
  | "BENCH_INCIDENT_ONLY"
  | "INCIDENT_ONLY_NOT_IN_LINEUP";

/**
 * VERIFIED: the evidence says he took part and nothing contradicts it.
 * CONTRADICTORY: two pieces of evidence about his participation disagree.
 * UNKNOWN: participation is not established either way.
 * (No "verified non-participation": see the file comment.)
 */
export type ParticipationState = "VERIFIED" | "CONTRADICTORY" | "UNKNOWN";

export type ParticipationDiscrepancy =
  | "starter_with_zero_recorded_minutes"
  | "substituted_in_with_zero_recorded_minutes"
  | "minutes_recorded_without_substitution_incident"
  | "bench_player_named_in_incident"
  | "incident_names_id_absent_from_lineup";

export interface AppearanceRecord {
  readonly provider: "sofascore" | "flashscore";
  readonly externalId: string;
  /** Null only for an id no lineup lists. */
  readonly lineup: PerformanceLineupPlayer | null;
  /** The side an incident gives, for an id with no lineup entry. */
  readonly side: MatchSide | null;
  readonly evidence: ParticipationEvidence;
  readonly state: ParticipationState;
  readonly discrepancies: readonly ParticipationDiscrepancy[];
  readonly scorer: boolean;
  readonly assister: boolean;
  readonly carded: boolean;
  /** Named in a goal, assist, card or missed penalty: points depend on this identity. */
  readonly scoringRelevant: boolean;
}

const SCORING_KINDS = new Set([
  "goal",
  "penalty_goal",
  "penalty_missed",
  "yellow_card",
  "second_yellow",
  "red_card",
]);

interface Named {
  readonly id: string;
  readonly side: MatchSide;
  readonly incident: PerformanceIncident;
  readonly role: "player" | "assist" | "in" | "out";
}

function namedIn(incidents: readonly PerformanceIncident[]): Named[] {
  const out: Named[] = [];
  for (const incident of incidents) {
    const refs: [Named["role"], string | null | undefined][] = [
      ["player", incident.player?.externalId],
      ["assist", incident.assist?.externalId],
      ["in", incident.playerIn?.externalId],
      ["out", incident.playerOut?.externalId],
    ];
    for (const [role, id] of refs) {
      if (id) out.push({ id, side: incident.side, incident, role });
    }
  }
  return out;
}

/** Every player to account for in one provider's payload, with the evidence for each. */
export function classifyAppearances(
  data: ProviderMatchData,
  provider: "sofascore" | "flashscore",
): AppearanceRecord[] {
  const named = namedIn(data.incidents);
  const lineupIds = new Set(data.lineups.players.map((p) => p.externalId));
  const cameOn = new Set(named.filter((n) => n.role === "in").map((n) => n.id));
  const scoringNamed = (id: string) =>
    named.filter(
      (n) =>
        n.id === id &&
        (n.role === "assist" || SCORING_KINDS.has(n.incident.kind)) &&
        n.role !== "in" &&
        n.role !== "out",
    );
  const flags = (id: string) => {
    const mine = named.filter((n) => n.id === id);
    return {
      scorer: mine.some(
        (n) =>
          n.role === "player" && (n.incident.kind === "goal" || n.incident.kind === "penalty_goal"),
      ),
      assister: mine.some((n) => n.role === "assist"),
      carded: mine.some(
        (n) =>
          n.role === "player" &&
          (n.incident.kind === "yellow_card" ||
            n.incident.kind === "second_yellow" ||
            n.incident.kind === "red_card"),
      ),
      scoringRelevant: scoringNamed(id).length > 0,
    };
  };

  const records: AppearanceRecord[] = [];
  for (const p of data.lineups.players) {
    const minutes = p.stats?.minutesPlayed ?? null;
    const f = flags(p.externalId);
    const base = { provider, externalId: p.externalId, lineup: p, side: p.side, ...f };
    if (p.starter) {
      const zero = minutes === 0;
      records.push({
        ...base,
        evidence: "STARTER",
        state: zero ? "CONTRADICTORY" : "VERIFIED",
        discrepancies: zero ? ["starter_with_zero_recorded_minutes"] : [],
      });
    } else if (cameOn.has(p.externalId)) {
      const zero = minutes === 0;
      records.push({
        ...base,
        evidence: "SUBSTITUTED_IN",
        state: zero ? "CONTRADICTORY" : "VERIFIED",
        discrepancies: zero ? ["substituted_in_with_zero_recorded_minutes"] : [],
      });
    } else if (minutes !== null && minutes > 0) {
      // Positive recorded minutes are evidence he played; the incident feed is the incomplete part.
      records.push({
        ...base,
        evidence: "MINUTES_WITHOUT_SUBSTITUTION_INCIDENT",
        state: "VERIFIED",
        discrepancies: ["minutes_recorded_without_substitution_incident"],
      });
    } else if (f.scoringRelevant) {
      records.push({
        ...base,
        evidence: "BENCH_INCIDENT_ONLY",
        state: "UNKNOWN",
        discrepancies: ["bench_player_named_in_incident"],
      });
    }
  }
  // An id no lineup lists. No entry is invented; the side is the one the incident gives.
  const seen = new Set<string>();
  for (const n of named) {
    if (lineupIds.has(n.id) || seen.has(n.id)) continue;
    const f = flags(n.id);
    if (!f.scoringRelevant && n.role !== "in" && n.role !== "out") continue;
    seen.add(n.id);
    records.push({
      provider,
      externalId: n.id,
      lineup: null,
      side: n.side,
      evidence: "INCIDENT_ONLY_NOT_IN_LINEUP",
      state: "UNKNOWN",
      discrepancies: ["incident_names_id_absent_from_lineup"],
      ...f,
    });
  }
  return records;
}
