import { describe, expect, it } from "bun:test";
import {
  AdminRuntimeError,
  deriveSupabaseProjectRef,
  isDirectAdminCommand,
  maskRuntimeEmail,
  requireServerOnlyKey,
  resolveAdminRuntimeGuard,
  sanitizeOperatorReason,
} from "./admin-runtime";

const STAGING_REF = "srdrflfrfpwixsllveid";

describe("Admin trusted runtime guard", () => {
  it("derives only a valid hosted project ref or local target", () => {
    expect(deriveSupabaseProjectRef(`https://${STAGING_REF}.supabase.co`)).toBe(STAGING_REF);
    expect(deriveSupabaseProjectRef("http://127.0.0.1:54321")).toBe("local");
    expect(() => deriveSupabaseProjectRef("http://remote.example.test")).toThrow(
      "invalid_supabase_url",
    );
  });

  it("requires the declared environment and exact project ref to agree", () => {
    expect(
      resolveAdminRuntimeGuard({
        BOTOLAGO_ADMIN_ENVIRONMENT: "staging",
        BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF: STAGING_REF,
        SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
      }),
    ).toEqual({
      environment: "staging",
      projectRef: STAGING_REF,
      url: `https://${STAGING_REF}.supabase.co`,
    });
    expect(() =>
      resolveAdminRuntimeGuard({
        BOTOLAGO_ADMIN_ENVIRONMENT: "staging",
        BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF: "differentproject0001",
        SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
      }),
    ).toThrow("admin_project_ref_mismatch");
  });

  it("fails closed on production without the exact purpose confirmation", () => {
    const values = {
      BOTOLAGO_ADMIN_ENVIRONMENT: "production",
      BOTOLAGO_ADMIN_EXPECTED_PROJECT_REF: STAGING_REF,
      SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    };
    expect(() =>
      resolveAdminRuntimeGuard(values, {
        confirmationVariable: "BOTOLAGO_ADMIN_PRODUCTION_CONFIRMATION",
        requiredConfirmation: "EXACT_CONFIRMATION",
      }),
    ).toThrow("production_not_authorized");
    expect(
      resolveAdminRuntimeGuard(
        { ...values, BOTOLAGO_ADMIN_PRODUCTION_CONFIRMATION: "EXACT_CONFIRMATION" },
        {
          confirmationVariable: "BOTOLAGO_ADMIN_PRODUCTION_CONFIRMATION",
          requiredConfirmation: "EXACT_CONFIRMATION",
        },
      ).environment,
    ).toBe("production");
  });

  it("rejects publishable or placeholder credentials in trusted commands", () => {
    expect(() =>
      requireServerOnlyKey(
        { SUPABASE_SECRET_KEY: "sb_publishable_not_server_only" },
        "SUPABASE_SECRET_KEY",
        "staging",
      ),
    ).toThrow("server_credential_required");
    expect(
      requireServerOnlyKey(
        { SUPABASE_SECRET_KEY: "sb_secret_runtime_only" },
        "SUPABASE_SECRET_KEY",
        "staging",
      ),
    ).toBe("sb_secret_runtime_only");
  });

  it("masks owner email and rejects secret-like operator reasons", () => {
    expect(maskRuntimeEmail("owner@example.test")).toBe("o***@e***.test");
    expect(sanitizeOperatorReason("Replay after reviewed provider recovery.")).toBe(
      "Replay after reviewed provider recovery.",
    );
    expect(() => sanitizeOperatorReason("contains access token details")).toThrow(
      AdminRuntimeError,
    );
  });

  it("runs command bodies only for the direct Bun entrypoint", () => {
    expect(isDirectAdminCommand("file:///tmp/admin-command.ts", "/tmp/admin-command.ts")).toBe(
      true,
    );
    expect(isDirectAdminCommand("file:///tmp/admin-command.ts", "/tmp/admin-command.test.ts")).toBe(
      false,
    );
    expect(isDirectAdminCommand("file:///tmp/admin-command.ts", "")).toBe(false);
  });
});
