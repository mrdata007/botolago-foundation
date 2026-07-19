// Phase 3B2a Parts B+C — Fantasy cloud repository (canonical ID-mapped).
//
// - No service-role usage; auth-scoped RLS calls only.
// - No silent local fallback: every failure surfaces as a typed FantasyCloudError.
// - Optimistic concurrency via fantasy_teams.version (propagated by both
//   save_fantasy_team and save_fantasy_lifecycle RPCs).
// - Squad, transfers and captain/vice references translate through the
//   canonical FantasyIdMap so browser mock ids (fp_war_1) round-trip with
//   real players.id UUIDs.

import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { ChipsState } from "@/lib/fantasy-engine";
import type { PointsViewModel } from "@/services/points-service";
import type { FantasyTeam, FormationKey, SquadPlayer } from "@/types/fantasy";
import {
  loadIdMap,
  mapSquad,
  mapPlayerId,
  unmapPlayerId,
  MissingIdMappingError,
  type FantasyIdMap,
} from "@/services/fantasy-id-map";

// ---------- Public types ----------

export type FantasyCloudErrorCode =
  | "unauthenticated"
  | "not_found"
  | "version_conflict"
  | "permission_denied"
  | "network"
  | "validation"
  | "id_mapping_unavailable"
  | "unknown";

export class FantasyCloudError extends Error {
  code: FantasyCloudErrorCode;
  cause?: unknown;
  missingIds?: { players?: string[]; clubs?: string[] };
  constructor(
    code: FantasyCloudErrorCode,
    message?: string,
    cause?: unknown,
    missingIds?: { players?: string[]; clubs?: string[] },
  ) {
    super(message ?? code);
    this.code = code;
    this.cause = cause;
    this.missingIds = missingIds;
  }
}

export interface CloudLifecyclePayload {
  chips: ChipsState;
  currentGameweek: number;
  transferHitPoints: number;
  /** Cached per-GW results keyed by gameweek number. */
  results: Record<number, PointsViewModel>;
  /** Free-form future-proof metadata bag. Never mutated by repo. */
  meta?: Record<string, Json>;
}

export interface CloudFantasyTeam {
  id: string;
  userId: string;
  teamName: string;
  managerName: string | null;
  formation: FormationKey;
  bank: number;
  freeTransfers: number;
  pendingTransfers: number;
  currentGameweekId: string | null;
  version: number;
  lifecycle: CloudLifecyclePayload;
  /** 15 members mapped back to browser source IDs (empty when cloud has no squad yet). */
  squad: SquadPlayer[];
  /** Per-slot purchase prices, aligned to `squad`. Empty when squad is empty. */
  purchasePrices: Record<string /* sourceId */, number>;
}

export interface CloudGameweekResult {
  teamId: string;
  gameweekId: string;
  finalPoints: number;
  rawPoints: number;
  captainPoints: number;
  benchPoints: number;
  benchBoostPoints: number;
  tripleCaptainPoints: number;
  transferHit: number;
  effectiveCaptainSourceId: string | null;
  captainMultiplier: number;
  autoSubs: Json;
  chip: string | null;
  isFinalized: boolean;
  finalizedAt: string | null;
}

export interface CloudChipUse {
  id: string;
  chip: string;
  gameweekId: string;
  state: string;
  season: string;
  activatedAt: string;
  finalizedAt: string | null;
}

// ---------- Error mapping ----------

type PgErrorLike = { code?: string; message?: string; details?: string | null };

export function mapSupabaseError(err: unknown): FantasyCloudError {
  if (err instanceof FantasyCloudError) return err;
  if (err instanceof MissingIdMappingError) {
    return new FantasyCloudError("id_mapping_unavailable", err.message, err, {
      players: err.missingPlayers,
      clubs: err.missingClubs,
    });
  }
  const e = err as PgErrorLike | null;
  const msg = e?.message ?? "";
  const code = e?.code ?? "";

  if (code === "40001" || /version conflict/i.test(msg)) {
    return new FantasyCloudError("version_conflict", msg, err);
  }
  if (code === "42501" || /not authenticated/i.test(msg)) {
    return new FantasyCloudError("unauthenticated", msg, err);
  }
  if (code === "P0002" || /not found/i.test(msg)) {
    return new FantasyCloudError("not_found", msg, err);
  }
  if (code === "PGRST301" || /row-level security|permission denied/i.test(msg)) {
    return new FantasyCloudError("permission_denied", msg, err);
  }
  if (/Failed to fetch|network|NetworkError/i.test(msg)) {
    return new FantasyCloudError("network", msg, err);
  }
  if (code === "23514" || code === "22P02" || /invalid input syntax|violates check/i.test(msg)) {
    return new FantasyCloudError("validation", msg, err);
  }
  return new FantasyCloudError("unknown", msg || "Unknown Supabase error", err);
}

// ---------- Row -> app helpers ----------

function parseLifecycle(raw: Json | null | undefined): CloudLifecyclePayload {
  const empty: CloudLifecyclePayload = {
    chips: { active: null, used: [] },
    currentGameweek: 0,
    transferHitPoints: 0,
    results: {},
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const r = raw as Record<string, Json>;
  return {
    chips: (r.chips as unknown as ChipsState) ?? empty.chips,
    currentGameweek: typeof r.currentGameweek === "number" ? r.currentGameweek : 0,
    transferHitPoints: typeof r.transferHitPoints === "number" ? r.transferHitPoints : 0,
    results: (r.results as unknown as Record<number, PointsViewModel>) ?? {},
    meta: (r.meta as Record<string, Json>) ?? undefined,
  };
}

function rowToTeam(
  row: Database["public"]["Tables"]["fantasy_teams"]["Row"],
  squad: SquadPlayer[],
  purchasePrices: Record<string, number>,
): CloudFantasyTeam {
  return {
    id: row.id,
    userId: row.user_id,
    teamName: row.team_name,
    managerName: row.manager_name,
    formation: (row.formation as FormationKey) ?? "4-4-2",
    bank: Number(row.bank ?? 0),
    freeTransfers: row.free_transfers,
    pendingTransfers: row.pending_transfers,
    currentGameweekId: row.current_gameweek_id,
    version: row.version,
    lifecycle: parseLifecycle(row.lifecycle_state as Json),
    squad,
    purchasePrices,
  };
}

// ---------- Validation ----------

const LEGAL_FORMATIONS: ReadonlySet<FormationKey> = new Set([
  "3-4-3",
  "3-5-2",
  "4-3-3",
  "4-4-2",
  "4-5-1",
  "5-3-2",
  "5-4-1",
]);

export function validateSquadShape(squad: SquadPlayer[], formation: FormationKey): void {
  if (squad.length !== 15) {
    throw new FantasyCloudError(
      "validation",
      `Squad must have exactly 15 players (got ${squad.length}).`,
    );
  }
  const slots = new Set<number>();
  const ids = new Set<string>();
  let captain: string | null = null;
  let vice: string | null = null;
  for (const s of squad) {
    if (s.slot < 1 || s.slot > 15) {
      throw new FantasyCloudError("validation", `Invalid slot ${s.slot} (must be 1..15).`);
    }
    if (slots.has(s.slot)) throw new FantasyCloudError("validation", `Duplicate slot ${s.slot}.`);
    slots.add(s.slot);
    if (ids.has(s.playerId))
      throw new FantasyCloudError("validation", `Duplicate player ${s.playerId}.`);
    ids.add(s.playerId);
    if (s.isCaptain) {
      if (captain) throw new FantasyCloudError("validation", "Exactly one captain required.");
      captain = s.playerId;
    }
    if (s.isViceCaptain) {
      if (vice) throw new FantasyCloudError("validation", "Exactly one vice-captain required.");
      vice = s.playerId;
    }
  }
  if (!captain) throw new FantasyCloudError("validation", "Missing captain.");
  if (!vice) throw new FantasyCloudError("validation", "Missing vice-captain.");
  if (captain === vice)
    throw new FantasyCloudError("validation", "Captain and vice-captain must differ.");
  if (!LEGAL_FORMATIONS.has(formation)) {
    throw new FantasyCloudError("validation", `Illegal formation ${formation}.`);
  }
}

// ---------- Repo ----------

export interface SaveTeamInput {
  teamName: string;
  managerName: string | null;
  formation: FormationKey;
  bank: number;
  currentGameweekId: string | null;
  squad: SquadPlayer[];
  /** Purchase price per browser source id (must cover every squad member). */
  purchasePrices: Record<string, number>;
  expectedVersion?: number;
  idMap?: FantasyIdMap;
}

export interface LoadOrCreateInput {
  userId: string;
  teamName: string;
  managerName?: string | null;
  /**
   * When the cloud team is newly created and has no squad, initialize from
   * this local/demo team. All 15 IDs must map or nothing is written and a
   * MissingIdMappingError is thrown.
   */
  seedFromLocal?: {
    formation: FormationKey;
    bank: number;
    squad: SquadPlayer[];
    purchasePrices: Record<string, number>;
    currentGameweekId?: string | null;
  };
}

export interface FantasyCloudRepo {
  loadOrCreateTeam(params: LoadOrCreateInput): Promise<CloudFantasyTeam>;
  loadTeam(userId: string): Promise<CloudFantasyTeam | null>;
  saveTeam(input: SaveTeamInput): Promise<{ teamId: string }>;
  saveLifecycle(input: {
    teamId: string;
    expectedVersion: number;
    lifecycle: CloudLifecyclePayload;
    currentGameweekId?: string | null;
  }): Promise<{ version: number; lifecycle: CloudLifecyclePayload }>;
  recordConfirmedTransfer(input: {
    teamId: string;
    userId: string;
    gameweekId: string;
    playerOutSourceId: string;
    playerInSourceId: string;
    priceOut: number;
    priceIn: number;
    cost: number;
    hit: number;
    chip?: string | null;
    idMap?: FantasyIdMap;
  }): Promise<{ id: string }>;
  loadConfirmedTransfers(teamId: string): Promise<
    Array<{
      id: string;
      gameweekId: string;
      playerOutSourceId: string | undefined;
      playerInSourceId: string | undefined;
      priceOut: number;
      priceIn: number;
      cost: number;
      hit: number;
      chip: string | null;
      confirmedAt: string | null;
    }>
  >;
  upsertGameweekResult(input: {
    teamId: string;
    gameweekId: string;
    payload: Record<string, Json>;
  }): Promise<{ id: string }>;
  loadGameweekResults(teamId: string): Promise<CloudGameweekResult[]>;
  recordChipUse(input: {
    teamId: string;
    gameweekId: string;
    chip: string;
    season: string;
    state?: string;
  }): Promise<{ id: string }>;
  finalizeChipUse(input: { id: string }): Promise<void>;
  loadChipUses(teamId: string): Promise<CloudChipUse[]>;
}

async function loadSquadRows(teamId: string) {
  const { data, error } = await supabase
    .from("fantasy_squad_members")
    .select("*")
    .eq("team_id", teamId)
    .order("slot", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return data ?? [];
}

async function mapCloudSquad(
  rows: Array<Database["public"]["Tables"]["fantasy_squad_members"]["Row"]>,
  idMap: FantasyIdMap,
): Promise<{ squad: SquadPlayer[]; purchasePrices: Record<string, number> }> {
  const squad: SquadPlayer[] = [];
  const purchasePrices: Record<string, number> = {};
  const missing: string[] = [];
  for (const r of rows) {
    const src = unmapPlayerId(r.player_id, idMap);
    if (!src) {
      missing.push(r.player_id);
      continue;
    }
    squad.push({
      playerId: src,
      slot: r.slot,
      isCaptain: r.is_captain || undefined,
      isViceCaptain: r.is_vice || undefined,
    });
    purchasePrices[src] = Number(r.purchase_price);
  }
  if (missing.length) {
    throw new MissingIdMappingError({ missingPlayers: missing });
  }
  return { squad, purchasePrices };
}

export const fantasyCloudRepo: FantasyCloudRepo = {
  async loadOrCreateTeam({ userId, teamName, managerName, seedFromLocal }) {
    const existing = await this.loadTeam(userId);
    if (existing) return existing;

    const { data, error } = await supabase
      .from("fantasy_teams")
      .insert({
        user_id: userId,
        team_name: teamName,
        manager_name: managerName ?? null,
        formation: seedFromLocal?.formation ?? "4-4-2",
        bank: seedFromLocal?.bank ?? 100,
        current_gameweek_id: seedFromLocal?.currentGameweekId ?? null,
      })
      .select("*")
      .single();
    if (error) throw mapSupabaseError(error);
    let team = rowToTeam(data, [], {});

    // Optionally seed the squad from a fully mappable local team. If any ID
    // fails to map we throw — the cloud row stays empty, no partial writes.
    if (seedFromLocal && seedFromLocal.squad.length === 15) {
      try {
        const idMap = await loadIdMap();
        validateSquadShape(seedFromLocal.squad, seedFromLocal.formation);
        const mapped = mapSquad(seedFromLocal.squad, idMap); // throws aggregate if incomplete
        const squadJson: Json = mapped.map((m) => ({
          player_id: m.playerId,
          slot: m.slot,
          is_captain: m.isCaptain,
          is_vice: m.isViceCaptain,
          purchase_price: seedFromLocal.purchasePrices[m.sourceId] ?? 0,
        }));
        const { error: rpcErr } = await supabase.rpc("save_fantasy_team", {
          _team_name: teamName,
          _manager_name: managerName ?? "",
          _formation: seedFromLocal.formation,
          _bank: seedFromLocal.bank,
          _current_gameweek_id: (seedFromLocal.currentGameweekId ?? null) as unknown as string,
          _squad: squadJson,
        });
        if (rpcErr) throw mapSupabaseError(rpcErr);
        const refreshed = await this.loadTeam(userId);
        if (refreshed) team = refreshed;
      } catch (err) {
        throw mapSupabaseError(err);
      }
    }
    return team;
  },

  async loadTeam(userId) {
    const { data, error } = await supabase
      .from("fantasy_teams")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw mapSupabaseError(error);
    if (!data) return null;
    const rows = await loadSquadRows(data.id);
    if (rows.length === 0) return rowToTeam(data, [], {});
    const idMap = await loadIdMap();
    const { squad, purchasePrices } = await mapCloudSquad(rows, idMap);
    return rowToTeam(data, squad, purchasePrices);
  },

  async saveTeam({
    teamName,
    managerName,
    formation,
    bank,
    currentGameweekId,
    squad,
    purchasePrices,
    idMap,
  }) {
    validateSquadShape(squad, formation);
    const resolved = idMap ?? (await loadIdMap());
    const mapped = mapSquad(squad, resolved);
    const missingPrice = mapped.find((m) => typeof purchasePrices[m.sourceId] !== "number");
    if (missingPrice) {
      throw new FantasyCloudError(
        "validation",
        `Missing purchase price for ${missingPrice.sourceId}.`,
      );
    }
    const squadJson: Json = mapped.map((m) => ({
      player_id: m.playerId,
      slot: m.slot,
      is_captain: m.isCaptain,
      is_vice: m.isViceCaptain,
      purchase_price: purchasePrices[m.sourceId],
    }));
    const { data, error } = await supabase.rpc("save_fantasy_team", {
      _team_name: teamName,
      _manager_name: managerName ?? "",
      _formation: formation,
      _bank: bank,
      _current_gameweek_id: (currentGameweekId ?? null) as unknown as string,
      _squad: squadJson,
    });
    if (error) throw mapSupabaseError(error);
    return { teamId: data as unknown as string };
  },

  async saveLifecycle({ teamId, expectedVersion, lifecycle, currentGameweekId }) {
    const args: Database["public"]["Functions"]["save_fantasy_lifecycle"]["Args"] = {
      _team_id: teamId,
      _expected_version: expectedVersion,
      _lifecycle: lifecycle as unknown as Json,
    };
    if (currentGameweekId) args._current_gameweek_id = currentGameweekId;
    const { data, error } = await supabase.rpc("save_fantasy_lifecycle", args);
    if (error) throw mapSupabaseError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new FantasyCloudError("not_found", "save_fantasy_lifecycle returned no row");
    return {
      version: (row as { version: number }).version,
      lifecycle: parseLifecycle((row as { lifecycle_state: Json }).lifecycle_state),
    };
  },

  async recordConfirmedTransfer(input) {
    const idMap = input.idMap ?? (await loadIdMap());
    const outId = mapPlayerId(input.playerOutSourceId, idMap);
    const inId = mapPlayerId(input.playerInSourceId, idMap);
    const { data, error } = await supabase
      .from("fantasy_transfers")
      .insert({
        team_id: input.teamId,
        user_id: input.userId,
        gameweek_id: input.gameweekId,
        player_out_id: outId,
        player_in_id: inId,
        price_out: input.priceOut,
        price_in: input.priceIn,
        cost: input.cost,
        hit: input.hit,
        chip: input.chip ?? null,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw mapSupabaseError(error);
    return { id: data.id };
  },

  async loadConfirmedTransfers(teamId) {
    const { data, error } = await supabase
      .from("fantasy_transfers")
      .select("*")
      .eq("team_id", teamId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false });
    if (error) throw mapSupabaseError(error);
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const idMap = await loadIdMap();
    return rows.map((r) => ({
      id: r.id,
      gameweekId: r.gameweek_id,
      playerOutSourceId: unmapPlayerId(r.player_out_id, idMap),
      playerInSourceId: unmapPlayerId(r.player_in_id, idMap),
      priceOut: Number(r.price_out),
      priceIn: Number(r.price_in),
      cost: Number(r.cost),
      hit: r.hit,
      chip: r.chip,
      confirmedAt: r.confirmed_at,
    }));
  },

  async upsertGameweekResult({ teamId, gameweekId, payload }) {
    const { data, error } = await supabase.rpc("finalize_gameweek_result", {
      _team_id: teamId,
      _gameweek_id: gameweekId,
      _payload: payload as unknown as Json,
    });
    if (error) throw mapSupabaseError(error);
    return { id: data as unknown as string };
  },

  async loadGameweekResults(teamId) {
    const { data, error } = await supabase
      .from("fantasy_gameweek_results")
      .select("*")
      .eq("team_id", teamId)
      .order("finalized_at", { ascending: false });
    if (error) throw mapSupabaseError(error);
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const idMap = await loadIdMap();
    return rows.map((r) => ({
      teamId: r.team_id,
      gameweekId: r.gameweek_id,
      finalPoints: r.final_points,
      rawPoints: r.raw_points,
      captainPoints: r.captain_points,
      benchPoints: r.bench_points,
      benchBoostPoints: r.bench_boost_points,
      tripleCaptainPoints: r.triple_captain_points,
      transferHit: r.transfer_hit,
      effectiveCaptainSourceId: r.effective_captain_id
        ? (unmapPlayerId(r.effective_captain_id, idMap) ?? null)
        : null,
      captainMultiplier: r.captain_multiplier,
      autoSubs: r.auto_subs,
      chip: r.chip,
      isFinalized: r.is_finalized,
      finalizedAt: r.finalized_at,
    }));
  },

  async recordChipUse({ teamId, gameweekId, chip, season, state }) {
    const { data, error } = await supabase
      .from("fantasy_chip_uses")
      .insert({
        team_id: teamId,
        gameweek_id: gameweekId,
        chip,
        season,
        state: state ?? "active",
      })
      .select("id")
      .single();
    if (error) throw mapSupabaseError(error);
    return { id: data.id };
  },

  async finalizeChipUse({ id }) {
    const { error } = await supabase
      .from("fantasy_chip_uses")
      .update({ state: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw mapSupabaseError(error);
  },

  async loadChipUses(teamId) {
    const { data, error } = await supabase
      .from("fantasy_chip_uses")
      .select("*")
      .eq("team_id", teamId)
      .order("activated_at", { ascending: false });
    if (error) throw mapSupabaseError(error);
    return (data ?? []).map((r) => ({
      id: r.id,
      chip: r.chip,
      gameweekId: r.gameweek_id,
      state: r.state,
      season: r.season,
      activatedAt: r.activated_at,
      finalizedAt: r.finalized_at,
    }));
  },
};

// Re-export mapping helpers for tests / callers that need direct access.
export { MissingIdMappingError } from "@/services/fantasy-id-map";
export type { FantasyTeam };
