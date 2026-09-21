import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { playerDto, seasonStatsById } from "./fantasy-runtime";
import { dictionaries } from "@/i18n/dictionaries";
import type { FantasyPlayerDto, FantasyPlayerSeasonStatDto } from "@/backend/fantasy/contracts";

/**
 * BG-0071 — the defect this file guards.
 *
 * `playerDto` used to set `totalPoints: 0, form: 0, ownership: 0`
 * unconditionally, so every player list, the squad-builder picker and the
 * player detail page showed 0 points / 0.0 form / 0.0% for all 539 players for
 * the whole season, while the points sat in
 * `app.fantasy_player_gameweek_points` all along.
 *
 * The subtle half of the fix is the difference between two facts that used to
 * look identical on screen:
 *
 *   * `form === null` — NO gameweek of the season has scored yet. There is no
 *     number to show. This is production's state today.
 *   * `form === 0`    — gameweeks HAVE scored and this player took nothing from
 *     them. That is a real, useful 0.
 *
 * The first renders a dash (`fantasy.stat.none`), the second renders 0. If a
 * future change collapses them the picking screens go back to lying, so both
 * the mapping and the rendering branch are asserted here.
 */

const ROOT = join(import.meta.dir, "..", "..");

const poolPlayer = (overrides: Partial<FantasyPlayerDto> = {}): FantasyPlayerDto => ({
  id: "00000000-0000-4000-8000-000000000001",
  footballPlayerId: "00000000-0000-4000-8000-000000000002",
  footballTeamId: "00000000-0000-4000-8000-000000000003",
  name: "Ayoub El Kaabi",
  fullName: "Ayoub El Kaabi",
  position: "FWD",
  price: 9.5,
  status: "available",
  teamName: "Raja Club Athletic",
  teamShortName: "RCA",
  photoAssetId: null,
  crestAssetId: null,
  // Deprecated by BG-0071: declared, read by api.fantasy_player_pool, written
  // by nothing. A non-zero value here proves the mapper ignores it.
  selectedByCount: 42,
  ...overrides,
});

const stat = (overrides: Partial<FantasyPlayerSeasonStatDto> = {}): FantasyPlayerSeasonStatDto => ({
  fantasyPlayerId: "00000000-0000-4000-8000-000000000001",
  totalPoints: 64,
  form: 5.4,
  gameweeksPlayed: 12,
  minutes: 1_020,
  ownershipCount: 2,
  ownershipPercent: 50,
  ...overrides,
});

describe("playerDto merges the season aggregate instead of hardcoding zeros", () => {
  test("total points, form and ownership come from the stats row", () => {
    const player = playerDto(poolPlayer(), stat());
    expect(player.totalPoints).toBe(64);
    expect(player.form).toBe(5.4);
    expect(player.ownership).toBe(50);
  });

  test("identity, position and price still come from the pool row", () => {
    const player = playerDto(poolPlayer(), stat());
    expect(player.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(player.clubId).toBe("00000000-0000-4000-8000-000000000003");
    expect(player.position).toBe("FWD");
    expect(player.price).toBe(9.5);
  });

  test("ownership is the server-derived percent, never selected_by_count", () => {
    // selectedByCount is 42 on the pool row above and has no writer in the
    // database; reading it would resurrect the defect BG-0071 deprecates.
    const player = playerDto(poolPlayer(), stat({ ownershipCount: 0, ownershipPercent: 0 }));
    expect(player.ownership).toBe(0);
  });

  test("ownership is 0 when the season has no active team", () => {
    // api.fantasy_player_season_stats already guards the divide-by-zero and
    // sends 0; the mapper must not turn that into something else.
    const player = playerDto(poolPlayer(), stat({ ownershipCount: 0, ownershipPercent: 0 }));
    expect(player.ownership).toBe(0);
    expect(Number.isNaN(player.ownership)).toBe(false);
  });

  test("a player absent from the aggregate reads as unknown, not as zero form", () => {
    const player = playerDto(poolPlayer(), undefined);
    expect(player.totalPoints).toBe(0);
    expect(player.ownership).toBe(0);
    expect(player.form).toBeNull();
  });
});

describe("form: no gameweek scored is not the same fact as scored nothing", () => {
  test("null survives the mapper untouched", () => {
    // Production today: zero scored gameweeks, so the RPC sends null for every
    // player. `?? 0` anywhere on this path would print 0.0 for all 539.
    const player = playerDto(poolPlayer(), stat({ form: null, totalPoints: 0 }));
    expect(player.form).toBeNull();
    expect(player.form).not.toBe(0);
  });

  test("a genuine 0 survives the mapper as 0", () => {
    const player = playerDto(poolPlayer(), stat({ form: 0 }));
    expect(player.form).toBe(0);
    expect(player.form).not.toBeNull();
  });

  test("the null form renders a dash and the 0 form renders a number", () => {
    // The expression under test is exactly the one the surfaces use:
    //   p.form === null ? t("fantasy.stat.none") : <number>
    const t = (key: "fantasy.stat.none") => dictionaries.fr[key];
    const render = (form: number | null) =>
      form === null ? t("fantasy.stat.none") : form.toFixed(1);

    expect(render(playerDto(poolPlayer(), stat({ form: null })).form)).toBe("–");
    expect(render(playerDto(poolPlayer(), stat({ form: 0 })).form)).toBe("0.0");
    expect(render(playerDto(poolPlayer(), stat({ form: null })).form)).not.toBe("0.0");
  });

  test("fantasy.stat.none is a dash in both languages and is not a number", () => {
    expect(dictionaries.fr["fantasy.stat.none"]).toBe("–");
    expect(dictionaries.ar["fantasy.stat.none"]).toBe("–");
    expect(dictionaries.ar["fantasy.stat.none"]).not.toMatch(/\d/);
  });
});

describe("seasonStatsById", () => {
  test("indexes the aggregate by fantasy player id", () => {
    const rows = [
      stat({ fantasyPlayerId: "00000000-0000-4000-8000-00000000000a", totalPoints: 1 }),
      stat({ fantasyPlayerId: "00000000-0000-4000-8000-00000000000b", totalPoints: 2 }),
    ];
    const map = seasonStatsById(rows);
    expect(map.size).toBe(2);
    expect(map.get("00000000-0000-4000-8000-00000000000b")?.totalPoints).toBe(2);
    expect(map.get("00000000-0000-4000-8000-0000000000ff")).toBeUndefined();
  });

  test("an empty aggregate yields an empty index rather than throwing", () => {
    expect(seasonStatsById([]).size).toBe(0);
  });
});

/**
 * Source-text guards. There is no DOM test runner in this repository (see
 * `src/components/ui-kit/ui-kit.contract.test.ts` for the same technique), and
 * the thing that must not regress is a JSX branch, which nothing at runtime can
 * observe from here. Every surface that formats a player's `form` must name the
 * dash key next to it.
 */
describe("every player-stat surface renders the dash for a null form", () => {
  const SURFACES = [
    "src/routes/fantasy.players.tsx",
    "src/routes/fantasy.players.$playerId.tsx",
    "src/components/fpl/AddPlayerScreen.tsx",
    "src/components/fantasy/PlayerPickerDrawer.tsx",
    "src/components/common/PlayerRow.tsx",
    "src/routes/fantasy.top-players.tsx",
    "src/routes/fantasy.create.tsx",
    "src/routes/fantasy.points.tsx",
    "src/routes/fantasy.team.tsx",
    "src/routes/fantasy.transfers.tsx",
  ] as const;

  for (const surface of SURFACES) {
    test(`${surface} guards form with fantasy.stat.none`, () => {
      const source = readFileSync(join(ROOT, surface), "utf8");
      expect(source).toContain('t("fantasy.stat.none")');
      // An unguarded `nf.format(x.form)` or `x.form.toFixed(1)` would print
      // "0,0" / "0.0" for a null form the day TypeScript's narrowing is lost
      // (a cast, a `?? 0`, a widened prop). Every line that formats a form must
      // carry the dash branch with it.
      const unguarded = source
        .split("\n")
        .filter((line) => /\.form\.toFixed\(|format\([A-Za-z]+\.form\)/.test(line))
        .filter((line) => !line.includes('t("fantasy.stat.none")'));
      expect(unguarded).toEqual([]);
    });
  }
});
