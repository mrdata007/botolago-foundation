import type { CollectionResult } from "./collector";
import type { MappingRpcClient } from "./mapping-repository";
import { MappingError, mapMappingError } from "./mapping-errors";

/**
 * Candidate builder: turns what the READ-ONLY collector saw into rows for the
 * mapping workflow's candidate and observation tables, through the one trusted
 * database function that may write them (service role only). It never creates
 * a proposal, never writes a mapping and never maps anyone.
 *
 * One provider id is ONE candidate. A squad is an observation attached to it:
 * a player listed in two squads gets two observations, the flag
 * MULTI_SQUAD_OBSERVATION, and nothing else. That is not a transfer, a
 * duplicate, a wrong squad or an id collision, and it costs the candidate
 * nothing.
 */
export interface ObservationRecord {
  readonly provider: "sofascore" | "flashscore";
  /** Machine identity: with `provider`, the candidate's key. */
  readonly externalPlayerId: string;
  /** The requested squad: positive observational evidence only. */
  readonly providerTeamId: string;
  readonly clubKey: string;
  readonly appTeamId: string | null;
  readonly squadCompleteness: "COMPLETE" | "INCOMPLETE_PROVIDER_SQUAD";
  // Reviewer / ranking signals; null or a non-valid state is NO SIGNAL.
  readonly registeredTeamId: string | null;
  readonly registeredTeamDisagreement: boolean;
  readonly shirtNumber: number | null;
  readonly positionSignal: "G" | "D" | "M" | "F" | null;
  readonly dobState: string;
  readonly birthDate: string | null;
  readonly dobJanuary1: boolean;
  readonly heightCm: number | null;
  readonly nationalitySignal: string | null;
  /** For the reviewer's screen only; no machine step reads it. */
  readonly displayName: string | null;
}

export interface BuildOptions {
  /** Club slug to app team id, where the app side is known. A signal, never a filter. */
  readonly appTeamIdByClubKey?: Readonly<Record<string, string>>;
}

export function toObservationRecords(
  collection: CollectionResult,
  options: BuildOptions = {},
): ObservationRecord[] {
  const records: ObservationRecord[] = [];
  const seen = new Set<string>();
  for (const squad of collection.squads) {
    if (squad.status !== "ok") continue; // a failed response is no evidence at all
    for (const player of squad.players) {
      const key = `${squad.provider}|${player.externalPlayerId}|${squad.requestedTeamId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({
        provider: squad.provider,
        externalPlayerId: player.externalPlayerId,
        providerTeamId: squad.requestedTeamId,
        clubKey: squad.clubKey,
        appTeamId: options.appTeamIdByClubKey?.[squad.clubKey] ?? null,
        squadCompleteness: squad.completeness.state,
        registeredTeamId: player.registeredTeamId,
        registeredTeamDisagreement: player.registeredTeamDisagreement,
        shirtNumber: player.shirtNumber,
        positionSignal: player.positionSignal,
        dobState: player.dobSignalState,
        birthDate: player.signalValues.birthDate,
        dobJanuary1: player.dobJanuary1,
        heightCm: player.heightSignal,
        nationalitySignal: player.nationalitySignal,
        displayName: player.private.displayName,
      });
    }
  }
  return records;
}

export type BuiltCandidateFlag = "MULTI_SQUAD_OBSERVATION" | "INCOMPLETE_PROVIDER_SQUAD";

export interface BuiltCandidate {
  readonly provider: "sofascore" | "flashscore";
  readonly externalPlayerId: string;
  /** Every squad the id was seen in, each kept separately. No name. */
  readonly observations: readonly Omit<ObservationRecord, "displayName">[];
  readonly flags: readonly BuiltCandidateFlag[];
}

/** One candidate per (provider, provider player id), never per club. */
export function groupCandidates(records: readonly ObservationRecord[]): BuiltCandidate[] {
  const byIdentity = new Map<string, Omit<ObservationRecord, "displayName">[]>();
  for (const { displayName: _name, ...record } of records) {
    const key = `${record.provider}|${record.externalPlayerId}`;
    const list = byIdentity.get(key) ?? [];
    if (!list.some((existing) => existing.providerTeamId === record.providerTeamId))
      list.push(record);
    byIdentity.set(key, list);
  }
  return [...byIdentity.values()].map((observations) => {
    const first = observations[0]!;
    const flags: BuiltCandidateFlag[] = [];
    if (observations.length > 1) flags.push("MULTI_SQUAD_OBSERVATION");
    if (observations.some((o) => o.squadCompleteness === "INCOMPLETE_PROVIDER_SQUAD"))
      flags.push("INCOMPLETE_PROVIDER_SQUAD");
    return {
      provider: first.provider,
      externalPlayerId: first.externalPlayerId,
      observations,
      flags,
    };
  });
}

export interface RecordSummary {
  readonly candidatesCreated: number;
  readonly observationsSeen: number;
  readonly observationsCreated: number;
  readonly observationsChanged: number;
  readonly revisionsBumped: number;
}

export interface ObservationSink {
  record(records: readonly ObservationRecord[]): Promise<RecordSummary>;
}

const CHUNK = 500;
const EMPTY: RecordSummary = {
  candidatesCreated: 0,
  observationsSeen: 0,
  observationsCreated: 0,
  observationsChanged: 0,
  revisionsBumped: 0,
};

const toRpcObservation = (record: ObservationRecord) => ({
  provider: record.provider,
  externalPlayerId: record.externalPlayerId,
  providerTeamId: record.providerTeamId,
  clubKey: record.clubKey,
  appTeamId: record.appTeamId,
  squadCompleteness: record.squadCompleteness,
  registeredTeamId: record.registeredTeamId,
  registeredTeamDisagreement: record.registeredTeamDisagreement,
  shirtNumber: record.shirtNumber,
  positionSignal: record.positionSignal,
  dobState: record.dobState,
  birthDate: record.birthDate,
  dobJanuary1: record.dobJanuary1,
  heightCm: record.heightCm,
  nationalitySignal: record.nationalitySignal,
  displayName: record.displayName,
});

/**
 * Writes through `football_mapping_record_observations`, which only the
 * service role can run. The caller supplies that client; this class holds no
 * credential. It returns counts only and logs nothing.
 */
export class SupabaseObservationSink implements ObservationSink {
  constructor(private readonly serviceApi: MappingRpcClient) {}

  async record(records: readonly ObservationRecord[]): Promise<RecordSummary> {
    let total = EMPTY;
    for (let start = 0; start < records.length; start += CHUNK) {
      const { data, error } = await this.serviceApi.rpc("football_mapping_record_observations", {
        p_observations: records.slice(start, start + CHUNK).map(toRpcObservation),
      });
      if (error) throw mapMappingError(error);
      const summary = data as Partial<RecordSummary> | null;
      if (!summary || typeof summary.observationsSeen !== "number")
        throw new MappingError("mapping_unavailable", "The builder returned an invalid summary.");
      total = {
        candidatesCreated: total.candidatesCreated + (summary.candidatesCreated ?? 0),
        observationsSeen: total.observationsSeen + summary.observationsSeen,
        observationsCreated: total.observationsCreated + (summary.observationsCreated ?? 0),
        observationsChanged: total.observationsChanged + (summary.observationsChanged ?? 0),
        revisionsBumped: total.revisionsBumped + (summary.revisionsBumped ?? 0),
      };
    }
    return total;
  }
}

/** Collector result in, candidates and observations recorded, counts out. */
export async function recordCollection(
  sink: ObservationSink,
  collection: CollectionResult,
  options: BuildOptions = {},
): Promise<RecordSummary> {
  return sink.record(toObservationRecords(collection, options));
}
