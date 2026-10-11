/**
 * SofaScore-only Fantasy observations (docs/backend/SOFASCORE_FANTASY_SIMPLE.md).
 *
 * Owner decisions of 2026-10-11 (M6, M8): Fantasy player points come from
 * SofaScore alone. There is no second provider and no cross-check. This file is
 * pure: it takes one parsed SofaScore match and a snapshot of the reviewed
 * SofaScore player mappings and returns either the exact request the database
 * takes (`api.service_record_sofascore_fantasy_observation`) or the reasons it
 * cannot, plus the list of appearing players with no reviewed mapping (the
 * mapping review worklist: SofaScore ids and shirt numbers, never names).
 *
 * What is established, and how:
 * - Identity: only a reviewed SofaScore player mapping. Never a name or a shirt.
 *   An appearing player without one holds the whole match back.
 * - Goals: from the incident list, never the lineup statistics (they undercount).
 *   Each side's goals must add up to the final score.
 * - Cards: from the incident list.
 * - Minutes, goals conceded, clean sheet: from substitution and dismissal
 *   incidents (deriveParticipation), checked against SofaScore's own
 *   `minutesPlayed` with the documented tolerance (-2 / +6 minutes).
 * - Assists, saves, penalties saved, penalties missed (decision M8, switched by
 *   SOFASCORE_DETAIL_FIELDS_ENABLED): count only on a FULL-coverage match
 *   (player statistics carry `totalPass`). On a limited-coverage match they are
 *   unknown, never zero; an assist is known there only when an incident names
 *   the assister. A value two SofaScore sources disagree about is unknown.
 *
 * Anything it cannot establish holds the match back instead of being guessed:
 * an own goal (no incident label for it has been seen), a second yellow card, a
 * goal it cannot attribute, a player whose times do not fit.
 */
import { canonicalJson, sha256Hex } from "./canonical-json.ts";
import type {
  LineupPosition,
  MatchSide,
  PerformanceIncident,
  PerformanceLineupPlayer,
  PerformanceLineups,
  PerformanceMatchSummary,
  PerformanceStatisticLine,
} from "./performance-contracts.ts";
import {
  deriveParticipation,
  readiness,
  type CertifiedStats,
  type FieldEvidence,
  type ScoringField,
  type StatisticEvidence,
  type FantasyPosition,
} from "./fantasy-adaptive-core.ts";
import { indexReviewedIdentities, type ReviewedIdentitySnapshot } from "./reviewed-identities.ts";

/**
 * Decision M8 (2026-10-11): assists, saves, penalties saved and penalties missed
 * are scored from SofaScore when available. This is the one switch. Off, every
 * such field is omitted (the fixture then scores in simple mode). It does not
 * change what the database accepts: the SQL function already refuses these
 * fields on a limited-coverage match whatever this says.
 */
export const SOFASCORE_DETAIL_FIELDS_ENABLED = true;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Sofascore `minutesPlayed` counts the clock: up to this many minutes over the substitution time. */
const MAX_STOPPAGE_MINUTES = 6;
const MIN_UNDER_MINUTES = 2;
const SCORE_RELEVANT = /goal|card|penalt|red|yellow|own/i;
const GOAL_KINDS = new Set(["goal", "penalty_goal"]);
const APP_POSITION: Record<LineupPosition, FantasyPosition> = {
  G: "GK",
  D: "DEF",
  M: "MID",
  F: "FWD",
};

export interface SofascoreMatchData {
  readonly summary: PerformanceMatchSummary;
  readonly lineups: PerformanceLineups;
  readonly incidents: readonly PerformanceIncident[];
  readonly statistics: readonly PerformanceStatisticLine[];
}

export interface FixtureBinding {
  readonly appFixtureId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
}

export type BlockerCode =
  | "binding_invalid"
  | "match_not_finished"
  | "score_missing"
  | "goals_do_not_add_up"
  | "unknown_incident"
  | "own_goal_unexplained"
  | "second_yellow_review"
  | "incident_player_not_in_lineup"
  | "appearance_unexplained"
  | "unmapped_players"
  | "duplicate_app_player"
  | "timeline_unresolved"
  | "minutes_mismatch"
  | "starters_not_eleven";

export interface Blocker {
  readonly code: BlockerCode;
  readonly message: string;
  readonly side?: MatchSide;
  readonly shirtNumber?: number | null;
  readonly sofascoreId?: string;
}

/** An appearing player with no reviewed SofaScore mapping: one line of the mapping worklist. */
export interface UnmappedPlayer {
  readonly sofascoreId: string;
  readonly side: MatchSide;
  readonly shirtNumber: number | null;
  readonly started: boolean;
  readonly position: LineupPosition | null;
}

export interface ObservationRow {
  readonly playerId: string;
  readonly teamId: string;
  readonly started: boolean;
  readonly identity: { readonly sofascoreId: string };
  readonly stats: Readonly<Record<string, number | boolean>>;
  readonly evidence: Readonly<Record<string, StatisticEvidence>>;
}

export interface SofascoreObservationRequest {
  readonly sofascoreEventId: string;
  readonly mappingSnapshotDigest: string;
  readonly coverage: "full" | "limited";
  readonly payload: {
    readonly homeScore: number;
    readonly awayScore: number;
    readonly anonymousStarters: 0;
    readonly anonymousByTeam: Record<string, never>;
    readonly references: readonly string[];
    readonly participationComplete: true;
    readonly disciplineComplete: true;
    /** Every player SofaScore says appeared has a row; the database derives who did not take part. */
    readonly squadComplete: true;
    readonly players: readonly ObservationRow[];
  };
}

export interface PreparedSofascoreObservation {
  readonly sofascoreEventId: string;
  readonly appFixtureId: string;
  readonly coverage: "full" | "limited";
  readonly blockers: readonly Blocker[];
  readonly unmapped: readonly UnmappedPlayer[];
  /** The mode the database should report for these facts: full only when every field is established. */
  readonly expectedMode: "full" | "simple" | null;
  readonly rows: number;
  /** Fields left unknown, by name, over all rows (never written as zero). */
  readonly unknownFields: Readonly<Record<string, number>>;
  readonly request: SofascoreObservationRequest | null;
  readonly requestDigest: string | null;
}

export interface PrepareInput {
  readonly observedAt: string;
  readonly match: SofascoreMatchData;
  readonly snapshot: ReviewedIdentitySnapshot;
  readonly binding: FixtureBinding;
  /** sha256 of the raw responses, added to the evidence references. */
  readonly payloadDigest?: string;
  /** Test hook for the M8 switch; defaults to SOFASCORE_DETAIL_FIELDS_ENABLED. */
  readonly detailFields?: boolean;
}

const minutesAgree = (observed: number, computed: number) =>
  observed - computed >= -MIN_UNDER_MINUTES && observed - computed <= MAX_STOPPAGE_MINUTES;

export async function prepareSofascoreObservation(
  input: PrepareInput,
): Promise<PreparedSofascoreObservation> {
  const { match, snapshot, binding, observedAt } = input;
  const detailOn = input.detailFields ?? SOFASCORE_DETAIL_FIELDS_ENABLED;
  const eventId = match.summary.externalId;
  const full = match.lineups.fullCoverage;
  const index = indexReviewedIdentities(snapshot);
  const blockers: Blocker[] = [];
  const block = (b: Blocker) => blockers.push(b);

  if (
    !UUID.test(binding.appFixtureId) ||
    !UUID.test(binding.homeTeamId) ||
    !UUID.test(binding.awayTeamId) ||
    binding.homeTeamId === binding.awayTeamId
  )
    block({ code: "binding_invalid", message: "Three lowercase UUIDs and two different teams." });
  if (!match.summary.finished)
    block({ code: "match_not_finished", message: "SofaScore does not report the match finished." });
  const { homeScore, awayScore } = match.summary;
  if (homeScore === null || awayScore === null)
    block({ code: "score_missing", message: "SofaScore gives no final score." });

  // ---- incidents ---------------------------------------------------------------
  for (const i of match.incidents) {
    if (i.kind !== "unknown") continue;
    const label = `${i.rawType}${i.rawClass ? `/${i.rawClass}` : ""}`;
    if (SCORE_RELEVANT.test(label))
      block({
        code: "unknown_incident",
        message: `Incident "${label}" is a label not seen before and not safe to guess.`,
        side: i.side,
      });
  }
  if (
    match.lineups.players.some((p) => (p.stats?.ownGoals ?? 0) > 0) &&
    !blockers.some((b) => b.code === "unknown_incident")
  )
    block({
      code: "own_goal_unexplained",
      message: "SofaScore credits an own goal that no incident explains.",
    });
  if (match.incidents.some((i) => i.kind === "second_yellow"))
    block({
      code: "second_yellow_review",
      message:
        "A second yellow card: whether the first yellow is also listed is not established, so it is held for review.",
    });
  const goals = match.incidents.filter((i) => GOAL_KINDS.has(i.kind));
  if (homeScore !== null && awayScore !== null) {
    for (const side of ["home", "away"] as const) {
      const expected = side === "home" ? homeScore : awayScore;
      if (goals.filter((g) => g.side === side).length !== expected)
        block({
          code: "goals_do_not_add_up",
          message: `The ${side} goal incidents do not add up to the final score.`,
          side,
        });
    }
  }

  // ---- lineup -------------------------------------------------------------------
  const lineupById = new Map<string, PerformanceLineupPlayer>();
  for (const p of match.lineups.players) lineupById.set(p.externalId, p);
  const subIn = new Map<string, number>();
  const subOut = new Map<string, number>();
  for (const i of match.incidents) {
    if (i.kind !== "substitution") continue;
    if (i.playerIn?.externalId) subIn.set(i.playerIn.externalId, i.minute);
    if (i.playerOut?.externalId) subOut.set(i.playerOut.externalId, i.minute);
  }
  const referenced = new Set<string>();
  for (const i of match.incidents) {
    if (i.kind === "unknown") continue;
    for (const r of [i.player, i.playerIn, i.playerOut, i.assist])
      if (r?.externalId) referenced.add(r.externalId);
  }
  for (const id of referenced) {
    if (!lineupById.has(id))
      block({
        code: "incident_player_not_in_lineup",
        message: "An incident names a player who is not in the lineup.",
        sofascoreId: id,
      });
  }

  const starters: Record<MatchSide, number> = { home: 0, away: 0 };
  const appearing: PerformanceLineupPlayer[] = [];
  for (const p of match.lineups.players) {
    const cameOn = subIn.has(p.externalId);
    if (p.starter) starters[p.side] += 1;
    if (!p.starter && !cameOn && (p.stats?.minutesPlayed ?? 0) > 0) {
      block({
        code: "appearance_unexplained",
        message: "A substitute has minutes but no substitution incident.",
        side: p.side,
        shirtNumber: p.shirtNumber,
        sofascoreId: p.externalId,
      });
      continue;
    }
    if (p.starter || cameOn) appearing.push(p);
  }
  for (const side of ["home", "away"] as const)
    if (starters[side] !== 11)
      block({
        code: "starters_not_eleven",
        message: `${side}: ${starters[side]} starters in the lineup, 11 are needed.`,
        side,
      });

  const unmapped: UnmappedPlayer[] = [];
  const appOf = new Map<string, string>();
  const seenApp = new Set<string>();
  for (const p of appearing) {
    const app = index.appPlayerOf("sofascore", p.externalId);
    if (app === null) {
      unmapped.push({
        sofascoreId: p.externalId,
        side: p.side,
        shirtNumber: p.shirtNumber,
        started: p.starter,
        position: p.position,
      });
      continue;
    }
    const lower = app.toLowerCase();
    if (seenApp.has(lower))
      block({
        code: "duplicate_app_player",
        message: "Two SofaScore players resolve to one app player.",
        sofascoreId: p.externalId,
      });
    seenApp.add(lower);
    appOf.set(p.externalId, lower);
  }
  if (unmapped.length > 0)
    block({
      code: "unmapped_players",
      message: `${unmapped.length} appearing player(s) have no reviewed SofaScore mapping.`,
    });

  // ---- saves identity (full coverage): saves + goals conceded = shots on target faced
  const savesTrusted: Record<MatchSide, boolean> = { home: true, away: true };
  const line = match.statistics.find((l) => l.period === "ALL" && l.key === "shotsOnGoal");
  if (full && line && line.home !== null && line.away !== null && homeScore !== null) {
    for (const side of ["home", "away"] as const) {
      const keepers = match.lineups.players.filter((p) => p.side === side && p.position === "G");
      const missing = keepers.some(
        (k) => k.stats !== null && k.stats.saves === null && (k.stats.minutesPlayed ?? 0) > 0,
      );
      if (missing) continue;
      const saves = keepers.reduce((sum, k) => sum + (k.stats?.saves ?? 0), 0);
      const conceded = side === "home" ? (awayScore as number) : homeScore;
      const faced = side === "home" ? line.away : line.home;
      if (saves + conceded !== faced) savesTrusted[side] = false;
    }
  }

  // ---- rows ---------------------------------------------------------------------
  const teamOf: Record<MatchSide, string> = { home: binding.homeTeamId, away: binding.awayTeamId };
  const references = [
    `sofascore:event:${eventId}`,
    `mapping-snapshot:sha256:${snapshot.digest}`,
    ...(input.payloadDigest ? [`sofascore:payload:${input.payloadDigest}`] : []),
  ];
  const proof = (state: StatisticEvidence["state"]): StatisticEvidence => ({
    state,
    source: "sofascore",
    observedAt,
    references: [...references],
  });
  const opposite = (s: MatchSide): MatchSide => (s === "home" ? "away" : "home");
  const rows: ObservationRow[] = [];
  const unknownFields: Record<string, number> = {};
  let allFull = true;

  for (const p of appearing) {
    const appId = appOf.get(p.externalId);
    if (!appId) continue;
    const where = { side: p.side, shirtNumber: p.shirtNumber, sofascoreId: p.externalId };
    const mine = (kind: string) =>
      match.incidents.filter((i) => i.kind === kind && i.player?.externalId === p.externalId);
    const started = p.starter;
    const entered = subIn.get(p.externalId) ?? null;
    const left = subOut.get(p.externalId) ?? null;
    const dismissal = [...mine("red_card"), ...mine("second_yellow")]
      .map((i) => i.minute)
      .sort((a, b) => a - b)[0];
    const exits = [left, dismissal ?? null].filter((m): m is number => m !== null);

    let part: ReturnType<typeof deriveParticipation>;
    try {
      part = deriveParticipation({
        complete: true,
        orderingVerified: true,
        appeared: true,
        started,
        enteredAt: started ? null : entered,
        exitedAt: exits.length > 0 ? Math.min(...exits) : null,
        concededAt: goals.filter((g) => g.side === opposite(p.side)).map((g) => g.minute),
      });
    } catch {
      block({
        code: "timeline_unresolved",
        message:
          "His times are ambiguous (a goal on the minute of a substitution or dismissal, or times that do not fit).",
        ...where,
      });
      continue;
    }
    const start = started ? 0 : (entered ?? 0);
    const played = p.stats?.minutesPlayed ?? null;
    if (played === null || !minutesAgree(Math.min(played, 90 - start), part.minutes)) {
      block({
        code: "minutes_mismatch",
        message:
          played === null
            ? "SofaScore gives no minutes to check the substitution times against."
            : "SofaScore minutes disagree with the substitution times.",
        ...where,
      });
      continue;
    }

    const stats: { -readonly [K in ScoringField]?: CertifiedStats[K] } = {};
    const evidence: { -readonly [K in ScoringField]?: StatisticEvidence } = {};
    const fact = <K extends ScoringField>(field: K, value: CertifiedStats[K]) => {
      stats[field] = value;
      evidence[field] = proof("verified");
    };
    const unknown = (field: ScoringField) => {
      evidence[field] = proof("unknown");
      unknownFields[field] = (unknownFields[field] ?? 0) + 1;
    };
    fact("minutes", part.minutes);
    fact("goalsConceded", part.goalsConceded);
    fact("cleanSheet", part.cleanSheet);
    fact("goals", mine("goal").length + mine("penalty_goal").length);
    fact("ownGoals", 0); // any label that could hide an own goal already held the match back
    fact("yellowCards", mine("yellow_card").length);
    fact("redCards", mine("red_card").length);
    fact("secondYellowDismissals", 0); // a second yellow holds the match back above

    if (detailOn) {
      const keeper = p.position === "G";
      const named = goals.filter(
        (g) => g.kind === "goal" && g.assist?.externalId === p.externalId,
      ).length;
      if (full) {
        // Two readings of the same fact: the lineup statistic and the incidents.
        const stat = p.stats?.assists ?? null;
        if (stat !== null && stat === named) fact("assists", named);
        else unknown("assists");
        const missedHere = mine("penalty_missed").length;
        const statMissed = p.stats?.penaltyMissed ?? 0;
        if (statMissed === missedHere) fact("penaltiesMissed", missedHere);
        else unknown("penaltiesMissed");
        if (keeper) {
          const saves = p.stats?.saves ?? null;
          if (saves !== null && savesTrusted[p.side]) fact("saves", saves);
          else unknown("saves");
          // A penalty missed against his team may or may not have been a save.
          const against = match.incidents.some(
            (i) => i.kind === "penalty_missed" && i.side === opposite(p.side),
          );
          if (against) unknown("penaltiesSaved");
          else fact("penaltiesSaved", 0);
        }
      } else {
        // Limited coverage: unknown, never zero. An incident that names him is a fact.
        if (named > 0) fact("assists", named);
        else unknown("assists");
        unknown("penaltiesMissed");
        if (keeper) {
          unknown("saves");
          unknown("penaltiesSaved");
        }
      }
    }

    const state = readiness(
      stats as CertifiedStats,
      evidence as FieldEvidence,
      p.position ? APP_POSITION[p.position] : "MID",
    );
    if (!state.full) allFull = false;
    const cleanStats: Record<string, number | boolean> = {};
    for (const [k, v] of Object.entries(stats)) if (v !== undefined) cleanStats[k] = v;
    rows.push({
      playerId: appId,
      teamId: teamOf[p.side],
      started,
      identity: { sofascoreId: p.externalId },
      stats: cleanStats,
      evidence: Object.fromEntries(
        Object.entries(evidence).map(([k, v]) => [k, v as StatisticEvidence]),
      ),
    });
  }

  const base = {
    sofascoreEventId: eventId,
    appFixtureId: binding.appFixtureId,
    coverage: (full ? "full" : "limited") as "full" | "limited",
    unmapped,
    rows: rows.length,
    unknownFields,
  };
  if (blockers.length > 0)
    return {
      ...base,
      blockers,
      expectedMode: null,
      request: null,
      requestDigest: null,
    };
  const request: SofascoreObservationRequest = {
    sofascoreEventId: eventId,
    mappingSnapshotDigest: snapshot.digest,
    coverage: base.coverage,
    payload: {
      homeScore: homeScore as number,
      awayScore: awayScore as number,
      anonymousStarters: 0,
      anonymousByTeam: {},
      references,
      participationComplete: true,
      disciplineComplete: true,
      squadComplete: true,
      players: rows.sort((a, b) => (a.playerId < b.playerId ? -1 : 1)),
    },
  };
  return {
    ...base,
    blockers: [],
    expectedMode: allFull ? "full" : "simple",
    request,
    requestDigest: await sha256Hex(canonicalJson(request)),
  };
}
