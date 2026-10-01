import type { ProviderName, ProviderSquad, ProviderSquadPlayer } from "./contracts";

export type IdCollisionConclusion =
  | "NO_CURRENT_SNAPSHOT_COLLISION_OBSERVED"
  | "PROVIDER_ID_COLLISION_NEEDS_REVIEW";

export interface ProviderIdCheck {
  readonly squadsChecked: number;
  readonly idsChecked: number;
  /** Ids that appeared twice in one squad. Ids are listed only for technical review. */
  readonly duplicateWithinSquad: readonly {
    readonly clubKey: string;
    readonly externalPlayerId: string;
  }[];
  /** Ids present in the squads of more than one club in this snapshot. */
  readonly idsInMultipleClubs: readonly {
    readonly externalPlayerId: string;
    readonly clubKeys: readonly string[];
  }[];
  /** Of those, the ones whose attributes differ between the clubs' entries. */
  readonly conflictingAttributes: readonly string[];
}

export interface IdChecks {
  readonly byProvider: Readonly<Record<ProviderName, ProviderIdCheck>>;
  /** Not a claim about any other season or day. */
  readonly conclusion: IdCollisionConclusion;
}

/** Attributes that must agree for one provider id seen in two squads (names are not compared). */
const attributesOf = (player: ProviderSquadPlayer) =>
  JSON.stringify([
    player.positionSignal,
    player.signalValues.birthDate,
    player.heightSignal,
    player.nationalitySignal,
    player.registeredTeamId,
  ]);

export function checkProviderIds(squads: readonly ProviderSquad[]): IdChecks {
  const byProvider = {} as Record<ProviderName, ProviderIdCheck>;
  for (const provider of ["sofascore", "flashscore"] as const) {
    const own = squads.filter((squad) => squad.provider === provider);
    const seen = new Map<string, { clubKeys: string[]; attributes: Set<string> }>();
    const duplicates: { clubKey: string; externalPlayerId: string }[] = [];
    for (const squad of own) {
      for (const id of squad.diagnostics.duplicateIds)
        duplicates.push({ clubKey: squad.clubKey, externalPlayerId: id });
      for (const player of squad.players) {
        const entry = seen.get(player.externalPlayerId) ?? { clubKeys: [], attributes: new Set() };
        entry.clubKeys.push(squad.clubKey);
        entry.attributes.add(attributesOf(player));
        seen.set(player.externalPlayerId, entry);
      }
    }
    const multiple = [...seen.entries()].filter(([, entry]) => entry.clubKeys.length > 1);
    byProvider[provider] = {
      squadsChecked: own.length,
      idsChecked: seen.size,
      duplicateWithinSquad: duplicates,
      idsInMultipleClubs: multiple.map(([externalPlayerId, entry]) => ({
        externalPlayerId,
        clubKeys: entry.clubKeys,
      })),
      conflictingAttributes: multiple
        .filter(([, entry]) => entry.attributes.size > 1)
        .map(([externalPlayerId]) => externalPlayerId),
    };
  }
  const problem = Object.values(byProvider).some(
    (check) =>
      check.duplicateWithinSquad.length > 0 ||
      check.idsInMultipleClubs.length > 0 ||
      check.conflictingAttributes.length > 0,
  );
  return {
    byProvider,
    conclusion: problem
      ? "PROVIDER_ID_COLLISION_NEEDS_REVIEW"
      : "NO_CURRENT_SNAPSHOT_COLLISION_OBSERVED",
  };
}
