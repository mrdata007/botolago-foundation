/**
 * The contract of the Flashscore evidence batch. It extends the Sofascore batch (same
 * phases, same limits, same typed confirmations) and changes only what the evidence
 * IS: a Flashscore id is tied to a canonical player through a Sofascore player whose
 * mapping is already active and reviewed, plus match evidence read from finished
 * fixtures. It is a separate contract (and a separate manifest) so the completed
 * 189-row Sofascore contract is never reinterpreted.
 *
 * Nothing here decides who is mapped: the manifest does, and the reviewed backend
 * (propose, approve, execute) still checks every row on its own.
 */
export const FLASHSCORE_CONTRACT_VERSION = "player-mapping-bulk-flashscore-v1";

export const FLASHSCORE_EVIDENCE_CLASSES = [
  "F1_REVIEWED_SOFASCORE_EVENTS",
  "F2_REVIEWED_SOFASCORE_SHIRT_DOB",
] as const;
export type FlashscoreEvidenceClass = (typeof FLASHSCORE_EVIDENCE_CLASSES)[number];

/**
 * What a reviewer reads, one wording per class, stored as the proposal reason. Factual:
 * what was compared, and nothing the class lacks. Neither mentions a comparison with the
 * canonical app's birth date or a SportsMonks identity: this evidence has neither.
 * (The backend accepts 10 to 500 characters.)
 */
export const FLASHSCORE_REASONS: Readonly<Record<FlashscoreEvidenceClass, string>> = {
  F1_REVIEWED_SOFASCORE_EVENTS:
    "Batch-reviewed Flashscore identity: in a finished match both providers list as the same fixture, this Flashscore id and a Sofascore player whose mapping to this canonical player is active and reviewed share aligned match events (goal, assist, card or substitution) and an agreeing shirt number, or at least two distinct aligned events. Names were not compared.",
  F2_REVIEWED_SOFASCORE_SHIRT_DOB:
    "Batch-reviewed Flashscore identity: in a finished match both providers list as the same fixture, this Flashscore id and a Sofascore player whose mapping to this canonical player is active and reviewed share the same shirt number, and the birth date Flashscore reports agrees with the one Sofascore reports for that player. The date agreement is corroboration, not proof. Names were not compared.",
};

/** The proposal basis the class is recorded under (a label the backend stores; it decides nothing). */
export const FLASHSCORE_BASIS: Readonly<
  Record<FlashscoreEvidenceClass, "incident" | "shirt_position">
> = {
  F1_REVIEWED_SOFASCORE_EVENTS: "incident",
  F2_REVIEWED_SOFASCORE_SHIRT_DOB: "shirt_position",
};

export const FLASHSCORE_APPROVAL_REASON =
  "Reviewed the frozen Flashscore batch evidence and confirmed the proposal still matches the approved manifest and its supporting reviewed Sofascore mapping.";

/** Key names a Flashscore manifest may never carry: names, birth dates, raw provider payloads. */
export const FLASHSCORE_FORBIDDEN_KEYS: readonly RegExp[] = [
  /name/i,
  /birth/i,
  /dobvalue/i,
  /payload/i,
  /slug/i,
];
