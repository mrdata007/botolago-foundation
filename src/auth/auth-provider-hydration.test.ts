import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// React hydration compares the client's FIRST render against the server's
// markup. Anything read during that render which the server cannot see -- a
// localStorage flag, a media query, Date.now() -- makes the two disagree, and
// React responds by discarding the server tree and rebuilding it from scratch.
//
// That is what happened on /profile in guest state: authService.getSession()
// has a fast-path that reads the guest flag from localStorage, the AuthProvider
// called it from a useState initialiser, and the server (which has no
// localStorage) had rendered the signed-out card while the client drew the
// guest one. React #418, on the single provider that wraps every route.

const root = join(import.meta.dir, "..", "..");
const provider = readFileSync(join(root, "src/auth/AuthProvider.tsx"), "utf8");

describe("AuthProvider hydration", () => {
  it("does not call getSession() during render", () => {
    // Both spellings of the mistake: a lazy initialiser and a direct call.
    expect(provider).not.toMatch(/useState[^)]*\(\s*\(\)\s*=>\s*authService\.getSession\(\)/);
    expect(provider).not.toMatch(/useState<AuthSession>\(\s*authService\.getSession\(\)/);
  });

  it("seeds state with exactly what the server renders", () => {
    // auth-supabase.ts: `if (!hasWindow()) return { user: null, status: "loading" }`.
    // The seed has to match that, or the first client render disagrees again.
    expect(provider).toMatch(
      /useState<AuthSession>\(\{\s*user:\s*null,\s*status:\s*"loading"\s*,?\s*\}\)/,
    );
  });

  it("still subscribes, so the real session arrives immediately after mount", () => {
    // The seed is only safe because subscribeToSession pushes the current
    // session synchronously when it subscribes. Without this the app would be
    // stuck reporting "loading" forever.
    expect(provider).toContain("authService.subscribeToSession(setSession)");
  });

  it("the service really does report loading with no window", () => {
    const service = readFileSync(join(root, "src/services/auth-supabase.ts"), "utf8");
    expect(service).toContain('if (!hasWindow()) return { user: null, status: "loading" };');
    // And the guest fast-path the seed is deliberately deferring is still there.
    expect(service).toContain('return { user: null, status: "guest" };');
  });

  it("subscribeToSession delivers the current session on subscribe", () => {
    const service = readFileSync(join(root, "src/services/auth-supabase.ts"), "utf8");
    const at = service.indexOf("subscribeToSession(");
    expect(at).toBeGreaterThan(-1);
    expect(service.slice(at, at + 260)).toContain("listener(this.getSession())");
  });
});
