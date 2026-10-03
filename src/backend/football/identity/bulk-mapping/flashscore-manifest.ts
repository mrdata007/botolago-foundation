import { z } from "zod";
import { canonicalJson, sha256Hex } from "./canonical";
import {
  FLASHSCORE_APPROVAL_REASON,
  FLASHSCORE_BASIS,
  FLASHSCORE_CONTRACT_VERSION,
  FLASHSCORE_EVIDENCE_CLASSES,
  FLASHSCORE_FORBIDDEN_KEYS,
  FLASHSCORE_REASONS,
} from "./flashscore-contract";
import { mapProposalFingerprint } from "./fingerprint";
import type { BulkManifestBase, BulkRowBase } from "./profile";

const uuid = z.string().uuid();
const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const isoTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
const version = z.string().regex(/^football_player_mapping:[0-9a-f-]{36}$/);

/** The Sofascore mapping a Flashscore row rests on: row, target, state and version, frozen. */
const supportingSchema = z
  .object({
    provider: z.literal("sofascore"),
    externalId: z.string().min(1),
    candidateId: uuid,
    mappingId: uuid,
    appPlayerId: uuid,
    version,
    state: z.literal("active_reviewed"),
  })
  .strict();

const fixtureSchema = z
  .object({
    sofascoreFixtureId: z.string().min(1),
    flashscoreFixtureId: z.string().min(1),
    /** Seconds since the epoch: the match time, kept as a number so no calendar date sits in the file. */
    kickoffEpochSeconds: z.number().int().positive(),
    side: z.enum(["home", "away"]),
    sofascoreSourceSha256: hex64,
    flashscoreSourceSha256: hex64,
  })
  .strict();

/** What was compared, as facts. No name, no date. */
const evidenceSchema = z
  .object({
    shirt: z.enum(["agree", "no_agreement"]),
    /** Distinct aligned events across the fixtures (goal, assist, card, substitution). */
    alignedEventCount: z.number().int().nonnegative(),
    alignedEventKinds: z.array(z.string()),
    /** The two providers' reported birth dates agree (corroboration, never proof). Null: not used. */
    dateCorroboration: z.literal("AGREE").nullable(),
  })
  .strict();

export const flashscoreRowSchema = z
  .object({
    candidateId: uuid,
    provider: z.literal("flashscore"),
    externalId: z.string().min(1),
    appPlayerId: uuid,
    appTeamId: uuid.nullable(),
    evidenceRevision: z.number().int().positive(),
    evidenceClass: z.enum(FLASHSCORE_EVIDENCE_CLASSES),
    candidateStatus: z.literal("unmapped"),
    currentMappingState: z.literal("none"),
    openProposalState: z.literal("none"),
    supporting: supportingSchema,
    fixtures: z.array(fixtureSchema).min(1),
    evidence: evidenceSchema,
    /**
     * What the database's own signals say about this candidate against the target, at the read.
     * An executable row has no conflict: the club and position agree, the shirt agrees or gives
     * no signal, and no flag is raised. (Anything else is held back, never proposed.)
     */
    catalogueSignals: z
      .object({
        club: z.literal("match"),
        position: z.literal("match"),
        shirt: z.enum(["match", "no_signal"]),
      })
      .strict(),
    /** Hash of this row's evidence, supporting binding and fixtures. */
    evidenceSha256: hex64,
    limitations: z.array(z.string()).min(1),
    /** The wording the proposal carries: the class's, verbatim. */
    auditReason: z.string(),
    fingerprintInputs: z
      .object({
        kind: z.literal("map"),
        basis: z.enum(["incident", "shirt_position"]),
        flashscoreCandidateId: uuid,
        flashscoreExternalId: z.string().min(1),
        appPlayerId: uuid,
        candidateRevisions: z.object({ flashscore: z.number().int().positive() }),
        evidence: z.record(z.string(), z.unknown()),
        signals: z.record(z.string(), z.unknown()),
        positionDisagreement: z.literal(false),
      })
      .strict(),
    /** What the database computes for those inputs: checked against the proposal it creates. */
    expectedFingerprint: hex64,
  })
  .strict();
export type FlashscoreRow = z.infer<typeof flashscoreRowSchema>;

const sourcesSchema = z
  .object({
    /** Historical provider responses (not a fresh provider check). */
    providerResponsesCapturedAt: isoTimestamp,
    mappingSnapshotCapturedAt: isoTimestamp,
    mappingSnapshotSha256: hex64,
    candidateRecordsReadAt: isoTimestamp,
    candidateRecordsSha256: hex64,
    corroborationObservedAt: isoTimestamp.nullable(),
    corroborationSha256: hex64.nullable(),
    /** The production read-only check that every row still held, and the fingerprint read. */
    productionReadAt: isoTimestamp,
    productionReadSha256: hex64,
    /** The historical review manifests this one is cut from (kept unchanged beside it). */
    originalManifestSha256: hex64,
    correctedManifestSha256: hex64,
  })
  .strict();

/** A row of the historical review set that is NOT executable, with why. Ids and codes only. */
const heldBackSchema = z
  .object({
    candidateId: uuid,
    externalId: z.string().min(1),
    evidenceClass: z.enum(FLASHSCORE_EVIDENCE_CLASSES),
    codes: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const flashscoreManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(FLASHSCORE_CONTRACT_VERSION),
    environment: z.literal("production-v2"),
    population: z.object({
      total: z.number().int().nonnegative(),
      f1: z.number().int().nonnegative(),
      f2: z.number().int().nonnegative(),
      /** The review set this was cut from (rows + held back). */
      reviewSet: z.number().int().nonnegative(),
      heldBack: z.number().int().nonnegative(),
    }),
    reasons: z.object({
      F1_REVIEWED_SOFASCORE_EVENTS: z.string(),
      F2_REVIEWED_SOFASCORE_SHIRT_DOB: z.string(),
      approval: z.string(),
    }),
    sources: sourcesSchema,
    rows: z.array(flashscoreRowSchema),
    heldBack: z.array(heldBackSchema),
    manifestSha256: hex64,
  })
  .strict();
export type FlashscoreManifest = z.infer<typeof flashscoreManifestSchema>;
export type UnhashedFlashscoreManifest = Omit<FlashscoreManifest, "manifestSha256">;

/** A row, as the shared runner and screen see it. */
export const asBulkRow = (row: FlashscoreRow): BulkRowBase & FlashscoreRow => row;
export const asBulkManifest = (m: FlashscoreManifest): BulkManifestBase<FlashscoreRow> => m;

const byCandidate = (a: FlashscoreRow, b: FlashscoreRow) =>
  a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0;

export async function buildFlashscoreManifest(
  rows: readonly FlashscoreRow[],
  sources: FlashscoreManifest["sources"],
  heldBack: FlashscoreManifest["heldBack"] = [],
): Promise<FlashscoreManifest> {
  const sorted = [...rows].sort(byCandidate);
  const held = [...heldBack].sort((x, y) => (x.candidateId < y.candidateId ? -1 : 1));
  const unhashed: UnhashedFlashscoreManifest = {
    schemaVersion: 1,
    contractVersion: FLASHSCORE_CONTRACT_VERSION,
    environment: "production-v2",
    population: {
      total: sorted.length,
      f1: sorted.filter((r) => r.evidenceClass === "F1_REVIEWED_SOFASCORE_EVENTS").length,
      f2: sorted.filter((r) => r.evidenceClass === "F2_REVIEWED_SOFASCORE_SHIRT_DOB").length,
      reviewSet: sorted.length + held.length,
      heldBack: held.length,
    },
    reasons: { ...FLASHSCORE_REASONS, approval: FLASHSCORE_APPROVAL_REASON },
    sources,
    rows: sorted,
    heldBack: held,
  };
  return { ...unhashed, manifestSha256: await sha256Hex(canonicalJson(unhashed)) };
}

/** A calendar date in a value would be a raw birth date; a full timestamp under an "...At" key is a capture time. */
const CALENDAR_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const FULL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function forbidden(value: unknown, path = "$", key = ""): string[] {
  if (typeof value === "string") {
    if (FULL_TIMESTAMP.test(value) && /At$/.test(key)) return [];
    return CALENDAR_DATE.test(value) ? [`${path} (a date)`] : [];
  }
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value))
    return value.flatMap((item, i) => forbidden(item, `${path}[${i}]`, key));
  return Object.entries(value as Record<string, unknown>).flatMap(([k, child]) => [
    ...(FLASHSCORE_FORBIDDEN_KEYS.some((re) => re.test(k)) ? [`${path}.${k}`] : []),
    ...forbidden(child, `${path}.${k}`, k),
  ]);
}

export type FlashscoreVerdict =
  | { readonly ok: true; readonly manifest: FlashscoreManifest }
  | { readonly ok: false; readonly problems: readonly string[] };

/** The class each row's evidence must support, from facts alone. */
function classProblems(row: FlashscoreRow): string[] {
  const { evidence } = row;
  if (row.evidenceClass === "F1_REVIEWED_SOFASCORE_EVENTS") {
    const enough =
      evidence.alignedEventCount >= 1 &&
      (evidence.shirt === "agree" || evidence.alignedEventCount >= 2);
    return enough
      ? []
      : [`class: ${row.candidateId} F1 needs an aligned event and a shirt, or two events`];
  }
  return evidence.shirt === "agree" && evidence.dateCorroboration === "AGREE"
    ? []
    : [`class: ${row.candidateId} F2 needs an agreeing shirt and an agreeing birth date`];
}

/**
 * Everything that must hold before a Flashscore manifest is trusted by the screen or the
 * runner. Collisions are rejected in BOTH directions (two Flashscore ids for one player, and
 * one Flashscore id for two players) and never resolved by order.
 */
export async function verifyFlashscoreManifest(
  input: unknown,
  options: {
    /**
     * Recompute each row's proposal fingerprint from its own inputs and refuse a difference.
     * On everywhere it matters; off only for the in-memory test world, whose stand-in backend
     * fingerprints differently from the database.
     */
    readonly recomputeFingerprints?: boolean;
  } = {},
): Promise<FlashscoreVerdict> {
  const recompute = options.recomputeFingerprints ?? true;
  const parsed = flashscoreManifestSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      problems: parsed.error.issues.map((i) => `schema: ${i.path.join(".")} ${i.message}`),
    };
  const manifest = parsed.data;
  const problems: string[] = [];

  const { manifestSha256: _hash, ...unhashed } = manifest;
  if ((await sha256Hex(canonicalJson(unhashed))) !== manifest.manifestSha256)
    problems.push("hash: the manifest does not match its SHA-256");

  for (let i = 1; i < manifest.rows.length; i += 1)
    if (byCandidate(manifest.rows[i - 1]!, manifest.rows[i]!) >= 0)
      problems.push("order: rows are not in strictly ascending candidate order");

  const dup = (label: string, values: readonly string[]) => {
    if (new Set(values).size !== values.length) problems.push(`collision: duplicate ${label}`);
  };
  dup(
    "candidate id",
    manifest.rows.map((r) => r.candidateId),
  );
  dup(
    "Flashscore id",
    manifest.rows.map((r) => r.externalId),
  );
  dup(
    "target app player",
    manifest.rows.map((r) => r.appPlayerId),
  );
  dup(
    "supporting Sofascore mapping",
    manifest.rows.map((r) => r.supporting.mappingId),
  );
  dup(
    "supporting Sofascore id",
    manifest.rows.map((r) => r.supporting.externalId),
  );

  const f1 = manifest.rows.filter((r) => r.evidenceClass === "F1_REVIEWED_SOFASCORE_EVENTS").length;
  const f2 = manifest.rows.filter(
    (r) => r.evidenceClass === "F2_REVIEWED_SOFASCORE_SHIRT_DOB",
  ).length;
  if (
    manifest.population.total !== manifest.rows.length ||
    manifest.population.f1 !== f1 ||
    manifest.population.f2 !== f2 ||
    manifest.population.heldBack !== manifest.heldBack.length ||
    manifest.population.reviewSet !== manifest.rows.length + manifest.heldBack.length
  )
    problems.push("population: the declared counts do not match the rows");
  const executable = new Set(manifest.rows.map((r) => r.candidateId));
  const executableIds = new Set(manifest.rows.map((r) => r.externalId));
  for (const held of manifest.heldBack)
    if (executable.has(held.candidateId) || executableIds.has(held.externalId))
      problems.push(`held: ${held.candidateId} is both executable and held back`);
  dup(
    "held-back candidate",
    manifest.heldBack.map((h) => h.candidateId),
  );

  for (const row of manifest.rows) {
    if (row.supporting.appPlayerId !== row.appPlayerId)
      problems.push(
        `supporting: ${row.candidateId} the Sofascore mapping resolves to a different player`,
      );
    if (
      row.fingerprintInputs.flashscoreCandidateId !== row.candidateId ||
      row.fingerprintInputs.flashscoreExternalId !== row.externalId ||
      row.fingerprintInputs.appPlayerId !== row.appPlayerId ||
      row.fingerprintInputs.candidateRevisions.flashscore !== row.evidenceRevision
    )
      problems.push(`inputs: ${row.candidateId} fingerprint inputs disagree with the row`);
    if (row.fingerprintInputs.basis !== FLASHSCORE_BASIS[row.evidenceClass])
      problems.push(`class: ${row.candidateId} the basis does not match its evidence class`);
    if (row.auditReason !== FLASHSCORE_REASONS[row.evidenceClass])
      problems.push(`reasons: ${row.candidateId} the audit reason is not its class's wording`);
    problems.push(...classProblems(row));
    if (recompute) {
      const i = row.fingerprintInputs;
      const again = await mapProposalFingerprint({
        sofascoreCandidateId: null,
        flashscoreCandidateId: i.flashscoreCandidateId,
        sofascoreExternalId: null,
        flashscoreExternalId: i.flashscoreExternalId,
        appPlayerId: i.appPlayerId,
        basis: i.basis,
        evidence: i.evidence,
        signals: i.signals,
        candidateRevisions: i.candidateRevisions,
        positionDisagreement: i.positionDisagreement,
        reason: FLASHSCORE_REASONS[row.evidenceClass],
      });
      if (again !== row.expectedFingerprint)
        problems.push(`fingerprint: ${row.candidateId} does not follow from its own inputs`);
    }
  }
  if (
    manifest.reasons.F1_REVIEWED_SOFASCORE_EVENTS !==
      FLASHSCORE_REASONS.F1_REVIEWED_SOFASCORE_EVENTS ||
    manifest.reasons.F2_REVIEWED_SOFASCORE_SHIRT_DOB !==
      FLASHSCORE_REASONS.F2_REVIEWED_SOFASCORE_SHIRT_DOB ||
    manifest.reasons.approval !== FLASHSCORE_APPROVAL_REASON
  )
    problems.push("reasons: the manifest reasons are not the approved wording");

  const bad = forbidden(input);
  if (bad.length > 0) problems.push(`forbidden: ${bad.slice(0, 3).join(", ")}`);

  return problems.length === 0 ? { ok: true, manifest } : { ok: false, problems };
}

/**
 * References stored with the proposal (and so part of its fingerprint): ids only. The same
 * function builds them for the manifest and for the proposal, so they cannot drift.
 */
export function flashscoreEvidenceRefs(row: {
  readonly evidenceClass: FlashscoreRow["evidenceClass"];
  readonly supporting: Pick<FlashscoreRow["supporting"], "externalId" | "mappingId">;
  readonly fixtures: readonly Pick<
    FlashscoreRow["fixtures"][number],
    "sofascoreFixtureId" | "flashscoreFixtureId"
  >[];
}): Record<string, string | number>[] {
  return [
    {
      source: "reviewed_sofascore_mapping",
      sofascoreId: row.supporting.externalId,
      mappingId: row.supporting.mappingId,
    },
    ...row.fixtures.map((f) => ({
      source: "finished_match",
      evidenceClass: row.evidenceClass,
      sofascoreFixture: f.sofascoreFixtureId,
      flashscoreFixture: f.flashscoreFixtureId,
    })),
  ];
}
