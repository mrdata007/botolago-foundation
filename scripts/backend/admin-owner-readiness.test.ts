import { describe, expect, it } from "bun:test";
import type { User } from "@supabase/supabase-js";
import {
  assertOwnerSessionProof,
  OwnerReadinessError,
  ownerReadinessReport,
  resolveOwnerEmail,
  selectUniqueConfirmedOwner,
  type OwnerReadinessEvidence,
} from "./admin-owner-readiness";

function user(id: string, email: string, confirmed = true): User {
  return {
    id,
    email,
    email_confirmed_at: confirmed ? "2026-07-24T12:00:00Z" : undefined,
  } as User;
}

describe("Owner readiness command", () => {
  it("accepts exactly one runtime email source and has no default identity", () => {
    expect(() => resolveOwnerEmail([], {})).toThrow("invalid_owner_email");
    expect(resolveOwnerEmail([], { OWNER_ADMIN_EMAIL: "OWNER@EXAMPLE.TEST" })).toEqual({
      email: "owner@example.test",
    });
    expect(resolveOwnerEmail(["--email=owner@example.test"], {})).toEqual({
      email: "owner@example.test",
    });
    expect(() =>
      resolveOwnerEmail(["--email=owner@example.test"], {
        OWNER_ADMIN_EMAIL: "other@example.test",
      }),
    ).toThrow("invalid_owner_readiness_arguments");
  });

  it("rejects missing, ambiguous, and unverified users", () => {
    expect(() => selectUniqueConfirmedOwner([], "owner@example.test")).toThrow(
      "staff_user_not_found",
    );
    expect(() =>
      selectUniqueConfirmedOwner(
        [
          user("b1000000-0000-4000-8000-000000000001", "owner@example.test"),
          user("b1000000-0000-4000-8000-000000000002", "OWNER@example.test"),
        ],
        "owner@example.test",
      ),
    ).toThrow("staff_user_ambiguous");
    expect(() =>
      selectUniqueConfirmedOwner(
        [user("b1000000-0000-4000-8000-000000000001", "owner@example.test", false)],
        "owner@example.test",
      ),
    ).toThrow("staff_user_not_verified");
  });

  it("requires a matching current AAL2 session and verified MFA", () => {
    const base = {
      authUserId: "b1000000-0000-4000-8000-000000000001",
      sessionUserId: "b1000000-0000-4000-8000-000000000001",
      mfaVerified: true,
      currentAal: "aal2",
    };
    expect(() => assertOwnerSessionProof(base)).not.toThrow();
    expect(() => assertOwnerSessionProof({ ...base, mfaVerified: false })).toThrow(
      "staff_user_mfa_required",
    );
    expect(() => assertOwnerSessionProof({ ...base, currentAal: "aal1" })).toThrow(
      "mfa_assurance_insufficient",
    );
    expect(() =>
      assertOwnerSessionProof({
        ...base,
        sessionUserId: "b1000000-0000-4000-8000-000000000002",
      }),
    ).toThrow("owner_session_identity_mismatch");
    expect(() => assertOwnerSessionProof({ ...base, sessionUserId: null })).toThrow(
      "owner_session_invalid",
    );
  });

  it("returns a safe report without token, factor, or full-email material", () => {
    const evidence: OwnerReadinessEvidence = {
      runtime: {
        environment: "staging",
        projectRef: "srdrflfrfpwixsllveid",
        url: "https://srdrflfrfpwixsllveid.supabase.co",
      },
      authUserId: "b1000000-0000-4000-8000-000000000001",
      maskedEmail: "o***@e***.test",
      currentAal: "aal2",
      database: {
        authUserId: "b1000000-0000-4000-8000-000000000001",
        authUserExists: true,
        emailVerified: true,
        mfaVerified: true,
        staffPrincipalExists: false,
        staffPrincipalStatus: null,
        activeAssignmentCount: 0,
        targetHasPlatformAdmin: false,
        activePlatformAdminCount: 0,
        bootstrapEligible: true,
        readinessCode: "eligible",
      },
    };
    const serialized = JSON.stringify(ownerReadinessReport(evidence));
    expect(serialized).toContain('"ready":true');
    expect(serialized).not.toContain("owner@example.test");
    expect(serialized).not.toMatch(/access.?token|refresh.?token|password|secret|factor/i);
  });

  it("uses stable typed failures", () => {
    expect(new OwnerReadinessError("owner_session_invalid").code).toBe("owner_session_invalid");
  });
});
