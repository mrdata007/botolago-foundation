/**
 * Scoring ingestion for the Sofascore + Flashscore reconciler
 * (docs/backend/RECONCILED_SCORING_INGESTION.md).
 *
 * Three parts, each small:
 *
 * 1. `prepareReconciledObservation` (pure): runs the reconciler and the replay
 *    verdict on one match and either refuses, with the reasons, or builds the
 *    exact request the database takes. It refuses unless the match is
 *    ingestion-ready: every player who appeared is a reviewed identity on BOTH
 *    providers, the events agree, participation is established, and nobody is
 *    held back. It never guesses an identity, a team or a zero.
 * 2. `SupabaseReconciledObservationGateway`: one service-only RPC,
 *    `api.service_record_reconciled_fantasy_observation`. The database checks
 *    every identity again, links the app fixture to the two provider matches,
 *    and records the observation through the same recorder as every other
 *    source. With `dryRun` every guard runs and nothing is kept.
 * 3. `ingestReconciledFixtures`: runs a list of prepared matches, retries only
 *    what can be retried, and reports each match on its own.
 *
 * Why a retry cannot duplicate points: the database stores an observation once
 * per (fixture, digest of its facts); the same facts sent again return the row
 * already there. Points are not written here at all: the scoring worker turns
 * observations into points, and its own writes are keyed by its input digest.
 */
import { canonicalJson, sha256Hex } from "../football/identity/bulk-mapping/canonical";
import type { MatchSide } from "../football/provider/performance-contracts";
import type { StatisticEvidence } from "./adaptive-scoring";
import { reconcileMatch, type ProviderMatchData } from "./provider-reconciler";
import { replayFixture, type StageVerdict } from "./provider-replay";
import type { ReviewedIdentitySnapshot } from "./reviewed-identities";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Which app fixture a provider match pair is, and the app team on each side. Reviewed by a person. */
export interface FixtureBinding {
  readonly appFixtureId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
}

export interface ObservationRow {
  readonly playerId: string;
  readonly teamId: string;
  readonly started: boolean;
  /** Both provider ids. The database checks each is a reviewed mapping to `playerId`. */
  readonly identity: { readonly sofascoreId: string; readonly flashscoreId: string };
  readonly stats: Readonly<Record<string, number | boolean>>;
  readonly evidence: Readonly<Record<string, StatisticEvidence>>;
}

export interface ReconciledObservationRequest {
  readonly sofascoreEventId: string;
  readonly flashscoreEventId: string;
  readonly mappingSnapshotDigest: string;
  readonly payload: {
    readonly homeScore: number;
    readonly awayScore: number;
    readonly anonymousStarters: 0;
    readonly anonymousByTeam: Record<string, never>;
    readonly references: readonly string[];
    readonly participationComplete: boolean;
    readonly disciplineComplete: boolean;
    readonly players: readonly ObservationRow[];
  };
}

/** Stable reasons a match is not sent. Each says what has to change first. */
export type BlockerCode =
  | "binding_invalid"
  | "match_not_finished"
  | "score_missing_or_disagrees"
  | "not_ingestion_ready"
  | "identity_not_reviewed_pair"
  | "duplicate_app_player"
  | "starters_not_eleven";

export interface Blocker {
  readonly code: BlockerCode;
  readonly message: string;
}

export interface PreparedObservation {
  readonly sofascoreEventId: string;
  readonly flashscoreEventId: string;
  readonly appFixtureId: string;
  readonly stages: StageVerdict;
  readonly mode: string;
  /** Empty when `request` is set. */
  readonly blockers: readonly Blocker[];
  /** Only when nothing blocks. */
  readonly request: ReconciledObservationRequest | null;
  /** sha256 of the canonical request: what a dry run and a write of this match both send. */
  readonly requestDigest: string | null;
}

export interface PrepareInput {
  readonly observedAt: string;
  readonly sofascore: ProviderMatchData;
  readonly flashscore: ProviderMatchData;
  readonly snapshot: ReviewedIdentitySnapshot;
  readonly binding: FixtureBinding;
  readonly digests?: { readonly sofascore?: string; readonly flashscore?: string };
}

export async function prepareReconciledObservation(
  input: PrepareInput,
): Promise<PreparedObservation> {
  const { sofascore, flashscore, snapshot, binding, observedAt } = input;
  const sofaId = sofascore.summary.externalId;
  const flashId = flashscore.summary.externalId;
  const replay = replayFixture({ observedAt, sofascore, flashscore, snapshot });
  const result = reconcileMatch({
    observedAt,
    sofascore,
    flashscore,
    reviewedIdentities: snapshot,
    ...(input.digests ? { digests: input.digests } : {}),
  });
  const blockers: Blocker[] = [];
  const block = (code: BlockerCode, message: string) => blockers.push({ code, message });

  if (
    !UUID.test(binding.appFixtureId) ||
    !UUID.test(binding.homeTeamId) ||
    !UUID.test(binding.awayTeamId) ||
    binding.homeTeamId === binding.awayTeamId
  ) {
    block(
      "binding_invalid",
      "The fixture binding needs three lowercase UUIDs and two different teams.",
    );
  }
  if (!sofascore.summary.finished || !flashscore.summary.finished) {
    block("match_not_finished", "A provider does not report the match as finished.");
  }
  const { homeScore, awayScore } = sofascore.summary;
  if (
    homeScore === null ||
    awayScore === null ||
    homeScore !== flashscore.summary.homeScore ||
    awayScore !== flashscore.summary.awayScore
  ) {
    block("score_missing_or_disagrees", "The two providers do not give the same final score.");
  }
  if (!replay.stages.ingestionReady) {
    const failed = (
      [
        ["IDENTITIES_RESOLVED", replay.stages.identityResolved],
        ["EVENTS_RECONCILED", replay.stages.eventsReconciled],
        ["PARTICIPATION_ESTABLISHED", replay.stages.participationEstablished],
        ["SCORING_FIELDS_READY", replay.stages.scoringFieldsReady],
      ] as const
    )
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    block(
      "not_ingestion_ready",
      `Not ingestion-ready (${failed.join(", ")}): ${replay.blockers.join(" ") || "see the replay"}`,
    );
  }

  const teamOf: Record<MatchSide, string> = { home: binding.homeTeamId, away: binding.awayTeamId };
  const rows: ObservationRow[] = [];
  const seen = new Set<string>();
  for (const p of result.players) {
    if (
      p.identityStatus !== "reviewed_pair" ||
      p.appPlayerId === null ||
      p.sofascoreId === null ||
      p.flashscoreId === null
    ) {
      block(
        "identity_not_reviewed_pair",
        `${p.side} shirt ${p.shirtNumber ?? "?"} is ${p.identityStatus}, not a reviewed identity on both providers.`,
      );
      continue;
    }
    if (seen.has(p.appPlayerId)) {
      block("duplicate_app_player", `App player ${p.appPlayerId} appears twice.`);
      continue;
    }
    seen.add(p.appPlayerId);
    const stats: Record<string, number | boolean> = {};
    for (const [field, value] of Object.entries(p.stats)) {
      if (value !== undefined) stats[field] = value;
    }
    const evidence: Record<string, StatisticEvidence> = {};
    for (const [field, proof] of Object.entries(p.evidence)) {
      if (proof) evidence[field] = { ...proof, references: [...proof.references] };
    }
    rows.push({
      playerId: p.appPlayerId.toLowerCase(),
      teamId: teamOf[p.side],
      started: p.started,
      identity: { sofascoreId: p.sofascoreId, flashscoreId: p.flashscoreId },
      stats,
      evidence,
    });
  }
  for (const side of ["home", "away"] as const) {
    const starters = rows.filter((r) => r.teamId === teamOf[side] && r.started).length;
    if (blockers.length === 0 && starters !== 11) {
      block("starters_not_eleven", `${side}: ${starters} identified starters, 11 are needed.`);
    }
  }

  const base = {
    sofascoreEventId: sofaId,
    flashscoreEventId: flashId,
    appFixtureId: binding.appFixtureId,
    stages: replay.stages,
    mode: result.mode,
  };
  if (blockers.length > 0) return { ...base, blockers, request: null, requestDigest: null };

  const references = [
    `sofascore:event:${sofaId}`,
    `flashscore:match:${flashId}`,
    `mapping-snapshot:sha256:${snapshot.digest}`,
    ...(input.digests?.sofascore ? [`sofascore:payload:${input.digests.sofascore}`] : []),
    ...(input.digests?.flashscore ? [`flashscore:payload:${input.digests.flashscore}`] : []),
  ];
  const request: ReconciledObservationRequest = {
    sofascoreEventId: sofaId,
    flashscoreEventId: flashId,
    mappingSnapshotDigest: snapshot.digest,
    payload: {
      homeScore: homeScore as number,
      awayScore: awayScore as number,
      anonymousStarters: 0,
      anonymousByTeam: {},
      references,
      participationComplete: replay.stages.participationEstablished,
      disciplineComplete: replay.stages.eventsReconciled,
      players: rows.sort((a, b) => (a.playerId < b.playerId ? -1 : 1)),
    },
  };
  return {
    ...base,
    blockers: [],
    request,
    requestDigest: await sha256Hex(canonicalJson(request)),
  };
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export interface RecordedObservation {
  readonly observationId: number;
  readonly digest: string;
  readonly fullReady: boolean;
  readonly simpleReady: boolean;
  /** False when these exact facts were already stored (a retry, or a re-run). */
  readonly created: boolean;
  /** False when a newer observation for the fixture exists (it, not this one, is scored). */
  readonly latest: boolean;
  readonly dryRun: boolean;
  /** True when a reviewed correction is in force: the provider facts were not stored. */
  readonly reviewedOverride: boolean;
}

export interface ReconciledObservationGateway {
  record(
    appFixtureId: string,
    request: ReconciledObservationRequest,
    dryRun: boolean,
  ): Promise<RecordedObservation>;
}

/** A refusal or a failure, with a stable code and whether trying again can help. */
export class ReconciledIngestionError extends Error {
  constructor(
    readonly code: string,
    /** True only when nothing about the request is wrong: the call itself failed or timed out. */
    readonly transient: boolean,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ReconciledIngestionError";
  }
}

const KNOWN_REFUSAL = /^(reconciled|adaptive|fantasy)_[a-z_]{3,60}$|^forbidden$/;
/** Serialization failure, deadlock, timeouts, connection and resource errors: the call can be repeated. */
const TRANSIENT_SQLSTATE = /^(40001|40P01|57014|57P0[1-3]|08...|53...)$/;

interface RpcError {
  readonly message?: string;
  readonly code?: string;
  readonly details?: string | null;
}

export interface ReconciledRpcClient {
  schema(name: "api"): {
    rpc(
      fn: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: RpcError | null }>;
  };
}

/** Classify an RPC error. Only the database's own refusal codes are passed on; nothing else is kept. */
export function classifyRpcError(error: RpcError): ReconciledIngestionError {
  const message = error.message ?? "";
  const code = error.code ?? "";
  if (KNOWN_REFUSAL.test(message)) {
    const detail =
      typeof error.details === "string" &&
      /^(sofascore|flashscore):[A-Za-z0-9-]{1,64}$/.test(error.details)
        ? error.details
        : undefined;
    return new ReconciledIngestionError(
      message,
      false,
      `The database refused: ${message}.`,
      detail,
    );
  }
  if (TRANSIENT_SQLSTATE.test(code)) {
    return new ReconciledIngestionError(
      "database_busy",
      true,
      `The database could not finish (SQLSTATE ${code}).`,
    );
  }
  if (code === "PGRST202" || code === "42883") {
    return new ReconciledIngestionError(
      "function_missing",
      false,
      "The database has no reconciled-ingestion function: migration 20261003180000 is not applied.",
    );
  }
  return new ReconciledIngestionError(
    "database_error",
    false,
    `The database answered with an error it does not document${/^[A-Z0-9]{5}$/.test(code) ? ` (SQLSTATE ${code})` : ""}.`,
  );
}

function parseRecorded(data: unknown): RecordedObservation {
  const d = data as Record<string, unknown> | null;
  if (
    !d ||
    (typeof d.observationId !== "string" && typeof d.observationId !== "number") ||
    typeof d.digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(d.digest) ||
    typeof d.fullReady !== "boolean" ||
    typeof d.simpleReady !== "boolean"
  ) {
    throw new ReconciledIngestionError(
      "response_invalid",
      true,
      "The database's answer did not have the expected shape.",
    );
  }
  return {
    observationId: Number(d.observationId),
    digest: d.digest,
    fullReady: d.fullReady,
    simpleReady: d.simpleReady,
    created: d.created === true,
    latest: d.latest !== false,
    dryRun: d.dryRun === true,
    reviewedOverride: d.reviewedOverride === true,
  };
}

export class SupabaseReconciledObservationGateway implements ReconciledObservationGateway {
  constructor(private readonly client: ReconciledRpcClient) {}

  async record(
    appFixtureId: string,
    request: ReconciledObservationRequest,
    dryRun: boolean,
  ): Promise<RecordedObservation> {
    let answer: { data: unknown; error: RpcError | null };
    try {
      answer = await this.client
        .schema("api")
        .rpc("service_record_reconciled_fantasy_observation", {
          p_fixture_id: appFixtureId,
          p_request: request,
          p_dry_run: dryRun,
        });
    } catch {
      // The request may or may not have reached the database. Repeating it is safe.
      throw new ReconciledIngestionError("network_error", true, "The call did not complete.");
    }
    if (answer.error) throw classifyRpcError(answer.error);
    return parseRecorded(answer.data);
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export type IngestionMode = "dry-run" | "record";

export type FixtureOutcome =
  | { readonly status: "blocked"; readonly blockers: readonly Blocker[] }
  | {
      readonly status:
        | "dry-run-ok"
        | "recorded"
        | "already-recorded"
        | "reviewed-correction-in-force";
      readonly result: RecordedObservation;
      readonly attempts: number;
      readonly warnings: readonly string[];
    }
  | {
      readonly status: "refused";
      readonly code: string;
      readonly message: string;
      readonly detail?: string;
      readonly attempts: number;
    }
  /** Every attempt failed in a way that says nothing about the request. Running again is safe. */
  | {
      readonly status: "uncertain";
      readonly code: string;
      readonly message: string;
      readonly attempts: number;
    }
  | { readonly status: "not-attempted"; readonly reason: string };

export interface FixtureReport {
  readonly sofascoreEventId: string;
  readonly flashscoreEventId: string;
  readonly appFixtureId: string;
  readonly requestDigest: string | null;
  readonly outcome: FixtureOutcome;
}

export interface IngestionReport {
  readonly mode: IngestionMode;
  readonly fixtures: readonly FixtureReport[];
  readonly counts: Readonly<Record<string, number>>;
  /** True only when every fixture was dry-run-ok, recorded or already recorded. */
  readonly ok: boolean;
}

export interface RunOptions {
  readonly mode: IngestionMode;
  readonly gateway: ReconciledObservationGateway;
  /** Attempts per fixture for transient failures (default 3, at most 5). */
  readonly maxAttempts?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function ingestReconciledFixtures(
  prepared: readonly PreparedObservation[],
  options: RunOptions,
): Promise<IngestionReport> {
  const maxAttempts = Math.min(Math.max(options.maxAttempts ?? 3, 1), 5);
  const sleep = options.sleep ?? defaultSleep;
  const fixtures: FixtureReport[] = [];
  let stopAll: string | null = null;

  for (const p of prepared) {
    const head = {
      sofascoreEventId: p.sofascoreEventId,
      flashscoreEventId: p.flashscoreEventId,
      appFixtureId: p.appFixtureId,
      requestDigest: p.requestDigest,
    };
    if (!p.request) {
      fixtures.push({ ...head, outcome: { status: "blocked", blockers: p.blockers } });
      continue;
    }
    if (stopAll) {
      fixtures.push({ ...head, outcome: { status: "not-attempted", reason: stopAll } });
      continue;
    }
    let attempts = 0;
    let outcome: FixtureOutcome | null = null;
    while (outcome === null) {
      attempts++;
      try {
        const result = await options.gateway.record(
          p.appFixtureId,
          p.request,
          options.mode === "dry-run",
        );
        const warnings: string[] = [];
        if (!result.latest && !result.reviewedOverride)
          warnings.push(
            "A newer observation exists for this fixture; it is the one scored, not this one.",
          );
        if (!result.simpleReady)
          warnings.push(
            "Stored, but the database does not consider it scorable yet (simpleReady is false).",
          );
        if (options.mode === "dry-run" && !result.dryRun)
          throw new ReconciledIngestionError(
            "dry_run_not_honoured",
            false,
            "The database did not confirm the dry run.",
          );
        const status = result.reviewedOverride
          ? "reviewed-correction-in-force"
          : options.mode === "dry-run"
            ? "dry-run-ok"
            : result.created
              ? "recorded"
              : "already-recorded";
        outcome = { status, result, attempts, warnings };
      } catch (error) {
        const e =
          error instanceof ReconciledIngestionError
            ? error
            : new ReconciledIngestionError(
                "client_error",
                false,
                "The client failed before sending.",
              );
        if (e.transient && attempts < maxAttempts) {
          await sleep(500 * 2 ** (attempts - 1));
          continue;
        }
        outcome = e.transient
          ? { status: "uncertain", code: e.code, message: e.message, attempts }
          : {
              status: "refused",
              code: e.code,
              message: e.message,
              attempts,
              ...(e.detail ? { detail: e.detail } : {}),
            };
        // These refusals will be the same for every fixture: stop instead of repeating them.
        if (["forbidden", "function_missing", "dry_run_not_honoured"].includes(e.code)) {
          stopAll = `Stopped after ${e.code} on an earlier fixture.`;
        }
      }
    }
    fixtures.push({ ...head, outcome });
  }

  const counts: Record<string, number> = {};
  for (const f of fixtures) counts[f.outcome.status] = (counts[f.outcome.status] ?? 0) + 1;
  return {
    mode: options.mode,
    fixtures,
    counts,
    ok: fixtures.every((f) =>
      ["dry-run-ok", "recorded", "already-recorded"].includes(f.outcome.status),
    ),
  };
}
