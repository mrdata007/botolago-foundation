/**
 * Production candidate/observation population for the OTHER 15 clubs (every club
 * of the registry except Maghreb Fès, which the MAS Fès canary already recorded).
 *
 * Collects each club's squad from Sofascore (teams/get-squad) and Flashscore
 * (v1/teams/squad) with the approved read-only collector (30 requests), validates
 * every item against the recorder contract, and (write mode only) makes exactly ONE
 * call to api.football_mapping_record_observations as the service role. It reuses
 * the reviewed canary's validation, snapshot and single-call code.
 *
 *   MODE=dry-run  collect + validate + print sanitized counts; writes nothing.
 *   MODE=write    the same, then ONE recorder call (never retried), then a fresh
 *                 read of production that decides the outcome.
 *
 * It writes only candidates and observations through the recorder: no proposal, no
 * mapping, no audit row, no Fantasy row, no schedule. It never prints a name, a date
 * of birth, a provider id or a raw payload: counts and states only.
 */
import { createHash } from "node:crypto";
import { collectSquads, type FetchJson } from "../../src/backend/football/identity/collector";
import { CLUB_PROVIDER_TEAMS } from "../../src/backend/football/identity/club-registry";
import {
  toObservationRecords,
  type ObservationRecord,
} from "../../src/backend/football/identity/candidate-builder";
import {
  CLUB_KEY as MAS_FES_CLUB_KEY,
  PRE_EXPECT,
  PROJECT_REF,
  UNCHANGED_KEYS,
  callRecorderOnce,
  dryRunCounts,
  snapshot,
  validateRecord,
  type Snapshot,
} from "./production-mas-fes-candidate-canary";
import { probe } from "./provider-probe";

const API = "https://api.supabase.com";
const STAGING_REF = "srdrflfrfpwixsllveid";
/** The recorder refuses more than 2000 observations in one call. */
export const RECORDER_MAX = 2000;

export const OUT_OK = "CANDIDATE_POPULATION_APPLIED_AND_VERIFIED";
export const OUT_REFUSED = "CANDIDATE_POPULATION_REFUSED_NO_WRITE";
export const OUT_REVIEW = "CANDIDATE_POPULATION_NEEDS_REVIEW";

/** app.teams ids read from production (names matched by the owner-reviewed club list): a signal, never a filter. */
export const APP_TEAM_IDS: Readonly<Record<string, string>> = {
  "amal-tiznit": "1ebd788b-9f71-4a78-bfa8-68359d7f3a3f",
  "codm-meknes": "8059c0cf-8b7b-4317-be7e-fd646d377cd0",
  "cr-khemis-zemamra": "dc6fb819-6f3e-4584-ad73-7d567e80d32c",
  "difaa-el-jadida": "d5d8c59b-f7ab-4b30-9dfb-1d17a36bd0fc",
  "far-rabat": "fd6ff8ea-898c-403b-aec3-7d8a41cbc158",
  "fus-rabat": "c499006b-2af3-4013-862c-854ab74b59cf",
  "hassania-agadir": "9f8c170d-24ed-41a3-99ca-a06167fd9c8b",
  "ittihad-tanger": "353e19d7-0a4b-41e6-a491-fc85f6c952d8",
  "kawkab-marrakech": "d60d9d72-cb7a-4c94-944f-67081ef0a009",
  "moghreb-tetouan": "e3beb52d-fbfb-4180-a39d-7e3d8f965b62",
  "rsb-berkane": "7b2e23bc-450f-4eb2-9926-4add1a5386e7",
  "raja-casablanca": "3b0f1fc9-5b29-4a77-bdf8-a54fce0b1a0e",
  "uts-rabat": "b78eaee8-93af-4630-8335-b208151cbf37",
  "widad-temara": "7d508334-d7a9-4a74-b057-7030c21a0eda",
  "wydad-casablanca": "80a3fb82-02ae-46bc-aae9-5160ba8f3648",
};

export const remainingClubs = () =>
  CLUB_PROVIDER_TEAMS.filter((club) => club.clubKey !== MAS_FES_CLUB_KEY);

const MAS_FES_TEAM_IDS = ["55035", "ptdhYAkN"];

async function query(token: string, sql: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${API}/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql, read_only: true }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`query_http_${response.status}`);
  return (await response.json()) as Record<string, unknown>[];
}

const idList = Object.values(APP_TEAM_IDS)
  .map((id) => `'${id}'`)
  .join(",");
const EXTRA_SQL = `
select jsonb_build_object(
  'app_teams_found', (select count(*) from app.teams where id in (${idList})),
  'existing_observation_digest', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.football_player_mapping_observations o where o.provider_team_id in ('${MAS_FES_TEAM_IDS.join("','")}')),
  'existing_identities', (select coalesce(jsonb_agg(provider_name || '|' || external_id), '[]'::jsonb) from app_private.football_player_mapping_candidates)
) as extra`;

interface Extra {
  app_teams_found: number;
  existing_observation_digest: string;
  existing_identities: string[];
}
async function readExtra(token: string): Promise<Extra> {
  const rows = await query(token, EXTRA_SQL);
  const value = rows[0]?.extra;
  return (typeof value === "string" ? JSON.parse(value) : value) as Extra;
}

/** What production must hold after the write, from what was there and what is submitted. */
export function expectedAfter(
  existingIdentities: readonly string[],
  records: readonly Pick<ObservationRecord, "provider" | "externalPlayerId">[],
) {
  const observationsPerIdentity = new Map<string, number>(existingIdentities.map((i) => [i, 1]));
  const newIdentities = new Set<string>();
  const existing = new Set(existingIdentities);
  for (const record of records) {
    const identity = `${record.provider}|${record.externalPlayerId}`;
    if (!existing.has(identity)) newIdentities.add(identity);
    observationsPerIdentity.set(identity, (observationsPerIdentity.get(identity) ?? 0) + 1);
  }
  const split = (identities: Iterable<string>, provider: string) =>
    [...identities].filter((i) => i.startsWith(`${provider}|`)).length;
  const sofascoreRecords = records.filter((r) => r.provider === "sofascore").length;
  const flashscoreRecords = records.length - sofascoreRecords;
  return {
    newCandidates: newIdentities.size,
    overlapWithExisting: new Set(
      records.map((r) => `${r.provider}|${r.externalPlayerId}`).filter((i) => existing.has(i)),
    ).size,
    candidates: {
      sofascore: split(existing, "sofascore") + split(newIdentities, "sofascore"),
      flashscore: split(existing, "flashscore") + split(newIdentities, "flashscore"),
    },
    observations: {
      sofascore: split(existing, "sofascore") + sofascoreRecords,
      flashscore: split(existing, "flashscore") + flashscoreRecords,
    },
    multiSquad: [...observationsPerIdentity.values()].filter((n) => n > 1).length,
  };
}

export function populationProblems(
  before: Snapshot,
  after: Snapshot,
  beforeExtra: Extra,
  afterExtra: Extra,
  expected: ReturnType<typeof expectedAfter>,
): string[] {
  const problems = UNCHANGED_KEYS.filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  ).map((k) => `changed:${k}`);
  const want: Record<string, unknown> = {
    candidates: expected.candidates.sofascore + expected.candidates.flashscore,
    candidates_sofascore: expected.candidates.sofascore,
    candidates_flashscore: expected.candidates.flashscore,
    observations: expected.observations.sofascore + expected.observations.flashscore,
    observations_sofascore: expected.observations.sofascore,
    observations_flashscore: expected.observations.flashscore,
    duplicate_candidate_identities: 0,
    multi_squad_candidates: expected.multiSquad,
    candidates_with_status_other_than_unmapped: 0,
    proposals: 0,
    reviewed_provider_mapping_rows: 0,
  };
  for (const [key, value] of Object.entries(want))
    if (after[key] !== value)
      problems.push(`expected:${key}=${String(value)} got ${String(after[key])}`);
  if (beforeExtra.existing_observation_digest !== afterExtra.existing_observation_digest)
    problems.push("changed:existing_mas_fes_observations");
  return problems;
}

// ---------------------------------------------------------------------------
async function main(): Promise<number> {
  const mode = process.env.MODE;
  if (mode !== "dry-run" && mode !== "write") throw new Error("MODE must be dry-run or write");
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  if (!token) throw new Error("missing SUPABASE_ACCESS_TOKEN");
  if (process.env.SUPABASE_PRODUCTION_PROJECT_REF !== PROJECT_REF || PROJECT_REF === STAGING_REF)
    throw new Error("production project-ref guard failed");
  if (!process.env.RAPIDAPI_KEY || !process.env.FLASHSCORE_RAPIDAPI_HOST)
    throw new Error("the provider credentials are not available to this job");
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? "";
  if (mode === "write" && !serviceKey) throw new Error("missing SUPABASE_SECRET_KEY");
  const expectedMappingRows = Number(process.env.EXPECTED_MAPPING_ROWS ?? "1541");

  // 1. Pre-flight: the MAS Fès canary's 61 rows are the only ones present.
  const before = await snapshot(token);
  const beforeExtra = await readExtra(token);
  const wantBefore: Record<string, unknown> = {
    ...PRE_EXPECT,
    candidates: 61,
    observations: 61,
    app_team_exists: 1,
  };
  const drift = Object.entries(wantBefore)
    .filter(([k, v]) => before[k] !== v)
    .map(([k]) => k);
  if (before.candidates_sofascore !== 31 || before.candidates_flashscore !== 30)
    drift.push("candidates_by_provider");
  if (before.proposals !== 0) drift.push("proposals");
  if (before.mapping_rows !== expectedMappingRows) drift.push("mapping_rows");
  if (beforeExtra.app_teams_found !== Object.keys(APP_TEAM_IDS).length) drift.push("app_teams");
  if (beforeExtra.existing_identities.length !== 61) drift.push("existing_identities");
  if (drift.length > 0) {
    console.log(`PREFLIGHT_REFUSED_NO_WRITE: ${drift.join(", ")}`);
    return 2;
  }
  console.log(
    "Pre-flight verified:",
    JSON.stringify({
      existingCandidates: 61,
      existingObservations: 61,
      proposals: 0,
      mappingRows: before.mapping_rows,
      reviewedMappingRows: 0,
      migrations: 3,
      resolverGuarded: true,
      appTeamsFound: beforeExtra.app_teams_found,
    }),
  );

  // 2. Collect the 15 clubs (30 requests), normalize in memory.
  const clubs = remainingClubs();
  if (clubs.length !== 15) throw new Error("the registry does not hold 15 other clubs");
  const fetchJson: FetchJson = async (provider, path) => {
    const response = await probe(provider, path);
    let body: unknown = null;
    try {
      body = JSON.parse(response.body);
    } catch {
      body = null;
    }
    return { status: response.status, body };
  };
  const collection = await collectSquads({ fetchJson, now: new Date(), clubs });
  const records = toObservationRecords(collection, { appTeamIdByClubKey: APP_TEAM_IDS });
  const expected = expectedAfter(beforeExtra.existing_identities, records);
  const perClub = collection.squads.map(
    (s) =>
      `${s.clubKey}/${s.provider}=${s.status}:${s.players.length}:${s.completeness.state === "COMPLETE" ? "C" : "INC"}`,
  );
  const aggregate = dryRunCounts(
    records,
    ["sofascore", "flashscore"].map((provider) => {
      const squads = collection.squads.filter((s) => s.provider === provider);
      return {
        provider,
        status: squads.every((s) => s.status === "ok") ? "ok" : "failed",
        completeness: {
          state: squads.every((s) => s.completeness.state === "COMPLETE")
            ? "COMPLETE"
            : "INCOMPLETE_PROVIDER_SQUAD",
        },
        players: squads.flatMap((s) => s.players),
        diagnostics: { duplicateIds: squads.flatMap((s) => s.diagnostics.duplicateIds) },
      };
    }),
  );
  console.log("Collector requests:", JSON.stringify(collection.requests));
  console.log("Per-club squads (status:players:completeness):", perClub.join(" "));
  console.log("Dry-run counts:", JSON.stringify(aggregate));
  console.log(
    "Identity overlap with the MAS Fès rows:",
    expected.overlapWithExisting,
    "new candidates:",
    expected.newCandidates,
  );
  const failedSquads = collection.squads.filter((s) => s.status !== "ok");
  const incompleteSquads = collection.squads.filter(
    (s) => s.completeness.state !== "COMPLETE",
  ).length;
  if (
    failedSquads.length > 0 ||
    aggregate.malformedItems > 0 ||
    records.length === 0 ||
    records.length > RECORDER_MAX
  ) {
    console.log(
      `DRY_RUN_NOT_CLEAN: failedSquads=${failedSquads.length} malformed=${aggregate.malformedItems} observations=${records.length}`,
    );
    return 3;
  }
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(records.map((r) => [r.provider, r.externalPlayerId, r.providerTeamId]).sort()),
    )
    .digest("hex")
    .slice(0, 16);
  console.log(
    `DRY_RUN_CLEAN observations=${records.length} newCandidates=${expected.newCandidates} incompleteSquads=${incompleteSquads} shape=${fingerprint}`,
  );
  if (mode === "dry-run") return 0;

  // 3. Write mode: the numbers must equal the reviewed dry-run.
  const wantObservations = Number(process.env.EXPECTED_OBSERVATIONS ?? "");
  const wantCandidates = Number(process.env.EXPECTED_NEW_CANDIDATES ?? "");
  if (wantObservations !== records.length || wantCandidates !== expected.newCandidates) {
    console.log(
      `WRITE_REFUSED_NO_WRITE: the collected counts differ from the reviewed dry-run (${records.length}/${expected.newCandidates})`,
    );
    return 4;
  }

  // 4. ONE recorder call. Never retried.
  const result = await callRecorderOnce(serviceKey, records);
  console.log(
    "Recorder:",
    JSON.stringify(
      result.ok
        ? { ok: true, summary: result.summary }
        : { ok: false, status: result.status, code: result.code },
    ),
  );

  // 5. A fresh read decides the outcome, whatever the call reported.
  let after: Snapshot;
  let afterExtra: Extra;
  try {
    after = await snapshot(token);
    afterExtra = await readExtra(token);
  } catch {
    console.log(OUT_REVIEW, "- production could not be read afterwards");
    return 5;
  }
  if (!result.ok) {
    const nothingChanged =
      after.candidates === 61 &&
      after.observations === 61 &&
      UNCHANGED_KEYS.every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k]));
    console.log(
      nothingChanged ? OUT_REFUSED : OUT_REVIEW,
      nothingChanged
        ? "- the recorder refused and nothing was written"
        : "- the recorder reported failure but production changed",
    );
    return nothingChanged ? 6 : 5;
  }
  const problems = populationProblems(before, after, beforeExtra, afterExtra, expected);
  if (
    result.summary.candidatesCreated !== expected.newCandidates ||
    result.summary.observationsCreated !== records.length
  )
    problems.push("recorder summary differs from the submitted counts");
  console.log(
    "After:",
    JSON.stringify(
      Object.fromEntries(Object.entries(after).filter(([k]) => k !== "fantasy_table_counts")),
    ),
  );
  if (problems.length > 0) {
    console.log(OUT_REVIEW);
    for (const problem of problems) console.log(" -", problem);
    return 5;
  }
  console.log(OUT_OK);
  return 0;
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      // A stable one-line message only: never a response body.
      console.error(`Population stopped: ${error instanceof Error ? error.message : "error"}`);
      process.exit(2);
    });
}
