// Pass 2 — Authoritative Fantasy owned-data repository boundary.
//
// One normalized snapshot + operations so Team / Transfers / Points / Home
// summary consume identical data regardless of source (cloud vs local).
//
// Rules:
//  - Supabase auth mode + authenticated user → cloud adapter.
//  - Guest / mock-auth / unauthenticated → local adapter.
//  - Cloud errors are typed FantasyRepoError; NEVER caught and returned as a
//    local fallback. UI shows the error and the user keeps their draft.

import { useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { supabase as defaultClient } from "@/integrations/supabase/client";

import type { FantasyTeam, FormationKey, SquadPlayer } from "@/types/fantasy";
import type { PointsViewModel } from "@/services/points-service";
import type { FantasyPersistedState } from "@/services/fantasy-state";
import { fantasyStateStore, DEFAULT_STATE } from "@/services/fantasy-state";
import { fantasyService } from "@/services/fantasy-mock";
import { finalizeGameweek as localFinalize } from "@/services/lifecycle-service";
import { applyConfirmedTransfers } from "@/services/transfers-service";
import type { ChipsState } from "@/lib/fantasy-engine";
import { fantasyPlayers as mockPlayers } from "@/mocks/fantasy-data";

import { AUTH_MODE } from "@/services/auth";
import { useAuth } from "@/auth/AuthProvider";

import type { FantasyIdMap } from "@/services/fantasy-id-map";
import { loadIdMap, unmapPlayerId } from "@/services/fantasy-id-map";
import {
  loadGameweekIndex,
  resolveGameweekId,
  type GameweekIndex,
} from "@/services/fantasy-gameweek-resolver";
import { FantasyRepoError, toRepoError } from "@/services/fantasy-errors";
import {
  buildConfirmTransfersPayload,
  buildFinalizeGameweekPayload,
  buildSaveTeamPayload,
  type ConfirmTransfersPayloadInput,
  type FinalizeGameweekPayloadInput,
  type SaveTeamPayloadInput,
} from "@/services/fantasy-payloads";

// ---------- Public normalized types ----------

export type FantasyRepoSource = "cloud" | "local";

export interface FantasySnapshot {
  teamId: string | null;
  version: number;
  team: FantasyTeam;
  lifecycle: FantasyPersistedState;
  finalizedResults: Record<number, PointsViewModel>;
  source: FantasyRepoSource;
  currentGameweekId: string | null;
  purchasePrices: Record<string, number>;
  /** True when authenticated cloud team exists but has zero squad rows. */
  emptyCloudSquad?: boolean;
}

export interface SaveOwnedTeamInput {
  teamName: string;
  managerName: string | null;
  formation: FormationKey;
  bank: number;
  freeTransfers: number;
  pendingTransfers: number;
  squad: SquadPlayer[];
  purchasePrices: Record<string, number>;
  expectedVersion: number;
  currentGameweekId: string | null;
  lifecycle: FantasyPersistedState;
}

export interface ConfirmOwnedTransfersInput {
  expectedVersion: number;
  formation: FormationKey;
  bank: number;
  freeTransfers: number;
  pendingTransfers: number;
  squad: SquadPlayer[];
  purchasePrices: Record<string, number>;
  currentGameweekId: string;
  lifecycle: FantasyPersistedState;
  transfers: ConfirmTransfersPayloadInput["transfers"];
}

export interface FinalizeOwnedGameweekInput {
  gameweek: number;
  gameweekId: string;
  expectedVersion: number;
  season: string;
  chipFinalize: string | null;
  result: PointsViewModel;
  postTeam: FinalizeGameweekPayloadInput["postTeam"];
  /** Purchase prices for post-team squad (Free Hit restore). */
  postPurchasePrices?: Record<string, number>;
}

export interface FantasyOwnedRepository {
  readonly source: FantasyRepoSource;
  loadSnapshot(): Promise<FantasySnapshot>;
  saveTeam(input: SaveOwnedTeamInput): Promise<FantasySnapshot>;
  confirmTransfers(input: ConfirmOwnedTransfersInput): Promise<FantasySnapshot>;
  finalizeGameweek(input: FinalizeOwnedGameweekInput): Promise<FantasySnapshot>;
  reload(): Promise<FantasySnapshot>;
}

// ---------- Source selector ----------

export function selectFantasyRepoSource(input: {
  authMode: "supabase" | "mock";
  isAuthenticated: boolean;
}): FantasyRepoSource {
  if (input.authMode === "supabase" && input.isAuthenticated) return "cloud";
  return "local";
}

// ---------- Local adapter ----------

function pickFinalized(state: FantasyPersistedState): Record<number, PointsViewModel> {
  const out: Record<number, PointsViewModel> = {};
  for (const [gw, vm] of Object.entries(state.results ?? {})) {
    if (vm?.finalized) out[Number(gw)] = vm;
  }
  return out;
}

export class LocalFantasyRepository implements FantasyOwnedRepository {
  readonly source: FantasyRepoSource = "local";

  async loadSnapshot(): Promise<FantasySnapshot> {
    const team = await fantasyService.getTeam();
    const state = fantasyStateStore.read();
    // Local prices: current book value per source id (mock adapter).
    const purchasePrices: Record<string, number> = {};
    for (const s of team.squad) {
      const p = mockPlayers.find((x) => x.id === s.playerId);
      if (p) purchasePrices[s.playerId] = p.price;
    }
    return {
      teamId: null,
      version: 0,
      team,
      lifecycle: state,
      finalizedResults: pickFinalized(state),
      source: "local",
      currentGameweekId: null,
      purchasePrices,
    };
  }

  async saveTeam(input: SaveOwnedTeamInput): Promise<FantasySnapshot> {
    fantasyService.saveTeam({
      formation: input.formation,
      squad: input.squad,
      bank: input.bank,
      freeTransfers: input.freeTransfers,
      pendingTransfers: input.pendingTransfers,
    });
    if (input.lifecycle) {
      fantasyStateStore.write(input.lifecycle, { internal: true });
    }
    return this.loadSnapshot();
  }

  async confirmTransfers(input: ConfirmOwnedTransfersInput): Promise<FantasySnapshot> {
    const team = await fantasyService.getTeam();
    const outIds = input.transfers.map((t) => t.outSourceId);
    const inIds = input.transfers.map((t) => t.inSourceId);
    const netCost = input.transfers.reduce(
      (s, t) => s + (t.priceIn - t.priceOut),
      0,
    );
    const result = applyConfirmedTransfers({
      team,
      chips: input.lifecycle.chips,
      outIds,
      inIds,
      netCost,
    });
    if (!result.ok) {
      throw new FantasyRepoError("validation", result.error);
    }
    // Use the caller-supplied resulting squad (engine-derived) rather than
    // relying on the naive in-place substitution.
    fantasyService.saveTeam({
      formation: input.formation,
      squad: input.squad,
      bank: input.bank,
      freeTransfers: input.freeTransfers,
      pendingTransfers: input.pendingTransfers,
    });
    fantasyStateStore.write(
      {
        ...input.lifecycle,
        chips: result.value.chips as ChipsState,
        transferHitPoints:
          (input.lifecycle.transferHitPoints ?? 0) +
          (result.value.hitPointsApplied ?? 0),
      },
      { internal: true },
    );
    return this.loadSnapshot();
  }

  async finalizeGameweek(input: FinalizeOwnedGameweekInput): Promise<FantasySnapshot> {
    // Delegate to the existing local lifecycle service which already handles
    // Free Hit restore + chip finalize.
    const team = await fantasyService.getTeam();
    localFinalize({
      gameweek: input.gameweek,
      team,
      players: mockPlayers,
      breakdown: input.result.breakdown,
      averagePoints: input.result.averagePoints,
      highestPoints: input.result.highestPoints,
    });
    return this.loadSnapshot();
  }

  async reload(): Promise<FantasySnapshot> {
    return this.loadSnapshot();
  }
}

// ---------- Cloud adapter ----------

export interface CloudAdapterDeps {
  client?: SupabaseClient<Database>;
  userId: string;
  season: string;
  /** Injectable id-map loader (tests override). */
  loadMap?: () => Promise<FantasyIdMap>;
  /** Injectable gameweek-index loader (tests override). */
  loadGameweeks?: () => Promise<GameweekIndex>;
}

interface CloudTeamRow {
  id: string;
  user_id: string;
  team_name: string;
  manager_name: string | null;
  formation: string;
  bank: number | string;
  free_transfers: number;
  pending_transfers: number;
  current_gameweek_id: string | null;
  version: number;
  lifecycle_state: unknown;
}

interface CloudSquadRow {
  team_id: string;
  player_id: string;
  slot: number;
  is_captain: boolean;
  is_vice: boolean;
  purchase_price: number | string;
}

function parseLifecycle(raw: unknown): FantasyPersistedState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_STATE };
  const r = raw as Record<string, unknown>;
  return {
    chips: (r.chips as ChipsState) ?? DEFAULT_STATE.chips,
    currentGameweek:
      typeof r.currentGameweek === "number"
        ? r.currentGameweek
        : DEFAULT_STATE.currentGameweek,
    transferHitPoints:
      typeof r.transferHitPoints === "number" ? r.transferHitPoints : 0,
    results:
      (r.results as Record<number, PointsViewModel>) ?? {},
  };
}

export class CloudFantasyRepository implements FantasyOwnedRepository {
  readonly source: FantasyRepoSource = "cloud";
  private readonly client: SupabaseClient<Database>;
  private readonly userId: string;
  private readonly season: string;
  private readonly loadMap: () => Promise<FantasyIdMap>;
  private readonly loadGameweeks: () => Promise<GameweekIndex>;

  constructor(deps: CloudAdapterDeps) {
    this.client = deps.client ?? defaultClient;
    this.userId = deps.userId;
    this.season = deps.season;
    this.loadMap = deps.loadMap ?? (() => loadIdMap(this.client));
    this.loadGameweeks = deps.loadGameweeks ?? (() => loadGameweekIndex(this.client));
  }

  async loadSnapshot(): Promise<FantasySnapshot> {
    try {
      const idMap = await this.loadMap();
      const { data: teamRow, error: teamErr } = await this.client
        .from("fantasy_teams")
        .select("*")
        .eq("user_id", this.userId)
        .maybeSingle();
      if (teamErr) throw toRepoError(teamErr);

      if (!teamRow) {
        // No cloud team yet — return an empty snapshot; the import prompt
        // (Pass 3) may seed via saveTeam.
        const empty: FantasyTeam = {
          managerName: "",
          teamName: "",
          formation: "4-4-2",
          squad: [],
          bank: 100,
          freeTransfers: 1,
          pendingTransfers: 0,
        };
        return {
          teamId: null,
          version: 0,
          team: empty,
          lifecycle: { ...DEFAULT_STATE },
          finalizedResults: {},
          source: "cloud",
          currentGameweekId: null,
          purchasePrices: {},
          emptyCloudSquad: true,
        };
      }
      return await this.buildSnapshotFromTeamRow(teamRow as CloudTeamRow, idMap);
    } catch (err) {
      throw toRepoError(err);
    }
  }

  private async buildSnapshotFromTeamRow(
    row: CloudTeamRow,
    idMap: FantasyIdMap,
  ): Promise<FantasySnapshot> {
    const { data: squadRows, error: squadErr } = await this.client
      .from("fantasy_squad_members")
      .select("*")
      .eq("team_id", row.id)
      .order("slot", { ascending: true });
    if (squadErr) throw toRepoError(squadErr);

    const squad: SquadPlayer[] = [];
    const purchasePrices: Record<string, number> = {};
    const missing: string[] = [];
    for (const r of (squadRows ?? []) as CloudSquadRow[]) {
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
      throw new FantasyRepoError(
        "mapping_incomplete",
        `Unmapped player rows: ${missing.join(", ")}`,
        undefined,
        { players: missing },
      );
    }

    const lifecycle = parseLifecycle(row.lifecycle_state);
    const team: FantasyTeam = {
      managerName: row.manager_name ?? "",
      teamName: row.team_name,
      formation: (row.formation as FormationKey) ?? "4-4-2",
      squad,
      bank: Number(row.bank ?? 0),
      freeTransfers: row.free_transfers,
      pendingTransfers: row.pending_transfers,
    };

    return {
      teamId: row.id,
      version: row.version,
      team,
      lifecycle,
      finalizedResults: pickFinalized(lifecycle),
      source: "cloud",
      currentGameweekId: row.current_gameweek_id,
      purchasePrices,
      emptyCloudSquad: squad.length === 0,
    };
  }

  async saveTeam(input: SaveOwnedTeamInput): Promise<FantasySnapshot> {
    try {
      const idMap = await this.loadMap();
      const current = await this.loadSnapshot();
      const args = buildSaveTeamPayload(
        {
          teamId: current.teamId,
          teamName: input.teamName,
          managerName: input.managerName,
          formation: input.formation,
          bank: input.bank,
          freeTransfers: input.freeTransfers,
          pendingTransfers: input.pendingTransfers,
          currentGameweekId: input.currentGameweekId,
          expectedVersion: input.expectedVersion,
          lifecycle: input.lifecycle,
          squad: input.squad,
          purchasePrices: input.purchasePrices,
        } satisfies SaveTeamPayloadInput,
        idMap,
      );
      const { error } = await this.client.rpc("save_fantasy_team_v2", args);
      if (error) throw toRepoError(error);
      return await this.loadSnapshot();
    } catch (err) {
      throw toRepoError(err);
    }
  }

  async confirmTransfers(input: ConfirmOwnedTransfersInput): Promise<FantasySnapshot> {
    try {
      const idMap = await this.loadMap();
      const current = await this.loadSnapshot();
      if (!current.teamId) {
        throw new FantasyRepoError(
          "not_found",
          "No cloud team to apply transfers against",
        );
      }
      const args = buildConfirmTransfersPayload(
        {
          teamId: current.teamId,
          expectedVersion: input.expectedVersion,
          formation: input.formation,
          bank: input.bank,
          freeTransfers: input.freeTransfers,
          pendingTransfers: input.pendingTransfers,
          currentGameweekId: input.currentGameweekId,
          lifecycle: input.lifecycle,
          squad: input.squad,
          purchasePrices: input.purchasePrices,
          transfers: input.transfers,
        },
        idMap,
      );
      const { error } = await this.client.rpc("confirm_fantasy_transfers", args);
      if (error) throw toRepoError(error);
      return await this.loadSnapshot();
    } catch (err) {
      throw toRepoError(err);
    }
  }

  async finalizeGameweek(input: FinalizeOwnedGameweekInput): Promise<FantasySnapshot> {
    try {
      const idMap = await this.loadMap();
      const current = await this.loadSnapshot();
      if (!current.teamId) {
        throw new FantasyRepoError("not_found", "No cloud team to finalize");
      }
      const args = buildFinalizeGameweekPayload(
        {
          teamId: current.teamId,
          gameweekId: input.gameweekId,
          expectedVersion: input.expectedVersion,
          season: input.season,
          chipFinalize: input.chipFinalize,
          result: input.result,
          postTeam: {
            ...input.postTeam,
            purchasePrices: input.postPurchasePrices,
          },
        },
        idMap,
      );
      const { data, error } = await this.client.rpc("finalize_fantasy_gameweek_v2", args);
      if (error) throw toRepoError(error);
      // `already_finalized=true` still returns the stable state; simply reload.
      void data;
      return await this.loadSnapshot();
    } catch (err) {
      throw toRepoError(err);
    }
  }

  async reload(): Promise<FantasySnapshot> {
    return this.loadSnapshot();
  }
}

// Re-exports for test convenience.
export { resolveGameweekId };

// ---------- Factory + hook ----------

export interface RepositoryFactoryInput {
  authMode: "supabase" | "mock";
  isAuthenticated: boolean;
  userId: string | null;
  season?: string;
  client?: SupabaseClient<Database>;
}

export const DEFAULT_SEASON = "2025-26";

export function createFantasyOwnedRepository(
  input: RepositoryFactoryInput,
): FantasyOwnedRepository {
  const source = selectFantasyRepoSource(input);
  if (source === "cloud") {
    if (!input.userId) {
      // Guard: cloud requires a user id. Fall through to a typed error at
      // call-site rather than silently going local.
      throw new FantasyRepoError(
        "unauthenticated",
        "Cloud repository requires an authenticated user id",
      );
    }
    return new CloudFantasyRepository({
      client: input.client,
      userId: input.userId,
      season: input.season ?? DEFAULT_SEASON,
    });
  }
  return new LocalFantasyRepository();
}

export function useFantasyOwnedRepository(opts?: { season?: string }): {
  repo: FantasyOwnedRepository;
  source: FantasyRepoSource;
  userId: string | null;
} {
  const { user, status } = useAuth();
  return useMemo(() => {
    const isAuthenticated = status === "authenticated" && !!user?.id;
    const source = selectFantasyRepoSource({
      authMode: AUTH_MODE,
      isAuthenticated,
    });
    const userId = user?.id ?? null;
    const repo =
      source === "cloud" && userId
        ? new CloudFantasyRepository({
            userId,
            season: opts?.season ?? DEFAULT_SEASON,
          })
        : new LocalFantasyRepository();
    return { repo, source, userId };
  }, [status, user?.id, opts?.season]);
}
