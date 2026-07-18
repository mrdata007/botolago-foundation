// Phase 3B2a Part B — Canonical mock↔cloud ID mapping module.
//
// Loads canonical `clubs.provider_id` and `players.provider_id` rows from
// Supabase and exposes typed bidirectional maps plus higher-level helpers
// (map a full 15-player squad, map a transfer pair, look up captain/vice).
//
// All missing source IDs are aggregated into a single MissingIdMappingError
// so the UI can surface every gap at once, not just the first.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { SquadPlayer } from "@/types/fantasy";

// ---------- Public types ----------

export interface FantasyIdMap {
  /** browser source id (e.g. "war") -> DB uuid */
  clubIdBySource: ReadonlyMap<string, string>;
  /** DB uuid -> browser source id */
  clubSourceById: ReadonlyMap<string, string>;
  /** browser source id (e.g. "fp_war_1") -> DB uuid */
  playerIdBySource: ReadonlyMap<string, string>;
  /** DB uuid -> browser source id */
  playerSourceById: ReadonlyMap<string, string>;
}

export interface MappedSquadRow {
  playerId: string; // DB uuid
  sourceId: string; // browser id
  slot: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export class MissingIdMappingError extends Error {
  readonly code = "id_mapping_missing" as const;
  missingClubs: string[];
  missingPlayers: string[];
  duplicateClubProviderIds: string[];
  duplicatePlayerProviderIds: string[];

  constructor(opts: {
    missingClubs?: string[];
    missingPlayers?: string[];
    duplicateClubProviderIds?: string[];
    duplicatePlayerProviderIds?: string[];
  }) {
    const parts: string[] = [];
    if (opts.missingClubs?.length) parts.push(`missing clubs: ${opts.missingClubs.join(", ")}`);
    if (opts.missingPlayers?.length) parts.push(`missing players: ${opts.missingPlayers.join(", ")}`);
    if (opts.duplicateClubProviderIds?.length) parts.push(`dup club provider_ids: ${opts.duplicateClubProviderIds.join(", ")}`);
    if (opts.duplicatePlayerProviderIds?.length) parts.push(`dup player provider_ids: ${opts.duplicatePlayerProviderIds.join(", ")}`);
    super(parts.length ? `Fantasy ID mapping incomplete — ${parts.join("; ")}` : "Fantasy ID mapping incomplete");
    this.missingClubs = opts.missingClubs ?? [];
    this.missingPlayers = opts.missingPlayers ?? [];
    this.duplicateClubProviderIds = opts.duplicateClubProviderIds ?? [];
    this.duplicatePlayerProviderIds = opts.duplicatePlayerProviderIds ?? [];
  }

  get isEmpty() {
    return (
      this.missingClubs.length === 0 &&
      this.missingPlayers.length === 0 &&
      this.duplicateClubProviderIds.length === 0 &&
      this.duplicatePlayerProviderIds.length === 0
    );
  }
}

// ---------- Pure builders ----------

type ClubRow = Pick<Database["public"]["Tables"]["clubs"]["Row"], "id" | "provider_id">;
type PlayerRow = Pick<Database["public"]["Tables"]["players"]["Row"], "id" | "provider_id">;

/**
 * Build a FantasyIdMap from raw rows. Detects duplicate provider_ids and
 * throws a MissingIdMappingError describing every duplicate at once. Rows
 * with a null provider_id are silently skipped.
 */
export function buildIdMap(clubRows: ClubRow[], playerRows: PlayerRow[]): FantasyIdMap {
  const clubIdBySource = new Map<string, string>();
  const clubSourceById = new Map<string, string>();
  const playerIdBySource = new Map<string, string>();
  const playerSourceById = new Map<string, string>();

  const dupClubs: string[] = [];
  for (const r of clubRows) {
    if (!r.provider_id) continue;
    if (clubIdBySource.has(r.provider_id)) dupClubs.push(r.provider_id);
    else {
      clubIdBySource.set(r.provider_id, r.id);
      clubSourceById.set(r.id, r.provider_id);
    }
  }
  const dupPlayers: string[] = [];
  for (const r of playerRows) {
    if (!r.provider_id) continue;
    if (playerIdBySource.has(r.provider_id)) dupPlayers.push(r.provider_id);
    else {
      playerIdBySource.set(r.provider_id, r.id);
      playerSourceById.set(r.id, r.provider_id);
    }
  }

  if (dupClubs.length || dupPlayers.length) {
    throw new MissingIdMappingError({
      duplicateClubProviderIds: dedup(dupClubs),
      duplicatePlayerProviderIds: dedup(dupPlayers),
    });
  }

  return { clubIdBySource, clubSourceById, playerIdBySource, playerSourceById };
}

function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

// ---------- Higher-level helpers ----------

export function mapPlayerId(sourceId: string, idMap: FantasyIdMap): string {
  const uuid = idMap.playerIdBySource.get(sourceId);
  if (!uuid) throw new MissingIdMappingError({ missingPlayers: [sourceId] });
  return uuid;
}

export function unmapPlayerId(dbUuid: string, idMap: FantasyIdMap): string | undefined {
  return idMap.playerSourceById.get(dbUuid);
}

/**
 * Map a complete 15-member squad from browser source IDs to DB UUIDs.
 * Aggregates every missing source id into a single MissingIdMappingError.
 */
export function mapSquad(squad: SquadPlayer[], idMap: FantasyIdMap): MappedSquadRow[] {
  const missing: string[] = [];
  const rows: MappedSquadRow[] = [];
  for (const s of squad) {
    const uuid = idMap.playerIdBySource.get(s.playerId);
    if (!uuid) {
      missing.push(s.playerId);
      continue;
    }
    rows.push({
      playerId: uuid,
      sourceId: s.playerId,
      slot: s.slot,
      isCaptain: !!s.isCaptain,
      isViceCaptain: !!s.isViceCaptain,
    });
  }
  if (missing.length) throw new MissingIdMappingError({ missingPlayers: dedup(missing) });
  return rows;
}

export function mapTransferPair(
  pair: { outSourceId: string; inSourceId: string },
  idMap: FantasyIdMap,
): { playerOutId: string; playerInId: string } {
  const missing: string[] = [];
  const out = idMap.playerIdBySource.get(pair.outSourceId);
  if (!out) missing.push(pair.outSourceId);
  const inn = idMap.playerIdBySource.get(pair.inSourceId);
  if (!inn) missing.push(pair.inSourceId);
  if (missing.length) throw new MissingIdMappingError({ missingPlayers: missing });
  return { playerOutId: out!, playerInId: inn! };
}

// ---------- IO + module cache ----------

let cached: FantasyIdMap | null = null;
let inflight: Promise<FantasyIdMap> | null = null;

export function invalidateIdMap(): void {
  cached = null;
  inflight = null;
}

/**
 * Load canonical clubs/players from Supabase and build a FantasyIdMap.
 * Result is cached; call {@link invalidateIdMap} to refresh.
 */
export async function loadIdMap(
  client: SupabaseClient<Database> = defaultClient,
  opts: { force?: boolean } = {},
): Promise<FantasyIdMap> {
  if (!opts.force && cached) return cached;
  if (!opts.force && inflight) return inflight;

  inflight = (async () => {
    const [clubsRes, playersRes] = await Promise.all([
      client.from("clubs").select("id, provider_id").not("provider_id", "is", null),
      client.from("players").select("id, provider_id").not("provider_id", "is", null),
    ]);
    if (clubsRes.error) throw clubsRes.error;
    if (playersRes.error) throw playersRes.error;
    const map = buildIdMap(
      (clubsRes.data ?? []) as ClubRow[],
      (playersRes.data ?? []) as PlayerRow[],
    );
    cached = map;
    return map;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function getCachedIdMap(): FantasyIdMap | null {
  return cached;
}

/** Test hook — inject a prebuilt map. */
export function __setCachedIdMapForTests(map: FantasyIdMap | null): void {
  cached = map;
  inflight = null;
}
