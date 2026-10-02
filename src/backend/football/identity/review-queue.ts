import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  type AppPlayerOption,
  type CandidateDto,
  type CandidateFilter,
  type CandidateStatus,
  type MappingProvider,
  type ProposalDto,
  type ReviewerAvailability,
} from "./mapping-contracts";
import { MappingError } from "./mapping-errors";
import type { PlayerMappingRepository } from "./mapping-repository";

/**
 * The reviewer queue behind /admin/football/player-mappings. Everything here is
 * a read-side helper over the repository contract: it pages, groups, filters and
 * explains what the database already ranked. It never maps, proposes or decides
 * anyone, and NO function in this file reads a display name to rank, order or
 * classify: names are for a human to read, and only `searchText` below looks at
 * one, to FILTER (never to order) a list on what the reviewer typed.
 */

/** The list functions cap a page at 200. */
export const CANDIDATE_PAGE_SIZE = 200;
/** A hard stop on paging (20,000 candidates), so a cursor that never advances cannot loop. */
export const MAX_CANDIDATE_PAGES = 100;

/**
 * Reads EVERY candidate the filter allows, page by page after the cursor. 1,004
 * candidates is six calls. A page that does not move the cursor forward is a
 * broken contract, not an empty list, so it is reported rather than looped on.
 */
export async function loadAllCandidates(
  repository: PlayerMappingRepository,
  filter: CandidateFilter,
  context: RepositoryContext,
  options: { readonly onPage?: (loaded: number) => void } = {},
): Promise<CandidateDto[]> {
  const all: CandidateDto[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_CANDIDATE_PAGES; page += 1) {
    if (context.signal?.aborted) throw new MappingError("mapping_unavailable", "Cancelled.");
    const rows: readonly CandidateDto[] = await repository.listMappingCandidates(
      filter,
      cursor,
      CANDIDATE_PAGE_SIZE,
      context,
    );
    all.push(...rows);
    options.onPage?.(all.length);
    if (rows.length < CANDIDATE_PAGE_SIZE) return all;
    const last: string = rows[rows.length - 1]!.id;
    if (cursor !== null && last <= cursor)
      throw new MappingError("mapping_unavailable", "The candidate cursor did not advance.");
    cursor = last;
  }
  throw new MappingError("mapping_unavailable", "Too many candidate pages.");
}

/** Every proposal of a status, paged the same way. */
export async function loadAllProposals(
  repository: PlayerMappingRepository,
  status: string | null,
  context: RepositoryContext,
): Promise<ProposalDto[]> {
  const all: ProposalDto[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_CANDIDATE_PAGES; page += 1) {
    const rows: readonly ProposalDto[] = await repository.listMappingProposals(
      status,
      cursor,
      CANDIDATE_PAGE_SIZE,
      context,
    );
    all.push(...rows);
    if (rows.length < CANDIDATE_PAGE_SIZE) return all;
    const last: string = rows[rows.length - 1]!.id;
    if (cursor !== null && last <= cursor)
      throw new MappingError("mapping_unavailable", "The proposal cursor did not advance.");
    cursor = last;
  }
  throw new MappingError("mapping_unavailable", "Too many proposal pages.");
}

// ---------------------------------------------------------------------------
// Signals, as the database function reports them
// ---------------------------------------------------------------------------

export type Agreement = "match" | "conflict" | "no_signal";

export interface OptionSignals {
  readonly dob: Agreement;
  /** Why a DOB gave no signal, e.g. `provider_not_provided`. Null when it did. */
  readonly dobReason: string | null;
  readonly shirt: Agreement;
  readonly position: Agreement;
  readonly providerPosition: "G" | "D" | "M" | "F" | null;
  readonly club: "match" | "mismatch" | "no_signal";
  readonly registeredTeamDisagreement: boolean;
  readonly observationCount: number;
  readonly flags: readonly string[];
}

const agreement = (value: unknown): Agreement =>
  value === "match" || value === "conflict" ? value : "no_signal";

/**
 * Reads the jsonb the database returns. Anything unrecognised is NO SIGNAL, so a
 * field this screen does not know can neither raise nor lower an option.
 */
export function readOptionSignals(raw: Record<string, unknown>): OptionSignals {
  const providerPosition = raw.providerPosition;
  return {
    dob: agreement(raw.dob),
    dobReason: typeof raw.dobReason === "string" ? raw.dobReason : null,
    shirt: agreement(raw.shirt),
    position: agreement(raw.position),
    providerPosition:
      providerPosition === "G" ||
      providerPosition === "D" ||
      providerPosition === "M" ||
      providerPosition === "F"
        ? providerPosition
        : null,
    club: raw.club === "match" || raw.club === "mismatch" ? raw.club : "no_signal",
    registeredTeamDisagreement: raw.registeredTeamDisagreement === true,
    observationCount: typeof raw.observationCount === "number" ? raw.observationCount : 0,
    flags: Array.isArray(raw.flags)
      ? raw.flags.filter((f): f is string => typeof f === "string")
      : [],
  };
}

/**
 * An option is "plausible" when it carries at least one agreeing signal and no
 * net conflict: score 1 or more. A missing value is zero, so thin coverage can
 * leave an option implausible only by saying nothing, never by counting against
 * it. This is a count for the reviewer's queue, not a threshold for anything.
 */
export const PLAUSIBLE_MIN_SCORE = 1;

export const plausibleOptionCount = (options: readonly AppPlayerOption[]): number =>
  options.filter((option) => option.score >= PLAUSIBLE_MIN_SCORE).length;

// ---------------------------------------------------------------------------
// Preview categories (A/B/C/D): a way to read a queue, never a decision
// ---------------------------------------------------------------------------

export type PreviewCategory = "A" | "B" | "C" | "D";

export type PreviewReason =
  | "no_options"
  | "no_agreeing_signal"
  | "top_dob_conflict"
  | "top_position_conflict"
  | "multi_squad"
  | "registered_team_disagreement"
  | "unique_dob_match"
  | "tied_top"
  | "several_dob_matches"
  | "dob_match_with_shirt_difference"
  | "incomplete_squad"
  | "no_dob_signal"
  | "corroborated_by_shirt"
  | "corroborated_by_position";

export interface Preview {
  readonly category: PreviewCategory;
  readonly reasons: readonly PreviewReason[];
}

/**
 * Which of four reading buckets a candidate falls in, from independent
 * structured evidence only (never a name, never a number of its own):
 *
 *  D  conflict / needs manual investigation: the best option has a DOB
 *     conflict or a position disagreement, or the candidate sits in two squads,
 *     or the provider registers the player with another team.
 *  A  very strong reviewer suggestion: ONE best option, whose DOB matches (valid
 *     on both sides, never 1 January), no other option matches the DOB, the best
 *     option has no shirt or position conflict, and the squad is complete.
 *  B  plausible but ambiguous: the best option has a positive score but fails
 *     the test for A (tied, several DOB matches, no DOB at all, incomplete squad).
 *  C  insufficient evidence: no option carries an agreeing signal.
 *
 * No bucket is a mapping decision, and none creates a proposal. It reads the
 * options exactly as the database ranked them (best first).
 */
export function classifyPreview(
  candidate: Pick<CandidateDto, "flags">,
  options: readonly AppPlayerOption[],
): Preview {
  const first = options[0];
  if (!first) return { category: "C", reasons: ["no_options"] };
  const top = readOptionSignals(first.signals);
  const tied = options.filter((option) => option.score === first.score).length;
  const dobMatches = options.filter((option) => readOptionSignals(option.signals).dob === "match");
  const multi = candidate.flags.includes("MULTI_SQUAD_OBSERVATION");
  const registered = candidate.flags.includes("REGISTERED_TEAM_DISAGREEMENT");
  const incomplete = candidate.flags.includes("INCOMPLETE_PROVIDER_SQUAD");

  const conflicts: PreviewReason[] = [];
  if (top.dob === "conflict") conflicts.push("top_dob_conflict");
  if (top.position === "conflict") conflicts.push("top_position_conflict");
  if (multi) conflicts.push("multi_squad");
  if (registered) conflicts.push("registered_team_disagreement");
  if (conflicts.length > 0) return { category: "D", reasons: conflicts };

  if (
    tied === 1 &&
    top.dob === "match" &&
    dobMatches.length === 1 &&
    top.shirt !== "conflict" &&
    top.position !== "conflict" &&
    !incomplete
  ) {
    return {
      category: "A",
      reasons: [
        "unique_dob_match",
        ...(top.shirt === "match" ? (["corroborated_by_shirt"] as const) : []),
        ...(top.position === "match" ? (["corroborated_by_position"] as const) : []),
      ],
    };
  }

  if (first.score > 0) {
    const reasons: PreviewReason[] = [];
    if (tied > 1) reasons.push("tied_top");
    if (dobMatches.length > 1) reasons.push("several_dob_matches");
    if (top.dob === "match" && top.shirt === "conflict")
      reasons.push("dob_match_with_shirt_difference");
    if (top.dob === "no_signal") reasons.push("no_dob_signal");
    if (incomplete) reasons.push("incomplete_squad");
    return { category: "B", reasons };
  }
  return { category: "C", reasons: ["no_agreeing_signal"] };
}

// ---------------------------------------------------------------------------
// What the candidate itself carries (no options needed)
// ---------------------------------------------------------------------------

export type EvidenceStrength = "rich" | "partial" | "thin";

/**
 * How much independent evidence the PROVIDER side carries, from the candidate
 * alone: a usable date of birth (valid and not a 1 January), a shirt number and
 * a position. Three is rich, two partial, fewer thin. It says how much there is
 * to compare, not whether anyone matches. Flashscore squads carry no date of
 * birth, so they top out at partial.
 */
export function evidenceStrength(candidate: Pick<CandidateDto, "observations">): EvidenceStrength {
  const o = candidate.observations;
  const signals =
    Number(o.some((x) => x.dobState === "valid" && !x.dobJanuary1)) +
    Number(o.some((x) => x.shirtNumber !== null)) +
    Number(o.some((x) => x.position !== null));
  return signals >= 3 ? "rich" : signals === 2 ? "partial" : "thin";
}

export interface ClubContext {
  readonly clubKey: string | null;
  readonly appTeamId: string | null;
}

/** The distinct clubs a candidate was seen in (one for most, two for a multi-squad one). */
export function clubContexts(candidate: Pick<CandidateDto, "observations">): ClubContext[] {
  const seen = new Map<string, ClubContext>();
  for (const o of candidate.observations) {
    const key = `${o.clubKey ?? ""}|${o.appTeamId ?? ""}`;
    if (!seen.has(key)) seen.set(key, { clubKey: o.clubKey, appTeamId: o.appTeamId });
  }
  return [...seen.values()];
}

/** The app teams to ask the ranking about: one call per distinct observed team. */
export const observedAppTeamIds = (candidate: Pick<CandidateDto, "observations">): string[] => [
  ...new Set(
    candidate.observations.map((o) => o.appTeamId).filter((id): id is string => id !== null),
  ),
];

export interface CandidateSummary {
  readonly shirts: readonly number[];
  readonly positions: readonly ("G" | "D" | "M" | "F")[];
  readonly dobStates: readonly string[];
  readonly hasUsableDob: boolean;
  readonly heightCm: number | null;
  readonly nationality: string | null;
}

export function summarizeCandidate(
  candidate: Pick<CandidateDto, "observations">,
): CandidateSummary {
  const o = candidate.observations;
  return {
    shirts: [...new Set(o.map((x) => x.shirtNumber).filter((n): n is number => n !== null))],
    positions: [...new Set(o.map((x) => x.position).filter((p) => p !== null))],
    dobStates: [...new Set(o.map((x) => x.dobState))],
    hasUsableDob: o.some((x) => x.dobState === "valid" && !x.dobJanuary1),
    heightCm: o.find((x) => x.heightCm !== null)?.heightCm ?? null,
    nationality: o.find((x) => x.nationality !== null)?.nationality ?? null,
  };
}

// ---------------------------------------------------------------------------
// Filtering and ordering the queue
// ---------------------------------------------------------------------------

export interface QueueFilters {
  readonly club: string;
  readonly provider: MappingProvider | "all";
  readonly status: CandidateStatus | "all";
  readonly evidence: EvidenceStrength | "all";
  readonly flag: string;
  /** What the reviewer typed. Matches a display name or a provider id; filters only. */
  readonly search: string;
}

export const ALL = "all";
export const NO_FILTERS: QueueFilters = {
  club: ALL,
  provider: ALL,
  status: ALL,
  evidence: ALL,
  flag: ALL,
  search: "",
};

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** The only place a display name is read for the queue: to filter on what was typed. */
function searchText(candidate: CandidateDto, query: string): boolean {
  const needle = fold(query);
  if (needle === "") return true;
  return (
    fold(candidate.displayName ?? "").includes(needle) ||
    candidate.externalId.toLowerCase().includes(needle)
  );
}

export function filterCandidates(
  candidates: readonly CandidateDto[],
  filters: QueueFilters,
): CandidateDto[] {
  return candidates.filter(
    (candidate) =>
      (filters.provider === ALL || candidate.provider === filters.provider) &&
      (filters.status === ALL || candidate.status === filters.status) &&
      (filters.club === ALL || clubContexts(candidate).some((c) => c.clubKey === filters.club)) &&
      (filters.evidence === ALL || evidenceStrength(candidate) === filters.evidence) &&
      (filters.flag === ALL || candidate.flags.includes(filters.flag)) &&
      searchText(candidate, filters.search),
  );
}

/** A name-free, stable order: club, provider, then provider id (numeric ids by value). */
export function orderCandidates(candidates: readonly CandidateDto[]): CandidateDto[] {
  const club = (c: CandidateDto) => clubContexts(c)[0]?.clubKey ?? "";
  return [...candidates].sort(
    (a, b) =>
      club(a).localeCompare(club(b)) ||
      a.provider.localeCompare(b.provider) ||
      a.externalId.localeCompare(b.externalId, "en", { numeric: true }) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The clubs present in a set of candidates, as facet values with their counts. */
export function clubFacets(
  candidates: readonly CandidateDto[],
): { readonly clubKey: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates)
    for (const context of clubContexts(candidate))
      if (context.clubKey) counts.set(context.clubKey, (counts.get(context.clubKey) ?? 0) + 1);
  return [...counts.entries()]
    .map(([clubKey, count]) => ({ clubKey, count }))
    .sort((a, b) => a.clubKey.localeCompare(b.clubKey));
}

export function countByStatus(
  candidates: readonly CandidateDto[],
): Record<CandidateStatus, number> {
  const counts: Record<CandidateStatus, number> = {
    unmapped: 0,
    proposed: 0,
    mapped: 0,
    ignored: 0,
  };
  for (const candidate of candidates) counts[candidate.status] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// The six views of the queue
// ---------------------------------------------------------------------------

export const QUEUE_VIEWS = [
  "unmapped",
  "proposed",
  "waiting_second",
  "mapped",
  "ignored",
  "held",
] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

/** Proposal states that stopped on something the world changed, until a person acts. */
export const HELD_PROPOSAL_STATUSES: readonly string[] = [
  "stale_evidence",
  "identity_conflict",
  "position_disagreement",
  "already_mapped",
];

export const isExpired = (proposal: Pick<ProposalDto, "effectiveStatus">): boolean =>
  proposal.effectiveStatus === "expired";

/**
 * Proposals that wait for a DIFFERENT person: pending, not expired, and not
 * decidable by the viewer (their own, or no one else is qualified).
 */
export function waitingForSecondReviewer(proposals: readonly ProposalDto[]): ProposalDto[] {
  return proposals.filter((p) => p.status === "pending" && !isExpired(p) && !p.canApprove);
}

/** Proposals held by a change in the world, or that ran out of time before anyone decided. */
export function heldProposals(proposals: readonly ProposalDto[]): ProposalDto[] {
  return proposals.filter(
    (p) =>
      HELD_PROPOSAL_STATUSES.includes(p.status) ||
      (isExpired(p) &&
        p.status !== "executed" &&
        p.status !== "rejected" &&
        p.status !== "cancelled"),
  );
}

// ---------------------------------------------------------------------------
// Dual control: who may do what to one proposal
// ---------------------------------------------------------------------------

export type DualControlBlock =
  | "own_proposal"
  | "second_reviewer_required"
  | "expired"
  | "held"
  | "not_pending"
  | "no_permission";

export interface DualControl {
  /** The viewer proposed it. */
  readonly role: "proposer" | "other";
  /** Approve and reject controls are drawn. Never true for the viewer's own proposal. */
  readonly canDecide: boolean;
  /** Why they are not drawn. Null when they are. */
  readonly blockedBy: DualControlBlock | null;
  /** Show "SECOND QUALIFIED REVIEWER REQUIRED": nobody else could approve this. */
  readonly showSecondReviewerRequired: boolean;
}

/**
 * The server decides (`canApprove`, and again at the decision); this only
 * decides what to DRAW. There is no owner override, no self-approval and no
 * "approve" for a proposal the server did not offer to this viewer.
 */
export function dualControlFor(
  proposal: ProposalDto,
  availability: ReviewerAvailability,
  viewer: { readonly canManage: boolean },
): DualControl {
  const role = proposal.proposedByMe ? "proposer" : "other";
  const blockedBy: DualControlBlock | null = !viewer.canManage
    ? "no_permission"
    : proposal.proposedByMe
      ? "own_proposal"
      : isExpired(proposal)
        ? "expired"
        : HELD_PROPOSAL_STATUSES.includes(proposal.status)
          ? "held"
          : proposal.status !== "pending"
            ? "not_pending"
            : !proposal.canApprove
              ? availability.secondReviewerRequired
                ? "second_reviewer_required"
                : "not_pending"
              : null;
  return {
    role,
    canDecide: blockedBy === null,
    blockedBy,
    showSecondReviewerRequired:
      availability.secondReviewerRequired &&
      proposal.status === "pending" &&
      !isExpired(proposal) &&
      !proposal.canApprove,
  };
}

// ---------------------------------------------------------------------------
// Options: the ranking, asked for one candidate
// ---------------------------------------------------------------------------

export type OptionScope = "club" | "all";

/**
 * The ranked app players for one candidate. Scope `club` asks once per observed
 * app team and merges (a two-squad candidate sees both clubs' players); scope
 * `all` asks with no team, so a player who moved clubs, or whose membership is
 * missing, can still be found. Duplicates collapse on the app player id, and
 * the order is the database's: best score first, ties on the id. Nobody is
 * dropped for a position or a missing value.
 */
export async function loadOptions(
  repository: PlayerMappingRepository,
  candidate: Pick<CandidateDto, "id" | "observations">,
  scope: OptionScope,
  context: RepositoryContext,
  limit = CANDIDATE_PAGE_SIZE,
): Promise<AppPlayerOption[]> {
  const teams = scope === "all" ? [null] : observedAppTeamIds(candidate);
  // A candidate with no known club has nobody to compare within a club.
  const asks = teams.length === 0 ? [null] : teams;
  const pages = await Promise.all(
    asks.map((team) =>
      repository.listMappingCandidatesForAppPlayer(candidate.id, team, limit, context),
    ),
  );
  const merged = new Map<string, AppPlayerOption>();
  for (const option of pages.flat()) merged.set(option.appPlayerId, option);
  return [...merged.values()].sort(
    (a, b) => b.score - a.score || (a.appPlayerId < b.appPlayerId ? -1 : 1),
  );
}

/**
 * Runs `task` over `items` with at most `concurrency` in flight, in order of
 * completion. Used to compute option previews for the visible rows without
 * sending a thousand requests at once.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Keyboard: moving through a list of rows
// ---------------------------------------------------------------------------

/** The row to focus after a key, or null when the key is not ours (leave it to the browser). */
export function nextRowIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
      return Math.min(current + 1, count - 1);
    case "ArrowUp":
      return Math.max(current - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
