import { describe, expect, it } from "bun:test";

import { readSessionAssurance, type MfaAuthClient } from "@/backend/auth/mfa";
import type { AuthStatus, AuthUser } from "@/services/auth-types";
import {
  challengeSearch,
  isOpenWhileSecondFactorOwed,
  isSecondFactorOwed,
  requireAuthStep,
  secondFactorGuard,
  secondFactorRedirect,
  secondFactorStep,
  sessionAccountId,
  sessionForAssurance,
} from "./second-factor";

// The second-factor state machine. A password (or link) sign-in reaches AAL1;
// an account with a verified factor then owes its one-time code, and until it
// is entered the session must count as NOT signed in everywhere. A failed
// lookup must never count as signed in either: that was the login page's
// fail-open branch (audit 2026-09-25, A03).

type AssuranceClient = Pick<MfaAuthClient, "getAuthenticatorAssuranceLevel">;

function levels(currentLevel: string | null, nextLevel: string | null): AssuranceClient {
  return {
    getAuthenticatorAssuranceLevel: async () => ({
      data: { currentLevel, nextLevel },
      error: null,
    }),
  };
}

const user: AuthUser = {
  id: "10000000-0000-4000-8000-00000000000a",
  email: "fan@example.test",
  displayName: "Fan",
  username: "fan",
  language: "fr",
  notifications: { matchAlerts: true, breakingNews: true, fantasyDeadlines: true },
  profileComplete: true,
  createdAt: "2026-09-01T00:00:00Z",
  verified: true,
  provider: "email",
};

describe("readSessionAssurance", () => {
  it("aal1 with a verified factor (next aal2) owes the second factor", async () => {
    expect(await readSessionAssurance(levels("aal1", "aal2"))).toBe("second_factor_pending");
  });

  it("aal2 is complete", async () => {
    expect(await readSessionAssurance(levels("aal2", "aal2"))).toBe("complete");
  });

  it("an account without a verified factor is complete at aal1", async () => {
    expect(await readSessionAssurance(levels("aal1", "aal1"))).toBe("complete");
  });

  it("a session whose own level is unreadable has not presented the factor", async () => {
    expect(await readSessionAssurance(levels(null, "aal2"))).toBe("second_factor_pending");
    expect(await readSessionAssurance(levels("aal3", "aal2"))).toBe("second_factor_pending");
  });

  it("a lookup that reports an error is unknown, never complete", async () => {
    const failing: AssuranceClient = {
      getAuthenticatorAssuranceLevel: async () => ({
        data: null,
        error: { message: "Failed to fetch", status: 0 },
      }),
    };
    expect(await readSessionAssurance(failing)).toBe("unknown");
  });

  it("a lookup that throws is unknown, never complete", async () => {
    const throwing: AssuranceClient = {
      getAuthenticatorAssuranceLevel: async () => {
        throw new TypeError("Failed to fetch");
      },
    };
    expect(await readSessionAssurance(throwing)).toBe("unknown");
  });
});

describe("sessionForAssurance", () => {
  it("publishes the user only once nothing is owed", () => {
    expect(sessionForAssurance(user, "complete")).toEqual({ user, status: "authenticated" });
  });

  it("aal1 -> aal2 pending is signed in for nothing: no user, status mfa_required", () => {
    expect(sessionForAssurance(user, "second_factor_pending")).toEqual({
      user: null,
      status: "mfa_required",
      pendingAccountId: user.id,
    });
  });

  it("a failed lookup is not signed in either: no user, status mfa_unconfirmed", () => {
    expect(sessionForAssurance(user, "unknown")).toEqual({
      user: null,
      status: "mfa_unconfirmed",
      pendingAccountId: user.id,
    });
  });
});

describe("sessionAccountId", () => {
  // Whose data the device holds, which is not who may use it: owing the code
  // is still the same account, so its drafts and cache are kept for when the
  // code is in (the step-up refusal leads straight into that state).
  it("is the signed-in user, or the account that still owes its code", () => {
    expect(sessionAccountId(sessionForAssurance(user, "complete"))).toBe(user.id);
    expect(sessionAccountId(sessionForAssurance(user, "second_factor_pending"))).toBe(user.id);
    expect(sessionAccountId(sessionForAssurance(user, "unknown"))).toBe(user.id);
  });

  it("is nobody for a visitor, whatever else the session carries", () => {
    for (const status of ["anonymous", "guest", "loading"] as const) {
      expect(sessionAccountId({ user: null, status, pendingAccountId: user.id })).toBeNull();
    }
  });
});

describe("requireAuthStep", () => {
  it("runs the action for a complete sign-in only", () => {
    expect(requireAuthStep("authenticated")).toBe("run");
  });

  it("sends a session that owes its code to the challenge, not to the sign-in prompt", () => {
    expect(requireAuthStep("mfa_required")).toBe("challenge");
    expect(requireAuthStep("mfa_unconfirmed")).toBe("challenge");
  });

  it("asks everyone else to sign in", () => {
    for (const status of ["anonymous", "guest", "loading", undefined] as const) {
      expect(requireAuthStep(status)).toBe("prompt");
    }
  });
});

describe("secondFactorStep", () => {
  it("proceeds only from a complete sign-in", () => {
    expect(secondFactorStep("authenticated")).toBe("proceed");
  });

  it("sends a pending second factor to the challenge", () => {
    expect(secondFactorStep("mfa_required")).toBe("challenge");
  });

  it("offers a retry when the lookup failed -- never proceeds", () => {
    expect(secondFactorStep("mfa_unconfirmed")).toBe("retry");
  });

  it("has nothing to say without a session", () => {
    for (const status of ["loading", "guest", "anonymous", undefined] as const) {
      expect(secondFactorStep(status)).toBeNull();
    }
  });

  it("counts exactly the two mfa states as owing", () => {
    const all: AuthStatus[] = [
      "loading",
      "authenticated",
      "mfa_required",
      "mfa_unconfirmed",
      "guest",
      "anonymous",
    ];
    expect(all.filter((status) => isSecondFactorOwed(status))).toEqual([
      "mfa_required",
      "mfa_unconfirmed",
    ]);
  });
});

describe("secondFactorRedirect", () => {
  it("takes a pending session from a protected page to the challenge, keeping where it was", () => {
    expect(
      secondFactorRedirect("mfa_required", { pathname: "/fantasy/team", searchStr: "?gw=3" }),
    ).toEqual({ to: "/auth/mfa-challenge", search: { next: "/fantasy/team?gw=3" } });
    expect(secondFactorRedirect("mfa_required", { pathname: "/profile" })).toEqual({
      to: "/auth/mfa-challenge",
      search: { next: "/profile" },
    });
  });

  it("does the same when the lookup failed", () => {
    expect(secondFactorRedirect("mfa_unconfirmed", { pathname: "/pronostics" })).toEqual({
      to: "/auth/mfa-challenge",
      search: { next: "/pronostics" },
    });
  });

  it("guards pages that only look public: they show the account's follows and Fantasy card", () => {
    for (const pathname of ["/", "/news", "/clubs/wac", "/auth/profile-setup"]) {
      expect(secondFactorRedirect("mfa_required", { pathname })).not.toBeNull();
    }
    // The home page needs no `next`.
    expect(secondFactorRedirect("mfa_required", { pathname: "/" })?.search).toEqual({});
  });

  it("guards the password reset too: the account's code comes first", () => {
    expect(secondFactorRedirect("mfa_required", { pathname: "/auth/update-password" })).toEqual({
      to: "/auth/mfa-challenge",
      search: { next: "/auth/update-password" },
    });
  });

  it("leaves the challenge, the sign-in screens, legal pages and unsubscribe alone", () => {
    for (const pathname of [
      "/auth/mfa-challenge",
      "/auth/login",
      "/auth/register",
      "/auth/verify",
      "/auth/callback",
      "/auth/forgot-password",
      "/privacy",
      "/terms",
      "/prizes/terms",
      "/unsubscribe",
    ]) {
      expect({ pathname, open: isOpenWhileSecondFactorOwed(pathname) }).toEqual({
        pathname,
        open: true,
      });
      expect(secondFactorRedirect("mfa_required", { pathname })).toBeNull();
    }
  });

  it("does not touch the staff pages, which enforce MFA on their own", () => {
    for (const pathname of ["/admin", "/admin/users", "/admin/news/abc"]) {
      expect(secondFactorRedirect("mfa_required", { pathname })).toBeNull();
    }
    // A prefix is not a path segment: "/administrator" is not /admin.
    expect(secondFactorRedirect("mfa_required", { pathname: "/administrator" })).not.toBeNull();
  });

  it("never redirects a complete sign-in or a visitor", () => {
    for (const status of ["authenticated", "guest", "anonymous", "loading"] as const) {
      expect(secondFactorRedirect(status, { pathname: "/fantasy/team" })).toBeNull();
    }
  });

  it("carries only a same-site next through the shared sanitiser", () => {
    expect(challengeSearch("//attacker.invalid")).toEqual({});
    expect(challengeSearch("/\\attacker.invalid")).toEqual({});
    expect(challengeSearch("/fantasy", "?x=1")).toEqual({ next: "/fantasy?x=1" });
  });
});

describe("secondFactorGuard (a route's beforeLoad: the OAuth consent page)", () => {
  // The consent page's loader can send the reader on to an app that was
  // approved before, with a token to act as them, before anything renders.
  // The gate component is an effect and comes too late, so the route asks
  // Supabase itself.
  const consent = {
    pathname: "/.lovable/oauth/consent",
    searchStr: "?authorization_id=abc-123",
  };

  it("sends a password-only session of an enrolled account to the challenge, and back after", async () => {
    expect(await secondFactorGuard(levels("aal1", "aal2"), consent)).toEqual({
      to: "/auth/mfa-challenge",
      search: { next: "/.lovable/oauth/consent?authorization_id=abc-123" },
    });
  });

  it("fails closed when the lookup fails", async () => {
    const failing: AssuranceClient = {
      getAuthenticatorAssuranceLevel: async () => ({
        data: null,
        error: { message: "Failed to fetch", status: 0 },
      }),
    };
    expect(await secondFactorGuard(failing, consent)).not.toBeNull();
  });

  it("lets a complete session through: aal2, or an account with no factor", async () => {
    expect(await secondFactorGuard(levels("aal2", "aal2"), consent)).toBeNull();
    expect(await secondFactorGuard(levels("aal1", "aal1"), consent)).toBeNull();
  });
});
