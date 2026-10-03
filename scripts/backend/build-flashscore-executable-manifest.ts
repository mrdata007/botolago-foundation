/**
 * LOCAL, READ-ONLY. Cuts the executable Flashscore review manifest out of the corrected GW1
 * identity evidence. It opens no database or network connection, calls no propose, decide or
 * execute, and writes only the files it is told to.
 *
 * Two steps, so the manifest rests on one production read taken at a known time:
 *
 *   1. `--print-sql`  prints ONE read-only SELECT (no write, no lock a reader would not take).
 *      Run it against production; save its single JSON result to a file.
 *   2. `--production-read <file> [--write]` builds, verifies and (with --write) writes the manifest.
 *
 * VERSION 2 (this file). The database now enforces that a Flashscore mapping rests on a reviewed
 * Sofascore mapping (migration 20261003120000) and reads that mapping row itself. A manifest therefore
 * freezes, for every row, the state of its supporting mapping AS THE DATABASE WOULD READ IT, and a
 * proposal fingerprint that includes that state. The production read below replicates the database's
 * own computation of that state with plain SELECTs (production has not applied the migration, and
 * nothing here writes); the fingerprint is then recomputed offline with the same function the Sofascore
 * batch's 189 fingerprints were reproduced with, and checked against a golden vector produced by the
 * real database functions. The version 1 manifest (docs/production/manifests/
 * gw1-flashscore-executable.manifest.json, hash 524290909f25...) is kept as it was, unchanged.
 *
 * The 53 rows are the Flashscore rows the corrected worklist marks READY. No row is added, and a
 * row that no longer qualifies is dropped with a reason (never replaced). The historical review
 * manifests are not touched.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildFlashscoreManifest,
  flashscoreEvidenceRefs,
  verifyFlashscoreManifest,
  type FlashscoreRow,
} from "../../src/backend/football/identity/bulk-mapping/flashscore-manifest";
import {
  jsonbFingerprint,
  mapProposalFingerprint,
} from "../../src/backend/football/identity/bulk-mapping/fingerprint";
import {
  canonicalJson,
  sha256Hex,
} from "../../src/backend/football/identity/bulk-mapping/canonical";
import {
  FLASHSCORE_BASIS,
  FLASHSCORE_REASONS,
  type FlashscoreEvidenceClass,
} from "../../src/backend/football/identity/bulk-mapping/flashscore-contract";
import { COMMITTED_GW1_MATCHES } from "../../src/backend/fantasy/provider-replay-fixtures";
import type { WorklistRow } from "../../src/backend/fantasy/provider-identity-worklist";
import {
  buildEvidence,
  MANIFEST_PATH,
  ORIGINAL_MANIFEST_PATH,
} from "./build-gw1-identity-evidence";

const root = resolve(import.meta.dir, "../..");
const text = (path: string) => readFileSync(resolve(root, path), "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

export const CORROBORATION_PATH = "tests/fixtures/identity/gw1-dob-corroboration-2026-10-03.json";
export const CANDIDATES_PATH = "tests/fixtures/identity/gw1-flashscore-candidates-2026-10-03.json";
/** Version 2. Version 1 (docs/production/manifests/gw1-flashscore-executable.manifest.json) is historical and untouched. */
export const EXECUTABLE_MANIFEST_PATH =
  "docs/production/manifests/gw1-flashscore-executable.v2.manifest.json";
export const HISTORICAL_V1_MANIFEST_PATH =
  "docs/production/manifests/gw1-flashscore-executable.manifest.json";
/** The same manifest as a module the screen imports (it verifies the hash and shape before offering anything). */
export const EXECUTABLE_MANIFEST_MODULE_PATH =
  "src/components/admin/player-mappings/flashscore-manifest.ts";

/** What one production read returns for the manifest (ids, flags, fingerprints: no name, no date). */
export interface ProductionRead {
  readonly readAt: string;
  /** Counts of rows that no longer hold; every one must be zero for a row to stay. */
  readonly summary: Record<string, number>;
  readonly rows: readonly {
    readonly candidateId: string;
    readonly appTeamId: string | null;
    readonly evidenceRevision: number;
    readonly ok: boolean;
    /** What the (old) compute function produced for the pairing: candidates and target only. */
    readonly evidence: Record<string, unknown>;
    /** The supporting Sofascore mapping as the database's own supporting-state computation reads it. */
    readonly supporting: {
      readonly mappingId: string;
      readonly provider: string;
      readonly externalId: string;
      readonly appPlayerId: string;
      readonly active: boolean;
      readonly reviewed: boolean;
      readonly reviewProvenance: string;
      readonly provenanceProposalId: string | null;
      readonly stateDigest: string;
    };
    readonly positionDisagreement: boolean;
    readonly signals: {
      readonly club: string;
      readonly position: string;
      readonly shirt: string;
      readonly flags: readonly string[];
      readonly observationCount: number;
      readonly registeredTeamDisagreement: boolean;
    } & Record<string, unknown>;
  }[];
}

const FIXTURE_FILES = {
  sofascore: ["detail", "incidents", "lineups", "statistics"],
  flashscore: ["data", "lineups", "statistics", "summary"],
} as const;

/** One digest per provider payload set: each file's hash, labelled, in a fixed order. */
function payloadDigest(provider: "sofascore" | "flashscore", id: string): string {
  const parts = FIXTURE_FILES[provider].map(
    (name) => `${name}:${sha(text(`tests/fixtures/providers/${provider}/${id}.${name}.json`))}`,
  );
  return sha(parts.join("\n"));
}

type Matches = {
  fixture: { sofascoreFixtureId: string; flashscoreFixtureId: string };
  shirtAgrees: boolean;
  events: { signal: string }[];
}[];

/** The class's own facts, from the worklist row's structured evidence. */
export function evidenceFacts(row: WorklistRow): FlashscoreRow["evidence"] {
  const e = row.evidence as {
    matches?: Matches;
    shirtAgrees?: boolean;
    dobCorroboration?: string;
  };
  const matches = e.matches ?? [];
  const events = matches.flatMap((m) => m.events);
  const shirt =
    row.evidenceClass === "F2_REVIEWED_SOFASCORE_SHIRT_DOB"
      ? e.shirtAgrees
        ? "agree"
        : "no_agreement"
      : matches.some((m) => m.shirtAgrees)
        ? "agree"
        : "no_agreement";
  return {
    shirt,
    alignedEventCount: events.length,
    alignedEventKinds: [...new Set(events.map((x) => x.signal))].sort(),
    dateCorroboration: e.dobCorroboration === "AGREE" ? "AGREE" : null,
  };
}

/** The Flashscore rows the corrected worklist marks READY, in candidate order. */
export async function readyFlashscoreRows() {
  const built = await buildEvidence({ corroborationPath: CORROBORATION_PATH });
  const rows = built.worklist.rows
    .filter((r) => r.provider === "flashscore" && r.classification === "READY_FOR_BATCH_REVIEW")
    .filter(
      (r) =>
        r.evidenceClass === "F1_REVIEWED_SOFASCORE_EVENTS" ||
        r.evidenceClass === "F2_REVIEWED_SOFASCORE_SHIRT_DOB",
    )
    .sort((a, b) => ((a.candidateId ?? "") < (b.candidateId ?? "") ? -1 : 1));
  return { built, rows };
}

/**
 * The supporting Sofascore mapping's state, computed with plain SELECTs exactly as
 * app_private.football_mapping_supporting_state(id) computes it (migration 20261003120000): the row's
 * review state comes from its flags AND the audit record of the executed proposal that wrote it, never
 * from a version label; the digest covers every identity-relevant field. Written for the case where the
 * function does not exist yet (production). `scripts/db/` parity check: run against a database that has
 * the migration, the two outputs must be identical for every row (see the manifest runbook).
 */
export const SUPPORTING_STATE_SQL = (rowAlias: string) => `(
    select jsonb_build_object(
      'mappingId', ${rowAlias}.id, 'provider', ${rowAlias}.provider_name, 'entityType', ${rowAlias}.entity_type::text,
      'externalId', ${rowAlias}.external_id, 'appPlayerId', ${rowAlias}.internal_entity_id, 'active', ${rowAlias}.active,
      'manuallyCorrected', ${rowAlias}.manually_corrected, 'reviewed', x.reviewed,
      'reviewProvenance', case when x.reviewed then 'executed_proposal' else 'none' end,
      'provenanceProposalId', case when x.reviewed then x.pid end,
      'stateDigest', app_private.admin_payload_fingerprint(jsonb_build_object(
        'id', ${rowAlias}.id, 'provider', ${rowAlias}.provider_name, 'entityType', ${rowAlias}.entity_type::text,
        'externalId', ${rowAlias}.external_id, 'appPlayerId', ${rowAlias}.internal_entity_id, 'active', ${rowAlias}.active,
        'manuallyCorrected', ${rowAlias}.manually_corrected, 'correctedBy', ${rowAlias}.corrected_by,
        'correctedAt', to_char(${rowAlias}.corrected_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'correctionReason', ${rowAlias}.correction_reason,
        'sourceVersion', ${rowAlias}.source_version, 'reviewed', x.reviewed,
        'provenanceProposalId', case when x.reviewed then x.pid end)))
    from (
      select
        case when ${rowAlias}.source_version like 'football_player_mapping:%'
              and substr(${rowAlias}.source_version, 25) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then substr(${rowAlias}.source_version, 25)::uuid end as pid
    ) v
    cross join lateral (
      select v.pid as pid,
        (${rowAlias}.manually_corrected and ${rowAlias}.corrected_by is not null and ${rowAlias}.corrected_at is not null
          and ${rowAlias}.correction_reason is not null and v.pid is not null
          and exists (
            select 1 from app_private.football_player_mapping_proposals pr
            join app_private.staff_principals sp on sp.id = pr.decided_by
            where pr.id = v.pid and pr.status = 'executed'
              and sp.auth_user_id = ${rowAlias}.corrected_by and pr.reason = ${rowAlias}.correction_reason
              and exists (
                select 1 from jsonb_array_elements(
                  case when jsonb_typeof(pr.executed_after -> 'rows') = 'array' then pr.executed_after -> 'rows'
                       else jsonb_build_array(pr.executed_after) end) w
                where w ->> 'mappingId' = ${rowAlias}.id::text and w ->> 'provider' = ${rowAlias}.provider_name
                  and w ->> 'externalId' = ${rowAlias}.external_id
                  and w ->> 'appPlayerId' = ${rowAlias}.internal_entity_id::text
                  and (w ->> 'active')::boolean = ${rowAlias}.active))) as reviewed
    ) x
  )`;

/** ONE read-only statement: whether every row still holds, and the supporting mapping's state as the database reads it. */
export async function readSql(): Promise<string> {
  const { rows } = await readyFlashscoreRows();
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const values = rows
    .map((r) => {
      const s = r.supportingMappings[0]!;
      const fx = r.fixtures
        .map((f) => `${f.sofascoreFixtureId}:${f.flashscoreFixtureId}`)
        .join(",");
      const version = (s.version ?? "").replace("football_player_mapping:", "");
      return `(${q(r.candidateId!)}::uuid,${r.candidateRevision},${q(r.externalId)},${q(r.targetAppPlayerId!)}::uuid,${q(s.mappingId)}::uuid,${q(s.externalId)},${q(version)},${q(r.evidenceClass)},${q(fx)})`;
    })
    .join(",\n");
  const reasonRows = (Object.keys(FLASHSCORE_REASONS) as FlashscoreEvidenceClass[])
    .map((c) => `(${q(c)},${q(FLASHSCORE_BASIS[c])},${q(FLASHSCORE_REASONS[c])})`)
    .join(",\n");
  return `-- READ ONLY. One SELECT; writes nothing. Output: one json document.
with reasons(cls, basis, reason) as (values
${reasonRows}),
m0(cand, rev, ext, tgt, smap, sext, sver, cls, fx) as (values
${values}),
m as (
  select m0.cand, m0.rev, m0.ext, m0.tgt, m0.smap, m0.sext, 'football_player_mapping:' || m0.sver as sver,
    r.basis, r.reason,
    jsonb_build_array(jsonb_build_object('source', 'reviewed_sofascore_mapping', 'sofascoreId', m0.sext, 'mappingId', m0.smap))
    || (select jsonb_agg(jsonb_build_object('source', 'finished_match', 'evidenceClass', m0.cls,
          'sofascoreFixture', split_part(f.v, ':', 1), 'flashscoreFixture', split_part(f.v, ':', 2)) order by f.n)
        from unnest(string_to_array(m0.fx, ',')) with ordinality as f(v, n)) as refs
  from m0 join reasons r on r.cls = m0.cls
),
c as (
  select m.*, app_private.football_mapping_compute('map', null, m.cand, null, null, m.tgt, null, null) as v,
    (select ${SUPPORTING_STATE_SQL("sx")} from app_private.football_provider_mappings sx where sx.id = m.smap) as ss
  from m
), checks as (
  select
    count(*) as n,
    count(*) filter (where k.id is null) as candidate_missing,
    count(*) filter (where k.provider_name <> 'flashscore') as wrong_provider,
    count(*) filter (where k.status <> 'unmapped') as not_unmapped,
    count(*) filter (where k.existing_mapping_id is not null) as has_mapping,
    count(*) filter (where k.evidence_revision <> c.rev) as revision_changed,
    count(*) filter (where k.external_id <> c.ext) as id_changed,
    count(*) filter (where exists (select 1 from app_private.football_provider_mappings x
      where x.provider_name = 'flashscore' and x.entity_type = 'player'
        and (x.external_id = c.ext or x.internal_entity_id = c.tgt))) as claimed_for_flashscore,
    count(*) filter (where exists (select 1 from app_private.football_player_mapping_proposals p
      where p.status in ('pending','approved','position_disagreement','stale_evidence')
        and (p.flashscore_candidate_id = c.cand or coalesce(p.app_player_id, p.new_app_player_id) = c.tgt))) as open_proposal,
    count(*) filter (where s.id is null) as supporting_missing,
    count(*) filter (where s.active is not true) as supporting_inactive,
    count(*) filter (where s.internal_entity_id <> c.tgt) as supporting_retargeted,
    count(*) filter (where s.source_version <> c.sver) as supporting_version_changed,
    count(*) filter (where coalesce((c.ss ->> 'reviewed')::boolean, false) is not true) as supporting_unreviewed,
    count(*) filter (where s.external_id <> c.sext) as supporting_id_changed,
    count(*) filter (where not exists (select 1 from app.players p where p.id = c.tgt and p.active)) as target_inactive,
    count(*) filter (where not coalesce((c.v ->> 'ok')::boolean, false)) as compute_refused,
    count(*) filter (where (c.v ->> 'positionDisagreement') = 'true') as position_disagreement,
    (select count(*) from app_private.football_provider_mappings
      where provider_name = 'sofascore' and entity_type = 'player' and active) as sofascore_active_total,
    (select count(*) from app_private.football_provider_mappings where provider_name = 'flashscore') as flashscore_total
  from c
  left join app_private.football_player_mapping_candidates k on k.id = c.cand
  left join app_private.football_provider_mappings s on s.id = c.smap
)
select jsonb_build_object(
  'readAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'summary', (select to_jsonb(checks) from checks),
  'rows', (select jsonb_agg(jsonb_build_object(
      'candidateId', c.cand,
      'appTeamId', (select (array_agg(o.app_team_id))[1] from app_private.football_player_mapping_observations o
                    where o.candidate_id = c.cand),
      'evidenceRevision', (c.v -> 'candidateRevisions' ->> 'flashscore')::int,
      'ok', coalesce((c.v ->> 'ok')::boolean, false),
      'evidence', c.v -> 'evidence',
      'supporting', c.ss,
      'signals', c.v -> 'signals' -> 'flashscore',
      'positionDisagreement', (c.v ->> 'positionDisagreement')::boolean
    ) order by c.cand) from c)
);
`;
}

const HOLDS = [
  "candidate_missing",
  "wrong_provider",
  "not_unmapped",
  "has_mapping",
  "revision_changed",
  "id_changed",
  "claimed_for_flashscore",
  "open_proposal",
  "supporting_missing",
  "supporting_inactive",
  "supporting_retargeted",
  "supporting_version_changed",
  "supporting_unreviewed",
  "supporting_id_changed",
  "target_inactive",
  "compute_refused",
  "position_disagreement",
] as const;

/**
 * Why a row is NOT executable, from the database's own signals. The bar is the Sofascore
 * batch's: club and position agree, the shirt agrees or gives no signal, no flag is raised.
 * A position disagreement is held anyway: the reviewed backend parks such a proposal for a
 * note and an explicit acknowledgement, which this batch does not carry.
 */
export function holdCodes(row: ProductionRead["rows"][number]): string[] {
  const codes: string[] = [];
  if (row.positionDisagreement || row.signals.position === "conflict")
    codes.push("POSITION_DISAGREEMENT");
  else if (row.signals.position !== "match") codes.push("POSITION_NOT_CONFIRMED");
  if (row.signals.club !== "match") codes.push("CLUB_CONTEXT_MISMATCH");
  if (row.signals.shirt === "conflict") codes.push("SHIRT_DIFFERENCE");
  if (row.signals.registeredTeamDisagreement) codes.push("REGISTERED_TEAM_DISAGREEMENT");
  if (row.signals.observationCount !== 1) codes.push("MULTI_SQUAD_OBSERVATION");
  const known = new Set(["POSITION_DISAGREEMENT", "CLUB_CONTEXT_MISMATCH", "SHIRT_DIFFERENCE"]);
  for (const flag of row.signals.flags) if (!known.has(flag)) codes.push(`FLAG_${flag}`);
  return [...new Set(codes)].sort();
}

export async function buildFromRead(read: ProductionRead) {
  const { built, rows } = await readyFlashscoreRows();
  const dropped: { candidateId: string; why: string }[] = [];
  const heldBack: FlashscoreManifest["heldBack"] = [];
  const out: FlashscoreRow[] = [];
  // The summary must be all zero for the batch to stand as a whole; a per-row failure drops that row.
  // Per-row signals decide each row (see holdCodes); everything else in the summary must be zero.
  const summaryHolds = HOLDS.filter(
    (k) => k !== "position_disagreement" && (read.summary[k] ?? 0) !== 0,
  );
  const byCandidate = new Map(read.rows.map((r) => [r.candidateId, r]));
  const sourceRows = new Map(built.worklist.rows.map((r) => [r.rowId, r]));
  void sourceRows;
  for (const row of rows) {
    const cls = row.evidenceClass as FlashscoreEvidenceClass;
    const got = byCandidate.get(row.candidateId!);
    const s = row.supportingMappings[0]!;
    if (!got) {
      dropped.push({ candidateId: row.candidateId!, why: "not_in_production_read" });
      continue;
    }
    if (got.evidenceRevision !== row.candidateRevision) {
      dropped.push({ candidateId: row.candidateId!, why: "evidence_revision_changed" });
      continue;
    }
    const codes = holdCodes(got);
    if (codes.length > 0) {
      heldBack.push({
        candidateId: row.candidateId!,
        externalId: row.externalId,
        evidenceClass: cls,
        codes,
      });
      continue;
    }
    const fixtures = row.fixtures.map((f) => {
      const match = COMMITTED_GW1_MATCHES.find(
        (m) => m.sofascoreId === f.sofascoreFixtureId && m.flashscoreId === f.flashscoreFixtureId,
      );
      if (!match) throw new Error(`fixture ${f.sofascoreFixtureId} is not a committed match`);
      return {
        sofascoreFixtureId: f.sofascoreFixtureId,
        flashscoreFixtureId: f.flashscoreFixtureId,
        kickoffEpochSeconds: Math.floor(new Date(f.kickoffAt).getTime() / 1000),
        side: f.side === "away" ? ("away" as const) : ("home" as const),
        sofascoreSourceSha256: payloadDigest("sofascore", match.sofascoreId),
        flashscoreSourceSha256: payloadDigest("flashscore", match.flashscoreId),
      };
    });
    // The supporting mapping, as the database reads it: it must be the row the review named, active,
    // reviewed by the audit record (not by a label), and on exactly the player the row maps to.
    const sup = got.supporting;
    if (
      !sup ||
      sup.mappingId !== s.mappingId ||
      sup.externalId !== s.externalId ||
      sup.provider !== "sofascore" ||
      sup.appPlayerId !== row.targetAppPlayerId ||
      !sup.active ||
      !sup.reviewed ||
      !sup.provenanceProposalId
    ) {
      dropped.push({ candidateId: row.candidateId!, why: "supporting_mapping_does_not_hold" });
      continue;
    }
    const supporting = {
      provider: "sofascore" as const,
      externalId: s.externalId,
      mappingId: s.mappingId,
      appPlayerId: row.targetAppPlayerId!,
      provenanceProposalId: sup.provenanceProposalId,
      stateDigest: sup.stateDigest,
      state: "active_reviewed" as const,
    };
    const refs = flashscoreEvidenceRefs({
      evidenceClass: cls,
      supporting: { externalId: s.externalId, mappingId: s.mappingId },
      fixtures: row.fixtures,
    });
    // What the database's evidence for this proposal will be: its pairing evidence (read now, from the
    // unchanged part of the computation), plus the dependency block and the digest of the references.
    const dependencyEvidence = {
      ...got.evidence,
      supporting: {
        mappingId: supporting.mappingId,
        provider: supporting.provider,
        externalId: supporting.externalId,
        appPlayerId: supporting.appPlayerId,
        active: true,
        reviewed: true,
        reviewProvenance: sup.reviewProvenance,
        provenanceProposalId: supporting.provenanceProposalId,
        stateDigest: supporting.stateDigest,
        evidenceClass: cls,
      },
      refsDigest: await jsonbFingerprint(refs),
      refs,
    };
    const signals = { flashscore: got.signals };
    const expectedFingerprint = await mapProposalFingerprint({
      sofascoreCandidateId: null,
      flashscoreCandidateId: row.candidateId!,
      sofascoreExternalId: null,
      flashscoreExternalId: row.externalId,
      appPlayerId: row.targetAppPlayerId!,
      basis: FLASHSCORE_BASIS[cls],
      evidence: dependencyEvidence,
      signals,
      candidateRevisions: { flashscore: row.candidateRevision! },
      positionDisagreement: false,
      reason: FLASHSCORE_REASONS[cls],
    });
    const evidence = evidenceFacts(row);
    out.push({
      candidateId: row.candidateId!,
      provider: "flashscore",
      externalId: row.externalId,
      appPlayerId: row.targetAppPlayerId!,
      appTeamId: got.appTeamId,
      evidenceRevision: row.candidateRevision!,
      evidenceClass: cls,
      candidateStatus: "unmapped",
      currentMappingState: "none",
      openProposalState: "none",
      supporting,
      fixtures,
      evidence,
      catalogueSignals: {
        club: "match",
        position: "match",
        shirt: got.signals.shirt === "match" ? "match" : "no_signal",
      },
      evidenceSha256: await sha256Hex(canonicalJson({ evidence, supporting, fixtures })),
      limitations: [...row.limitations],
      auditReason: FLASHSCORE_REASONS[cls],
      fingerprintInputs: {
        kind: "map",
        basis: FLASHSCORE_BASIS[cls],
        flashscoreCandidateId: row.candidateId!,
        flashscoreExternalId: row.externalId,
        appPlayerId: row.targetAppPlayerId!,
        candidateRevisions: { flashscore: row.candidateRevision! },
        evidence: dependencyEvidence,
        signals,
        positionDisagreement: false,
      },
      expectedFingerprint,
    });
  }
  const manifest = await buildFlashscoreManifest(
    out,
    {
      providerResponsesCapturedAt: built.worklist.times.payloadObservedAt,
      mappingSnapshotCapturedAt: built.worklist.times.mappingSnapshotCapturedAt,
      mappingSnapshotSha256: built.worklist.snapshotDigest,
      candidateRecordsReadAt: built.worklist.times.candidateRecordsReadAt,
      candidateRecordsSha256: sha(text(CANDIDATES_PATH)),
      corroborationObservedAt: built.worklist.times.corroborationObservedAt,
      corroborationSha256: sha(text(CORROBORATION_PATH)),
      productionReadAt: read.readAt,
      productionReadSha256: await sha256Hex(canonicalJson(read)),
      originalManifestSha256: text(
        `${ORIGINAL_MANIFEST_PATH.replace(/\.json$/, "")}.sha256`,
      ).trim(),
      correctedManifestSha256: text(`${MANIFEST_PATH.replace(/\.json$/, "")}.sha256`).trim(),
    },
    heldBack,
  );
  return { manifest, dropped, summaryHolds, built, heldBack };
}

/**
 * Run this against a database that HAS the migration (never production, which does not): for every
 * Sofascore mapping row, the database's own supporting-state function and the plain-SELECT computation
 * the production read uses must agree on every field they share. The output is `rows|same|reviewed`;
 * `rows` and `same` must be equal.
 */
export const PARITY_SQL = `select count(*) as rows,
  count(*) filter (where (app_private.football_mapping_supporting_state(s.id) - 'correctedAt' - 'sourceVersion' - 'updatedAt') is not distinct from ${SUPPORTING_STATE_SQL("s")}) as same,
  count(*) filter (where (app_private.football_mapping_supporting_state(s.id) ->> 'reviewed')::boolean) as reviewed
from app_private.football_provider_mappings s where s.provider_name = 'sofascore';`;

if (import.meta.main) {
  if (process.argv.includes("--print-parity-sql")) {
    console.log(PARITY_SQL);
  } else if (process.argv.includes("--print-sql")) {
    console.log(await readSql());
  } else {
    const file = arg("--production-read");
    if (!file) throw new Error("--print-sql, or --production-read <file>");
    const read = JSON.parse(text(file)) as ProductionRead;
    const { manifest, dropped, summaryHolds } = await buildFromRead(read);
    const verdict = await verifyFlashscoreManifest(JSON.parse(JSON.stringify(manifest)));
    if (!verdict.ok) throw new Error(`manifest does not verify: ${verdict.problems.join("; ")}`);
    if (summaryHolds.length > 0) throw new Error(`rows no longer hold: ${summaryHolds.join(", ")}`);
    if (process.argv.includes("--write")) {
      writeFileSync(
        resolve(root, EXECUTABLE_MANIFEST_PATH),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      writeFileSync(
        resolve(root, `${EXECUTABLE_MANIFEST_PATH.replace(/\.json$/, "")}.sha256`),
        `${manifest.manifestSha256}\n`,
      );
      writeFileSync(
        resolve(root, EXECUTABLE_MANIFEST_MODULE_PATH),
        `/**
 * The frozen, reviewed manifest of the Flashscore evidence batch, generated by
 * scripts/backend/build-flashscore-executable-manifest.ts from the corrected GW1 identity evidence
 * and ONE read-only production check, and committed as a reviewed artifact (see docs/production/
 * manifests). The screen verifies its SHA-256, its shape and every proposal fingerprint before
 * offering anything. Do not edit by hand.
 */
export const FLASHSCORE_BULK_MANIFEST: unknown = ${JSON.stringify(manifest, null, 2)};
`,
      );
    }
    console.log(
      JSON.stringify(
        {
          rows: manifest.rows.length,
          population: manifest.population,
          hash: manifest.manifestSha256,
          dropped,
          heldBack: manifest.heldBack,
        },
        null,
        2,
      ),
    );
  }
}
