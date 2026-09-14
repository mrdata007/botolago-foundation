import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  handleSportsMonksCatalogRequest,
  type CatalogRpcClient,
} from "../../supabase/functions/_shared/sportsmonks-catalog";
import {
  handleSportsMonksFixtureRequest,
  type FixtureRpcClient,
} from "../../supabase/functions/_shared/sportsmonks-fixtures";
import {
  requestSportsMonksJson,
  runSportsMonksProductionProbe,
  type SportsMonksProbeEvidence,
} from "./sportsmonks-production-probe";

type Row = Record<string, unknown>;
const PROJECT = "tkewgajrljbwgwedqsxn";
const SEASON = 28647;
const LEAGUE = 860;
const BASE = "/v3/football";
const CONFIRMATION = "RUN_CURRENT_SEASON_RECOVERY";
const REPOSITORY = "mrdata007/botolago-foundation";
const WORKFLOW = ".github/workflows/football-current-season-recovery.yml";
const VERIFIED_FILES = [
  WORKFLOW,
  "scripts/backend/current-season-recovery.ts",
  "scripts/backend/sportsmonks-production-probe.ts",
  "supabase/functions/_shared/sportsmonks-catalog.ts",
  "supabase/functions/_shared/sportsmonks-fixtures.ts",
  "supabase/migrations/20260914184657_current_season_squad_recovery.sql",
  "supabase/migrations/20260731203317_gate3b_historical_squads_standings.sql",
  "supabase/migrations/20260731180229_gate2b_football_catalog_ingestion.sql",
  "package.json",
  "bun.lock",
];

export class CurrentSeasonRecoveryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new CurrentSeasonRecoveryError(code);
}
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_provider_payload");
  return value as Row;
}
function id(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    fail("invalid_provider_id");
  return value;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum)
    fail("invalid_provider_text");
  return value.trim();
}
function nullableText(value: unknown, maximum: number): string | null {
  return value === null || value === undefined || value === "" ? null : text(value, maximum);
}
function date(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("invalid_provider_date");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    fail("invalid_provider_date");
  return value;
}

export function validateCurrentReadiness(probe: SportsMonksProbeEvidence, commit: string): void {
  if (
    probe.expectedCommit !== commit ||
    probe.provider !== "sportsmonks" ||
    probe.verdict !== "pass" ||
    probe.league.id !== LEAGUE ||
    !probe.league.active ||
    probe.season.id !== SEASON ||
    probe.season.leagueId !== LEAGUE ||
    probe.season.name !== "2026/2027" ||
    !probe.season.current ||
    !probe.fixtureSample.available ||
    !probe.fixtureSample.leagueMatches ||
    !probe.fixtureSample.seasonMatches ||
    probe.fixtureSample.participants !== 2 ||
    probe.verifiedResources.teams !== 16 ||
    probe.verifiedResources.rounds < 1 ||
    probe.verifiedResources.rounds > 30
  )
    fail("current_season_scope_mismatch");
  const start = date(probe.season.startingAt);
  const end = date(probe.season.endingAt);
  // The provider can publish one round first. Preserve its observed dates; never invent a full calendar.
  if (
    start < "2026-01-01" ||
    start > "2026-12-31" ||
    end < start ||
    end > "2027-12-31" ||
    (Date.parse(end) - Date.parse(start)) / 86400000 > 550
  )
    fail("current_season_dates_out_of_scope");
}

export function fixtureWindows(start: string, end: string): Array<{ from: string; to: string }> {
  date(start);
  date(end);
  if (start > end) fail("invalid_fixture_window");
  const windows: Array<{ from: string; to: string }> = [];
  for (
    let current = Date.parse(`${start}T00:00:00Z`);
    current <= Date.parse(`${end}T00:00:00Z`);
    current += 30 * 86400000
  ) {
    windows.push({
      from: new Date(current).toISOString().slice(0, 10),
      to: new Date(Math.min(current + 29 * 86400000, Date.parse(`${end}T00:00:00Z`)))
        .toISOString()
        .slice(0, 10),
    });
    if (windows.length > 20) fail("fixture_window_limit_exceeded");
  }
  return windows;
}

export async function readAllProviderRows(
  path: string,
  query: Record<string, string>,
  token: string,
  request: typeof requestSportsMonksJson = requestSportsMonksJson,
): Promise<Row[]> {
  const result: Row[] = [];
  const ids = new Set<number>();
  for (let page = 1; page <= 20; page += 1) {
    const payload = row(
      await request(path, { ...query, page: String(page), per_page: "100" }, token),
    );
    if (!Array.isArray(payload.data)) fail("invalid_provider_rows");
    for (const value of payload.data) {
      const item = row(value);
      const identifier = id(item.id);
      if (ids.has(identifier)) fail("duplicate_provider_page_row");
      ids.add(identifier);
      result.push(item);
    }
    const pagination =
      payload.pagination ?? (payload.meta ? row(payload.meta).pagination : undefined);
    let more: boolean;
    if (pagination !== undefined && pagination !== null) {
      const cursor = row(pagination);
      if (typeof cursor.has_more === "boolean") more = cursor.has_more;
      else if ("next_page" in cursor) more = cursor.next_page !== null;
      else if (typeof cursor.current_page === "number" && typeof cursor.last_page === "number")
        more = cursor.current_page < cursor.last_page;
      else fail("unknown_provider_pagination");
    } else more = payload.data.length === 100;
    if (!more) return result;
    if (payload.data.length === 0) fail("empty_provider_page_with_more");
  }
  return fail("provider_pagination_limit_exceeded");
}

export function normalizeCurrentMembership(
  value: unknown,
  teamId: number,
  observedAt: string,
): Row | null {
  const member = row(value);
  if (id(member.season_id) !== SEASON || id(member.team_id) !== teamId)
    fail("squad_scope_mismatch");
  const playerId = id(member.player_id);
  const player = row(member.player);
  if (id(player.id) !== playerId) fail("squad_player_mismatch");
  if (member.position_id === null || member.position_id === undefined) return null;
  const position = row(member.position);
  if (id(position.id) !== id(member.position_id)) fail("squad_position_mismatch");
  const positions: Record<string, string> = {
    GOALKEEPER: "goalkeeper",
    DEFENDER: "defender",
    MIDFIELDER: "midfielder",
    ATTACKER: "forward",
    FORWARD: "forward",
  };
  const normalizedPosition = positions[text(position.developer_name, 80).toUpperCase()];
  if (!normalizedPosition) fail("unsupported_current_position");
  const birth =
    typeof player.date_of_birth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(player.date_of_birth)
      ? date(player.date_of_birth)
      : null;
  const shirt =
    typeof member.jersey_number === "number" &&
    Number.isInteger(member.jersey_number) &&
    member.jersey_number > 0 &&
    member.jersey_number <= 99
      ? member.jersey_number
      : null;
  return {
    externalPlayerId: String(playerId),
    fullName: text(player.name ?? player.display_name ?? player.common_name, 200),
    displayName: text(player.display_name ?? player.common_name ?? player.name, 120),
    firstName: nullableText(player.firstname, 100),
    lastName: nullableText(player.lastname, 100),
    dateOfBirth: birth,
    position: normalizedPosition,
    preferredFoot: "unknown",
    shirtNumber: shirt,
    // Freshness represents this complete authoritative squad observation, not a fabricated match statistic.
    freshness: {
      updatedAt: observedAt,
      sourceSequence: Date.parse(observedAt),
      sourceVersion: `sportsmonks-current-squad:${playerId}:${Date.parse(observedAt)}`,
    },
  };
}

export function validateCurrentSquads(
  squads: Array<{ teamExternalId: string; memberships: Row[] }>,
): void {
  if (squads.length !== 16 || new Set(squads.map((s) => s.teamExternalId)).size !== 16)
    fail("current_squad_team_count_mismatch");
  const players = new Set<string>();
  for (const squad of squads) {
    if (
      !/^[1-9]\d*$/.test(squad.teamExternalId) ||
      squad.memberships.length < 1 ||
      squad.memberships.length > 100
    )
      fail("current_squad_empty_or_oversized");
    const shirts = new Set<number>();
    for (const membership of squad.memberships) {
      const player = String(membership.externalPlayerId);
      if (players.has(player)) fail("duplicate_current_player_membership");
      players.add(player);
      if (typeof membership.shirtNumber === "number") {
        if (shirts.has(membership.shirtNumber)) fail("duplicate_current_shirt_number");
        shirts.add(membership.shirtNumber);
      }
    }
  }
}

export function validateCanaryRun(value: unknown): string {
  const run = row(value);
  if (
    run.path !== WORKFLOW ||
    run.event !== "workflow_dispatch" ||
    run.conclusion !== "success" ||
    run.head_branch !== "main" ||
    run.run_attempt !== 1 ||
    row(run.repository ?? {}).full_name !== REPOSITORY ||
    row(run.actor ?? {}).login !== "mrdata007" ||
    typeof run.head_sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(run.head_sha)
  )
    fail("verified_manual_canary_required");
  return run.head_sha;
}

export function validateRecoveryMode(env: NodeJS.ProcessEnv): "canary" | "refresh" {
  const mode = env.CURRENT_SEASON_RECOVERY_MODE ?? "canary";
  if (env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    if (env.GITHUB_ACTOR !== "mrdata007" || (mode !== "canary" && mode !== "refresh"))
      fail("immutable_owner_dispatch_required");
    return mode;
  }
  if (
    env.GITHUB_EVENT_NAME === "schedule" &&
    mode === "refresh" &&
    env.FOOTBALL_CURRENT_SCHEDULE_ENABLED === "true"
  )
    return "refresh";
  return fail("current_season_schedule_not_enabled");
}

interface CurrentSquadPreflightClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args: Row,
    ): PromiseLike<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>;
  };
}

export async function preflightCurrentSquadRpc(client: CurrentSquadPreflightClient): Promise<Row> {
  // This routine checks service authorization before validating input. Null
  // input stops at validation, before querying or mutating any football row.
  const { error } = await client.schema("api").rpc("service_ingest_current_football_squads", {
    p_provider_name: null,
    p_season_external_id: null,
    p_team_squads: null,
    p_observed_at: null,
  });
  if (error?.code !== "PT400" || error.message !== "invalid_current_squad_input") {
    fail("current_squad_rpc_preflight_failed");
  }
  return { available: true, serviceAuthorized: true, writesAttempted: false };
}

async function verifyPriorCanary(env: NodeJS.ProcessEnv): Promise<Row> {
  const runId = env.FOOTBALL_CURRENT_CANARY_VERIFIED_RUN_ID ?? "";
  const token = env.GITHUB_TOKEN;
  if (!/^[1-9]\d*$/.test(runId) || !token) fail("verified_manual_canary_required");
  const request = async (path: string): Promise<Row> => {
    const url = new URL(`https://api.github.com/repos/${REPOSITORY}/${path}`);
    if (url.origin !== "https://api.github.com") fail("github_origin_guard_failed");
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!response.ok) fail("canary_evidence_unavailable");
    const body = await response.text();
    if (body.length > 2000000) fail("canary_evidence_too_large");
    return row(JSON.parse(body));
  };
  const canarySha = validateCanaryRun(await request(`actions/runs/${runId}`));
  const jobs = await request(`actions/runs/${runId}/jobs?per_page=100`);
  if (
    !Array.isArray(jobs.jobs) ||
    !jobs.jobs.some((job) => {
      const steps = row(job).steps;
      return (
        Array.isArray(steps) &&
        steps.some(
          (step) =>
            row(step).name === "Confirm manual current-season canary completed" &&
            row(step).conclusion === "success",
        )
      );
    })
  )
    fail("verified_manual_canary_steps_required");
  for (const filename of VERIFIED_FILES) {
    const previous = await request(`contents/${filename}?ref=${canarySha}`);
    if (
      previous.encoding !== "base64" ||
      typeof previous.content !== "string" ||
      !Buffer.from(previous.content, "base64").equals(await readFile(filename))
    )
      fail("recovery_implementation_changed_recanary_required");
  }
  return { runId, commit: canarySha, implementationUnchanged: true };
}

function runtimeGuard(env: NodeJS.ProcessEnv): {
  commit: string;
  url: string;
  key: string;
  token: string;
  mode: "canary" | "refresh";
} {
  if (
    env.CONFIRMATION !== CONFIRMATION ||
    env.GITHUB_REPOSITORY !== "mrdata007/botolago-foundation" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    !/^[0-9a-f]{40}$/.test(env.EXPECTED_COMMIT ?? "") ||
    env.EXPECTED_COMMIT !== env.GITHUB_SHA
  )
    fail("immutable_owner_dispatch_required");
  const mode = validateRecoveryMode(env);
  const url = env.SUPABASE_PRODUCTION_URL?.replace(/\/$/, "");
  if (
    env.SUPABASE_PRODUCTION_PROJECT_REF !== PROJECT ||
    env.SUPABASE_PRODUCTION_PROJECT_NAME !== "BotolaGO Production V2" ||
    url !== `https://${PROJECT}.supabase.co`
  )
    fail("production_target_mismatch");
  if (!env.SUPABASE_SECRET_KEY || !env.SPORTSMONKS_API_TOKEN) fail("protected_credentials_missing");
  return {
    commit: env.EXPECTED_COMMIT!,
    url,
    key: env.SUPABASE_SECRET_KEY,
    token: env.SPORTSMONKS_API_TOKEN,
    mode,
  };
}

async function checkedHandler(response: Response): Promise<Row> {
  const data = row(await response.json());
  if (!response.ok)
    fail(
      typeof data.error === "string" && /^[a-z_]{3,80}$/.test(data.error)
        ? data.error
        : "ingestion_handler_failed",
    );
  const jobs = row(data.jobs);
  for (const value of Object.values(jobs)) {
    const count = row(value);
    if (count.rejected !== 0) fail("ingestion_rejected_records");
  }
  return jobs;
}

async function main(): Promise<void> {
  const config = runtimeGuard(process.env);
  const evidenceDirectory = resolve(
    process.env.CURRENT_SEASON_EVIDENCE_DIR ?? fail("missing_evidence_directory"),
  );
  await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
  const evidence: Row = {
    schemaVersion: 1,
    expectedCommit: config.commit,
    projectRef: PROJECT,
    observedAt: new Date().toISOString(),
    mode: "current_season_recovery",
    recoveryMode: config.mode,
    fantasyActivated: false,
    verdict: "in_progress",
  };
  const save = async () => {
    const serialized = JSON.stringify(evidence, null, 2) + "\n";
    if (serialized.includes(config.key) || serialized.includes(config.token))
      fail("credential_in_evidence");
    await writeFile(resolve(evidenceDirectory, "current-season-recovery.json"), serialized, {
      mode: 0o600,
    });
  };
  try {
    if (config.mode === "refresh") {
      evidence.verifiedCanary = await verifyPriorCanary(process.env);
      await save();
    }
    const client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    evidence.databasePreflight = await preflightCurrentSquadRpc(
      client as unknown as CurrentSquadPreflightClient,
    );
    await save();
    const probe = await runSportsMonksProductionProbe(process.env);
    evidence.provider = probe;
    validateCurrentReadiness(probe, config.commit);
    await save();
    const teams = await readAllProviderRows(`${BASE}/teams/seasons/${SEASON}`, {}, config.token);
    const rounds = await readAllProviderRows(`${BASE}/rounds/seasons/${SEASON}`, {}, config.token);
    if (
      teams.length !== 16 ||
      rounds.length < 1 ||
      rounds.length > 30 ||
      rounds.some((r) => r.season_id !== SEASON)
    )
      fail("current_catalog_scope_mismatch");
    evidence.published = {
      teams: teams.length,
      rounds: rounds.length,
      thirtyRoundsPublished: rounds.length === 30,
    };
    const trigger = randomBytes(32).toString("hex");
    const environment = {
      ...process.env,
      FOOTBALL_PROVIDER: "sportsmonks",
      FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
      FOOTBALL_SPORTSMONKS_LEAGUE_ID: String(LEAGUE),
      FOOTBALL_SPORTSMONKS_SEASON_ID: String(SEASON),
      FOOTBALL_SPORTSMONKS_COUNTRY_CODE: "MA",
      FOOTBALL_SPORTSMONKS_COMPETITION_TYPE: "league",
      FOOTBALL_SPORTSMONKS_SEASON_START: probe.season.startingAt,
      FOOTBALL_SPORTSMONKS_SEASON_END: probe.season.endingAt,
      FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
      FOOTBALL_PROVIDER_MAX_RETRIES: "2",
      FOOTBALL_INGESTION_TRIGGER_SECRET: trigger,
    };
    const request = (job: string, maxPages: number) =>
      new Request("https://localhost/protected-recovery", {
        method: "POST",
        headers: { "content-type": "application/json", "x-botolago-ingestion-key": trigger },
        body: JSON.stringify({ job, pageSize: 50, maxPages }),
      });
    const catalogFetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin === "https://api.sportmonks.com" &&
        (url.pathname === `${BASE}/rounds/seasons/${SEASON}` ||
          url.pathname === `${BASE}/teams/seasons/${SEASON}`)
      ) {
        return Response.json({
          data: url.pathname.includes("/rounds/") ? rounds : teams,
          pagination: { has_more: false },
        });
      }
      return fetch(input, init);
    };
    evidence.catalog = await checkedHandler(
      await handleSportsMonksCatalogRequest(request("catalog", 1), {
        environment,
        client: client as unknown as CatalogRpcClient,
        fetch: catalogFetch,
      }),
    );
    await save();
    const fixtures: Row[] = [];
    for (const window of fixtureWindows(probe.season.startingAt, probe.season.endingAt)) {
      const jobs = await checkedHandler(
        await handleSportsMonksFixtureRequest(request("fixtures", 3), {
          environment: {
            ...environment,
            FOOTBALL_SPORTSMONKS_FIXTURE_FROM: window.from,
            FOOTBALL_SPORTSMONKS_FIXTURE_TO: window.to,
          },
          client: client as unknown as FixtureRpcClient,
        }),
      );
      fixtures.push({ ...window, ...jobs });
      evidence.fixtures = fixtures;
      await save();
    }
    const observedAt = new Date().toISOString();
    const squads: Array<{ teamExternalId: string; memberships: Row[] }> = [];
    let omittedUnknownPositions = 0;
    for (const team of teams) {
      const teamId = id(team.id);
      const raw = await readAllProviderRows(
        `${BASE}/squads/seasons/${SEASON}/teams/${teamId}`,
        { include: "player;position" },
        config.token,
      );
      const memberships: Row[] = [];
      for (const member of raw) {
        const normalized = normalizeCurrentMembership(member, teamId, observedAt);
        if (normalized) memberships.push(normalized);
        else omittedUnknownPositions += 1;
      }
      squads.push({ teamExternalId: String(teamId), memberships });
    }
    evidence.squadSource = {
      teams: squads.length,
      eligiblePlayers: squads.reduce((sum, s) => sum + s.memberships.length, 0),
      omittedUnknownPositions,
    };
    validateCurrentSquads(squads);
    await save();
    const { data, error } = await client
      .schema("api")
      .rpc("service_ingest_current_football_squads", {
        p_provider_name: "sportsmonks",
        p_season_external_id: String(SEASON),
        p_team_squads: squads,
        p_observed_at: observedAt,
      });
    if (error) {
      if (
        config.mode === "refresh" &&
        error.code === "PT409" &&
        error.message === "fantasy_catalog_already_staged"
      ) {
        evidence.squads = { skipped: true, reason: "fantasy_catalog_already_staged" };
      } else fail("current_squad_transaction_failed");
    } else evidence.squads = data;
    evidence.verdict = "pass";
    await save();
    console.log("CURRENT_SEASON_RECOVERY_PASS");
  } catch (error) {
    evidence.verdict = "fail";
    evidence.errorCode =
      error instanceof CurrentSeasonRecoveryError ? error.code : "current_season_recovery_failed";
    await save();
    console.error(`CURRENT_SEASON_RECOVERY_FAIL code=${evidence.errorCode}`);
    process.exitCode = 1;
  }
}

if (import.meta.main)
  main().catch(() => {
    console.error("CURRENT_SEASON_RECOVERY_FAIL code=runtime_guard_failed");
    process.exitCode = 1;
  });
