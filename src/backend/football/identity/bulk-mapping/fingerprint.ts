import { sha256Hex } from "./canonical";

/**
 * Postgres prints jsonb with object keys ordered by length and then by bytes, `": "` after a
 * key and `", "` between items. The database's proposal fingerprint is the SHA-256 of that text,
 * so a proposal's fingerprint can be recomputed here from its own inputs and checked against the
 * one a manifest froze. Nothing in a proposal is non-ASCII (ids, codes, fixed wording).
 */
export function jsonbText(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${jsonbText(v)}`).join(", ")}}`;
}

/** The database's `admin_payload_fingerprint` of any jsonb value (used for the evidence-reference digest). */
export const jsonbFingerprint = (value: unknown): Promise<string> => sha256Hex(jsonbText(value));

export interface MapProposalInputs {
  readonly sofascoreCandidateId: string | null;
  readonly flashscoreCandidateId: string | null;
  readonly sofascoreExternalId: string | null;
  readonly flashscoreExternalId: string | null;
  readonly appPlayerId: string;
  readonly basis: string;
  readonly evidence: Record<string, unknown>;
  readonly signals: Record<string, unknown>;
  readonly candidateRevisions: Record<string, number>;
  readonly positionDisagreement: boolean;
  readonly reason: string;
}

/** The fingerprint the database gives a `map` proposal with these inputs (no mapping row, no position note). */
export function mapProposalFingerprint(i: MapProposalInputs): Promise<string> {
  return sha256Hex(
    jsonbText({
      kind: "map",
      sofascoreCandidateId: i.sofascoreCandidateId,
      flashscoreCandidateId: i.flashscoreCandidateId,
      sofascoreExternalId: i.sofascoreExternalId,
      flashscoreExternalId: i.flashscoreExternalId,
      providerName: null,
      mappingId: null,
      appPlayerId: i.appPlayerId,
      newExternalId: null,
      newAppPlayerId: null,
      expectedBefore: null,
      basis: i.basis,
      evidence: i.evidence,
      signals: i.signals,
      candidateRevisions: i.candidateRevisions,
      positionDisagreement: i.positionDisagreement,
      positionNote: null,
      reason: i.reason,
    }),
  );
}
