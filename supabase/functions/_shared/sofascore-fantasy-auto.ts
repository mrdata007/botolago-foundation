// Automatic SofaScore Fantasy observations for the football-live-refresh Edge
// Function (docs/backend/SOFASCORE_FANTASY_SIMPLE.md, "Automatic path").
//
// A finished match already costs three SofaScore requests: incidents, lineups
// and statistics, fetched for the match details (sofascore-match-details.ts).
// This module takes those SAME replies, builds the Fantasy request with the
// shared builder (sofascore-fantasy.ts, the code the manual runner also uses)
// and records it with api.service_record_sofascore_fantasy_observation. It adds
// no SofaScore request for a match whose details were fetched.
//
// Rules:
//   * Only for a finished and finalized fixture, only in `sofascore` mode for
//     real. In `shadow` the recording function is called as a dry run and the
//     result is logged; nothing is written and the auto-mapping is not called.
//   * It can never hold back the scores or the match details. It runs after
//     them, never throws, and every fixture ends in one log line,
//     `football_live_refresh_fantasy`, with an outcome:
//       recorded | held:<blocker> | skipped:<reason> | error:<code>
//   * Before building, an appearing player with no reviewed mapping is offered
//     to api.service_sofascore_auto_map_players (feature-detected: a database
//     without it just continues), then the mappings are read again.
//   * A match held back is retried on later ticks WITHOUT a SofaScore request:
//     the trimmed parsed replies are kept in app_private.sofascore_fantasy_attempts
//     (migration 20261011140000) and re-read. Stored match details cannot
//     rebuild an observation (no per-player minutes, assists, saves or coverage
//     marker), so that table is the source for a retry.
//   * Bounded: a retry waits 15 minutes (3 tries), then an hour (to 12), then six
//     hours, and stops after SOFASCORE_FANTASY_MAX_ATTEMPTS. A data problem that
//     the same replies cannot fix (an unknown incident, goals that do not add
//     up) is not retried from storage; fresh replies from the 2-hour refresh
//     window can still reopen it. A fixture finished but never attempted (the
//     migration came late, a tick failed) is fetched at most
//     SOFASCORE_FANTASY_CATCHUP_PER_TICK per tick, 3 requests each, and given up
//     after SOFASCORE_FANTASY_FETCH_ATTEMPTS tries.
//
// Dependency-free apart from sibling shared modules (Bun tests, Deno runtime).

import { canonicalJson, sha256Hex } from "./canonical-json.ts";
import type {
  PerformanceIncident,
  PerformanceLineups,
  PerformanceStatisticLine,
} from "./performance-contracts.ts";
import { RapidApiError } from "./rapidapi-client.ts";
import {
  IdentitySnapshotError,
  buildReviewedIdentitySnapshot,
  type MappingRowInput,
} from "./reviewed-identities.ts";
import type { SofascoreShadowClient } from "./sofascore-fixtures.ts";
import {
  prepareSofascoreObservation,
  type PreparedSofascoreObservation,
  type SofascoreMatchData,
} from "./sofascore-fantasy.ts";
import {
  fetchSofascoreMatchReplies,
  type SofascoreDetailsRequestLog,
} from "./sofascore-match-details.ts";
import {
  SofascoreParseError,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "./sofascore-performance-parse.ts";
import type { FixtureRpcClient, FixtureRpcResult } from "./sportsmonks-fixtures.ts";

export type SofascoreFantasyMode = "sofascore" | "shadow";
export type FantasySource = "fresh" | "stored" | "catch_up";

/** The three raw replies of one finished match, as fetchSofascoreMatchReplies returns them. */
export interface SofascoreRawReplies {
  readonly incidents: unknown;
  readonly lineups: unknown;
  readonly statistics: unknown;
}

export const FANTASY_RETRIES_PER_TICK_DEFAULT = 6;
export const FANTASY_RETRIES_PER_TICK_MAX = 20;
export const FANTASY_CATCHUP_PER_TICK_DEFAULT = 1;
export const FANTASY_CATCHUP_PER_TICK_MAX = 4;
export const FANTASY_CATCHUP_HOURS_DEFAULT = 72;
export const FANTASY_CATCHUP_HOURS_MAX = 720;
export const FANTASY_MAX_ATTEMPTS_DEFAULT = 24;
export const FANTASY_MAX_ATTEMPTS_MAX = 100;
export const FANTASY_FETCH_ATTEMPTS_DEFAULT = 4;
export const FANTASY_FETCH_ATTEMPTS_MAX = 20;
const RESULTS_IN_SUMMARY = 25;
const MAX_PLAYER_IDS = 120;

export interface SofascoreFantasyConfig {
  readonly enabled: boolean;
  readonly retriesPerTick: number;
  readonly catchUpPerTick: number;
  readonly catchUpHours: number;
  readonly maxAttempts: number;
  readonly fetchAttempts: number;
}

function bounded(value: string | undefined, fallback: number, max: number, min = 0): number {
  const raw = value?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/** All optional. SOFASCORE_FANTASY_ENABLED=false switches the whole path off without a deploy. */
export function readFantasyConfig(
  environment: Readonly<Record<string, string | undefined>>,
): SofascoreFantasyConfig {
  const flag = environment.SOFASCORE_FANTASY_ENABLED?.trim().toLowerCase();
  return {
    enabled: !(flag === "0" || flag === "false" || flag === "off" || flag === "no"),
    retriesPerTick: bounded(
      environment.SOFASCORE_FANTASY_RETRIES_PER_TICK,
      FANTASY_RETRIES_PER_TICK_DEFAULT,
      FANTASY_RETRIES_PER_TICK_MAX,
    ),
    catchUpPerTick: bounded(
      environment.SOFASCORE_FANTASY_CATCHUP_PER_TICK,
      FANTASY_CATCHUP_PER_TICK_DEFAULT,
      FANTASY_CATCHUP_PER_TICK_MAX,
    ),
    catchUpHours: bounded(
      environment.SOFASCORE_FANTASY_CATCHUP_HOURS,
      FANTASY_CATCHUP_HOURS_DEFAULT,
      FANTASY_CATCHUP_HOURS_MAX,
      1,
    ),
    maxAttempts: bounded(
      environment.SOFASCORE_FANTASY_MAX_ATTEMPTS,
      FANTASY_MAX_ATTEMPTS_DEFAULT,
      FANTASY_MAX_ATTEMPTS_MAX,
      1,
    ),
    fetchAttempts: bounded(
      environment.SOFASCORE_FANTASY_FETCH_ATTEMPTS,
      FANTASY_FETCH_ATTEMPTS_DEFAULT,
      FANTASY_FETCH_ATTEMPTS_MAX,
      1,
    ),
  };
}

/** Minutes to wait after the n-th attempt: 15 (to 3), 60 (to 12), then 360. */
export function retryDelayMinutes(attempts: number): number {
  return attempts <= 3 ? 15 : attempts <= 12 ? 60 : 360;
}

// ---------------------------------------------------------------------------
// What is kept for a retry

const STORED_VERSION = 1;
interface StoredMatch {
  readonly version: 1;
  readonly lineups: PerformanceLineups;
  readonly incidents: readonly PerformanceIncident[];
  readonly statistics: readonly PerformanceStatisticLine[];
}
interface MatchParts {
  readonly lineups: PerformanceLineups;
  readonly incidents: readonly PerformanceIncident[];
  readonly statistics: readonly PerformanceStatisticLine[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whole-match team statistic lines only: the builder reads nothing else. */
function trim(parts: MatchParts): StoredMatch {
  return {
    version: STORED_VERSION,
    lineups: parts.lineups,
    incidents: parts.incidents,
    statistics: parts.statistics.filter((line) => line.period === "ALL"),
  };
}

function readStored(value: unknown): MatchParts | null {
  if (!isRecord(value) || value.version !== STORED_VERSION) return null;
  const { lineups, incidents, statistics } = value;
  if (
    !isRecord(lineups) ||
    lineups.provider !== "sofascore" ||
    !Array.isArray(lineups.players) ||
    typeof lineups.fullCoverage !== "boolean" ||
    !Array.isArray(incidents) ||
    !Array.isArray(statistics)
  )
    return null;
  return {
    lineups: lineups as unknown as PerformanceLineups,
    incidents: incidents as PerformanceIncident[],
    statistics: statistics as PerformanceStatisticLine[],
  };
}

// ---------------------------------------------------------------------------
// The database context

interface PlayerMappingRow {
  readonly id: string;
  readonly externalId: string;
  readonly appPlayerId: string;
  readonly active: boolean;
  readonly reviewed: boolean;
  readonly version: string | null;
  readonly updatedAt: string;
}

interface FantasyContext {
  readonly found: boolean;
  readonly sofascoreEventId: string | null;
  readonly status: string | null;
  readonly finalized: boolean;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly homeTeamId: string | null;
  readonly awayTeamId: string | null;
  readonly gameweekStatus: string | null;
  readonly adaptiveEnabled: boolean;
  readonly observations: number;
  readonly attempt: {
    readonly status: string;
    readonly attempts: number;
    readonly matchData: unknown;
  } | null;
  readonly players: readonly PlayerMappingRow[];
}

function readContext(data: unknown): FantasyContext | null {
  if (!isRecord(data)) return null;
  if (data.found !== true) return null;
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const attempt = isRecord(data.attempt)
    ? {
        status: text(data.attempt.status) ?? "held",
        attempts: num(data.attempt.attempts) ?? 0,
        matchData: data.attempt.matchData ?? null,
      }
    : null;
  const players = (Array.isArray(data.players) ? data.players : []).flatMap(
    (row): PlayerMappingRow[] => {
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
    found: true,
    sofascoreEventId: text(data.sofascoreEventId),
    status: text(data.status),
    finalized: data.finalized === true,
    homeScore: num(data.homeScore),
    awayScore: num(data.awayScore),
    homeTeamId: text(data.homeTeamId),
    awayTeamId: text(data.awayTeamId),
    gameweekStatus: text(data.gameweekStatus),
    adaptiveEnabled: data.adaptiveEnabled === true,
    observations: num(data.observations) ?? 0,
    attempt,
    players,
  };
}

/** Database refusals a later try can clear: the world changes, the replies do not need to. */
const RETRIABLE_REFUSALS: ReadonlySet<string> = new Set([
  "sofascore_identity_not_reviewed",
  "adaptive_policy_not_enabled",
  "adaptive_fixture_not_finished",
  "adaptive_final_score_mismatch",
  "adaptive_player_membership_missing",
  "sofascore_fixture_mapping_missing",
]);
/** The gameweek no longer takes observations (it is finalizing or sealed): stop. */
const SEALED_REFUSALS: ReadonlySet<string> = new Set([
  "adaptive_reviewed_correction_required",
  "fantasy_scoring_sealed",
]);
const SEALED_GAMEWEEKS: ReadonlySet<string> = new Set(["finalizing", "finalized", "corrected"]);
/** Blockers fresh replies may clear on their own, so storing them for a retry is pointless. */
const RETRIABLE_BLOCKER = "unmapped_players";

const isMissingFunction = (error: FixtureRpcResult["error"]): boolean =>
  error !== null &&
  (error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|function .* does not exist/i.test(error.message ?? ""));

/** Labels the recording function raises on purpose; anything else is a transport or unknown failure. */
const KNOWN_REFUSAL = /^(adaptive|sofascore|fantasy|reconciled)_[a-z0-9_]+$/;

const safeLabel = (value: string | undefined): string =>
  value && /^[a-z0-9_]{1,80}$/.test(value) ? value : "database_error";

// ---------------------------------------------------------------------------
// The run

export interface FantasyFixtureResult {
  readonly fixtureId: string | null;
  readonly eventId: string | null;
  readonly source: FantasySource;
  readonly outcome: string;
}

export interface SofascoreFantasySummary {
  readonly enabled: boolean;
  readonly mode: SofascoreFantasyMode;
  readonly recorded: number;
  readonly held: number;
  readonly skipped: number;
  readonly errors: number;
  /** SofaScore requests this module made (catch-up fetches only; 0 on the normal path). */
  readonly requests: number;
  readonly results: readonly FantasyFixtureResult[];
}

export interface SofascoreFantasyDependencies {
  readonly mode: SofascoreFantasyMode;
  readonly client: FixtureRpcClient;
  readonly rapid: SofascoreShadowClient;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly now: Date;
  /** One JSON string per fixture. */
  readonly log: (line: string) => void;
}

export class SofascoreFantasyRun {
  readonly config: SofascoreFantasyConfig;
  private readonly results: FantasyFixtureResult[] = [];
  private readonly requestLog: SofascoreDetailsRequestLog[] = [];
  private readonly done = new Set<string>();
  private stateMissing = false;
  private autoMapMissing = false;
  private rateLimited = false;
  private counts = { recorded: 0, held: 0, skipped: 0, errors: 0 };

  constructor(private readonly deps: SofascoreFantasyDependencies) {
    this.config = readFantasyConfig(deps.environment);
  }

  summary(): SofascoreFantasySummary {
    return {
      enabled: this.config.enabled,
      mode: this.deps.mode,
      ...this.counts,
      requests: this.requestLog.length,
      results: this.results.slice(0, RESULTS_IN_SUMMARY),
    };
  }

  /**
   * A finished match whose three replies were just fetched for the match
   * details. Never throws.
   */
  async fromReplies(
    fixtureId: string,
    eventId: string,
    replies: SofascoreRawReplies,
    source: FantasySource = "fresh",
  ): Promise<void> {
    if (!this.config.enabled || this.done.has(fixtureId)) return;
    this.done.add(fixtureId);
    try {
      await this.processReplies(fixtureId, eventId, replies, source);
    } catch {
      this.finish({ fixtureId, eventId, source, outcome: "error:unexpected" });
    }
  }

  /**
   * Retries held fixtures from their stored replies (no SofaScore request) and
   * fetches at most `catchUpPerTick` finished fixtures never attempted
   * (3 requests each). `sofascore` mode only: a shadow run keeps no state.
   */
  async sweep(): Promise<void> {
    const { config, deps } = this;
    if (!config.enabled || deps.mode !== "sofascore" || this.stateMissing) return;
    if (config.retriesPerTick === 0 && config.catchUpPerTick === 0) return;
    try {
      const due = await this.call("service_sofascore_fantasy_due", {
        p_retry_limit: config.retriesPerTick,
        p_catchup_limit: config.catchUpPerTick,
        p_hours: config.catchUpHours,
        p_max_attempts: config.maxAttempts,
        p_fetch_max_attempts: config.fetchAttempts,
      });
      if (due.error) {
        if (isMissingFunction(due.error)) this.markStateMissing();
        else
          this.finish({
            fixtureId: null,
            eventId: null,
            source: "stored",
            outcome: "error:due_unavailable",
          });
        return;
      }
      const list = isRecord(due.data) ? due.data : {};
      const retry = (Array.isArray(list.retry) ? list.retry : []).filter(
        (id): id is string => typeof id === "string",
      );
      for (const fixtureId of retry.slice(0, config.retriesPerTick)) {
        if (this.done.has(fixtureId)) continue;
        this.done.add(fixtureId);
        try {
          await this.processStored(fixtureId);
        } catch {
          this.finish({ fixtureId, eventId: null, source: "stored", outcome: "error:unexpected" });
        }
      }
      const catchUp = (Array.isArray(list.catchUp) ? list.catchUp : []).filter(
        (item): item is { fixtureId: string; eventId: string } =>
          isRecord(item) && typeof item.fixtureId === "string" && typeof item.eventId === "string",
      );
      for (const item of catchUp.slice(0, config.catchUpPerTick)) {
        if (this.rateLimited) break;
        if (this.done.has(item.fixtureId)) continue;
        await this.catchUp(item.fixtureId, item.eventId);
      }
    } catch {
      this.finish({
        fixtureId: null,
        eventId: null,
        source: "stored",
        outcome: "error:sweep_failed",
      });
    }
  }

  // -- one fixture, from fresh replies ---------------------------------------

  private async processReplies(
    fixtureId: string,
    eventId: string,
    replies: SofascoreRawReplies,
    source: FantasySource,
  ): Promise<void> {
    let parts: MatchParts;
    try {
      if (replies.lineups === null)
        throw new SofascoreParseError("lineups", ["lineups: not provided"]);
      parts = {
        lineups: parseSofascoreLineups(replies.lineups),
        incidents: parseSofascoreIncidents(replies.incidents),
        statistics: replies.statistics === null ? [] : parseSofascoreStatistics(replies.statistics),
      };
    } catch (error) {
      const code =
        replies.lineups === null
          ? "lineups_unavailable"
          : error instanceof SofascoreParseError
            ? "invalid_provider_payload"
            : "unreadable_replies";
      const ctx = await this.context(fixtureId, []);
      if (ctx === "missing" || ctx === "error" || ctx === null) {
        this.finish({ fixtureId, eventId, source, outcome: `error:${code}` });
        return;
      }
      await this.holdWithoutData(fixtureId, eventId, source, ctx, code);
      return;
    }
    await this.decide(fixtureId, eventId, source, parts);
  }

  // -- one fixture, from stored replies ----------------------------------------

  private async processStored(fixtureId: string): Promise<void> {
    const ctx = await this.context(fixtureId, []);
    if (ctx === "missing" || ctx === "error" || ctx === null) {
      this.finish({
        fixtureId,
        eventId: null,
        source: "stored",
        outcome: "skipped:state_unavailable",
      });
      return;
    }
    const eventId = ctx.sofascoreEventId;
    const parts = readStored(ctx.attempt?.matchData);
    if (!eventId || !parts) {
      await this.note(fixtureId, eventId ?? "0", "gave_up", "stored_data_invalid", [], null, null);
      this.finish({ fixtureId, eventId, source: "stored", outcome: "error:stored_data_invalid" });
      return;
    }
    await this.decide(fixtureId, eventId, "stored", parts);
  }

  // -- one fixture, never attempted: fetch it ----------------------------------

  private async catchUp(fixtureId: string, eventId: string): Promise<void> {
    this.done.add(fixtureId);
    let replies: SofascoreRawReplies;
    try {
      replies = await fetchSofascoreMatchReplies(this.deps.rapid, eventId, this.requestLog);
    } catch (error) {
      if (error instanceof RapidApiError && error.code === "provider_rate_limited") {
        this.rateLimited = true;
        this.finish({
          fixtureId,
          eventId,
          source: "catch_up",
          outcome: "error:provider_rate_limited",
        });
        return;
      }
      const ctx = await this.context(fixtureId, []);
      if (ctx !== "missing" && ctx !== "error" && ctx !== null)
        await this.holdWithoutData(fixtureId, eventId, "catch_up", ctx, "fetch_failed");
      else this.finish({ fixtureId, eventId, source: "catch_up", outcome: "error:fetch_failed" });
      return;
    }
    try {
      await this.processReplies(fixtureId, eventId, replies, "catch_up");
    } catch {
      this.finish({ fixtureId, eventId, source: "catch_up", outcome: "error:unexpected" });
    }
  }

  // -- the decision --------------------------------------------------------------

  private async decide(
    fixtureId: string,
    eventId: string,
    source: FantasySource,
    parts: MatchParts,
  ): Promise<void> {
    const { mode, now } = this.deps;
    const ids = [...new Set(parts.lineups.players.map((p) => p.externalId))].slice(
      0,
      MAX_PLAYER_IDS,
    );
    let ctx = await this.context(fixtureId, ids);
    if (ctx === "missing") return; // marked, logged once
    if (ctx === "error" || ctx === null) {
      this.finish({ fixtureId, eventId, source, outcome: "skipped:state_unavailable" });
      return;
    }
    const base = { fixtureId, eventId, source };
    if (ctx.sofascoreEventId !== eventId) {
      this.finish({ ...base, outcome: "skipped:event_mismatch" });
      return;
    }
    if (ctx.attempt?.status === "recorded") {
      this.finish({ ...base, outcome: "skipped:already_recorded" });
      return;
    }
    if (ctx.observations > 0) {
      this.finish({ ...base, outcome: "skipped:already_observed" });
      return;
    }
    if (ctx.status !== "finished" || !ctx.finalized) {
      this.finish({ ...base, outcome: "skipped:not_finalized" });
      return;
    }
    if (ctx.gameweekStatus === null) {
      await this.hold(fixtureId, eventId, source, ctx, parts, ["no_gameweek"], true);
      return;
    }
    if (SEALED_GAMEWEEKS.has(ctx.gameweekStatus)) {
      await this.note(
        fixtureId,
        eventId,
        "gave_up",
        `gameweek_${ctx.gameweekStatus}`,
        [],
        null,
        null,
      );
      this.finish({ ...base, outcome: `skipped:gameweek_${ctx.gameweekStatus}` });
      return;
    }
    if (!ctx.adaptiveEnabled) {
      await this.hold(
        fixtureId,
        eventId,
        source,
        ctx,
        parts,
        ["adaptive_policy_not_enabled"],
        true,
      );
      return;
    }
    const { homeTeamId, awayTeamId, homeScore, awayScore } = ctx;
    if (!homeTeamId || !awayTeamId || homeScore === null || awayScore === null) {
      this.finish({ ...base, outcome: "skipped:fixture_incomplete" });
      return;
    }

    // Offer the unmapped appearing players to the auto-mapping, then read again.
    let autoMap = "not_needed";
    const usable = (rows: readonly PlayerMappingRow[]) =>
      new Set(rows.filter((r) => r.active && r.reviewed).map((r) => r.externalId));
    let mapped = usable(ctx.players);
    const appearing = appearingIds(parts);
    const missing = parts.lineups.players.filter((p) => !mapped.has(p.externalId));
    if (missing.some((p) => appearing.has(p.externalId))) {
      if (mode !== "sofascore") autoMap = "shadow_skipped";
      else if (this.autoMapMissing) autoMap = "missing";
      else {
        const result = await this.autoMapPlayers(fixtureId, missing, appearing);
        autoMap = result.label;
        if (result.mappedAny) {
          const again = await this.context(fixtureId, ids);
          if (again !== "missing" && again !== "error" && again !== null) {
            ctx = again;
            mapped = usable(ctx.players);
          }
        }
      }
    }

    // Build from the mappings that are active and reviewed.
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
    let prepared: PreparedSofascoreObservation;
    try {
      // The digest covers the mappings this match used (read for its own players).
      const snapshot = await buildReviewedIdentitySnapshot(rows, now.toISOString());
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
      };
      prepared = await prepareSofascoreObservation({
        observedAt: now.toISOString(),
        match,
        snapshot,
        binding: { appFixtureId: fixtureId, homeTeamId, awayTeamId },
        payloadDigest: await sha256Hex(
          canonicalJson({
            lineups: parts.lineups,
            incidents: parts.incidents,
            statistics: parts.statistics,
          }),
        ),
      });
    } catch (error) {
      const code = error instanceof IdentitySnapshotError ? error.code : "build_failed";
      this.finish({ ...base, outcome: `error:${code}`, autoMap });
      return;
    }

    if (prepared.blockers.length > 0 || prepared.request === null) {
      const codes = [...new Set(prepared.blockers.map((b) => b.code as string))];
      await this.hold(
        fixtureId,
        eventId,
        source,
        ctx,
        parts,
        codes,
        codes.includes(RETRIABLE_BLOCKER),
        {
          autoMap,
          unmapped: prepared.unmapped.length,
          coverage: prepared.coverage,
        },
      );
      return;
    }

    // Ready. Shadow asks the database as a dry run and writes nothing.
    const dry = mode === "shadow";
    const recorded = await this.call("service_record_sofascore_fantasy_observation", {
      p_fixture_id: fixtureId,
      p_request: prepared.request,
      p_dry_run: dry,
    });
    const detail = {
      autoMap,
      coverage: prepared.coverage,
      expectedMode: prepared.expectedMode,
      rows: prepared.rows,
      unknownFields: prepared.unknownFields,
    };
    if (recorded.error) {
      const label = safeLabel(recorded.error.message);
      if (dry) {
        this.finish({ ...base, outcome: `held:${label}`, ...detail });
        return;
      }
      if (SEALED_REFUSALS.has(label)) {
        await this.note(fixtureId, eventId, "gave_up", label, [], null, prepared.requestDigest);
        this.finish({ ...base, outcome: `held:${label}`, ...detail });
        return;
      }
      if (RETRIABLE_REFUSALS.has(label) || !KNOWN_REFUSAL.test(label)) {
        // The world may change (a mapping, the policy) or the call never reached
        // the database: keep the replies and try again later, counted and bounded.
        await this.hold(fixtureId, eventId, source, ctx, parts, [label], true, detail);
        return;
      }
      // A refusal that fresh replies or a mapping cannot clear: stop, for a person.
      await this.note(fixtureId, eventId, "gave_up", label, [], null, prepared.requestDigest);
      this.finish({ ...base, outcome: `held:${label}`, ...detail });
      return;
    }
    if (dry) {
      this.finish({ ...base, outcome: "skipped:shadow_dry_run_ok", ...detail });
      return;
    }
    await this.note(fixtureId, eventId, "recorded", "recorded", [], null, prepared.requestDigest);
    const result = isRecord(recorded.data) ? recorded.data : {};
    this.finish({
      ...base,
      outcome: "recorded",
      ...detail,
      created: result.created === true,
      fullReady: result.fullReady === true,
    });
  }

  // -- holding -------------------------------------------------------------------

  /** A match that cannot be recorded yet. `retriable`: keep the replies for a retry. */
  private async hold(
    fixtureId: string,
    eventId: string,
    source: FantasySource,
    ctx: FantasyContext,
    parts: MatchParts,
    codes: readonly string[],
    retriable: boolean,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const ordered = [...codes].sort((a, b) =>
      a === RETRIABLE_BLOCKER ? -1 : b === RETRIABLE_BLOCKER ? 1 : 0,
    );
    const outcome = `held:${ordered[0] ?? "unknown"}`;
    if (this.deps.mode === "shadow") {
      this.finish({ fixtureId, eventId, source, outcome, blockers: ordered, ...extra });
      return;
    }
    const attemptsBefore = ctx.attempt?.attempts ?? 0;
    const next = attemptsBefore + 1;
    const limit = this.config.maxAttempts;
    if (!retriable || next >= limit) {
      // Needs a person (or fresh replies from the refresh window): stop retrying.
      await this.note(fixtureId, eventId, "gave_up", ordered[0] ?? "unknown", ordered, null, null);
    } else {
      const trimmed = trim(parts);
      const digest = await sha256Hex(canonicalJson(trimmed));
      const retryAt = new Date(this.deps.now.getTime() + retryDelayMinutes(next) * 60_000);
      await this.note(
        fixtureId,
        eventId,
        "held",
        ordered[0] ?? "unknown",
        ordered,
        trimmed,
        digest,
        retryAt,
      );
    }
    this.finish({
      fixtureId,
      eventId,
      source,
      outcome,
      blockers: ordered,
      attempts: next,
      retry: retriable && next < limit,
      ...extra,
    });
  }

  /** Nothing usable to keep (the replies did not parse, or never arrived): count the attempt. */
  private async holdWithoutData(
    fixtureId: string,
    eventId: string,
    source: FantasySource,
    ctx: FantasyContext,
    code: string,
  ): Promise<void> {
    const outcome = `error:${code}`;
    if (this.deps.mode === "shadow") {
      this.finish({ fixtureId, eventId, source, outcome });
      return;
    }
    const next = (ctx.attempt?.attempts ?? 0) + 1;
    const exhausted = next >= this.config.fetchAttempts;
    await this.note(
      fixtureId,
      eventId,
      exhausted ? "gave_up" : "held",
      code,
      [],
      null,
      null,
      new Date(this.deps.now.getTime() + retryDelayMinutes(next) * 60_000),
    );
    this.finish({ fixtureId, eventId, source, outcome, attempts: next, retry: !exhausted });
  }

  // -- the database ----------------------------------------------------------------

  private async call(name: string, args: Record<string, unknown>): Promise<FixtureRpcResult> {
    try {
      const result = await this.deps.client.schema("api").rpc(name, args);
      return { data: result.data, error: result.error ?? null };
    } catch {
      return { data: null, error: { message: "database_unavailable" } };
    }
  }

  private markStateMissing() {
    if (this.stateMissing) return;
    this.stateMissing = true;
    this.finish({
      fixtureId: null,
      eventId: null,
      source: "fresh",
      outcome: "skipped:state_function_missing",
    });
  }

  /** "missing": the state functions are not in this database. "error": unreadable. */
  private async context(
    fixtureId: string,
    playerIds: readonly string[],
  ): Promise<FantasyContext | "missing" | "error" | null> {
    if (this.stateMissing) return "missing";
    const result = await this.call("service_sofascore_fantasy_context", {
      p_fixture_id: fixtureId,
      p_player_ids: playerIds,
    });
    if (result.error) {
      if (isMissingFunction(result.error)) {
        this.markStateMissing();
        return "missing";
      }
      return "error";
    }
    return readContext(result.data);
  }

  private async note(
    fixtureId: string,
    eventId: string,
    status: "held" | "recorded" | "gave_up",
    outcome: string,
    blockers: readonly string[],
    matchData: StoredMatch | null,
    digest: string | null,
    retryAt: Date | null = null,
  ): Promise<void> {
    if (this.deps.mode !== "sofascore" || this.stateMissing) return;
    const result = await this.call("service_sofascore_fantasy_note", {
      p_fixture_id: fixtureId,
      p_event_id: eventId,
      p_status: status,
      p_outcome: outcome.slice(0, 200),
      p_blockers: blockers.map((code) => ({ code })),
      p_match_data: matchData,
      p_data_digest: digest,
      p_next_retry_at: retryAt ? retryAt.toISOString() : null,
    });
    if (result.error && isMissingFunction(result.error)) this.stateMissing = true;
  }

  private async autoMapPlayers(
    fixtureId: string,
    players: PerformanceLineups["players"],
    appearing: ReadonlySet<string>,
  ): Promise<{ label: string; mappedAny: boolean }> {
    const result = await this.call("service_sofascore_auto_map_players", {
      p_fixture_id: fixtureId,
      p_players: players.map((p) => ({
        sofascorePlayerId: p.externalId,
        side: p.side,
        name: p.name,
        shortName: null,
        shirtNumber: p.shirtNumber,
        position: p.position,
        appeared: appearing.has(p.externalId),
      })),
    });
    if (result.error) {
      if (isMissingFunction(result.error)) {
        // Not installed here (yet): carry on, the builder holds unmapped players back.
        this.autoMapMissing = true;
        return { label: "missing", mappedAny: false };
      }
      return { label: `error:${safeLabel(result.error.message)}`, mappedAny: false };
    }
    const data = isRecord(result.data) ? result.data : {};
    const mapped = Array.isArray(data.mapped) ? data.mapped.length : 0;
    const queued = typeof data.queued === "number" ? data.queued : 0;
    const conflicts = typeof data.conflicts === "number" ? data.conflicts : 0;
    return {
      label: `mapped=${mapped},queued=${queued},conflicts=${conflicts}`,
      mappedAny: mapped > 0,
    };
  }

  // -- one log line per fixture --------------------------------------------------------

  private finish(entry: FantasyFixtureResult & Record<string, unknown>): void {
    const { outcome } = entry;
    if (outcome === "recorded") this.counts.recorded += 1;
    else if (outcome.startsWith("held:")) this.counts.held += 1;
    else if (outcome.startsWith("skipped:")) this.counts.skipped += 1;
    else this.counts.errors += 1;
    this.results.push({
      fixtureId: entry.fixtureId,
      eventId: entry.eventId,
      source: entry.source,
      outcome,
    });
    try {
      this.deps.log(
        JSON.stringify({ event: "football_live_refresh_fantasy", mode: this.deps.mode, ...entry }),
      );
    } catch {
      // Logging must never break the run.
    }
  }
}

/** Players who started or came on: the ones the builder needs an identity for. */
function appearingIds(parts: MatchParts): Set<string> {
  const ids = new Set<string>();
  for (const p of parts.lineups.players) if (p.starter) ids.add(p.externalId);
  for (const i of parts.incidents)
    if (i.kind === "substitution" && i.playerIn?.externalId) ids.add(i.playerIn.externalId);
  return ids;
}
