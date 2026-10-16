import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { QueryClient, QueryObserver, hashKey } from "@tanstack/react-query";

import {
  forgetAccount,
  forgetAccountQueries,
  forgetViewerSavedMarks,
  queryKeyNamesAccount,
  watchAccountSwitch,
} from "./account-queries";
import { planSavedToggle, savedStateOf, type SavedIdsSnapshot } from "@/lib/saved-collection";
import type { AuthSession } from "@/services/auth-types";
import { followedTeamIdsQuery, followedTeamIdsQueryKey } from "@/services/follows";
import { notificationPreferencesQueryKey } from "@/services/use-notification-preferences";
import { scopedFantasyKey } from "@/services/fantasy-data-source";

// Audit 2026-09-25, A06: followed clubs were cached under the auth STATUS, so
// account A and account B on the same phone shared one entry. B saw A's clubs,
// and the follow button, reading them, offered to "unfollow" a club B never
// followed. A's answer still in flight at the switch landed in that shared
// entry too.

const A = "10000000-0000-4000-8000-00000000000a";
const B = "10000000-0000-4000-8000-00000000000b";
const WYDAD = "20000000-0000-4000-8000-000000000001";

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("followed clubs across an account switch", () => {
  it("keys each account's follows apart", () => {
    expect(hashKey(followedTeamIdsQueryKey(A))).not.toBe(hashKey(followedTeamIdsQueryKey(B)));
    expect(followedTeamIdsQuery(A).queryKey).toEqual(followedTeamIdsQueryKey(A));
    // Nobody signed in (or a second factor still owed): no entry is asked for.
    expect(followedTeamIdsQuery(null).enabled).toBe(false);
  });

  it("A follows a club, signs out; B, who follows nothing, never sees A's club", async () => {
    const qc = client();
    await qc.fetchQuery({ queryKey: followedTeamIdsQueryKey(A), queryFn: async () => [WYDAD] });

    // A signs out: AuthProvider's cleanup for the outgoing account.
    forgetAccountQueries(qc, A);

    // B signs in. Before B's own answer arrives there is nothing to show...
    expect(qc.getQueryData(followedTeamIdsQueryKey(B))).toBeUndefined();
    // ...and B's answer is B's.
    expect(
      await qc.fetchQuery({ queryKey: followedTeamIdsQueryKey(B), queryFn: async () => [] }),
    ).toEqual([]);
    expect(qc.getQueryData(followedTeamIdsQueryKey(A))).toBeUndefined();
  });

  it("A's answer that arrives after the switch lands nowhere", async () => {
    const qc = client();
    const lateA = deferred<string[]>();
    // A's screen asked; the answer is slow.
    const observerA = new QueryObserver(qc, {
      queryKey: followedTeamIdsQueryKey(A),
      queryFn: () => lateA.promise,
    });
    const unsubscribeA = observerA.subscribe(() => {});
    expect(qc.getQueryState(followedTeamIdsQueryKey(A))?.fetchStatus).toBe("fetching");

    // A signs out and B signs in: the screen moves to B's key, and the
    // cleanup runs for A.
    unsubscribeA();
    const observerB = new QueryObserver(qc, {
      queryKey: followedTeamIdsQueryKey(B),
      queryFn: async () => [] as string[],
    });
    const seenByB: unknown[] = [];
    const unsubscribeB = observerB.subscribe((result) => seenByB.push(result.data));
    forgetAccountQueries(qc, A);

    // Now A's answer finally comes back.
    lateA.resolve([WYDAD]);
    await settle();
    await settle();

    expect(qc.getQueryData(followedTeamIdsQueryKey(B))).toEqual([]);
    expect(qc.getQueryData(followedTeamIdsQueryKey(A))).toBeUndefined();
    expect(seenByB.flat()).not.toContain(WYDAD);
    const cachedAnywhere = qc
      .getQueryCache()
      .getAll()
      .some((query) => JSON.stringify(query.state.data ?? null).includes(WYDAD));
    expect(cachedAnywhere).toBe(false);
    unsubscribeB();
  });
});

describe("forgetAccountQueries", () => {
  it("removes every entry that names the outgoing account, and only those", () => {
    const qc = client();
    const outgoing = [
      followedTeamIdsQueryKey(A),
      notificationPreferencesQueryKey(A),
      ["news", "saved-article-ids", A],
      ["predictions", "mine", A, 3],
      ["predictions", "board", "season", "season", A],
      scopedFantasyKey({ source: "cloud", owner: A }, "summary"),
    ];
    const kept = [
      followedTeamIdsQueryKey(B),
      notificationPreferencesQueryKey(B),
      scopedFantasyKey({ source: "cloud", owner: B }, "summary"),
      ["football", "clubs", "fr"],
      ["predictions", "round", "current", "fr"],
      ["news", "home-modules-v2", "fr"],
    ];
    for (const key of [...outgoing, ...kept]) qc.setQueryData(key, { cached: true });

    forgetAccountQueries(qc, A);

    for (const key of outgoing)
      expect({ key, data: qc.getQueryData(key) }).toEqual({ key, data: undefined });
    for (const key of kept)
      expect({ key, data: qc.getQueryData(key) }).toEqual({ key, data: { cached: true } });
  });

  it("reads an account id as a whole key part, not a substring", () => {
    expect(queryKeyNamesAccount(["identity", "followed-team-ids", A], A)).toBe(true);
    expect(queryKeyNamesAccount(["news", "article", `${A}-slug`], A)).toBe(false);
  });

  it("forgets the Transfers preview, which a team id alone left behind", () => {
    // The key shape `/fantasy/transfers` builds (pinned below): root, account,
    // team, version, the pairs, the chip.
    const TEAM_A = "30000000-0000-4000-8000-00000000000a";
    const TEAM_B = "30000000-0000-4000-8000-00000000000b";
    const preview = (uid: string, team: string) => [
      "fantasy-transfer-preview",
      uid,
      team,
      4,
      "p1:p2",
      null,
    ];
    const qc = client();
    qc.setQueryData(preview(A, TEAM_A), { transferCount: 1 });
    qc.setQueryData(preview(B, TEAM_B), { transferCount: 2 });
    // What the key used to be: nothing in it names the account.
    qc.setQueryData(["fantasy-transfer-preview", TEAM_A, 4, "p1:p2", null], { transferCount: 1 });

    forgetAccountQueries(qc, A);

    expect(qc.getQueryData(preview(A, TEAM_A))).toBeUndefined();
    expect(qc.getQueryData(preview(B, TEAM_B))).toEqual({ transferCount: 2 });
    expect(qc.getQueryData(["fantasy-transfer-preview", TEAM_A, 4, "p1:p2", null])).toEqual({
      transferCount: 1,
    });
  });
});

// Security review of 2026-09-25: `forgetAccount` runs from AuthProvider's
// effect, after the render that switched accounts. Its Fantasy step removed
// every owned-Fantasy entry and its Pronostics step every Pronostics entry --
// the ones that render had just built for B included -- so B's reads were
// cancelled and B's screens sat on their loading placeholders for good.
describe("forgetAccount on a switch from A to B", () => {
  it("forgets A, and every screen B has already opened gets its answer", async () => {
    const qc = client();
    // What A's screens had.
    const ofA = [
      scopedFantasyKey({ source: "cloud", owner: A }, "summary"),
      ["predictions", "mine", A, 14],
      followedTeamIdsQueryKey(A),
    ];
    for (const key of ofA) qc.setQueryData(key, { owner: "A" });
    qc.setQueryData(["predictions", "round", "current", "fr"], { owner: "A" });

    // B's screens, already asking: B's own Fantasy, Pronostics and follows,
    // the journée (no account in its key) and a visitor-scoped board.
    const ofB = [
      scopedFantasyKey({ source: "cloud", owner: B }, "summary"),
      scopedFantasyKey({ source: "guest", owner: "__local__" }, "rankings", "overall", 1),
      ["predictions", "mine", B, 14],
      ["predictions", "round", "current", "fr"],
      followedTeamIdsQueryKey(B),
    ];
    const answers = new Map<string, () => void>();
    const observers = ofB.map(
      (queryKey) =>
        new QueryObserver(qc, {
          queryKey,
          staleTime: Infinity,
          queryFn: () =>
            new Promise((resolve) => answers.set(hashKey(queryKey), () => resolve({ owner: "B" }))),
        }),
    );
    const stops = observers.map((observer) => observer.subscribe(() => {}));

    forgetAccount(qc, A);

    for (const answer of answers.values()) answer();
    await settle();
    await settle();
    expect(
      observers.map((observer) => {
        const { status, data } = observer.getCurrentResult();
        return { status, data };
      }),
    ).toEqual(ofB.map(() => ({ status: "success", data: { owner: "B" } })));
    for (const key of ofA)
      expect({ key, data: qc.getQueryData(key) }).toEqual({ key, data: undefined });
    const heldForA = qc
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.state.data ?? null).includes('"A"'));
    expect(heldForA.map((query) => query.queryKey)).toEqual([]);
    stops.forEach((stop) => stop());
  });
});

describe("no personal query is keyed by the auth status", () => {
  const src = join(import.meta.dir, "..");

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("no query key anywhere in src/ is built from `status`", () => {
    const offenders = sources(src).filter((file) =>
      /queryKey:\s*\[[^\]]*\b(status|authStatus)\b/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => relative(src, file))).toEqual([]);
  });

  it("the followed-clubs key is spelled in one place, which includes the account", () => {
    const spelled = sources(src).filter((file) =>
      readFileSync(file, "utf8").includes('"followed-team-ids"'),
    );
    expect(spelled.map((file) => relative(src, file))).toEqual(["services/follows.ts"]);
  });

  it("the Transfers preview key names the account, right after its root", () => {
    // Scoped by the team alone, it outlived a sign-out and a switch: the
    // forgetting above looks for the account's id, and a team id is not it.
    const spelled = sources(src).filter((file) =>
      readFileSync(file, "utf8").includes('"fantasy-transfer-preview"'),
    );
    expect(spelled.map((file) => relative(src, file))).toEqual(["routes/fantasy.transfers.tsx"]);
    const transfers = readFileSync(join(src, "routes/fantasy.transfers.tsx"), "utf8");
    const key = /queryKey:\s*\[\s*"fantasy-transfer-preview",\s*([^,\s]+),/.exec(transfers);
    expect(key?.[1]).toBe("owned.userId");
  });

  it("AuthProvider hands every session to the account watcher, which forgets through forgetAccount", () => {
    // The watcher and the cleanup run for real in `watchAccountSwitch` below
    // and, fed by the real auth service, in `auth-supabase.mfa.test.ts`. This
    // only pins that the provider is the one feeding them.
    const provider = readFileSync(join(src, "auth/AuthProvider.tsx"), "utf8");
    expect(provider).toContain("watchAccountSwitch((uid) => forgetAccount(qc, uid))");
    expect(provider).toContain("watchAccount(session);");
  });
});

describe("watchAccountSwitch", () => {
  const signedIn = (id: string) =>
    ({ user: { id } as AuthSession["user"], status: "authenticated" }) as AuthSession;
  const owing = (id: string): AuthSession => ({
    user: null,
    status: "mfa_required",
    pendingAccountId: id,
  });
  const anonymous: AuthSession = { user: null, status: "anonymous" };

  function run(sessions: AuthSession[]): string[] {
    const left: string[] = [];
    const watch = watchAccountSwitch((uid) => left.push(uid));
    for (const session of sessions) watch(session);
    return left;
  }

  it("forgets the account on sign-out and on a switch, once each", () => {
    expect(run([signedIn(A), anonymous, signedIn(B)])).toEqual([A]);
    expect(run([signedIn(A), signedIn(B), anonymous])).toEqual([A, B]);
    expect(run([signedIn(A), signedIn(A), signedIn(A)])).toEqual([]);
  });

  it("does not forget an account for owing its code, and does once it really leaves", () => {
    expect(run([signedIn(A), owing(A), signedIn(A)])).toEqual([]);
    expect(run([signedIn(A), owing(A), anonymous])).toEqual([A]);
    expect(run([signedIn(A), owing(B)])).toEqual([A]);
    expect(run([owing(A), signedIn(B)])).toEqual([A]);
  });

  it("starts from nobody: the first session forgets nothing", () => {
    expect(run([{ user: null, status: "loading" }, signedIn(A)])).toEqual([]);
  });
});

// Follow-up of audit remediation Phase D, "public News caches are not kept per
// account". The News reads in the browser go out with the signed-in reader's
// session, so every article they return carries THAT reader's `isSaved`; but
// they are cached under public keys (`["news", "feed-v2", lang, ...]`) that
// name no account. After A signed out and B signed in, B read A's marks from
// those entries. They count only for a reader whose saved ids are partial
// (more than 2,000 saves: `savedStateOf` falls back to the story's own answer),
// which is the one case where B's screen showed A's bookmark.
describe("public News caches across an account switch", () => {
  const STORY = "30000000-0000-4000-8000-000000000001";
  const OTHER = "30000000-0000-4000-8000-000000000002";
  const card = (id: string, isSaved: boolean) => ({
    id,
    title: `Titre ${id}`,
    isSaved,
    tags: [{ id: "t", slug: "s", name: "S" }],
  });
  const FEED_KEY = ["news", "feed-v2", "fr", null, null] as const;
  const DETAIL_KEY = ["news", "article-detail-v2", "fr", STORY] as const;
  const HOME_KEY = ["news", "home-modules-v2", "fr"] as const;

  /** A is signed in and reads News: the answers come back marked for A. */
  function newsReadAs(qc: QueryClient) {
    qc.setQueryData(FEED_KEY, {
      pages: [{ items: [card(STORY, true), card(OTHER, false)], nextCursor: null }],
      pageParams: [null],
    });
    qc.setQueryData(DETAIL_KEY, { ...card(STORY, true), bodyHtml: "<p>x</p>" });
    qc.setQueryData(HOME_KEY, {
      lead: card(STORY, true),
      featured: [],
      latest: [card(OTHER, false)],
    });
  }

  const signedIn = (id: string): AuthSession => ({
    user: { id } as AuthSession["user"],
    status: "authenticated",
  });
  const marked = (qc: QueryClient) =>
    qc
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.state.data ?? null).includes('"isSaved":true'))
      .map((query) => query.queryKey);

  it("A signs out: no cached News answer still says a story is saved", () => {
    const qc = client();
    newsReadAs(qc);
    const watch = watchAccountSwitch((uid) => forgetAccount(qc, uid));
    watch(signedIn(A));
    watch({ user: null, status: "anonymous" });
    expect(marked(qc)).toEqual([]);
  });

  it("B, with more than 2,000 saves, does not see A's bookmark on a card it has not read", () => {
    const qc = client();
    newsReadAs(qc);
    const watch = watchAccountSwitch((uid) => forgetAccount(qc, uid));
    watch(signedIn(A));
    watch(signedIn(B));

    // B's saved ids are the newest 2,000 and do not name STORY.
    const bobIds: SavedIdsSnapshot = { ids: [OTHER], complete: false, removed: [] };
    const feed = qc.getQueryData<{ pages: { items: { id: string; isSaved: boolean }[] }[] }>(
      FEED_KEY,
    );
    const cachedMark = feed?.pages[0]?.items.find((item) => item.id === STORY)?.isSaved;
    expect(savedStateOf(bobIds, STORY, cachedMark)).not.toBe(true);
    // A tap on it asks the server rather than guessing from the cache.
    expect(planSavedToggle(bobIds, STORY)).toBe("ask");
  });

  it("clears a mark to unknown, not to a confirmed false: both accounts saved the story, B's ids are partial", () => {
    const qc = client();
    // A and B both saved STORY; the feed was read as A, so it says isSaved: true.
    newsReadAs(qc);
    const watch = watchAccountSwitch((uid) => forgetAccount(qc, uid));
    watch(signedIn(A));
    watch(signedIn(B));

    // B has more than 2,000 saves: the ids are partial and do not hold STORY.
    const bobIds: SavedIdsSnapshot = { ids: [OTHER], complete: false, removed: [] };
    const feed = qc.getQueryData<{ pages: { items: Record<string, unknown>[] }[] }>(FEED_KEY);
    const cleaned = feed?.pages[0]?.items.find((item) => item.id === STORY);
    expect(cleaned).toBeDefined();
    expect("isSaved" in (cleaned ?? {})).toBe(false);

    // Unknown (null), so the bookmark asks the server; a rewritten false would
    // be trusted here and show a story B did save as unsaved.
    expect(savedStateOf(bobIds, STORY, cleaned?.isSaved as boolean | undefined)).toBeNull();
    expect(planSavedToggle(bobIds, STORY)).toBe("ask");
  });

  it("keeps everything else about the cached answers, and leaves other keys alone", () => {
    const qc = client();
    newsReadAs(qc);
    qc.setQueryData(["football", "clubs", "fr"], [{ id: "c", isSaved: true }]);
    forgetAccount(qc, A);
    expect(qc.getQueryData<{ title: string; bodyHtml: string }>(DETAIL_KEY)).toMatchObject({
      title: `Titre ${STORY}`,
      bodyHtml: "<p>x</p>",
    });
    const feed = qc.getQueryData<{ pages: { items: { id: string }[] }[] }>(FEED_KEY);
    expect(feed?.pages[0]?.items.map((item) => item.id)).toEqual([STORY, OTHER]);
    expect(qc.getQueryData(["football", "clubs", "fr"])).toEqual([{ id: "c", isSaved: true }]);
  });

  it("does not touch what a signed-out visitor already holds, nor strand a mounted screen", async () => {
    const qc = client();
    const visitor = { lead: card(STORY, false), featured: [], latest: [] };
    qc.setQueryData(HOME_KEY, visitor);
    let fetches = 0;
    const observer = new QueryObserver(qc, {
      queryKey: HOME_KEY,
      queryFn: async () => ((fetches += 1), visitor),
      staleTime: Infinity,
    });
    const seen: unknown[] = [];
    const unsubscribe = observer.subscribe((result) => seen.push(result.data));
    forgetAccount(qc, A);
    await settle();
    // Same object (nothing changed, so nothing was rewritten), no refetch, no
    // moment without data.
    expect(qc.getQueryData(HOME_KEY)).toBe(visitor);
    expect(fetches).toBe(0);
    expect(seen.every((data) => data !== undefined)).toBe(true);
    unsubscribe();
  });

  it("keeps a mounted screen on its data when it has to rewrite a mark", async () => {
    const qc = client();
    newsReadAs(qc);
    const observer = new QueryObserver(qc, {
      queryKey: DETAIL_KEY,
      queryFn: async () => card(STORY, false),
      staleTime: Infinity,
    });
    const seen: unknown[] = [];
    const unsubscribe = observer.subscribe((result) => seen.push(result.data));
    forgetAccount(qc, A);
    await settle();
    expect(seen.every((data) => data !== undefined)).toBe(true);
    const shown = observer.getCurrentResult().data as Record<string, unknown>;
    expect(shown).toMatchObject({ id: STORY });
    expect("isSaved" in shown).toBe(false);
    unsubscribe();
  });

  it("does not rewrite the saved collection or the saved ids: those are keyed by account and removed by it", () => {
    const qc = client();
    const collectionOf = (id: string) => [
      { kind: "article" as const, article: card(STORY, true) },
      { kind: "unavailable" as const, id: `${id}-gone` },
    ];
    const idsOf = (): SavedIdsSnapshot => ({ ids: [STORY], complete: true, removed: [] });
    const keys = {
      collectionA: ["news", "saved-collection", A] as const,
      idsA: ["news", "saved-article-ids", A] as const,
      collectionB: ["news", "saved-collection", B] as const,
      idsB: ["news", "saved-article-ids", B] as const,
    };
    const held = {
      collectionA: collectionOf("a"),
      idsA: idsOf(),
      collectionB: collectionOf("b"),
      idsB: idsOf(),
    };
    qc.setQueryData(keys.collectionA, held.collectionA);
    qc.setQueryData(keys.idsA, held.idsA);
    qc.setQueryData(keys.collectionB, held.collectionB);
    qc.setQueryData(keys.idsB, held.idsB);
    newsReadAs(qc);

    // The rewrite alone must leave all four untouched: the very same objects,
    // still marked saved (they are those accounts' own answers, not a
    // reader's view of public News), while the public caches are cleaned.
    forgetViewerSavedMarks(qc);
    expect(qc.getQueryData(keys.collectionA)).toBe(held.collectionA);
    expect(qc.getQueryData(keys.idsA)).toBe(held.idsA);
    expect(qc.getQueryData(keys.collectionB)).toBe(held.collectionB);
    expect(qc.getQueryData(keys.idsB)).toBe(held.idsB);
    expect(marked(qc)).toEqual([keys.collectionA, keys.collectionB]);
    expect(qc.getQueryData<{ isSaved?: boolean }>(DETAIL_KEY)?.isSaved).toBeUndefined();

    // The outgoing account's entries go by their account id, whole; the
    // account that stays keeps its own, still marked.
    forgetAccount(qc, A);
    expect(qc.getQueryData(keys.collectionA)).toBeUndefined();
    expect(qc.getQueryData(keys.idsA)).toBeUndefined();
    expect(qc.getQueryData(keys.collectionB)).toBe(held.collectionB);
    expect(qc.getQueryData(keys.idsB)).toBe(held.idsB);
  });

  it("keeps the age of every answer it rewrites", () => {
    const qc = client();
    newsReadAs(qc);
    const OLD = 1_700_000_000_000;
    for (const key of [FEED_KEY, DETAIL_KEY, HOME_KEY]) {
      qc.setQueryData(key, qc.getQueryData(key), { updatedAt: OLD });
    }
    const before = marked(qc);
    expect(before).toHaveLength(3);

    forgetViewerSavedMarks(qc);

    expect(marked(qc)).toEqual([]);
    for (const key of before) {
      expect(qc.getQueryState(key)?.dataUpdatedAt).toBe(OLD);
    }
  });
});
