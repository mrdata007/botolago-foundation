/**
 * Why a Sofascore player has no canonical app player yet, and what would settle
 * it, from structured evidence only: the provider's exact birth date compared
 * (inside the database) with the WHOLE catalogue, not just the observed club;
 * the app's memberships, mappings and Fantasy flags; and the candidate's own
 * attribute signals. Pure: no database, no network, no clock.
 *
 * Never used: names, a shirt number alone, a guessed birth date, an invented
 * position. Never done: a player, membership, position or mapping is created or
 * changed. "Not found by this matcher" is NOT "does not exist": the player may
 * be missing a birth date in the catalogue, be a new registration, or carry a
 * wrong date; the result says which evidence is missing.
 *
 * An identity link is only a link. It does not move a player's Fantasy club,
 * position, price, locked-lineup association or historical scoring; where the
 * catalogue and the provider disagree about the CLUB, that is reported as a
 * membership question that needs dated evidence, never silently resolved.
 */
import type { SofaCandidateRow } from "./provider-identity-worklist";

export type ResolutionClass =
  | "EXISTING_CANONICAL_PLAYER_IDENTIFIED"
  | "MAPPING_EVIDENCE_INSUFFICIENT"
  | "MEMBERSHIP_CORRECTION_NEEDED"
  | "OTHER_ATTRIBUTE_CONFLICT"
  | "CANDIDATE_RECORD_MISSING"
  | "CANONICAL_PLAYER_NOT_FOUND";

/** One app player whose birth date equals the provider's, anywhere in the catalogue. */
export interface CatalogMatch {
  readonly appPlayer: string;
  readonly active: boolean;
  /** G, D, M or F. */
  readonly pos: string | null;
  readonly sameClubActive: boolean;
  readonly sameClubEver: boolean;
  /** Active memberships at a club other than the observed one. */
  readonly otherActiveClubs: number;
  readonly inactiveMemberships: number;
  readonly sofaMapped: boolean;
  readonly flashMapped: boolean;
  readonly smActive: boolean;
  readonly inFantasyCatalog: boolean;
  readonly inLockedSquad: boolean;
}

export interface CatalogRead {
  readonly ext: string;
  readonly team: string;
  readonly club: string;
  readonly dobState: string | null;
  readonly jan1: boolean;
  readonly obsShirt: number | null;
  readonly obsPos: string | null;
  readonly wideMatches: readonly CatalogMatch[];
  readonly clubActive: number;
  readonly clubNullDob: number;
  readonly clubJan1Dob: number;
}

/** An active player of a club with no Sofascore mapping: a possible target for a player nothing else matches. */
export interface PoolPlayer {
  readonly team: string;
  readonly p: string;
  readonly pos: string | null;
  readonly dob: "null" | "jan1" | "set";
  readonly shirts: readonly number[] | null;
  readonly sm: boolean;
  readonly fantasy: boolean;
  readonly locked: boolean;
}

export type AttributeConflict = "position" | "shirt";

export interface Resolution {
  readonly externalId: string;
  readonly classification: ResolutionClass;
  /** A short stable reason code. */
  readonly code: string;
  /** The ONE canonical player the evidence points at, if it does. Never a guess among several. */
  readonly targetAppPlayerId: string | null;
  /** Strength of the IDENTITY evidence alone, apart from club, position and shirt metadata. */
  readonly identityConfidence: "HIGH" | "NONE";
  /** Provider and catalogue disagree about these attributes; no attribute is corrected by a mapping. */
  readonly attributeConflicts: readonly AttributeConflict[];
  /** How many club players with a missing or placeholder birth date could be the one (insufficient cases). */
  readonly possibleTargetsWithMissingDob: number | null;
  readonly fantasy: { readonly inCatalog: boolean; readonly inLockedSquad: boolean };
  /** Exactly what is missing; empty only when the identity is established. */
  readonly missingEvidence: readonly string[];
  readonly notes: readonly string[];
}

const LINK_EFFECT =
  "A mapping would not move the player's club, position, price, locked-lineup association or historical scoring.";

export function resolveSofascoreIdentity(input: {
  readonly externalId: string;
  readonly candidate: SofaCandidateRow | null;
  readonly read: CatalogRead | null;
  /** Active players of the club the provider lists him under, with no Sofascore mapping. */
  readonly pool: readonly PoolPlayer[];
  /** Position the provider's lineup gives, used only to size the pool when there is no candidate. */
  readonly lineupPosition: string | null;
  readonly lineupClubTeam: string | null;
}): Resolution {
  const { externalId, candidate, read, pool } = input;
  const base = {
    externalId,
    targetAppPlayerId: null,
    identityConfidence: "NONE" as const,
    attributeConflicts: [] as AttributeConflict[],
    possibleTargetsWithMissingDob: null as number | null,
    fantasy: { inCatalog: false, inLockedSquad: false },
    notes: [LINK_EFFECT],
  };

  if (!candidate || !read) {
    const club = pool.filter((p) => p.team === input.lineupClubTeam);
    const samePos = club.filter(
      (p) => input.lineupPosition === null || p.pos === input.lineupPosition,
    );
    return {
      ...base,
      classification: "CANDIDATE_RECORD_MISSING",
      code: "NO_REVIEW_WORKFLOW_RECORD",
      possibleTargetsWithMissingDob: null,
      missingEvidence: [
        "A candidate record for this Sofascore id, so its birth date can be compared with the catalogue inside the database (a write the owner has not authorised).",
      ],
      notes: [
        ...base.notes,
        `This is a missing review-workflow record, not a finding that no canonical player exists: ${samePos.length} unmapped club player(s) share his lineup position, none proven.`,
      ],
    };
  }

  if (candidate.dobState !== "valid" || candidate.dobJan1) {
    const why = candidate.dobJan1 ? "is a 1 January placeholder" : "is missing";
    return {
      ...base,
      classification: "MAPPING_EVIDENCE_INSUFFICIENT",
      code: "PROVIDER_DOB_UNUSABLE",
      missingEvidence: [
        `A usable provider birth date (it ${why}); with none, the catalogue cannot be searched by date.`,
      ],
    };
  }

  const matches = read.wideMatches;
  const unmappedClub = pool.filter((p) => p.team === read.team);
  // Position is metadata the provider and the catalogue may disagree about (five of the seven
  // identified players do), so it cannot rule a club player out: every unmapped club player with a
  // missing or placeholder catalogue birth date stays a possible target.
  const missingDobPool = unmappedClub.filter((p) => p.dob === "null" || p.dob === "jan1");

  if (matches.length === 0) {
    if (missingDobPool.length > 0) {
      return {
        ...base,
        classification: "MAPPING_EVIDENCE_INSUFFICIENT",
        code: "APP_DOB_MISSING_FOR_POSSIBLE_TARGETS",
        possibleTargetsWithMissingDob: missingDobPool.length,
        missingEvidence: [
          `No app player in the whole catalogue has his exact birth date; ${missingDobPool.length} unmapped club player(s) have no usable birth date in the catalogue, so a person among them cannot be proven or excluded. Needs a catalogue birth date for those players, or another structured signal that is not a shirt number alone.`,
        ],
      };
    }
    return {
      ...base,
      classification: "CANONICAL_PLAYER_NOT_FOUND",
      code: "NOT_FOUND_BY_THIS_MATCHER",
      possibleTargetsWithMissingDob: 0,
      missingEvidence: [
        "Not found by this matcher: no app player has his exact birth date and no unmapped club player lacks one. He may be a new registration absent from the catalogue, or the catalogue's date may be wrong. This does not show he does not exist, and no player may be created from it.",
      ],
    };
  }

  if (matches.length > 1) {
    const mappedElsewhere = matches.filter((m) => m.sofaMapped).length;
    return {
      ...base,
      classification: "MAPPING_EVIDENCE_INSUFFICIENT",
      code: mappedElsewhere > 0 ? "TARGET_ALREADY_REPRESENTED" : "AMBIGUOUS_EXACT_DOB",
      missingEvidence: [
        mappedElsewhere > 0
          ? "More than one app player has his exact birth date and one of them already has a different Sofascore id: either two Sofascore ids exist for one person, or two people share a birth date. Needs a structured signal that separates them."
          : "More than one app player has his exact birth date. Needs a structured signal that separates them.",
      ],
    };
  }

  const m = matches[0] as CatalogMatch;
  const fantasy = { inCatalog: m.inFantasyCatalog, inLockedSquad: m.inLockedSquad };
  if (m.sofaMapped) {
    return {
      ...base,
      fantasy,
      classification: "MAPPING_EVIDENCE_INSUFFICIENT",
      code: "TARGET_ALREADY_REPRESENTED",
      missingEvidence: [
        "The one app player with his birth date already has a different Sofascore id: either two ids exist for one person, or the date is shared by two people.",
      ],
    };
  }
  if (!m.sameClubActive) {
    return {
      ...base,
      fantasy,
      classification: "MEMBERSHIP_CORRECTION_NEEDED",
      code:
        m.otherActiveClubs > 0
          ? "CATALOGUE_PLACES_HIM_AT_ANOTHER_CLUB"
          : "CATALOGUE_HAS_NO_ACTIVE_MEMBERSHIP",
      targetAppPlayerId: m.appPlayer,
      identityConfidence: "NONE",
      missingEvidence: [
        m.otherActiveClubs > 0
          ? "Dated evidence of which club he played for on the match date (the catalogue has him at a different club). Without it, the same birth date at a different club could be a different person."
          : "Dated evidence of his club membership on the match date (the catalogue has no active membership for him).",
      ],
      notes: [
        ...base.notes,
        m.inLockedSquad
          ? "He is in a locked Fantasy squad: nothing here may move him; a membership change needs the owner."
          : m.inFantasyCatalog
            ? "He is in the Fantasy catalogue: a membership change would affect his club and price and needs the owner."
            : "He is not in the Fantasy catalogue.",
      ],
    };
  }

  // Exact birth date, the observed club (active), one player: identity is strong. Position and
  // shirt are metadata the provider and the catalogue may disagree about; they are reported.
  const signals = candidate.target === m.appPlayer ? (candidate.targetSignals ?? {}) : {};
  const conflicts: AttributeConflict[] = [];
  if (
    signals.position === "conflict" ||
    (m.pos !== null && read.obsPos !== null && m.pos !== read.obsPos)
  ) {
    conflicts.push("position");
  }
  if (signals.shirt === "conflict") conflicts.push("shirt");
  if (conflicts.length > 1 || !m.smActive) {
    return {
      ...base,
      fantasy,
      classification: "OTHER_ATTRIBUTE_CONFLICT",
      code: m.smActive ? "SEVERAL_ATTRIBUTES_DISAGREE" : "NO_INDEPENDENT_IDENTITY_CORROBORATION",
      targetAppPlayerId: m.appPlayer,
      attributeConflicts: conflicts,
      missingEvidence: [
        m.smActive
          ? "Position and shirt both disagree; a second reviewer-visible reason to accept the identity."
          : "No active SportsMonks identity corroborates this canonical player.",
      ],
    };
  }
  return {
    ...base,
    fantasy,
    classification: "EXISTING_CANONICAL_PLAYER_IDENTIFIED",
    code:
      conflicts.length === 0
        ? "EXACT_DOB_CLUB_POSITION"
        : `EXACT_DOB_CLUB_${(conflicts[0] as string).toUpperCase()}_DIFFERS`,
    targetAppPlayerId: m.appPlayer,
    identityConfidence: "HIGH",
    attributeConflicts: conflicts,
    missingEvidence: [],
    notes: [
      ...base.notes,
      conflicts.includes("position")
        ? "The provider's position differs from the catalogue's: the existing workflow holds such a proposal for a position note and an explicit acknowledgement. Nothing corrects the catalogue position."
        : conflicts.includes("shirt")
          ? "The provider's shirt number differs from the catalogue's (a flag only). Nothing corrects the catalogue."
          : "Birth date, club and position all agree.",
    ],
  };
}
