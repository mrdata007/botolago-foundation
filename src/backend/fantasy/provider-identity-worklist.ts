/**
 * ONE match-focused identity worklist for a set of finished matches: every
 * player who appeared, on either provider, deduplicated BY PROVIDER IDENTITY
 * (a player in two matches is one row), each classified and, where evidence
 * supports it, given one proposed canonical target.
 *
 * Pure: no database, no network, no clock, no write. It builds a REVIEW
 * MANIFEST. It is not a proposal, a mapping or an approval, and nothing here
 * can become one. Names are never read (a lineup entry's name is not touched);
 * raw birth dates never enter: the only date signal is a state ("match",
 * AGREE, DISAGREE) computed elsewhere.
 *
 * Classes (an identity link is one of these, never a score):
 * - READY_FOR_BATCH_REVIEW: a defensible evidence chain, one unique canonical
 *   target, no contradicting identity evidence, no mapping collision.
 * - AMBIGUOUS: the evidence fits more than one target or partner.
 * - CONFLICT: the evidence contradicts itself or collides with another identity.
 * - INSUFFICIENT_EVIDENCE: a candidate exists, but no safe canonical match does.
 * - CANDIDATE_RECORD_MISSING: no candidate record exists for the provider id.
 *   Different from the one above: nothing can be proposed until a record
 *   exists, and this task creates none.
 *
 * Dependencies are explicit. A Flashscore row whose partner Sofascore identity
 * has no reviewed mapping depends on a NEW Sofascore row; it is READY only if
 * that row is READY, and it says so. A hypothetical Sofascore mapping is never
 * presented as reviewed.
 */
import { canonicalJson, sha256Hex } from "../football/identity/bulk-mapping/canonical";
import type { MatchSide } from "../football/provider/performance-contracts";
import {
  bridgeFixture,
  buildBridgeReviewSet,
  type BridgeFixtureInput,
  type BridgePriority,
  type BridgeUnresolved,
} from "./provider-identity-bridge";
import { classifyAppearances, type AppearanceRecord } from "./provider-appearances";
import type { CorroborationResult } from "./provider-identity-corroboration";
import {
  buildReviewedIdentitySnapshot,
  indexReviewedIdentities,
  type MappingRowInput,
  type ReviewedIdentitySnapshot,
} from "./reviewed-identities";

export type RowClass =
  | "READY_FOR_BATCH_REVIEW"
  | "AMBIGUOUS"
  | "CONFLICT"
  | "INSUFFICIENT_EVIDENCE"
  | "CANDIDATE_RECORD_MISSING";

export type EvidenceClass =
  /** Sofascore -> app player: exact birth date, current club and position agree on one app player. */
  | "S1_DOB_CLUB_POSITION"
  /** Flashscore -> reviewed Sofascore -> app: a shirt number plus aligned match events. */
  | "F1_REVIEWED_SOFASCORE_EVENTS"
  /** Flashscore -> reviewed Sofascore -> app: a shirt number plus an agreeing birth date. */
  | "F2_REVIEWED_SOFASCORE_SHIRT_DOB"
  /** Flashscore -> a Sofascore row that is itself only proposed (dependency). */
  | "F3_DEPENDS_ON_PROPOSED_SOFASCORE"
  | "NONE";

export interface FlashCandidateRow {
  readonly candidateId: string;
  readonly externalId: string;
  readonly status: string;
  readonly rev: number;
  readonly club: string | null;
  readonly complete: string | null;
  readonly openProposal?: boolean;
}

/** The structured, name-free eligibility signals read for an unmapped Sofascore candidate. */
export interface SofaCandidateRow {
  readonly candidateId: string;
  readonly externalId: string;
  readonly status: string;
  readonly rev: number;
  readonly nObs: number;
  readonly club: string | null;
  readonly complete: string | null;
  readonly regDisagree: boolean | null;
  readonly dobState: string | null;
  readonly dobJan1: boolean | null;
  readonly openProposal: boolean;
  readonly extMapped: boolean;
  readonly nOpts: number | null;
  readonly dobMatches: number | null;
  readonly target: string | null;
  readonly targetSignals: {
    readonly position?: string;
    readonly club?: string;
    readonly shirt?: string;
    readonly dob?: string;
    readonly flags?: readonly unknown[];
  } | null;
  readonly targetSmActive: boolean;
  readonly targetSofaMapped: boolean;
  readonly targetFlashMapped: boolean;
}

export interface WorklistTimes {
  /** When the provider payloads were captured (historical: not a fresh provider check). */
  readonly payloadObservedAt: string;
  readonly mappingSnapshotCapturedAt: string;
  readonly candidateRecordsReadAt: string;
  /** Per-result observation times of the corroboration reads, when any. */
  readonly corroborationObservedAt: string | null;
}

export interface WorklistInput {
  readonly fixtures: readonly BridgeFixtureInput[];
  readonly snapshot: ReviewedIdentitySnapshot;
  readonly flashCandidates: readonly FlashCandidateRow[];
  readonly sofaCandidates: readonly SofaCandidateRow[];
  readonly lockedSquadAppPlayerIds: ReadonlySet<string>;
  readonly corroboration: readonly CorroborationResult[];
  readonly times: WorklistTimes;
}

export interface FixtureReference {
  readonly sofascoreFixtureId: string;
  readonly flashscoreFixtureId: string;
  readonly kickoffAt: string;
  readonly side: MatchSide;
}

export type Affects = "identity" | "events" | "participation" | "readiness";

export interface WorklistRow {
  /** Deterministic: the same provider id and target always give the same id. */
  readonly rowId: string;
  readonly provider: "sofascore" | "flashscore";
  readonly externalId: string;
  readonly candidateId: string | null;
  readonly candidateRevision: number | null;
  readonly classification: RowClass;
  readonly evidenceClass: EvidenceClass;
  /** Proposed canonical app player. Null unless the evidence supports exactly one. */
  readonly targetAppPlayerId: string | null;
  /** Reviewed mappings this row rests on (id and version). */
  readonly supportingMappings: readonly {
    readonly provider: "sofascore";
    readonly externalId: string;
    readonly mappingId: string;
    readonly version: string | null;
  }[];
  /** rowIds of PROPOSED rows this one cannot stand without. */
  readonly dependsOn: readonly string[];
  readonly fixtures: readonly FixtureReference[];
  /** What the evidence is. Structured, name-free, date-free. */
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly limitations: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly reasons: readonly string[];
  readonly affects: readonly Affects[];
  /** How he is evidenced to have taken part. Never "did not play": at most UNKNOWN. */
  readonly participation: ParticipationSummary;
  readonly priority: readonly (BridgePriority | "starter")[];
  /** Present on READY rows only: a factual audit reason, no name. */
  readonly proposedAuditReason: string | null;
}

export interface Worklist {
  readonly snapshotDigest: string;
  readonly times: WorklistTimes;
  readonly rows: readonly WorklistRow[];
  readonly counts: {
    readonly byProviderAndClass: Readonly<Record<string, number>>;
    readonly readyByEvidenceClass: Readonly<Record<string, number>>;
    readonly collisions: number;
    readonly dependencies: number;
    readonly identitiesTotal: number;
  };
}

const LIMITS_S1: readonly string[] = [
  "One provider's birth date against the app catalogue's, plus current club and position: strong, but not an independent third source.",
  "No active SportsMonks identity corroborates the target (the 189-row contract required one).",
  "Shows who the player is, not his club on a match date, or that he played.",
];
const LIMITS_F: readonly string[] = [
  "Evidence from finished matches read from the same two providers; not a third independent source.",
  "Shows who the player is, not his club on a match date, his position, or that his events are right.",
  "A person must review it; it is not a mapping until proposed, approved and executed.",
];

const short = async (text: string) => (await sha256Hex(text)).slice(0, 24);

interface Appearance {
  readonly record: AppearanceRecord;
  readonly fixture: FixtureReference;
}

function appearances(
  fixture: BridgeFixtureInput,
  provider: "sofascore" | "flashscore",
): Appearance[] {
  const data = provider === "sofascore" ? fixture.sofascore : fixture.flashscore;
  return classifyAppearances(data, provider).map((record) => ({
    record,
    fixture: {
      sofascoreFixtureId: fixture.link.sofascoreFixtureId,
      flashscoreFixtureId: fixture.link.flashscoreFixtureId,
      kickoffAt: fixture.sofascore.summary.kickoffAt,
      // An id no lineup lists has the side its incident gives; never an invented lineup entry.
      side: record.side ?? "home",
    },
  }));
}

type Identity = {
  provider: "sofascore" | "flashscore";
  externalId: string;
  appearances: Appearance[];
};

/** Deduplicate appearances by provider identity, not by fixture. */
function identitiesOf(fixtures: readonly BridgeFixtureInput[]): Identity[] {
  const map = new Map<string, Identity>();
  for (const fixture of fixtures) {
    for (const provider of ["sofascore", "flashscore"] as const) {
      for (const a of appearances(fixture, provider)) {
        const key = `${provider}:${a.record.externalId}`;
        const existing = map.get(key);
        if (existing) existing.appearances.push(a);
        else map.set(key, { provider, externalId: a.record.externalId, appearances: [a] });
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    a.provider === b.provider
      ? a.externalId < b.externalId
        ? -1
        : 1
      : a.provider < b.provider
        ? -1
        : 1,
  );
}

function tagsOf(identity: Identity): (BridgePriority | "starter")[] {
  const tags = new Set<BridgePriority | "starter">();
  for (const a of identity.appearances) {
    if (a.record.scorer) tags.add("scorer");
    if (a.record.assister) tags.add("assister");
    if (a.record.carded) tags.add("carded");
    if (a.record.lineup?.position === "G") tags.add("goalkeeper");
    if (a.record.evidence === "STARTER") tags.add("starter");
    else if (a.record.evidence === "SUBSTITUTED_IN") tags.add("substituted");
  }
  return [...tags].sort();
}

/** How the identity's participation is evidenced, over every match he appears in. */
export interface ParticipationSummary {
  readonly evidence: readonly string[];
  /** The worst state over his matches: CONTRADICTORY, else UNKNOWN, else VERIFIED. */
  readonly state: "VERIFIED" | "CONTRADICTORY" | "UNKNOWN";
  readonly discrepancies: readonly string[];
  /** True when no lineup lists him in any match (an incident names an id nobody lists). */
  readonly incidentOnly: boolean;
  /** Named in a goal, assist, card or missed penalty: points depend on this identity. */
  readonly scoringRelevant: boolean;
}

function participationOf(identity: Identity): ParticipationSummary {
  const records = identity.appearances.map((a) => a.record);
  const states = new Set(records.map((r) => r.state));
  return {
    evidence: [...new Set(records.map((r) => r.evidence))].sort(),
    state: states.has("CONTRADICTORY")
      ? "CONTRADICTORY"
      : states.has("UNKNOWN")
        ? "UNKNOWN"
        : "VERIFIED",
    discrepancies: [...new Set(records.flatMap((r) => r.discrepancies))].sort(),
    incidentOnly: records.every((r) => r.lineup === null),
    scoringRelevant: records.some((r) => r.scoringRelevant),
  };
}

const affectsOf = (tags: readonly string[]): Affects[] => {
  const out: Affects[] = ["identity"];
  if (tags.some((t) => ["scorer", "assister", "carded"].includes(t))) out.push("events");
  out.push("participation", "readiness");
  return out;
};

const fixtureRefs = (identity: Identity): FixtureReference[] =>
  identity.appearances
    .map((a) => a.fixture)
    .sort((a, b) => (a.sofascoreFixtureId < b.sofascoreFixtureId ? -1 : 1));

/** Why an unmapped Sofascore candidate is, or is not, safe to propose. */
export function classifySofascoreCandidate(c: SofaCandidateRow): {
  readonly classification: RowClass;
  readonly bucket: string;
  readonly reasons: string[];
  readonly missing: string[];
} {
  const r: string[] = [];
  const m: string[] = [];
  if (c.extMapped || c.status !== "unmapped" || c.openProposal) {
    return {
      classification: "CONFLICT",
      bucket: "HELD",
      reasons: ["The candidate is already mapped, held or has an open proposal."],
      missing: [],
    };
  }
  if (c.nObs !== 1) {
    return {
      classification: "AMBIGUOUS",
      bucket: "AMBIGUOUS_OBSERVATIONS",
      reasons: ["The candidate was seen in more than one squad."],
      missing: ["One clear squad observation."],
    };
  }
  if (c.complete !== "COMPLETE" || c.dobState !== "valid" || c.dobJan1) {
    r.push(
      c.dobJan1
        ? "The provider birth date is 1 January: a placeholder, no signal."
        : c.dobState !== "valid"
          ? "The provider birth date is missing."
          : "The provider squad was incomplete.",
    );
    m.push("A usable provider birth date and a complete squad.");
    return {
      classification: "INSUFFICIENT_EVIDENCE",
      bucket: "INCOMPLETE_PROVIDER_DATA",
      reasons: r,
      missing: m,
    };
  }
  if (c.regDisagree) {
    return {
      classification: "CONFLICT",
      bucket: "REGISTERED_TEAM_DISAGREEMENT",
      reasons: ["The provider registers him to a different team than the squad he was seen in."],
      missing: [],
    };
  }
  const dm = c.dobMatches ?? 0;
  if (dm === 0) {
    return {
      classification: "INSUFFICIENT_EVIDENCE",
      bucket: "NO_APP_PLAYER_WITH_EXACT_DOB",
      reasons: ["No active app player of the observed club has this exact birth date."],
      missing: [
        "An app player of the club with the same birth date (the catalogue's date may be missing, a placeholder or different, or the player may not be in the app's squad).",
      ],
    };
  }
  if (dm > 1) {
    return {
      classification: "AMBIGUOUS",
      bucket: "AMBIGUOUS_DOB",
      reasons: ["More than one app player of the club shares this birth date."],
      missing: ["A signal that separates them."],
    };
  }
  const s = c.targetSignals ?? {};
  const flags = s.flags ?? [];
  if (
    s.position === "conflict" ||
    s.club !== "match" ||
    s.shirt === "conflict" ||
    flags.length > 0
  ) {
    const why: string[] = [];
    if (s.position === "conflict") why.push("position conflicts");
    if (s.club !== "match") why.push("club does not match");
    if (s.shirt === "conflict") why.push("shirt number conflicts");
    if (flags.length > 0) why.push("the candidate carries review flags");
    return {
      classification: "CONFLICT",
      bucket: "CONTRADICTING_SIGNALS",
      reasons: [`The one birth-date match has contradicting signals: ${why.join(", ")}.`],
      missing: [],
    };
  }
  if (c.targetSofaMapped) {
    return {
      classification: "CONFLICT",
      bucket: "TARGET_ALREADY_MAPPED",
      reasons: ["The target app player already has a Sofascore mapping."],
      missing: [],
    };
  }
  if (c.targetFlashMapped) {
    r.push("The target app player already has a Flashscore mapping (unexpected).");
  }
  if (s.position !== "match") {
    return {
      classification: "INSUFFICIENT_EVIDENCE",
      bucket: "POSITION_NO_SIGNAL",
      reasons: ["Birth date and club agree, but position gives no signal."],
      missing: ["A position signal."],
    };
  }
  return {
    classification: "READY_FOR_BATCH_REVIEW",
    bucket: c.targetSmActive ? "ELIGIBLE_BY_189_CONTRACT" : "DOB_CLUB_POSITION_NO_SPORTSMONKS",
    reasons: r,
    missing: [],
  };
}

function priorityRank(tags: readonly string[]): number {
  return (
    (tags.includes("scorer") ? 8 : 0) +
    (tags.includes("assister") ? 4 : 0) +
    (tags.includes("goalkeeper") ? 4 : 0) +
    (tags.includes("in_locked_squad") ? 2 : 0) +
    (tags.includes("carded") ? 1 : 0)
  );
}

export async function buildWorklist(input: WorklistInput): Promise<Worklist> {
  const { fixtures, snapshot } = input;
  const index = indexReviewedIdentities(snapshot);
  const identities = identitiesOf(fixtures);
  const flashCand = new Map(input.flashCandidates.map((c) => [c.externalId, c]));
  const sofaCand = new Map(input.sofaCandidates.map((c) => [c.externalId, c]));
  const corroborationOf = new Map(
    input.corroboration.map((c) => [`${c.sofascorePlayerId}|${c.flashscorePlayerId}`, c]),
  );

  // Bridge candidates and their unresolved reasons, per Flashscore id (merged over matches).
  const bridge = buildBridgeReviewSet(fixtures, snapshot);
  const suggestionByFlash = new Map(bridge.suggestions.map((s) => [s.flashscoreId, s]));
  const conflictedFlash = new Set(bridge.conflicts.flatMap((c) => [...c.flashscoreIds]));
  const unresolvedByFlash = new Map<string, BridgeUnresolved[]>();
  for (const u of bridge.unresolved) {
    unresolvedByFlash.set(u.flashscoreId, [...(unresolvedByFlash.get(u.flashscoreId) ?? []), u]);
  }
  // Bridge candidates dropped in a conflict still have a row: a CONFLICT one.
  const conflictCandidates = new Map<string, string[]>();
  for (const fixture of fixtures) {
    for (const c of bridgeFixture(fixture, snapshot).candidates) {
      if (conflictedFlash.has(c.flashscoreId) || !suggestionByFlash.has(c.flashscoreId)) {
        conflictCandidates.set(c.flashscoreId, [
          ...(conflictCandidates.get(c.flashscoreId) ?? []),
          c.appPlayerId,
        ]);
      }
    }
  }

  const rows: WorklistRow[] = [];

  // ---- Sofascore identities with no reviewed mapping ---------------------------------
  const sofaRows = new Map<string, WorklistRow>();
  for (const identity of identities.filter((i) => i.provider === "sofascore")) {
    if (index.entryOf("sofascore", identity.externalId)) continue;
    const tags = tagsOf(identity);
    const cand = sofaCand.get(identity.externalId);
    const common = {
      provider: "sofascore" as const,
      externalId: identity.externalId,
      fixtures: fixtureRefs(identity),
      affects: affectsOf(tags),
      participation: participationOf(identity),
      priority: tags,
      supportingMappings: [] as WorklistRow["supportingMappings"],
      dependsOn: [] as string[],
    };
    if (!cand) {
      const rowId = await short(`sofascore|${identity.externalId}|none`);
      sofaRows.set(identity.externalId, {
        ...common,
        rowId,
        candidateId: null,
        candidateRevision: null,
        classification: "CANDIDATE_RECORD_MISSING",
        evidenceClass: "NONE",
        targetAppPlayerId: null,
        evidence: { candidateRecord: "missing" },
        limitations: [],
        missingEvidence: [
          "A candidate record for this Sofascore id (none exists; this task creates none).",
        ],
        reasons: ["No candidate record exists for this provider id."],
        proposedAuditReason: null,
      });
      continue;
    }
    const verdict = classifySofascoreCandidate(cand);
    const ready = verdict.classification === "READY_FOR_BATCH_REVIEW";
    const rowId = await short(
      `sofascore|${identity.externalId}|${ready ? (cand.target ?? "") : "none"}`,
    );
    sofaRows.set(identity.externalId, {
      ...common,
      rowId,
      candidateId: cand.candidateId,
      candidateRevision: cand.rev,
      classification: verdict.classification,
      evidenceClass: ready ? "S1_DOB_CLUB_POSITION" : "NONE",
      targetAppPlayerId: ready ? cand.target : null,
      evidence: {
        bucket: verdict.bucket,
        dob: ready ? "exact_match_unique_app_player" : (cand.dobState ?? "missing"),
        club: cand.targetSignals?.club ?? null,
        position: cand.targetSignals?.position ?? null,
        shirt: cand.targetSignals?.shirt ?? null,
        appPlayersInObservedClub: cand.nOpts,
        sportsmonksIdentityOnTarget: ready ? cand.targetSmActive : null,
      },
      limitations: ready ? LIMITS_S1 : [],
      missingEvidence: verdict.missing,
      reasons: verdict.reasons,
      proposedAuditReason: ready
        ? "Sofascore player id agrees with one app player of the observed club on exact birth date, club and position; the target has no Sofascore mapping. No name was used."
        : null,
    });
  }

  // Two proposed Sofascore rows for one app player are a collision: neither is READY.
  const readySofaByTarget = new Map<string, WorklistRow[]>();
  for (const r of sofaRows.values()) {
    if (r.classification === "READY_FOR_BATCH_REVIEW" && r.targetAppPlayerId) {
      readySofaByTarget.set(r.targetAppPlayerId, [
        ...(readySofaByTarget.get(r.targetAppPlayerId) ?? []),
        r,
      ]);
    }
  }
  let collisions = 0;
  for (const group of readySofaByTarget.values()) {
    if (group.length < 2) continue;
    collisions += group.length;
    for (const r of group) {
      sofaRows.set(r.externalId, {
        ...r,
        classification: "CONFLICT",
        targetAppPlayerId: null,
        evidenceClass: "NONE",
        proposedAuditReason: null,
        reasons: [...r.reasons, "Another Sofascore id is proposed for the same app player."],
      });
    }
  }
  rows.push(...sofaRows.values());

  // ---- Flashscore identities ----------------------------------------------------------
  const flashRows = new Map<string, WorklistRow>();
  for (const identity of identities.filter((i) => i.provider === "flashscore")) {
    const id = identity.externalId;
    const tags = tagsOf(identity);
    const cand = flashCand.get(id);
    const suggestion = suggestionByFlash.get(id);
    const unresolved = unresolvedByFlash.get(id) ?? [];
    const base = {
      provider: "flashscore" as const,
      externalId: id,
      candidateId: cand?.candidateId ?? null,
      candidateRevision: cand?.rev ?? null,
      fixtures: fixtureRefs(identity),
      affects: affectsOf(tags),
      participation: participationOf(identity),
      priority: tags,
    };
    const row = async (
      over: Partial<WorklistRow> & Pick<WorklistRow, "classification" | "evidenceClass">,
    ): Promise<WorklistRow> => ({
      ...base,
      rowId: await short(`flashscore|${id}|${over.targetAppPlayerId ?? "none"}`),
      targetAppPlayerId: null,
      supportingMappings: [],
      dependsOn: [],
      evidence: {},
      limitations: [],
      missingEvidence: [],
      reasons: [],
      proposedAuditReason: null,
      ...over,
    });

    // An identity that already has a reviewed Flashscore mapping is not new work.
    if (index.entryOf("flashscore", id)) continue;
    if (cand && (cand.status !== "unmapped" || cand.openProposal === true)) {
      flashRows.set(
        id,
        await row({
          classification: "CONFLICT",
          evidenceClass: "NONE",
          evidence: { candidateStatus: cand.status },
          reasons: ["The candidate is already mapped, ignored, or has an open proposal."],
        }),
      );
      continue;
    }
    // An incident names an id that no lineup lists. No lineup entry is invented for him:
    // there is no side, shirt or position to pair on, so nothing here can be proposed.
    if (base.participation.incidentOnly) {
      flashRows.set(
        id,
        await row({
          classification: cand ? "INSUFFICIENT_EVIDENCE" : "CANDIDATE_RECORD_MISSING",
          evidenceClass: "NONE",
          evidence: { lineup: "absent", participation: base.participation.state },
          reasons: ["An incident names this id but no lineup lists it."],
          missingEvidence: [
            "A lineup entry (side, shirt number) for this id, or another structured signal tying it to a Sofascore id.",
            ...(cand
              ? []
              : [
                  "A candidate record for this Flashscore id (none exists; this task creates none).",
                ]),
          ],
        }),
      );
      continue;
    }

    if (conflictedFlash.has(id) || conflictCandidates.has(id)) {
      flashRows.set(
        id,
        await row({
          classification: "CONFLICT",
          evidenceClass: "NONE",
          evidence: {
            bridge: "conflict",
            competingAppPlayers: [...new Set(conflictCandidates.get(id) ?? [])].sort(),
          },
          reasons: [
            "The evidence ties this Flashscore id to more than one app player, or two Flashscore ids to one app player.",
          ],
        }),
      );
      continue;
    }

    // The Sofascore partner this id's evidence points at (one, or it is ambiguous).
    const partnerIds = suggestion
      ? [suggestion.sofascoreId]
      : [...new Set(unresolved.flatMap((u) => u.alternatives))];
    const reasonsOf = unresolved.map((u) => u.reason);

    if (!cand) {
      flashRows.set(
        id,
        await row({
          classification: "CANDIDATE_RECORD_MISSING",
          evidenceClass: "NONE",
          evidence: {
            candidateRecord: "missing",
            bridgeEvidence: suggestion ? "supported" : (reasonsOf[0] ?? "none"),
          },
          missingEvidence: [
            "A candidate record for this Flashscore id (none exists; this task creates none).",
          ],
          reasons: ["No candidate record exists for this provider id."],
        }),
      );
      continue;
    }

    if (suggestion) {
      const pairKey = `${suggestion.sofascoreId}|${id}`;
      const corr = corroborationOf.get(pairKey);
      if (corr?.dob === "DISAGREE") {
        flashRows.set(
          id,
          await row({
            classification: "CONFLICT",
            evidenceClass: "NONE",
            evidence: { bridge: "supported", dobCorroboration: "DISAGREE" },
            reasons: ["The events line up, but the providers give different birth dates."],
          }),
        );
        continue;
      }
      flashRows.set(
        id,
        await row({
          classification: "READY_FOR_BATCH_REVIEW",
          evidenceClass: "F1_REVIEWED_SOFASCORE_EVENTS",
          targetAppPlayerId: suggestion.appPlayerId,
          supportingMappings: [
            {
              provider: "sofascore",
              externalId: suggestion.sofascoreId,
              mappingId: suggestion.sofascoreMapping.mappingId,
              version: suggestion.sofascoreMapping.version,
            },
          ],
          evidence: {
            pairedSofascoreId: suggestion.sofascoreId,
            matches: suggestion.evidence.map((e) => ({
              fixture: e.fixture,
              shirtAgrees: e.shirtAgrees,
              events: e.events.map((ev) => ({
                signal: ev.signal,
                sofascore: ev.sofascore,
                flashscore: ev.flashscore,
              })),
            })),
            dobCorroboration: corr?.dob ?? "NOT_FETCHED",
          },
          limitations: suggestion.confidenceLimits,
          reasons: [],
          proposedAuditReason:
            "Flashscore player id is the same person as reviewed Sofascore player id (mapped to this app player): the same side of the same finished match, an agreeing shirt number or two events, and matching events in both providers. No name was used.",
        }),
      );
      continue;
    }

    // No supported suggestion: say exactly why, and what would settle it.
    const hasReason = (r: string) => reasonsOf.includes(r as never);
    if (hasReason("ambiguous_candidates") || partnerIds.length > 1) {
      flashRows.set(
        id,
        await row({
          classification: "AMBIGUOUS",
          evidenceClass: "NONE",
          evidence: { bridge: "ambiguous", sofascoreCandidates: partnerIds.length },
          reasons: ["The evidence fits more than one Sofascore entry."],
          missingEvidence: ["A signal that separates the candidates."],
        }),
      );
      continue;
    }
    if (
      hasReason("contradicting_event") ||
      hasReason("position_conflict") ||
      hasReason("app_player_claimed_twice")
    ) {
      flashRows.set(
        id,
        await row({
          classification: "CONFLICT",
          evidenceClass: "NONE",
          evidence: { bridge: reasonsOf.join(",") },
          reasons: [
            "The match evidence contradicts the pairing (an event, the shirt number or goalkeeper role ties an entry to someone else).",
          ],
        }),
      );
      continue;
    }
    const partner = partnerIds[0];
    if (!partner) {
      flashRows.set(
        id,
        await row({
          classification: "INSUFFICIENT_EVIDENCE",
          evidenceClass: "NONE",
          evidence: { bridge: reasonsOf[0] ?? "no_candidate" },
          reasons: [
            "No Sofascore entry shares a shirt number or an aligned event with this entry.",
          ],
          missingEvidence: [
            "Any structured signal that ties this Flashscore id to a Sofascore id.",
          ],
        }),
      );
      continue;
    }
    const partnerEntry = index.entryOf("sofascore", partner);
    const corr = corroborationOf.get(`${partner}|${id}`);
    if (partnerEntry) {
      // Shirt only so far; a reviewed Sofascore partner exists. A date of birth that agrees is the second signal.
      if (
        corr?.dob === "AGREE" &&
        (hasReason("no_event_alignment_shirt_only") || hasReason("single_event_shirt_disagrees"))
      ) {
        const shirtOnly = hasReason("no_event_alignment_shirt_only");
        if (shirtOnly) {
          flashRows.set(
            id,
            await row({
              classification: "READY_FOR_BATCH_REVIEW",
              evidenceClass: "F2_REVIEWED_SOFASCORE_SHIRT_DOB",
              targetAppPlayerId: partnerEntry.appPlayerId,
              supportingMappings: [
                {
                  provider: "sofascore",
                  externalId: partner,
                  mappingId: partnerEntry.mappingId,
                  version: partnerEntry.version,
                },
              ],
              evidence: {
                pairedSofascoreId: partner,
                shirtAgrees: true,
                dobCorroboration: "AGREE",
                dobObservedAt: input.times.corroborationObservedAt,
              },
              limitations: LIMITS_F,
              proposedAuditReason:
                "Flashscore player id is the same person as reviewed Sofascore player id (mapped to this app player): same side of the same finished match, an agreeing shirt number, and the two providers give the same birth date. No name was used.",
            }),
          );
          continue;
        }
      }
      if (corr?.dob === "DISAGREE") {
        flashRows.set(
          id,
          await row({
            classification: "CONFLICT",
            evidenceClass: "NONE",
            evidence: { pairedSofascoreId: partner, dobCorroboration: "DISAGREE" },
            reasons: ["The shirt numbers pair them but the providers give different birth dates."],
          }),
        );
        continue;
      }
      flashRows.set(
        id,
        await row({
          classification: "INSUFFICIENT_EVIDENCE",
          evidenceClass: "NONE",
          supportingMappings: [
            {
              provider: "sofascore",
              externalId: partner,
              mappingId: partnerEntry.mappingId,
              version: partnerEntry.version,
            },
          ],
          evidence: {
            pairedSofascoreId: partner,
            bridge: reasonsOf[0] ?? "none",
            dobCorroboration: corr?.dob ?? "NOT_FETCHED",
          },
          reasons: [
            hasReason("single_event_shirt_disagrees")
              ? "One event aligns them, but the shirt numbers differ."
              : "Only the shirt number pairs them (with club and position): that alone is not a bridge.",
          ],
          missingEvidence: [
            "A second independent signal: an aligned goal, card or substitution, or a birth date the two providers agree on.",
          ],
        }),
      );
      continue;
    }
    // The partner Sofascore identity has no reviewed mapping: a dependency on a NEW row.
    const partnerRow = sofaRows.get(partner);
    const eventsSupport = hasReason("sofascore_partner_not_reviewed");
    if (
      eventsSupport &&
      partnerRow?.classification === "READY_FOR_BATCH_REVIEW" &&
      partnerRow.targetAppPlayerId
    ) {
      flashRows.set(
        id,
        await row({
          classification: "READY_FOR_BATCH_REVIEW",
          evidenceClass: "F3_DEPENDS_ON_PROPOSED_SOFASCORE",
          targetAppPlayerId: partnerRow.targetAppPlayerId,
          dependsOn: [partnerRow.rowId],
          evidence: {
            pairedSofascoreId: partner,
            pairedSofascoreMapping: "PROPOSED_NOT_REVIEWED",
            bridge: "events_aligned",
          },
          limitations: [
            ...LIMITS_F,
            "Depends on a Sofascore mapping that is itself only proposed; it is not independent of it.",
          ],
          proposedAuditReason:
            "Flashscore player id is the same person as Sofascore player id (proposed in this batch, not yet reviewed): aligned events and an agreeing shirt number or two events. Valid only if that Sofascore row is approved. No name was used.",
        }),
      );
      continue;
    }
    flashRows.set(
      id,
      await row({
        classification: "INSUFFICIENT_EVIDENCE",
        evidenceClass: "NONE",
        evidence: {
          pairedSofascoreId: partner,
          pairedSofascoreMapping: "NONE",
          sofascoreRow: partnerRow ? partnerRow.classification : "NOT_APPEARED",
          bridge: eventsSupport ? "events_aligned" : (reasonsOf[0] ?? "none"),
        },
        reasons: [
          partnerRow?.classification === "CANDIDATE_RECORD_MISSING"
            ? "The partner Sofascore id has no candidate record."
            : "The partner Sofascore id has no reviewed mapping and no safe canonical target.",
        ],
        missingEvidence: [
          "A canonical app-player target for the partner Sofascore id (the Flashscore link cannot be resolved without one).",
        ],
      }),
    );
  }

  // Two Flashscore rows READY for one app player (across any evidence class) collide.
  const byTarget = new Map<string, WorklistRow[]>();
  for (const r of flashRows.values()) {
    if (r.classification === "READY_FOR_BATCH_REVIEW" && r.targetAppPlayerId) {
      byTarget.set(r.targetAppPlayerId, [...(byTarget.get(r.targetAppPlayerId) ?? []), r]);
    }
  }
  for (const group of byTarget.values()) {
    if (group.length < 2) continue;
    collisions += group.length;
    for (const r of group) {
      flashRows.set(r.externalId, {
        ...r,
        classification: "CONFLICT",
        evidenceClass: "NONE",
        targetAppPlayerId: null,
        dependsOn: [],
        proposedAuditReason: null,
        reasons: [...r.reasons, "Another Flashscore id is proposed for the same app player."],
      });
    }
  }
  // A READY Flashscore row that depends on a Sofascore row that lost READY loses it too.
  const readyIds = new Set(
    [...sofaRows.values()]
      .filter((r) => r.classification === "READY_FOR_BATCH_REVIEW")
      .map((r) => r.rowId),
  );
  for (const r of flashRows.values()) {
    if (
      r.classification === "READY_FOR_BATCH_REVIEW" &&
      r.dependsOn.some((d) => !readyIds.has(d))
    ) {
      flashRows.set(r.externalId, {
        ...r,
        classification: "INSUFFICIENT_EVIDENCE",
        evidenceClass: "NONE",
        targetAppPlayerId: null,
        proposedAuditReason: null,
        reasons: ["The Sofascore row it depends on is no longer ready."],
      });
    }
  }
  rows.push(...flashRows.values());

  // A target in someone's locked Fantasy squad ranks the row; it changes no class.
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i] as WorklistRow;
    const partnerApp = r.supportingMappings[0]
      ? index.entryOf("sofascore", r.supportingMappings[0].externalId)?.appPlayerId
      : null;
    const app = r.targetAppPlayerId ?? partnerApp ?? null;
    if (app !== null && input.lockedSquadAppPlayerIds.has(app)) {
      rows[i] = {
        ...r,
        priority: [...r.priority, "in_locked_squad"].sort() as WorklistRow["priority"],
      };
    }
  }

  const sorted = rows.sort((a, b) =>
    a.provider === b.provider
      ? a.externalId < b.externalId
        ? -1
        : 1
      : a.provider < b.provider
        ? -1
        : 1,
  );
  const by: Record<string, number> = {};
  const readyBy: Record<string, number> = {};
  for (const r of sorted) {
    by[`${r.provider}|${r.classification}`] = (by[`${r.provider}|${r.classification}`] ?? 0) + 1;
    if (r.classification === "READY_FOR_BATCH_REVIEW") {
      readyBy[`${r.provider}|${r.evidenceClass}`] =
        (readyBy[`${r.provider}|${r.evidenceClass}`] ?? 0) + 1;
    }
  }
  return {
    snapshotDigest: snapshot.digest,
    times: input.times,
    rows: sorted,
    counts: {
      byProviderAndClass: Object.fromEntries(
        Object.entries(by).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      readyByEvidenceClass: Object.fromEntries(
        Object.entries(readyBy).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      collisions,
      dependencies: sorted.filter((r) => r.dependsOn.length > 0).length,
      identitiesTotal: sorted.length,
    },
  };
}

/** The rows to ask a provider about, highest value first: shirt-only pairs with a reviewed Sofascore partner. */
export function selectCorroborationPairs(
  worklist: Worklist,
  options: { readonly maxPairs: number; readonly flashscoreIds?: ReadonlySet<string> },
): {
  readonly sofascoreFixtureId: string;
  readonly sofascorePlayerId: string;
  readonly flashscorePlayerId: string;
  readonly rank: number;
}[] {
  const out: {
    sofascoreFixtureId: string;
    sofascorePlayerId: string;
    flashscorePlayerId: string;
    rank: number;
  }[] = [];
  for (const r of worklist.rows) {
    if (r.provider !== "flashscore" || r.classification !== "INSUFFICIENT_EVIDENCE") continue;
    const partner = (r.evidence as { pairedSofascoreId?: string }).pairedSofascoreId;
    if (!partner || r.supportingMappings.length === 0) continue;
    if (options.flashscoreIds && !options.flashscoreIds.has(r.externalId)) continue;
    const fixture = r.fixtures[0];
    if (!fixture) continue;
    out.push({
      sofascoreFixtureId: fixture.sofascoreFixtureId,
      sofascorePlayerId: partner,
      flashscorePlayerId: r.externalId,
      rank: priorityRank(r.priority),
    });
  }
  return out
    .sort((a, b) => b.rank - a.rank || (a.flashscorePlayerId < b.flashscorePlayerId ? -1 : 1))
    .slice(0, options.maxPairs);
}

/** The manifest, hashed deterministically (canonical JSON, sorted keys, no whitespace). */
export async function sealManifest(worklist: Worklist) {
  const body = {
    schemaVersion: 1,
    kind: "gw1-identity-evidence-review-manifest",
    status: "REVIEW_ONLY_NOT_A_PROPOSAL",
    snapshotDigest: worklist.snapshotDigest,
    times: worklist.times,
    counts: worklist.counts,
    rows: worklist.rows,
  };
  const text = canonicalJson(body);
  return { body, text, sha256: await sha256Hex(text) };
}

/**
 * HYPOTHETICAL mapping rows for the READY rows of a worklist, for a local
 * what-if replay only. Every id and version says HYPOTHETICAL: nothing here is
 * a reviewed mapping, and a replay that uses them must say so.
 */
export function hypotheticalMappingRows(worklist: Worklist): MappingRowInput[] {
  return worklist.rows
    .filter((r) => r.classification === "READY_FOR_BATCH_REVIEW" && r.targetAppPlayerId)
    .map((r) => ({
      mappingId: `HYPOTHETICAL:${r.rowId}`,
      provider: r.provider,
      externalId: r.externalId,
      appPlayerId: r.targetAppPlayerId as string,
      active: true,
      reviewed: true,
      version: "HYPOTHETICAL_NOT_PRODUCTION_REVIEWED",
      updatedAt: "HYPOTHETICAL",
    }));
}

/** The reviewed snapshot plus the hypothetical rows. NOT production-reviewed. */
export async function hypotheticalSnapshot(
  snapshot: ReviewedIdentitySnapshot,
  worklist: Worklist,
): Promise<ReviewedIdentitySnapshot> {
  const reviewedRows: MappingRowInput[] = snapshot.entries.map((e) => ({
    mappingId: e.mappingId,
    provider: e.provider,
    externalId: e.externalId,
    appPlayerId: e.appPlayerId,
    active: true,
    reviewed: true,
    version: e.version,
    updatedAt: e.updatedAt,
  }));
  return buildReviewedIdentitySnapshot(
    [...reviewedRows, ...hypotheticalMappingRows(worklist)],
    `HYPOTHETICAL(${snapshot.capturedAt})`,
  );
}
