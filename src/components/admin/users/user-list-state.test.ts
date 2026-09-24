import { describe, expect, test } from "bun:test";
import type { AdminUserDto } from "@/backend/admin/users-contracts";
import {
  ADMIN_USERS_EMPTY_FILTERS,
  ADMIN_USERS_INITIAL_STATE,
  adminUsersListReducer,
  canLoadMore,
} from "./user-list-state";

function user(id: number, banned = false): AdminUserDto {
  return {
    userId: `e8a00000-0000-4000-8000-0000000000${String(id).padStart(2, "0")}`,
    username: `user_${id}`,
    displayName: null,
    maskedEmail: "u***@e***.test",
    emailVerified: true,
    createdAt: "2026-09-24T12:00:00+00:00",
    lastSignInAt: null,
    onboardingCompleted: true,
    deleted: false,
    deletionRequested: false,
    isStaff: false,
    activeBan: banned
      ? {
          banId: "e8a40000-0000-4000-8000-000000000001",
          startsAt: "2026-09-24T12:00:00+00:00",
          endsAt: null,
          reason: "Fixture ban reason.",
        }
      : null,
  };
}

const CURSOR = { createdAt: "2026-09-24T12:00:00+00:00", id: user(2).userId };

describe("user directory list state", () => {
  test("an answer to an older search is dropped", () => {
    let state = adminUsersListReducer(ADMIN_USERS_INITIAL_STATE, {
      type: "search",
      generation: 1,
      filters: ADMIN_USERS_EMPTY_FILTERS,
    });
    state = adminUsersListReducer(state, {
      type: "search",
      generation: 2,
      filters: { query: "karim", status: "" },
    });
    state = adminUsersListReducer(state, {
      type: "page",
      generation: 1,
      append: false,
      page: { items: [user(1)], nextCursor: null },
    });
    expect(state.items).toEqual([]);
    expect(state.phase).toBe("loading");
  });

  test("load more appends without repeating an account", () => {
    let state = adminUsersListReducer(ADMIN_USERS_INITIAL_STATE, {
      type: "search",
      generation: 1,
      filters: ADMIN_USERS_EMPTY_FILTERS,
    });
    state = adminUsersListReducer(state, {
      type: "page",
      generation: 1,
      append: false,
      page: { items: [user(1), user(2)], nextCursor: CURSOR },
    });
    state = adminUsersListReducer(state, { type: "load-more" });
    expect(state.phase).toBe("loading-more");
    state = adminUsersListReducer(state, {
      type: "page",
      generation: 1,
      append: true,
      page: { items: [user(2), user(3)], nextCursor: null },
    });
    expect(state.items.map((item) => item.username)).toEqual(["user_1", "user_2", "user_3"]);
    expect(state.cursor).toBeNull();
    expect(adminUsersListReducer(state, { type: "load-more" })).toBe(state);
  });

  test("a failed page can be retried with load more", () => {
    let state = adminUsersListReducer(ADMIN_USERS_INITIAL_STATE, {
      type: "search",
      generation: 1,
      filters: ADMIN_USERS_EMPTY_FILTERS,
    });
    state = adminUsersListReducer(state, {
      type: "page",
      generation: 1,
      append: false,
      page: { items: [user(1), user(2)], nextCursor: CURSOR },
    });
    state = adminUsersListReducer(state, { type: "load-more" });
    state = adminUsersListReducer(state, { type: "failure", generation: 1, code: "load_failed" });
    expect(state.phase).toBe("error");
    expect(state.cursor).toEqual(CURSOR);
    expect(state.items).toHaveLength(2);
    expect(canLoadMore(state)).toBe(true);

    state = adminUsersListReducer(state, { type: "load-more" });
    expect(state.phase).toBe("loading-more");
    expect(state.error).toBeNull();
    state = adminUsersListReducer(state, {
      type: "page",
      generation: 1,
      append: true,
      page: { items: [user(3)], nextCursor: null },
    });
    expect(state.items.map((item) => item.username)).toEqual(["user_1", "user_2", "user_3"]);
    expect(canLoadMore(state)).toBe(false);
  });

  test("nothing loads more while a page is in flight or after the last one", () => {
    const inFlight = {
      ...ADMIN_USERS_INITIAL_STATE,
      phase: "loading-more" as const,
      cursor: CURSOR,
    };
    expect(canLoadMore(inFlight)).toBe(false);
    expect(
      canLoadMore({ ...ADMIN_USERS_INITIAL_STATE, phase: "loading" as const, cursor: CURSOR }),
    ).toBe(false);
    expect(
      canLoadMore({ ...ADMIN_USERS_INITIAL_STATE, phase: "error" as const, cursor: null }),
    ).toBe(false);
  });

  test("a failure keeps its code for the page to word", () => {
    let state = adminUsersListReducer(ADMIN_USERS_INITIAL_STATE, {
      type: "search",
      generation: 3,
      filters: ADMIN_USERS_EMPTY_FILTERS,
    });
    state = adminUsersListReducer(state, {
      type: "failure",
      generation: 3,
      code: "users_admin_unavailable",
    });
    expect(state.phase).toBe("error");
    expect(state.error).toBe("users_admin_unavailable");
  });

  test("a changed account replaces its row in place", () => {
    let state = adminUsersListReducer(ADMIN_USERS_INITIAL_STATE, {
      type: "page",
      generation: 0,
      append: false,
      page: { items: [user(1), user(2)], nextCursor: null },
    });
    state = adminUsersListReducer(state, { type: "replace", user: user(2, true) });
    expect(state.items[1].activeBan).not.toBeNull();
    expect(state.items[0].activeBan).toBeNull();
  });
});
