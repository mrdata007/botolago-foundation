import { describe, expect, test } from "bun:test";
import {
  databaseGuard,
  exitCodeOf,
  parsePlan,
  PRODUCTION_PROJECT_REF,
  RECORD_CONFIRMATION,
} from "./reconciled-scoring-ingestion";

const STAGING = "https://abcdefghijklmnopqrst.supabase.co";

describe("databaseGuard", () => {
  test("local mode needs nothing and opens no database", () => {
    expect(databaseGuard("local", {})).toBeNull();
  });
  test("production is refused in every database mode", () => {
    for (const mode of ["dry-run", "record"] as const) {
      expect(() =>
        databaseGuard(mode, {
          SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
          SUPABASE_SECRET_KEY: "k",
          RECONCILED_INGESTION_CONFIRMATION: RECORD_CONFIRMATION,
        }),
      ).toThrow("production_refused");
    }
  });
  test("a write needs the typed confirmation; a dry run does not", () => {
    expect(() =>
      databaseGuard("record", { SUPABASE_URL: STAGING, SUPABASE_SECRET_KEY: "k" }),
    ).toThrow("confirmation_missing");
    expect(databaseGuard("dry-run", { SUPABASE_URL: STAGING, SUPABASE_SECRET_KEY: "k" })).toEqual({
      url: STAGING,
      secret: "k",
    });
    expect(
      databaseGuard("record", {
        SUPABASE_URL: `${STAGING}/`,
        SUPABASE_SECRET_KEY: "k",
        RECONCILED_INGESTION_CONFIRMATION: RECORD_CONFIRMATION,
      }),
    ).toEqual({ url: STAGING, secret: "k" });
  });
  test("an odd URL or a missing key is refused", () => {
    expect(() =>
      databaseGuard("dry-run", { SUPABASE_URL: "https://evil.example", SUPABASE_SECRET_KEY: "k" }),
    ).toThrow("url_invalid");
    expect(() => databaseGuard("dry-run", { SUPABASE_URL: STAGING })).toThrow("secret_missing");
  });
});

describe("parsePlan", () => {
  const entry = {
    sofascoreId: "17132481",
    flashscoreId: "W81WOcb5",
    appFixtureId: "f0000000-0000-4000-8000-000000000001",
    homeTeamId: "c1000000-0000-4000-8000-000000000001",
    awayTeamId: "c1000000-0000-4000-8000-000000000002",
  };
  test("accepts a reviewed plan", () => {
    expect(parsePlan([entry])).toEqual([entry]);
  });
  test("refuses an empty plan, a missing field, or a match listed twice", () => {
    expect(() => parsePlan([])).toThrow("plan_invalid");
    expect(() => parsePlan([{ ...entry, homeTeamId: undefined }])).toThrow("homeTeamId");
    expect(() =>
      parsePlan([entry, { ...entry, appFixtureId: "f0000000-0000-4000-8000-000000000002" }]),
    ).toThrow("twice");
  });
});

describe("exitCodeOf", () => {
  const f = (status: string) => ({ outcome: { status } }) as never;
  const report = (...statuses: string[]) =>
    ({ mode: "record", fixtures: statuses.map(f), counts: {}, ok: false }) as never;
  test("refusals outrank uncertainty, which outranks blocks", () => {
    expect(exitCodeOf(report("recorded", "already-recorded"), [])).toBe(0);
    expect(exitCodeOf(report("recorded", "blocked"), [])).toBe(2);
    expect(exitCodeOf(report("uncertain", "blocked"), [])).toBe(3);
    expect(exitCodeOf(report("refused", "uncertain"), [])).toBe(4);
  });
  test("local mode is judged on what was prepared", () => {
    expect(exitCodeOf(null, [{ request: {} } as never])).toBe(0);
    expect(exitCodeOf(null, [{ request: null } as never])).toBe(2);
  });
});
