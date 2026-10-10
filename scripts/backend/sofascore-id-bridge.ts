/**
 * SofaScore ID bridge runner (P3). DRY-RUN by default.
 *
 *   bun scripts/backend/sofascore-id-bridge.ts \
 *     --events events.json --snapshot snapshot.json --teams teams.json \
 *     --competition-id <uuid> --season-id <uuid> [--mode dry-run|apply]
 *
 * - `--events`: JSON array of SofaScore events (or `{events: [...]}`) captured
 *   earlier. This tool never calls SofaScore or any provider.
 * - `--snapshot`: JSON `{fixtures, rounds, existing}` from the read-only SQL in
 *   docs/backend/SOFASCORE_ID_BRIDGE.md. This tool reads no database in dry-run.
 * - `--teams`: JSON `{ "<sofascoreTeamId>": "<internal team uuid>" }`, the
 *   owner-reviewed pairing. Falls back to the committed table (empty until
 *   reviewed, see src/backend/football/sofascore-team-table.ts).
 * - `--mode apply`: writes, only through `api.resolve_football_mapping`. Needs
 *   `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and
 *   `SOFASCORE_ID_BRIDGE_CONFIRMATION=ATTACH_SOFASCORE_IDS_ON_STAGING`. Refuses
 *   the production project. Run the one-writer checks in AGENTS.md first.
 *
 * Exit codes: 0 clean, 2 the report has items needing review (nothing is
 * mapped for them), 4 the database refused or a re-point is pending.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  SOFASCORE_PROVIDER,
  planSofascoreIdBridge,
  type BridgeInput,
  type BridgePlan,
  type ExistingMapping,
  type InternalFixture,
  type InternalRound,
  type PlannedMapping,
  type SofascoreEvent,
} from "../../src/backend/football/sofascore-id-bridge";
import { reviewedTeamTable } from "../../src/backend/football/sofascore-team-table";

export const PRODUCTION_PROJECT_REF = "tkewgajrljbwgwedqsxn";
export const APPLY_CONFIRMATION = "ATTACH_SOFASCORE_IDS_ON_STAGING";
export const SOFASCORE_COMPETITION_ID = "937";
export const SOFASCORE_SEASON_ID = "102220";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BridgeMode = "dry-run" | "apply";

/** Refuses anything but a staging write that was asked for in so many words. */
export function bridgeGuard(
  mode: BridgeMode,
  env: Record<string, string | undefined>,
): { url: string; secret: string } | null {
  if (mode === "dry-run") return null;
  const url = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const secret = env.SUPABASE_SECRET_KEY ?? "";
  if (
    !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) &&
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)
  )
    throw new Error(
      "sofascore_bridge_url_invalid: SUPABASE_URL must be a Supabase project or local stack URL",
    );
  if (url.includes(PRODUCTION_PROJECT_REF))
    throw new Error("sofascore_bridge_production_refused: this tool runs on staging only");
  if (!secret) throw new Error("sofascore_bridge_secret_missing: SUPABASE_SECRET_KEY is required");
  if (env.SOFASCORE_ID_BRIDGE_CONFIRMATION !== APPLY_CONFIRMATION)
    throw new Error(
      `sofascore_bridge_confirmation_missing: set SOFASCORE_ID_BRIDGE_CONFIRMATION=${APPLY_CONFIRMATION}`,
    );
  return { url, secret };
}

export interface Snapshot {
  readonly fixtures: readonly InternalFixture[];
  readonly rounds: readonly InternalRound[];
  readonly existing: readonly ExistingMapping[];
}

export function parseEvents(value: unknown): SofascoreEvent[] {
  const list = Array.isArray(value) ? value : (value as { events?: unknown })?.events;
  if (!Array.isArray(list)) throw new Error("sofascore_bridge_events_invalid: expected an array");
  return list.map((raw, i) => {
    const e = raw as SofascoreEvent;
    if (
      !Number.isInteger(e?.id) ||
      !Number.isInteger(e?.startTimestamp) ||
      typeof e?.status?.type !== "string" ||
      !Number.isInteger(e?.homeTeam?.id) ||
      !Number.isInteger(e?.awayTeam?.id)
    )
      throw new Error(`sofascore_bridge_events_invalid: event ${i} is malformed`);
    return e;
  });
}

export function parseSnapshot(value: unknown): Snapshot {
  const s = value as Partial<Snapshot>;
  if (!Array.isArray(s?.fixtures) || !Array.isArray(s?.rounds) || !Array.isArray(s?.existing))
    throw new Error("sofascore_bridge_snapshot_invalid: needs fixtures, rounds and existing");
  for (const f of s.fixtures)
    if (!f.id || !f.homeTeamId || !f.awayTeamId || Number.isNaN(Date.parse(f.kickoffAt)))
      throw new Error(`sofascore_bridge_snapshot_invalid: fixture ${f?.id} is malformed`);
  return s as Snapshot;
}

export function parseTeams(value: unknown): Map<number, string> {
  const table = new Map<number, string>();
  for (const [key, uuid] of Object.entries((value ?? {}) as Record<string, unknown>)) {
    if (!/^\d+$/.test(key) || typeof uuid !== "string" || !UUID.test(uuid))
      throw new Error(`sofascore_bridge_teams_invalid: ${key}`);
    table.set(Number(key), uuid);
  }
  return table;
}

/** Counts and ids only, no payloads. */
export function summarise(plan: BridgePlan) {
  const r = plan.report;
  const byType: Record<string, number> = {};
  for (const row of plan.rows) byType[row.entityType] = (byType[row.entityType] ?? 0) + 1;
  return {
    toCreate: byType,
    fixturesTotal: r.fixturesTotal,
    fixturesMatched: r.fixturesMatched.length,
    matchedByRound: r.fixturesMatched.filter((m) => m.flags.includes("matched_by_round")).length,
    postponedOnly: r.fixturesMatched.filter((m) => m.flags.includes("postponed_only")).length,
    fixturesNoMatch: r.fixturesNoMatch,
    fixturesMultiMatch: r.fixturesMultiMatch,
    alreadyMapped: r.alreadyMapped.length,
    conflicts: r.conflicts,
    repoints: r.repoints,
    teamsMissingFromTable: r.teamsMissingFromTable,
    eventsSkippedMissingTeam: r.eventsSkippedMissingTeam,
    roundsMissingInternally: r.roundsMissingInternally,
  };
}

export function needsReview(plan: BridgePlan): boolean {
  const r = plan.report;
  return (
    r.fixturesNoMatch.length > 0 ||
    r.fixturesMultiMatch.length > 0 ||
    r.conflicts.length > 0 ||
    r.teamsMissingFromTable.length > 0 ||
    r.roundsMissingInternally.length > 0
  );
}

/** Rows in the order that satisfies the RPC's expectations: parents first. */
const ORDER = ["competition", "season", "round", "team", "fixture"] as const;
export const orderedRows = (rows: readonly PlannedMapping[]) =>
  [...rows].sort((a, b) => ORDER.indexOf(a.entityType) - ORDER.indexOf(b.entityType));

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const readJson = (path: string | undefined, name: string) => {
  if (!path) throw new Error(`sofascore_bridge_missing_arg: ${name} is required`);
  return JSON.parse(readFileSync(path, "utf8"));
};

async function main() {
  const mode = (arg("--mode") ?? "dry-run") as BridgeMode;
  if (!["dry-run", "apply"].includes(mode)) throw new Error("--mode must be dry-run or apply");
  const db = bridgeGuard(mode, process.env);

  const competitionId = arg("--competition-id");
  const seasonId = arg("--season-id");
  if (!competitionId || !UUID.test(competitionId) || !seasonId || !UUID.test(seasonId))
    throw new Error("--competition-id and --season-id must be uuids");

  const snapshot = parseSnapshot(readJson(arg("--snapshot"), "--snapshot"));
  const teams = arg("--teams")
    ? parseTeams(readJson(arg("--teams"), "--teams"))
    : reviewedTeamTable();
  const input: BridgeInput = {
    events: parseEvents(readJson(arg("--events"), "--events")),
    competition: { externalId: SOFASCORE_COMPETITION_ID, internalId: competitionId },
    season: { externalId: SOFASCORE_SEASON_ID, internalId: seasonId },
    teams,
    rounds: snapshot.rounds,
    fixtures: snapshot.fixtures,
    existing: snapshot.existing,
  };
  const plan = planSofascoreIdBridge(input);
  console.log(JSON.stringify({ mode, summary: summarise(plan) }, null, 2));

  let exit: 0 | 2 | 4 = needsReview(plan) ? 2 : 0;
  if (mode === "apply" && db) {
    if (plan.repoints.length > 0) {
      console.error(
        `sofascore_bridge_repoint_unsupported: ${plan.repoints.length} fixture(s) need re-pointing; ` +
          "api.resolve_football_mapping cannot move a mapping. Nothing was written.",
      );
      process.exitCode = 4;
      return;
    }
    const client = createClient(db.url, db.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let written = 0;
    for (const row of orderedRows(plan.rows)) {
      const { error } = await client.schema("api").rpc("resolve_football_mapping", {
        p_provider_name: SOFASCORE_PROVIDER,
        p_entity_type: row.entityType,
        p_external_id: row.externalId,
        p_internal_entity_id: row.internalId,
        p_source_version: "sofascore-id-bridge",
      });
      if (error) {
        console.error(
          `sofascore_bridge_rpc_refused: ${row.entityType} ${row.externalId}: ${error.message}. ` +
            `Stopped after ${written} row(s).`,
        );
        exit = 4;
        break;
      }
      written += 1;
    }
    console.log(JSON.stringify({ written }, null, 2));
  }
  process.exitCode = exit;
}

if (import.meta.main) await main();
