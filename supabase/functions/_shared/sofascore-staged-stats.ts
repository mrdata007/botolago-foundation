// Staged SofaScore statistics: the later pulls of a finished match
// (docs/backend/SOFASCORE_STAGED_STATS.md).
//
// SofaScore publishes core player data (minutes, goals, cards) right after a
// match and the full statistics (rating, passes, saves, assists) 5 to 16 days
// later. The first pull is the existing post-final path (the first observation
// registers the match in app_private.sofascore_staged_stats, a database
// trigger). This module makes the later pulls:
//
//   * api.service_sofascore_staged_due lists the matches whose next pull has
//     come (every 3 days until full coverage, one final pull 3 days after it),
//     and is empty when the month's counted RapidAPI calls reached the stop;
//   * each pull fetches the three replies through the run's RapidAPI client, so
//     the call counter counts them, builds the Fantasy request with the same
//     builder as the first pull, records it with the same recorder (which
//     dedupes by digest, so an unchanged pull adds no observation) and tells the
//     database what it saw, with a digest and the trimmed parsed data;
//   * the database decides PROVISIONAL -> FINAL | FINAL_LIMITED. This module
//     never settles a match itself.
//
// Rules: `sofascore` mode only, never throws, bounded per tick, a provider
// quota refusal ends the sweep, a pull whose coverage is worse than the one
// already recorded is traced but not recorded. No raw payload is kept.
//
// Dependency-free apart from sibling shared modules (Bun tests, Deno runtime).

import { canonicalJson, sha256Hex } from "./canonical-json.ts";
import { RapidApiError } from "./rapidapi-client.ts";
import { IdentitySnapshotError, buildReviewedIdentitySnapshot } from "./reviewed-identities.ts";
import type { MappingRowInput } from "./reviewed-identities.ts";
import type { SofascoreShadowClient } from "./sofascore-fixtures.ts";
import { prepareSofascoreObservation, type SofascoreMatchData } from "./sofascore-fantasy.ts";
import {
  fetchSofascoreMatchReplies,
  type SofascoreDetailsRequestLog,
} from "./sofascore-match-details.ts";
import {
  SofascoreParseError,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
  parseSofascoreStoppage,
} from "./sofascore-performance-parse.ts";
import type { FixtureRpcClient, FixtureRpcResult } from "./sportsmonks-fixtures.ts";

export const STAGED_PULLS_PER_TICK_DEFAULT = 2;
export const STAGED_PULLS_PER_TICK_MAX = 8;
/** Requests one pull costs (incidents, lineups, statistics). */
export const REQUESTS_PER_PULL = 3;
/** The due list is empty once this many calls were counted in the month. */
export const STAGED_BUDGET_STOP = 9000;
const MAX_PLAYER_IDS = 120;

export interface StagedStatsConfig {
  readonly enabled: boolean;
  readonly pullsPerTick: number;
  readonly budgetStop: number;
}

export function readStagedConfig(
  environment: Readonly<Record<string, string | undefined>>,
): StagedStatsConfig {
  const flag = environment.SOFASCORE_STAGED_ENABLED?.trim().toLowerCase();
  const raw = environment.SOFASCORE_STAGED_PULLS_PER_TICK?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return {
    enabled: !(flag === "0" || flag === "false" || flag === "off" || flag === "no"),
    pullsPerTick:
      Number.isInteger(parsed) && parsed >= 0 && parsed <= STAGED_PULLS_PER_TICK_MAX
        ? parsed
        : STAGED_PULLS_PER_TICK_DEFAULT,
    budgetStop: STAGED_BUDGET_STOP,
  };
}

export interface StagedDependencies {
  readonly mode: "sofascore" | "shadow";
  readonly client: FixtureRpcClient;
  readonly rapid: SofascoreShadowClient;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly now: Date;
  readonly log: (line: string) => void;
  /**
   * Handed the three replies of every pull that read them, before anything is
   * parsed: the live refresh stores the match details (team statistics above
   * all, which SofaScore can publish after the post-match window) from them,
   * with no request of its own. Whatever it does never changes the pull.
   */
  readonly onPulled?: (
    pulled: { readonly fixtureId: string; readonly eventId: string },
    replies: {
      readonly incidents: unknown;
      readonly lineups: unknown;
      readonly statistics: unknown;
    },
  ) => void;
}

export interface StagedPullResult {
  readonly fixtureId: string;
  readonly eventId: string;
  readonly outcome: string;
  readonly coverage?: "core" | "full";
  readonly status?: string;
}

export interface StagedSummary {
  readonly enabled: boolean;
  readonly due: number;
  readonly pulled: number;
  readonly recorded: number;
  readonly errors: number;
  readonly requests: number;
  readonly stoppedBy: string | null;
  readonly results: readonly StagedPullResult[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const safeLabel = (value: string | undefined): string =>
  value && /^[a-z0-9_]{1,80}$/.test(value) ? value : "database_error";
const isMissingFunction = (error: FixtureRpcResult["error"]): boolean =>
  error !== null &&
  (error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|function .* does not exist/i.test(error.message ?? ""));

interface DueItem {
  readonly fixtureId: string;
  readonly eventId: string;
  readonly coverage: "unknown" | "core" | "full";
  readonly finalPull: boolean;
}

function readDue(data: unknown): { items: DueItem[]; budgetStopped: boolean } | null {
  if (!isRecord(data) || !Array.isArray(data.due)) return null;
  const items: DueItem[] = [];
  for (const raw of data.due) {
    if (!isRecord(raw)) continue;
    const fixtureId = text(raw.fixtureId);
    const eventId = text(raw.eventId);
    const coverage = raw.coverage;
    if (!fixtureId || !eventId) continue;
    items.push({
      fixtureId,
      eventId,
      coverage: coverage === "core" || coverage === "full" ? coverage : "unknown",
      finalPull: raw.finalPull === true,
    });
  }
  return { items, budgetStopped: data.budgetStopped === true };
}

interface PlayerMapping {
  readonly id: string;
  readonly externalId: string;
  readonly appPlayerId: string;
  readonly active: boolean;
  readonly reviewed: boolean;
  readonly version: string | null;
  readonly updatedAt: string;
}

interface Context {
  readonly sofascoreEventId: string | null;
  readonly status: string | null;
  readonly finalized: boolean;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly homeTeamId: string | null;
  readonly awayTeamId: string | null;
  readonly players: readonly PlayerMapping[];
}

function readContext(data: unknown): Context | null {
  if (!isRecord(data) || data.found !== true) return null;
  const players = (Array.isArray(data.players) ? data.players : []).flatMap(
    (row): PlayerMapping[] => {
      if (!isRecord(row)) return [];
      const id = text(row.id);
      const externalId = text(row.externalId);
      const appPlayerId = text(row.appPlayerId);
      if (!id || !externalId || !appPlayerId) return [];
      return [
        {
          id,
          externalId,
          appPlayerId,
          active: row.active === true,
          reviewed: row.reviewed === true,
          version: text(row.version),
          updatedAt: text(row.updatedAt) ?? "",
        },
      ];
    },
  );
  return {
    sofascoreEventId: text(data.sofascoreEventId),
    status: text(data.status),
    finalized: data.finalized === true,
    homeScore: num(data.homeScore),
    awayScore: num(data.awayScore),
    homeTeamId: text(data.homeTeamId),
    awayTeamId: text(data.awayTeamId),
    players,
  };
}

export class SofascoreStagedStats {
  readonly config: StagedStatsConfig;
  private readonly requestLog: SofascoreDetailsRequestLog[] = [];
  private readonly results: StagedPullResult[] = [];
  private counts = { due: 0, pulled: 0, recorded: 0, errors: 0 };
  private stoppedBy: string | null = null;

  constructor(private readonly deps: StagedDependencies) {
    this.config = readStagedConfig(deps.environment);
  }

  summary(): StagedSummary {
    return {
      enabled: this.config.enabled && this.deps.mode === "sofascore",
      ...this.counts,
      requests: this.requestLog.length,
      stoppedBy: this.stoppedBy,
      results: this.results.slice(0, 10),
    };
  }

  /** The due pulls of this tick. Never throws. */
  async sweep(): Promise<StagedSummary> {
    const { config, deps } = this;
    if (!config.enabled || deps.mode !== "sofascore" || config.pullsPerTick === 0)
      return this.summary();
    try {
      const listed = await this.call("service_sofascore_staged_due", {
        p_limit: config.pullsPerTick,
        p_budget_stop: config.budgetStop,
      });
      if (listed.error) {
        this.stoppedBy = isMissingFunction(listed.error) ? "function_missing" : "due_unavailable";
        return this.summary();
      }
      const due = readDue(listed.data);
      if (!due) {
        this.stoppedBy = "due_unreadable";
        return this.summary();
      }
      if (due.budgetStopped) this.stoppedBy = "budget_stop";
      this.counts.due = due.items.length;
      for (const item of due.items.slice(0, config.pullsPerTick)) {
        if (this.stoppedBy === "rate_limited") break;
        await this.pull(item);
      }
    } catch {
      this.stoppedBy = this.stoppedBy ?? "unexpected";
    }
    return this.summary();
  }

  private async pull(item: DueItem): Promise<void> {
    const { fixtureId, eventId } = item;
    let replies: { incidents: unknown; lineups: unknown; statistics: unknown };
    const before = this.requestLog.length;
    try {
      replies = await fetchSofascoreMatchReplies(this.deps.rapid, eventId, this.requestLog);
    } catch (error) {
      if (error instanceof RapidApiError && error.code === "provider_rate_limited") {
        // The run's quota is spent: no database write, the match stays due.
        this.stoppedBy = "rate_limited";
        this.finish({ fixtureId, eventId, outcome: "error:provider_rate_limited" }, true);
        return;
      }
      await this.recordError(fixtureId, eventId, "fetch_failed", this.requestLog.length - before);
      return;
    }
    const requests = this.requestLog.length - before;
    this.counts.pulled += 1;
    try {
      this.deps.onPulled?.({ fixtureId, eventId }, replies);
    } catch {
      // The details are a by-product: never a reason to fail the pull.
    }
    if (replies.lineups === null) {
      await this.recordError(fixtureId, eventId, "lineups_unavailable", requests);
      return;
    }
    let parts: {
      lineups: ReturnType<typeof parseSofascoreLineups>;
      incidents: ReturnType<typeof parseSofascoreIncidents>;
      statistics: ReturnType<typeof parseSofascoreStatistics>;
      stoppage: ReturnType<typeof parseSofascoreStoppage>;
    };
    try {
      parts = {
        lineups: parseSofascoreLineups(replies.lineups),
        incidents: parseSofascoreIncidents(replies.incidents),
        statistics: replies.statistics === null ? [] : parseSofascoreStatistics(replies.statistics),
        stoppage: parseSofascoreStoppage(replies.incidents),
      };
    } catch (error) {
      const code = error instanceof SofascoreParseError ? "invalid_provider_payload" : "unreadable";
      await this.recordError(fixtureId, eventId, code, requests);
      return;
    }

    const coverage: "core" | "full" = parts.lineups.fullCoverage ? "full" : "core";
    // Worse than what is already recorded: traced, never recorded.
    const regressed = item.coverage === "full" && coverage !== "full";
    const trimmed = {
      version: 1,
      lineups: parts.lineups,
      incidents: parts.incidents,
      statistics: parts.statistics.filter((line) => line.period === "ALL"),
      ...(parts.stoppage ? { stoppage: parts.stoppage } : {}),
    };
    const dataDigest = await sha256Hex(canonicalJson(trimmed));

    let observationId: number | null = null;
    let recorded = false;
    let blocker: string | null = null;
    if (!regressed) {
      const outcome = await this.record(fixtureId, eventId, parts);
      observationId = outcome.observationId;
      recorded = outcome.created;
      blocker = outcome.blocker;
    }
    const answer = await this.call("service_sofascore_staged_record_pull", {
      p_fixture_id: fixtureId,
      p_pull: {
        outcome: "pulled",
        coverage,
        regressed,
        dataDigest,
        requests,
        ...(observationId !== null ? { observationId } : {}),
        matchData: trimmed,
      },
    });
    if (answer.error) {
      this.counts.errors += 1;
      this.finish({
        fixtureId,
        eventId,
        outcome: `error:${safeLabel(answer.error.message)}`,
        coverage,
      });
      return;
    }
    if (recorded) this.counts.recorded += 1;
    const data = isRecord(answer.data) ? answer.data : {};
    this.finish({
      fixtureId,
      eventId,
      coverage,
      status: text(data.status) ?? undefined,
      outcome: regressed
        ? "regressed"
        : blocker
          ? `held:${blocker}`
          : recorded
            ? "recorded"
            : "unchanged",
    });
  }

  /** Builds the request from the fresh replies and records it. Never throws. */
  private async record(
    fixtureId: string,
    eventId: string,
    parts: {
      lineups: ReturnType<typeof parseSofascoreLineups>;
      incidents: ReturnType<typeof parseSofascoreIncidents>;
      statistics: ReturnType<typeof parseSofascoreStatistics>;
      stoppage: ReturnType<typeof parseSofascoreStoppage>;
    },
  ): Promise<{ observationId: number | null; created: boolean; blocker: string | null }> {
    const none = (blocker: string) => ({ observationId: null, created: false, blocker });
    const ids = [...new Set(parts.lineups.players.map((p) => p.externalId))].slice(
      0,
      MAX_PLAYER_IDS,
    );
    const context = await this.call("service_sofascore_fantasy_context", {
      p_fixture_id: fixtureId,
      p_player_ids: ids,
    });
    const ctx = context.error ? null : readContext(context.data);
    if (!ctx) return none("state_unavailable");
    if (ctx.sofascoreEventId !== eventId) return none("event_mismatch");
    const { homeTeamId, awayTeamId, homeScore, awayScore } = ctx;
    if (
      ctx.status !== "finished" ||
      !ctx.finalized ||
      !homeTeamId ||
      !awayTeamId ||
      homeScore === null ||
      awayScore === null
    )
      return none("fixture_incomplete");
    const rows: MappingRowInput[] = ctx.players
      .filter((r) => r.active && r.reviewed)
      .map((r) => ({
        mappingId: r.id,
        provider: "sofascore",
        externalId: r.externalId,
        appPlayerId: r.appPlayerId,
        active: true,
        reviewed: true,
        version: r.version,
        updatedAt: r.updatedAt,
      }));
    try {
      const observedAt = this.deps.now.toISOString();
      const snapshot = await buildReviewedIdentitySnapshot(rows, observedAt);
      const match: SofascoreMatchData = {
        summary: {
          provider: "sofascore",
          externalId: eventId,
          kickoffAt: "",
          finished: true,
          homeName: "",
          awayName: "",
          homeScore,
          awayScore,
          round: null,
        },
        lineups: parts.lineups,
        incidents: parts.incidents,
        statistics: parts.statistics,
        ...(parts.stoppage ? { stoppage: parts.stoppage } : {}),
      };
      const prepared = await prepareSofascoreObservation({
        observedAt,
        match,
        snapshot,
        binding: { appFixtureId: fixtureId, homeTeamId, awayTeamId },
        payloadDigest: await sha256Hex(
          canonicalJson({
            lineups: parts.lineups,
            incidents: parts.incidents,
            statistics: parts.statistics,
            ...(parts.stoppage ? { stoppage: parts.stoppage } : {}),
          }),
        ),
      });
      if (prepared.blockers.length > 0 || prepared.request === null)
        return none(String(prepared.blockers[0]?.code ?? "blocked"));
      const answer = await this.call("service_record_sofascore_fantasy_observation", {
        p_fixture_id: fixtureId,
        p_request: prepared.request,
        p_dry_run: false,
      });
      if (answer.error) return none(safeLabel(answer.error.message));
      const data = isRecord(answer.data) ? answer.data : {};
      const id = num(data.observationId);
      return { observationId: id, created: data.created === true, blocker: null };
    } catch (error) {
      return none(error instanceof IdentitySnapshotError ? error.code : "build_failed");
    }
  }

  private async recordError(
    fixtureId: string,
    eventId: string,
    code: string,
    requests: number,
  ): Promise<void> {
    await this.call("service_sofascore_staged_record_pull", {
      p_fixture_id: fixtureId,
      p_pull: { outcome: "error", error: code, requests: Math.min(Math.max(requests, 0), 20) },
    });
    this.finish({ fixtureId, eventId, outcome: `error:${code}` }, true);
  }

  private async call(name: string, args: Record<string, unknown>): Promise<FixtureRpcResult> {
    try {
      const result = await this.deps.client.schema("api").rpc(name, args);
      return { data: result.data, error: result.error ?? null };
    } catch {
      return { data: null, error: { message: "database_unavailable" } };
    }
  }

  private finish(result: StagedPullResult, isError = false): void {
    if (isError) this.counts.errors += 1;
    this.results.push(result);
    try {
      this.deps.log(
        JSON.stringify({
          event: "football_live_refresh_staged_stats",
          mode: this.deps.mode,
          ...result,
        }),
      );
    } catch {
      // Logging must never break the run.
    }
  }
}
