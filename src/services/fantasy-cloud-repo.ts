// Phase 3B2a — Fantasy cloud repository.
//
// Typed, thin wrapper around Supabase for authenticated users' Fantasy state.
// - No service-role usage.
// - No silent local fallback: every failure surfaces as a typed
//   `FantasyCloudError` so upper layers can decide how to react.
// - Optimistic concurrency via `fantasy_teams.version`, propagated by both
//   `save_fantasy_team` and the new `save_fantasy_lifecycle` RPC.
//
// Squad-member persistence (`save_fantasy_team` RPC) requires real
// `players.id` UUIDs. Until the ID-mapping module ships (Phase 3B2c) the
// current mock player IDs (`p_1`, `p_2`, ...) cannot round-trip, so
// `saveTeam` throws `ID_MAPPING_UNAVAILABLE` in that case rather than
// hitting the DB and getting a raw invalid-UUID error.

import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { ChipsState } from "@/lib/fantasy-engine";
import type { PointsViewModel } from "@/services/points-service";
import type { FormationKey } from "@/types/fantasy";

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
  constructor(code: FantasyCloudErrorCode, message?: string, cause?: unknown) {
    super(message ?? code);
    this.code = code;
    this.cause = cause;
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
  effectiveCaptainId: string | null;
  captainMultiplier: number;
  autoSubs: Json;
  chip: string | null;
  isFinalized: boolean;
  finalizedAt: string | null;
}

// ---------- Error mapping ----------

type PgErrorLike = { code?: string; message?: string; details?: string | null };

export function mapSupabaseError(err: unknown): FantasyCloudError {
  if (err instanceof FantasyCloudError) return err;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRealPlayerId(id: string): boolean { return UUID_RE.test(id); }

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

function rowToTeam(row: Database["public"]["Tables"]["fantasy_teams"]["Row"]): CloudFantasyTeam {
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
  };
}

// ---------- Repo ----------

export interface FantasyCloudRepo {
  loadOrCreateTeam(params: { userId: string; teamName: string; managerName?: string | null }): Promise<CloudFantasyTeam>;
  loadTeam(userId: string): Promise<CloudFantasyTeam | null>;
  loadSquad(teamId: string): Promise<Array<Database["public"]["Tables"]["fantasy_squad_members"]["Row"]>>;
  saveTeam(input: {
    teamName: string;
    managerName: string | null;
    formation: FormationKey;
    bank: number;
    currentGameweekId: string | null;
    squad: Array<{ playerId: string; slot: number; isCaptain?: boolean; isViceCaptain?: boolean; purchasePrice: number }>;
    expectedVersion?: number;
  }): Promise<{ teamId: string }>;
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
    playerOutId: string;
    playerInId: string;
    priceOut: number;
    priceIn: number;
    cost: number;
    hit: number;
    chip?: string | null;
  }): Promise<{ id: string }>;
  upsertGameweekResult(input: {
    teamId: string;
    gameweekId: string;
    payload: Record<string, Json>;
  }): Promise<{ id: string }>;
  loadGameweekResults(teamId: string): Promise<CloudGameweekResult[]>;
}

export const fantasyCloudRepo: FantasyCloudRepo = {
  async loadOrCreateTeam({ userId, teamName, managerName }) {
    const existing = await this.loadTeam(userId);
    if (existing) return existing;

    const { data, error } = await supabase
      .from("fantasy_teams")
      .insert({
        user_id: userId,
        team_name: teamName,
        manager_name: managerName ?? null,
      })
      .select("*")
      .single();
    if (error) throw mapSupabaseError(error);
    return rowToTeam(data);
  },

  async loadTeam(userId) {
    const { data, error } = await supabase
      .from("fantasy_teams")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw mapSupabaseError(error);
    return data ? rowToTeam(data) : null;
  },

  async loadSquad(teamId) {
    const { data, error } = await supabase
      .from("fantasy_squad_members")
      .select("*")
      .eq("team_id", teamId)
      .order("slot", { ascending: true });
    if (error) throw mapSupabaseError(error);
    return data ?? [];
  },

  async saveTeam({ teamName, managerName, formation, bank, currentGameweekId, squad }) {
    const bad = squad.find((s) => !isRealPlayerId(s.playerId));
    if (bad) {
      throw new FantasyCloudError(
        "id_mapping_unavailable",
        `Squad contains non-UUID player id "${bad.playerId}". Cloud squad save requires the player-id mapping module (Phase 3B2c).`,
      );
    }
    const squadJson: Json = squad.map((s) => ({
      player_id: s.playerId,
      slot: s.slot,
      is_captain: !!s.isCaptain,
      is_vice: !!s.isViceCaptain,
      purchase_price: s.purchasePrice,
    }));

    const { data, error } = await supabase.rpc("save_fantasy_team", {
      _team_name: teamName,
      _manager_name: managerName ?? "",
      _formation: formation,
      _bank: bank,
      _current_gameweek_id: currentGameweekId as unknown as string,
      _squad: squadJson,
    });
    if (error) throw mapSupabaseError(error);
    return { teamId: data as unknown as string };
  },

  async saveLifecycle({ teamId, expectedVersion, lifecycle, currentGameweekId }) {
    const { data, error } = await supabase.rpc("save_fantasy_lifecycle", {
      _team_id: teamId,
      _expected_version: expectedVersion,
      _lifecycle: lifecycle as unknown as Json,
      _current_gameweek_id: (currentGameweekId ?? null) as unknown as string,
    });
    if (error) throw mapSupabaseError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new FantasyCloudError("not_found", "save_fantasy_lifecycle returned no row");
    return {
      version: (row as { version: number }).version,
      lifecycle: parseLifecycle((row as { lifecycle_state: Json }).lifecycle_state),
    };
  },

  async recordConfirmedTransfer(input) {
    const { data, error } = await supabase
      .from("fantasy_transfers")
      .insert({
        team_id: input.teamId,
        user_id: input.userId,
        gameweek_id: input.gameweekId,
        player_out_id: input.playerOutId,
        player_in_id: input.playerInId,
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
    return (data ?? []).map((r) => ({
      teamId: r.team_id,
      gameweekId: r.gameweek_id,
      finalPoints: r.final_points,
      rawPoints: r.raw_points,
      captainPoints: r.captain_points,
      benchPoints: r.bench_points,
      benchBoostPoints: r.bench_boost_points,
      tripleCaptainPoints: r.triple_captain_points,
      transferHit: r.transfer_hit,
      effectiveCaptainId: r.effective_captain_id,
      captainMultiplier: r.captain_multiplier,
      autoSubs: r.auto_subs,
      chip: r.chip,
      isFinalized: r.is_finalized,
      finalizedAt: r.finalized_at,
    }));
  },
};
