import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { MappingRpcClient } from "./mapping-repository";

/**
 * The SofaScore players the automatic matcher could not match safely, and the
 * one write staff can make on them: say which BotolaGO player is the right one.
 *
 * Both calls are trusted database functions that authorise the caller again
 * (staff, AAL2, `football.read_operations` or `football.manage_mappings` to
 * read; `football.manage_mappings` to confirm). Nothing here decides who may do
 * what; this file only reads what the database sends back, strictly, and turns
 * a refusal into a stable code. A row that does not have the expected shape is
 * dropped and counted, never guessed at and never allowed to crash the page.
 */

export const SOFASCORE_QUEUE_REASONS = [
  // Current: the matcher decides by side + shirt number + position (migration 20261013150000).
  "awaiting_second_match",
  "ambiguous_shirt",
  "no_shirt",
  "shirt_conflict",
  "no_candidate",
  "candidate_already_mapped",
  "inactive_mapping_exists",
  "position_mismatch",
  // Legacy: queued by the name-based matcher; kept valid until the player is next seen.
  "ambiguous_name",
  "partial_name",
  "duplicate_name_in_squad",
] as const;
export type SofascoreQueueReason = (typeof SOFASCORE_QUEUE_REASONS)[number];

export const SOFASCORE_QUEUE_ERROR_CODES = [
  "queue_entry_not_found",
  "queue_entry_already_resolved",
  "player_not_found",
  "sofascore_mapping_conflict",
  "invalid_resolution",
  "staff_access_denied",
  "staff_suspended",
  "permission_missing",
  "mfa_assurance_insufficient",
  "recent_auth_required",
] as const;
export type SofascoreQueueErrorCode =
  | (typeof SOFASCORE_QUEUE_ERROR_CODES)[number]
  | "queue_unavailable";

export class SofascoreQueueError extends Error {
  constructor(
    readonly code: SofascoreQueueErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "SofascoreQueueError";
  }
}

/** PostgREST / Postgres error to a stable code; anything unknown is "unavailable", never guessed. */
export function mapSofascoreQueueError(error: unknown): SofascoreQueueError {
  if (error instanceof SofascoreQueueError) return error;
  const source = error as { message?: string; details?: string; code?: string } | null;
  const text = `${source?.message ?? ""} ${source?.details ?? ""}`.toLowerCase();
  const code = SOFASCORE_QUEUE_ERROR_CODES.find((candidate) => text.includes(candidate));
  if (code)
    return new SofascoreQueueError(code, `The service refused the request: ${code}.`, error);
  const raw = `${source?.code ?? ""}`.toUpperCase();
  if (raw === "PT401" || raw === "42501") {
    return new SofascoreQueueError("staff_access_denied", "Staff access is denied.", error);
  }
  return new SofascoreQueueError("queue_unavailable", "The service is unavailable.", error);
}

export type QueuePosition = "goalkeeper" | "defender" | "midfielder" | "forward";
const POSITIONS = ["goalkeeper", "defender", "midfielder", "forward"] as const;

export interface QueueCandidate {
  readonly playerId: string;
  readonly fullName: string | null;
  readonly displayName: string | null;
  readonly position: QueuePosition | null;
  readonly shirtNumber: number | null;
  /** The SofaScore id this BotolaGO player is already mapped to, or null. */
  readonly mappedToSofascoreId: string | null;
}

export interface QueueEntry {
  readonly sofascorePlayerId: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly shirtNumber: number | null;
  readonly position: QueuePosition | null;
  readonly side: "home" | "away" | null;
  /** One of SOFASCORE_QUEUE_REASONS; an unknown value is kept and shown with a generic sentence. */
  readonly reason: string;
  readonly fixtureId: string | null;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly firstSeenAt: string | null;
  readonly lastSeenAt: string | null;
  readonly timesSeen: number;
  readonly candidates: readonly QueueCandidate[];
}

export interface ParsedQueue {
  readonly entries: readonly QueueEntry[];
  /** Rows the database sent that did not have the expected shape and were left out. */
  readonly skipped: number;
}

const text = z.string().trim().min(1);
const optionalText = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined) return null;
    const asText = String(value).trim();
    return asText === "" ? null : asText;
  });
const optionalInt = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isInteger(n) && n >= 0 && n < 1000 ? n : null;
  });
const optionalPosition = z
  .unknown()
  .optional()
  .transform((value): QueuePosition | null =>
    typeof value === "string" && (POSITIONS as readonly string[]).includes(value)
      ? (value as QueuePosition)
      : null,
  );
const optionalDate = z
  .unknown()
  .optional()
  .transform((value) =>
    typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? value : null,
  );

const candidateSchema = z.object({
  playerId: text,
  fullName: optionalText,
  displayName: optionalText,
  position: optionalPosition,
  shirtNumber: optionalInt,
  mappedToSofascoreId: optionalText,
});

const entrySchema = z.object({
  sofascorePlayerId: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  name: text,
  shortName: optionalText,
  shirtNumber: optionalInt,
  position: optionalPosition,
  side: z
    .unknown()
    .optional()
    .transform((v) => (v === "home" || v === "away" ? v : null)),
  reason: text,
  fixtureId: optionalText,
  teamId: optionalText,
  teamName: optionalText,
  firstSeenAt: optionalDate,
  lastSeenAt: optionalDate,
  timesSeen: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : 1)),
  candidates: z.array(z.unknown()),
});

/** Reads the queue strictly: a row that is not an object with an id, a name and a reason is skipped. */
export function parseSofascoreQueue(raw: unknown): ParsedQueue {
  if (raw === null || raw === undefined) return { entries: [], skipped: 0 };
  if (!Array.isArray(raw)) {
    throw new SofascoreQueueError("queue_unavailable", "The queue was not a list.");
  }
  const entries: QueueEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of raw) {
    const parsed = entrySchema.safeParse(row);
    if (
      !parsed.success ||
      parsed.data.sofascorePlayerId === "" ||
      seen.has(parsed.data.sofascorePlayerId)
    ) {
      skipped += 1;
      continue;
    }
    seen.add(parsed.data.sofascorePlayerId);
    const candidates: QueueCandidate[] = [];
    const candidateIds = new Set<string>();
    for (const item of parsed.data.candidates) {
      const candidate = candidateSchema.safeParse(item);
      // A candidate that cannot be named by id cannot be confirmed, so it is not offered.
      if (!candidate.success || candidateIds.has(candidate.data.playerId)) continue;
      candidateIds.add(candidate.data.playerId);
      candidates.push(candidate.data);
    }
    entries.push({ ...parsed.data, candidates });
  }
  return { entries, skipped };
}

export interface ResolveResult {
  readonly sofascorePlayerId: string;
  readonly playerId: string;
  readonly mappingId: string | null;
  readonly alreadyResolved: boolean;
}

const resolveSchema = z.object({
  sofascorePlayerId: z.string().min(1),
  playerId: z.string().min(1),
  mappingId: z.string().nullish(),
  alreadyResolved: z.boolean(),
});

/**
 * Reads the answer of a confirmation. It must name the very pair that was asked
 * for: anything else is reported as unavailable and never as a success.
 */
export function parseResolveResult(
  raw: unknown,
  asked: { readonly sofascorePlayerId: string; readonly playerId: string },
): ResolveResult {
  const parsed = resolveSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.sofascorePlayerId !== asked.sofascorePlayerId ||
    parsed.data.playerId.toLowerCase() !== asked.playerId.toLowerCase()
  ) {
    throw new SofascoreQueueError(
      "queue_unavailable",
      "The confirmation answer was not understood.",
    );
  }
  return { ...parsed.data, mappingId: parsed.data.mappingId ?? null };
}

export interface SofascorePlayerQueueRepository {
  listQueue(signal?: AbortSignal): Promise<ParsedQueue>;
  resolve(sofascorePlayerId: string, playerId: string): Promise<ResolveResult>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SupabaseSofascorePlayerQueueRepository implements SofascorePlayerQueueRepository {
  constructor(private readonly api: MappingRpcClient) {}

  private async call(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    const request = this.api.rpc(name, args);
    const { data, error }: { data: unknown; error: PostgrestError | null } = await (signal &&
    request.abortSignal
      ? request.abortSignal(signal)
      : request);
    if (error) throw mapSofascoreQueueError(error);
    return data;
  }

  async listQueue(signal?: AbortSignal): Promise<ParsedQueue> {
    return parseSofascoreQueue(await this.call("admin_sofascore_player_match_queue", {}, signal));
  }

  async resolve(sofascorePlayerId: string, playerId: string): Promise<ResolveResult> {
    // Same checks the database makes, so a malformed request never leaves the browser.
    if (
      sofascorePlayerId === "" ||
      sofascorePlayerId !== sofascorePlayerId.trim() ||
      sofascorePlayerId.length > 200 ||
      !UUID.test(playerId)
    ) {
      throw new SofascoreQueueError("invalid_resolution", "The confirmation request is invalid.");
    }
    const data = await this.call("admin_resolve_sofascore_player_match", {
      p_sofascore_player_id: sofascorePlayerId,
      p_player_id: playerId,
    });
    return parseResolveResult(data, { sofascorePlayerId, playerId });
  }
}
