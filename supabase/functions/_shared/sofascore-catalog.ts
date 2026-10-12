// Weekly refresh of clubs and players from SofaScore: the `catalog_weekly` job
// of the football-live-refresh Edge Function. Documentation:
// docs/backend/SOFASCORE_CATALOG_AND_STANDINGS.md.
//
// What it does, per run:
//   1. Reads which clubs and players already have an active SofaScore mapping
//      (api.football_sofascore_catalog_snapshot).
//   2. For every such club, reads the squad (`teams/get-squad`) and updates only
//      fields of players that ALREADY have a SofaScore mapping: display name,
//      shirt number, and (only if switched on) position. A SofaScore player with
//      no mapping is listed in the output and the log. Nothing is created and
//      nothing is matched by name: the only key is the SofaScore id.
//   3. Copies a bounded number of club crests (and, if switched on, player
//      images) into our own storage bucket, only when the image changed.
//
// `shadow` reads the squads and logs the changes it would make; it downloads
// no image and writes nothing. `sofascore` also writes.
//
// Every SofaScore request goes through the RapidAPI client. Images are not
// JSON, so `createCatalogRapidClient` wraps the client's `fetch` to keep the
// bytes of an image reply; the client itself (quota floor, retries, timeout,
// key handling) is used unchanged.
//
// Dependency-free apart from sibling shared modules (Bun tests, Deno runtime).

import {
  createRapidApiClient,
  RapidApiError,
  type RapidApiResult,
  type RapidApiRuntime,
} from "./rapidapi-client.ts";
import type { SofascoreShadowClient } from "./sofascore-fixtures.ts";
import type { FixtureRpcClient } from "./sportsmonks-fixtures.ts";

// Endpoint names follow the style of the ones already in use
// (`teams/get-squad`, `matches/get-lineups`). The two image endpoints below
// have not been called from this repository yet: confirm them on the RapidAPI
// 'sofascore' host before the first sofascore-mode run (the doc says how).
export const squadPath = (teamId: string): string => `teams/get-squad?teamId=${teamId}`;
export const teamLogoPath = (teamId: string): string => `teams/get-logo?teamId=${teamId}`;
export const playerImagePath = (playerId: string): string =>
  `players/get-image?playerId=${playerId}`;

export const CATALOG_BUCKET = "football-media";
export const MAX_IMAGE_BYTES = 2_000_000;
export const MIN_IMAGE_BYTES = 100;
export const IMAGE_LIMIT_DEFAULT = 40;
export const IMAGE_LIMIT_MAX = 120;
export const TIME_BUDGET_DEFAULT_MS = 100_000;
export const TIME_BUDGET_MAX_MS = 300_000;
/** A club or player SofaScore had no image for is asked again after this long. */
export const MISSING_RETRY_MS = 30 * 24 * 60 * 60 * 1000;
/** A failed fetch is asked again after this long. */
export const FAILED_RETRY_MS = 24 * 60 * 60 * 1000;
/** An image already stored is checked for a change at most this often. */
export const RECHECK_AFTER_MS = 28 * 24 * 60 * 60 * 1000;
const UNMAPPED_LOG_LIMIT = 300;
const UNMAPPED_BODY_LIMIT = 50;
const APPLY_CHUNK = 200;

export type PlayerPosition = "goalkeeper" | "defender" | "midfielder" | "forward";
const POSITIONS: Readonly<Record<string, PlayerPosition>> = {
  G: "goalkeeper",
  D: "defender",
  M: "midfielder",
  F: "forward",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------------------
// Squad parsing and the update plan (pure)
// ---------------------------------------------------------------------------

export interface SquadPlayer {
  readonly sofascoreId: string;
  readonly name: string | null;
  readonly position: PlayerPosition | null;
  readonly shirtNumber: number | null;
}

/** Players of `teams/get-squad`. Null when the reply is not a squad at all. */
export function parseSquad(payload: unknown): SquadPlayer[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.players)) return null;
  const seen = new Set<string>();
  const players: SquadPlayer[] = [];
  for (const entry of payload.players) {
    const player = isRecord(entry) && isRecord(entry.player) ? entry.player : null;
    const id =
      player && typeof player.id === "number" && Number.isSafeInteger(player.id) && player.id > 0
        ? String(player.id)
        : null;
    if (!player || !id || seen.has(id)) continue;
    seen.add(id);
    const shirt = [player.shirtNumber, player.jerseyNumber].find(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99,
    );
    const name = typeof player.name === "string" ? player.name.trim() : "";
    players.push({
      sofascoreId: id,
      name: name.length >= 2 && name.length <= 120 ? name : null,
      position: typeof player.position === "string" ? (POSITIONS[player.position] ?? null) : null,
      shirtNumber: shirt ?? null,
    });
  }
  return players;
}

export interface MappedPlayerState {
  readonly playerId: string;
  readonly sofascoreId: string;
  readonly displayName: string;
  readonly position: string;
  readonly teamSofascoreId: string | null;
  readonly shirtNumber: number | null;
}

export interface PlayerUpdate {
  readonly sofascoreId: string;
  readonly teamSofascoreId: string;
  readonly displayName?: string;
  readonly position?: PlayerPosition;
  readonly shirtNumber?: number;
}

export interface UnmappedPlayer {
  readonly sofascoreId: string;
  readonly teamSofascoreId: string;
  readonly name: string | null;
  readonly position: PlayerPosition | null;
  readonly shirtNumber: number | null;
}

export interface UpdateSwitches {
  readonly names: boolean;
  readonly positions: boolean;
  readonly shirts: boolean;
}

export interface UpdatePlan {
  readonly updates: readonly PlayerUpdate[];
  readonly unmapped: readonly UnmappedPlayer[];
  /** Mapped players seen in the squad whose fields already match. */
  readonly unchanged: number;
}

/**
 * Squad against the mapped players, by SofaScore id ONLY. A player id absent
 * from `mapped` is reported as unmapped and never becomes an update, whatever
 * its name looks like.
 */
export function planPlayerUpdates(
  squad: readonly SquadPlayer[],
  teamSofascoreId: string,
  mapped: ReadonlyMap<string, MappedPlayerState>,
  switches: UpdateSwitches,
): UpdatePlan {
  const updates: PlayerUpdate[] = [];
  const unmapped: UnmappedPlayer[] = [];
  let unchanged = 0;
  for (const player of squad) {
    const current = mapped.get(player.sofascoreId);
    if (!current) {
      unmapped.push({
        sofascoreId: player.sofascoreId,
        teamSofascoreId,
        name: player.name,
        position: player.position,
        shirtNumber: player.shirtNumber,
      });
      continue;
    }
    const update: {
      sofascoreId: string;
      teamSofascoreId: string;
      displayName?: string;
      position?: PlayerPosition;
      shirtNumber?: number;
    } = { sofascoreId: player.sofascoreId, teamSofascoreId };
    let changed = false;
    if (switches.names && player.name !== null && player.name !== current.displayName) {
      update.displayName = player.name;
      changed = true;
    }
    if (switches.positions && player.position !== null && player.position !== current.position) {
      update.position = player.position;
      changed = true;
    }
    if (
      switches.shirts &&
      player.shirtNumber !== null &&
      // Only at the club our database has the player at: a shirt number at
      // another club is not this club's membership to change.
      current.teamSofascoreId === teamSofascoreId &&
      player.shirtNumber !== current.shirtNumber
    ) {
      update.shirtNumber = player.shirtNumber;
      changed = true;
    }
    if (changed) updates.push(update);
    else unchanged += 1;
  }
  return { updates, unmapped, unchanged };
}

// ---------------------------------------------------------------------------
// Images (pure parts)
// ---------------------------------------------------------------------------

export type ImageEntity = "team" | "player";

export interface ImageState {
  readonly entityType: ImageEntity;
  readonly sofascoreId: string;
  readonly sha256: string | null;
  readonly storagePath: string | null;
  readonly status: string;
  readonly failureCount: number;
  readonly checkedAt: string;
}

export interface ImageCandidate {
  readonly entityType: ImageEntity;
  readonly sofascoreId: string;
}

const stateKey = (entityType: string, sofascoreId: string) => `${entityType}:${sofascoreId}`;

/**
 * Which images to fetch this run, at most `limit`. Never-fetched first (clubs
 * before players), then the longest unchecked, so a run that stops at its
 * limit continues the next week where it stopped. An image already stored is
 * checked again after 28 days, one SofaScore did not have after 30 days, a
 * failed one after a day.
 */
export function selectImageWork(
  candidates: readonly ImageCandidate[],
  states: readonly ImageState[],
  limit: number,
  now: Date,
): ImageCandidate[] {
  const byKey = new Map(
    states.map((state) => [stateKey(state.entityType, state.sofascoreId), state]),
  );
  const due: { candidate: ImageCandidate; never: boolean; checked: number }[] = [];
  for (const candidate of candidates) {
    const state = byKey.get(stateKey(candidate.entityType, candidate.sofascoreId));
    if (!state) {
      due.push({ candidate, never: true, checked: 0 });
      continue;
    }
    const checked = Date.parse(state.checkedAt);
    const age = Number.isFinite(checked) ? now.getTime() - checked : Number.POSITIVE_INFINITY;
    if (state.sha256 === null && state.status === "missing" && age < MISSING_RETRY_MS) continue;
    if (state.sha256 === null && state.status === "failed" && age < FAILED_RETRY_MS) continue;
    if (state.sha256 !== null && age < RECHECK_AFTER_MS) continue;
    due.push({
      candidate,
      never: state.sha256 === null,
      checked: Number.isFinite(checked) ? checked : 0,
    });
  }
  due.sort(
    (a, b) =>
      Number(b.never) - Number(a.never) ||
      (a.candidate.entityType === b.candidate.entityType
        ? 0
        : a.candidate.entityType === "team"
          ? -1
          : 1) ||
      a.checked - b.checked ||
      a.candidate.sofascoreId.localeCompare(b.candidate.sofascoreId, "en", { numeric: true }),
  );
  return due.slice(0, Math.max(0, limit)).map((item) => item.candidate);
}

export type ImageChange = "new" | "changed" | "unchanged";

/** Compare the hash of the downloaded bytes with the one stored last time. */
export function detectImageChange(previousSha256: string | null, newSha256: string): ImageChange {
  if (previousSha256 === null) return "new";
  return previousSha256 === newSha256 ? "unchanged" : "changed";
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

export interface SniffedImage {
  readonly mime: "image/png" | "image/jpeg" | "image/webp";
  readonly extension: "png" | "jpg" | "webp";
}

/** The image type from the file's first bytes; what the server says is not trusted. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < MIN_IMAGE_BYTES || bytes.length > MAX_IMAGE_BYTES) return null;
  const at = (index: number) => bytes[index];
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    return { mime: "image/png", extension: "png" };
  }
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

/** The storage path (inside `football-media`). The hash makes a changed image a new path. */
export function imageStoragePath(
  entityType: ImageEntity,
  sofascoreId: string,
  sha256: string,
  extension: string,
): string {
  const short = sha256.slice(0, 12);
  return entityType === "team"
    ? `football/sofascore/teams/${sofascoreId}/crest-${short}.${extension}`
    : `football/sofascore/players/${sofascoreId}/photo-${short}.${extension}`;
}

// ---------------------------------------------------------------------------
// The client: RapidAPI client, plus image bytes
// ---------------------------------------------------------------------------

export interface ImageReply {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface CatalogRapidClient extends SofascoreShadowClient {
  /** The bytes of an image endpoint. Throws RapidApiError like getJson does. */
  getImage(pathAndQuery: string): Promise<ImageReply>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const IMAGE_PATH = /\/(teams\/get-logo|players\/get-image)\?/;

/**
 * A RapidAPI client that can also return image bytes. It IS the RapidAPI
 * client (`createRapidApiClient`): same key handling, quota floor, retries and
 * timeout. Only the `fetch` handed to it is wrapped, to keep the bytes of an
 * image reply; the client then fails to parse them as JSON, which `getImage`
 * expects and turns into the bytes. A JSON reply from an image endpoint (an
 * error body) is not an image and is an error.
 */
export function createCatalogRapidClient(
  environment: Readonly<Record<string, string | undefined>>,
  baseFetch?: FetchLike,
  overrides: { readonly runtime?: RapidApiRuntime } = {},
): CatalogRapidClient {
  const send: FetchLike = baseFetch ?? ((input, init) => globalThis.fetch(input, init));
  let captured: ImageReply | null = null;
  const client = createRapidApiClient("sofascore", environment, {
    ...overrides,
    fetch: async (input, init) => {
      const response = await send(input, init);
      if (IMAGE_PATH.test(input)) {
        const contentType = response.headers.get("content-type") ?? "";
        if (response.ok && contentType.toLowerCase().startsWith("image/")) {
          captured = {
            bytes: new Uint8Array(await response.clone().arrayBuffer()),
            contentType,
          };
        }
      }
      return response;
    },
  });
  return {
    getJson: (path) => client.getJson(path),
    async getImage(path) {
      captured = null;
      try {
        await client.getJson(path);
      } catch (error) {
        const reply: ImageReply | null = captured;
        if (reply && error instanceof RapidApiError && error.code === "invalid_provider_payload") {
          return reply;
        }
        throw error;
      }
      throw new RapidApiError("invalid_provider_payload", `The reply for ${path} is not an image.`);
    },
  };
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

export interface CatalogStorage {
  from(bucket: string): {
    upload(
      path: string,
      body: Uint8Array,
      options: { contentType: string; upsert: boolean; cacheControl: string },
    ): Promise<{ error: { readonly message?: string } | null }>;
    remove(paths: string[]): Promise<{ error: { readonly message?: string } | null }>;
  };
}

export interface CatalogWeeklyDependencies {
  readonly mode: "sofascore" | "shadow";
  readonly client: FixtureRpcClient;
  readonly rapid: SofascoreShadowClient & { getImage?: CatalogRapidClient["getImage"] };
  readonly storage?: CatalogStorage;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly now: Date;
  readonly log?: (line: string) => void;
}

export interface CatalogOutcome {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

interface CatalogSnapshot {
  readonly teams: readonly { sofascoreId: string; crestCurated: boolean }[];
  readonly players: readonly MappedPlayerState[];
  readonly images: readonly ImageState[];
}

function parseCatalogSnapshot(data: unknown): CatalogSnapshot | null {
  if (!isRecord(data)) return null;
  if (!Array.isArray(data.teams) || !Array.isArray(data.players) || !Array.isArray(data.images)) {
    return null;
  }
  const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
  const teams: { sofascoreId: string; crestCurated: boolean }[] = [];
  for (const row of data.teams) {
    if (isRecord(row) && text(row.sofascoreId)) {
      teams.push({
        sofascoreId: row.sofascoreId as string,
        crestCurated: row.crestCurated === true,
      });
    }
  }
  const players: MappedPlayerState[] = [];
  for (const row of data.players) {
    if (!isRecord(row) || !text(row.sofascoreId) || !text(row.playerId)) continue;
    players.push({
      playerId: row.playerId as string,
      sofascoreId: row.sofascoreId as string,
      displayName: text(row.displayName) ?? "",
      position: text(row.position) ?? "",
      teamSofascoreId: text(row.teamSofascoreId),
      shirtNumber: typeof row.shirtNumber === "number" ? row.shirtNumber : null,
    });
  }
  const images: ImageState[] = [];
  for (const row of data.images) {
    if (!isRecord(row) || !text(row.sofascoreId)) continue;
    if (row.entityType !== "team" && row.entityType !== "player") continue;
    images.push({
      entityType: row.entityType,
      sofascoreId: row.sofascoreId as string,
      sha256: text(row.sha256),
      storagePath: text(row.storagePath),
      status: text(row.status) ?? "stored",
      failureCount: typeof row.failureCount === "number" ? row.failureCount : 0,
      checkedAt: text(row.checkedAt) ?? new Date(0).toISOString(),
    });
  }
  return { teams, players, images };
}

function boundedInt(value: string | undefined, fallback: number, max: number): number {
  const raw = value?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : fallback;
}

const flag = (value: string | undefined, fallback: boolean): boolean => {
  const raw = value?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
};

interface ImageTally {
  candidates: number;
  attempted: number;
  stored: number;
  unchanged: number;
  missing: number;
  failed: number;
  linkedCrests: number;
  requests: number;
  stoppedBy: string | null;
}

export async function runCatalogWeekly(
  dependencies: CatalogWeeklyDependencies,
): Promise<CatalogOutcome> {
  const { mode, client, rapid, storage, environment, now } = dependencies;
  const log = dependencies.log ?? ((line: string) => console.log(line));
  const job = "catalog_weekly";
  const started = Date.now();
  const budgetMs = boundedInt(
    environment.SOFASCORE_CATALOG_TIME_BUDGET_MS,
    TIME_BUDGET_DEFAULT_MS,
    TIME_BUDGET_MAX_MS,
  );
  const overBudget = () => Date.now() - started > budgetMs;
  const switches: UpdateSwitches = {
    names: flag(environment.SOFASCORE_CATALOG_UPDATE_NAMES, true),
    shirts: flag(environment.SOFASCORE_CATALOG_UPDATE_SHIRTS, true),
    // A position decides Fantasy points per goal: off unless the owner says so.
    positions: flag(environment.SOFASCORE_CATALOG_UPDATE_POSITION, false),
  };
  const imageLimit = boundedInt(
    environment.SOFASCORE_CATALOG_IMAGE_LIMIT,
    IMAGE_LIMIT_DEFAULT,
    IMAGE_LIMIT_MAX,
  );
  // A SofaScore player image is not a photo we hold a release for (Pépites rule):
  // clubs only unless the owner switches players on.
  const playerPhotos = flag(environment.SOFASCORE_CATALOG_PLAYER_PHOTOS, false);
  const rpc = (name: string, args: Record<string, unknown>) => client.schema("api").rpc(name, args);

  let snapshot: CatalogSnapshot | null;
  try {
    const result = await rpc("football_sofascore_catalog_snapshot", {});
    snapshot = result.error ? null : parseCatalogSnapshot(result.data);
  } catch {
    snapshot = null;
  }
  if (!snapshot) {
    log(
      JSON.stringify({
        event: "football_catalog_weekly",
        mode,
        job,
        result: "error",
        error: "database_unavailable",
      }),
    );
    return { status: 502, body: { error: "database_unavailable", mode, job } };
  }

  // 1. Squads and the player plan.
  const mappedPlayers = new Map(snapshot.players.map((player) => [player.sofascoreId, player]));
  const unmapped: UnmappedPlayer[] = [];
  const allUpdates: PlayerUpdate[] = [];
  const squadErrors: { teamId: string; error: string }[] = [];
  let squadsRead = 0;
  let squadPlayers = 0;
  let unchangedPlayers = 0;
  let squadRequests = 0;
  let stoppedBy: string | null = null;
  const squadTeams = new Set<string>();
  for (const team of snapshot.teams) {
    if (overBudget()) {
      stoppedBy = "time_budget";
      break;
    }
    squadRequests += 1;
    try {
      const reply: RapidApiResult = await rapid.getJson(squadPath(team.sofascoreId));
      const squad = parseSquad(reply.data);
      if (!squad) {
        squadErrors.push({ teamId: team.sofascoreId, error: "invalid_provider_payload" });
        continue;
      }
      squadsRead += 1;
      squadPlayers += squad.length;
      squadTeams.add(team.sofascoreId);
      const plan = planPlayerUpdates(squad, team.sofascoreId, mappedPlayers, switches);
      allUpdates.push(...plan.updates);
      unmapped.push(...plan.unmapped);
      unchangedPlayers += plan.unchanged;
    } catch (error) {
      const code = error instanceof RapidApiError ? error.code : "invalid_provider_payload";
      squadErrors.push({ teamId: team.sofascoreId, error: code });
      if (code === "provider_rate_limited") {
        stoppedBy = "rate_limited";
        break;
      }
    }
  }

  // 2. Apply (sofascore mode only).
  const applied = {
    names: 0,
    positions: 0,
    shirts: 0,
    notMapped: 0,
    noMembership: 0,
    shirtConflicts: 0,
  };
  let applyError: string | null = null;
  if (mode === "sofascore" && allUpdates.length > 0) {
    for (let index = 0; index < allUpdates.length; index += APPLY_CHUNK) {
      try {
        const result = await rpc("service_sofascore_catalog_apply", {
          p_updates: allUpdates.slice(index, index + APPLY_CHUNK),
          p_allow_position: switches.positions,
        });
        if (result.error || !isRecord(result.data)) {
          applyError = "database_rejected";
          break;
        }
        for (const key of Object.keys(applied) as (keyof typeof applied)[]) {
          const value = result.data[key];
          if (typeof value === "number") applied[key] += value;
        }
      } catch {
        applyError = "database_unavailable";
        break;
      }
    }
  }

  // 3. Images, bounded.
  const tally: ImageTally = {
    candidates: 0,
    attempted: 0,
    stored: 0,
    unchanged: 0,
    missing: 0,
    failed: 0,
    linkedCrests: 0,
    requests: 0,
    stoppedBy: null,
  };
  if (imageLimit > 0 && stoppedBy !== "rate_limited") {
    const candidates: ImageCandidate[] = [
      ...snapshot.teams
        .filter((team) => !team.crestCurated)
        .map((team) => ({ entityType: "team" as const, sofascoreId: team.sofascoreId })),
      ...(playerPhotos
        ? snapshot.players.map((player) => ({
            entityType: "player" as const,
            sofascoreId: player.sofascoreId,
          }))
        : []),
    ];
    tally.candidates = candidates.length;
    const work = selectImageWork(candidates, snapshot.images, imageLimit, now);
    const states = new Map(
      snapshot.images.map((state) => [stateKey(state.entityType, state.sofascoreId), state]),
    );
    if (mode === "shadow") {
      // Shadow downloads and stores nothing: it only says how many it would.
      tally.attempted = 0;
      tally.stoppedBy = work.length > 0 ? `shadow_would_fetch_${work.length}` : null;
    } else if (!rapid.getImage || !storage) {
      tally.stoppedBy = "images_not_configured";
    } else {
      let consecutiveFailures = 0;
      for (const item of work) {
        if (overBudget()) {
          tally.stoppedBy = "time_budget";
          break;
        }
        tally.attempted += 1;
        tally.requests += 1;
        const previous = states.get(stateKey(item.entityType, item.sofascoreId));
        const record = async (status: string, extra: Record<string, unknown> = {}) =>
          rpc("service_sofascore_catalog_record_image", {
            p_entity_type: item.entityType,
            p_sofascore_id: item.sofascoreId,
            p_status: status,
            ...extra,
          });
        try {
          const reply = await rapid.getImage(
            item.entityType === "team"
              ? teamLogoPath(item.sofascoreId)
              : playerImagePath(item.sofascoreId),
          );
          const sniffed = sniffImage(reply.bytes);
          if (!sniffed) {
            tally.failed += 1;
            await record("failed");
            continue;
          }
          const sha = await sha256Hex(reply.bytes);
          if (detectImageChange(previous?.sha256 ?? null, sha) === "unchanged") {
            await record("unchanged");
            tally.unchanged += 1;
            consecutiveFailures = 0;
            continue;
          }
          const path = imageStoragePath(item.entityType, item.sofascoreId, sha, sniffed.extension);
          const bucket = storage.from(CATALOG_BUCKET);
          const upload = await bucket.upload(path, reply.bytes, {
            contentType: sniffed.mime,
            upsert: true,
            cacheControl: "31536000",
          });
          if (upload.error) {
            tally.failed += 1;
            await record("failed");
            continue;
          }
          const saved = await record("stored", {
            p_sha256: sha,
            p_storage_path: path,
            p_mime_type: sniffed.mime,
            p_byte_size: reply.bytes.length,
          });
          if (saved.error) {
            tally.failed += 1;
            continue;
          }
          tally.stored += 1;
          consecutiveFailures = 0;
          const data = isRecord(saved.data) ? saved.data : {};
          if (data.linked === true) tally.linkedCrests += 1;
          if (typeof data.previousPath === "string" && data.previousPath !== path) {
            await bucket.remove([data.previousPath]);
          }
        } catch (error) {
          const code = error instanceof RapidApiError ? error.code : "invalid_provider_payload";
          if (code === "provider_rate_limited") {
            tally.stoppedBy = "rate_limited";
            break;
          }
          try {
            if (code === "data_unavailable") {
              tally.missing += 1;
              await record("missing");
            } else {
              tally.failed += 1;
              consecutiveFailures += 1;
              await record("failed");
            }
          } catch {
            // The outcome is only a note for next week's ordering.
          }
          if (consecutiveFailures >= 3) {
            tally.stoppedBy = "repeated_failures";
            break;
          }
        }
      }
    }
  }

  const requests = squadRequests + tally.requests;
  const result = applyError || squadErrors.length > 0 ? "partial" : "ok";
  log(
    JSON.stringify({
      event: "football_catalog_weekly",
      mode,
      job,
      result,
      requests,
      clubs: snapshot.teams.length,
      squadsRead,
      squadPlayers,
      mappedPlayers: snapshot.players.length,
      planned: allUpdates.length,
      unchangedPlayers,
      applied: mode === "sofascore" ? applied : null,
      applyError,
      squadErrors,
      stoppedBy,
      images: tally,
      // For review: SofaScore players with no mapping. Nothing was created.
      unmappedPlayers: unmapped.slice(0, UNMAPPED_LOG_LIMIT),
      unmappedPlayersTotal: unmapped.length,
    }),
  );
  return {
    status: stoppedBy === "rate_limited" ? 429 : applyError ? 502 : 200,
    body: {
      provider: "sofascore",
      mode,
      job,
      requests,
      clubs: snapshot.teams.length,
      squadsRead,
      planned: allUpdates.length,
      applied: mode === "sofascore" ? applied : null,
      applyError,
      squadErrors,
      stoppedBy,
      images: tally,
      unmappedPlayersTotal: unmapped.length,
      unmappedPlayers: unmapped.slice(0, UNMAPPED_BODY_LIMIT),
    },
  };
}
