/**
 * Provider-neutral shapes for per-match player performance data (Sofascore and
 * Flashscore). The adapters only read and normalise; deciding what is true when
 * the two disagree is the reconciler's job (plan section 4, Phase 2).
 *
 * Nothing here is guessed: an incident type or class that Phase 0 did not see
 * in a real response becomes `unknown` with its raw strings kept, so the
 * reconciler can send it to review instead of scoring it.
 */

export type MatchSide = "home" | "away";
export type PerformanceProvider = "sofascore" | "flashscore";

export interface ProviderQuota {
  readonly limit: number | null;
  readonly remaining: number | null;
}

export interface PerformancePlayerRef {
  /** Null when the provider names a player without an id (seen on a Flashscore substitute). */
  readonly externalId: string | null;
  readonly name: string;
}

export const PERFORMANCE_INCIDENT_KINDS = [
  "goal",
  "penalty_goal",
  "penalty_missed",
  "yellow_card",
  "second_yellow",
  "red_card",
  "substitution",
  "unknown",
] as const;
export type PerformanceIncidentKind = (typeof PERFORMANCE_INCIDENT_KINDS)[number];

export interface PerformanceIncident {
  readonly provider: PerformanceProvider;
  readonly kind: PerformanceIncidentKind;
  readonly side: MatchSide;
  readonly minute: number;
  readonly addedMinutes: number | null;
  /** Scorer, carded player, or the player who missed. Null for a substitution. */
  readonly player: PerformancePlayerRef | null;
  /** Named assister, when the provider names one. Absent is not the same as "no assist". */
  readonly assist: PerformancePlayerRef | null;
  readonly playerIn: PerformancePlayerRef | null;
  readonly playerOut: PerformancePlayerRef | null;
  /** The provider's own labels, kept verbatim for the reconciler and for review. */
  readonly rawType: string;
  readonly rawClass: string | null;
}

export type LineupPosition = "G" | "D" | "M" | "F";

export interface PerformanceLineupPlayer {
  readonly provider: PerformanceProvider;
  readonly externalId: string;
  readonly name: string;
  readonly side: MatchSide;
  readonly shirtNumber: number | null;
  /** Null when the provider gives none (Flashscore gives only a goalkeeper marker). */
  readonly position: LineupPosition | null;
  readonly starter: boolean;
  /** Sofascore only. Absent for a player who did not play. */
  readonly stats: PerformancePlayerStats | null;
}

export interface PerformancePlayerStats {
  readonly minutesPlayed: number | null;
  readonly goals: number | null;
  readonly assists: number | null;
  readonly ownGoals: number | null;
  /** Present only on a full-coverage match. Missing means unknown, never zero. */
  readonly saves: number | null;
  /** Display only (decision D3). Never points. */
  readonly rating: number | null;
  readonly penaltyMissed: number | null;
}

export interface PerformanceLineups {
  readonly provider: PerformanceProvider;
  readonly players: readonly PerformanceLineupPlayer[];
  /**
   * Sofascore: true when the statistics carry the full-coverage marker
   * (`totalPass`). On a limited match assists are 0 for everyone, which means
   * unknown. Flashscore has no per-player statistics, so this is false.
   */
  readonly fullCoverage: boolean;
}

export interface PerformanceStatisticLine {
  readonly period: string;
  readonly key: string;
  readonly label: string;
  readonly home: number | null;
  readonly away: number | null;
}

export interface PerformanceMatchSummary {
  readonly provider: PerformanceProvider;
  readonly externalId: string;
  readonly kickoffAt: string;
  readonly finished: boolean;
  readonly homeName: string;
  readonly awayName: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly round: number | null;
}
