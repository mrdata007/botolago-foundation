import type { FantasyPlayer, FantasyTeam, FixtureDifficulty } from "@/types/fantasy";

export interface DeadlineChecklist {
  /** How many of the 11 starting places hold a player. */
  startersSet: number;
  /** A captain is among the starters. */
  captainSet: boolean;
  /**
   * Starters whose club has no match in the gameweek, or `null` when the
   * fixtures for that gameweek are not known: nothing is claimed then.
   */
  startersWithoutMatch: number | null;
}

const STARTING_PLACES = 11;

/**
 * The three things a manager checks before a deadline. `fixtures` is the
 * fixture list the Fantasy screens already read; a club counts as playing when
 * it has a fixture in `gameweek` that is not a blank.
 */
export function deadlineChecklist(
  team: Pick<FantasyTeam, "squad">,
  players: readonly Pick<FantasyPlayer, "id" | "clubId">[],
  fixtures: readonly Pick<FixtureDifficulty, "clubId" | "gameweek" | "isBlank">[],
  gameweek: number,
): DeadlineChecklist {
  const starters = team.squad.filter((place) => place.slot >= 1 && place.slot <= STARTING_PLACES);
  const clubOf = new Map(players.map((player) => [player.id, player.clubId] as const));

  const fixturesKnown = fixtures.some((fixture) => fixture.gameweek === gameweek);
  const playing = new Set(
    fixtures
      .filter((fixture) => fixture.gameweek === gameweek && !fixture.isBlank)
      .map((fixture) => fixture.clubId),
  );
  const startersWithoutMatch = fixturesKnown
    ? starters.filter((place) => {
        const club = clubOf.get(place.playerId);
        return club !== undefined && !playing.has(club);
      }).length
    : null;

  return {
    startersSet: starters.filter((place) => place.playerId).length,
    captainSet: starters.some((place) => place.isCaptain),
    startersWithoutMatch,
  };
}
