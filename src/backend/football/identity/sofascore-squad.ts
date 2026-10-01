import type {
  PositionSignal,
  ProviderDobState,
  ProviderSquadPlayer,
  SquadDiagnostics,
} from "./contracts";
import { classifyProviderDob } from "./dob";

export interface ParsedSquad {
  /** False when the response is not the shape of a squad at all. */
  readonly structureOk: boolean;
  readonly players: ProviderSquadPlayer[];
  readonly diagnostics: SquadDiagnostics;
  /** Per-player facts the aggregate evidence needs but a candidate does not carry. */
  readonly dobDetail: readonly DobDetail[];
}

/** What the aggregate DOB metrics count, one per squad player. No dates. */
export interface DobDetail {
  readonly externalPlayerId: string;
  readonly state: ProviderDobState;
  /** ISO date, only for in-memory duplicate counting; never leaves the process. */
  readonly birthDate: string | null;
  readonly january1: boolean;
  readonly representationDisagreement: boolean;
}

const POSITIONS = new Set<string>(["G", "D", "M", "F"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const providerId = (value: unknown): string | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : null;

const shirt = (...values: unknown[]): number | null => {
  for (const value of values) {
    const number =
      typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
    if (Number.isInteger(number) && number >= 0 && number <= 99) return number;
  }
  return null;
};

const listLength = (value: unknown): number | null => (Array.isArray(value) ? value.length : null);

/**
 * Sofascore `teams/get-squad` response, read for ONE requested team. The
 * requested team is the membership context: a player whose own `team.id` is
 * another team stays in the candidate set and is only flagged. Only the main
 * `players` list is read.
 */
export function normalizeSofascoreSquad(
  payload: unknown,
  requestedTeamId: number,
  now: Date,
): ParsedSquad {
  const requested = String(requestedTeamId);
  const empty = (): ParsedSquad => ({
    structureOk: false,
    players: [],
    dobDetail: [],
    diagnostics: {
      listedEntries: 0,
      malformedEntries: 0,
      excludedCoaches: 0,
      unknownPositionLabels: 0,
      duplicateIds: [],
      otherLists: { foreign: null, national: null },
    },
  });
  if (!isRecord(payload) || !Array.isArray(payload.players)) return empty();
  const players: ProviderSquadPlayer[] = [];
  const dobDetail: DobDetail[] = [];
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  let malformed = 0;
  let unknownPositionLabels = 0;
  for (const entry of payload.players) {
    const player = isRecord(entry) && isRecord(entry.player) ? entry.player : null;
    const id = player ? providerId(player.id) : null;
    if (!player || !id) {
      malformed += 1;
      continue;
    }
    if (seen.has(id)) {
      if (!duplicateIds.includes(id)) duplicateIds.push(id);
      continue;
    }
    seen.add(id);
    const label = typeof player.position === "string" ? player.position : null;
    if (label !== null && !POSITIONS.has(label)) unknownPositionLabels += 1;
    const registered = isRecord(player.team) ? providerId(player.team.id) : null;
    const dob = classifyProviderDob(
      { timestamp: player.dateOfBirthTimestamp, text: player.dateOfBirth },
      now,
    );
    const country = isRecord(player.country) ? player.country.alpha2 : null;
    const height = typeof player.height === "number" ? player.height : null;
    players.push({
      provider: "sofascore",
      externalPlayerId: id,
      requestedTeamId: requested,
      squadCompleteness: "COMPLETE", // set by the collector once the squad is assessed
      registeredTeamId: registered,
      registeredTeamDisagreement: registered !== null && registered !== requested,
      shirtNumber: shirt(player.shirtNumber, player.jerseyNumber),
      positionSignal: label !== null && POSITIONS.has(label) ? (label as PositionSignal) : null,
      dobSignalState: dob.state,
      dobJanuary1: dob.january1,
      heightSignal: height !== null && height >= 120 && height <= 230 ? height : null,
      nationalitySignal:
        typeof country === "string" && /^[A-Za-z]{2}$/.test(country)
          ? `alpha2:${country.toUpperCase()}`
          : null,
      signalValues: { birthDate: dob.birthDate },
      private: { displayName: typeof player.name === "string" ? player.name : null },
    });
    dobDetail.push({
      externalPlayerId: id,
      state: dob.state,
      birthDate: dob.birthDate,
      january1: dob.january1,
      representationDisagreement: dob.representationDisagreement,
    });
  }
  return {
    structureOk: true,
    players,
    dobDetail,
    diagnostics: {
      listedEntries: payload.players.length,
      malformedEntries: malformed,
      excludedCoaches: 0,
      unknownPositionLabels,
      duplicateIds,
      otherLists: {
        foreign: listLength(payload.foreignPlayers),
        national: listLength(payload.nationalPlayers),
      },
    },
  };
}
