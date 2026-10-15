import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { forgetAccountQueries, queryKeyNamesAccount } from "@/auth/account-queries";
import {
  focusTargetAfterRemoval,
  removedSavedIds,
  savedCollectionEnabled,
  savedCollectionPhase,
  savedCollectionQueryKey,
  savedEntryId,
  visibleSavedEntries,
  type SavedEntry,
} from "./saved-collection";
import type { Article } from "@/types/domain";

/**
 * Audit UX-001: the reading list. The rules that make it a list of THIS
 * reader's stories, that an unsave shows at once, and that a reader with no
 * account never gets a cached list.
 */

const ALICE = "11111111-aaaa-4aaa-8aaa-111111111111";
const BOB = "22222222-bbbb-4bbb-8bbb-222222222222";

function article(id: string): Article {
  return {
    id,
    language: "fr",
    title: { fr: `Titre ${id}`, ar: `Titre ${id}` },
    excerpt: { fr: "Résumé", ar: "Résumé" },
    category: "latest",
    clubIds: [],
    authorName: { fr: "BotolaGO", ar: "BotolaGO" },
    publishedAt: "2026-10-01T10:00:00.000Z",
    readMinutes: 2,
    heroGradient: "var(--ui-grad-action)",
  };
}

const row = (id: string): SavedEntry => ({ kind: "article", article: article(id) });
const gone = (id: string): SavedEntry => ({ kind: "unavailable", id });

describe("unsaving from the collection", () => {
  const entries = [row("a"), row("b"), gone("c"), row("d")];

  test("shows every row while the reader's saved ids are still unknown", () => {
    // A list that blanked while its own ids loaded would read as "nothing saved".
    expect(visibleSavedEntries(entries, [], false).map(savedEntryId)).toEqual(["a", "b", "c", "d"]);
  });

  test("drops a row the moment its id leaves the saved set, and only that row", () => {
    const ids = ["a", "b", "c", "d"];
    expect(visibleSavedEntries(entries, ids, true)).toHaveLength(4);
    expect(
      visibleSavedEntries(
        entries,
        ids.filter((id) => id !== "b"),
        true,
      ).map(savedEntryId),
    ).toEqual(["a", "c", "d"]);
  });

  test("brings the row back when a refused unsave rolls the ids back", () => {
    const afterUnsave = visibleSavedEntries(entries, ["a", "c", "d"], true);
    expect(afterUnsave.map(savedEntryId)).not.toContain("b");
    const afterRollback = visibleSavedEntries(entries, ["a", "b", "c", "d"], true);
    expect(afterRollback.map(savedEntryId)).toContain("b");
  });

  test("removes a story that is gone the same way as any other", () => {
    expect(visibleSavedEntries(entries, ["a", "b", "d"], true).map(savedEntryId)).toEqual([
      "a",
      "b",
      "d",
    ]);
  });

  test("empties the list when the last story is unsaved", () => {
    expect(visibleSavedEntries([row("a")], [], true)).toEqual([]);
  });
});

describe("whose list it is", () => {
  test("the cache key names the account, so each account has its own entry", () => {
    const alice = [...savedCollectionQueryKey(ALICE), "supabase", "account"];
    const bob = [...savedCollectionQueryKey(BOB), "supabase", "account"];
    expect(alice).not.toEqual(bob);
    expect(queryKeyNamesAccount(alice, ALICE)).toBe(true);
    expect(queryKeyNamesAccount(alice, BOB)).toBe(false);
    expect(queryKeyNamesAccount(bob, ALICE)).toBe(false);
  });

  test("signing out or switching accounts forgets the leaving account's list only", () => {
    const client = new QueryClient();
    const aliceKey = [...savedCollectionQueryKey(ALICE), "supabase", "account"];
    const bobKey = [...savedCollectionQueryKey(BOB), "supabase", "account"];
    client.setQueryData(aliceKey, { pages: [{ entries: [row("alice-only")], nextCursor: null }] });
    client.setQueryData(bobKey, { pages: [{ entries: [row("bob-only")], nextCursor: null }] });

    // Alice leaves this device; Bob has signed in.
    forgetAccountQueries(client, ALICE);

    expect(client.getQueryData(aliceKey)).toBeUndefined();
    expect(client.getQueryData(bobKey)).toBeDefined();
  });

  test("a reader with no account shares no entry with any account", () => {
    const anonymous = savedCollectionQueryKey(null);
    expect(queryKeyNamesAccount(anonymous, ALICE)).toBe(false);
    expect(queryKeyNamesAccount(anonymous, BOB)).toBe(false);
  });

  test("in production it is fetched only for a signed-in account", () => {
    for (const status of [
      "loading",
      "guest",
      "anonymous",
      "mfa_required",
      "mfa_unconfirmed",
    ] as const) {
      expect({ status, enabled: savedCollectionEnabled("supabase", status, true) }).toEqual({
        status,
        enabled: false,
      });
    }
    expect(savedCollectionEnabled("supabase", "authenticated", false)).toBe(true);
  });

  test("in preview mode the device's own list is read once it is loaded", () => {
    expect(savedCollectionEnabled("mock", "guest", false)).toBe(false);
    expect(savedCollectionEnabled("mock", "guest", true)).toBe(true);
  });
});

describe("the page's state", () => {
  const base = {
    mode: "supabase" as const,
    status: "authenticated" as const,
    isError: false,
    hasData: false,
    isFetching: false,
  };

  test("waits while the session is still resolving", () => {
    expect(savedCollectionPhase({ ...base, status: "loading" })).toBe("loading");
  });

  test("asks anyone without a signed-in account to sign in (production)", () => {
    for (const status of ["guest", "anonymous", "mfa_required", "mfa_unconfirmed"] as const) {
      expect(savedCollectionPhase({ ...base, status })).toBe("signin");
    }
  });

  test("a failed first read is an error, whatever the account", () => {
    expect(savedCollectionPhase({ ...base, isError: true })).toBe("error");
  });

  test("a retry in flight is loading again, not a stuck error", () => {
    expect(savedCollectionPhase({ ...base, isError: true, isFetching: true })).toBe("loading");
  });

  test("a failure after rows were loaded keeps the rows", () => {
    expect(savedCollectionPhase({ ...base, isError: true, hasData: true })).toBe("ready");
  });

  test("is loading until the first answer, then ready", () => {
    expect(savedCollectionPhase({ ...base, isFetching: true })).toBe("loading");
    expect(savedCollectionPhase({ ...base, hasData: true })).toBe("ready");
  });

  test("preview mode never asks for sign-in", () => {
    expect(savedCollectionPhase({ ...base, mode: "mock", status: "guest", hasData: true })).toBe(
      "ready",
    );
  });
});

describe("a row removed under the reader's focus", () => {
  const before = ["a", "b", "c", "d"];

  test("lists what was removed", () => {
    expect(removedSavedIds(before, ["a", "c", "d"])).toEqual(["b"]);
    expect(removedSavedIds(before, before)).toEqual([]);
    expect(removedSavedIds(before, [])).toEqual(before);
  });

  test("focus goes to the next surviving row", () => {
    expect(focusTargetAfterRemoval(before, ["a", "c", "d"], "b")).toBe("c");
    expect(focusTargetAfterRemoval(before, ["a", "d"], "b")).toBe("d");
  });

  test("the last row hands focus to the one before it", () => {
    expect(focusTargetAfterRemoval(before, ["a", "b", "c"], "d")).toBe("c");
  });

  test("with no row left, there is no target (the container takes focus)", () => {
    expect(focusTargetAfterRemoval(["a"], [], "a")).toBeNull();
    expect(focusTargetAfterRemoval(before, ["a"], "z")).toBeNull();
  });
});
