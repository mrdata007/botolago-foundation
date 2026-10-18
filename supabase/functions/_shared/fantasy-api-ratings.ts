// Provider-native rating inputs. No catalog matching or identity writes.
import type { PerformanceLineups } from "./performance-contracts.ts";
import { isValidRating } from "./fantasy-rating-scoring.ts";

export function buildApiRatingLineups(lineups: PerformanceLineups) {
  if (lineups.provider !== "sofascore" || lineups.players.length === 0)
    throw new Error("ratings_lineups_missing");
  const ids = new Set<string>();
  const players = lineups.players.map((p) => {
    if (!/^\d{1,12}$/.test(p.externalId) || ids.has(p.externalId))
      throw new Error("ratings_player_id_invalid");
    ids.add(p.externalId);
    const minutes = p.stats?.minutesPlayed ?? null;
    const rating = isValidRating(p.stats?.rating) ? p.stats!.rating : null;
    // A named starter or a rated substitute cannot become a DNP because minutes
    // are missing. An unused bench row with no statistics is a confirmed DNP.
    const appeared = p.starter || (minutes !== null && minutes > 0) || rating !== null;
    const uncertain = (minutes === null || minutes === 0) && p.stats !== null && !appeared;
    return {
      externalId: p.externalId,
      side: p.side,
      starter: p.starter,
      minutes,
      rating,
      appeared,
      uncertain,
    };
  });
  const validSides = ["home", "away"].every(
    (side) => players.filter((p) => p.side === side && p.starter).length === 11,
  );
  const missing = players.filter((p) => (p.appeared && p.rating === null) || p.uncertain);
  return {
    ready: validSides && missing.length === 0,
    participants: players.filter((p) => p.appeared).length,
    rated: players.filter((p) => p.appeared && p.rating !== null).length,
    missingRatingIds: missing.map((p) => p.externalId),
    validSides,
    players,
  };
}
