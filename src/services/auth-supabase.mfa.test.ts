import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { forgetAccount, watchAccountSwitch } from "@/auth/account-queries";
import { createStepUpResponder } from "@/auth/step-up-notice";
import { onMfaStepUpRequired, reportMfaStepUp } from "@/backend/auth/step-up";
import type { ProfileDto } from "@/backend/identity/contracts";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { followedTeamIdsQueryKey } from "@/services/follows";
import { SupabaseAuthService } from "./auth-supabase";

// The session the app publishes must say how far the sign-in got. Before
// 2026-09-25 every path that created a Supabase session -- the password form,
// the e-mail/OAuth callback's refresh, a restored session -- published it as
// "authenticated", so a password-only session of an account with a second
// factor could use the whole app (audit A03). These drive the real service
// with a fake Supabase Auth injected through its constructor: `mock.module`
// would replace the shared client for every test file that runs after this one.

type AuthClient = SupabaseClient["auth"];
type Assurance = { currentLevel: string | null; nextLevel: string | null } | Error;

const ACCOUNT_A = "10000000-0000-4000-8000-00000000000a";
const ACCOUNT_B = "10000000-0000-4000-8000-00000000000b";

function supabaseUser(id: string): User {
  return {
    id,
    email: `${id.slice(-1)}@example.test`,
    app_metadata: { provider: "email" },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-09-01T00:00:00Z",
    email_confirmed_at: "2026-09-01T00:00:00Z",
  } as User;
}

function profileOf(id: string): ProfileDto {
  return {
    id,
    username: "fan",
    displayName: "Fan",
    avatarPath: null,
    preferredLanguage: "fr",
    favoriteTeamId: null,
    favoriteTeamReference: null,
    onboardingCompletedAt: "2026-09-02T00:00:00Z",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-02T00:00:00Z",
    notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
  };
}

/** Supabase Auth, reduced to what the service calls, with the knobs the tests turn. */
function fakeSupabaseAuth() {
  let current: Session | null = null;
  let assurance: Assurance = { currentLevel: "aal1", nextLevel: "aal1" };
  const listeners: Array<(event: string, session: Session | null) => void> = [];
  const calls = { refresh: 0 };

  const fire = (event: string) => {
    for (const listener of listeners) listener(event, current);
  };
  const open = (id: string) => {
    current = { user: supabaseUser(id), access_token: "t", refresh_token: "r" } as Session;
  };

  const auth = {
    getSession: async () => ({ data: { session: current }, error: null }),
    onAuthStateChange: (listener: (event: string, session: Session | null) => void) => {
      listeners.push(listener);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signInWithPassword: async () => {
      open(ACCOUNT_A);
      fire("SIGNED_IN");
      return { data: { user: current!.user, session: current }, error: null };
    },
    refreshSession: async () => {
      calls.refresh++;
      if (!current) return { data: { user: null, session: null }, error: { message: "none" } };
      fire("TOKEN_REFRESHED");
      return { data: { user: current.user, session: current }, error: null };
    },
    signOut: async () => {
      current = null;
      fire("SIGNED_OUT");
      return { error: null };
    },
    mfa: {
      getAuthenticatorAssuranceLevel: async () =>
        assurance instanceof Error
          ? { data: null, error: { message: assurance.message } }
          : { data: assurance, error: null },
    },
  };

  return {
    auth: auth as unknown as AuthClient,
    calls,
    setAssurance(next: Assurance) {
      assurance = next;
    },
    /** A session that arrives on its own: restored from storage, another tab. */
    restore(id: string) {
      open(id);
      fire("SIGNED_IN");
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A service subscribed the way AuthProvider does, with its start-up read of
 * the (empty) session settled. auth-js answers that read before it emits any
 * later sign-in, since both wait on its one lock; the fake has no lock, so the
 * tests wait instead.
 */
async function start(
  profile: (id: string) => Promise<ProfileDto | null> = async (id) => profileOf(id),
) {
  const fake = fakeSupabaseAuth();
  const service = new SupabaseAuthService({
    auth: () => fake.auth,
    profiles: {
      getMe: (context) => profile(context.actorId ?? ""),
      completeOnboarding: async () => profileOf(ACCOUNT_A),
    },
  });
  const statuses: string[] = [];
  service.subscribeToSession((session) => statuses.push(session.status));
  await settle();
  return { fake, service, statuses };
}

const scope = globalThis as { window?: unknown };
let savedWindow: unknown;
beforeAll(() => {
  savedWindow = scope.window;
  const store = new Map<string, string>();
  scope.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    // The Fantasy drafts store announces its writes.
    dispatchEvent: () => true,
  };
});
afterAll(() => {
  scope.window = savedWindow;
});

describe("password sign-in of an account with a verified factor (aal1, next aal2)", () => {
  it("is accepted, but reported as owing the code, with no user", async () => {
    const { fake, service } = await start();
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
    const result = await service.signInWithEmail("a@example.test", "correct horse");
    expect(result.ok).toBe(true);
    expect(result.status).toBe("mfa_required");
    await settle();
    expect(service.getSession()).toEqual({
      user: null,
      status: "mfa_required",
      pendingAccountId: ACCOUNT_A,
    });
  });

  it("is never published as authenticated, not even for a moment", async () => {
    const { fake, service, statuses } = await start();
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
    await service.signInWithEmail("a@example.test", "correct horse");
    await settle();
    expect(statuses).not.toContain("authenticated");
    expect(statuses.at(-1)).toBe("mfa_required");
  });

  it("becomes authenticated, with the user, once the code upgrades the session to aal2", async () => {
    const { fake, service } = await start();
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
    await service.signInWithEmail("a@example.test", "correct horse");
    fake.setAssurance({ currentLevel: "aal2", nextLevel: "aal2" });
    const session = await service.recheckSession();
    expect(session.status).toBe("authenticated");
    expect(session.user?.id).toBe(ACCOUNT_A);
    expect(service.getSession().user?.id).toBe(ACCOUNT_A);
  });
});

describe("the assurance lookup fails", () => {
  it("fails closed: not signed in, retryable", async () => {
    const { fake, service } = await start();
    fake.setAssurance(new Error("Failed to fetch"));
    const result = await service.signInWithEmail("a@example.test", "correct horse");
    expect(result.status).toBe("mfa_unconfirmed");
    await settle();
    expect(service.getSession()).toEqual({
      user: null,
      status: "mfa_unconfirmed",
      pendingAccountId: ACCOUNT_A,
    });
  });

  it("the retry settles it once the lookup answers", async () => {
    const { fake, service } = await start();
    fake.setAssurance(new Error("Failed to fetch"));
    await service.signInWithEmail("a@example.test", "correct horse");
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
    expect((await service.recheckSession()).status).toBe("mfa_required");
    fake.setAssurance({ currentLevel: "aal2", nextLevel: "aal2" });
    expect((await service.recheckSession()).status).toBe("authenticated");
  });
});

describe("an account without a second factor", () => {
  it("is signed in at once, as before", async () => {
    const { service } = await start();
    const result = await service.signInWithEmail("a@example.test", "correct horse");
    expect(result.status).toBe("authenticated");
    expect(result.data?.id).toBe(ACCOUNT_A);
    await settle();
    expect(service.getSession().status).toBe("authenticated");
  });
});

describe("the e-mail / OAuth callback's refresh", () => {
  it("reports the pending second factor instead of publishing a full sign-in", async () => {
    const { fake, service } = await start();
    fake.restore(ACCOUNT_A);
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
    const result = await service.refreshSession();
    expect(result.ok).toBe(true);
    expect(result.status).toBe("mfa_required");
    await settle();
    expect(service.getSession().user).toBeNull();
  });
});

describe("recheckSession", () => {
  it("asks for a fresh token when told to (a factor enrolled on another device)", async () => {
    const { fake, service } = await start();
    fake.restore(ACCOUNT_A);
    await settle();
    expect(service.getSession().status).toBe("authenticated");
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
    const session = await service.recheckSession({ refresh: true });
    expect(fake.calls.refresh).toBe(1);
    expect(session).toEqual({ user: null, status: "mfa_required", pendingAccountId: ACCOUNT_A });
  });

  it("does not refresh unless asked", async () => {
    const { fake, service } = await start();
    fake.restore(ACCOUNT_A);
    await service.recheckSession();
    expect(fake.calls.refresh).toBe(0);
  });
});

describe("a slow resolution cannot bring an account back", () => {
  it("A's late profile read after A signed out leaves the app signed out", async () => {
    let releaseA: (profile: ProfileDto) => void = () => {};
    const { fake, service, statuses } = await start(
      (id) => new Promise<ProfileDto>((resolve) => (releaseA = () => resolve(profileOf(id)))),
    );
    fake.restore(ACCOUNT_A); // resolution of A starts, waiting on its profile
    await settle();
    await service.signOut();
    expect(service.getSession().status).toBe("anonymous");

    releaseA(profileOf(ACCOUNT_A));
    await settle();
    await settle();
    expect(service.getSession()).toEqual({ user: null, status: "anonymous" });
    expect(statuses).not.toContain("authenticated");
  });
});

// What AuthProvider does with every session it receives, minus React: the same
// watcher, the same cleanup, fed by the real service. Audit A06 (one account's
// follows reaching the next) and the review of A03's first fix (reaching
// `mfa_required` counted as leaving the account, and deleted its drafts).
describe("the device's account data across sessions (AuthProvider's cleanup)", () => {
  const WYDAD = "20000000-0000-4000-8000-000000000001";
  const transfersDraft: FantasyDraftKey = {
    uid: ACCOUNT_A,
    teamId: "30000000-0000-4000-8000-000000000001",
    baseVersion: 4,
    kind: "transfers",
  };
  const stepUpRefusal = { code: "PT403", message: "mfa_required", details: null, hint: null };

  async function watched() {
    const started = await start();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const left: string[] = [];
    const watch = watchAccountSwitch((uid) => {
      left.push(uid);
      forgetAccount(qc, uid);
    });
    started.service.subscribeToSession(watch);
    return { ...started, qc, left };
  }

  it("a save refused for want of the code keeps the manager's draft for after the code", async () => {
    fantasyDraftsStore.__resetAll();
    const { fake, service, qc, left } = await watched();
    fake.restore(ACCOUNT_A);
    await settle();
    expect(service.getSession().status).toBe("authenticated");
    qc.setQueryData(followedTeamIdsQueryKey(ACCOUNT_A), [WYDAD]);

    // A factor was enrolled on another device. The transfers screen's confirm
    // is refused; it keeps the pending transfers as a draft, the mappers
    // report the refusal, and the gate's listener re-reads the session.
    const notices = { count: 0 };
    const off = onMfaStepUpRequired(
      createStepUpResponder({
        notify: () => notices.count++,
        getStatus: () => service.getSession().status,
        recheck: () => service.recheckSession({ refresh: true }),
      }),
    );
    try {
      fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
      fantasyDraftsStore.save(transfersDraft, { outIds: ["p1"], inIds: ["p2"] });
      expect(reportMfaStepUp(stepUpRefusal)).toBe(true);
      await settle();
      await settle();
    } finally {
      off();
    }

    expect(notices.count).toBe(1);
    expect(service.getSession()).toMatchObject({ user: null, status: "mfa_required" });
    // Owing the code is not leaving the account.
    expect(left).toEqual([]);
    expect(fantasyDraftsStore.read(transfersDraft)?.payload).toEqual({
      outIds: ["p1"],
      inIds: ["p2"],
    });
    expect(qc.getQueryData(followedTeamIdsQueryKey(ACCOUNT_A))).toEqual([WYDAD]);

    // The code is in: the same account, with its draft still there to restore.
    fake.setAssurance({ currentLevel: "aal2", nextLevel: "aal2" });
    expect((await service.recheckSession()).user?.id).toBe(ACCOUNT_A);
    expect(left).toEqual([]);
    expect(fantasyDraftsStore.read(transfersDraft)).not.toBeNull();
  });

  it("signing out while the code is owed still forgets the account", async () => {
    fantasyDraftsStore.__resetAll();
    const { fake, service, qc, left } = await watched();
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
    fake.restore(ACCOUNT_A);
    await settle();
    expect(service.getSession().status).toBe("mfa_required");
    qc.setQueryData(followedTeamIdsQueryKey(ACCOUNT_A), [WYDAD]);
    fantasyDraftsStore.save(transfersDraft, { outIds: ["p1"], inIds: ["p2"] });

    await service.signOut();

    expect(left).toEqual([ACCOUNT_A]);
    expect(fantasyDraftsStore.read(transfersDraft)).toBeNull();
    expect(qc.getQueryData(followedTeamIdsQueryKey(ACCOUNT_A))).toBeUndefined();
  });

  it("A follows a club and signs out; B, who follows nothing, never sees it -- not even A's late answer", async () => {
    const { fake, service, qc, left } = await watched();
    fake.restore(ACCOUNT_A);
    await settle();

    // A's club list is still on its way when A signs out.
    let answerA: (ids: string[]) => void = () => {};
    const observerA = new QueryObserver(qc, {
      queryKey: followedTeamIdsQueryKey(ACCOUNT_A),
      queryFn: () => new Promise<string[]>((resolve) => (answerA = resolve)),
    });
    const stopA = observerA.subscribe(() => {});
    await settle();
    stopA();

    await service.signOut();
    expect(left).toEqual([ACCOUNT_A]);

    fake.restore(ACCOUNT_B);
    await settle();
    expect(service.getSession().user?.id).toBe(ACCOUNT_B);
    const seenByB: unknown[] = [];
    const observerB = new QueryObserver(qc, {
      queryKey: followedTeamIdsQueryKey(ACCOUNT_B),
      queryFn: async () => [] as string[],
    });
    const stopB = observerB.subscribe((result) => seenByB.push(result.data));

    answerA([WYDAD]);
    await settle();
    await settle();

    expect(qc.getQueryData(followedTeamIdsQueryKey(ACCOUNT_B))).toEqual([]);
    expect(seenByB.flat()).not.toContain(WYDAD);
    const cachedAnywhere = qc
      .getQueryCache()
      .getAll()
      .some((query) => JSON.stringify(query.state.data ?? null).includes(WYDAD));
    expect(cachedAnywhere).toBe(false);
    stopB();
  });
});
