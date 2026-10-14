// Evidence, certification, readiness and participation are shared with the Edge
// Function (the SofaScore Fantasy builder); they are re-exported unchanged, and
// so is the scoring itself (supabase/functions/_shared/fantasy-adaptive-scoring.ts,
// run by the Edge Function `fantasy-lifecycle-worker`).
export {
  DETAIL_FIELDS,
  SIMPLE_FIELDS,
  certified,
  deriveParticipation,
  readiness,
  type CertifiedStats,
  type EvidenceState,
  type FieldEvidence,
  type ParticipationTimeline,
  type ScoringField,
  type StatisticEvidence,
} from "../../../supabase/functions/_shared/fantasy-adaptive-core.ts";
export {
  EXCLUDED_SIMPLE_CATEGORIES,
  chooseFixtureMode,
  scoreCertifiedPlayerFixture,
  type ScoringMode,
} from "../../../supabase/functions/_shared/fantasy-adaptive-scoring.ts";
