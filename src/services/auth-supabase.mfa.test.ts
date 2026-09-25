import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { forgetAccount, watchAccountSwitch } from "@/auth/account-queries";
import { sessionAccountId } from "@/auth/second-factor";
import { createStepUpResponder } from "@/auth/step-up-notice";
import { onMfaStepUpRequired, reportMfaStepUp } from "@/backend/auth/step-up";
import type { AccountSecurityRepository, ProfileDto } from "@/backend/identity/contracts";
import type { PredictionInput, SavePredictionsDto } from "@/backend/predictions/contracts";
import { accountSaveQueue } from "@/components/predictions/use-predictions-round";
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

/** An access token as the app reads one: its claims. Unsigned, as nothing here verifies it. */
function accessToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}.c2lnbmF0dXJl`;
}

/**
 * The session Supabase Auth holds for account `id` at `assurance`: the current
 * level in its token's `aal` claim, and a verified factor on its user when the
 * account has one (next level aal2). A level that cannot be read -- once a
 * failed lookup, now a token that does not decode -- is an `Error`.
 */
function sessionOf(id: string, assurance: Assurance): Session {
  const user = supabaseUser(id);
  if (assurance instanceof Error) {
    return { user, access_token: "unreadable", refresh_token: "r" } as Session;
  }
  const factors =
    assurance.nextLevel === "aal2"
      ? [{ id: `factor-${id.slice(-1)}`, factor_type: "totp", status: "verified" }]
      : [];
  return {
    user: { ...user, factors },
    access_token: accessToken({
      sub: id,
      ...(assurance.currentLevel ? { aal: assurance.currentLevel } : {}),
    }),
    refresh_token: "r",
  } as Session;
}

/** Supabase Auth, reduced to what the service calls, with the knobs the tests turn. */
function fakeSupabaseAuth() {
  let current: Session | null = null;
  let assurance: Assurance = { currentLevel: "aal1", nextLevel: "aal1" };
  const listeners: Array<(event: string, session: Session | null) => void> = [];
  const calls = { refresh: 0 };

  const deliver = (event: string, session: Session | null) => {
    for (const listener of listeners) listener(event, session);
  };
  const fire = (event: string) => deliver(event, current);
  const open = (id: string) => {
    current = sessionOf(id, assurance);
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
      // What auth-js does without a token of its own to judge: read the
      // session in STORAGE at that moment. The service must not ask it (see
      // "the level is the published session's own").
      getAuthenticatorAssuranceLevel: async () => {
        if (!current) return { data: { currentLevel: null, nextLevel: null }, error: null };
        const aal = JSON.parse(
          Buffer.from(current.access_token.split(".")[1] ?? "", "base64url").toString() || "{}",
        ).aal as string | undefined;
        const enrolled = (current.user.factors ?? []).some((f) => f.status === "verified");
        return {
          data: { currentLevel: aal ?? null, nextLevel: enrolled ? "aal2" : (aal ?? null) },
          error: null,
        };
      },
    },
  };

  return {
    auth: auth as unknown as AuthClient,
    calls,
    /** The account whose token a request would carry now. */
    currentUserId: () => current?.user.id ?? null,
    /** The level the stored session reports from now on (a refresh, a code entered). */
    setAssurance(next: Assurance) {
      assurance = next;
      if (current) current = sessionOf(current.user.id, next);
    },
    /** A session that arrives on its own: restored from storage, another tab. */
    restore(id: string) {
      open(id);
      fire("SIGNED_IN");
    },
    /** Storage now holds account `id`'s session; this tab has not heard of it yet. */
    hold(id: string, level: Assurance) {
      current = sessionOf(id, level);
    },
    /** An auth event carrying `session`, whatever storage holds. */
    deliver,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A service subscribed the way AuthProvider does, with its start-up read of
 * the (empty) session settled. auth-js answers that read before it emits any
 * later sign-in, since both wait on its one lock; the fake has no lock, so the
 * tests wait instead. `revocations` is what sign-out recorded, with the
 * account whose token the record went out with.
 */
async function start(
  profile: (id: string) => Promise<ProfileDto | null> = async (id) => profileOf(id),
) {
  const fake = fakeSupabaseAuth();
  const revocations: Array<{ scope: string; actorId: string | null; token: string | null }> = [];
  const accountSecurity: AccountSecurityRepository = {
    requestDeletion: async () => "request",
    cancelDeletion: async () => {},
    listDeletionRequests: async () => [],
    recordSessionRevocation: async (scope, context) =>
      void revocations.push({ scope, actorId: context.actorId, token: fake.currentUserId() }),
  };
  const service = new SupabaseAuthService({
    auth: () => fake.auth,
    profiles: {
      getMe: (context) => profile(context.actorId ?? ""),
      completeOnboarding: async () => profileOf(ACCOUNT_A),
    },
    accountSecurity,
  });
  const statuses: string[] = [];
  service.subscribeToSession((session) => statuses.push(session.status));
  await settle();
  return { fake, service, statuses, revocations };
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

// The level is read from the session's own token (below); a token that does
// not decode is what is left of "the lookup failed", and fails the same way.
describe("the session's level cannot be read", () => {
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

  it("the retry settles it once the level can be read", async () => {
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

// Security review of 2026-09-25: when another tab signed B in, nothing was
// published until B had been resolved (a profile read of up to four 10 s
// attempts, then an avatar signing with no deadline). All that time the app
// still showed A while the client already sent B's token, and A's Pronostics
// queue, asking whether the session was still A's, heard yes: A's unsent
// picks went out as B's.
describe("another account's session arrives while one is signed in", () => {
  const pick: PredictionInput = { fixtureId: "f1", home: 2, away: 1 };
  const answer = (items: readonly PredictionInput[]) =>
    ({
      serverTime: "2026-09-25T20:00:00+00:00",
      results: items.map((item) => ({
        ...item,
        status: "saved",
        submittedAt: "2026-09-25T20:00:00+00:00",
      })),
    }) as SavePredictionsDto;
  function timersByHand() {
    const scheduled = new Map<number, () => void>();
    let next = 0;
    return {
      setTimeout: (handler: () => void) => {
        scheduled.set(++next, handler);
        return next;
      },
      clearTimeout: (handle: unknown) => void scheduled.delete(handle as number),
      due: () => {
        const handlers = [...scheduled.values()];
        scheduled.clear();
        for (const handler of handlers) handler();
      },
    };
  }

  it("takes A off the screen at once, and A's queue sends nothing while B's profile is still read", async () => {
    let releaseB: () => void = () => {};
    const { fake, service, statuses } = await start((id) =>
      id === ACCOUNT_B
        ? new Promise<ProfileDto>((resolve) => (releaseB = () => resolve(profileOf(id))))
        : Promise.resolve(profileOf(id)),
    );
    const left: string[] = [];
    service.subscribeToSession(watchAccountSwitch((uid) => left.push(uid)));
    fake.restore(ACCOUNT_A);
    await settle();
    expect(service.getSession().user?.id).toBe(ACCOUNT_A);

    // A's Pronostics queue, on the real service, with a pick not yet sent.
    const sent: Array<{ token: string | null; items: PredictionInput[] }> = [];
    const drafts = new Map<string, readonly PredictionInput[]>();
    const timers = timersByHand();
    const queue = accountSaveQueue(
      ACCOUNT_A,
      { timers },
      {
        session: () => service.getSession(),
        save: async (items) => {
          sent.push({ token: fake.currentUserId(), items: [...items] });
          return answer(items);
        },
        drafts: (uid) => ({
          load: () => drafts.get(uid) ?? [],
          save: (items) => void drafts.set(uid, items),
        }),
      },
    );
    queue.set(pick);

    // Another tab signs B in. B's profile read has not answered.
    fake.restore(ACCOUNT_B);
    expect(fake.currentUserId()).toBe(ACCOUNT_B);
    expect(service.getSession()).toEqual({ user: null, status: "loading" });
    expect(sessionAccountId(service.getSession())).toBeNull();
    // AuthProvider's leave has already run for A.
    expect(left).toEqual([ACCOUNT_A]);

    // The pick's second comes due, and the page flushes: nothing goes with
    // B's token, and the pick waits in A's draft.
    timers.due();
    await queue.flush();
    await settle();
    expect(sent).toEqual([]);
    expect(drafts.get(ACCOUNT_A)).toEqual([pick]);
    expect(service.getSession().status).toBe("loading");

    releaseB();
    await settle();
    await settle();
    expect(service.getSession().user?.id).toBe(ACCOUNT_B);
    expect(statuses.slice(-3)).toEqual(["authenticated", "loading", "authenticated"]);
    // B is signed in now, and A's queue still sends nothing: not A's session.
    await queue.flush();
    expect(sent).toEqual([]);
    expect(left).toEqual([ACCOUNT_A]);
    queue.dispose();
  });

  it("the same account's new token keeps it on screen while it resolves", async () => {
    const { fake, service, statuses } = await start();
    fake.restore(ACCOUNT_A);
    await settle();
    const before = statuses.length;
    expect((await service.refreshSession()).status).toBe("authenticated");
    await settle();
    expect(statuses.slice(before)).not.toContain("loading");
    expect(service.getSession().user?.id).toBe(ACCOUNT_A);
  });

  it("an account that owes its code is taken off the screen the same way", async () => {
    const { fake, service } = await start();
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
    fake.restore(ACCOUNT_A);
    await settle();
    expect(service.getSession()).toMatchObject({
      status: "mfa_required",
      pendingAccountId: ACCOUNT_A,
    });
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal1" });
    fake.restore(ACCOUNT_B);
    expect(service.getSession()).toEqual({ user: null, status: "loading" });
    await settle();
    expect(service.getSession().user?.id).toBe(ACCOUNT_B);
  });
});

// Security review of 2026-09-25: the level came from
// `mfa.getAuthenticatorAssuranceLevel()`, which reads whatever session STORAGE
// holds when it runs. With another tab's sign-in already in storage, the user
// being resolved was published at that other session's level.
describe("the level is the published session's own", () => {
  it("an account at aal1 with a factor is not signed in because storage holds a complete session of another account", async () => {
    const { fake, service, statuses } = await start();
    // Storage: B, who has no factor (complete at aal1). The event being
    // resolved: A, enrolled, at aal1.
    fake.hold(ACCOUNT_B, { currentLevel: "aal1", nextLevel: "aal1" });
    fake.deliver("SIGNED_IN", sessionOf(ACCOUNT_A, { currentLevel: "aal1", nextLevel: "aal2" }));
    await settle();
    expect(service.getSession()).toEqual({
      user: null,
      status: "mfa_required",
      pendingAccountId: ACCOUNT_A,
    });
    expect(statuses).not.toContain("authenticated");
  });

  it("and the other way round: an aal2 session is not held back by another account's aal1 in storage", async () => {
    const { fake, service } = await start();
    fake.hold(ACCOUNT_B, { currentLevel: "aal1", nextLevel: "aal2" });
    fake.deliver("SIGNED_IN", sessionOf(ACCOUNT_A, { currentLevel: "aal2", nextLevel: "aal2" }));
    await settle();
    expect(service.getSession()).toMatchObject({ status: "authenticated" });
    expect(service.getSession().user?.id).toBe(ACCOUNT_A);
  });

  it("a profile read that answered for another account is not put on this user", async () => {
    // `my_profile` answers for whichever token the request carried.
    const { fake, service } = await start(async () => ({
      ...profileOf(ACCOUNT_B),
      displayName: "Compte B",
      username: "compte_b",
    }));
    fake.restore(ACCOUNT_A);
    await settle();
    const user = service.getSession().user;
    expect(user?.id).toBe(ACCOUNT_A);
    expect(user?.displayName).not.toBe("Compte B");
    expect(user?.username).not.toBe("compte_b");
  });

  it("a completed profile is not published onto a session another tab switched in", async () => {
    const { fake, service } = await start();
    fake.restore(ACCOUNT_A);
    await settle();
    // Another tab signed B in; this tab has not heard of it yet.
    fake.hold(ACCOUNT_B, { currentLevel: "aal1", nextLevel: "aal1" });
    const result = await service.completeProfile({ username: "fan" });
    expect(result).toEqual({ ok: false, errorCode: "session_expired" });
    expect(service.getSession().user?.id).toBe(ACCOUNT_A);
  });
});

// Security review of 2026-09-25: sign-out took its actor from `user`, which is
// null while the code is owed, so leaving from the challenge never recorded
// the revocation -- although the step-up migration leaves the security audit
// log unguarded precisely so that this record works at aal1.
describe("signing out records the session's revocation", () => {
  it("while the code is owed, for the account behind the session, before Auth ends it", async () => {
    const { fake, service, revocations } = await start();
    fake.setAssurance({ currentLevel: "aal1", nextLevel: "aal2" });
    fake.restore(ACCOUNT_A);
    await settle();
    expect(service.getSession().status).toBe("mfa_required");
    await service.signOut();
    expect(revocations).toEqual([{ scope: "local", actorId: ACCOUNT_A, token: ACCOUNT_A }]);
    expect(service.getSession().status).toBe("anonymous");
  });

  it("when the level could not be read, likewise", async () => {
    const { fake, service, revocations } = await start();
    fake.setAssurance(new Error("unreadable"));
    fake.restore(ACCOUNT_A);
    await settle();
    expect(service.getSession().status).toBe("mfa_unconfirmed");
    await service.signOut({ scope: "global" });
    expect(revocations).toEqual([{ scope: "global", actorId: ACCOUNT_A, token: ACCOUNT_A }]);
  });

  it("signed in, as before; and a visitor has nothing to record", async () => {
    const signedIn = await start();
    signedIn.fake.restore(ACCOUNT_A);
    await settle();
    await signedIn.service.signOut();
    expect(signedIn.revocations).toEqual([
      { scope: "local", actorId: ACCOUNT_A, token: ACCOUNT_A },
    ]);

    const visitor = await start();
    await visitor.service.signOut();
    expect(visitor.revocations).toEqual([]);
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
