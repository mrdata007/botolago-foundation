import type { FixtureDifficulty } from "@/types/fantasy";

export interface FixtureDifficultySourceRow {
  clubId: string;
  gameweek: number;
  opponentClubId: string;
  kickoffAt: string;
  isHome: boolean;
  difficulty: number;
}

export function buildFixtureDifficultyContext(input: {
  rows: readonly FixtureDifficultySourceRow[];
  gameweeks: readonly number[];
}): FixtureDifficulty[] {
  const counts = new Map<string, number>();
  const clubIds = new Set<string>();

  for (const row of input.rows) {
    const key = `${row.clubId}:${row.gameweek}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    clubIds.add(row.clubId);
    clubIds.add(row.opponentClubId);
  }

  const gameweeks = [...new Set(input.gameweeks)].sort((left, right) => left - right);
  const context: FixtureDifficulty[] = input.rows.map((row) => ({
    clubId: row.clubId,
    gameweek: row.gameweek,
    opponentClubId: row.opponentClubId,
    kickoffAt: row.kickoffAt,
    isHome: row.isHome,
    difficulty: row.difficulty as FixtureDifficulty["difficulty"],
    isDouble: (counts.get(`${row.clubId}:${row.gameweek}`) ?? 0) > 1,
  }));

  for (const clubId of clubIds) {
    for (const gameweek of gameweeks) {
      if ((counts.get(`${clubId}:${gameweek}`) ?? 0) > 0) continue;
      context.push({
        clubId,
        gameweek,
        opponentClubId: "",
        isHome: false,
        difficulty: 1,
        isBlank: true,
      });
    }
  }

  return context.sort(
    (left, right) =>
      left.gameweek - right.gameweek ||
      left.clubId.localeCompare(right.clubId) ||
      Number(left.isBlank === true) - Number(right.isBlank === true) ||
      (left.kickoffAt ?? "").localeCompare(right.kickoffAt ?? "") ||
      left.opponentClubId.localeCompare(right.opponentClubId),
  );
}
