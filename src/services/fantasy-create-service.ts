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

import type { TranslationKey } from "@/i18n/dictionaries";
import type { FantasyPlayer, FormationKey, Position, SquadPlayer } from "@/types/fantasy";
import { FORMATIONS, SQUAD_RULES } from "@/types/fantasy";
import { validateTeam } from "@/lib/team-validation";

// ------ Draft shape ------

export interface CreateTeamDraft {
  /** User-entered team name; validated against `validateTeamName`. */
  teamName: string;
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

// ------ Constants ------

/** Fixed default formation for onboarding; user can change via engine reslot. */
export const CREATE_DEFAULT_FORMATION: FormationKey = "4-4-2";

/** Max characters for a fantasy team name. Kept conservative for mobile UX. */
export const TEAM_NAME_MAX_LENGTH = 30;
/**
 * Min characters (trimmed) for a valid team name. `api.create_fantasy_team`
 * refuses fewer than 3 (`invalid_team_name`); a 2-character name used to pass
 * here and fail on the server after the whole squad had been built.
 */
export const TEAM_NAME_MIN_LENGTH = 3;

/**
 * The server's own pattern (`api.create_fantasy_team`): a letter or digit at
 * both ends, and only letters, digits, spaces, `_`, `'`, `.` or `-` between.
 * Production's ICU `[[:alnum:]]` accepts Arabic and accented letters, as
 * `\p{L}\p{N}` does here.
 */
const TEAM_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _'.-]*[\p{L}\p{N}]$/u;

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
export function buildEmptySlots(formation: FormationKey): CreateSlot[] {
  const cfg = FORMATIONS[formation];
  const slots: CreateSlot[] = [];
  let n = 1;
  slots.push({ slot: n++, position: "GK", playerId: null });
  for (let i = 0; i < cfg.DEF; i++) slots.push({ slot: n++, position: "DEF", playerId: null });
  for (let i = 0; i < cfg.MID; i++) slots.push({ slot: n++, position: "MID", playerId: null });
  for (let i = 0; i < cfg.FWD; i++) slots.push({ slot: n++, position: "FWD", playerId: null });
  // Bench (squad quotas minus XI already placed for each position).
  const benchGK = SQUAD_RULES.perPosition.GK - 1;
  const benchDEF = SQUAD_RULES.perPosition.DEF - cfg.DEF;
  const benchMID = SQUAD_RULES.perPosition.MID - cfg.MID;
  const benchFWD = SQUAD_RULES.perPosition.FWD - cfg.FWD;
  n = 12;
  for (let i = 0; i < benchGK; i++) slots.push({ slot: n++, position: "GK", playerId: null });
  for (let i = 0; i < benchDEF; i++) slots.push({ slot: n++, position: "DEF", playerId: null });
  for (let i = 0; i < benchMID; i++) slots.push({ slot: n++, position: "MID", playerId: null });
  for (let i = 0; i < benchFWD; i++) slots.push({ slot: n++, position: "FWD", playerId: null });
  return slots;
}

// ------ Constructors ------

export function initCreateDraft(teamName = ""): CreateTeamDraft {
  return {
    teamName,
    formation: CREATE_DEFAULT_FORMATION,
    slots: buildEmptySlots(CREATE_DEFAULT_FORMATION),
  };
}

// ------ Team name ------

export type TeamNameError = "too_short" | "too_long" | "empty" | "invalid_characters";

/**
 * The name exactly as it is sent: trimmed, with typographic apostrophes (’ ‘,
 * which French keyboards produce) folded to the ASCII one the server allows.
 */
export function normalizeTeamName(raw: string): string {
  return raw.trim().replace(/[‘’ʼ]/gu, "'");
}

export function validateTeamName(raw: string): { ok: true } | { ok: false; error: TeamNameError } {
  const name = normalizeTeamName(raw);
  if (name.length === 0) return { ok: false, error: "empty" };
  if (name.length < TEAM_NAME_MIN_LENGTH) return { ok: false, error: "too_short" };
  if (name.length > TEAM_NAME_MAX_LENGTH) return { ok: false, error: "too_long" };
  if (!TEAM_NAME_PATTERN.test(name)) return { ok: false, error: "invalid_characters" };
  return { ok: true };
}

// ------ Server refusal → message ------

/**
 * What the create screen tells a manager when the server refuses the squad.
 * Every key names the actual reason; none of them says "import", which is
 * what the screen used to show for a passed deadline.
 */
export function createTeamErrorKey(error: { code: string; domainCode?: string }): TranslationKey {
  switch (error.code) {
    case "gameweek_locked":
      return "fantasy.create.error.deadline_passed";
    case "season_closed":
      return "fantasy.create.error.season_closed";
    case "already_exists":
      return "fantasy.create.error.already_exists";
    case "version_conflict":
      return "fantasy.error.version_conflict";
    case "network":
      return "fantasy.error.network";
    case "permission_denied":
    case "unauthenticated":
      return "fantasy.error.permission";
    // Not a refusal of the squad: the code is owed first, and the app is
    // taking the manager to it. The same sentence as the auth layer's toast.
    case "mfa_required":
      return "auth.step_up.toast";
    case "validation":
      switch (error.domainCode) {
        case "budget_exceeded":
          return "fantasy.create.error.budget";
        case "club_limit_exceeded":
          return "fantasy.create.error.club_limit";
        case "invalid_team_name":
          return "fantasy.create.error.team_name";
        case "duplicate_player":
          return "fantasy.create.error.duplicate";
        case "invalid_formation":
          return "fantasy.create.error.formation";
        case "player_not_eligible":
          return "fantasy.create.error.player_unavailable";
        default:
          return "fantasy.create.error.rejected";
      }
    default:
      return "fantasy.create.error.generic";
  }
}

// ------ Operations (pure) ------

export function setTeamName(draft: CreateTeamDraft, name: string): CreateTeamDraft {
  return { ...draft, teamName: name.slice(0, TEAM_NAME_MAX_LENGTH) };
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
): CreateTeamDraft | null {
  if (template.length !== SQUAD_RULES.totalSize) return null;
  const validation = validateTeam(template, draft.formation, players);
  if (!validation.ok) return null;

  // Rebuild slot list from the template exactly (it already respects the
  // formation because the mock ships as 4-4-2 by default). If our draft used
  // a different formation, we adopt the template's captain/vice + squad and
  // reslot into the target formation via the same shape rule as buildEmptySlots.
  const empty = buildEmptySlots(draft.formation);
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

  return withDefaultCaptaincy({ ...draft, slots });
}

/**
 * Build a deterministic first-team proposal directly from the authoritative
 * player pool. A first-time user has no existing team to use as a template.
 */
export function buildAutocompleteDraft(
  draft: CreateTeamDraft,
  players: FantasyPlayer[],
): CreateTeamDraft | null {
  const candidates = players
    .filter((player) => player.status === "available")
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  const clubCounts = new Map<string, number>();
  const selected = new Set<string>();
  let totalCost = 0;

  const slots = buildEmptySlots(draft.formation).map((slot) => {
    const player = candidates.find(
      (candidate) =>
        candidate.position === slot.position &&
        !selected.has(candidate.id) &&
        (clubCounts.get(candidate.clubId) ?? 0) < SQUAD_RULES.maxPerClub &&
        totalCost + candidate.price <= SQUAD_RULES.budget,
    );
    if (!player) return slot;
    selected.add(player.id);
    clubCounts.set(player.clubId, (clubCounts.get(player.clubId) ?? 0) + 1);
    totalCost += player.price;
    return { ...slot, playerId: player.id };
  });

  if (selected.size !== SQUAD_RULES.totalSize) return null;
  const completed = withDefaultCaptaincy({ ...draft, slots });
  const summary = computeSummary(completed, players);
  return summary.filled === SQUAD_RULES.totalSize &&
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
  bankStart: number = SQUAD_RULES.budget,
): DraftSummary {
  const filledSlots = draft.slots.filter((s) => s.playerId);
  const perPosition: Record<Position, { filled: number; required: number }> = {
    GK: { filled: 0, required: SQUAD_RULES.perPosition.GK },
    DEF: { filled: 0, required: SQUAD_RULES.perPosition.DEF },
    MID: { filled: 0, required: SQUAD_RULES.perPosition.MID },
    FWD: { filled: 0, required: SQUAD_RULES.perPosition.FWD },
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
    .filter(([, n]) => n > SQUAD_RULES.maxPerClub)
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
    filledSlots.length === SQUAD_RULES.totalSize &&
    xiGK === 1 &&
    xiDEF === cfg.DEF &&
    xiMID === cfg.MID &&
    xiFWD === cfg.FWD;

  const captain = filledSlots.find((s) => s.isCaptain);
  const vice = filledSlots.find((s) => s.isViceCaptain);
  return {
    filled: filledSlots.length,
    total: SQUAD_RULES.totalSize,
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
  bankStart: number = SQUAD_RULES.budget,
): DraftValidation {
  const errors: DraftValidationCode[] = [];
  if (!validateTeamName(draft.teamName).ok) errors.push("team_name");
  const summary = computeSummary(draft, players, bankStart);
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
