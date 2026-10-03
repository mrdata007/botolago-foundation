import { z } from "zod";
import { canonicalJson, sha256Hex } from "./canonical";
import {
  BULK_CONTRACT_VERSION,
  BULK_REASONS,
  BULK_APPROVAL_REASON,
  FORBIDDEN_MANIFEST_KEYS,
} from "./contract";

const uuid = z.string().uuid();
const hex64 = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * One row of the frozen manifest. Every field is a structured fact; there is no
 * name, no birth date and no raw provider payload in it, so nothing a person can
 * rename or retype can move a row in or out of the batch.
 */
export const manifestRowSchema = z
  .object({
    candidateId: uuid,
    provider: z.literal("sofascore"),
    externalId: z.string().min(1),
    appPlayerId: uuid,
    appTeamId: uuid,
    evidenceRevision: z.number().int().positive(),
    tier: z.enum(["A", "B"]),
    candidateStatus: z.literal("unmapped"),
    currentMappingState: z.literal("none"),
    openProposalState: z.literal("none"),
    observationCount: z.literal(1),
    squadCompleteness: z.literal("COMPLETE"),
    signals: z.object({
      dob: z.literal("match"),
      position: z.literal("match"),
      club: z.literal("match"),
      shirt: z.enum(["match", "no_signal"]),
    }),
    sportsMonksCorroboration: z.literal(true),
    /** The inputs the proposal fingerprint is made of, exactly as the propose function builds them. */
    fingerprintInputs: z.object({
      kind: z.literal("map"),
      basis: z.literal("manual"),
      sofascoreCandidateId: uuid,
      sofascoreExternalId: z.string().min(1),
      appPlayerId: uuid,
      candidateRevisions: z.object({ sofascore: z.number().int().positive() }),
      evidence: z.record(z.string(), z.unknown()),
      signals: z.record(z.string(), z.unknown()),
      positionDisagreement: z.literal(false),
      // The reason is the tier's approved wording (see `reasons`), so it is not repeated per row.
    }),
    /** What the database computes for those inputs: checked against the proposal it creates. */
    expectedFingerprint: hex64,
  })
  .strict();
export type ManifestRow = z.infer<typeof manifestRowSchema>;

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(BULK_CONTRACT_VERSION),
    environment: z.literal("production-v2"),
    population: z.object({
      total: z.number().int().nonnegative(),
      tierA: z.number().int().nonnegative(),
      tierB: z.number().int().nonnegative(),
    }),
    reasons: z.object({ A: z.string(), B: z.string(), approval: z.string() }),
    rows: z.array(manifestRowSchema),
    manifestSha256: hex64,
  })
  .strict();
export type BulkManifest = z.infer<typeof manifestSchema>;

/** The manifest without its own hash: the thing that is hashed. */
export type UnhashedManifest = Omit<BulkManifest, "manifestSha256">;

const byCandidate = (a: ManifestRow, b: ManifestRow) =>
  a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0;

/** Builds the manifest in its one canonical order and hashes it. */
export async function buildManifest(rows: readonly ManifestRow[]): Promise<BulkManifest> {
  const sorted = [...rows].sort(byCandidate);
  const unhashed: UnhashedManifest = {
    schemaVersion: 1,
    contractVersion: BULK_CONTRACT_VERSION,
    environment: "production-v2",
    population: {
      total: sorted.length,
      tierA: sorted.filter((r) => r.tier === "A").length,
      tierB: sorted.filter((r) => r.tier === "B").length,
    },
    reasons: { A: BULK_REASONS.A, B: BULK_REASONS.B, approval: BULK_APPROVAL_REASON },
    rows: sorted,
  };
  return { ...unhashed, manifestSha256: await sha256Hex(canonicalJson(unhashed)) };
}

export type ManifestVerdict =
  | { readonly ok: true; readonly manifest: BulkManifest }
  | { readonly ok: false; readonly problems: readonly string[] };

/** A calendar date anywhere in a value would be a raw birth date (the manifest holds none). */
const CALENDAR_DATE = /\b\d{4}-\d{2}-\d{2}\b/;

function forbiddenKeys(value: unknown, path = "$"): string[] {
  if (typeof value === "string") return CALENDAR_DATE.test(value) ? [`${path} (a date)`] : [];
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, i) => forbiddenKeys(item, `${path}[${i}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(FORBIDDEN_MANIFEST_KEYS.some((re) => re.test(key)) ? [`${path}.${key}`] : []),
    ...forbiddenKeys(child, `${path}.${key}`),
  ]);
}

/**
 * Everything that must hold before a manifest is trusted by the screen or the
 * runner: the schema, its hash, its order, no duplicate candidate / provider id /
 * target app player, tier consistency, the reasons, and no name or birth date.
 */
export async function verifyManifest(input: unknown): Promise<ManifestVerdict> {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      problems: parsed.error.issues.map((i) => `schema: ${i.path.join(".")} ${i.message}`),
    };
  const manifest = parsed.data;
  const problems: string[] = [];

  const { manifestSha256: _hash, ...unhashed } = manifest;
  const recomputed = await sha256Hex(canonicalJson(unhashed));
  if (recomputed !== manifest.manifestSha256)
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
    "provider id",
    manifest.rows.map((r) => r.externalId),
  );
  dup(
    "target app player",
    manifest.rows.map((r) => r.appPlayerId),
  );

  const tierA = manifest.rows.filter((r) => r.tier === "A").length;
  const tierB = manifest.rows.filter((r) => r.tier === "B").length;
  if (
    manifest.population.total !== manifest.rows.length ||
    manifest.population.tierA !== tierA ||
    manifest.population.tierB !== tierB
  )
    problems.push("population: the declared counts do not match the rows");

  for (const row of manifest.rows) {
    if ((row.tier === "A") !== (row.signals.shirt === "match"))
      problems.push(`tier: ${row.candidateId} tier does not match its shirt signal`);
    if (
      row.fingerprintInputs.sofascoreCandidateId !== row.candidateId ||
      row.fingerprintInputs.sofascoreExternalId !== row.externalId ||
      row.fingerprintInputs.appPlayerId !== row.appPlayerId ||
      row.fingerprintInputs.candidateRevisions.sofascore !== row.evidenceRevision
    )
      problems.push(`inputs: ${row.candidateId} fingerprint inputs disagree with the row`);
  }
  if (
    manifest.reasons.A !== BULK_REASONS.A ||
    manifest.reasons.B !== BULK_REASONS.B ||
    manifest.reasons.approval !== BULK_APPROVAL_REASON
  )
    problems.push("reasons: the manifest reasons are not the approved wording");

  const forbidden = forbiddenKeys(input);
  if (forbidden.length > 0) problems.push(`forbidden: ${forbidden.slice(0, 3).join(", ")}`);

  return problems.length === 0 ? { ok: true, manifest } : { ok: false, problems };
}
