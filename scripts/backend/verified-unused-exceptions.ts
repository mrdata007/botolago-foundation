import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The owner-reviewed allowlist of lineup players who may be left out of ONE
 * finished fixture's performance rows because the provider shows them as
 * unused substitutes and the canonical list cannot place them.
 *
 * It is a file in the repository, so every entry is a reviewed commit, and a
 * run only ever sees the entries of the exact commit it was dispatched at.
 * Nothing is discovered at run time: a player who is not listed is never left
 * out, whatever the provider says about him.
 */
export const ALLOWLIST_PATH = "scripts/backend/verified-unused-exceptions.json";
export const ALLOWLIST_SCHEMA = "botolago.verified-unused-exceptions.v1";
/** Most players one fixture may leave out. The database enforces the same limit. */
export const MAX_EXCEPTIONS_PER_FIXTURE = 2;

export type VerifiedUnusedException = {
  fixtureExternalId: string;
  externalPlayerId: string;
  /** Only an approved entry is ever honoured; a proposed one is read, never used. */
  status: "proposed" | "approved";
  /** The owner-reviewed preflight record (a file under docs/production/). */
  preflightRecord: string;
  /** sha256 of that file's bytes at review time; a changed file is refused. */
  preflightSha256: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

export class VerifiedUnusedAllowlistError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function bad(code: string): never {
  throw new VerifiedUnusedAllowlistError(code);
}

const PROVIDER_ID = /^[1-9]\d{0,14}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ENTRY_KEYS = [
  "approvedAt",
  "approvedBy",
  "externalPlayerId",
  "fixtureExternalId",
  "preflightRecord",
  "preflightSha256",
  "status",
];

/** Strict: unknown keys, wrong types and over-broad scopes are all refused. */
export function parseAllowlist(raw: unknown): VerifiedUnusedException[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("allowlist_not_an_object");
  const document = raw as Record<string, unknown>;
  if (
    Object.keys(document).sort().join() !== "exceptions,schema" ||
    document.schema !== ALLOWLIST_SCHEMA ||
    !Array.isArray(document.exceptions)
  )
    bad("allowlist_shape_invalid");
  const entries: VerifiedUnusedException[] = [];
  for (const candidate of document.exceptions as unknown[]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      bad("allowlist_entry_invalid");
    const entry = candidate as Record<string, unknown>;
    if (Object.keys(entry).sort().join() !== ENTRY_KEYS.join()) bad("allowlist_entry_keys_invalid");
    if (
      typeof entry.fixtureExternalId !== "string" ||
      !PROVIDER_ID.test(entry.fixtureExternalId) ||
      typeof entry.externalPlayerId !== "string" ||
      !PROVIDER_ID.test(entry.externalPlayerId) ||
      (entry.status !== "proposed" && entry.status !== "approved") ||
      typeof entry.preflightRecord !== "string" ||
      !/^docs\/production\/[A-Za-z0-9_.-]+\.md$/.test(entry.preflightRecord) ||
      typeof entry.preflightSha256 !== "string" ||
      !SHA256.test(entry.preflightSha256)
    )
      bad("allowlist_entry_invalid");
    // An approval says who and when; a proposal says neither.
    const approved = entry.status === "approved";
    if (
      approved
        ? typeof entry.approvedBy !== "string" ||
          entry.approvedBy.length === 0 ||
          typeof entry.approvedAt !== "string" ||
          Number.isNaN(Date.parse(entry.approvedAt))
        : entry.approvedBy !== null || entry.approvedAt !== null
    )
      bad("allowlist_approval_invalid");
    entries.push(entry as unknown as VerifiedUnusedException);
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.fixtureExternalId}:${entry.externalPlayerId}`;
    if (seen.has(key)) bad("allowlist_duplicate_entry");
    seen.add(key);
  }
  for (const fixtureId of new Set(entries.map((entry) => entry.fixtureExternalId)))
    if (
      entries.filter((entry) => entry.fixtureExternalId === fixtureId).length >
      MAX_EXCEPTIONS_PER_FIXTURE
    )
      bad("allowlist_too_many_for_one_fixture");
  return entries;
}

export function loadAllowlist(
  readText: (path: string) => string = (path) =>
    readFileSync(resolve(import.meta.dir, "../..", path), "utf8"),
): VerifiedUnusedException[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readText(ALLOWLIST_PATH));
  } catch (error) {
    if (error instanceof VerifiedUnusedAllowlistError) throw error;
    bad("allowlist_unreadable");
  }
  return parseAllowlist(raw);
}

/** The entries of one fixture, whatever their status (diagnose shows them all). */
export function entriesFor(
  allowlist: VerifiedUnusedException[],
  fixtureExternalId: string,
): VerifiedUnusedException[] {
  return allowlist.filter((entry) => entry.fixtureExternalId === fixtureExternalId);
}

/** The sha256 of the preflight record the entry names; refused if it is not the reviewed one. */
export function reviewedPreflightDigest(
  entry: VerifiedUnusedException,
  readBytes: (path: string) => Uint8Array = (path) =>
    readFileSync(resolve(import.meta.dir, "../..", path)),
): string {
  let bytes: Uint8Array;
  try {
    bytes = readBytes(entry.preflightRecord);
  } catch {
    bad("preflight_record_unreadable");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== entry.preflightSha256) bad("preflight_record_changed_since_review");
  return digest;
}

export type UnusedFacts = {
  externalPlayerId: string;
  externalTeamId: string;
  role: "starter" | "substitute" | "unknown";
  officialMinutes: number | null;
  scoringStatisticTypeIds: number[];
  unknownStatisticTypeIds: number[];
  zeroStatisticTypeIds: number[];
  eventTypeIds: number[];
};

/** Why the provider's facts do NOT show him as unused; empty means they do. Type ids only. */
export function unusedShortfalls(facts: UnusedFacts | undefined): string[] {
  if (!facts) return ["not_in_the_lineup"];
  const reasons: string[] = [];
  if (facts.role !== "substitute") reasons.push("not_a_substitute");
  if ((facts.officialMinutes ?? 0) !== 0) reasons.push("official_minutes_above_zero");
  if (facts.scoringStatisticTypeIds.length > 0) reasons.push("scoring_statistic_with_a_value");
  if (facts.unknownStatisticTypeIds.length > 0) reasons.push("unknown_statistic");
  if (facts.eventTypeIds.length > 0) reasons.push("named_by_a_match_event");
  return reasons;
}

/**
 * The digest of the facts the importer declares. The database recomputes it
 * from the declaration (same text, same hash), so a declaration cannot say one
 * thing and carry the digest of another. It does not prove the provider said
 * it: that is trusted importer evidence, stored with the exclusion.
 */
export function evidenceDigest(fixtureExternalId: string, facts: UnusedFacts): string {
  const list = (ids: number[]) => [...ids].sort((a, b) => a - b).join(",");
  return createHash("sha256")
    .update(
      `sportsmonks-verified-unused:v1|fixture=${fixtureExternalId}|player=${facts.externalPlayerId}` +
        `|team=${facts.externalTeamId}|role=substitute|minutes=${facts.officialMinutes === null ? "-" : "0"}` +
        `|scoring=${list(facts.scoringStatisticTypeIds)}|unknown=${list(facts.unknownStatisticTypeIds)}` +
        `|events=${list(facts.eventTypeIds)}|zero=${list(facts.zeroStatisticTypeIds)}`,
    )
    .digest("hex");
}

/** The declaration the database's contract takes, for facts that already show him unused. */
export function declarationFor(
  fixtureExternalId: string,
  facts: UnusedFacts,
  preflightDigest: string,
) {
  return {
    fixtureExternalId,
    externalPlayerId: facts.externalPlayerId,
    externalTeamId: facts.externalTeamId,
    role: "substitute" as const,
    officialMinutes: facts.officialMinutes,
    scoringStatisticTypeIds: [] as number[],
    unknownStatisticTypeIds: [] as number[],
    eventTypeIds: [] as number[],
    zeroStatisticTypeIds: [...facts.zeroStatisticTypeIds].sort((a, b) => a - b),
    evidenceDigest: evidenceDigest(fixtureExternalId, facts),
    preflightDigest,
  };
}
