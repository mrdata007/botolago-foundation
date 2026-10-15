/**
 * What the Fantasy player list (`/fantasy/players`) keeps in its URL.
 *
 * The search, the position and club chips, the price cap, the sort and the
 * page used to be page state. A player page is rendered by the same route in
 * place of the list, which unmounts it, so every player opened wiped the
 * filters and Retour came back to page 1 of the whole pool. In the URL they
 * belong to the history entry: Retour, a reload and a shared link all open
 * the same page of the same list.
 *
 * Defaults are never written (points, best first, page 1, no filter), so a
 * plain `/fantasy/players` stays plain.
 */
export const PLAYER_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type PlayerPositionFilter = (typeof PLAYER_POSITIONS)[number];

export const PLAYER_SORT_KEYS = ["points", "form", "price", "ownership"] as const;
export type PlayerSortKey = (typeof PLAYER_SORT_KEYS)[number];

export type PlayerSortDir = "asc" | "desc";

export interface PlayersSearch {
  /** "Comparer" on a player page lands here with that player picked. Read once. */
  readonly compare?: string;
  readonly q?: string;
  readonly pos?: PlayerPositionFilter;
  readonly club?: string;
  /** The price cap in millions, as a whole number. */
  readonly max?: string;
  readonly sort?: Exclude<PlayerSortKey, "points">;
  readonly dir?: "asc";
  /** From 2: page 1 is the default. */
  readonly page?: number;
}

export const PLAYERS_SEARCH_MAX_LENGTH = 80;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const WHOLE_NUMBER = /^\d{1,3}$/;
const MAX_PAGE = 999;

/** The router JSON-parses a query value first: `max=8` arrives as the number 8. */
function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return undefined;
}

export function validatePlayersSearch(search: Record<string, unknown>): PlayersSearch {
  const compare = typeof search.compare === "string" && search.compare ? search.compare : undefined;
  const q = textOf(search.q)?.slice(0, PLAYERS_SEARCH_MAX_LENGTH);
  const pos = PLAYER_POSITIONS.find((candidate) => candidate === search.pos);
  const clubText = textOf(search.club);
  const club = clubText !== undefined && SAFE_KEY.test(clubText) ? clubText : undefined;
  const maxText = textOf(search.max);
  const max =
    maxText !== undefined && WHOLE_NUMBER.test(maxText) ? String(Number(maxText)) : undefined;
  const sort = PLAYER_SORT_KEYS.find((candidate) => candidate === search.sort);
  const pageNumber = Number(textOf(search.page));
  const page =
    Number.isInteger(pageNumber) && pageNumber >= 2 ? Math.min(pageNumber, MAX_PAGE) : undefined;
  return {
    ...(compare ? { compare } : {}),
    ...(q && q.trim() ? { q } : {}),
    ...(pos ? { pos } : {}),
    ...(club ? { club } : {}),
    ...(max && max !== "0" ? { max } : {}),
    ...(sort && sort !== "points" ? { sort } : {}),
    ...(search.dir === "asc" ? { dir: "asc" as const } : {}),
    ...(page ? { page } : {}),
  };
}

/**
 * The search to navigate to after a change: validated, with `compare` dropped
 * (it is read once, and a filter change must not bring it back).
 */
export function playersSearchWith(
  previous: Record<string, unknown>,
  change: Partial<Record<keyof PlayersSearch, unknown>>,
): PlayersSearch {
  const { compare: _compare, ...kept } = validatePlayersSearch(previous);
  return validatePlayersSearch({ ...kept, ...change });
}
