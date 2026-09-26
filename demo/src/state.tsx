/**
 * What the visitor has done in the demo: the eleven, the armband, the team
 * name, whether Journée 12 has been played, and the sponsor being pitched.
 *
 * It lives in this device's browser only (and survives a reload, so a
 * presenter who refreshes mid-meeting keeps their team). "Recommencer" in
 * the presenter clears it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { FormationKey, Position } from "@/types/fantasy";
import { FORMATIONS } from "@/types/fantasy";

import { DEMO_BUDGET, MAX_PER_CLUB, gameweekBreakdown, playerById, players } from "./data/world";

export const DEMO_FORMATIONS: FormationKey[] = ["4-3-3", "4-4-2", "3-5-2", "3-4-3", "5-3-2"];

export interface Sponsor {
  /** Empty means the placeholder: "Votre marque". */
  name: string;
  /** Brand colour behind the monogram and on the banner's edge. */
  color: string;
  /** An uploaded logo as a data URL, or null for the monogram. */
  logo: string | null;
}

export const DEFAULT_SPONSOR: Sponsor = { name: "", color: "#1d2740", logo: null };

export interface DemoState {
  formation: FormationKey;
  /** Eleven slots in pitch order (GK, defenders, midfielders, forwards). */
  picks: (string | null)[];
  captainId: string | null;
  viceId: string | null;
  teamName: string;
  saved: boolean;
  played: boolean;
  sponsor: Sponsor;
}

const STORAGE_KEY = "botolago.demo.state.v1";

export function positionsFor(formation: FormationKey): Position[] {
  const shape = FORMATIONS[formation];
  return [
    "GK",
    ...Array<Position>(shape.DEF).fill("DEF"),
    ...Array<Position>(shape.MID).fill("MID"),
    ...Array<Position>(shape.FWD).fill("FWD"),
  ];
}

const initialState: DemoState = {
  formation: "4-3-3",
  picks: Array(11).fill(null),
  captainId: null,
  viceId: null,
  teamName: "",
  saved: false,
  played: false,
  sponsor: DEFAULT_SPONSOR,
};

function load(): DemoState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    const formation =
      parsed.formation && DEMO_FORMATIONS.includes(parsed.formation) ? parsed.formation : "4-3-3";
    const picks = Array.isArray(parsed.picks) && parsed.picks.length === 11 ? parsed.picks : null;
    if (!picks || picks.some((id) => id !== null && !playerById(id))) return initialState;
    return {
      ...initialState,
      ...parsed,
      formation,
      picks,
      sponsor: { ...DEFAULT_SPONSOR, ...(parsed.sponsor ?? {}) },
    };
  } catch {
    return initialState;
  }
}

function save(state: DemoState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private window or storage blocked: the demo still works, it just forgets.
  }
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export interface Summary {
  filled: number;
  spent: number;
  bank: number;
  overBudget: boolean;
  /** Club ids with more than three picks (only reachable by changing formation). */
  overClubLimit: string[];
}

export function summarize(state: DemoState): Summary {
  const picked = state.picks.map((id) => playerById(id)).filter((p) => !!p);
  const spent = round1(picked.reduce((sum, player) => sum + player.price, 0));
  const perClub = new Map<string, number>();
  for (const player of picked) perClub.set(player.clubId, (perClub.get(player.clubId) ?? 0) + 1);
  return {
    filled: picked.length,
    spent,
    bank: round1(DEMO_BUDGET - spent),
    overBudget: spent > DEMO_BUDGET + 0.001,
    overClubLimit: [...perClub].filter(([, count]) => count > MAX_PER_CLUB).map(([id]) => id),
  };
}

/** Journée 12 for the chosen eleven: each player's points, the captain's doubled. */
export function scoreTeam(state: DemoState) {
  const lines = state.picks
    .filter((id): id is string => !!id)
    .map((id) => ({ id, breakdown: gameweekBreakdown(id) }));
  const captainPlayed =
    !!state.captainId &&
    (lines.find((line) => line.id === state.captainId)?.breakdown.minutesPlayed ?? 0) > 0;
  // As in the live game: the vice-captain takes the armband only when the
  // captain did not play at all.
  const effectiveCaptain = captainPlayed ? state.captainId : state.viceId;
  const total = lines.reduce(
    (sum, line) => sum + line.breakdown.totalPoints * (line.id === effectiveCaptain ? 2 : 1),
    0,
  );
  return { lines, effectiveCaptain, captainTookOver: !captainPlayed && !!state.viceId, total };
}

/** Value used to fill a slot automatically: good form, some quality, a strong Journée 12. */
export function autoValue(id: string) {
  const player = playerById(id)!;
  return (player.form ?? 0) + 0.35 * player.price + 1.1 * gameweekBreakdown(id).totalPoints;
}

function autoFill(state: DemoState): DemoState {
  const positions = positionsFor(state.formation);
  const picks = [...state.picks];
  const cheapest = (position: Position) =>
    Math.min(...players.filter((player) => player.position === position).map((p) => p.price));
  const order = picks
    .map((id, index) => ({ id, index, position: positions[index] }))
    .filter((slot) => !slot.id)
    // Forwards and midfielders first: they take the budget's biggest share.
    .sort(
      (a, b) =>
        ["FWD", "MID", "DEF", "GK"].indexOf(a.position) -
        ["FWD", "MID", "DEF", "GK"].indexOf(b.position),
    );
  for (const slot of order) {
    const rest = order.filter((other) => other !== slot && !picks[other.index]);
    const reserve = rest.reduce((sum, other) => sum + cheapest(other.position), 0);
    const spent = picks.reduce((sum, id) => sum + (playerById(id)?.price ?? 0), 0);
    const room = DEMO_BUDGET - spent - reserve;
    const share = (DEMO_BUDGET - spent) / (rest.length + 1);
    const cap = Math.min(
      room,
      share * (slot.position === "GK" || slot.position === "DEF" ? 1.05 : 1.45),
    );
    const clubCount = (clubId: string) =>
      picks.filter((id) => playerById(id)?.clubId === clubId).length;
    const choice = players
      .filter(
        (player) =>
          player.position === slot.position &&
          !picks.includes(player.id) &&
          player.price <= cap + 0.001 &&
          clubCount(player.clubId) < MAX_PER_CLUB,
      )
      .sort((a, b) => autoValue(b.id) - autoValue(a.id))[0];
    if (choice) picks[slot.index] = choice.id;
  }
  const ranked = armbandOrder(picks);
  const captainId =
    state.captainId && picks.includes(state.captainId) ? state.captainId : (ranked[0] ?? null);
  const viceId =
    state.viceId && picks.includes(state.viceId) && state.viceId !== captainId
      ? state.viceId
      : (ranked.find((id) => id !== captainId) ?? null);
  return { ...state, picks, captainId, viceId };
}

/** Who should wear the armband: outfield players first, the best value first. */
export function armbandOrder(picks: (string | null)[]): string[] {
  return picks
    .filter((id): id is string => !!id)
    .sort(
      (a, b) =>
        Number(playerById(a)?.position === "GK") - Number(playerById(b)?.position === "GK") ||
        autoValue(b) - autoValue(a),
    );
}

function withFormation(state: DemoState, formation: FormationKey): DemoState {
  const current = positionsFor(state.formation);
  const next = positionsFor(formation);
  const byPosition = new Map<Position, string[]>();
  state.picks.forEach((id, index) => {
    if (!id) return;
    const list = byPosition.get(current[index]) ?? [];
    list.push(id);
    byPosition.set(current[index], list);
  });
  const picks = next.map((position) => byPosition.get(position)?.shift() ?? null);
  const keep = (id: string | null) => (id && picks.includes(id) ? id : null);
  return {
    ...state,
    formation,
    picks,
    captainId: keep(state.captainId),
    viceId: keep(state.viceId),
  };
}

type Actions = {
  setFormation: (formation: FormationKey) => void;
  place: (slot: number, playerId: string) => void;
  remove: (slot: number) => void;
  setCaptain: (playerId: string) => void;
  setVice: (playerId: string) => void;
  setTeamName: (name: string) => void;
  confirm: () => void;
  play: () => void;
  autofill: () => void;
  clear: () => void;
  reset: () => void;
  setSponsor: (sponsor: Sponsor) => void;
};

const Context = createContext<{ state: DemoState; actions: Actions } | null>(null);

export function DemoStateProvider({ children }: { children: ReactNode }) {
  // The demo is a client-only page, so the saved state is read before the
  // first paint rather than after it.
  const [state, setState] = useState<DemoState>(load);
  useEffect(() => save(state), [state]);

  const update = useCallback((change: (current: DemoState) => DemoState) => setState(change), []);

  const actions = useMemo<Actions>(
    () => ({
      setFormation: (formation) => update((s) => withFormation(s, formation)),
      place: (slot, playerId) =>
        update((s) => {
          const picks = [...s.picks];
          const previous = picks[slot];
          picks[slot] = playerId;
          const drop = (id: string | null) => (id === previous ? null : id);
          return { ...s, picks, captainId: drop(s.captainId), viceId: drop(s.viceId) };
        }),
      remove: (slot) =>
        update((s) => {
          const picks = [...s.picks];
          const previous = picks[slot];
          picks[slot] = null;
          const drop = (id: string | null) => (id === previous ? null : id);
          return { ...s, picks, captainId: drop(s.captainId), viceId: drop(s.viceId) };
        }),
      setCaptain: (playerId) =>
        update((s) => ({
          ...s,
          captainId: playerId,
          viceId: s.viceId === playerId ? s.captainId : s.viceId,
        })),
      setVice: (playerId) =>
        update((s) => ({
          ...s,
          viceId: playerId,
          captainId: s.captainId === playerId ? s.viceId : s.captainId,
        })),
      setTeamName: (teamName) => update((s) => ({ ...s, teamName })),
      confirm: () => update((s) => ({ ...s, saved: true })),
      play: () => update((s) => ({ ...s, played: true })),
      autofill: () => update((s) => autoFill(s)),
      clear: () =>
        update((s) => ({ ...s, picks: Array(11).fill(null), captainId: null, viceId: null })),
      reset: () => update((s) => ({ ...initialState, sponsor: s.sponsor })),
      setSponsor: (sponsor) => update((s) => ({ ...s, sponsor })),
    }),
    [update],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDemo() {
  const value = useContext(Context);
  if (!value) throw new Error("useDemo outside DemoStateProvider");
  return value;
}

/**
 * A complete team for screens reached out of order (a presenter who jumps
 * straight to the leaderboard): fill what is missing, name it, confirm it.
 */
export function useEnsureTeam() {
  const { state, actions } = useDemo();
  return useCallback(() => {
    if (state.picks.some((id) => !id) || !state.captainId) actions.autofill();
    if (!state.teamName.trim()) actions.setTeamName("Atlas FC");
    if (!state.saved) actions.confirm();
  }, [state, actions]);
}
