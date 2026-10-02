/**
 * Refreshes demo/src/data/catalog.json and the crests from the live catalog:
 * the sixteen clubs of the current Fantasy pool (names in French and Arabic,
 * codes, crests) and every player's name, club, position and price.
 *
 * Read-only. It calls the same public RPCs a visitor's browser calls, with
 * the publishable key committed in .env.production. It writes nothing
 * anywhere but this folder.
 *
 * Usage: bun demo/scripts/refresh-catalog.ts
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = join(demoDir, "..");
const env = Object.fromEntries(
  readFileSync(join(repoDir, ".env.production"), "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      "Content-Profile": "api",
      "Accept-Profile": "api",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

interface Team {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  code: string | null;
  crestPath: string | null;
}
interface PoolPlayer {
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  price: number;
  footballTeamId: string;
}

const hub = await rpc<{ season: { id: string; name: string } }>("fantasy_hub", {
  p_language: "fr",
});
const [teamsFr, teamsAr] = await Promise.all(
  (["fr", "ar"] as const).map((language) =>
    rpc<Team[]>("football_team_catalog", { p_language: language, p_limit: 40 }),
  ),
);

const pool: PoolPlayer[] = [];
let cursor: { id: string; price: number } | null = null;
do {
  const page: { items: PoolPlayer[]; nextCursor: { id: string; price: number } | null } = await rpc(
    "fantasy_player_pool",
    {
      p_season_id: hub.season.id,
      p_position: null,
      p_team_id: null,
      p_max_price: null,
      p_search: null,
      p_after_price: cursor?.price ?? null,
      p_after_id: cursor?.id ?? null,
      p_limit: 100,
    },
  );
  pool.push(...page.items);
  cursor = page.items.length ? page.nextCursor : null;
} while (cursor);

const inPool = new Set(pool.map((player) => player.footballTeamId));
const clubs = teamsFr
  .filter((team) => inPool.has(team.id))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));
const arabic = new Map(teamsAr.map((team) => [team.id, team]));

const crestDir = join(demoDir, "src", "assets", "crests");
rmSync(crestDir, { recursive: true, force: true });
mkdirSync(crestDir, { recursive: true });
const catalogClubs = [];
for (const club of clubs) {
  const base = club.slug.replace(/-[0-9a-f]{6,}$/, "");
  const response = await fetch(`${url}/storage/v1/object/public/football-media/${club.crestPath}`);
  if (!response.ok) throw new Error(`crest ${club.name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const crest = `${base}.${jpeg ? "jpg" : "png"}`;
  writeFileSync(join(crestDir, crest), bytes);
  const ar = arabic.get(club.id)!;
  catalogClubs.push({
    id: club.id,
    slug: club.slug,
    name: { fr: club.name, ar: ar.name },
    shortName: { fr: club.shortName, ar: ar.shortName },
    code: club.code,
    crest,
  });
}

const order = ["GK", "DEF", "MID", "FWD"];
const index = new Map(catalogClubs.map((club, i) => [club.id, i]));
const players = pool
  .sort(
    (a, b) =>
      index.get(a.footballTeamId)! - index.get(b.footballTeamId)! ||
      order.indexOf(a.position) - order.indexOf(b.position) ||
      b.price - a.price ||
      a.name.localeCompare(b.name),
  )
  .map((player) => [
    player.name,
    index.get(player.footballTeamId)!,
    player.position,
    Number(player.price),
  ]);

writeFileSync(
  join(demoDir, "src", "data", "catalog.json"),
  `${JSON.stringify(
    {
      source: `BotolaGO production catalog (api.football_team_catalog, api.fantasy_player_pool), season ${hub.season.name}, read ${new Date().toISOString().slice(0, 10)}. Names, clubs, positions and prices only; every statistic in the demo is generated sample data.`,
      clubs: catalogClubs,
      players,
    },
    null,
    1,
  )}\n`,
);
console.log(
  `${catalogClubs.length} clubs, ${players.length} players, ${readdirSync(crestDir).length} crests`,
);
console.log("Run `bunx prettier --write demo/src/data/catalog.json` before committing.");
