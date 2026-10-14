import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  overallStandingDto,
  playerDto,
  pointsDto,
  roundBoardGameweekIds,
  seasonStatsById,
} from "./fantasy-runtime";
import { dictionaries } from "@/i18n/dictionaries";
import { fantasyPointsSchema } from "@/backend/fantasy/contracts";
import type {
  FantasyOverallStandingDto,
  FantasyPlayerDto,
  FantasyPlayerSeasonStatDto,
} from "@/backend/fantasy/contracts";

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

describe("playerDto carries the approved photo", () => {
  const path =
    "football/players/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000009.webp";

  test("an approved photo becomes the public URL of its derivative", () => {
    const before = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL ||= "https://example.supabase.co";
    try {
      const player = playerDto(poolPlayer({ photo: { storagePath: path } }), stat());
      expect(player.photoUrl).toEndWith(`/storage/v1/object/public/football-media/${path}`);
    } finally {
      if (before === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = before;
    }
  });

  test("no photo, or a list from before the migration, means the silhouette", () => {
    expect(playerDto(poolPlayer({ photo: null }), stat()).photoUrl).toBeNull();
    expect(playerDto(poolPlayer(), stat()).photoUrl).toBeNull();
  });

  test("a path outside the public media namespaces is never turned into a URL", () => {
    const player = playerDto(
      poolPlayer({ photo: { storagePath: "players/x/release-1.pdf" } }),
      stat(),
    );
    expect(player.photoUrl).toBeNull();
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
    // BG-0093 removed `src/components/fantasy/PlayerPickerDrawer.tsx`: a second,
    // unreachable player picker (no component imported it; this list was its
    // only reference) that knew nothing about the bank or the three-per-club
    // limit. `AddPlayerScreen` is the live picker and carries the guard.
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

describe("top players of the week: unknown goals, assists and clean sheets", () => {
  test("the runtime reports them as unknown, not as literal zeros", () => {
    const source = readFileSync(join(ROOT, "src/services/fantasy-runtime.ts"), "utf8");
    expect(source).not.toMatch(/\b(goals|assists|cleanSheets): 0,/);
  });

  test("the top-players screen never formats them without the dash branch", () => {
    const source = readFileSync(join(ROOT, "src/routes/fantasy.top-players.tsx"), "utf8");
    expect(source).not.toMatch(/format\(top\.(goals|assists|cleanSheets)\)/);
    expect(source).toContain("countOrNone(nf, top.goals, t)");
  });
});

describe("a gameweek that closed on provisional points says so (staged SofaScore statistics)", () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const payload = (over: Record<string, unknown>) =>
    fantasyPointsSchema.parse({
      teamId: uuid(1),
      gameweekId: uuid(2),
      gameweekStatus: "provisional",
      pointsState: "provisional",
      result: {
        startingPoints: 20,
        benchPoints: 4,
        captainPoints: 2,
        transferHit: 0,
        chipType: null,
        provisionalScore: 22,
        finalScore: null,
        state: "provisional",
        rank: 1,
        overallRank: 1,
        calculationVersion: 3,
        finalizedAt: null,
      },
      players: [],
      autoSubstitutions: [],
      ...over,
    });

  test("closed and not locked: the points screen is told", () => {
    const view = pointsDto(7, payload({ closedAt: "2026-10-12T10:00:00Z" }), null);
    expect(view?.authoritative?.closedProvisional).toBe(true);
    expect(view?.authoritative?.finalized).toBe(false);
  });

  test("an ordinary provisional gameweek is not labelled closed", () => {
    expect(pointsDto(7, payload({}), null)?.authoritative?.closedProvisional).toBe(false);
    expect(pointsDto(7, payload({ closedAt: null }), null)?.authoritative?.closedProvisional).toBe(
      false,
    );
  });

  test("once locked the label goes away even though the gameweek did close", () => {
    const view = pointsDto(
      7,
      payload({
        closedAt: "2026-10-12T10:00:00Z",
        gameweekStatus: "finalized",
        pointsState: "final",
      }),
      null,
    );
    expect(view?.authoritative?.closedProvisional).toBe(false);
    expect(view?.authoritative?.finalized).toBe(true);
  });

  test("the copy exists in French and Arabic", () => {
    expect(dictionaries.fr["fantasy.scoring.closedProvisional"]).not.toMatch(/provisoire/i);
    expect(dictionaries.ar["fantasy.scoring.closedProvisional"]?.length).toBeGreaterThan(20);
  });
});

/**
 * FANT-04 — the cloud round board is the server's. These pin the two pieces of
 * it that are decided in the browser: an unknown earlier rank stays unknown,
 * and the round board is read for a gameweek that scoring has reached.
 */
describe("round rankings come from the server (FANT-04)", () => {
  const dto = (overrides: Partial<FantasyOverallStandingDto> = {}): FantasyOverallStandingDto => ({
    teamId: "00000000-0000-4000-8000-0000000000aa",
    teamName: "Aigles",
    managerName: "Sara",
    rank: 7,
    previousRank: null,
    totalPoints: 120,
    gameweekPoints: 55,
    calculatedAt: "2026-10-14T10:00:00Z",
    ...overrides,
  });

  test("an unknown earlier rank is null, not the current rank", () => {
    expect(overallStandingDto(dto()).previousRank).toBeNull();
  });

  test("a known earlier rank and the server's rank pass through unchanged", () => {
    const row = overallStandingDto(dto({ rank: 3, previousRank: 9 }));
    expect(row.rank).toBe(3);
    expect(row.previousRank).toBe(9);
  });

  test("the round board is read for the newest scored gameweeks, newest first", () => {
    const gameweeks = [
      { id: "gw1", sequence: 1, status: "finalized" },
      { id: "gw2", sequence: 2, status: "finalized" },
      { id: "gw3", sequence: 3, status: "provisional" },
      { id: "gw4", sequence: 4, status: "open" },
      { id: "gw5", sequence: 5, status: "scheduled" },
    ];
    expect(roundBoardGameweekIds(gameweeks)).toEqual(["gw3", "gw2", "gw1"]);
  });

  test("a season where scoring has not started has no round board to read", () => {
    expect(
      roundBoardGameweekIds([
        { id: "gw1", sequence: 1, status: "open" },
        { id: "gw2", sequence: 2, status: "scheduled" },
      ]),
    ).toEqual([]);
  });

  test("the cloud rankings read hands the board to the server-order selector, never the mock sorter", () => {
    const source = readFileSync(join(ROOT, "src/services/fantasy-runtime.ts"), "utf8");
    const from = source.indexOf("async getGlobalRankings");
    const body = source.slice(from, source.indexOf("async getTopOverallStandings", from));
    const cloudPart = body.slice(body.indexOf("const current = await hub();"));
    expect(cloudPart).toContain("selectBoardPage");
    expect(cloudPart).not.toContain("selectRankingsPage");
  });

  test("both dictionaries name the unknown movement", () => {
    expect(dictionaries.fr["fantasy.rank.unknown"]).toBeTruthy();
    expect(dictionaries.ar["fantasy.rank.unknown"]).toBeTruthy();
  });
});
