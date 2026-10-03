import type { ProposalDto } from "@/backend/football/identity/mapping-contracts";

/** What a person must type before the execute button works. Never translated. */
export const EXECUTE_CONFIRMATION_PHRASE = "EXECUTE_PLAYER_MAPPING";

/** Only an approved, unexpired proposal is ever offered for execution. */
export function canOfferExecute(proposal: ProposalDto): boolean {
  return proposal.status === "approved" && proposal.effectiveStatus !== "expired";
}

/** The typed confirmation, matched exactly (surrounding spaces from a paste are ignored). */
export function isConfirmationTyped(typed: string): boolean {
  return typed.trim() === EXECUTE_CONFIRMATION_PHRASE;
}
