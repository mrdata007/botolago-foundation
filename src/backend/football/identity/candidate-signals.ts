import type { PositionSignal, ProviderSquadPlayer } from "./contracts";
import { classifyAppDob, classifyProviderDob, dobSignal, type DobSignal } from "./dob";

/**
 * The app player a provider candidate may be paired with. Everything but
 * `appPlayerId` and `teamId` is a reviewer/ranking signal. `displayName` is
 * for the reviewer's screen only: nothing in this file reads it.
 */
export interface AppPlayerAttributes {
  readonly appPlayerId: string;
  readonly teamId: string;
  readonly birthDate: string | null;
  readonly shirtNumber: number | null;
  readonly position: PositionSignal | null;
  readonly heightCm?: number | null;
  readonly nationality?: string | null;
  readonly displayName?: string | null;
}

export type CandidateFlag =
  | "DOB_CONFLICT"
  | "POSITION_DISAGREEMENT"
  | "REGISTERED_TEAM_DISAGREEMENT"
  | "SHIRT_DIFFERENCE"
  | "INCOMPLETE_PROVIDER_SQUAD";

type Agreement = "match" | "conflict" | "no_signal";

export interface CandidateSignals {
  readonly dob: DobSignal;
  readonly shirt: Agreement;
  readonly position: Agreement;
  /** For a reviewer to see. A flag never removes a candidate and never approves one. */
  readonly flags: readonly CandidateFlag[];
}

/**
 * Ranking weights. Only AGREEMENT adds; a valid-against-valid conflict lowers
 * the rank a little and is flagged. A missing, implausible or suspicious value
 * is no signal and changes nothing, so a club with poor coverage never costs
 * its players rank. No weight is for height, nationality, the registered team
 * or any name.
 */
export const SIGNAL_WEIGHTS = {
  dobMatch: 4,
  dobConflict: -2,
  shirtMatch: 1,
  positionMatch: 1,
  positionConflict: -1,
} as const;

function compare<T>(a: T | null | undefined, b: T | null | undefined): Agreement {
  if (a === null || a === undefined || b === null || b === undefined) return "no_signal";
  return a === b ? "match" : "conflict";
}

export function evaluateSignals(
  provider: ProviderSquadPlayer,
  app: AppPlayerAttributes,
  now: Date,
): CandidateSignals {
  const providerDob = {
    state: provider.dobSignalState,
    birthDate: provider.signalValues.birthDate,
    january1: provider.dobJanuary1,
    representationDisagreement: false,
  };
  const dob = dobSignal(classifyAppDob(app.birthDate, now), providerDob);
  const shirt = compare(provider.shirtNumber, app.shirtNumber);
  const position = compare(provider.positionSignal, app.position);
  const flags: CandidateFlag[] = [];
  if (dob.kind === "conflict") flags.push("DOB_CONFLICT");
  if (position === "conflict") flags.push("POSITION_DISAGREEMENT");
  if (provider.registeredTeamDisagreement) flags.push("REGISTERED_TEAM_DISAGREEMENT");
  if (shirt === "conflict") flags.push("SHIRT_DIFFERENCE");
  if (provider.squadCompleteness === "INCOMPLETE_PROVIDER_SQUAD")
    flags.push("INCOMPLETE_PROVIDER_SQUAD");
  return { dob, shirt, position, flags };
}

export function rankScore(signals: CandidateSignals): number {
  let score = 0;
  if (signals.dob.kind === "match") score += SIGNAL_WEIGHTS.dobMatch;
  if (signals.dob.kind === "conflict") score += SIGNAL_WEIGHTS.dobConflict;
  if (signals.shirt === "match") score += SIGNAL_WEIGHTS.shirtMatch;
  if (signals.position === "match") score += SIGNAL_WEIGHTS.positionMatch;
  if (signals.position === "conflict") score += SIGNAL_WEIGHTS.positionConflict;
  return score;
}

export interface RankedCandidate {
  readonly app: AppPlayerAttributes;
  readonly signals: CandidateSignals;
  readonly score: number;
}

/**
 * Ranks every given app player; never drops one. Ties break on the app player
 * id (a stable, name-free order). Provider candidates and app players are
 * paired by a person, never by this.
 */
export function rankAppCandidates(
  provider: ProviderSquadPlayer,
  apps: readonly AppPlayerAttributes[],
  now: Date,
): RankedCandidate[] {
  return apps
    .map((app) => {
      const signals = evaluateSignals(provider, app, now);
      return { app, signals, score: rankScore(signals) };
    })
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.app.appPlayerId < b.app.appPlayerId
          ? -1
          : a.app.appPlayerId > b.app.appPlayerId
            ? 1
            : 0,
    );
}

// Kept so a caller can build a provider DOB for a test or a screen without re-parsing.
export { classifyProviderDob };
