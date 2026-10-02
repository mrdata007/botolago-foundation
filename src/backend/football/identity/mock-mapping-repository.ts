import type { RepositoryContext } from "@/backend/contracts/repository";
import type { BuiltCandidate } from "./candidate-builder";
import { SIGNAL_WEIGHTS } from "./candidate-signals";
import { classifyAppDob, dobSignal } from "./dob";
import {
  type AppPlayerOption,
  type CandidateDto,
  type CandidateFilter,
  type CandidateStatus,
  type ObservationDto,
  type ProposalDto,
  type ProposeItem,
  type ProposeResult,
  type ReviewerAvailability,
  type TransitionResult,
} from "./mapping-contracts";
import { MappingError } from "./mapping-errors";
import type { PlayerMappingRepository } from "./mapping-repository";

/**
 * An in-memory repository for the screen's tests and for sample data. It
 * mirrors the CONTRACT of the database functions (dual control, one candidate
 * per provider identity, the existing-row replacement model, held states) so
 * the screen can be tried without a database. The database functions are the
 * authority; nothing here is ever used to decide anything in production.
 */
export interface MockMappingRow {
  id: string;
  provider: "sofascore" | "flashscore";
  externalId: string;
  appPlayerId: string;
  active: boolean;
}
export interface MockAppPlayer {
  readonly id: string;
  readonly displayName: string;
  readonly position: "G" | "D" | "M" | "F" | null;
  /**
   * What the ranking reads, when a test or a sample wants real signals. Absent
   * means "no signal" for that attribute, exactly as a missing value does in
   * the database function.
   */
  readonly teamId?: string | null;
  readonly birthDate?: string | null;
  readonly shirtNumber?: number | null;
}
/** A candidate to seed, with the fields the screen reads. */
export type MockSeedCandidate = BuiltCandidate & {
  /** A fixed id keeps a sample deterministic. */
  readonly id?: string;
  readonly displayName?: string | null;
  readonly status?: CandidateStatus;
  readonly lineupOrIncidentSeen?: boolean;
};
interface MockCandidate {
  id: string;
  provider: "sofascore" | "flashscore";
  externalId: string;
  status: CandidateDto["status"];
  flags: string[];
  observationCount: number;
  observations: readonly BuiltCandidate["observations"][number][];
  position: "G" | "D" | "M" | "F" | null;
  displayName: string | null;
  lineupOrIncidentSeen: boolean;
  existingMappingId: string | null;
}
interface MockProposal {
  dto: ProposalDto;
  candidates: string[];
  /** Each candidate's evidence revision when the proposal was made (or last refreshed). */
  revisions: Record<string, number>;
}

const OPEN = new Set(["pending", "approved", "position_disagreement", "stale_evidence"]);
/** The list functions cap a page at 200, as the database does. */
const PAGE_CAP = 200;
// Web Crypto, not node:crypto, so the same class can back a browser sample.
const uuid = () => globalThis.crypto.randomUUID();
/**
 * A deterministic 64-hex digest: four FNV-1a passes over the JSON. It stands in
 * for the database's SHA-256 fingerprint, which only has to be stable for equal
 * input and different for changed input here. Never used to decide anything.
 */
const sha = (value: unknown): string => {
  const text = JSON.stringify(value) ?? "";
  let out = "";
  for (let pass = 0; pass < 4; pass += 1) {
    let high = 0x811c9dc5 ^ (pass * 0x9e3779b1);
    let low = 0xc9dc5118 ^ pass;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      high = Math.imul(high ^ code, 0x01000193) >>> 0;
      low = Math.imul(low ^ (code + pass), 0x01000193) >>> 0;
    }
    out += high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
  }
  return out;
};
const refuse = (index: number, code: string) => ({ index, ok: false as const, code });
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export class InMemoryPlayerMappingRepository implements PlayerMappingRepository {
  readonly mappings: MockMappingRow[] = [];
  private readonly candidates: MockCandidate[] = [];
  private readonly proposals: MockProposal[] = [];
  private readonly idempotent = new Map<string, unknown>();
  private readonly qualified: Set<string>;
  private readonly allowSelfApproval: boolean;
  /** Per actor: does the session carry the second factor (AAL2), and is the sign-in recent? */
  private readonly sessions: Record<string, { aal2: boolean; recentSignIn: boolean }>;
  /** The fingerprint each proposal was sealed with: the database recomputes it from the row. */
  private readonly sealed = new Map<string, string>();
  /** How many times a candidate's evidence moved since the start (the database's evidence_revision). */
  private readonly evidenceBumps = new Map<string, number>();

  constructor(
    seed: {
      readonly candidates?: readonly MockSeedCandidate[];
      readonly appPlayers?: readonly MockAppPlayer[];
      readonly mappings?: readonly MockMappingRow[];
      /** Actor ids that hold football.manage_mappings. */
      readonly qualifiedActors?: readonly string[];
      /** The database switch for single-approver mode. Off by default, as in two-person mode. */
      readonly allowSelfApproval?: boolean;
      /** Sessions that lack AAL2 or a recent sign-in. Everyone else is fully authenticated. */
      readonly sessions?: Readonly<
        Record<string, { readonly aal2?: boolean; readonly recentSignIn?: boolean }>
      >;
    } = {},
  ) {
    this.sessions = Object.fromEntries(
      Object.entries(seed.sessions ?? {}).map(([id, s]) => [
        id,
        { aal2: s.aal2 ?? true, recentSignIn: s.recentSignIn ?? true },
      ]),
    );
    this.allowSelfApproval = seed.allowSelfApproval ?? false;
    this.qualified = new Set(seed.qualifiedActors ?? []);
    this.appPlayers = [...(seed.appPlayers ?? [])];
    this.mappings.push(...(seed.mappings ?? []).map((m) => ({ ...m })));
    for (const built of seed.candidates ?? []) {
      this.candidates.push({
        id: built.id ?? uuid(),
        provider: built.provider,
        externalId: built.externalPlayerId,
        status: built.status ?? "unmapped",
        flags: [...built.flags],
        observationCount: built.observations.length,
        observations: built.observations,
        position: built.observations.find((o) => o.positionSignal)?.positionSignal ?? null,
        displayName: built.displayName ?? null,
        lineupOrIncidentSeen: built.lineupOrIncidentSeen ?? false,
        existingMappingId: null,
      });
    }
  }

  readonly appPlayers: MockAppPlayer[];

  private actor(context: RepositoryContext): string {
    if (!context.actorId) throw new MappingError("staff_access_denied", "Staff access is denied.");
    if (!this.qualified.has(context.actorId))
      throw new MappingError("permission_missing", "Permission is missing.");
    return context.actorId;
  }

  /** Propose, decide and execute need the second factor and a recent sign-in, as in the database. */
  private assertStrongSession(actor: string): void {
    const session = this.sessions[actor];
    if (session && !session.aal2)
      throw new MappingError("mfa_assurance_insufficient", "A second factor (AAL2) is required.");
    if (session && !session.recentSignIn)
      throw new MappingError("recent_auth_required", "A recent sign-in is required.");
  }

  private once<T>(actor: string, op: string, key: string, run: () => T): T {
    const id = `${actor}|${op}|${key}`;
    if (this.idempotent.has(id)) return this.idempotent.get(id) as T;
    const result = run();
    this.idempotent.set(id, result);
    return result;
  }

  private dto(candidate: MockCandidate): CandidateDto {
    const observations: ObservationDto[] = [...candidate.observations]
      .sort((a, b) => (a.providerTeamId < b.providerTeamId ? -1 : 1))
      .map((o) => ({
        providerTeamId: o.providerTeamId,
        clubKey: o.clubKey,
        appTeamId: o.appTeamId,
        squadCompleteness: o.squadCompleteness,
        registeredTeamId: o.registeredTeamId,
        registeredTeamDisagreement: o.registeredTeamDisagreement,
        shirtNumber: o.shirtNumber,
        position: o.positionSignal,
        dobState: o.dobState,
        dobJanuary1: o.dobJanuary1,
        heightCm: o.heightCm,
        nationality: o.nationalitySignal,
        observedAt: "2026-10-02T07:00:00.000Z",
      }));
    // The same three flags the database function derives from the observations.
    const flags = [
      ...(observations.length > 1 ? ["MULTI_SQUAD_OBSERVATION"] : []),
      ...(observations.some((o) => o.squadCompleteness === "INCOMPLETE_PROVIDER_SQUAD")
        ? ["INCOMPLETE_PROVIDER_SQUAD"]
        : []),
      ...(observations.some((o) => o.registeredTeamDisagreement)
        ? ["REGISTERED_TEAM_DISAGREEMENT"]
        : []),
    ];
    return {
      id: candidate.id,
      provider: candidate.provider,
      externalId: candidate.externalId,
      status: candidate.status,
      statusChangedAt: "2026-10-01T00:00:00.000Z",
      existingMappingId: candidate.existingMappingId,
      displayName: candidate.displayName,
      displayNamePurgedAt: null,
      lineupOrIncidentSeen: candidate.lineupOrIncidentSeen,
      evidenceRevision: 2 + (this.evidenceBumps.get(candidate.id) ?? 0),
      flags: observations.length > 0 ? flags : [...candidate.flags],
      observations,
      openProposalId:
        this.proposals.find((p) => OPEN.has(p.dto.status) && p.candidates.includes(candidate.id))
          ?.dto.id ?? null,
    };
  }

  /** What the viewer is shown of a proposal, as the database function computes it. */
  private view(p: MockProposal, me: string): ProposalDto {
    const mine = p.dto.requestedBy === me;
    return {
      ...p.dto,
      proposedByMe: mine,
      selfApproved: p.dto.decidedBy !== null && p.dto.decidedBy === p.dto.requestedBy,
      canApprove:
        p.dto.status === "pending" &&
        (!mine || this.allowSelfApproval) &&
        p.dto.effectiveStatus !== "expired",
    };
  }

  private candidate(id: string): MockCandidate {
    const found = this.candidates.find((c) => c.id === id);
    if (!found) throw new MappingError("candidate_not_found", "No such candidate.");
    return found;
  }

  private proposal(id: string): MockProposal {
    const found = this.proposals.find((p) => p.dto.id === id);
    if (!found) throw new MappingError("proposal_not_found", "No such proposal.");
    return found;
  }

  async listMappingCandidates(
    filter: CandidateFilter,
    cursor: string | null,
    limit: number,
    context: RepositoryContext,
  ) {
    this.actor(context);
    // Ordered by id and paged after the cursor, capped at 200: the database's contract.
    return this.candidates
      .filter(
        (c) =>
          (!filter.status || c.status === filter.status) &&
          (!filter.provider || c.provider === filter.provider) &&
          (cursor === null || c.id > cursor),
      )
      .sort(byId)
      .slice(0, Math.min(Math.max(limit, 1), PAGE_CAP))
      .map((c) => this.dto(c));
  }

  async getMappingCandidate(candidateId: string, context: RepositoryContext) {
    this.actor(context);
    return this.dto(this.candidate(candidateId));
  }

  async listMappingCandidatesForAppPlayer(
    candidateId: string,
    appTeamId: string | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly AppPlayerOption[]> {
    this.actor(context);
    const candidate = this.candidate(candidateId);
    return this.appPlayers
      .filter((player) => appTeamId === null || (player.teamId ?? null) === appTeamId)
      .map((player) => {
        const signals = this.signalsFor(candidate, player);
        return {
          appPlayerId: player.id,
          displayName: player.displayName,
          position: player.position,
          signals,
          score: scoreOf(signals),
          alreadyMappedForProvider: this.mappings.some(
            (m) => m.provider === candidate.provider && m.appPlayerId === player.id,
          ),
        };
      })
      .sort((a, b) => b.score - a.score || (a.appPlayerId < b.appPlayerId ? -1 : 1))
      .slice(0, Math.min(Math.max(limit, 1), PAGE_CAP));
  }

  /**
   * The reviewer signals of one candidate against one app player, in the shape
   * of `app_private.football_mapping_candidate_signals`. Reads structure only:
   * the display names of both sides are never an input.
   */
  private signalsFor(candidate: MockCandidate, player: MockAppPlayer): Record<string, unknown> {
    const observations = candidate.observations;
    // The latest observation carrying a valid date, else the latest one.
    const dobSource = observations.find((o) => o.dobState === "valid") ?? observations[0];
    const dob = dobSource
      ? dobSignal(classifyAppDob(player.birthDate ?? null, new Date("2026-10-02T00:00:00Z")), {
          state: dobSource.dobState as Parameters<typeof dobSignal>[1]["state"],
          birthDate: dobSource.birthDate,
          january1: dobSource.dobJanuary1,
          representationDisagreement: false,
        })
      : ({ kind: "no_signal", reason: "provider_missing" } as const);
    const shirts = observations.map((o) => o.shirtNumber).filter((n): n is number => n !== null);
    const shirt =
      player.shirtNumber === null || player.shirtNumber === undefined
        ? "no_signal"
        : shirts.includes(player.shirtNumber)
          ? "match"
          : shirts.length > 0
            ? "conflict"
            : "no_signal";
    const providerPosition = candidate.position;
    const position =
      providerPosition && player.position
        ? providerPosition === player.position
          ? "match"
          : "conflict"
        : "no_signal";
    const teamIds = observations.map((o) => o.appTeamId).filter((id): id is string => id !== null);
    const club =
      teamIds.length === 0 || !player.teamId
        ? "no_signal"
        : teamIds.includes(player.teamId)
          ? "match"
          : "mismatch";
    const registered = observations.some((o) => o.registeredTeamDisagreement);
    const incomplete = observations.some(
      (o) => o.squadCompleteness === "INCOMPLETE_PROVIDER_SQUAD",
    );
    const flags = [
      ...(observations.length > 1 ? ["MULTI_SQUAD_OBSERVATION"] : []),
      ...(dob.kind === "conflict" ? ["DOB_CONFLICT"] : []),
      ...(position === "conflict" ? ["POSITION_DISAGREEMENT"] : []),
      ...(shirt === "conflict" ? ["SHIRT_DIFFERENCE"] : []),
      ...(registered ? ["REGISTERED_TEAM_DISAGREEMENT"] : []),
      ...(club === "mismatch" ? ["CLUB_CONTEXT_MISMATCH"] : []),
      ...(incomplete ? ["INCOMPLETE_PROVIDER_SQUAD"] : []),
    ];
    return {
      dob: dob.kind,
      dobReason: dob.kind === "no_signal" ? dob.reason : null,
      shirt,
      position,
      providerPosition,
      club,
      registeredTeamDisagreement: registered,
      observationCount: observations.length,
      flags,
    };
  }

  async listMappingProposals(
    status: string | null,
    cursor: string | null,
    limit: number,
    context: RepositoryContext,
  ) {
    const me = this.actor(context);
    return this.proposals
      .filter(
        (p) =>
          (status === null ||
            p.dto.status === status ||
            (status === "open" && OPEN.has(p.dto.status))) &&
          (cursor === null || p.dto.id > cursor),
      )
      .sort((a, b) => byId(a.dto, b.dto))
      .slice(0, Math.min(Math.max(limit, 1), PAGE_CAP))
      .map((p) => this.view(p, me));
  }

  async getMappingProposal(proposalId: string, context: RepositoryContext) {
    const me = this.actor(context);
    return this.view(this.proposal(proposalId), me);
  }

  async proposeMappings(
    items: readonly ProposeItem[],
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ProposeResult> {
    const me = this.actor(context);
    this.assertStrongSession(me);
    if (reason.trim().length < 10 || reason.trim().length > 500)
      throw new MappingError("reason_required", "A reason is required.");
    if (items.length < 1 || items.length > 100)
      throw new MappingError("invalid_proposal", "Between 1 and 100 items.");
    return this.once(me, "propose", idempotencyKey, () => {
      const batchId = uuid();
      const proposals: ProposeResult["proposals"][number][] = [];
      items.forEach((item, index) =>
        proposals.push(this.proposeOne(item, index + 1, reason, me, batchId)),
      );
      return { batchId, proposals };
    });
  }

  private proposeOne(
    item: ProposeItem,
    index: number,
    reason: string,
    me: string,
    batchId: string,
  ) {
    const holds = (provider: string, test: (m: MockMappingRow) => boolean) =>
      this.mappings.some((m) => m.provider === provider && test(m));
    const openOn = (test: (p: MockProposal) => boolean) =>
      this.proposals.some((p) => OPEN.has(p.dto.status) && test(p));
    let candidateIds: string[] = [];
    let positionDisagreement = false;
    const dto: Partial<ProposalDto> = {};
    if (item.kind === "map") {
      const ids = [item.sofascoreCandidateId, item.flashscoreCandidateId].filter(
        (v): v is string => !!v,
      );
      if (ids.length === 0) return refuse(index, "invalid_proposal");
      const player = this.appPlayers.find((p) => p.id === item.appPlayerId);
      if (!player) return refuse(index, "app_player_not_found");
      const positions: string[] = [];
      for (const id of ids) {
        const c = this.candidates.find((candidate) => candidate.id === id);
        if (!c) return refuse(index, "candidate_not_found");
        if (c.status === "ignored") return refuse(index, "identity_conflict");
        if (
          c.status === "mapped" ||
          c.existingMappingId ||
          holds(
            c.provider,
            (m) => m.externalId === c.externalId || m.appPlayerId === item.appPlayerId,
          )
        )
          return refuse(index, "already_mapped");
        if (openOn((p) => p.candidates.includes(id))) return refuse(index, "proposal_already_open");
        if (c.position) positions.push(c.position);
      }
      if (
        openOn(
          (p) =>
            p.dto.appPlayerId === item.appPlayerId || p.dto.newAppPlayerId === item.appPlayerId,
        )
      )
        return refuse(index, "identity_conflict");
      positionDisagreement =
        new Set(positions).size > 1 ||
        (!!player.position && positions.some((pos) => pos !== player.position));
      candidateIds = ids;
      const externalIdOf = (candidateId: string | undefined) =>
        candidateId
          ? (this.candidates.find((c) => c.id === candidateId)?.externalId ?? null)
          : null;
      Object.assign(dto, {
        appPlayerId: item.appPlayerId,
        sofascoreCandidateId: item.sofascoreCandidateId ?? null,
        flashscoreCandidateId: item.flashscoreCandidateId ?? null,
        // As the database does: the proposal carries the provider ids it would map.
        sofascoreExternalId: externalIdOf(item.sofascoreCandidateId),
        flashscoreExternalId: externalIdOf(item.flashscoreCandidateId),
        basis: item.basis ?? "manual",
      });
    } else if (isIgnoreItem(item)) {
      const id = item.sofascoreCandidateId ?? item.flashscoreCandidateId;
      if (!id || (item.sofascoreCandidateId && item.flashscoreCandidateId))
        return refuse(index, "invalid_proposal");
      const c = this.candidates.find((candidate) => candidate.id === id);
      if (!c) return refuse(index, "candidate_not_found");
      if (openOn((p) => p.candidates.includes(id))) return refuse(index, "proposal_already_open");
      if (item.kind === "ignore") {
        if (c.lineupOrIncidentSeen) return refuse(index, "ignore_refused_id_in_lineup");
        if (c.status !== "unmapped")
          return refuse(index, c.status === "ignored" ? "already_ignored" : "already_mapped");
      } else if (c.status !== "ignored") return refuse(index, "not_ignored");
      candidateIds = [id];
      Object.assign(dto, {
        sofascoreCandidateId: item.sofascoreCandidateId ?? null,
        flashscoreCandidateId: item.flashscoreCandidateId ?? null,
        basis: "manual",
      });
    } else {
      const target = item;
      const row = this.mappings.find(
        (m) => m.id === target.mappingId && m.provider === target.providerName,
      );
      if (!row) return refuse(index, "mapping_not_found");
      if (openOn((p) => p.dto.mappingId === row.id)) return refuse(index, "proposal_already_open");
      if (item.kind !== "reactivate" && !row.active) return refuse(index, "mapping_not_active");
      if (item.kind === "reactivate" && row.active) return refuse(index, "mapping_already_active");
      const newExternal = "newExternalId" in item ? item.newExternalId : undefined;
      const newPlayer = "newAppPlayerId" in item ? item.newAppPlayerId : undefined;
      if (item.kind === "replace" && newExternal === undefined && newPlayer === undefined)
        return refuse(index, "invalid_proposal");
      if (
        newExternal !== undefined &&
        holds(row.provider, (m) => m.externalId === newExternal && m.id !== row.id)
      )
        return refuse(index, "already_mapped");
      if (
        newPlayer !== undefined &&
        holds(row.provider, (m) => m.appPlayerId === newPlayer && m.id !== row.id)
      )
        return refuse(index, "already_mapped");
      Object.assign(dto, {
        providerName: row.provider,
        mappingId: row.id,
        newExternalId: newExternal ?? null,
        newAppPlayerId: newPlayer ?? null,
        expectedBefore: {
          mappingId: row.id,
          externalId: row.externalId,
          appPlayerId: row.appPlayerId,
          active: row.active,
        },
        basis: "manual",
      });
    }
    const id = uuid();
    const payload = { ...dto, kind: item.kind, reason, positionDisagreement };
    const proposal: ProposalDto = {
      id,
      batchId,
      kind: item.kind,
      status: positionDisagreement ? "position_disagreement" : "pending",
      effectiveStatus: positionDisagreement ? "position_disagreement" : "pending",
      sofascoreCandidateId: null,
      flashscoreCandidateId: null,
      sofascoreExternalId: null,
      flashscoreExternalId: null,
      providerName: null,
      mappingId: null,
      appPlayerId: null,
      newExternalId: null,
      newAppPlayerId: null,
      expectedBefore: null,
      basis: "manual",
      evidence: {},
      signals: {},
      positionDisagreement,
      positionNote: null,
      positionDisagreementAcknowledged: false,
      reason,
      requestedBy: me,
      requestedAt: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-10-04T00:00:00.000Z",
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      fingerprint: sha(payload),
      executedBy: null,
      executedAt: null,
      executedBefore: null,
      executedAfter: null,
      holdCode: null,
      proposedByMe: true,
      selfApproved: false,
      canApprove: false,
      ...dto,
    } as ProposalDto;
    proposal.fingerprint = sha({ ...payload, id: undefined });
    this.sealed.set(proposal.id, proposal.fingerprint);
    this.proposals.push({
      dto: proposal,
      candidates: candidateIds,
      revisions: Object.fromEntries(
        candidateIds.map((candidateId) => [candidateId, this.evidenceBumps.get(candidateId) ?? 0]),
      ),
    });
    for (const candidateId of candidateIds) {
      const c = this.candidate(candidateId);
      if ((item.kind === "map" || item.kind === "ignore") && c.status === "unmapped")
        c.status = "proposed";
    }
    return {
      index,
      ok: true as const,
      id,
      kind: item.kind,
      status: proposal.status,
      fingerprint: proposal.fingerprint,
      positionDisagreement,
    };
  }

  proposeIgnore(
    candidate: { provider: "sofascore" | "flashscore"; candidateId: string },
    reason: string,
    key: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings([ignoreItem("ignore", candidate)], reason, key, context);
  }
  proposeReverseIgnore(
    candidate: { provider: "sofascore" | "flashscore"; candidateId: string },
    reason: string,
    key: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings([ignoreItem("reverse_ignore", candidate)], reason, key, context);
  }
  replaceMapping(
    m: {
      provider: "sofascore" | "flashscore";
      mappingId: string;
      newExternalId?: string;
      newAppPlayerId?: string;
    },
    reason: string,
    key: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings(
      [
        {
          kind: "replace",
          providerName: m.provider,
          mappingId: m.mappingId,
          newExternalId: m.newExternalId,
          newAppPlayerId: m.newAppPlayerId,
        },
      ],
      reason,
      key,
      context,
    );
  }
  deactivateMapping(
    m: { provider: "sofascore" | "flashscore"; mappingId: string },
    reason: string,
    key: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings(
      [{ kind: "deactivate", providerName: m.provider, mappingId: m.mappingId }],
      reason,
      key,
      context,
    );
  }
  reactivateMapping(
    m: {
      provider: "sofascore" | "flashscore";
      mappingId: string;
      newExternalId?: string;
      newAppPlayerId?: string;
    },
    reason: string,
    key: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings(
      [
        {
          kind: "reactivate",
          providerName: m.provider,
          mappingId: m.mappingId,
          newExternalId: m.newExternalId,
          newAppPlayerId: m.newAppPlayerId,
        },
      ],
      reason,
      key,
      context,
    );
  }

  async addPositionNote(
    proposalId: string,
    note: string,
    _key: string,
    context: RepositoryContext,
  ): Promise<TransitionResult> {
    const me = this.actor(context);
    const p = this.proposal(proposalId);
    if (p.dto.requestedBy !== me) throw new MappingError("not_authorized", "Only the proposer.");
    if (note.trim().length < 10) throw new MappingError("note_required", "A note is required.");
    if (p.dto.status !== "position_disagreement")
      throw new MappingError("proposal_not_awaiting_note", "No note needed.");
    p.dto.positionNote = note.trim();
    p.dto.status = p.dto.effectiveStatus = "pending";
    p.dto.fingerprint = sha({ fingerprint: p.dto.fingerprint, note: p.dto.positionNote });
    this.sealed.set(p.dto.id, p.dto.fingerprint);
    return { ok: true, id: p.dto.id, status: "pending" };
  }

  async refreshProposalEvidence(
    proposalId: string,
    _key: string,
    context: RepositoryContext,
  ): Promise<TransitionResult> {
    const me = this.actor(context);
    const p = this.proposal(proposalId);
    if (p.dto.requestedBy !== me) throw new MappingError("not_authorized", "Only the proposer.");
    if (p.dto.status !== "stale_evidence")
      throw new MappingError("proposal_not_stale", "Not stale.");
    Object.assign(p.dto, {
      status: "pending",
      effectiveStatus: "pending",
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
    });
    p.dto.fingerprint = sha({ refreshed: p.dto.fingerprint });
    this.sealed.set(p.dto.id, p.dto.fingerprint);
    p.revisions = Object.fromEntries(
      p.candidates.map((candidateId) => [candidateId, this.evidenceBumps.get(candidateId) ?? 0]),
    );
    return { ok: true, id: p.dto.id, status: "pending" };
  }

  /** A change in the world since the proposal: another human's ignore, or a row that took the identity. */
  private conflictOf(p: MockProposal): string | null {
    // The evidence the proposal was made on has moved: execution re-validates and holds it.
    if (p.candidates.some((id) => (this.evidenceBumps.get(id) ?? 0) !== (p.revisions[id] ?? 0)))
      return "stale_evidence";
    if (p.candidates.some((id) => this.candidate(id).status === "ignored") && p.dto.kind === "map")
      return "identity_conflict";
    if (p.dto.kind === "map") {
      for (const id of p.candidates) {
        const c = this.candidate(id);
        if (
          this.mappings.some(
            (m) =>
              m.provider === c.provider &&
              (m.externalId === c.externalId || m.appPlayerId === p.dto.appPlayerId),
          )
        )
          return "already_mapped";
      }
    }
    return null;
  }

  async decideMappingProposal(
    input: {
      proposalId: string;
      decision: "approve" | "reject";
      reason: string;
      fingerprint: string;
      positionDisagreementAcknowledged?: boolean;
    },
    _key: string,
    context: RepositoryContext,
  ): Promise<TransitionResult> {
    const me = this.actor(context);
    this.assertStrongSession(me);
    const p = this.proposal(input.proposalId);
    if (p.dto.requestedBy === me && !this.allowSelfApproval)
      throw new MappingError("self_approval_denied", "A different person must decide.");
    if (input.reason.trim().length < 10)
      throw new MappingError("reason_required", "A reason is required.");
    const status = p.dto.status;
    if (status === "position_disagreement")
      throw new MappingError("position_disagreement_unacknowledged", "A note is needed first.");
    if (
      status === "identity_conflict" ||
      status === "already_mapped" ||
      status === "stale_evidence"
    )
      throw new MappingError(status, "The proposal is held.");
    if (status !== "pending") throw new MappingError("proposal_not_pending", "Not pending.");
    if (input.fingerprint !== p.dto.fingerprint)
      throw new MappingError("fingerprint_mismatch", "The proposal changed.");
    if (input.decision === "reject") {
      Object.assign(p.dto, {
        status: "rejected",
        effectiveStatus: "rejected",
        decidedBy: me,
        decidedAt: "now",
        decisionReason: input.reason,
      });
      this.release(p);
      return { ok: true, id: p.dto.id, status: "rejected" };
    }
    const code = this.conflictOf(p);
    if (code) {
      p.dto.status = p.dto.effectiveStatus = code as ProposalDto["status"];
      this.release(p);
      return { ok: false, code, status: code };
    }
    if (p.dto.positionDisagreement && !input.positionDisagreementAcknowledged)
      throw new MappingError(
        "position_disagreement_unacknowledged",
        "Acknowledge the disagreement.",
      );
    Object.assign(p.dto, {
      status: "approved",
      effectiveStatus: "approved",
      decidedBy: me,
      decidedAt: "now",
      decisionReason: input.reason,
    });
    return { ok: true, id: p.dto.id, status: "approved" };
  }

  private release(p: MockProposal) {
    for (const id of p.candidates) {
      const c = this.candidate(id);
      if (
        c.status === "proposed" &&
        !this.proposals.some((o) => o !== p && OPEN.has(o.dto.status) && o.candidates.includes(id))
      )
        c.status = "unmapped";
    }
  }

  async executeMappingProposal(
    proposalId: string,
    key: string,
    context: RepositoryContext,
  ): Promise<TransitionResult> {
    const me = this.actor(context);
    this.assertStrongSession(me);
    return this.once(me, "execute", key, () => {
      const p = this.proposal(proposalId);
      if (p.dto.status === "executed")
        throw new MappingError("operation_already_executed", "Already executed.");
      if (p.dto.status !== "approved")
        throw new MappingError("proposal_not_approved", "Not approved.");
      // An approval stands for 24 hours; the database says approval_expired after that.
      if (p.dto.effectiveStatus === "expired")
        throw new MappingError("approval_expired", "The approval has expired.");
      // The database recomputes the stored row's fingerprint and refuses any difference.
      if (p.dto.fingerprint !== this.sealed.get(p.dto.id))
        throw new MappingError("fingerprint_mismatch", "The proposal changed.");
      const code = this.conflictOf(p);
      if (code) {
        p.dto.status = p.dto.effectiveStatus = code as ProposalDto["status"];
        this.release(p);
        return { ok: false as const, code, status: code };
      }
      const d = p.dto;
      if (d.kind === "map") {
        for (const id of p.candidates) {
          const c = this.candidate(id);
          const row: MockMappingRow = {
            id: uuid(),
            provider: c.provider,
            externalId: c.externalId,
            appPlayerId: d.appPlayerId!,
            active: true,
          };
          this.mappings.push(row);
          c.status = "mapped";
          c.existingMappingId = row.id;
        }
      } else if (d.kind === "ignore" || d.kind === "reverse_ignore") {
        this.candidate(p.candidates[0]!).status = d.kind === "ignore" ? "ignored" : "unmapped";
      } else {
        // Replace, deactivate and reactivate UPDATE the existing row; none inserts a second one.
        const row = this.mappings.find((m) => m.id === d.mappingId)!;
        if (d.newExternalId) row.externalId = d.newExternalId;
        if (d.newAppPlayerId) row.appPlayerId = d.newAppPlayerId;
        if (d.kind === "deactivate") row.active = false;
        if (d.kind === "reactivate") row.active = true;
        for (const c of this.candidates.filter((x) => x.provider === row.provider)) {
          if (c.existingMappingId === row.id || c.externalId === row.externalId) {
            c.status = row.active && c.externalId === row.externalId ? "mapped" : "unmapped";
            c.existingMappingId = c.externalId === row.externalId ? row.id : null;
          }
        }
      }
      Object.assign(d, {
        status: "executed",
        effectiveStatus: "executed",
        executedBy: me,
        executedAt: "now",
      });
      return { ok: true as const, id: d.id, status: "executed" };
    });
  }

  async executeMappingBatch(
    batchId: string,
    keyFor: (proposalId: string) => string,
    context: RepositoryContext,
  ) {
    this.actor(context);
    const results: { proposalId: string; result: TransitionResult }[] = [];
    for (const p of this.proposals.filter(
      (o) => o.dto.batchId === batchId && o.dto.status === "approved",
    ))
      results.push({
        proposalId: p.dto.id,
        result: await this.executeMappingProposal(p.dto.id, keyFor(p.dto.id), context),
      });
    return results;
  }

  async cancelMappingProposal(
    proposalId: string,
    reason: string,
    _key: string,
    context: RepositoryContext,
  ): Promise<TransitionResult> {
    const me = this.actor(context);
    const p = this.proposal(proposalId);
    if (p.dto.requestedBy !== me) throw new MappingError("not_authorized", "Only the proposer.");
    if (!OPEN.has(p.dto.status)) throw new MappingError("proposal_not_open", "Not open.");
    if (reason.trim().length < 10)
      throw new MappingError("reason_required", "A reason is required.");
    p.dto.status = p.dto.effectiveStatus = "cancelled";
    this.release(p);
    return { ok: true, id: p.dto.id, status: "cancelled" };
  }

  async getQualifiedReviewerAvailability(
    context: RepositoryContext,
  ): Promise<ReviewerAvailability> {
    const me = this.actor(context);
    const others = [...this.qualified].filter((id) => id !== me).length;
    return {
      qualifiedReviewersAvailable: others,
      selfApprovalAllowed: this.allowSelfApproval,
      secondReviewerRequired: others === 0 && !this.allowSelfApproval,
    };
  }

  /** Test hook: another human's decision lands outside this repository. */
  forceCandidateStatus(
    provider: "sofascore" | "flashscore",
    externalId: string,
    status: CandidateDto["status"],
  ) {
    const c = this.candidates.find((x) => x.provider === provider && x.externalId === externalId);
    if (c) c.status = status;
  }
  candidateIdOf(provider: "sofascore" | "flashscore", externalId: string): string {
    return this.candidates.find((x) => x.provider === provider && x.externalId === externalId)!.id;
  }
  candidateCount() {
    return this.candidates.length;
  }
  /** Test hook: change what a session carries (AAL2, a recent sign-in) while the screen is open. */
  setSession(actorId: string, session: { aal2?: boolean; recentSignIn?: boolean }) {
    const current = this.sessions[actorId] ?? { aal2: true, recentSignIn: true };
    this.sessions[actorId] = {
      aal2: session.aal2 ?? current.aal2,
      recentSignIn: session.recentSignIn ?? current.recentSignIn,
    };
  }
  /** Test hook: new observations arrive for a candidate, so evidence made earlier is stale. */
  /** Test hook: new observations arrive for a candidate, so evidence made earlier is stale. */
  bumpEvidence(provider: "sofascore" | "flashscore", externalId: string) {
    const id = this.candidateIdOf(provider, externalId);
    this.evidenceBumps.set(id, (this.evidenceBumps.get(id) ?? 0) + 1);
  }
  /** Test hook: the stored row no longer matches the fingerprint it was sealed with. */
  tamperFingerprint(proposalId: string) {
    this.proposal(proposalId).dto.fingerprint = "f".repeat(64);
  }
  /** Test hook: every mapping row, for "exactly one row changed" checks. */
  snapshotMappings(): readonly MockMappingRow[] {
    return this.mappings.map((m) => ({ ...m }));
  }
  /** Test hook: every candidate's status, for "nothing unrelated changed" checks. */
  snapshotCandidateStatuses(): ReadonlyMap<string, string> {
    return new Map(this.candidates.map((c) => [c.id, `${c.status}|${c.existingMappingId ?? ""}`]));
  }
  /** Test hook: the world moves a proposal into a state the screen must show (held, expired). */
  patchProposal(proposalId: string, patch: Partial<ProposalDto>) {
    Object.assign(this.proposal(proposalId).dto, patch);
  }
}

/** The database's rank: only agreement adds, a valid conflict costs a little, missing is zero. */
function scoreOf(signals: Record<string, unknown>): number {
  const dob =
    signals.dob === "match"
      ? SIGNAL_WEIGHTS.dobMatch
      : signals.dob === "conflict"
        ? SIGNAL_WEIGHTS.dobConflict
        : 0;
  const shirt = signals.shirt === "match" ? SIGNAL_WEIGHTS.shirtMatch : 0;
  const position =
    signals.position === "match"
      ? SIGNAL_WEIGHTS.positionMatch
      : signals.position === "conflict"
        ? SIGNAL_WEIGHTS.positionConflict
        : 0;
  return dob + shirt + position;
}

type IgnoreItem = Extract<ProposeItem, { kind: "ignore" | "reverse_ignore" }>;
const isIgnoreItem = (item: ProposeItem): item is IgnoreItem =>
  item.kind === "ignore" || item.kind === "reverse_ignore";

function ignoreItem(
  kind: "ignore" | "reverse_ignore",
  candidate: { provider: "sofascore" | "flashscore"; candidateId: string },
): ProposeItem {
  return candidate.provider === "sofascore"
    ? { kind, sofascoreCandidateId: candidate.candidateId }
    : { kind, flashscoreCandidateId: candidate.candidateId };
}
