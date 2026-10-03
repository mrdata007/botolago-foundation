import type { PositionSignal, ProviderSquadPlayer } from "./contracts";
import type { ParsedSquad } from "./sofascore-squad";

/**
 * `PLAYER_TYPE_ID` values seen in all 16 current squads. The meaning of the
 * values reads as a position, but its agreement with another source has not
 * been established, so it is a reviewer/ranking signal only, never an
 * authoritative position.
 */
const TYPE_TO_POSITION: Readonly<Record<string, PositionSignal>> = {
  GOALKEEPER: "G",
  DEFENDER: "D",
  MIDFIELDER: "M",
  FORWARD: "F",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Flashscore `v1/teams/squad` response, read for ONE requested team. The squad
 * lists coaches among the players; they are excluded and counted. The endpoint
 * carries no date of birth, height or team id, so those are `not_provided`.
 */
export function normalizeFlashscoreSquad(payload: unknown, requestedTeamId: string): ParsedSquad {
  const base: ParsedSquad = {
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
  };
  if (!isRecord(payload) || !Array.isArray(payload.DATA)) return base;
  const players: ProviderSquadPlayer[] = [];
  const dobDetail: ParsedSquad["dobDetail"][number][] = [];
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  let listed = 0;
  let malformed = 0;
  let coaches = 0;
  let unknownPositionLabels = 0;
  for (const group of payload.DATA) {
    if (!isRecord(group) || !Array.isArray(group.ITEMS)) {
      malformed += 1;
      continue;
    }
    for (const item of group.ITEMS) {
      listed += 1;
      const id =
        isRecord(item) &&
        typeof item.PLAYER_ID === "string" &&
        /^[A-Za-z0-9]{4,20}$/.test(item.PLAYER_ID)
          ? item.PLAYER_ID
          : null;
      if (!isRecord(item) || !id) {
        malformed += 1;
        continue;
      }
      const type = typeof item.PLAYER_TYPE_ID === "string" ? item.PLAYER_TYPE_ID : null;
      if (type === "COACH") {
        coaches += 1;
        continue;
      }
      if (seen.has(id)) {
        if (!duplicateIds.includes(id)) duplicateIds.push(id);
        continue;
      }
      seen.add(id);
      const position = type !== null ? (TYPE_TO_POSITION[type] ?? null) : null;
      if (type !== null && position === null) unknownPositionLabels += 1;
      const jersey = item.PLAYER_JERSEY_NUMBER;
      const flag = item.PLAYER_FLAG_ID;
      players.push({
        provider: "flashscore",
        externalPlayerId: id,
        requestedTeamId,
        squadCompleteness: "COMPLETE", // set by the collector once the squad is assessed
        registeredTeamId: null,
        registeredTeamDisagreement: false,
        shirtNumber:
          typeof jersey === "number" && Number.isInteger(jersey) && jersey >= 0 && jersey <= 99
            ? jersey
            : null,
        positionSignal: position,
        dobSignalState: "not_provided",
        dobJanuary1: false,
        heightSignal: null,
        // The candidate tables accept only `flag:` plus 1 to 6 digits; anything else is no signal.
        nationalitySignal:
          typeof flag === "number" && Number.isInteger(flag) && flag >= 0 && flag <= 999999
            ? `flag:${flag}`
            : null,
        signalValues: { birthDate: null },
        private: { displayName: typeof item.PLAYER_NAME === "string" ? item.PLAYER_NAME : null },
      });
      dobDetail.push({
        externalPlayerId: id,
        state: "not_provided",
        birthDate: null,
        january1: false,
        representationDisagreement: false,
      });
    }
  }
  return {
    structureOk: true,
    players,
    dobDetail,
    diagnostics: {
      listedEntries: listed,
      malformedEntries: malformed,
      excludedCoaches: coaches,
      unknownPositionLabels,
      duplicateIds,
      otherLists: { foreign: null, national: null },
    },
  };
}
