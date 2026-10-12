/**
 * Report and apply-script rendering for the one-time catalog mapping (pure, no
 * I/O). The apply script is TEXT for the owner to read and run; nothing here
 * connects to a database. See docs/backend/SOFASCORE_CATALOG_ID_MAPPING.md.
 */
import { createHash } from "node:crypto";
import {
  CLUB_MIN_AGREEING_FIXTURES,
  PLAYER_MIN_MATCHES,
  PLAYER_STRONG_MATCHES,
  type ClubMappingResult,
  type PlayerMappingResult,
} from "./sofascore-catalog-mapping";

export interface CatalogReport {
  readonly kind: "sofascore-catalog-id-mapping";
  readonly generatedAt: string;
  readonly namesShown: boolean;
  readonly thresholds: {
    readonly clubMinAgreeingFixtures: number;
    readonly playerStrongMatches: number;
    readonly playerMinMatches: number;
  };
  readonly inputs: {
    readonly fixturesMappedOnBothProviders: number;
    readonly fixturesWithBothLineups: number;
    readonly catalogClubs: number;
    readonly catalogPlayers: number;
    readonly existingSofascoreClubMappings: number;
    readonly existingSofascorePlayerMappings: number;
    readonly sofascoreRequests: number;
  };
  readonly clubs: Omit<ClubMappingResult, "resolved">;
  readonly players: PlayerMappingResult;
  readonly summary: {
    readonly clubs: Record<string, number>;
    readonly players: Record<string, number>;
    readonly unmappedByReason: Record<string, number>;
  };
  /** sha256 of the proposals only, carried into the apply script. */
  readonly proposalDigest: string;
}

const count = (rows: readonly { readonly status?: string; readonly confidence?: string }[]) => {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r.confidence ? `${r.status}/${r.confidence}` : (r.status ?? "?");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

export function proposalDigest(
  clubs: Pick<ClubMappingResult, "proposed">,
  players: Pick<PlayerMappingResult, "proposed">,
): string {
  const rows = [
    ...clubs.proposed.map((c) => `club|${c.internalId}|${c.sportsmonksId}|${c.sofascoreId}`),
    ...players.proposed.map(
      (p) => `player|${p.internalId}|${p.sportsmonksId}|${p.sofascoreId}|${p.confidence}`,
    ),
  ].sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

export function buildReport(args: {
  readonly generatedAt: string;
  readonly namesShown: boolean;
  readonly inputs: CatalogReport["inputs"];
  readonly clubs: ClubMappingResult;
  readonly players: PlayerMappingResult;
}): CatalogReport {
  const { clubs, players } = args;
  const reasons: Record<string, number> = {};
  for (const u of clubs.unmapped)
    reasons[`club:${u.reason}`] = (reasons[`club:${u.reason}`] ?? 0) + 1;
  for (const u of players.unmapped)
    reasons[`player:${u.reason}`] = (reasons[`player:${u.reason}`] ?? 0) + 1;
  return {
    kind: "sofascore-catalog-id-mapping",
    generatedAt: args.generatedAt,
    namesShown: args.namesShown,
    thresholds: {
      clubMinAgreeingFixtures: CLUB_MIN_AGREEING_FIXTURES,
      playerStrongMatches: PLAYER_STRONG_MATCHES,
      playerMinMatches: PLAYER_MIN_MATCHES,
    },
    inputs: args.inputs,
    clubs: {
      proposed: clubs.proposed,
      unmapped: clubs.unmapped,
      existingUnverified: clubs.existingUnverified,
    },
    players,
    summary: {
      clubs: { ...count(clubs.proposed), unmapped: clubs.unmapped.length },
      players: { ...count(players.proposed), unmapped: players.unmapped.length },
      unmappedByReason: reasons,
    },
    proposalDigest: proposalDigest(clubs, players),
  };
}

const cell = (value: unknown) =>
  String(value ?? "")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();

/** Readable tables. Names appear in a column only when the report was built with them. */
export function renderMarkdown(
  report: CatalogReport,
  opts: { readonly maxRows?: number } = {},
): string {
  const L: string[] = [];
  /** `maxRows` keeps a step summary under GitHub's size limit; the full tables go to the artifact. */
  const lim = <T>(rows: readonly T[]): readonly T[] =>
    opts.maxRows === undefined ? rows : rows.slice(0, opts.maxRows);
  const more = (total: number) => {
    if (opts.maxRows !== undefined && total > opts.maxRows)
      L.push(``, `(first ${opts.maxRows} of ${total} rows; the full table is in the report file)`);
  };
  const names = report.namesShown;
  const head = (cols: string[]) => {
    L.push(`| ${cols.join(" | ")} |`);
    L.push(`| ${cols.map(() => "---").join(" | ")} |`);
  };
  L.push("# SofaScore catalog ID mapping (report, nothing written)");
  L.push("");
  L.push(
    `Generated ${report.generatedAt}. Digest \`${report.proposalDigest.slice(0, 16)}\`. ` +
      `SofaScore requests: ${report.inputs.sofascoreRequests}. ` +
      (names
        ? "Names are shown for reading only; no decision used them."
        : "Names are not included (ids only)."),
  );
  L.push("");
  L.push(
    `Thresholds: clubs need ${report.thresholds.clubMinAgreeingFixtures} agreeing fixtures; ` +
      `players ${report.thresholds.playerStrongMatches}+ matches = multi_match, ` +
      `${report.thresholds.playerMinMatches} match with no conflict = single_match.`,
  );
  L.push("");
  L.push("## Inputs");
  L.push("");
  for (const [k, v] of Object.entries(report.inputs)) L.push(`- ${k}: ${v}`);
  L.push("");
  L.push("## Summary");
  L.push("");
  L.push(`- clubs: ${JSON.stringify(report.summary.clubs)}`);
  L.push(`- players: ${JSON.stringify(report.summary.players)}`);
  L.push(`- unmapped by reason: ${JSON.stringify(report.summary.unmappedByReason)}`);
  L.push(
    `- SofaScore players seen in lineups: ${report.players.sofascorePlayersSeen}, not matched to a catalog player in this run: ${report.players.sofascorePlayersWithoutCatalogMatch}`,
  );
  L.push("");
  L.push("## Clubs: proposed");
  L.push("");
  head([
    "internal id",
    "SportsMonks",
    "SofaScore",
    "fixtures",
    "status",
    ...(names ? ["name"] : []),
  ]);
  for (const c of lim(report.clubs.proposed))
    L.push(
      `| ${c.internalId} | ${c.sportsmonksId} | ${c.sofascoreId} | ${c.fixtures} | ${c.status} |${names ? ` ${cell(c.displayName)} |` : ""}`,
    );
  L.push("");
  L.push("## Clubs: UNMAPPED");
  L.push("");
  head(["internal id", "SportsMonks", "reason", "best evidence", ...(names ? ["name"] : [])]);
  for (const u of lim(report.clubs.unmapped))
    L.push(
      `| ${u.internalId} | ${u.sportsmonksId ?? ""} | ${u.reason} | ${cell(u.bestEvidence)} |${names ? ` ${cell(u.displayName)} |` : ""}`,
    );
  L.push("");
  L.push("## Players: proposed");
  L.push("");
  head([
    "internal id",
    "SportsMonks",
    "SofaScore",
    "matches",
    "confidence",
    "status",
    "shirts",
    ...(names ? ["name (catalog)", "name (SofaScore)"] : []),
  ]);
  for (const p of lim(report.players.proposed))
    L.push(
      `| ${p.internalId} | ${p.sportsmonksId} | ${p.sofascoreId} | ${p.matches} | ${p.confidence} | ${p.status} | ${p.shirts.join(",")} |${names ? ` ${cell(p.displayName)} | ${cell(p.sofascoreDisplayName)} |` : ""}`,
    );
  more(report.players.proposed.length);
  L.push("");
  L.push("## Players: UNMAPPED");
  L.push("");
  head(["internal id", "SportsMonks", "reason", "best evidence", ...(names ? ["name"] : [])]);
  for (const u of lim(report.players.unmapped))
    L.push(
      `| ${u.internalId} | ${u.sportsmonksId ?? ""} | ${u.reason} | ${cell(u.bestEvidence)} |${names ? ` ${cell(u.displayName)} |` : ""}`,
    );
  more(report.players.unmapped.length);
  L.push("");
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// Apply script
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NUM = /^[0-9]{1,20}$/;

export interface ApplyOptions {
  readonly includeSingleMatch: boolean;
  /** Auth user id of the owner's staff account; left as a placeholder when absent. */
  readonly ownerAuthUserId?: string;
}

export function selectedPlayers(report: CatalogReport, opts: ApplyOptions) {
  return report.players.proposed.filter(
    (p) => p.status === "new" && (opts.includeSingleMatch || p.confidence === "multi_match"),
  );
}

/**
 * A guarded owner-run script. It ends in a deliberate exception (the dry run
 * carrying the computed state out in its message) unless the owner changes
 * c_commit to true; every guard runs either way. Players are written exactly the
 * way api.admin_resolve_sofascore_player_match writes them (staff-resolution
 * log row plus a mapping whose source_version names that row), so the Fantasy
 * "reviewed" check accepts them. Teams are written as plain mappings.
 */
export function renderApplySql(report: CatalogReport, opts: ApplyOptions): string {
  const clubs = report.clubs.proposed.filter((c) => c.status === "new");
  const players = selectedPlayers(report, opts);
  for (const c of clubs)
    if (!UUID.test(c.internalId) || !NUM.test(c.sportsmonksId) || !NUM.test(c.sofascoreId))
      throw new Error("catalog_sql_invalid_id: a club id is not in the expected shape");
  for (const p of players)
    if (!UUID.test(p.internalId) || !NUM.test(p.sportsmonksId) || !NUM.test(p.sofascoreId))
      throw new Error("catalog_sql_invalid_id: a player id is not in the expected shape");
  if (opts.ownerAuthUserId !== undefined && !UUID.test(opts.ownerAuthUserId))
    throw new Error("catalog_sql_invalid_owner: not a uuid");
  if (!/^[0-9a-f]{64}$/.test(report.proposalDigest)) throw new Error("catalog_sql_invalid_digest");

  const clubJson = JSON.stringify(
    clubs.map((c) => ({
      internal_id: c.internalId,
      sm_id: c.sportsmonksId,
      sofa_id: c.sofascoreId,
    })),
  );
  const playerJson = JSON.stringify(
    players.map((p) => ({
      internal_id: p.internalId,
      sm_id: p.sportsmonksId,
      sofa_id: p.sofascoreId,
    })),
  );
  const tag = report.proposalDigest.slice(0, 12);
  const owner = opts.ownerAuthUserId ?? "REPLACE-WITH-OWNER-AUTH-USER-ID";
  return `-- SofaScore catalog ID mapping: GUARDED OWNER-RUN SCRIPT (generated; read it before running).
-- Report digest ${report.proposalDigest}
-- Clubs: ${clubs.length}. Players: ${players.length} (${opts.includeSingleMatch ? "multi_match and single_match" : "multi_match only"}).
--
-- Before running (AGENTS.md "One writer at a time, per database"): list running agents and
-- workflows, pause the cron writers that touch fixtures and players (AGENTS.md, "Before
-- writing", item 3), then set c_one_writer_checked to true. This script writes
-- app_private.football_provider_mappings, app_private.sofascore_player_match_log and
-- app_private.sofascore_player_match_queue.
--
-- It DOES NOT COMMIT BY DEFAULT: with c_commit = false it runs every guard and every insert, then
-- raises DRY_RUN_ROLLBACK with the computed counts, and the whole DO block is rolled back.
-- Read the message, re-read the tables to confirm nothing changed, then set c_commit to true.
-- It never loosens a guard: a guard that fires means production moved since the report.

do $catalog_map$
declare
  c_commit constant boolean := false;
  c_one_writer_checked constant boolean := false;
  c_owner_text constant text := '${owner}';
  c_expected_sofa_team_mappings constant integer := ${report.inputs.existingSofascoreClubMappings};
  c_expected_sofa_player_mappings constant integer := ${report.inputs.existingSofascorePlayerMappings};
  c_clubs constant jsonb := '${clubJson}'::jsonb;
  c_players constant jsonb := '${playerJson}'::jsonb;
  c_reason constant text := 'Id-based catalog mapping (same side, shirt and position in mapped matches), approved by the owner from report ${tag}.';
  v_owner uuid;
  r record;
  v_n integer;
  v_log uuid;
  v_mapping uuid;
  v_clubs_inserted integer := 0;
  v_players_inserted integer := 0;
  v_queue_closed integer := 0;
begin
  if not c_one_writer_checked then
    raise exception 'GUARD: set c_one_writer_checked to true only after checking nothing else writes';
  end if;
  if c_owner_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'GUARD: set c_owner_text to the owner auth user id (auth.users.id of the staff account)';
  end if;
  v_owner := c_owner_text::uuid;
  -- The same lock the automatic player matcher takes, so the two never interleave.
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));
  if not exists (select 1 from app_private.staff_principals sp where sp.auth_user_id = v_owner) then
    raise exception 'GUARD: c_owner_text is not a staff principal';
  end if;
  if to_regclass('app_private.sofascore_player_match_log') is null
    or to_regclass('app_private.sofascore_player_match_queue') is null then
    raise exception 'GUARD: migration 20261011130000 (player auto map) is not applied';
  end if;

  select count(*) into v_n from app_private.football_provider_mappings
   where provider_name = 'sofascore' and entity_type = 'team';
  if v_n <> c_expected_sofa_team_mappings then
    raise exception 'GUARD: sofascore team mappings are % but the report saw %', v_n, c_expected_sofa_team_mappings;
  end if;
  select count(*) into v_n from app_private.football_provider_mappings
   where provider_name = 'sofascore' and entity_type = 'player';
  if v_n <> c_expected_sofa_player_mappings then
    raise exception 'GUARD: sofascore player mappings are % but the report saw %', v_n, c_expected_sofa_player_mappings;
  end if;

  for r in select * from jsonb_to_recordset(c_clubs) as x(internal_id uuid, sm_id text, sofa_id text) loop
    if not exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sportsmonks' and m.entity_type = 'team' and m.active
          and m.external_id = r.sm_id and m.internal_entity_id = r.internal_id) then
      raise exception 'GUARD: SportsMonks team mapping changed for %', r.internal_id;
    end if;
    if exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sofascore' and m.entity_type = 'team'
          and (m.external_id = r.sofa_id or m.internal_entity_id = r.internal_id)) then
      raise exception 'GUARD: a SofaScore team mapping already exists for club % or id %', r.internal_id, r.sofa_id;
    end if;
    insert into app_private.football_provider_mappings (
      provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active)
    values ('sofascore', 'team', r.sofa_id, r.internal_id, 'sofascore-catalog-map:${tag}', statement_timestamp(), true);
    v_clubs_inserted := v_clubs_inserted + 1;
  end loop;

  for r in select * from jsonb_to_recordset(c_players) as x(internal_id uuid, sm_id text, sofa_id text) loop
    if not exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sportsmonks' and m.entity_type = 'player' and m.active
          and m.external_id = r.sm_id and m.internal_entity_id = r.internal_id) then
      raise exception 'GUARD: SportsMonks player mapping changed for %', r.internal_id;
    end if;
    if exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sofascore' and m.entity_type = 'player'
          and (m.external_id = r.sofa_id or m.internal_entity_id = r.internal_id)) then
      raise exception 'GUARD: a SofaScore player mapping already exists for player % or id %', r.internal_id, r.sofa_id;
    end if;
    v_log := gen_random_uuid();
    insert into app_private.football_provider_mappings (
      provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active,
      manually_corrected, correction_reason, corrected_by, corrected_at)
    values ('sofascore', 'player', r.sofa_id, r.internal_id, 'sofascore-admin-resolve:' || v_log::text,
      statement_timestamp(), true, true, c_reason, v_owner, statement_timestamp())
    returning id into v_mapping;
    insert into app_private.sofascore_player_match_log (
      id, method, mapping_id, sofascore_player_id, player_id, fixture_id, evidence, decided_by)
    values (v_log, 'staff-resolution', v_mapping, r.sofa_id, r.internal_id, null,
      jsonb_build_object('source', 'catalog-id-mapping', 'reportDigest', '${report.proposalDigest}'), v_owner);
    update app_private.sofascore_player_match_queue
       set resolved_at = statement_timestamp(), resolved_by = v_owner, resolved_player_id = r.internal_id
     where sofascore_player_id = r.sofa_id and resolved_at is null;
    get diagnostics v_n = row_count;
    v_queue_closed := v_queue_closed + v_n;
    v_players_inserted := v_players_inserted + 1;
  end loop;

  if not c_commit then
    raise exception 'DRY_RUN_ROLLBACK: would insert % club mapping(s), % player mapping(s), close % queue row(s). Nothing was written.',
      v_clubs_inserted, v_players_inserted, v_queue_closed;
  end if;
  raise notice 'COMMITTED: % club mapping(s), % player mapping(s), % queue row(s) closed',
    v_clubs_inserted, v_players_inserted, v_queue_closed;
end
$catalog_map$;
`;
}
