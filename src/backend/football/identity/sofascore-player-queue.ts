import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { MappingRpcClient } from "./mapping-repository";

/**
 * The SofaScore players the automatic matcher could not match safely, and the
 * writes staff can make on them: say which BotolaGO player is the right one
 * (an offered candidate or any catalog player found by search), link the id as
 * a second SofaScore id of a player who already has one, or create the player
 * from SofaScore (migration 20261014170000).
 *
 * Every call is a trusted database function that authorises the caller again
 * (staff, AAL2, `football.read_operations` or `football.manage_mappings` to
 * read; `football.manage_mappings` to write). Nothing here decides who may do
 * what; this file only reads what the database sends back, strictly, and turns
 * a refusal into a stable code. A row that does not have the expected shape is
 * dropped and counted, never guessed at and never allowed to crash the page.
 */

export const SOFASCORE_QUEUE_REASONS = [
  // Current: the matcher decides by club, shirt number and position (migration 20261013150000).
  "ambiguous_shirt",
  "no_shirt",
  "no_shirt_on_file",
  "shirt_conflict",
  "weak_match",
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
  // 20261014170000: second ids and creating a player.
  "sofascore_alias_needs_primary",
  "sofascore_alias_conflict",
  "sofascore_create_no_club",
  "sofascore_create_season_not_current",
  "sofascore_create_position_required",
  "sofascore_create_name_invalid",
  "sofascore_create_shirt_invalid",
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

const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QueuePosition = "goalkeeper" | "defender" | "midfielder" | "forward";
export const QUEUE_POSITIONS = ["goalkeeper", "defender", "midfielder", "forward"] as const;
const POSITIONS = QUEUE_POSITIONS;

export interface QueueCandidate {
  readonly playerId: string;
  readonly fullName: string | null;
  readonly displayName: string | null;
  readonly position: QueuePosition | null;
  readonly shirtNumber: number | null;
  /** The SofaScore id this BotolaGO player is already mapped to, or null. */
  readonly mappedToSofascoreId: string | null;
  /** Whether that main link is active (null when unknown): only an active one can take a second id. */
  readonly mappedActive: boolean | null;
  /** His second SofaScore ids, if any. */
  readonly sofascoreAliasIds: readonly string[];
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
  /** The database says "create this player" can be offered (a club, a position, a current season). */
  readonly canCreate: boolean;
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

const optionalBoolean = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "boolean" ? v : null));
const idList = z
  .unknown()
  .optional()
  .transform((v): string[] =>
    Array.isArray(v)
      ? [
          ...new Set(
            v
              .filter((x) => typeof x === "string" || typeof x === "number")
              .map((x) => String(x).trim())
              .filter((x) => x !== ""),
          ),
        ]
      : [],
  );

const candidateSchema = z.object({
  playerId: text,
  fullName: optionalText,
  displayName: optionalText,
  position: optionalPosition,
  shirtNumber: optionalInt,
  mappedToSofascoreId: optionalText,
  mappedActive: optionalBoolean,
  sofascoreAliasIds: idList,
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
  canCreate: z
    .unknown()
    .optional()
    .transform((v) => v === true),
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

/** A catalog player staff can link a list entry to (the club squad, or a name search). */
export interface LinkOption {
  readonly playerId: string;
  readonly fullName: string | null;
  readonly displayName: string | null;
  readonly position: QueuePosition | null;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly shirtNumber: number | null;
  /** A member of the entry's club this season. */
  readonly inClub: boolean;
  /** His main SofaScore id, or null when he has none. */
  readonly sofascoreId: string | null;
  readonly sofascoreActive: boolean | null;
  readonly sofascoreAliasIds: readonly string[];
}

/** What staff can do with one option: link it, link as a second id, or nothing. */
export type LinkOptionAction = "link" | "alias" | "none";
export function linkOptionAction(option: {
  readonly sofascoreId: string | null;
  readonly sofascoreActive: boolean | null;
}): LinkOptionAction {
  if (option.sofascoreId === null) return "link";
  return option.sofascoreActive === true ? "alias" : "none";
}

export interface LinkOptions {
  readonly sofascorePlayerId: string;
  readonly query: string | null;
  readonly players: readonly LinkOption[];
  readonly skipped: number;
}

const optionSchema = z.object({
  playerId: text,
  fullName: optionalText,
  displayName: optionalText,
  position: optionalPosition,
  teamId: optionalText,
  teamName: optionalText,
  shirtNumber: optionalInt,
  inClub: z
    .unknown()
    .optional()
    .transform((v) => v === true),
  sofascoreId: optionalText,
  sofascoreActive: optionalBoolean,
  sofascoreAliasIds: idList,
});

/** Reads the options for the entry that was asked about; anything else is "unavailable". */
export function parseLinkOptions(raw: unknown, asked: string): LinkOptions {
  const shape = z
    .object({
      sofascorePlayerId: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
      query: optionalText,
      players: z.array(z.unknown()),
    })
    .safeParse(raw);
  if (!shape.success || shape.data.sofascorePlayerId !== asked) {
    throw new SofascoreQueueError("queue_unavailable", "The options answer was not understood.");
  }
  const players: LinkOption[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const item of shape.data.players) {
    const option = optionSchema.safeParse(item);
    if (!option.success || seen.has(option.data.playerId)) {
      skipped += 1;
      continue;
    }
    seen.add(option.data.playerId);
    players.push(option.data);
  }
  return { sofascorePlayerId: asked, query: shape.data.query, players, skipped };
}

export interface AliasResult {
  readonly sofascorePlayerId: string;
  readonly playerId: string;
  readonly primarySofascoreId: string | null;
  readonly alreadyLinked: boolean;
}

/** The answer of "link as second ID" must name the pair that was asked for. */
export function parseAliasResult(
  raw: unknown,
  asked: { readonly sofascorePlayerId: string; readonly playerId: string },
): AliasResult {
  const parsed = z
    .object({
      sofascorePlayerId: z.string().min(1),
      playerId: z.string().min(1),
      primarySofascoreId: z.string().nullish(),
      alreadyLinked: z.boolean(),
    })
    .safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.sofascorePlayerId !== asked.sofascorePlayerId ||
    parsed.data.playerId.toLowerCase() !== asked.playerId.toLowerCase()
  ) {
    throw new SofascoreQueueError("queue_unavailable", "The link answer was not understood.");
  }
  return { ...parsed.data, primarySofascoreId: parsed.data.primarySofascoreId ?? null };
}

/** What staff may correct before creating; anything left out is the list entry's own value. */
export interface CreatePlayerInput {
  readonly name?: string;
  readonly shirtNumber?: number;
  readonly position?: QueuePosition;
}

export interface CreateResult {
  readonly sofascorePlayerId: string;
  readonly playerId: string;
  readonly created: boolean;
}

/** The answer of "create this player" must name the id that was asked for and a new player. */
export function parseCreateResult(raw: unknown, asked: string): CreateResult {
  const parsed = z
    .object({
      sofascorePlayerId: z.string().min(1),
      playerId: z.string().regex(UUID_ANY),
      created: z.literal(true),
    })
    .safeParse(raw);
  if (!parsed.success || parsed.data.sofascorePlayerId !== asked) {
    throw new SofascoreQueueError("queue_unavailable", "The creation answer was not understood.");
  }
  return parsed.data;
}

/**
 * Checks a creation request the way the database does, so a malformed one
 * never leaves the browser. Returns the RPC arguments.
 */
export function createPlayerArgs(
  sofascorePlayerId: string,
  input: CreatePlayerInput,
): Record<string, unknown> {
  const name = input.name?.trim();
  if (
    !validSofascoreId(sofascorePlayerId) ||
    (name !== undefined && (name.length < 2 || name.length > 200)) ||
    (input.shirtNumber !== undefined &&
      (!Number.isInteger(input.shirtNumber) || input.shirtNumber < 0 || input.shirtNumber > 99)) ||
    (input.position !== undefined && !(POSITIONS as readonly string[]).includes(input.position))
  ) {
    throw new SofascoreQueueError("invalid_resolution", "The creation request is invalid.");
  }
  return {
    p_sofascore_player_id: sofascorePlayerId,
    ...(name !== undefined ? { p_name: name } : {}),
    ...(input.shirtNumber !== undefined ? { p_shirt_number: input.shirtNumber } : {}),
    ...(input.position !== undefined ? { p_position: input.position } : {}),
  };
}

const validSofascoreId = (id: string) => id !== "" && id === id.trim() && id.length <= 200;

export interface SofascorePlayerQueueRepository {
  listQueue(signal?: AbortSignal): Promise<ParsedQueue>;
  resolve(sofascorePlayerId: string, playerId: string): Promise<ResolveResult>;
  /** The club squad (no query) or the catalog by name (2 to 80 characters). */
  listOptions(sofascorePlayerId: string, query?: string): Promise<LinkOptions>;
  linkAlias(sofascorePlayerId: string, playerId: string): Promise<AliasResult>;
  createPlayer(sofascorePlayerId: string, input: CreatePlayerInput): Promise<CreateResult>;
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

  async listOptions(sofascorePlayerId: string, query?: string): Promise<LinkOptions> {
    const q = query?.trim() ?? "";
    if (!validSofascoreId(sofascorePlayerId) || (q !== "" && (q.length < 2 || q.length > 80))) {
      throw new SofascoreQueueError("invalid_resolution", "The search is invalid.");
    }
    const data = await this.call("admin_sofascore_player_link_options", {
      p_sofascore_player_id: sofascorePlayerId,
      p_query: q === "" ? null : q,
    });
    return parseLinkOptions(data, sofascorePlayerId);
  }

  async linkAlias(sofascorePlayerId: string, playerId: string): Promise<AliasResult> {
    if (!validSofascoreId(sofascorePlayerId) || !UUID.test(playerId)) {
      throw new SofascoreQueueError("invalid_resolution", "The link request is invalid.");
    }
    const data = await this.call("admin_sofascore_link_alias", {
      p_sofascore_player_id: sofascorePlayerId,
      p_player_id: playerId,
    });
    return parseAliasResult(data, { sofascorePlayerId, playerId });
  }

  async createPlayer(sofascorePlayerId: string, input: CreatePlayerInput): Promise<CreateResult> {
    const args = createPlayerArgs(sofascorePlayerId, input);
    const data = await this.call("admin_sofascore_create_player", args);
    return parseCreateResult(data, sofascorePlayerId);
  }
}
