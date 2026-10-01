import type { CollectedSquad, CollectionResult } from "./collector";
import type { CompletenessReason, ProviderName } from "./contracts";
import type { IdChecks } from "./id-checks";
import type { PositionAgreement } from "./position-agreement";

/**
 * The sanitized evidence artifact. Counts, states and club slugs only. It
 * never holds a name, a date, a raw payload or a value of any signal. Provider
 * player ids appear only in the id-collision anomaly lists, and only when an
 * anomaly exists.
 */
export interface DobAggregate {
  readonly players: number;
  /** The provider sent a value (valid or not). */
  readonly present: number;
  readonly missing: number;
  /** The endpoint does not carry a date of birth at all. */
  readonly notProvided: number;
  readonly unparseable: number;
  readonly future: number;
  readonly ageBelowMinimum: number;
  readonly ageAboveMaximum: number;
  /** Valid dates on 1 January. */
  readonly january1: number;
  /** Valid dates: the only ones that can be a signal. */
  readonly valid: number;
  /** Players whose valid date is shared with another player of the same squad. */
  readonly playersSharingDob: number;
  /** Distinct dates shared by two or more players of the same squad. */
  readonly duplicateDobValues: number;
}

export interface SignalCoverage {
  readonly shirtNumber: number;
  readonly position: number;
  readonly height: number;
  readonly nationality: number;
  readonly registeredTeamDisagreement: number;
}

export interface SquadEvidence {
  readonly clubKey: string;
  readonly provider: ProviderName;
  readonly status: CollectedSquad["status"];
  readonly errorCode: string | null;
  readonly players: number;
  readonly excludedCoaches: number;
  readonly malformedEntries: number;
  readonly duplicateIdCount: number;
  readonly completeness: CollectedSquad["completeness"]["state"];
  readonly completenessReasons: readonly CompletenessReason[];
  readonly dob: DobAggregate;
  readonly coverage: SignalCoverage;
}

export interface EvidenceDocument {
  readonly schema: "player-squad-collector-evidence/1";
  readonly collectedAt: string;
  readonly requests: CollectionResult["requests"];
  readonly squads: readonly SquadEvidence[];
  readonly totals: Readonly<
    Record<
      ProviderName,
      { squads: number; players: number; dob: DobAggregate; incompleteSquads: number }
    >
  >;
  readonly incompleteSquads: readonly {
    clubKey: string;
    provider: ProviderName;
    reasons: readonly CompletenessReason[];
  }[];
  readonly idChecks: IdChecks;
  readonly positionAgreement: PositionAgreement;
  readonly note: string;
}

const ZERO_DOB: DobAggregate = {
  players: 0,
  present: 0,
  missing: 0,
  notProvided: 0,
  unparseable: 0,
  future: 0,
  ageBelowMinimum: 0,
  ageAboveMaximum: 0,
  january1: 0,
  valid: 0,
  playersSharingDob: 0,
  duplicateDobValues: 0,
};

export function dobAggregate(squad: CollectedSquad): DobAggregate {
  const count = (state: string) => squad.dobDetail.filter((d) => d.state === state).length;
  const byDate = new Map<string, number>();
  for (const detail of squad.dobDetail)
    if (detail.state === "valid" && detail.birthDate !== null)
      byDate.set(detail.birthDate, (byDate.get(detail.birthDate) ?? 0) + 1);
  const shared = [...byDate.values()].filter((n) => n > 1);
  const missing = count("missing");
  const notProvided = count("not_provided");
  return {
    players: squad.dobDetail.length,
    present: squad.dobDetail.length - missing - notProvided,
    missing,
    notProvided,
    unparseable: count("unparseable"),
    future: count("future"),
    ageBelowMinimum: count("age_below_minimum"),
    ageAboveMaximum: count("age_above_maximum"),
    january1: squad.dobDetail.filter((d) => d.state === "valid" && d.january1).length,
    valid: count("valid"),
    playersSharingDob: shared.reduce((a, b) => a + b, 0),
    duplicateDobValues: shared.length,
  };
}

const addDob = (a: DobAggregate, b: DobAggregate): DobAggregate => ({
  players: a.players + b.players,
  present: a.present + b.present,
  missing: a.missing + b.missing,
  notProvided: a.notProvided + b.notProvided,
  unparseable: a.unparseable + b.unparseable,
  future: a.future + b.future,
  ageBelowMinimum: a.ageBelowMinimum + b.ageBelowMinimum,
  ageAboveMaximum: a.ageAboveMaximum + b.ageAboveMaximum,
  january1: a.january1 + b.january1,
  valid: a.valid + b.valid,
  playersSharingDob: a.playersSharingDob + b.playersSharingDob,
  duplicateDobValues: a.duplicateDobValues + b.duplicateDobValues,
});

function coverage(squad: CollectedSquad): SignalCoverage {
  const n = (test: (p: CollectedSquad["players"][number]) => boolean) =>
    squad.players.filter(test).length;
  return {
    shirtNumber: n((p) => p.shirtNumber !== null),
    position: n((p) => p.positionSignal !== null),
    height: n((p) => p.heightSignal !== null),
    nationality: n((p) => p.nationalitySignal !== null),
    registeredTeamDisagreement: n((p) => p.registeredTeamDisagreement),
  };
}

export function buildEvidence(
  collection: CollectionResult,
  positionAgreement: PositionAgreement,
): EvidenceDocument {
  const squads: SquadEvidence[] = collection.squads.map((squad) => ({
    clubKey: squad.clubKey,
    provider: squad.provider,
    status: squad.status,
    errorCode: squad.errorCode,
    players: squad.players.length,
    excludedCoaches: squad.diagnostics.excludedCoaches,
    malformedEntries: squad.diagnostics.malformedEntries,
    duplicateIdCount: squad.diagnostics.duplicateIds.length,
    completeness: squad.completeness.state,
    completenessReasons: squad.completeness.reasons,
    dob: dobAggregate(squad),
    coverage: coverage(squad),
  }));
  const totalFor = (provider: ProviderName) => {
    const own = squads.filter((s) => s.provider === provider);
    return {
      squads: own.length,
      players: own.reduce((sum, s) => sum + s.players, 0),
      dob: own.reduce((sum, s) => addDob(sum, s.dob), ZERO_DOB),
      incompleteSquads: own.filter((s) => s.completeness === "INCOMPLETE_PROVIDER_SQUAD").length,
    };
  };
  return {
    schema: "player-squad-collector-evidence/1",
    collectedAt: collection.collectedAt,
    requests: collection.requests,
    squads,
    totals: { sofascore: totalFor("sofascore"), flashscore: totalFor("flashscore") },
    incompleteSquads: squads
      .filter((s) => s.completeness === "INCOMPLETE_PROVIDER_SQUAD")
      .map((s) => ({ clubKey: s.clubKey, provider: s.provider, reasons: s.completenessReasons })),
    idChecks: collection.idChecks,
    positionAgreement,
    note: "Counts only. A missing or implausible value is no signal, never evidence against a player. A snapshot of one day; no claim about any other season.",
  };
}

/**
 * Fails when the serialized evidence contains any player name (of 4+ letters)
 * or any date of birth the collection held in memory. A guard against a future
 * change leaking personal data into the artifact; it cannot prove the absence
 * of every possible leak, which is why the evidence type has no field for one.
 */
export function assertNoPersonalData(
  evidence: EvidenceDocument,
  collection: CollectionResult,
): void {
  const text = JSON.stringify(evidence).toLowerCase();
  for (const squad of collection.squads)
    for (const player of squad.players) {
      const name = player.private.displayName?.trim().toLowerCase();
      if (name && name.length >= 4 && text.includes(name))
        throw new Error("Evidence leaks a player name");
      const date = player.signalValues.birthDate;
      if (date && text.includes(date)) throw new Error("Evidence leaks a date of birth");
    }
}
