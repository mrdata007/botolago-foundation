/**
 * SofaScore ID bridge (pure logic, no I/O).
 *
 * Attaches SofaScore ids to the SAME internal competition, season, round, team
 * and fixture rows that SportsMonks already maps. It never creates a row: an
 * event that cannot be tied to exactly one existing fixture is reported, not
 * mapped. Plan: docs/backend/SOFASCORE_FULL_MIGRATION_PLAN.md (P3).
 */

export const SOFASCORE_PROVIDER = "sofascore";
export const SOFASCORE_TIMEZONE = "Africa/Casablanca";

export type BridgeEntityType = "competition" | "season" | "round" | "team" | "fixture";

export interface SofascoreEvent {
  readonly id: number;
  /** Seconds since the epoch. */
  readonly startTimestamp: number;
  readonly roundInfo?: { readonly round?: number | null } | null;
  readonly status: { readonly type: string };
  readonly homeTeam: { readonly id: number };
  readonly awayTeam: { readonly id: number };
}

export interface InternalFixture {
  readonly id: string;
  /** ISO timestamp (UTC). */
  readonly kickoffAt: string;
  readonly roundNumber: number | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
}

export interface InternalRound {
  readonly id: string;
  readonly roundNumber: number;
}

export interface ExistingMapping {
  readonly entityType: BridgeEntityType;
  readonly externalId: string;
  readonly internalId: string;
}

/** Reviewed table: SofaScore team id to internal team uuid. */
export type ReviewedTeamTable = ReadonlyMap<number, string>;

export interface BridgeInput {
  readonly events: readonly SofascoreEvent[];
  readonly competition: { readonly externalId: string; readonly internalId: string };
  readonly season: { readonly externalId: string; readonly internalId: string };
  readonly teams: ReviewedTeamTable;
  readonly rounds: readonly InternalRound[];
  readonly fixtures: readonly InternalFixture[];
  /** Existing SofaScore mappings only (active rows). */
  readonly existing: readonly ExistingMapping[];
}

export type FixtureFlag = "matched_by_round" | "postponed_only";

export interface PlannedMapping {
  readonly entityType: BridgeEntityType;
  readonly externalId: string;
  readonly internalId: string;
  readonly flags: readonly FixtureFlag[];
}

export interface Repoint {
  readonly fixtureId: string;
  readonly fromExternalId: string;
  readonly toExternalId: string;
  readonly flags: readonly FixtureFlag[];
}

export interface Conflict {
  readonly entityType: BridgeEntityType;
  readonly externalId: string;
  readonly internalId: string;
  readonly existingExternalId: string;
  readonly existingInternalId: string;
}

export interface BridgeReport {
  readonly eventsRead: number;
  readonly eventsSkippedMissingTeam: readonly number[];
  readonly teamsMissingFromTable: readonly number[];
  readonly roundsMissingInternally: readonly number[];
  readonly fixturesTotal: number;
  readonly fixturesMatched: readonly {
    fixtureId: string;
    externalId: string;
    flags: readonly FixtureFlag[];
  }[];
  readonly fixturesNoMatch: readonly string[];
  readonly fixturesMultiMatch: readonly { fixtureId: string; externalIds: readonly string[] }[];
  readonly alreadyMapped: readonly {
    entityType: BridgeEntityType;
    externalId: string;
    internalId: string;
  }[];
  readonly conflicts: readonly Conflict[];
  readonly repoints: readonly Repoint[];
}

export interface BridgePlan {
  readonly rows: readonly PlannedMapping[];
  readonly repoints: readonly Repoint[];
  readonly report: BridgeReport;
}

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SOFASCORE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (YYYY-MM-DD) in Africa/Casablanca of an instant. */
export function casablancaDate(instant: Date): string {
  return dateFormat.format(instant);
}

const isPostponed = (event: SofascoreEvent) => event.status.type === "postponed";
const roundOf = (event: SofascoreEvent) => event.roundInfo?.round ?? null;
/** Sort order: newest first (start, then id). */
const newestFirst = (a: SofascoreEvent, b: SofascoreEvent) =>
  a.startTimestamp !== b.startTimestamp ? b.startTimestamp - a.startTimestamp : b.id - a.id;

interface EffectiveEvent {
  readonly event: SofascoreEvent;
  readonly home: string;
  readonly away: string;
  readonly postponedOnly: boolean;
}

/**
 * Postponed matches are replayed under a NEW event id. Within one
 * season/home/away/round group a postponed event is dropped when a
 * non-postponed one exists; a group of postponed events only keeps the newest.
 */
function effectiveEvents(
  events: readonly SofascoreEvent[],
  teams: ReviewedTeamTable,
): EffectiveEvent[] {
  const groups = new Map<string, EffectiveEvent[]>();
  for (const event of events) {
    const home = teams.get(event.homeTeam.id);
    const away = teams.get(event.awayTeam.id);
    if (!home || !away) continue;
    const key = `${home}|${away}|${roundOf(event) ?? "-"}`;
    const list = groups.get(key) ?? [];
    list.push({ event, home, away, postponedOnly: false });
    groups.set(key, list);
  }
  const out: EffectiveEvent[] = [];
  for (const list of groups.values()) {
    const live = list.filter((entry) => !isPostponed(entry.event));
    if (live.length > 0) {
      out.push(...live);
      continue;
    }
    const [latest] = [...list].sort((a, b) => newestFirst(a.event, b.event));
    out.push({ ...latest, postponedOnly: true });
  }
  return out;
}

export function planSofascoreIdBridge(input: BridgeInput): BridgePlan {
  const { events, fixtures, rounds, existing } = input;
  const rows: PlannedMapping[] = [];
  const conflicts: Conflict[] = [];

  // Two SofaScore teams paired with one internal team is a review mistake: report
  // it and leave both out, so none of their matches can be mapped under the
  // wrong identity.
  const sofascoreIdsByInternal = new Map<string, number[]>();
  for (const [sofascoreId, internalId] of input.teams) {
    sofascoreIdsByInternal.set(internalId, [
      ...(sofascoreIdsByInternal.get(internalId) ?? []),
      sofascoreId,
    ]);
  }
  const teams = new Map(input.teams);
  for (const [internalId, sofascoreIds] of sofascoreIdsByInternal) {
    if (sofascoreIds.length < 2) continue;
    const [first, ...others] = [...sofascoreIds].sort((a, b) => a - b);
    for (const other of others) {
      conflicts.push({
        entityType: "team",
        externalId: String(other),
        internalId,
        existingExternalId: String(first),
        existingInternalId: internalId,
      });
    }
    for (const id of sofascoreIds) teams.delete(id);
  }
  const alreadyMapped: BridgeReport["alreadyMapped"][number][] = [];
  const repoints: Repoint[] = [];

  const byExternal = new Map<string, ExistingMapping>();
  const byInternal = new Map<string, ExistingMapping>();
  for (const mapping of existing) {
    byExternal.set(`${mapping.entityType}|${mapping.externalId}`, mapping);
    byInternal.set(`${mapping.entityType}|${mapping.internalId}`, mapping);
  }

  /** Records a mapping row, an already-mapped entry or a conflict. */
  const attach = (
    entityType: BridgeEntityType,
    externalId: string,
    internalId: string,
    flags: readonly FixtureFlag[] = [],
  ): "created" | "same" | "conflict" => {
    const byExt = byExternal.get(`${entityType}|${externalId}`);
    const byInt = byInternal.get(`${entityType}|${internalId}`);
    if (byExt && byExt.internalId === internalId) {
      alreadyMapped.push({ entityType, externalId, internalId });
      return "same";
    }
    const clash = byExt ?? byInt;
    if (clash) {
      conflicts.push({
        entityType,
        externalId,
        internalId,
        existingExternalId: clash.externalId,
        existingInternalId: clash.internalId,
      });
      return "conflict";
    }
    const planned = rows.find(
      (r) =>
        r.entityType === entityType && (r.externalId === externalId || r.internalId === internalId),
    );
    if (planned) {
      if (planned.externalId === externalId && planned.internalId === internalId) return "same";
      conflicts.push({
        entityType,
        externalId,
        internalId,
        existingExternalId: planned.externalId,
        existingInternalId: planned.internalId,
      });
      return "conflict";
    }
    rows.push({ entityType, externalId, internalId, flags });
    return "created";
  };

  attach("competition", input.competition.externalId, input.competition.internalId);
  attach("season", input.season.externalId, input.season.internalId);

  // Teams: only reviewed ones; anything else is reported.
  const missingTeams = new Set<number>();
  const skippedEvents: number[] = [];
  const usedTeams = new Set<number>();
  for (const event of events) {
    let skip = false;
    for (const id of [event.homeTeam.id, event.awayTeam.id]) {
      if (!teams.has(id)) {
        missingTeams.add(id);
        skip = true;
      } else usedTeams.add(id);
    }
    if (skip) skippedEvents.push(event.id);
  }
  for (const id of [...usedTeams].sort((a, b) => a - b)) {
    attach("team", String(id), teams.get(id) as string);
  }

  // Rounds: SofaScore has no round id here; the external id is "<season>:<number>".
  const roundByNumber = new Map(rounds.map((r) => [r.roundNumber, r.id]));
  const missingRounds = new Set<number>();
  const seenRounds = new Set<number>();
  for (const event of events) {
    const n = roundOf(event);
    if (n == null || seenRounds.has(n)) continue;
    seenRounds.add(n);
    const internal = roundByNumber.get(n);
    if (!internal) missingRounds.add(n);
    else attach("round", `${input.season.externalId}:${n}`, internal);
  }

  // Fixtures.
  const effective = effectiveEvents(events, teams);
  const pairRoundCount = new Map<string, number>();
  for (const f of fixtures) {
    const key = `${f.homeTeamId}|${f.awayTeamId}|${f.roundNumber ?? "-"}`;
    pairRoundCount.set(key, (pairRoundCount.get(key) ?? 0) + 1);
  }

  interface Choice {
    fixture: InternalFixture;
    candidates: EffectiveEvent[];
    byRound: boolean;
  }
  const choices: Choice[] = [];
  const noMatch: string[] = [];
  for (const fixture of fixtures) {
    const pair = effective.filter(
      (e) => e.home === fixture.homeTeamId && e.away === fixture.awayTeamId,
    );
    const day = casablancaDate(new Date(fixture.kickoffAt));
    const dateMatches = pair.filter(
      (e) => casablancaDate(new Date(e.event.startTimestamp * 1000)) === day,
    );
    if (dateMatches.length > 0) {
      choices.push({ fixture, candidates: dateMatches, byRound: false });
      continue;
    }
    const sameRound =
      fixture.roundNumber == null
        ? []
        : pair.filter((e) => roundOf(e.event) === fixture.roundNumber);
    const unique =
      pairRoundCount.get(
        `${fixture.homeTeamId}|${fixture.awayTeamId}|${fixture.roundNumber ?? "-"}`,
      ) === 1;
    if (sameRound.length > 0 && unique) {
      choices.push({ fixture, candidates: sameRound, byRound: true });
    } else noMatch.push(fixture.id);
  }

  // An event wanted by more than one fixture is ambiguous for all of them.
  const claims = new Map<number, number>();
  for (const c of choices) {
    for (const candidate of c.candidates) {
      const id = candidate.event.id;
      claims.set(id, (claims.get(id) ?? 0) + 1);
    }
  }

  const matched: BridgeReport["fixturesMatched"][number][] = [];
  const multi: BridgeReport["fixturesMultiMatch"][number][] = [];
  const eventsById = new Map(events.map((e) => [String(e.id), e]));

  for (const { fixture, candidates, byRound } of choices) {
    if (candidates.length > 1 || (claims.get(candidates[0].event.id) ?? 0) > 1) {
      multi.push({
        fixtureId: fixture.id,
        externalIds: candidates.map((c) => String(c.event.id)),
      });
      continue;
    }
    const chosen = candidates[0];
    const externalId = String(chosen.event.id);
    const flags: FixtureFlag[] = [];
    if (byRound) flags.push("matched_by_round");
    if (chosen.postponedOnly) flags.push("postponed_only");

    const current = byInternal.get(`fixture|${fixture.id}`);
    if (current && current.externalId !== externalId) {
      const old = eventsById.get(current.externalId);
      const superseded =
        old !== undefined &&
        isPostponed(old) &&
        teams.get(old.homeTeam.id) === fixture.homeTeamId &&
        teams.get(old.awayTeam.id) === fixture.awayTeamId &&
        !byExternal.has(`fixture|${externalId}`);
      if (superseded) {
        repoints.push({
          fixtureId: fixture.id,
          fromExternalId: current.externalId,
          toExternalId: externalId,
          flags,
        });
        matched.push({ fixtureId: fixture.id, externalId, flags });
      } else {
        attach("fixture", externalId, fixture.id, flags);
      }
      continue;
    }
    const outcome = attach("fixture", externalId, fixture.id, flags);
    if (outcome !== "conflict") matched.push({ fixtureId: fixture.id, externalId, flags });
  }

  return {
    rows,
    repoints,
    report: {
      eventsRead: events.length,
      eventsSkippedMissingTeam: skippedEvents,
      teamsMissingFromTable: [...missingTeams].sort((a, b) => a - b),
      roundsMissingInternally: [...missingRounds].sort((a, b) => a - b),
      fixturesTotal: fixtures.length,
      fixturesMatched: matched,
      fixturesNoMatch: noMatch,
      fixturesMultiMatch: multi,
      alreadyMapped,
      conflicts,
      repoints,
    },
  };
}
