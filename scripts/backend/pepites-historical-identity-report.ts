import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  requestSportsMonksJson,
  requireSportsMonksToken,
  SPORTSMONKS_BASE_PATH,
  type ProbeDependencies,
} from "./sportsmonks-production-probe";

// Scope of the two quarantined 2025/26 fixtures. This tool never writes to
// Supabase, matches a player automatically, or modifies a provider response.
export const PEPITES_IDENTITY_FIXTURES = [19596474, 19596475] as const;

function fail(): never {
  throw new Error("PEPITES_IDENTITY_REPORT_INVALID_PAYLOAD");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function id(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return fail();
  return value;
}
function hint(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return fail();
  return value.trim() || null;
}

export function extractIdentityHints(payload: unknown, fixtureId: number) {
  if (!(PEPITES_IDENTITY_FIXTURES as readonly number[]).includes(fixtureId)) return fail();
  const fixture = record(record(payload).data);
  if (fixture.id !== fixtureId || fixture.season_id !== 26027 || fixture.league_id !== 860)
    return fail();
  if (
    !Array.isArray(fixture.lineups) ||
    fixture.lineups.length < 22 ||
    fixture.lineups.length > 100
  )
    return fail();
  const seen = new Set<number>();
  const rows = fixture.lineups.map((value, rowIndex) => {
    const row = record(value);
    const lineupId = id(row.id);
    if (seen.has(lineupId)) return fail();
    seen.add(lineupId);
    if (row.type_id !== 11 && row.type_id !== 12) return fail();
    const jersey = row.jersey_number;
    if (
      jersey != null &&
      (!Number.isSafeInteger(jersey) || (jersey as number) < 0 || (jersey as number) > 999)
    )
      return fail();
    return {
      rowIndex,
      lineupId,
      teamId: id(row.team_id),
      playerId: row.player_id == null || row.player_id === 0 ? null : id(row.player_id),
      playerName: hint(row.player_name),
      jerseyNumber: jersey ?? null,
      participation: row.type_id === 11 ? "starter" : "substitute",
    };
  });
  if (
    new Set(rows.map((row) => row.teamId)).size !== 2 ||
    rows.filter((row) => row.participation === "starter").length !== 22
  )
    return fail();
  return {
    fixtureId,
    seasonId: 26027,
    // Detect provider revisions before any future reviewed reconciliation.
    payloadSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    anonymousStarters: rows.filter(
      (row) => row.playerId === null && row.participation === "starter",
    ).length,
    anonymousSubstitutes: rows.filter(
      (row) => row.playerId === null && row.participation === "substitute",
    ).length,
    rows,
  };
}

export async function runIdentityReport(
  values: Readonly<Record<string, string | undefined>>,
  dependencies: ProbeDependencies = {},
) {
  const token = requireSportsMonksToken(values.SPORTSMONKS_API_TOKEN);
  const fixtures = [];
  for (const fixtureId of PEPITES_IDENTITY_FIXTURES) {
    const payload = await requestSportsMonksJson(
      `${SPORTSMONKS_BASE_PATH}/fixtures/${fixtureId}`,
      { include: "lineups" },
      token,
      dependencies,
    );
    fixtures.push(extractIdentityHints(payload, fixtureId));
  }
  const report = {
    schemaVersion: 1,
    mode: "read_only_identity_review",
    observedAt: (dependencies.now?.() ?? new Date()).toISOString(),
    databaseWrites: false,
    automaticIdentityResolution: false,
    fixtures,
  };
  if (JSON.stringify(report).includes(token))
    throw new Error("PEPITES_IDENTITY_REPORT_CREDENTIAL_IN_EVIDENCE");
  return report;
}

if (import.meta.main) {
  try {
    const directory = process.env.PEPITES_IDENTITY_REPORT_DIR;
    if (!directory) throw new Error("missing_output_directory");
    const report = await runIdentityReport(process.env);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // Exclusive creation prevents overwriting earlier evidence or following a
    // pre-existing output symlink. No names/payload/credentials in console logs.
    await writeFile(
      resolve(directory, "pepites-historical-identity-review.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );
    console.log("PEPITES_IDENTITY_REPORT_READY fixtures=2 databaseWrites=false");
  } catch {
    console.error("PEPITES_IDENTITY_REPORT_FAILED");
    process.exitCode = 1;
  }
}
