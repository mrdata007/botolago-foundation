/**
 * SofaScore live shadow comparison. READ ONLY: writes nothing anywhere.
 *
 *   RAPIDAPI_KEY=… SUPABASE_ACCESS_TOKEN=… SUPABASE_PRODUCTION_PROJECT_REF=… \
 *     bun scripts/backend/sofascore-live-shadow-compare.ts --read-production \
 *       [--markdown <file>] [--json <file>] [--no-fallback]
 *
 * One run = at most two SofaScore requests:
 *   1. tournaments/get-live-events?sport=football (every match in play).
 *   2. Only when a mapped Botola fixture that production still shows as live
 *      (or kicked off within the last 3 hours and unfinished) is missing from
 *      that list, tournaments/get-last-matches page 0 for 937/102220, which
 *      carries a just-finished match. Skipped with --no-fallback.
 * And one production read: a single SELECT through the Supabase Management API
 * (mappings of provider 'sofascore' + the mapped fixtures' current state).
 *
 * It then runs the shadow ingest plan (buildFixtureIngestPlan) over what
 * SofaScore says and prints, per Botola event, SofaScore against production
 * and whether the real ingest would change the fixture. Never writes.
 */
import { writeFileSync } from "node:fs";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import {
  BOTOLA_UNIQUE_TOURNAMENT_ID,
  buildFixtureIngestPlan,
  collapseReplacedEvents,
  parseSofascoreEvents,
  SOFASCORE_LIVE_EVENTS_PATH,
  type SofascoreFixtureEvent,
  type SofascoreFixturePlan,
  type SofascoreIngestCall,
  type SofascoreParsedEvents,
} from "../../supabase/functions/_shared/sofascore-fixtures.ts";
import {
  buildSofascoreMappingLookup,
  type FootballProviderMappingRow,
  type SofascoreMappingLookupResult,
} from "../../supabase/functions/_shared/sofascore-mapping-lookup.ts";
import {
  assertReadOnly,
  eventListPath,
  managementQuery,
  type Query,
} from "./sofascore-id-bridge-fetch";
import { PRODUCTION_PROJECT_REF } from "./sofascore-id-bridge";

const HOST = "sofascore.p.rapidapi.com";
/** A mapped fixture this recent and unfinished is expected in the live list. */
const RECENT_KICKOFF_MS = 3 * 60 * 60 * 1000;
const LIVE_STATUSES: ReadonlySet<string> = new Set([
  "live_first_half",
  "half_time",
  "live_second_half",
  "extra_time",
  "penalties",
]);

export { assertReadOnly };

/** One SELECT: active sofascore mappings and the mapped fixtures' state. */
export const PRODUCTION_SNAPSHOT_SQL = `select jsonb_build_object(
  'mappings', (select coalesce(jsonb_agg(jsonb_build_object(
      'provider_name', m.provider_name, 'entity_type', m.entity_type::text,
      'external_id', m.external_id, 'internal_entity_id', m.internal_entity_id,
      'active', m.active)), '[]'::jsonb)
    from app_private.football_provider_mappings m
    where m.provider_name = 'sofascore' and m.active),
  'fixtures', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'externalId', m.external_id, 'kickoffAt', f.kickoff_at,
      'status', f.status::text, 'period', f.period::text,
      'homeScore', f.home_score, 'awayScore', f.away_score,
      'providerUpdatedAt', f.provider_updated_at, 'sourceSequence', f.source_sequence,
      'finalizedAt', f.finalized_at)), '[]'::jsonb)
    from app_private.football_provider_mappings m
    join app.fixtures f on f.id = m.internal_entity_id
    where m.provider_name = 'sofascore' and m.entity_type = 'fixture' and m.active)
) as snapshot`;

export interface ProductionFixture {
  readonly id: string;
  /** The SofaScore event id this fixture is mapped to. */
  readonly externalId: string;
  readonly kickoffAt: string;
  readonly status: string;
  readonly period: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly providerUpdatedAt: string;
  readonly sourceSequence: number | string | null;
  readonly finalizedAt: string | null;
}

export interface ProductionSnapshot {
  readonly mappings: readonly FootballProviderMappingRow[];
  readonly fixtures: readonly ProductionFixture[];
}

export function parseSnapshot(rows: Array<Record<string, unknown>>): ProductionSnapshot {
  const snapshot = rows[0]?.snapshot as Partial<ProductionSnapshot> | undefined;
  if (!snapshot || !Array.isArray(snapshot.mappings) || !Array.isArray(snapshot.fixtures))
    throw new Error("sofascore_compare_snapshot_invalid");
  return { mappings: snapshot.mappings, fixtures: snapshot.fixtures };
}

/** Fixtures production maps to SofaScore but the live list did not return. */
export function fixturesNeedingFallback(
  fixtures: readonly ProductionFixture[],
  liveEventIds: ReadonlySet<string>,
  now: Date,
): ProductionFixture[] {
  return fixtures.filter((fixture) => {
    if (liveEventIds.has(fixture.externalId) || fixture.status === "finished") return false;
    if (LIVE_STATUSES.has(fixture.status)) return true;
    const kickoff = Date.parse(fixture.kickoffAt);
    const age = now.getTime() - kickoff;
    return (
      Number.isFinite(kickoff) &&
      age >= 0 &&
      age <= RECENT_KICKOFF_MS &&
      !["cancelled", "postponed"].includes(fixture.status)
    );
  });
}

export type WouldChange = "yes" | "no" | "blocked_stale";

export interface ComparisonRow {
  readonly eventId: string;
  readonly round: number | null;
  readonly source: "live" | "last_matches";
  readonly sofascore: {
    readonly status: string;
    readonly code: number;
    readonly score: string;
    readonly changeTimestamp: string | null;
  };
  readonly production: {
    readonly status: string;
    readonly period: string;
    readonly score: string;
    readonly providerUpdatedAt: string;
  } | null;
  readonly wouldChange: WouldChange | "not_mapped";
  /** Which fields would change: status, period, score. */
  readonly differences: readonly string[];
}

const scoreText = (home: number | null, away: number | null) =>
  home === null || away === null ? "-" : `${home}-${away}`;

/** Stored (updated, sequence) strictly newer than the incoming one blocks the write. */
function incomingIsStale(call: SofascoreIngestCall, production: ProductionFixture): boolean {
  const storedMs = Date.parse(production.providerUpdatedAt);
  const incomingMs = Date.parse(call.p_fixture.providerUpdatedAt);
  if (!Number.isFinite(storedMs) || !Number.isFinite(incomingMs)) return false;
  if (storedMs !== incomingMs) return storedMs > incomingMs;
  return Number(production.sourceSequence ?? 0) > call.p_fixture.sourceSequence;
}

export interface ComparisonInput {
  readonly events: ReadonlyArray<{
    readonly event: SofascoreFixtureEvent;
    readonly source: "live" | "last_matches";
  }>;
  readonly plan: SofascoreFixturePlan;
  readonly production: readonly ProductionFixture[];
}

/** Pure: one row per Botola event, SofaScore against production. */
export function compareEvents(input: ComparisonInput): ComparisonRow[] {
  const callById = new Map(input.plan.calls.map((call) => [call.p_external_id, call]));
  const productionByEvent = new Map(input.production.map((f) => [f.externalId, f]));
  return input.events.map(({ event, source }) => {
    const call = callById.get(event.sofascoreEventId);
    const production = productionByEvent.get(event.sofascoreEventId) ?? null;
    const sofascore = {
      status: event.status,
      code: event.rawStatusCode,
      score: scoreText(event.homeScore, event.awayScore),
      changeTimestamp:
        event.changeTimestamp === null
          ? null
          : new Date(event.changeTimestamp * 1000).toISOString(),
    };
    const productionView = production && {
      status: production.status,
      period: production.period,
      score: scoreText(production.homeScore, production.awayScore),
      providerUpdatedAt: production.providerUpdatedAt,
    };
    if (!call || !production || !productionView) {
      return {
        eventId: event.sofascoreEventId,
        round: event.round,
        source,
        sofascore,
        production: productionView ?? null,
        wouldChange: "not_mapped" as const,
        differences: [],
      };
    }
    const differences: string[] = [];
    if (production.status !== call.p_fixture.status) differences.push("status");
    if (production.period !== call.p_fixture.period) differences.push("period");
    if (productionView.score !== scoreText(call.p_fixture.homeScore, call.p_fixture.awayScore))
      differences.push("score");
    const wouldChange: WouldChange =
      differences.length === 0 ? "no" : incomingIsStale(call, production) ? "blocked_stale" : "yes";
    return {
      eventId: event.sofascoreEventId,
      round: event.round,
      source,
      sofascore,
      production: productionView,
      wouldChange,
      differences,
    };
  });
}

export interface CompareReport {
  readonly observedAt: string;
  readonly requestsSent: number;
  readonly quota: { limit: number | null; remaining: number | null };
  readonly liveListSize: number;
  readonly fallbackUsed: boolean;
  readonly rows: readonly ComparisonRow[];
  /** Mapped production fixtures that neither request returned. */
  readonly absentFromSofascore: readonly {
    eventId: string;
    status: string;
    kickoffAt: string;
  }[];
  readonly unmapped: SofascoreFixturePlan["unmapped"];
  readonly rejected: SofascoreFixturePlan["rejected"];
  readonly unknownStatus: SofascoreParsedEvents["unknownStatus"];
  readonly malformedEvents: number;
  readonly mapping: Pick<SofascoreMappingLookupResult, "counts" | "conflicts" | "ignoredRows">;
}

export function renderMarkdown(report: CompareReport): string {
  const lines: string[] = [];
  lines.push(`### SofaScore vs production, ${report.observedAt}`);
  lines.push("");
  lines.push(
    `Requests ${report.requestsSent} (live list ${report.liveListSize} matches` +
      `${report.fallbackUsed ? ", plus last-matches fallback" : ""}); ` +
      `quota ${report.quota.remaining ?? "?"}/${report.quota.limit ?? "?"}. Read only.`,
  );
  lines.push("");
  if (report.rows.length === 0) {
    lines.push("No Botola event in the SofaScore responses.");
  } else {
    lines.push(
      "| Event | Rd | From | SofaScore | Score | Production | Score | Would change | Fields |",
    );
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const row of report.rows) {
      lines.push(
        `| ${row.eventId} | ${row.round ?? "-"} | ${row.source} | ${row.sofascore.status} (${row.sofascore.code}) | ${row.sofascore.score} | ` +
          `${row.production ? `${row.production.status} / ${row.production.period}` : "not mapped"} | ${row.production?.score ?? "-"} | ` +
          `${row.wouldChange} | ${row.differences.join(", ") || "-"} |`,
      );
    }
  }
  const list = (title: string, items: readonly string[]) => {
    lines.push("");
    lines.push(`${title}: ${items.length === 0 ? "none" : items.join("; ")}`);
  };
  list(
    "Mapped in production but absent from SofaScore responses",
    report.absentFromSofascore.map((a) => `${a.eventId} (${a.status}, kickoff ${a.kickoffAt})`),
  );
  list(
    "Unmapped",
    report.unmapped.map((u) => `${u.sofascoreEventId} missing ${u.missing.join("+")}`),
  );
  list(
    "Unknown status (left out)",
    report.unknownStatus.map((u) => `${u.sofascoreEventId} ${u.rawStatusType}/${u.rawStatusCode}`),
  );
  list(
    "Rejected",
    report.rejected.map((r) => `${r.sofascoreEventId} ${r.reason}`),
  );
  list("Mapping conflicts", report.mapping.conflicts);
  return lines.join("\n");
}

export interface CompareDependencies {
  readonly client: Pick<RapidApiClient, "getJson" | "quota" | "requestsSent">;
  readonly query: Query;
  readonly now?: () => Date;
  readonly allowFallback?: boolean;
}

/** Reads only. At most two provider requests and one SELECT. */
export async function runCompare(deps: CompareDependencies): Promise<CompareReport> {
  const observedAt = (deps.now ?? (() => new Date()))();
  const snapshot = parseSnapshot(await deps.query(PRODUCTION_SNAPSHOT_SQL));
  const mapping = buildSofascoreMappingLookup(snapshot.mappings);

  const options = { uniqueTournamentId: BOTOLA_UNIQUE_TOURNAMENT_ID };
  const liveRaw = await deps.client.getJson(SOFASCORE_LIVE_EVENTS_PATH);
  const live = parseSofascoreEvents(liveRaw, options);
  const liveIds = new Set(live.events.map((e) => e.sofascoreEventId));
  const tagged: Array<{ event: SofascoreFixtureEvent; source: "live" | "last_matches" }> =
    live.events.map((event) => ({ event, source: "live" as const }));
  let unknownStatus = [...live.unknownStatus];
  let malformedEvents = live.malformedCount;

  const missing = fixturesNeedingFallback(snapshot.fixtures, liveIds, observedAt);
  let fallbackUsed = false;
  if (missing.length > 0 && deps.allowFallback !== false) {
    fallbackUsed = true;
    const recent = parseSofascoreEvents(
      await deps.client.getJson(eventListPath("get-last-matches", 0)),
      options,
    );
    const wanted = new Set(missing.map((f) => f.externalId));
    for (const event of recent.events) {
      if (wanted.has(event.sofascoreEventId) && !liveIds.has(event.sofascoreEventId))
        tagged.push({ event, source: "last_matches" });
    }
    unknownStatus = unknownStatus.concat(
      recent.unknownStatus.filter((u) => wanted.has(u.sofascoreEventId)),
    );
    malformedEvents += recent.malformedCount;
  }

  const collapsed = collapseReplacedEvents(tagged.map((t) => t.event));
  const kept = new Set(collapsed.events.map((e) => e.sofascoreEventId));
  const events = tagged.filter((t) => kept.has(t.event.sofascoreEventId));
  const plan = buildFixtureIngestPlan(
    events.map((t) => t.event),
    mapping.lookup,
    observedAt,
  );
  const rows = compareEvents({ events, plan, production: snapshot.fixtures });
  const returned = new Set(events.map((t) => t.event.sofascoreEventId));
  const absentFromSofascore = missing
    .filter((f) => !returned.has(f.externalId))
    .map((f) => ({ eventId: f.externalId, status: f.status, kickoffAt: f.kickoffAt }));

  return {
    observedAt: observedAt.toISOString(),
    requestsSent: deps.client.requestsSent(),
    quota: { limit: deps.client.quota().limit, remaining: deps.client.quota().remaining },
    liveListSize: live.polledCount,
    fallbackUsed,
    rows,
    absentFromSofascore,
    unmapped: plan.unmapped,
    rejected: plan.rejected,
    unknownStatus,
    malformedEvents,
    mapping: {
      counts: mapping.counts,
      conflicts: mapping.conflicts,
      ignoredRows: mapping.ignoredRows,
    },
  };
}

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

async function main() {
  const key = process.env.RAPIDAPI_KEY?.trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim();
  if (!process.argv.includes("--read-production"))
    throw new Error("sofascore_compare_refused: pass --read-production (this script only reads)");
  if (!key || !token || !ref)
    throw new Error(
      "sofascore_compare_missing_input: RAPIDAPI_KEY, SUPABASE_ACCESS_TOKEN and SUPABASE_PRODUCTION_PROJECT_REF are required",
    );
  if (ref !== PRODUCTION_PROJECT_REF)
    throw new Error("sofascore_compare_project_refused: the ref is not the production project");

  const client = new RapidApiClient({ host: HOST, key });
  const report = await runCompare({
    client,
    query: managementQuery(ref, token),
    allowFallback: !process.argv.includes("--no-fallback"),
  });
  const markdown = renderMarkdown(report);
  const markdownFile = arg("--markdown");
  if (markdownFile) writeFileSync(markdownFile, `${markdown}\n`);
  const jsonFile = arg("--json");
  if (jsonFile) writeFileSync(jsonFile, JSON.stringify(report, null, 2));
  console.log(markdown);
}

if (import.meta.main) await main();
