import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyIdentityFailure, resolveSupabaseConfig } from "./route-access.server";
import { AdminError } from "./errors";
import {
  adminRouteStateSchema,
  getAdminCopy,
  UNAUTHENTICATED_DETAILS,
  maskEmail,
  requireAdminRoutePermission,
  resolveAdminRouteAccess,
  selectAdminPanel,
  UNAUTHENTICATED_REASONS,
  type AdminRouteDependencies,
  type UnauthenticatedDetail,
} from "./route-access";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function context(overrides: Record<string, unknown> = {}) {
  return {
    isStaff: true,
    staffPrincipalId: "22222222-2222-4222-8222-222222222222",
    status: "active",
    roles: [{ name: "security_admin", expiresAt: null }],
    permissions: ["security.read_audit", "security.manage_staff"],
    emailVerified: true,
    mfaRequired: true,
    mfaEnrolled: true,
    currentAal: "aal2",
    recentAuthRequired: true,
    recentAuthSufficient: true,
    recentAuthWindowSeconds: 900,
    pendingSessionRevocation: false,
    pendingSessionRevocationCount: 0,
    accessAllowed: true,
    suspended: false,
    revoked: false,
    cachePolicy: "private, no-store",
    ...overrides,
  };
}

function dependencies(value: unknown): AdminRouteDependencies {
  return {
    verifyIdentity: async () => ({ userId: USER_ID, email: "owner@example.test" }),
    loadContext: async () => value,
  };
}

describe("Admin route server authorization", () => {
  it("returns unauthenticated when no server-verified identity exists", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      loadContext: async () => {
        throw new Error("must not load");
      },
    });
    expect(result.state).toBe("unauthenticated");
  });

  it("returns a stable non-staff 403 state", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => ({ userId: USER_ID, email: null }),
      loadContext: async () => {
        throw { code: "PT403", message: "staff_access_denied" };
      },
    });
    expect(result.state).toBe("forbidden");
  });

  it("separates MFA, recent-auth, suspended, and revoked states", async () => {
    expect(
      (await resolveAdminRouteAccess(dependencies(context({ mfaEnrolled: false })))).state,
    ).toBe("mfa_required");
    expect(
      (
        await resolveAdminRouteAccess(
          dependencies(context({ currentAal: "aal1", accessAllowed: false })),
        )
      ).state,
    ).toBe("mfa_required");
    expect(
      (await resolveAdminRouteAccess(dependencies(context({ recentAuthSufficient: false })))).state,
    ).toBe("recent_auth_required");
    expect(
      (
        await resolveAdminRouteAccess(
          dependencies(
            context({
              status: "suspended",
              suspended: true,
              accessAllowed: false,
              roles: [],
              permissions: [],
            }),
          ),
        )
      ).state,
    ).toBe("suspended");
    expect(
      (
        await resolveAdminRouteAccess(
          dependencies(
            context({
              status: "revoked",
              revoked: true,
              accessAllowed: false,
              roles: [],
              permissions: [],
            }),
          ),
        )
      ).state,
    ).toBe("revoked");
  });

  it("returns only a safe identity summary for valid staff access", async () => {
    const result = await resolveAdminRouteAccess(dependencies(context()));
    expect(result.state).toBe("authorized");
    if (result.state !== "authorized") throw new Error("expected authorized");
    expect(result.identity.emailSummary).toBe("o****@example.test");
    expect(JSON.stringify(result)).not.toContain("owner@example.test");
  });

  it("renders French and Arabic copy with an RTL-safe Arabic contract", () => {
    expect(getAdminCopy("fr").dir).toBe("ltr");
    expect(getAdminCopy("fr").title).toContain("Administration");
    expect(getAdminCopy("ar").dir).toBe("rtl");
    expect(getAdminCopy("ar").title).toContain("إدارة");
    expect(getAdminCopy("ar").states.forbidden.title).toContain("مرفوض");
  });

  it("fails malformed identity strings closed", () => {
    expect(maskEmail("not-an-email")).toBeNull();
  });

  it("enforces route-specific permissions on the server-owned context", async () => {
    const authorized = await resolveAdminRouteAccess(dependencies(context()));
    expect(requireAdminRoutePermission(authorized, "security.manage_staff").state).toBe(
      "authorized",
    );
    expect(requireAdminRoutePermission(authorized, "security.revoke_staff").state).toBe(
      "forbidden",
    );
  });
});

describe("unauthenticated reason discriminator", () => {
  // Regression: a production outage was undiagnosable because "the browser sent
  // no bearer token" and "the server could not verify the bearer token it was
  // sent" both rendered the identical "Authentification requise" panel.
  it("reports invalid_token when identity verification returns no identity", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      loadContext: async () => {
        throw new Error("must not load");
      },
    });
    expect(result).toEqual({ state: "unauthenticated", reason: "invalid_token" });
  });

  it("names no detail when a throw escapes verification unclassified", async () => {
    // Guessing "unverifiable" here would accuse the server of an outage on
    // evidence any anonymous caller can manufacture with a malformed token.
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => {
        throw new Error("jwks unreachable");
      },
      loadContext: async () => {
        throw new Error("must not load");
      },
    });
    expect(result).toEqual({ state: "unauthenticated", reason: "invalid_token" });
  });

  it("distinguishes a rejected credential from a control-plane refusal", async () => {
    // Both render "unauthenticated". If they shared a reason the conflation
    // this exists to remove would simply move down a layer.
    const rejectedCredential = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      loadContext: async () => context(),
    });
    const controlPlaneRefusal = await resolveAdminRouteAccess({
      verifyIdentity: async () => ({ userId: USER_ID, email: null }),
      loadContext: async () => {
        throw new AdminError("unauthenticated", "Authentication is required.");
      },
    });
    expect(rejectedCredential).toMatchObject({ reason: "invalid_token" });
    expect(controlPlaneRefusal).toEqual({
      state: "unauthenticated",
      reason: "backend_unauthenticated",
    });
    expect(rejectedCredential).not.toEqual(controlPlaneRefusal);
  });

  it("does not blame the credential for a failure that happened after it was accepted", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => ({ userId: USER_ID, email: null }),
      loadContext: async () => {
        throw new AdminError("unauthenticated", "Authentication is required.");
      },
    });
    expect(result).toMatchObject({ reason: "backend_unauthenticated" });
    expect(result).not.toMatchObject({ reason: "invalid_token" });
  });

  it("keeps a non-staff account on forbidden rather than any unauthenticated state", async () => {
    // The distinction that makes acceptance #5 meaningful: a real session that
    // simply lacks staff authority must not look like a vanished session.
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => ({ userId: USER_ID, email: null }),
      loadContext: async () => {
        throw { code: "PT403", message: "staff_access_denied" };
      },
    });
    expect(result.state).toBe("forbidden");
  });

  it("parses both reasons, and a legacy reason-less state, through the wire schema", async () => {
    expect(
      adminRouteStateSchema.parse({ state: "unauthenticated", reason: "missing_token" }),
    ).toEqual({ state: "unauthenticated", reason: "missing_token" });
    expect(
      adminRouteStateSchema.parse({ state: "unauthenticated", reason: "invalid_token" }),
    ).toEqual({ state: "unauthenticated", reason: "invalid_token" });
    expect(adminRouteStateSchema.parse({ state: "unauthenticated" })).toEqual({
      state: "unauthenticated",
    });
    expect(() =>
      adminRouteStateSchema.parse({ state: "unauthenticated", reason: "nope" }),
    ).toThrow();
  });

  it("gives both languages distinct copy for each unauthenticated cause", () => {
    for (const lang of ["fr", "ar"] as const) {
      const copy = getAdminCopy(lang);
      const titles = [
        copy.states.unauthenticated.title,
        copy.invalidToken.title,
        copy.verificationUnavailable.title,
      ];
      expect(new Set(titles).size).toBe(3);
      for (const title of titles) expect(title.length).toBeGreaterThan(0);
      expect(copy.referenceLabel.length).toBeGreaterThan(0);
    }
  });

  it("never tells a reader to sign in again over a failure that is not theirs", () => {
    // "Vérification impossible" must not carry re-authentication wording: the
    // credential may be perfectly valid and signing in again would not help.
    for (const lang of ["fr", "ar"] as const) {
      const copy = getAdminCopy(lang);
      const text =
        `${copy.verificationUnavailable.title} ${copy.verificationUnavailable.description}`.toLowerCase();
      expect(text).not.toContain("expir");
      expect(text).not.toContain("انتهت");
    }
  });
});

describe("identity failure classification", () => {
  it("carries the classified detail onto the unauthenticated state", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      describeIdentityFailure: () => "expired",
      loadContext: async () => context(),
    });
    expect(result).toEqual({
      state: "unauthenticated",
      reason: "invalid_token",
      detail: "expired",
    });
  });

  it("leaves an unclassified throw without a detail", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => {
        throw new Error("boom");
      },
      loadContext: async () => context(),
    });
    expect(result).toEqual({ state: "unauthenticated", reason: "invalid_token" });
  });

  it("omits detail entirely when the caller does not classify", async () => {
    const result = await resolveAdminRouteAccess({
      verifyIdentity: async () => null,
      loadContext: async () => context(),
    });
    expect(result).toEqual({ state: "unauthenticated", reason: "invalid_token" });
  });

  it("reads the detail fresh on each attempt rather than pinning the first", async () => {
    // The classifier is consulted after verification, so a describe() whose
    // answer changes between attempts must be re-read, not cached.
    const answers: (UnauthenticatedDetail | undefined)[] = ["expired", "rejected", undefined];
    let attempt = 0;
    const deps: AdminRouteDependencies = {
      describeIdentityFailure: () => answers[attempt],
      verifyIdentity: async () => null,
      loadContext: async () => context(),
    };
    expect(await resolveAdminRouteAccess(deps)).toMatchObject({ detail: "expired" });
    attempt = 1;
    expect(await resolveAdminRouteAccess(deps)).toMatchObject({ detail: "rejected" });
    attempt = 2;
    expect(await resolveAdminRouteAccess(deps)).toEqual({
      state: "unauthenticated",
      reason: "invalid_token",
    });
  });
});

describe("classifyIdentityFailure", () => {
  it("names an expired token so the reader is told to sign in again", () => {
    expect(
      classifyIdentityFailure({ name: "AuthInvalidJwtError", message: "JWT has expired" }),
    ).toBe("expired");
  });

  it("separates a verification outage from a refusal", () => {
    // These never reached a verdict: the credential may well be fine.
    expect(classifyIdentityFailure({ message: "Failed to fetch" })).toBe("unverifiable");
    expect(classifyIdentityFailure({ message: "jwks endpoint unreachable" })).toBe("unverifiable");
    expect(classifyIdentityFailure({ message: "socket timeout" })).toBe("unverifiable");
    expect(classifyIdentityFailure({ status: 503, message: "upstream" })).toBe("unverifiable");
  });

  it("collapses a genuine refusal, and anything unrecognised, to rejected", () => {
    expect(classifyIdentityFailure({ name: "AuthApiError", message: "invalid claim" })).toBe(
      "rejected",
    );
    expect(
      classifyIdentityFailure({ name: "AuthInvalidJwtError", message: "Invalid JWT signature" }),
    ).toBe("rejected");
    expect(classifyIdentityFailure(null)).toBe("rejected");
    expect(classifyIdentityFailure(undefined)).toBe("rejected");
    expect(classifyIdentityFailure({ message: "something bizarre" })).toBe("rejected");
  });

  it("never echoes anything from the error into the category", () => {
    // The category is a fixed vocabulary; a hostile message cannot widen it.
    const category = classifyIdentityFailure({
      message: "user bob@example.com token eyJhbGciOiJFUzI1NiIs",
    });
    expect(UNAUTHENTICATED_DETAILS).toContain(category);
  });
});

describe("classifyIdentityFailure resists a forged verdict", () => {
  // The whole point of `unverifiable` is that it accuses the server, not the
  // caller. An operator who sees it goes looking for an outage. So a caller
  // must not be able to produce it on demand.
  it("calls a malformed token rejected, not unverifiable", () => {
    // getClaims rethrows a plain Error for these -- decodeJWT reaches
    // JSON.parse on base64url-shaped-but-not-JSON segments.
    expect(classifyIdentityFailure(new Error("Invalid UTF-8 sequence"))).toBe("rejected");
    expect(classifyIdentityFailure(new Error("Invalid alg claim"))).toBe("rejected");
    expect(classifyIdentityFailure(new Error("Unexpected token in JSON"))).toBe("rejected");
    expect(
      classifyIdentityFailure({ name: "AuthInvalidJwtError", message: "Invalid JWT structure" }),
    ).toBe("rejected");
  });

  it("reserves unverifiable for genuine transport failures", () => {
    for (const error of [
      { message: "Failed to fetch" },
      { message: "fetch failed" },
      { message: "network error" },
      { message: "socket timeout" },
      { message: "request timed out" },
      { message: "jwks endpoint unreachable" },
      { message: "connect ECONNREFUSED 10.0.0.1:443" },
      { message: "getaddrinfo ENOTFOUND supabase.co" },
      { status: 503, message: "upstream" },
    ]) {
      expect(classifyIdentityFailure(error)).toBe("unverifiable");
    }
  });

  it("treats a network deadline as an outage rather than an expired session", () => {
    // "expired" appears in some timeout messages. Matching it first would turn
    // an outage into a false "your session expired, sign in again".
    expect(classifyIdentityFailure({ message: "socket timeout: deadline expired" })).toBe(
      "unverifiable",
    );
  });

  it("only reports expired for a credential-side expiry", () => {
    expect(
      classifyIdentityFailure({ name: "AuthInvalidJwtError", message: "JWT has expired" }),
    ).toBe("expired");
  });
});

describe("selectAdminPanel", () => {
  const fr = getAdminCopy("fr");

  it("asks a reader with no token to sign in, and gives them the means", () => {
    const panel = selectAdminPanel("unauthenticated", fr, "missing_token");
    expect(panel.content).toBe(fr.states.unauthenticated);
    expect(panel.showSignIn).toBe(true);
    expect(panel.reference).toBe("unauthenticated/missing_token");
  });

  it("tells a reader whose token was refused that their session ended", () => {
    for (const detail of ["expired", "rejected"] as const) {
      const panel = selectAdminPanel("unauthenticated", fr, "invalid_token", detail);
      expect(panel.content).toBe(fr.invalidToken);
      expect(panel.showSignIn).toBe(true);
      expect(panel.reference).toBe(`unauthenticated/invalid_token/${detail}`);
    }
  });

  it("does not blame the reader when verification could not complete", () => {
    // Regression: `detail` was computed, sent over the wire, then ignored, so
    // an unverifiable token still read "Session expirée -- reconnectez-vous".
    const panel = selectAdminPanel("unauthenticated", fr, "invalid_token", "unverifiable");
    expect(panel.content).toBe(fr.verificationUnavailable);
    expect(panel.content).not.toBe(fr.invalidToken);
    expect(panel.showSignIn).toBe(false);
  });

  it("does not blame the reader for a control-plane refusal either", () => {
    const panel = selectAdminPanel("unauthenticated", fr, "backend_unauthenticated");
    expect(panel.content).toBe(fr.verificationUnavailable);
    expect(panel.showSignIn).toBe(false);
    expect(panel.reference).toBe("unauthenticated/backend_unauthenticated");
  });

  it("keeps the sign-in affordance on the states a sign-in genuinely clears", () => {
    expect(selectAdminPanel("recent_auth_required", fr).showSignIn).toBe(true);
    expect(selectAdminPanel("mfa_required", fr).showSignIn).toBe(true);
  });

  it("offers no sign-in where it would not help", () => {
    for (const state of ["forbidden", "suspended", "revoked", "backend_unavailable"] as const) {
      expect(selectAdminPanel(state, fr).showSignIn).toBe(false);
      expect(selectAdminPanel(state, fr).content).toBe(fr.states[state]);
    }
  });

  it("degrades to the plain state name when an older server sends no reason", () => {
    const panel = selectAdminPanel("unauthenticated", fr);
    expect(panel.reference).toBe("unauthenticated");
    expect(panel.content).toBe(fr.states.unauthenticated);
  });

  it("builds every reference from the fixed vocabulary only", () => {
    // The reference is printed verbatim in the UI, so it must never become a
    // channel for anything the server did not choose from a closed set.
    for (const reason of UNAUTHENTICATED_REASONS) {
      for (const detail of [...UNAUTHENTICATED_DETAILS, undefined]) {
        const { reference } = selectAdminPanel("unauthenticated", fr, reason, detail);
        for (const part of reference.split("/")) {
          expect([
            "unauthenticated",
            ...UNAUTHENTICATED_REASONS,
            ...UNAUTHENTICATED_DETAILS,
          ]).toContain(part);
        }
      }
    }
  });
});

describe("Supabase project resolution", () => {
  const keys = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
  ] as const;

  function withEnv(values: Partial<Record<(typeof keys)[number], string>>, run: () => void) {
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) delete process.env[k];
      for (const [k, v] of Object.entries(values)) process.env[k] = v;
      run();
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k] as string;
      }
    }
  }

  it("verifies against the same project the browser signed in to", () => {
    // The whole failure mode: the Admin gate validating a session against a
    // different Supabase project than the one that issued it. The signing key
    // is then absent from the JWKS and the Auth server has never seen the
    // token, so nobody can ever be authenticated.
    withEnv(
      {
        VITE_SUPABASE_URL: "https://browser-project.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser",
        SUPABASE_URL: "https://some-other-project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_other",
      },
      () => {
        expect(resolveSupabaseConfig()).toEqual({
          url: "https://browser-project.supabase.co",
          publishableKey: "sb_publishable_browser",
        });
      },
    );
  });

  it("still accepts server-only variables where a runtime injects those instead", () => {
    withEnv(
      {
        SUPABASE_URL: "https://injected.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      },
      () => {
        expect(resolveSupabaseConfig()).toEqual({
          url: "https://injected.supabase.co",
          publishableKey: "sb_publishable_x",
        });
      },
    );
  });

  it("reports nothing configured rather than a half-built client", () => {
    withEnv({}, () => {
      const config = resolveSupabaseConfig();
      expect(config.url).toBeFalsy();
      expect(config.publishableKey).toBeFalsy();
    });
  });

  it("reads the same build-time variables as the browser client", () => {
    // If these drift apart, the gate can once again end up pointed at a
    // different project than the session it is checking.
    const client = readFileSync(
      join(import.meta.dir, "..", "..", "integrations", "supabase", "client.ts"),
      "utf8",
    );
    const server = readFileSync(join(import.meta.dir, "route-access.server.ts"), "utf8");
    for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]) {
      expect(client).toContain(`import.meta.env.${name}`);
      // The literal member expression is what the bundler substitutes; writing
      // it any other way silently loses the build-time value.
      expect(server).toContain(`import.meta.env.${name}`);
    }
  });

  it("falls back instead of throwing where import.meta.env does not exist", () => {
    // A throw here would turn a denied Admin page into a 500 on the auth path.
    const server = readFileSync(join(import.meta.dir, "route-access.server.ts"), "utf8");
    expect(server).toMatch(/try\s*\{[\s\S]*import\.meta\.env[\s\S]*\}\s*catch/);
    withEnv(
      {
        SUPABASE_URL: "https://fallback.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_f",
      },
      () => {
        expect(() => resolveSupabaseConfig()).not.toThrow();
        expect(resolveSupabaseConfig().url).toBe("https://fallback.supabase.co");
      },
    );
  });

  it("never falls back to a service-role credential", () => {
    // The gate runs with the caller's own token under RLS. A service key here
    // would silently turn every read into an unrestricted one.
    const server = readFileSync(join(import.meta.dir, "route-access.server.ts"), "utf8");
    expect(server).not.toContain("SERVICE_ROLE");
    expect(server).not.toContain("SUPABASE_SECRET_KEY");
  });
});
