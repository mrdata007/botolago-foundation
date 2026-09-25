import { afterAll, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// `attachSupabaseAuth` is the only thing that puts the signed-in user's bearer
// token on a serverFn RPC. If it stops attaching, or stops being registered as
// a global `functionMiddleware`, every server-side identity check silently
// degrades to "no token": the Admin console renders "Authentification requise"
// for a perfectly valid session and nothing else fails loudly enough to notice.

let session: { access_token: string } | null = null;

// `mock.module` is process-wide, so a mock exporting `supabase` alone took
// `createSupabaseFetch` away from client.test.ts whenever that ran later
// (audit 2026-09-25, A15). Keep every real export, replace only
// `supabase.auth`, and put the real module back once this file is done. The
// stand-in wraps the real client and switches itself off with the restore, so
// a module that kept its own copy of `supabase` (v2-client does) is not left
// holding it.
const realClient = { ...(await import("./client")) };
const sessionAuth = {
  getSession: async () => ({ data: { session }, error: null }),
};
let standingIn = true;
mock.module("./client", () => ({
  ...realClient,
  supabase: new Proxy(realClient.supabase, {
    get: (target, key) => (standingIn && key === "auth" ? sessionAuth : Reflect.get(target, key)),
  }),
}));
afterAll(() => {
  standingIn = false;
  mock.module("./client", () => realClient);
});

const { attachSupabaseAuth } = await import("./auth-attacher");

/** Runs the middleware's client half and returns what it handed to `next`. */
async function runMiddleware(): Promise<{ headers?: Record<string, string> }> {
  const client = (
    attachSupabaseAuth as unknown as {
      options: { client: (ctx: { next: (arg: unknown) => unknown }) => Promise<unknown> };
    }
  ).options.client;
  let passed: { headers?: Record<string, string> } = {};
  await client({
    next: (arg) => {
      passed = arg as { headers?: Record<string, string> };
      return arg;
    },
  });
  return passed;
}

describe("attachSupabaseAuth behaviour", () => {
  it("attaches the signed-in user's token as a bearer header", async () => {
    session = { access_token: "token-abc" };
    expect((await runMiddleware()).headers).toEqual({ Authorization: "Bearer token-abc" });
  });

  it("sends no Authorization header at all for a guest", async () => {
    // Not an empty or literal-undefined bearer value: the server has to be able
    // to tell "no token" from "bad token", and those produce different states.
    session = null;
    const headers = (await runMiddleware()).headers;
    expect(headers).toEqual({});
    expect(JSON.stringify(headers)).not.toContain("Bearer");
  });

  it("re-reads the session on every call rather than caching the first token", async () => {
    // A cached token would keep sending a stale credential after sign-out or
    // refresh -- and a stale token is exactly what an expired-token bug looks
    // like from the server side.
    session = { access_token: "first" };
    expect((await runMiddleware()).headers).toEqual({ Authorization: "Bearer first" });
    session = { access_token: "second" };
    expect((await runMiddleware()).headers).toEqual({ Authorization: "Bearer second" });
    session = null;
    expect((await runMiddleware()).headers).toEqual({});
  });

  it("never logs or persists the access token", async () => {
    const calls: unknown[] = [];
    const levels = ["log", "info", "warn", "error", "debug"] as const;
    const originals = levels.map((level) => [level, console[level]] as const);
    for (const level of levels) console[level] = (...args: unknown[]) => calls.push(args);
    try {
      session = { access_token: "secret-token" };
      await runMiddleware();
    } finally {
      for (const [level, fn] of originals) console[level] = fn;
    }
    expect(JSON.stringify(calls)).not.toContain("secret-token");
    expect(calls).toHaveLength(0);
  });
});

describe("attachSupabaseAuth registration", () => {
  const root = join(import.meta.dir, "..", "..", "..");

  /** `src/start.ts` with comments removed, so a commented-out line cannot pass. */
  function startSourceWithoutComments(): string {
    return readFileSync(join(root, "src/start.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  it("is registered as a global functionMiddleware, not merely mentioned", () => {
    const start = startSourceWithoutComments();
    const registration = start.match(/functionMiddleware:\s*\[([\s\S]*?)\]/);
    expect(registration).not.toBeNull();
    expect(registration![1]).toContain("attachSupabaseAuth");
  });

  it("imports the attacher it registers", () => {
    expect(startSourceWithoutComments()).toMatch(
      /import\s*\{[^}]*attachSupabaseAuth[^}]*\}\s*from/,
    );
  });

  it("would fail if the registration were commented out", () => {
    // Guards the guard: the previous version of this test passed on a
    // commented-out registration, which is precisely the regression it claimed
    // to catch.
    const commentedOut = "// functionMiddleware: [attachSupabaseAuth],"
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(commentedOut).not.toContain("attachSupabaseAuth");
  });
});
