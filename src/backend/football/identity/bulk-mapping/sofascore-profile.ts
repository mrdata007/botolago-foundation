import { BULK_APPROVAL_REASON, BULK_REASONS, type BulkTier } from "./contract";
import type { ManifestRow } from "./manifest";
import type { BulkProfile } from "./profile";
import { revalidateRow } from "./revalidate";

/** The completed 189-row Sofascore batch (tiers A and B). Behaviour is unchanged. */
export const sofascoreProfile: BulkProfile<ManifestRow> = {
  kind: "sofascore",
  candidateField: "sofascoreCandidateId",
  groups: ["A", "B"] satisfies readonly BulkTier[],
  groupOf: (row) => row.tier,
  reasonOf: (group) => BULK_REASONS[group as BulkTier],
  approvalReason: BULK_APPROVAL_REASON,
  proposeItem: (row) => ({
    kind: "map",
    sofascoreCandidateId: row.candidateId,
    appPlayerId: row.appPlayerId,
    basis: "manual",
  }),
  revalidate: (deps, row, _snapshot, preloaded) =>
    revalidateRow(deps.repository, row, deps.context(), preloaded),
};
