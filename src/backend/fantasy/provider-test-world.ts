/**
 * Hand-built matches for synthetic tests of the reconciler and the bridge.
 * Every id here exists nowhere: nothing in this file is a real payload.
 */
import type {
  MatchSide,
  PerformanceIncident,
  PerformanceLineupPlayer,
} from "../football/provider/performance-contracts";
import type { ProviderMatchData } from "./provider-reconciler";
import { buildReviewedIdentitySnapshot, type MappingRowInput } from "./reviewed-identities";

export const OBSERVED_AT = "2026-10-01T12:00:00.000Z";
export const X = "00000000-0000-4000-8000-0000000000a1";
export const Y = "00000000-0000-4000-8000-0000000000a2";
export const Z = "00000000-0000-4000-8000-0000000000a3";

export type Provider = "sofascore" | "flashscore";

export interface Spec {
  /** Per provider, per side: shirt numbers of the 11 starters (default 1..11). */
  shirts?: Partial<Record<`${Provider}.${MatchSide}`, readonly number[]>>;
  /** Goals as [side, minute, sofascore shirt, flashscore shirt]. */
  goals?: readonly (readonly [MatchSide, number, number, number])[];
  names?: (provider: Provider, side: MatchSide, shirt: number) => string;
}

export const sid = (side: MatchSide, shirt: number) => `s-${side[0]}${shirt}`;
export const fid = (side: MatchSide, shirt: number) => `f-${side[0]}${shirt}`;
export const DEFAULT_SHIRTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function lineup(
  provider: Provider,
  spec: Spec,
  idOf: (side: MatchSide, shirt: number) => string,
): PerformanceLineupPlayer[] {
  const out: PerformanceLineupPlayer[] = [];
  for (const side of ["home", "away"] as const) {
    for (const shirt of spec.shirts?.[`${provider}.${side}`] ?? DEFAULT_SHIRTS) {
      out.push({
        provider,
        externalId: idOf(side, shirt),
        name: spec.names ? spec.names(provider, side, shirt) : `${provider} ${side} ${shirt}`,
        side,
        shirtNumber: shirt,
        position: shirt === 1 ? "G" : null,
        starter: true,
        stats: null,
      });
    }
  }
  return out;
}

export function build(spec: Spec = {}): {
  sofascore: ProviderMatchData;
  flashscore: ProviderMatchData;
} {
  const goals = spec.goals ?? [];
  const score = (side: MatchSide) => goals.filter((g) => g[0] === side).length;
  const incidents = (provider: Provider): PerformanceIncident[] =>
    goals.map(([side, minute, sShirt, fShirt]) => ({
      provider,
      kind: "goal",
      side,
      minute,
      addedMinutes: null,
      player: {
        externalId: provider === "sofascore" ? sid(side, sShirt) : fid(side, fShirt),
        name: "n",
      },
      assist: null,
      playerIn: null,
      playerOut: null,
      rawType: "goal",
      rawClass: null,
    }));
  const data = (
    provider: Provider,
    idOf: (side: MatchSide, shirt: number) => string,
  ): ProviderMatchData => ({
    summary: {
      provider,
      externalId: provider === "sofascore" ? "S-FIX" : "F-FIX",
      kickoffAt: "2026-10-01T10:00:00.000Z",
      finished: true,
      homeName: "H",
      awayName: "A",
      homeScore: score("home"),
      awayScore: score("away"),
      round: 1,
    },
    lineups: { provider, players: lineup(provider, spec, idOf), fullCoverage: false },
    incidents: incidents(provider),
    statistics: [],
  });
  return { sofascore: data("sofascore", sid), flashscore: data("flashscore", fid) };
}

export const row = (
  provider: Provider,
  externalId: string,
  appPlayerId: string,
  over: Partial<MappingRowInput> = {},
): MappingRowInput => ({
  mappingId: `m-${provider}-${externalId}`,
  provider,
  externalId,
  appPlayerId,
  active: true,
  reviewed: true,
  version: `football_player_mapping:${externalId}`,
  updatedAt: "2026-10-03T06:00:00.000Z",
  ...over,
});

export const snapshot = (rows: readonly MappingRowInput[]) =>
  buildReviewedIdentitySnapshot(rows, "2026-10-03T07:00:00.000Z");
