import { beforeEach, describe, expect, it } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import "./__test-shim";

import {
  clearOwnedFantasyCacheExcept,
  fantasyKeyOwner,
  scopedFantasyKey,
} from "./fantasy-data-source";
import { fantasyDraftsStore } from "./fantasy-drafts-store";
import { cleanupOwnedFantasyOnSignOut } from "./fantasy-signout-cleanup";

/**
 * The Fantasy screens that stayed on "Loading…" for good.
 *
 * When the signed-in identity changes, the render that follows already starts
 * the incoming owner's queries — `useQuery` builds the query and fetches it
 * during that render — and only then do the cleanup effects run. Those effects
 * used to remove EVERY owned entry, the incoming one included. Removing a query
 * cancels its fetch without a word to the observer waiting on it, so the
 * observer reported `isLoading: true` indefinitely and FantasyScreenGate showed
 * its spinner until something else happened to re-render the provider. Seen
 * reliably on a fresh signed-in load of /fantasy/leagues/$leagueId and
 * /fantasy/rankings in Arabic, where nothing did.
 *
 * Each case below reproduces that order exactly — observer subscribed (the
 * render), then the cleanup (the effect), then the answer arrives — against a
 * real QueryClient, and asserts the screen would leave its loading state.
 */

function inFlight(qc: QueryClient, key: ReadonlyArray<unknown>) {
  let resolve!: (value: { owner: string }) => void;
  const observer = new QueryObserver(qc, {
    queryKey: key,
    queryFn: () =>
      new Promise<{ owner: string }>((done) => {
        resolve = done;
      }),
  });
  const unsubscribe = observer.subscribe(() => {});
  return { observer, unsubscribe, answer: (value: { owner: string }) => resolve(value) };
}

const settle = () => new Promise((done) => setTimeout(done, 10));

describe("identity change keeps the incoming owner's in-flight queries", () => {
  let qc: QueryClient;
  beforeEach(() => {
    fantasyDraftsStore.__resetAll();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("sign-in: the new manager's snapshot and page queries still resolve", async () => {
    const guest = scopedFantasyKey({ source: "guest", owner: "__local__" }, "snapshot");
    qc.setQueryData(guest, { owner: "guest" });
    const snapshot = inFlight(qc, scopedFantasyKey({ source: "cloud", owner: "u1" }, "snapshot"));
    const league = inFlight(qc, scopedFantasyKey({ source: "cloud", owner: "u1" }, "league", "l1"));
    expect(snapshot.observer.getCurrentResult().isLoading).toBe(true);

    // FantasyOwnedProvider's effect for the new owner.
    clearOwnedFantasyCacheExcept(qc, "u1");

    snapshot.answer({ owner: "u1" });
    league.answer({ owner: "u1" });
    await settle();
    expect(snapshot.observer.getCurrentResult().isLoading).toBe(false);
    expect(snapshot.observer.getCurrentResult().data).toEqual({ owner: "u1" });
    expect(league.observer.getCurrentResult().data).toEqual({ owner: "u1" });
    expect(qc.getQueryData(guest)).toBeUndefined();
    snapshot.unsubscribe();
    league.unsubscribe();
  });

  it("sign-out: the manager's data goes, the guest's snapshot still resolves", async () => {
    const manager = scopedFantasyKey({ source: "cloud", owner: "u1" }, "snapshot");
    qc.setQueryData(manager, { owner: "u1" });
    fantasyDraftsStore.save({ uid: "u1", teamId: "new", baseVersion: 0, kind: "team" }, { a: 1 });
    const guest = inFlight(
      qc,
      scopedFantasyKey({ source: "guest", owner: "__local__" }, "snapshot"),
    );

    // Both effects that run on sign-out, child first as React orders them.
    clearOwnedFantasyCacheExcept(qc, "__local__");
    cleanupOwnedFantasyOnSignOut({
      qc,
      uid: "u1",
      keepOwner: fantasyKeyOwner({ authMode: "supabase", userId: null }),
    });

    guest.answer({ owner: "guest" });
    await settle();
    expect(guest.observer.getCurrentResult().isLoading).toBe(false);
    expect(guest.observer.getCurrentResult().data).toEqual({ owner: "guest" });
    expect(qc.getQueryData(manager)).toBeUndefined();
    expect(fantasyDraftsStore.listForUid("u1")).toEqual([]);
    guest.unsubscribe();
  });

  it("account switch: the first account's data goes, the second's resolves", async () => {
    const first = scopedFantasyKey({ source: "cloud", owner: "u1" }, "snapshot");
    qc.setQueryData(first, { owner: "u1" });
    const second = inFlight(qc, scopedFantasyKey({ source: "cloud", owner: "u2" }, "snapshot"));

    clearOwnedFantasyCacheExcept(qc, "u2");
    cleanupOwnedFantasyOnSignOut({
      qc,
      uid: "u1",
      keepOwner: fantasyKeyOwner({ authMode: "supabase", userId: "u2" }),
    });

    second.answer({ owner: "u2" });
    await settle();
    expect(second.observer.getCurrentResult().data).toEqual({ owner: "u2" });
    expect(qc.getQueryData(first)).toBeUndefined();
    second.unsubscribe();
  });
});

describe("fantasyKeyOwner", () => {
  it("is the user id only for a signed-in Supabase manager", () => {
    expect(fantasyKeyOwner({ authMode: "supabase", userId: "u1" })).toBe("u1");
    expect(fantasyKeyOwner({ authMode: "supabase", userId: null })).toBe("__local__");
  });

  it("is the local pseudo-owner in mock mode, signed in or not", () => {
    expect(fantasyKeyOwner({ authMode: "mock", userId: "u1" })).toBe("__local__");
    expect(fantasyKeyOwner({ authMode: "mock", userId: null })).toBe("__local__");
  });
});
