import { describe, expect, test } from "bun:test";
import {
  APPLY_CONFIRMATION,
  PRODUCTION_PROJECT_REF,
  bridgeGuard,
  managementGuard,
  mappingSql,
  orderedRows,
  parseEvents,
  parseTeams,
} from "./sofascore-id-bridge";

const STAGING = "https://abcdefghijklmnopqrst.supabase.co";

describe("bridgeGuard", () => {
  test("dry-run needs nothing and returns no connection", () => {
    expect(bridgeGuard("dry-run", {})).toBeNull();
  });
  test("apply refuses production", () => {
    expect(() =>
      bridgeGuard("apply", {
        SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
        SUPABASE_SECRET_KEY: "k",
        SOFASCORE_ID_BRIDGE_CONFIRMATION: APPLY_CONFIRMATION,
      }),
    ).toThrow("production_refused");
  });
  test("apply needs the confirmation and a secret", () => {
    expect(() => bridgeGuard("apply", { SUPABASE_URL: STAGING, SUPABASE_SECRET_KEY: "k" })).toThrow(
      "confirmation_missing",
    );
    expect(() =>
      bridgeGuard("apply", {
        SUPABASE_URL: STAGING,
        SOFASCORE_ID_BRIDGE_CONFIRMATION: APPLY_CONFIRMATION,
      }),
    ).toThrow("secret_missing");
  });
  test("apply on staging with confirmation passes", () => {
    expect(
      bridgeGuard("apply", {
        SUPABASE_URL: STAGING,
        SUPABASE_SECRET_KEY: "k",
        SOFASCORE_ID_BRIDGE_CONFIRMATION: APPLY_CONFIRMATION,
      }),
    ).toEqual({ url: STAGING, secret: "k" });
  });
});

describe("input parsing", () => {
  test("rejects malformed events and team uuids", () => {
    expect(() => parseEvents([{ id: 1 }])).toThrow("malformed");
    expect(() => parseTeams({ "55035": "nope" })).toThrow("teams_invalid");
  });
  test("rows are ordered parents first", () => {
    const rows = orderedRows([
      { entityType: "fixture", externalId: "1", internalId: "a", flags: [] },
      { entityType: "competition", externalId: "937", internalId: "b", flags: [] },
    ]);
    expect(rows.map((r) => r.entityType)).toEqual(["competition", "fixture"]);
  });
});

describe("management apply path", () => {
  const env = {
    SUPABASE_ACCESS_TOKEN: "t",
    SUPABASE_STAGING_PROJECT_REF: "abcdefghijklmnopqrst",
    SOFASCORE_ID_BRIDGE_CONFIRMATION: APPLY_CONFIRMATION,
  };
  test("uses the staging ref and needs the confirmation", () => {
    expect(managementGuard(env)).toEqual({ ref: "abcdefghijklmnopqrst", token: "t" });
    expect(managementGuard({})).toBeNull();
    expect(() => managementGuard({ ...env, SOFASCORE_ID_BRIDGE_CONFIRMATION: undefined })).toThrow(
      "confirmation_missing",
    );
  });
  test("refuses production and malformed refs", () => {
    expect(() =>
      managementGuard({ ...env, SUPABASE_STAGING_PROJECT_REF: PRODUCTION_PROJECT_REF }),
    ).toThrow("production_refused");
    expect(() => managementGuard({ ...env, SUPABASE_STAGING_PROJECT_REF: "x" })).toThrow(
      "url_invalid",
    );
  });
  test("builds the call from validated values only", () => {
    const row = {
      entityType: "fixture" as const,
      externalId: "16958239",
      internalId: "00000000-0000-4000-8000-000000000001",
      flags: [],
    };
    expect(mappingSql(row)).toContain("api.resolve_football_mapping('sofascore', 'fixture'");
    expect(() => mappingSql({ ...row, externalId: "1'); drop table x; --" })).toThrow(
      "literal_invalid",
    );
  });
});
