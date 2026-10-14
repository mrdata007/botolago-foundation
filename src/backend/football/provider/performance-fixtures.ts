import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

type LineupSide = { players?: { statistics?: Record<string, unknown> }[] };

/**
 * Full coverage means every player with minutes played has a rating and a pass
 * count (docs/backend/SOFASCORE_STAGED_STATS.md). SofaScore does not rate players
 * who came on very late, so the captured full-coverage lineups have a few unrated
 * substitutes and would now read as limited. For the tests that need a full match
 * (and only those with pass counts, i.e. the full ones) the loader rates those
 * players, so a fixture that was full under the earlier rule stays full. Limited
 * fixtures (no pass counts) are returned as captured. The committed files are not
 * changed.
 */
function rateUnratedPlayers(lineups: { home?: LineupSide; away?: LineupSide }): void {
  const sides = [lineups.home, lineups.away];
  const players = sides.flatMap((side) => side?.players ?? []);
  if (!players.some((player) => player.statistics?.totalPass !== undefined)) return;
  for (const player of players) {
    const stats = player.statistics;
    if (stats && typeof stats.minutesPlayed === "number" && stats.minutesPlayed > 0) {
      stats.rating ??= 6.1;
      stats.totalPass ??= 10;
    }
  }
}

/** Reads a committed Phase 0 trimmed fixture (tests/fixtures/providers). */
export function providerFixture(provider: "sofascore" | "flashscore", name: string): unknown {
  const root = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../tests/fixtures/providers",
  );
  const fixture = JSON.parse(readFileSync(resolve(root, provider, `${name}.json`), "utf8"));
  if (provider === "sofascore" && name.endsWith(".lineups")) rateUnratedPlayers(fixture);
  return fixture;
}
