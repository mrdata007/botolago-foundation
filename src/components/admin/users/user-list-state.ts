import type {
  AdminUserCursor,
  AdminUserDto,
  AdminUserPageDto,
  AdminUserStatus,
} from "@/backend/admin/users-contracts";

/**
 * The user directory's list state, kept apart from the page so it can be
 * tested without a DOM (this repository has no DOM test setup).
 *
 * Every search starts a new *generation*; an answer carrying an older one is
 * dropped, so a slow reply to the previous filters can never land in the list
 * on screen. "Load more" pages under the filters the list was fetched with,
 * never under whatever is half-typed in the search box.
 */

export type AdminUsersPhase = "loading" | "loading-more" | "ready" | "error";

export interface AdminUsersFilters {
  readonly query: string;
  readonly status: AdminUserStatus | "";
}

export const ADMIN_USERS_EMPTY_FILTERS: AdminUsersFilters = { query: "", status: "" };

export interface AdminUsersListState {
  readonly generation: number;
  readonly phase: AdminUsersPhase;
  readonly filters: AdminUsersFilters;
  readonly items: readonly AdminUserDto[];
  readonly cursor: AdminUserCursor | null;
  /** An error code, turned into a sentence where it is shown. */
  readonly error: string | null;
}

export const ADMIN_USERS_INITIAL_STATE: AdminUsersListState = {
  generation: 0,
  phase: "loading",
  filters: ADMIN_USERS_EMPTY_FILTERS,
  items: [],
  cursor: null,
  error: null,
};

export type AdminUsersListAction =
  | { type: "search"; generation: number; filters: AdminUsersFilters }
  | { type: "load-more" }
  | { type: "page"; generation: number; append: boolean; page: AdminUserPageDto }
  | { type: "failure"; generation: number; code: string }
  | { type: "replace"; user: AdminUserDto };

/**
 * Whether the next page may be fetched now: there is one, and nothing is in
 * flight. After a failed page the list keeps its cursor, so "load more"
 * retries that same page instead of going dead until a new search.
 */
export function canLoadMore(state: AdminUsersListState): boolean {
  return state.cursor !== null && (state.phase === "ready" || state.phase === "error");
}

function mergeById(
  current: readonly AdminUserDto[],
  incoming: readonly AdminUserDto[],
): AdminUserDto[] {
  const seen = new Set(current.map((user) => user.userId));
  return [...current, ...incoming.filter((user) => !seen.has(user.userId))];
}

export function adminUsersListReducer(
  state: AdminUsersListState,
  action: AdminUsersListAction,
): AdminUsersListState {
  switch (action.type) {
    case "search":
      return {
        generation: action.generation,
        phase: "loading",
        filters: action.filters,
        items: [],
        cursor: null,
        error: null,
      };
    case "load-more":
      if (!canLoadMore(state)) return state;
      return { ...state, phase: "loading-more", error: null };
    case "page":
      if (action.generation !== state.generation) return state;
      return {
        ...state,
        phase: "ready",
        items: action.append ? mergeById(state.items, action.page.items) : action.page.items,
        cursor: action.page.nextCursor,
        error: null,
      };
    case "failure":
      if (action.generation !== state.generation) return state;
      return { ...state, phase: "error", error: action.code };
    case "replace":
      return {
        ...state,
        items: state.items.map((user) => (user.userId === action.user.userId ? action.user : user)),
      };
  }
}
