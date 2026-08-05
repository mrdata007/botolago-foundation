// Task B8 — Pure service for the dedicated "Create Team" onboarding.
//
// Responsibilities:
//   - Represent a first-time creation draft (team name, formation, 15 slots,
//     captain / vice) independently of the cloud repository.
//   - Compute the live squad status (position counts, club counts, budget,
//     validity) so the UI can render progressive states without duplicating
//     rules.
//   - Provide deterministic operations (place, remove, swap, set captain,
//     set formation, apply autocomplete template) that never mutate inputs.
//
// This module has NO React and NO Supabase imports so it is trivially
// testable and safe to import from both the route and tests.

import type { FantasyRulesDto } from "@/backend/fantasy/contracts";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, FormationKey, Position, SquadPlayer } from "@/types/fantasy";
import { FORMATIONS, SQUAD_RULES } from "@/types/fantasy";

// ------ Draft shape ------

export interface CreateTeamDraft {
  schemaVersion: 1;
  /** User-entered team name; validated against `validateTeamName`. */
  teamName: string;
  /** Profile preference supported by the existing identity contract. */
  favoriteClubId: string | null;
  /** Explicit onboarding acknowledgement; never sent as Fantasy team data. */
  consentAccepted: boolean;
  formation: FormationKey;
  /** 15 entries; a slot with `playerId === null` is empty. */
  slots: CreateSlot[];
}

export interface CreateSlot {
  /** 1..15, matches SquadPlayer.slot (1..11 = XI, 12..15 = bench). */
  slot: number;
  /** Squad-quota position for this slot; drives picker filter. */
  position: Position;
  playerId: string | null;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

export interface CreateTeamRules {
  totalSize: number;
  startingSize: number;
  budget: number;
  maxPerClub: number;
  initialFreeTransfers: number;
  maxFreeTransferRollover: number;
  transferHitCost: number;
  captainMultiplier: number;
  perPosition: Record<Position, number>;
  startingMinimum: Record<Position, number>;
  startingMaximum: Record<Position, number>;
}

// ------ Constants ------

/** Fixed default formation for onboarding; user can change via engine reslot. */
export const CREATE_DEFAULT_FORMATION: FormationKey = "4-4-2";

/** Max characters for a fantasy team name. Kept conservative for mobile UX. */
export const TEAM_NAME_MAX_LENGTH = 40;
/** Min characters (trimmed) for a valid team name. */
export const TEAM_NAME_MIN_LENGTH = 3;

/**
 * Deterministic preview/test rules. Production routes always adapt the active
 * ruleset returned by `fantasy_rules`; this value is never a production data
 * fallback.
 */
export const DEFAULT_CREATE_TEAM_RULES: CreateTeamRules = {
  totalSize: SQUAD_RULES.totalSize,
  startingSize: SQUAD_RULES.startingXI,
  budget: SQUAD_RULES.budget,
  maxPerClub: SQUAD_RULES.maxPerClub,
  initialFreeTransfers: SQUAD_RULES.freeTransfersPerWeek,
  maxFreeTransferRollover: 5,
  transferHitCost: SQUAD_RULES.transferHitPoints,
  captainMultiplier: 2,
  perPosition: { ...SQUAD_RULES.perPosition },
  startingMinimum: { GK: 1, DEF: 3, MID: 2, FWD: 1 },
  startingMaximum: { GK: 1, DEF: 5, MID: 5, FWD: 3 },
};

/** Normalize the authoritative Fantasy rules DTO. Unsupported shapes fail closed. */
export function adaptFantasyRules(dto: FantasyRulesDto): CreateTeamRules | null {
  const byPosition = new Map(dto.positions.map((rule) => [rule.code, rule]));
  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  if (positions.some((position) => !byPosition.has(position))) return null;
  if (dto.squadSize !== 15) return null;
  const normalized: CreateTeamRules = {
    totalSize: dto.squadSize,
    startingSize: 11,
    budget: dto.budget,
    maxPerClub: dto.maxPlayersPerClub,
    initialFreeTransfers: dto.initialFreeTransfers,
    maxFreeTransferRollover: dto.maxFreeTransferRollover,
    transferHitCost: dto.transferHitCost,
    captainMultiplier: dto.captainMultiplier,
    perPosition: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
    startingMinimum: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
    startingMaximum: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
  };
  for (const position of positions) {
    const rule = byPosition.get(position)!;
    normalized.perPosition[position] = rule.squadQuota;
    normalized.startingMinimum[position] = rule.startingMinimum;
    normalized.startingMaximum[position] = rule.startingMaximum;
  }
  const quota = Object.values(normalized.perPosition).reduce((sum, count) => sum + count, 0);
  return quota === normalized.totalSize ? normalized : null;
}

// ------ Slot layout ------

/**
 * Build the 15 empty slots for a given formation. The slot order matches the
 * pitch renderer contract used by `reslotForFormation`:
 *   1        → starting GK
 *   2..1+DEF → starting DEF
 *   ...      → starting MID
 *   ...      → starting FWD (up to slot 11)
 *   12       → bench GK
 *   13..15   → bench DEF / MID / FWD
 */
export function buildEmptySlots(
  formation: FormationKey,
  rules: CreateTeamRules = DEFAULT_CREATE_TEAM_RULES,
): CreateSlot[] {
  const cfg = FORMATIONS[formation];
  const slots: CreateSlot[] = [];
  let n = 1;
  slots.push({ slot: n++, position: "GK", playerId: null });
  for (let i = 0; i < cfg.DEF; i++) slots.push({ slot: n++, position: "DEF", playerId: null });
  for (let i = 0; i < cfg.MID; i++) slots.push({ slot: n++, position: "MID", playerId: null });
  for (let i = 0; i < cfg.FWD; i++) slots.push({ slot: n++, position: "FWD", playerId: null });
  // Bench (squad quotas minus XI already placed for each position).
  const benchGK = rules.perPosition.GK - 1;
  const benchDEF = rules.perPosition.DEF - cfg.DEF;
  const benchMID = rules.perPosition.MID - cfg.MID;
  const benchFWD = rules.perPosition.FWD - cfg.FWD;
  n = rules.startingSize + 1;
  for (let i = 0; i < benchGK; i++) slots.push({ slot: n++, position: "GK", playerId: null });
  for (let i = 0; i < benchDEF; i++) slots.push({ slot: n++, position: "DEF", playerId: null });
  for (let i = 0; i < benchMID; i++) slots.push({ slot: n++, position: "MID", playerId: null });
  for (let i = 0; i < benchFWD; i++) slots.push({ slot: n++, position: "FWD", playerId: null });
  return slots;
}

// ------ Constructors ------

export function initCreateDraft(
  teamName = "",
  options: { favoriteClubId?: string | null; rules?: CreateTeamRules } = {},
): CreateTeamDraft {
  const rules = options.rules ?? DEFAULT_CREATE_TEAM_RULES;
  return {
    schemaVersion: 1,
    teamName,
    favoriteClubId: options.favoriteClubId ?? null,
    consentAccepted: false,
    formation: CREATE_DEFAULT_FORMATION,
    slots: buildEmptySlots(CREATE_DEFAULT_FORMATION, rules),
  };
}

// ------ Team name ------

export type TeamNameError = "too_short" | "too_long" | "empty" | "invalid_characters";

export function validateTeamName(raw: string): { ok: true } | { ok: false; error: TeamNameError } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: "empty" };
  if (trimmed.length < TEAM_NAME_MIN_LENGTH) return { ok: false, error: "too_short" };
  if (trimmed.length > TEAM_NAME_MAX_LENGTH) return { ok: false, error: "too_long" };
  // Mirrors api.create_fantasy_team: alphanumeric endpoints with spaces and
  // the reviewed punctuation set in between. Unicode letters/numbers are
  // accepted so Arabic and French names share one contract.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _'.-]*[\p{L}\p{N}]$/u.test(trimmed)) {
    return { ok: false, error: "invalid_characters" };
  }
  return { ok: true };
}

// ------ Operations (pure) ------

export function setTeamName(draft: CreateTeamDraft, name: string): CreateTeamDraft {
  return { ...draft, teamName: name.slice(0, TEAM_NAME_MAX_LENGTH) };
}

export function setFavoriteClub(draft: CreateTeamDraft, clubId: string | null): CreateTeamDraft {
  return { ...draft, favoriteClubId: clubId };
}

export function setConsentAccepted(draft: CreateTeamDraft, accepted: boolean): CreateTeamDraft {
  return { ...draft, consentAccepted: accepted };
}

/** Place a player in a slot. Removes the player from any other slot first. */
export function placePlayer(
  draft: CreateTeamDraft,
  slot: number,
  playerId: string,
): CreateTeamDraft {
  // De-dup: remove player from any other slot.
  const clearedSlots = draft.slots.map((s) =>
    s.playerId === playerId && s.slot !== slot
      ? { ...s, playerId: null, isCaptain: false, isViceCaptain: false }
      : s,
  );
  const next = clearedSlots.map((s) =>
    s.slot === slot
      ? { ...s, playerId, isCaptain: s.isCaptain ?? false, isViceCaptain: s.isViceCaptain ?? false }
      : s,
  );
  return withDefaultCaptaincy({ ...draft, slots: next });
}

export function removePlayer(draft: CreateTeamDraft, slot: number): CreateTeamDraft {
  const next = draft.slots.map((s) =>
    s.slot === slot ? { ...s, playerId: null, isCaptain: false, isViceCaptain: false } : s,
  );
  return withDefaultCaptaincy({ ...draft, slots: next });
}

export function swapSlots(draft: CreateTeamDraft, first: number, second: number): CreateTeamDraft {
  if (first === second) return draft;
  const a = draft.slots.find((slot) => slot.slot === first);
  const b = draft.slots.find((slot) => slot.slot === second);
  if (!a || !b) return draft;
  const crossPositionBench = a.slot > 11 && b.slot > 11;
  if (a.position !== b.position && !crossPositionBench) return draft;
  const slots = draft.slots.map((slot) => {
    if (slot.slot === first) {
      return {
        ...slot,
        position: crossPositionBench ? b.position : slot.position,
        playerId: b.playerId,
        isCaptain: b.isCaptain,
        isViceCaptain: b.isViceCaptain,
      };
    }
    if (slot.slot === second) {
      return {
        ...slot,
        position: crossPositionBench ? a.position : slot.position,
        playerId: a.playerId,
        isCaptain: a.isCaptain,
        isViceCaptain: a.isViceCaptain,
      };
    }
    return slot;
  });
  return withDefaultCaptaincy({ ...draft, slots });
}

export function setCaptain(
  draft: CreateTeamDraft,
  playerId: string,
  vice = false,
): CreateTeamDraft {
  const next = draft.slots.map((s) => {
    if (vice) {
      return {
        ...s,
        isViceCaptain: s.playerId === playerId,
        isCaptain: s.isCaptain && s.playerId !== playerId,
      };
    }
    return {
      ...s,
      isCaptain: s.playerId === playerId,
      isViceCaptain: s.isViceCaptain && s.playerId !== playerId,
    };
  });
  return { ...draft, slots: next };
}

export function isFormationSupported(
  formation: FormationKey,
  rules: CreateTeamRules = DEFAULT_CREATE_TEAM_RULES,
): boolean {
  const cfg = FORMATIONS[formation];
  return (
    rules.startingSize === 11 &&
    cfg.DEF >= rules.startingMinimum.DEF &&
    cfg.DEF <= rules.startingMaximum.DEF &&
    cfg.MID >= rules.startingMinimum.MID &&
    cfg.MID <= rules.startingMaximum.MID &&
    cfg.FWD >= rules.startingMinimum.FWD &&
    cfg.FWD <= rules.startingMaximum.FWD &&
    rules.perPosition.GK >= 1 &&
    rules.perPosition.DEF >= cfg.DEF &&
    rules.perPosition.MID >= cfg.MID &&
    rules.perPosition.FWD >= cfg.FWD
  );
}

/** Re-slot the current selection into a valid formation without changing players. */
export function setFormation(
  draft: CreateTeamDraft,
  formation: FormationKey,
  players: FantasyPlayer[],
  rules: CreateTeamRules = DEFAULT_CREATE_TEAM_RULES,
): CreateTeamDraft {
  if (!isFormationSupported(formation, rules)) return draft;
  const captainId = draft.slots.find((slot) => slot.isCaptain)?.playerId ?? null;
  const viceId = draft.slots.find((slot) => slot.isViceCaptain)?.playerId ?? null;
  const byPosition: Record<Position, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const slot of [...draft.slots].sort((a, b) => a.slot - b.slot)) {
    const player = players.find((candidate) => candidate.id === slot.playerId);
    if (player) byPosition[player.position].push(player.id);
  }
  const slots = buildEmptySlots(formation, rules).map((slot) => {
    const playerId = byPosition[slot.position].shift() ?? null;
    return {
      ...slot,
      playerId,
      isCaptain: !!playerId && playerId === captainId && slot.slot <= rules.startingSize,
      isViceCaptain:
        !!playerId &&
        playerId === viceId &&
        playerId !== captainId &&
        slot.slot <= rules.startingSize,
    };
  });
  return withDefaultCaptaincy({ ...draft, formation, slots });
}

/**
 * Reconcile persisted data against the current catalog and active rules.
 * Unknown, duplicate, ineligible, and now-mismatched records are discarded.
 */
export function reconcileCreateDraft(
  value: unknown,
  players: FantasyPlayer[],
  clubs: Club[],
  rules: CreateTeamRules = DEFAULT_CREATE_TEAM_RULES,
  defaults: { teamName?: string; favoriteClubId?: string | null } = {},
): CreateTeamDraft {
  const raw = value && typeof value === "object" ? (value as Partial<CreateTeamDraft>) : null;
  const formation =
    raw?.formation && raw.formation in FORMATIONS && isFormationSupported(raw.formation, rules)
      ? raw.formation
      : CREATE_DEFAULT_FORMATION;
  const draft = initCreateDraft(
    typeof raw?.teamName === "string" ? raw.teamName : (defaults.teamName ?? ""),
    {
      rules,
      favoriteClubId:
        typeof raw?.favoriteClubId === "string"
          ? raw.favoriteClubId
          : (defaults.favoriteClubId ?? null),
    },
  );
  draft.formation = formation;
  draft.slots = buildEmptySlots(formation, rules);
  draft.consentAccepted = raw?.consentAccepted === true;
  if (!draft.favoriteClubId || !clubs.some((club) => club.id === draft.favoriteClubId)) {
    draft.favoriteClubId = null;
  }

  const seen = new Set<string>();
  const selected = Array.isArray(raw?.slots)
    ? raw.slots
        .filter((slot): slot is CreateSlot => !!slot && typeof slot === "object")
        .sort((a, b) => Number(a.slot) - Number(b.slot))
    : [];
  const captainId = selected.find((slot) => slot.isCaptain)?.playerId ?? null;
  const viceId = selected.find((slot) => slot.isViceCaptain)?.playerId ?? null;
  const byPosition: Record<Position, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const slot of selected) {
    if (!slot.playerId || seen.has(slot.playerId)) continue;
    const player = players.find((candidate) => candidate.id === slot.playerId);
    if (!player || player.status === "ineligible" || player.status === "unavailable") continue;
    seen.add(player.id);
    byPosition[player.position].push(player.id);
  }
  draft.slots = draft.slots.map((slot) => {
    const playerId = byPosition[slot.position].shift() ?? null;
    return {
      ...slot,
      playerId,
      isCaptain: !!playerId && playerId === captainId && slot.slot <= rules.startingSize,
      isViceCaptain:
        !!playerId &&
        playerId === viceId &&
        playerId !== captainId &&
        slot.slot <= rules.startingSize,
    };
  });
  return withDefaultCaptaincy(draft);
}

export type PlayerSelectionIssue =
  | "duplicate"
  | "position"
  | "club_limit"
  | "budget"
  | "unavailable";

export function getPlayerSelectionIssue(
  draft: CreateTeamDraft,
  slotNumber: number,
  player: FantasyPlayer,
  players: FantasyPlayer[],
  rules: CreateTeamRules = DEFAULT_CREATE_TEAM_RULES,
): PlayerSelectionIssue | null {
  const slot = draft.slots.find((candidate) => candidate.slot === slotNumber);
  if (!slot || slot.position !== player.position) return "position";
  if (player.status === "ineligible" || player.status === "unavailable") return "unavailable";
  if (
    draft.slots.some(
      (candidate) => candidate.slot !== slotNumber && candidate.playerId === player.id,
    )
  ) {
    return "duplicate";
  }
  const current = players.find((candidate) => candidate.id === slot.playerId);
  const summary = computeSummary(draft, players, rules);
  const clubCount = summary.perClub[player.clubId] ?? 0;
  const currentClubCredit = current?.clubId === player.clubId ? 1 : 0;
  if (clubCount - currentClubCredit >= rules.maxPerClub) return "club_limit";
  const maxPrice = summary.bankRemaining + (current?.price ?? 0);
  if (player.price > maxPrice + 0.001) return "budget";
  return null;
}

/**
 * Ensure the XI always has exactly one captain and one distinct vice-captain
 * when at least two XI slots are filled. This mirrors the FPL/BotolaGO contract
 * and keeps the Save gate reachable even before the user opens the captain
 * sheet. Never overrides an already-consistent selection.
 */
function withDefaultCaptaincy(draft: CreateTeamDraft): CreateTeamDraft {
  const xi = draft.slots.filter((s) => s.slot < 12 && s.playerId);
  const captainInXI = xi.find((s) => s.isCaptain);
  const viceInXI = xi.find((s) => s.isViceCaptain && !s.isCaptain);
  if (captainInXI && viceInXI) return draft;
  const [first, second] = xi;
  const captainId = captainInXI?.playerId ?? first?.playerId ?? null;
  const viceId =
    viceInXI && viceInXI.playerId !== captainId
      ? viceInXI.playerId
      : (xi.find((s) => s.playerId !== captainId)?.playerId ?? second?.playerId ?? null);
  const slots = draft.slots.map((s) => ({
    ...s,
    isCaptain: !!s.playerId && s.playerId === captainId && s.slot < 12,
    isViceCaptain:
      !!s.playerId && !!viceId && s.playerId === viceId && s.playerId !== captainId && s.slot < 12,
  }));
  return { ...draft, slots };
}

// ------ Autocomplete ------

/**
 * Merge a canonical "template" squad (already valid: 15 players, position
 * quotas, budget, club-limits, captain + vice) into the draft, preserving
 * the user-entered team name and captain choice when reasonable.
 *
 * Callers pass a squad that came from the existing engine / mock data
 * (`fantasyService.getTeam()` in the current implementation). This function
 * does NOT invent players — it just re-slots them for the draft formation.
 * Returns null if the template is not a valid 15-player squad.
 */
export function applyAutocompleteTemplate(
  draft: CreateTeamDraft,
  template: SquadPlayer[],
  players: FantasyPlayer[],
  rules: CreateTeamRules = DEFAULT_CREATE_TEAM_RULES,
): CreateTeamDraft | null {
  if (template.length !== rules.totalSize) return null;

  // Rebuild slot list from the template exactly (it already respects the
  // formation because the mock ships as 4-4-2 by default). If our draft used
  // a different formation, we adopt the template's captain/vice + squad and
  // reslot into the target formation via the same shape rule as buildEmptySlots.
  const empty = buildEmptySlots(draft.formation, rules);
  const byPosition: Record<Position, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  const captainId = template.find((s) => s.isCaptain)?.playerId ?? null;
  const viceId = template.find((s) => s.isViceCaptain)?.playerId ?? null;

  // XI first (slot < 12), then bench, so we prefer template starters in our
  // starting slots.
  const ordered = [...template].sort((a, b) => a.slot - b.slot);
  for (const s of ordered) {
    const p = players.find((pp) => pp.id === s.playerId);
    if (!p) return null;
    byPosition[p.position].push(s.playerId);
  }

  const slots: CreateSlot[] = empty.map((s) => {
    const list = byPosition[s.position];
    const playerId = list.shift() ?? null;
    return {
      ...s,
      playerId,
      isCaptain: !!playerId && playerId === captainId && s.slot < 12,
      isViceCaptain:
        !!playerId && !!viceId && playerId === viceId && s.slot < 12 && playerId !== captainId,
    };
  });

  const completed = withDefaultCaptaincy({ ...draft, slots });
  const summary = computeSummary(completed, players, rules);
  return summary.filled === rules.totalSize &&
    !summary.overBudget &&
    summary.overClubLimit.length === 0 &&
    summary.formationValid
    ? completed
    : null;
}

/**
 * Build a deterministic first-team proposal directly from the authoritative
 * player pool. A first-time user has no existing team to use as a template.
 */
export function buildAutocompleteDraft(
  draft: CreateTeamDraft,
  players: FantasyPlayer[],
  rules: CreateTeamRules = DEFAULT_CREATE_TEAM_RULES,
): CreateTeamDraft | null {
  const candidates = players
    .filter((player) => player.status === "available")
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  const clubCounts = new Map<string, number>();
  const selected = new Set<string>();
  let totalCost = 0;

  const slots = buildEmptySlots(draft.formation, rules).map((slot) => {
    const player = candidates.find(
      (candidate) =>
        candidate.position === slot.position &&
        !selected.has(candidate.id) &&
        (clubCounts.get(candidate.clubId) ?? 0) < rules.maxPerClub &&
        totalCost + candidate.price <= rules.budget,
    );
    if (!player) return slot;
    selected.add(player.id);
    clubCounts.set(player.clubId, (clubCounts.get(player.clubId) ?? 0) + 1);
    totalCost += player.price;
    return { ...slot, playerId: player.id };
  });

  if (selected.size !== rules.totalSize) return null;
  const completed = withDefaultCaptaincy({ ...draft, slots });
  const summary = computeSummary(completed, players, rules);
  return summary.filled === rules.totalSize &&
    !summary.overBudget &&
    summary.overClubLimit.length === 0 &&
    summary.formationValid
    ? completed
    : null;
}

// ------ Summary + validation ------

export interface DraftSummary {
  filled: number;
  total: number;
  perPosition: Record<Position, { filled: number; required: number }>;
  perClub: Record<string, number>;
  overClubLimit: string[];
  duplicateIds: string[];
  totalCost: number;
  bankStart: number;
  bankRemaining: number;
  overBudget: boolean;
  hasCaptain: boolean;
  hasVice: boolean;
  captainViceDistinct: boolean;
  captainInXI: boolean;
  viceInXI: boolean;
  formationValid: boolean;
}

export function computeSummary(
  draft: CreateTeamDraft,
  players: FantasyPlayer[],
  rules: CreateTeamRules = DEFAULT_CREATE_TEAM_RULES,
  bankStart: number = rules.budget,
): DraftSummary {
  const filledSlots = draft.slots.filter((s) => s.playerId);
  const perPosition: Record<Position, { filled: number; required: number }> = {
    GK: { filled: 0, required: rules.perPosition.GK },
    DEF: { filled: 0, required: rules.perPosition.DEF },
    MID: { filled: 0, required: rules.perPosition.MID },
    FWD: { filled: 0, required: rules.perPosition.FWD },
  };
  const perClub: Record<string, number> = {};
  const seen = new Map<string, number>();
  let totalCost = 0;
  for (const s of filledSlots) {
    const p = players.find((pp) => pp.id === s.playerId);
    if (!p) continue;
    perPosition[p.position].filled += 1;
    perClub[p.clubId] = (perClub[p.clubId] ?? 0) + 1;
    totalCost += p.price;
    seen.set(s.playerId!, (seen.get(s.playerId!) ?? 0) + 1);
  }
  const overClubLimit = Object.entries(perClub)
    .filter(([, n]) => n > rules.maxPerClub)
    .map(([clubId]) => clubId);
  const duplicateIds = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  totalCost = round1(totalCost);
  const bankRemaining = round1(bankStart - totalCost);

  const cfg = FORMATIONS[draft.formation];
  const xi = draft.slots.filter((s) => s.slot < 12);
  const xiPositions = xi
    .map((s) => players.find((pp) => pp.id === s.playerId)?.position)
    .filter(Boolean) as Position[];
  const xiGK = xiPositions.filter((p) => p === "GK").length;
  const xiDEF = xiPositions.filter((p) => p === "DEF").length;
  const xiMID = xiPositions.filter((p) => p === "MID").length;
  const xiFWD = xiPositions.filter((p) => p === "FWD").length;
  const formationValid =
    filledSlots.length === rules.totalSize &&
    xiGK === 1 &&
    xiDEF === cfg.DEF &&
    xiMID === cfg.MID &&
    xiFWD === cfg.FWD;

  const captain = filledSlots.find((s) => s.isCaptain);
  const vice = filledSlots.find((s) => s.isViceCaptain);
  return {
    filled: filledSlots.length,
    total: rules.totalSize,
    perPosition,
    perClub,
    overClubLimit,
    duplicateIds,
    totalCost,
    bankStart,
    bankRemaining,
    overBudget: bankRemaining < -1e-6,
    hasCaptain: !!captain,
    hasVice: !!vice,
    captainViceDistinct: !!captain && !!vice && captain.playerId !== vice.playerId,
    captainInXI: !!captain && captain.slot < 12,
    viceInXI: !!vice && vice.slot < 12,
    formationValid,
  };
}

export type DraftValidationCode =
  | "team_name"
  | "consent"
  | "size"
  | "position_count"
  | "duplicate"
  | "club_limit"
  | "budget"
  | "formation"
  | "captain_missing"
  | "vice_missing"
  | "captain_vice_same"
  | "captain_not_in_xi"
  | "vice_not_in_xi";

export interface DraftValidation {
  ok: boolean;
  errors: DraftValidationCode[];
}

/**
 * Validate the whole draft for save. Returns an ordered list of user-facing
 * error codes; UI maps each to a localized message.
 */
export function validateDraft(
  draft: CreateTeamDraft,
  players: FantasyPlayer[],
  rules: CreateTeamRules = DEFAULT_CREATE_TEAM_RULES,
  bankStart: number = rules.budget,
): DraftValidation {
  const errors: DraftValidationCode[] = [];
  if (!validateTeamName(draft.teamName).ok) errors.push("team_name");
  if (!draft.consentAccepted) errors.push("consent");
  const summary = computeSummary(draft, players, rules, bankStart);
  if (summary.filled !== summary.total) errors.push("size");
  else {
    // Position quotas — only meaningful once full.
    for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
      if (summary.perPosition[pos].filled !== summary.perPosition[pos].required) {
        errors.push("position_count");
        break;
      }
    }
  }
  if (summary.duplicateIds.length > 0) errors.push("duplicate");
  if (summary.overClubLimit.length > 0) errors.push("club_limit");
  if (summary.overBudget) errors.push("budget");
  if (summary.filled === summary.total && !summary.formationValid) errors.push("formation");
  if (summary.filled === summary.total) {
    if (!summary.hasCaptain) errors.push("captain_missing");
    else if (!summary.captainInXI) errors.push("captain_not_in_xi");
    if (!summary.hasVice) errors.push("vice_missing");
    else if (!summary.viceInXI) errors.push("vice_not_in_xi");
    if (summary.hasCaptain && summary.hasVice && !summary.captainViceDistinct)
      errors.push("captain_vice_same");
  }
  return { ok: errors.length === 0, errors };
}

// ------ Export for save ------

/**
 * Convert a validated draft into the SquadPlayer[] payload the repository
 * expects. Callers MUST call `validateDraft(...).ok` first — this function
 * does not re-validate.
 */
export function draftToSquad(draft: CreateTeamDraft): SquadPlayer[] {
  return draft.slots
    .filter((s) => s.playerId)
    .map((s) => ({
      playerId: s.playerId!,
      slot: s.slot,
      isCaptain: s.isCaptain || undefined,
      isViceCaptain: s.isViceCaptain || undefined,
    }));
}

/** Compute current per-player purchase prices from the pool. */
export function draftPurchasePrices(
  draft: CreateTeamDraft,
  players: FantasyPlayer[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of draft.slots) {
    if (!s.playerId) continue;
    const p = players.find((pp) => pp.id === s.playerId);
    if (p) out[s.playerId] = p.price;
  }
  return out;
}

// ------ Helpers ------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
