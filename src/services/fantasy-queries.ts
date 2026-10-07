import { queryOptions } from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-runtime";

/**
 * Fantasy reads that are the same for every visitor, built in one place so
 * every screen asks under one key. They used to be declared screen by screen
 * under keys of their own, and were read again as a manager moved between
 * screens. (The player pool and the reads built on it live in
 * `@/services/fantasy-player-query`.)
 *
 * They are not owned keys (`@/services/fantasy-data-source`): their rows are
 * the same for every caller allowed to read them. The hub step every one of
 * them goes through picks the season and the current gameweek without looking
 * at who asks (`api.fantasy_hub`), though it can refuse a session that owes
 * its one-time code; the reads behind them take no account. An account switch
 * or a save therefore has nothing of theirs to forget. A per-team difficulty,
 * or a hub that picked the gameweek per caller, would make them owned again.
 *
 * Each screen keeps its own `staleTime` and `enabled`. The retry is that of
 * whichever screen or loader starts the read (one retry at most either way).
 */

/**
 * The next fixtures' difficulty for every club: the hub's "starters with no
 * match", the team and transfer screens' plates, the difficulty grid and a
 * player's next matches. It was read under three keys, the hub's an owned
 * one, so opening a player after the fixtures grid read it again.
 */
export function fixtureDifficultyQuery() {
  return queryOptions({
    queryKey: ["fantasy-fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
  });
}

/** The gameweeks the Points and Top players steppers offer. It was read under two keys. */
export function availableGameweeksQuery() {
  return queryOptions({
    queryKey: ["fantasy-gameweeks-available"],
    queryFn: () => fantasyService.getAvailableTopGameweeks(),
  });
}
