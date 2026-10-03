/**
 * Read-only player-identity evidence collected from provider squads.
 *
 * Three kinds of content, kept apart on purpose:
 *
 * - MACHINE STRUCTURAL INPUT: the provider, the provider player id, the squad
 *   (team) the request was made for, and whether the provider's response was
 *   complete. These are the only things code may use to decide who is who.
 * - REVIEWER / RANKING SIGNALS: a valid date of birth, shirt number, position,
 *   height, nationality and the provider's own registered team. They help a
 *   person decide; no single one approves anything, and a missing or
 *   implausible value is NO SIGNAL (never evidence against a player).
 * - PRIVATE REVIEWER INPUT: names. Held in memory for the reviewer's screen.
 *   No ranking, matching or evidence code reads them. (The date of birth value
 *   is a signal value, kept in memory only so it can be compared; the
 *   sanitized evidence never contains a name or a date.)
 */
export type ProviderName = "sofascore" | "flashscore";

/** The four positions both providers can be reduced to. */
export type PositionSignal = "G" | "D" | "M" | "F";

/**
 * What a provider's date of birth is worth. `valid` is the only state that can
 * produce a signal. `not_provided` means the endpoint does not carry the field
 * at all (Flashscore squads), as opposed to `missing` (the provider left it out).
 */
export type ProviderDobState =
  | "valid"
  | "missing"
  | "not_provided"
  | "unparseable"
  | "future"
  | "age_below_minimum"
  | "age_above_maximum";

export type CompletenessReason =
  | "fetch_failed"
  | "invalid_payload"
  | "empty_response"
  | "below_conservative_minimum"
  | "extreme_disagreement_with_comparison"
  | "malformed_entries"
  | "no_goalkeeper_listed";

/**
 * `INCOMPLETE_PROVIDER_SQUAD`: the players present are positive evidence, but
 * the absence of a player is NOT evidence of anything.
 */
export interface SquadCompleteness {
  readonly state: "COMPLETE" | "INCOMPLETE_PROVIDER_SQUAD";
  readonly reasons: readonly CompletenessReason[];
}

/**
 * Held in memory for the reviewer's screen only. Never read by ranking or
 * matching and never written to evidence: today that is the display name.
 */
export interface PrivateReviewerInput {
  readonly displayName: string | null;
}

/**
 * Signal VALUES, held in memory so a signal can be compared. Used by ranking
 * (a valid date can match or conflict) but never written to evidence.
 */
export interface SignalValues {
  /** ISO date (YYYY-MM-DD), only when the provider's date is valid. */
  readonly birthDate: string | null;
}

export interface ProviderSquadPlayer {
  // MACHINE STRUCTURAL INPUT
  readonly provider: ProviderName;
  readonly externalPlayerId: string;
  readonly requestedTeamId: string;
  readonly squadCompleteness: SquadCompleteness["state"];
  // REVIEWER / RANKING SIGNALS (null or a non-valid state means no signal)
  /** The provider's own registered team for the player, when it gives one. A signal only. */
  readonly registeredTeamId: string | null;
  readonly registeredTeamDisagreement: boolean;
  readonly shirtNumber: number | null;
  readonly positionSignal: PositionSignal | null;
  readonly dobSignalState: ProviderDobState;
  /** True only for a valid date that falls on 1 January (a possible placeholder). */
  readonly dobJanuary1: boolean;
  readonly heightSignal: number | null;
  /** `alpha2:MA` (Sofascore) or `flag:76` (Flashscore's own flag id); not comparable across providers. */
  readonly nationalitySignal: string | null;
  readonly signalValues: SignalValues;
  // PRIVATE REVIEWER INPUT
  readonly private: PrivateReviewerInput;
}

export interface SquadDiagnostics {
  /** Entries the provider listed (coaches included). */
  readonly listedEntries: number;
  readonly malformedEntries: number;
  readonly excludedCoaches: number;
  readonly unknownPositionLabels: number;
  /** Ids that appeared more than once in this one squad (only the first is kept). */
  readonly duplicateIds: readonly string[];
  /** Sofascore only: sizes of the other lists a squad response carries. */
  readonly otherLists: { readonly foreign: number | null; readonly national: number | null };
}

export interface ProviderSquad {
  readonly provider: ProviderName;
  readonly clubKey: string;
  readonly requestedTeamId: string;
  readonly status: "ok" | "fetch_failed" | "invalid_payload";
  /** A stable code only; never a response body. */
  readonly errorCode: string | null;
  readonly players: readonly ProviderSquadPlayer[];
  readonly diagnostics: SquadDiagnostics;
  readonly completeness: SquadCompleteness;
}

export const EMPTY_DIAGNOSTICS: SquadDiagnostics = {
  listedEntries: 0,
  malformedEntries: 0,
  excludedCoaches: 0,
  unknownPositionLabels: 0,
  duplicateIds: [],
  otherLists: { foreign: null, national: null },
};
