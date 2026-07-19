// Pass 2 / 3.1 — Pure payload builders for the Fantasy v2 RPCs.
//
// These are deliberately synchronous and take a pre-loaded FantasyIdMap so
// tests exercise the exact JSON shape sent to Supabase without hitting the
// network. Callers (the cloud adapter) invoke `supabase.rpc(name, args)` with
// the object returned here.
//
// Pass 3.1 changes:
//   - `FinalizeGameweekPayloadInput.postTeam.purchasePrices` is now
//     required-when-squad-provided so Free Hit / Wildcard restoration keeps
//     real prices instead of writing 0.
//   - Nullable UUID/text arguments flow through `asNullableUuidArg` /
//     `asNullableTextArg` (single documented cast site) rather than scattered
//     `as unknown as string` casts.

import type { Database, Json } from "@/integrations/supabase/types";
import type { FantasyIdMap } from "@/services/fantasy-id-map";
import { mapPlayerId, mapSquad } from "@/services/fantasy-id-map";
import type { FantasyPersistedState } from "@/services/fantasy-state";
import type { PointsViewModel } from "@/services/points-service";
import type { FormationKey, SquadPlayer } from "@/types/fantasy";
import { asNullableUuidArg, asNullableTextArg } from "@/services/fantasy-rpc-args";

// ---------- Inputs (adapter-facing) ----------

export interface SaveTeamPayloadInput {
  teamId: string | null;
  teamName: string;
  managerName: string | null;
  formation: FormationKey;
  bank: number;
  freeTransfers: number;
  pendingTransfers: number;
  currentGameweekId: string | null;
  expectedVersion: number | null;
  lifecycle: FantasyPersistedState;
  squad: SquadPlayer[];
  purchasePrices: Record<string, number>;
}

export interface ConfirmTransfersPayloadInput {
  teamId: string;
  expectedVersion: number;
  formation: FormationKey;
  bank: number;
  freeTransfers: number;
  pendingTransfers: number;
  currentGameweekId: string;
  lifecycle: FantasyPersistedState;
  squad: SquadPlayer[];
  purchasePrices: Record<string, number>;
  transfers: ReadonlyArray<{
    outSourceId: string;
    inSourceId: string;
    priceOut: number;
    priceIn: number;
    cost: number;
    hit: number;
    chip?: string | null;
  }>;
}

export interface FinalizeGameweekPayloadInput {
  teamId: string;
  gameweekId: string;
  expectedVersion: number;
  season: string;
  chipFinalize: string | null;
  result: PointsViewModel;
  postTeam: {
    formation: FormationKey;
    bank: number;
    freeTransfers: number;
    pendingTransfers: number;
    currentGameweekId: string | null;
    lifecycle: FantasyPersistedState;
    /** When present, replace squad atomically (Free Hit restore, Wildcard retain). */
    squad?: SquadPlayer[];
    /**
     * Purchase prices for the post-squad players, keyed by source id.
     * REQUIRED when `squad` is provided so Free Hit / Wildcard restoration
     * keeps real prices instead of defaulting to 0. Missing keys default to
     * 0 with a console warning — do not rely on that.
     */
    purchasePrices?: Record<string, number>;
  };
}

// ---------- Builders ----------

type SaveArgs = Database["public"]["Functions"]["save_fantasy_team_v2"]["Args"];
type ConfirmArgs = Database["public"]["Functions"]["confirm_fantasy_transfers"]["Args"];
type FinalizeArgs = Database["public"]["Functions"]["finalize_fantasy_gameweek_v2"]["Args"];

function squadToJson(
  squad: SquadPlayer[],
  purchasePrices: Record<string, number>,
  idMap: FantasyIdMap,
): Json {
  const mapped = mapSquad(squad, idMap);
  return mapped.map((m) => ({
    player_id: m.playerId,
    slot: m.slot,
    is_captain: m.isCaptain,
    is_vice: m.isViceCaptain,
    purchase_price: purchasePrices[m.sourceId] ?? 0,
  })) as unknown as Json;
}

export function buildSaveTeamPayload(input: SaveTeamPayloadInput, idMap: FantasyIdMap): SaveArgs {
  return {
    _team_id: asNullableUuidArg(input.teamId),
    _expected_version: (input.expectedVersion ?? 0) as number,
    _team_name: input.teamName,
    _manager_name: asNullableTextArg(input.managerName),
    _formation: input.formation,
    _bank: input.bank,
    _free_transfers: input.freeTransfers,
    _pending_transfers: input.pendingTransfers,
    _current_gameweek_id: asNullableUuidArg(input.currentGameweekId),
    _lifecycle: input.lifecycle as unknown as Json,
    _squad: squadToJson(input.squad, input.purchasePrices, idMap),
  };
}

export function buildConfirmTransfersPayload(
  input: ConfirmTransfersPayloadInput,
  idMap: FantasyIdMap,
): ConfirmArgs {
  const transfersJson = input.transfers.map((t) => ({
    player_out_id: mapPlayerId(t.outSourceId, idMap),
    player_in_id: mapPlayerId(t.inSourceId, idMap),
    price_out: t.priceOut,
    price_in: t.priceIn,
    cost: t.cost,
    hit: t.hit,
    chip: t.chip ?? null,
  }));
  return {
    _team_id: input.teamId,
    _expected_version: input.expectedVersion,
    _formation: input.formation,
    _bank: input.bank,
    _free_transfers: input.freeTransfers,
    _pending_transfers: input.pendingTransfers,
    _current_gameweek_id: input.currentGameweekId,
    _lifecycle: input.lifecycle as unknown as Json,
    _squad: squadToJson(input.squad, input.purchasePrices, idMap),
    _transfers: transfersJson as unknown as Json,
  };
}

export function buildFinalizeGameweekPayload(
  input: FinalizeGameweekPayloadInput,
  idMap: FantasyIdMap,
): FinalizeArgs {
  const effCap = input.result.effectiveCaptainId
    ? mapPlayerId(input.result.effectiveCaptainId, idMap)
    : null;

  const postTeam: Record<string, Json> = {
    formation: input.postTeam.formation,
    bank: input.postTeam.bank,
    free_transfers: input.postTeam.freeTransfers,
    pending_transfers: input.postTeam.pendingTransfers,
    current_gameweek_id: asNullableUuidArg(input.postTeam.currentGameweekId),
    lifecycle_state: input.postTeam.lifecycle as unknown as Json,
  };
  if (input.postTeam.squad && input.postTeam.squad.length === 15) {
    // Squad replacement — Free Hit restoration or Wildcard retention.
    const mapped = mapSquad(input.postTeam.squad, idMap);
    const prices = input.postTeam.purchasePrices ?? {};
    postTeam.squad = mapped.map((m) => {
      const price = prices[m.sourceId];
      if (typeof price !== "number") {
        // Missing price would silently zero out — surface at dev time.

        console.warn(
          `[fantasy-payloads] finalize post-squad missing purchase price for ${m.sourceId}`,
        );
      }
      return {
        player_id: m.playerId,
        slot: m.slot,
        is_captain: m.isCaptain,
        is_vice: m.isViceCaptain,
        purchase_price: typeof price === "number" ? price : 0,
      };
    }) as unknown as Json;
  }

  const resultJson: Record<string, Json> = {
    final_points: input.result.totalPoints,
    raw_points: input.result.rawXiPoints,
    captain_points: input.result.captainBonus,
    bench_points: input.result.originalBenchPoints,
    bench_boost_points: input.result.benchBoostContribution,
    triple_captain_points: input.result.tripleCaptainContribution,
    transfer_hit: input.result.transferHitPoints,
    effective_captain_id: effCap as unknown as Json,
    captain_multiplier: input.result.captainMultiplier,
    auto_subs: input.result.autoSubs as unknown as Json,
    chip: (input.result.chipUsed ?? null) as unknown as Json,
  };

  return {
    _team_id: input.teamId,
    _expected_version: input.expectedVersion,
    _gameweek_id: input.gameweekId,
    _season: input.season,
    _chip_finalize: asNullableTextArg(input.chipFinalize),
    _result: resultJson as unknown as Json,
    _post_team: postTeam as unknown as Json,
  };
}
