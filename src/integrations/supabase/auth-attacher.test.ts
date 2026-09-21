import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// `attachSupabaseAuth` is the only thing that puts the signed-in user's bearer
// token on a serverFn RPC. If it stops being registered as a global
// `functionMiddleware`, every server-side identity check silently degrades to
// "no token" -- the Admin console renders "Authentification requise" for a
// perfectly valid session, and nothing else fails loudly enough to notice.
//
// The middleware itself lives in a generated file, so this asserts the wiring
// rather than editing it: the registration, and the two properties that make it
// safe (token read from the live session, never logged or persisted).

const root = join(import.meta.dir, "..", "..", "..");
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

describe("Supabase bearer-token attachment", () => {
  it("is registered as a global functionMiddleware in the start instance", () => {
    const start = read("src/start.ts");
    expect(start).toContain("attachSupabaseAuth");
    const registration = start.match(/functionMiddleware:\s*\[([^\]]*)\]/);
    expect(registration).not.toBeNull();
    expect(registration![1]).toContain("attachSupabaseAuth");
  });

  it("builds the header from the live Supabase session", () => {
    const attacher = read("src/integrations/supabase/auth-attacher.ts");
    expect(attacher).toContain("auth.getSession()");
    expect(attacher).toContain("Authorization");
    expect(attacher).toContain("Bearer ");
  });

  it("sends no Authorization header when there is no session", () => {
    // A guest must not be given an empty or literal-undefined bearer value:
    // the server has to be able to tell "no token" from "bad token".
    const attacher = read("src/integrations/supabase/auth-attacher.ts");
    expect(attacher).toMatch(/token\s*\?\s*\{\s*Authorization:[\s\S]*?\}\s*:\s*\{\s*\}/);
  });

  it("never logs or persists the access token", () => {
    const attacher = read("src/integrations/supabase/auth-attacher.ts");
    expect(attacher).not.toMatch(/console\.(log|info|warn|error|debug)/);
    expect(attacher).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });
});
