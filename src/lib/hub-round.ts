import type { FantasyTeam, FixtureDifficulty } from "@/types/fantasy";

/** One match in the round that involves at least one of the manager's players. */
export interface RoundFixtureRow {
  /** Stable key: the pair of clubs and the kickoff. */
  key: string;
  clubId: string;
  opponentClubId: string;
  /** Whether `clubId` is at home. */
  isHome: boolean;
  /** ISO kickoff, when the source gives one. */
  kickoffAt?: string;
  difficulty: FixtureDifficulty["difficulty"];
  /** The manager's players at `clubId`. */
  playerIds: string[];
  /** The manager's players at the opponent, when it is a club of theirs too. */
  opponentPlayerIds: string[];
}

export interface HubRound {
  fixtures: RoundFixtureRow[];
  /** Clubs the manager has players at with no match this round. */
  noMatchClubIds: string[];
  /** The first kickoff of the whole round (any club), or null when unknown. */
  firstKickoff: string | null;
  /** That first match: its home club and its away club. */
  firstMatch: { homeClubId: string; awayClubId: string } | null;
}

type PlayerClub = { id: string; clubId: string };

/**
 * What a manager's round looks like: which of their players' clubs play, and
 * against whom, and which have no match. Built from the fixture list the
 * Fantasy screens already read; `isBlank` rows count as no match.
 *
 * When two of the manager's clubs meet, the match is one row (the home club's
 * side) carrying both clubs' players, not two rows for one match. With no
 * fixtures for the round at all, nothing is claimed: no rows and no clubs
 * without a match.
 */
export function hubRound(
  team: Pick<FantasyTeam, "squad">,
  players: readonly PlayerClub[],
  fixtures: readonly FixtureDifficulty[],
  gameweek: number,
): HubRound {
  const inRound = fixtures.filter((fixture) => fixture.gameweek === gameweek);
  if (inRound.length === 0) {
    return { fixtures: [], noMatchClubIds: [], firstKickoff: null, firstMatch: null };
  }

  const clubOf = new Map(players.map((player) => [player.id, player.clubId] as const));
  const playersByClub = new Map<string, string[]>();
  for (const place of team.squad) {
    const club = clubOf.get(place.playerId);
    if (!club) continue;
    playersByClub.set(club, [...(playersByClub.get(club) ?? []), place.playerId]);
  }

  const rows: RoundFixtureRow[] = [];
  const playing = new Set<string>();
  for (const fixture of inRound) {
    if (fixture.isBlank) continue;
    playing.add(fixture.clubId);
    const mine = playersByClub.get(fixture.clubId);
    if (!mine) continue;
    const opponentMine = playersByClub.get(fixture.opponentClubId) ?? [];
    // Two clubs of the manager's: one row, from the home side.
    if (opponentMine.length > 0 && !fixture.isHome) continue;
    const pair = [fixture.clubId, fixture.opponentClubId].sort().join(":");
    rows.push({
      key: `${pair}:${fixture.kickoffAt ?? ""}`,
      clubId: fixture.clubId,
      opponentClubId: fixture.opponentClubId,
      isHome: fixture.isHome,
      kickoffAt: fixture.kickoffAt,
      difficulty: fixture.difficulty,
      playerIds: mine,
      opponentPlayerIds: opponentMine,
    });
  }
  rows.sort((a, b) => (a.kickoffAt ?? "￿").localeCompare(b.kickoffAt ?? "￿"));

  const dated = inRound
    .filter((fixture) => !!fixture.kickoffAt && !Number.isNaN(Date.parse(fixture.kickoffAt)))
    .sort((a, b) => a.kickoffAt!.localeCompare(b.kickoffAt!));
  const first = dated[0];

  return {
    fixtures: rows,
    noMatchClubIds: [...playersByClub.keys()].filter((club) => !playing.has(club)),
    firstKickoff: first?.kickoffAt ?? null,
    firstMatch: first
      ? first.isHome
        ? { homeClubId: first.clubId, awayClubId: first.opponentClubId }
        : { homeClubId: first.opponentClubId, awayClubId: first.clubId }
      : null,
  };
}
