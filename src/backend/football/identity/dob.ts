import type { ProviderDobState } from "./contracts";

/** Ages outside this range are implausible for a professional squad and give no signal. */
export const MIN_PLAUSIBLE_AGE = 15;
export const MAX_PLAUSIBLE_AGE = 50;

export interface ClassifiedDob {
  readonly state: ProviderDobState;
  /** ISO date (YYYY-MM-DD), set only when `state` is `valid`. */
  readonly birthDate: string | null;
  /** A valid date that falls on 1 January. */
  readonly january1: boolean;
  /** Two representations were given and they name different days. */
  readonly representationDisagreement: boolean;
}

const MS_THRESHOLD = 1e11;

function dayFromTimestamp(value: unknown): Date | "unparseable" | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return "unparseable";
  // Seconds, unless the number is large enough to be milliseconds.
  const ms = Math.abs(value) > MS_THRESHOLD ? value : value * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "unparseable" : date;
}

function dayFromText(value: unknown): Date | "unparseable" | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "unparseable";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(value.trim());
  if (!match) return "unparseable";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return "unparseable";
  return date;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const startOfUtcDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** Whole years on `now`, by calendar date in UTC. */
export function ageOn(birth: Date, now: Date): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

type DateState = "valid" | "future" | "age_below_minimum" | "age_above_maximum";

function classifyDate(date: Date, now: Date): DateState {
  if (startOfUtcDay(date) > startOfUtcDay(now)) return "future";
  const age = ageOn(date, now);
  if (age < MIN_PLAUSIBLE_AGE) return "age_below_minimum";
  if (age > MAX_PLAUSIBLE_AGE) return "age_above_maximum";
  return "valid";
}

/**
 * A provider's date of birth, from a timestamp and/or a date string. Missing,
 * unparseable, future and implausible-age dates all give NO SIGNAL; nothing
 * here can count against a player.
 */
export function classifyProviderDob(
  input: { readonly timestamp?: unknown; readonly text?: unknown },
  now: Date,
): ClassifiedDob {
  const fromTimestamp = dayFromTimestamp(input.timestamp);
  const fromText = dayFromText(input.text);
  const supplied = [fromTimestamp, fromText].filter((value) => value !== null);
  if (supplied.length === 0)
    return {
      state: "missing",
      birthDate: null,
      january1: false,
      representationDisagreement: false,
    };
  const dates = supplied.filter((value): value is Date => value !== "unparseable");
  if (dates.length === 0)
    return {
      state: "unparseable",
      birthDate: null,
      january1: false,
      representationDisagreement: false,
    };
  const primary = dates[0]!;
  const disagreement = dates.length === 2 && isoDay(dates[0]!) !== isoDay(dates[1]!);
  const state = classifyDate(primary, now);
  return {
    state,
    birthDate: state === "valid" ? isoDay(primary) : null,
    january1: state === "valid" && primary.getUTCMonth() === 0 && primary.getUTCDate() === 1,
    representationDisagreement: disagreement,
  };
}

/**
 * How far the app catalog's own date of birth can be trusted for ranking.
 * A date on 1 January is LOW CONFIDENCE (the catalog holds 23 of them, about
 * 17 times chance): it gives no match signal and no conflict signal.
 */
export type AppDobState =
  | "valid"
  | "january_first_low_confidence"
  | "missing"
  | "unparseable"
  | "future"
  | "age_below_minimum"
  | "age_above_maximum";

export interface ClassifiedAppDob {
  readonly state: AppDobState;
  readonly birthDate: string | null;
}

export function classifyAppDob(value: string | null | undefined, now: Date): ClassifiedAppDob {
  if (value === null || value === undefined || value === "")
    return { state: "missing", birthDate: null };
  const date = dayFromText(value);
  if (date === null || date === "unparseable") return { state: "unparseable", birthDate: null };
  const state = classifyDate(date, now);
  if (state !== "valid") return { state, birthDate: null };
  if (date.getUTCMonth() === 0 && date.getUTCDate() === 1)
    return { state: "january_first_low_confidence", birthDate: isoDay(date) };
  return { state: "valid", birthDate: isoDay(date) };
}

export type DobSignal =
  | { readonly kind: "match" }
  | { readonly kind: "conflict" }
  | { readonly kind: "no_signal"; readonly reason: string };

/**
 * The only DOB signal there is. It needs a valid date on BOTH sides:
 * - app date missing, unparseable, implausible or on 1 January: no signal;
 * - provider date missing, not provided, unparseable, implausible or on
 *   1 January (a conservative mirror of the app rule): no signal;
 * - both valid and equal: a match (strong, but only ever a reviewer signal);
 * - both valid and different: a conflict, shown to the reviewer, never a
 *   reason to remove the candidate.
 * The coverage of the club the player belongs to is not an input.
 */
export function dobSignal(app: ClassifiedAppDob, provider: ClassifiedDob): DobSignal {
  if (app.state !== "valid") return { kind: "no_signal", reason: `app_${app.state}` };
  if (provider.state !== "valid")
    return { kind: "no_signal", reason: `provider_${provider.state}` };
  if (provider.january1)
    return { kind: "no_signal", reason: "provider_january_first_low_confidence" };
  return app.birthDate === provider.birthDate ? { kind: "match" } : { kind: "conflict" };
}
