import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A browser that blocks site data throws on the first touch of `localStorage`
// rather than returning null. The login code read it unguarded in two places —
// the Supabase client's options and the guest flag — and either one put the
// whole app on the error screen at start-up, on every page.

// `mock.module` is process-wide: the replacement stays in place for every test
// file Bun runs after this one. Mocked with `supabase` alone, the client lost
// `createSupabaseFetch`, and client.test.ts failed whenever it ran later
// (audit 2026-09-25, A15). So every real export is kept, only `supabase.auth`
// is replaced, and the real module goes back once this file is done. v2-client
// copies `supabase` once, when it first loads, and a restore cannot reach that
// copy: so the stand-in wraps the real client and switches itself off too.
const realClient = { ...(await import("../integrations/supabase/client")) };
const signedOutAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  // As auth-js does: a new subscriber hears the stored session (none) once.
  onAuthStateChange: (listener: (event: string, session: null) => void) => {
    void Promise.resolve().then(() => listener("INITIAL_SESSION", null));
    return { data: { subscription: { unsubscribe() {} } } };
  },
  signOut: async () => ({ error: null }),
};
let standingIn = true;
mock.module("../integrations/supabase/client", () => ({
  ...realClient,
  supabase: new Proxy(realClient.supabase, {
    get: (target, key) => (standingIn && key === "auth" ? signedOutAuth : Reflect.get(target, key)),
  }),
}));
afterAll(() => {
  standingIn = false;
  mock.module("../integrations/supabase/client", () => realClient);
});

const { SupabaseAuthService } = await import("./auth-supabase");

const scope = globalThis as { window?: unknown };
let savedWindow: unknown;

beforeAll(() => {
  savedWindow = scope.window;
  scope.window = {
    get localStorage(): Storage {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    },
  };
});

afterAll(() => {
  scope.window = savedWindow;
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A fresh service, subscribed the way AuthProvider does, with every status it reports. */
async function startService() {
  const service = new SupabaseAuthService();
  const statuses: string[] = [];
  service.subscribeToSession((session) => statuses.push(session.status));
  await tick();
  return { service, statuses };
}

describe("login with site data blocked", () => {
  it("starts, and settles as signed out", async () => {
    const { statuses } = await startService();
    expect(statuses).toEqual(["loading", "anonymous"]);
  });

  it("lets a visitor continue as a guest for the rest of the page", async () => {
    const { service, statuses } = await startService();
    expect(await service.continueAsGuest()).toEqual({ ok: true });
    await tick();
    expect(statuses.at(-1)).toBe("guest");
  });

  it("finishes signing out, local data reset included", async () => {
    const { service, statuses } = await startService();
    await service.continueAsGuest();
    await service.signOut({ resetLocalData: true });
    expect(statuses.at(-1)).toBe("anonymous");
  });

  it("leaves storage to auth-js in the Supabase client", () => {
    // client.ts is marked as generated. Regenerated with `storage: localStorage`
    // — or any other read of that global outside a try — it takes the app down
    // again, before any of the guarding above gets a chance to run.
    const source = readFileSync(
      join(import.meta.dir, "../integrations/supabase/client.ts"),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\blocalStorage\b/);
  });
});
