/**
 * Date-of-birth corroboration between a Sofascore player and a Flashscore
 * player, from responses already in memory. Pure: no network, no clock (the
 * caller supplies `now`), no file.
 *
 * What leaves this file is a STATE (agree, disagree, no signal) and a format
 * class, never a date, a timestamp or a name: the workflow log of a public
 * repository is public. Both dates are read, compared in memory and dropped.
 *
 * Only a date that is present, parseable, plausible and NOT 1 January counts.
 * A placeholder date is no signal (as in the squad evidence). A missing or
 * unreadable date can never count against a player: it is "no signal".
 *
 * What agreement shows: two providers give the same person the same birth date.
 * It is a strong, name-independent corroboration of a pairing that another
 * signal (a shirt number on the same side of the same match) already proposes.
 * It does not show the player's club on a match date, his position, or that
 * he played.
 */
import { classifyProviderDob } from "../football/identity/dob";

export type DobCorroboration =
  | "AGREE"
  | "DISAGREE"
  | "NO_SIGNAL_SOFASCORE"
  | "NO_SIGNAL_FLASHSCORE"
  | "NO_SIGNAL_BOTH";

/** How the Flashscore value was written. A class only, never the value. */
export type FlashscoreDobFormat =
  | "absent"
  | "unix_seconds"
  | "unix_milliseconds"
  | "iso_date"
  | "other";

export interface CorroborationPair {
  readonly sofascoreFixtureId: string;
  readonly sofascorePlayerId: string;
  readonly flashscorePlayerId: string;
}

export interface CorroborationResult extends CorroborationPair {
  readonly dob: DobCorroboration;
  readonly sofascoreState: string;
  readonly flashscoreState: string;
  readonly flashscoreFormat: FlashscoreDobFormat;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Sofascore `matches/get-lineups`: birth dates of every player in the match, keyed by player id. */
export function sofascoreBirthdaysFromLineups(body: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (!isRecord(body)) return out;
  for (const side of ["home", "away"]) {
    const players = isRecord(body[side]) ? (body[side] as Record<string, unknown>).players : null;
    if (!Array.isArray(players)) continue;
    for (const entry of players) {
      const player = isRecord(entry) && isRecord(entry.player) ? entry.player : null;
      if (!player || player.id === undefined || player.id === null) continue;
      out.set(String(player.id), player.dateOfBirthTimestamp);
    }
  }
  return out;
}

/** Flashscore `v1/players/data`: the raw `BIRTHDAY_TIME` value (kept in memory only). */
export function flashscoreBirthdayFromPlayerData(body: unknown): unknown {
  if (!isRecord(body)) return undefined;
  const data = Array.isArray(body.DATA) ? body.DATA[0] : body.DATA;
  return isRecord(data) ? data.BIRTHDAY_TIME : undefined;
}

export function flashscoreDobFormat(value: unknown): FlashscoreDobFormat {
  if (value === undefined || value === null || value === "") return "absent";
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string") return "other";
  if (/^-?\d{9,10}$/.test(text.trim())) return "unix_seconds";
  if (/^-?\d{12,13}$/.test(text.trim())) return "unix_milliseconds";
  if (/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(text.trim())) return "iso_date";
  return "other";
}

function readFlashscore(value: unknown, now: Date) {
  const format = flashscoreDobFormat(value);
  if (format === "unix_seconds" || format === "unix_milliseconds") {
    return { format, dob: classifyProviderDob({ timestamp: Number(value) }, now) };
  }
  if (format === "iso_date") return { format, dob: classifyProviderDob({ text: value }, now) };
  return { format, dob: classifyProviderDob({}, now) };
}

const usable = (dob: ReturnType<typeof classifyProviderDob>) =>
  dob.state === "valid" && !dob.january1 && dob.birthDate !== null;

/** Compare one pair. `sofascoreRaw` and `flashscoreRaw` are the raw provider values. */
export function corroborateDob(
  pair: CorroborationPair,
  sofascoreRaw: unknown,
  flashscoreRaw: unknown,
  now: Date,
): CorroborationResult {
  const sofa = classifyProviderDob({ timestamp: sofascoreRaw }, now);
  const flash = readFlashscore(flashscoreRaw, now);
  const stateOf = (dob: ReturnType<typeof classifyProviderDob>) =>
    dob.state === "valid" && dob.january1 ? "placeholder_january_1" : dob.state;
  const a = usable(sofa);
  const b = usable(flash.dob);
  const dob: DobCorroboration =
    a && b
      ? sofa.birthDate === flash.dob.birthDate
        ? "AGREE"
        : "DISAGREE"
      : !a && !b
        ? "NO_SIGNAL_BOTH"
        : !a
          ? "NO_SIGNAL_SOFASCORE"
          : "NO_SIGNAL_FLASHSCORE";
  return {
    ...pair,
    dob,
    sofascoreState: stateOf(sofa),
    flashscoreState: stateOf(flash.dob),
    flashscoreFormat: flash.format,
  };
}

const DATE_LIKE = [
  /\b(?:19|20)\d{2}[-/.]\d{2}[-/.]\d{2}\b/,
  /\b\d{2}[-/.]\d{2}[-/.](?:19|20)\d{2}\b/,
  // A timestamp: nine or more digits in a row. Provider ids are shorter or alphanumeric.
  /\b\d{9,13}\b/,
];

/** Refuse any text that looks like it carries a date or a timestamp. */
export function assertNoDates(text: string): void {
  for (const pattern of DATE_LIKE) {
    if (pattern.test(text)) throw new Error("Output refused: it looks like it carries a date.");
  }
}
