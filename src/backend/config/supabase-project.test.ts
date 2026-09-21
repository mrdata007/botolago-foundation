import { afterEach, describe, expect, it } from "bun:test";
import {
  applicationProjectRef,
  assertServerProjectMatchesApplication,
  projectRefOf,
  SupabaseProjectMismatchError,
} from "./supabase-project";

const PROD = "tkewgajrljbwgwedqsxn";
const saved = process.env.VITE_SUPABASE_PROJECT_ID;

afterEach(() => {
  if (saved === undefined) delete process.env.VITE_SUPABASE_PROJECT_ID;
  else process.env.VITE_SUPABASE_PROJECT_ID = saved;
});

describe("projectRefOf", () => {
  it("reads the ref from a Supabase URL", () => {
    expect(projectRefOf(`https://${PROD}.supabase.co`)).toBe(PROD);
    expect(projectRefOf(`https://${PROD}.supabase.co/`)).toBe(PROD);
    expect(projectRefOf(`  https://${PROD}.supabase.co  `)).toBe(PROD);
  });

  it("treats a local stack as unknown rather than guessing a ref", () => {
    // A guard that fired on localhost would block every local worker.
    for (const url of [
      "http://127.0.0.1:55321",
      "http://localhost:54321",
      "http://supabase:8000",
    ]) {
      expect(projectRefOf(url)).toBeUndefined();
    }
  });

  it("returns nothing for absent or unparseable values", () => {
    for (const url of [undefined, null, "", "   ", "not a url", "://broken"]) {
      expect(projectRefOf(url)).toBeUndefined();
    }
  });
});

describe("assertServerProjectMatchesApplication", () => {
  it("refuses a privileged client pointed at another project", () => {
    // The failure this exists to prevent: a service-role worker writing real
    // production content into a database nobody is looking at.
    process.env.VITE_SUPABASE_PROJECT_ID = PROD;
    expect(() =>
      assertServerProjectMatchesApplication("https://someotherproject.supabase.co"),
    ).toThrow(SupabaseProjectMismatchError);
  });

  it("names both projects so the misconfiguration is actionable", () => {
    process.env.VITE_SUPABASE_PROJECT_ID = PROD;
    try {
      assertServerProjectMatchesApplication("https://someotherproject.supabase.co");
      throw new Error("expected a throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("someotherproject");
      expect(message).toContain(PROD);
      expect(message).toContain("SUPABASE_URL");
    }
  });

  it("allows a matching project", () => {
    process.env.VITE_SUPABASE_PROJECT_ID = PROD;
    expect(() =>
      assertServerProjectMatchesApplication(`https://${PROD}.supabase.co`),
    ).not.toThrow();
  });

  it("stays silent when either side is unknown", () => {
    // Nothing to compare is not a mismatch. A local stack, or a build with no
    // project configured, must not be blocked by this guard.
    process.env.VITE_SUPABASE_PROJECT_ID = PROD;
    expect(() => assertServerProjectMatchesApplication("http://127.0.0.1:55321")).not.toThrow();
    expect(() => assertServerProjectMatchesApplication(undefined)).not.toThrow();

    delete process.env.VITE_SUPABASE_PROJECT_ID;
    if (!applicationProjectRef()) {
      expect(() =>
        assertServerProjectMatchesApplication("https://someotherproject.supabase.co"),
      ).not.toThrow();
    }
  });

  it("never puts a credential in the error message", () => {
    process.env.VITE_SUPABASE_PROJECT_ID = PROD;
    try {
      assertServerProjectMatchesApplication("https://someotherproject.supabase.co");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toMatch(/service_role|sb_secret|eyJ|SERVICE_ROLE_KEY=/);
    }
  });
});

describe("the workers actually invoke the guard", () => {
  // The guard is worthless if a gateway forgets to call it, and nothing else
  // would notice: the worker would simply succeed against the wrong database.
  it("is called by every service-role gateway before the client is built", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(import.meta.dir, "..", "..", "..");
    for (const file of [
      "src/backend/news/ingestion/supabase-gateway.server.ts",
      "src/backend/notifications/worker/gateway.server.ts",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toContain("assertServerProjectMatchesApplication");
      const guardAt = source.indexOf("assertServerProjectMatchesApplication(url)");
      const createAt = source.indexOf("createClient<Database>(url");
      expect(guardAt).toBeGreaterThan(-1);
      expect(createAt).toBeGreaterThan(-1);
      expect(guardAt).toBeLessThan(createAt);
    }
  });
});
