import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { QueryClient, QueryObserver, hashKey } from "@tanstack/react-query";

import { forgetAccountQueries, queryKeyNamesAccount, watchAccountSwitch } from "./account-queries";
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
