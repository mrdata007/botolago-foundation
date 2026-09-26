/**
 * Serves the production build in `.output` for the smoke test, plus the stub
 * backend it was built against (built-output-env.ts).
 *
 * The build is Nitro's `cloudflare-module` output, the target the site
 * deploys with: a Worker whose `fetch(request, env, ctx)` hands public files
 * to an `ASSETS` binding. This runs that same module and gives it an `ASSETS`
 * that reads `.output/public`, which is what Lovable's own prerender preview
 * does with it too.
 *
 * It runs under Bun, not workerd: the module, its bundle and the binding's
 * shape are the deployed ones, the runtime is not. A fault only the Workers
 * runtime has -- a Node API `nodejs_compat` lacks, `process.env` read at the
 * wrong moment, a static file the platform answers before the Worker sees the
 * request -- will not show here. Closing that gap means `wrangler dev` over
 * `.output/server/wrangler.json`, which the repository does not depend on.
 *
 * Playwright starts it (`E2E_BUILT_OUTPUT=1`), or by hand:
 *
 *   bun tests/e2e/built-output-build.ts && bun --no-env-file tests/e2e/built-output-serve.ts
 *
 * `--no-env-file` keeps a local `.env` out of this process: parts of the
 * server code read SUPABASE_URL and the Supabase keys from the environment
 * rather than the build.
 */
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertBuiltAgainstStub,
  BUILT_OUTPUT_ORIGIN,
  BUILT_OUTPUT_PORT,
  OUTPUT_DIR,
  STUB_SUPABASE_ORIGIN,
  STUB_SUPABASE_PORT,
} from "./built-output-env";
import { startStubSupabase } from "./stub-supabase";

type Worker = {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
};

assertBuiltAgainstStub();

const publicDir = join(OUTPUT_DIR, "public");

/** The Workers static-assets binding, over `.output/public`. */
const ASSETS = {
  async fetch(request: Request): Promise<Response> {
    const path = normalize(join(publicDir, decodeURIComponent(new URL(request.url).pathname)));
    if (!path.startsWith(publicDir + sep)) return new Response("Not Found", { status: 404 });
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    const headers = new Headers();
    // `.output/public/_headers` marks the hashed bundle immutable.
    if (path.startsWith(join(publicDir, "assets") + sep)) {
      headers.set("cache-control", "public, max-age=31536000, immutable");
    }
    return new Response(file, { headers });
  },
};

const worker = (await import(pathToFileURL(join(OUTPUT_DIR, "server", "index.mjs")).href))
  .default as Worker;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} };

startStubSupabase(STUB_SUPABASE_PORT);
Bun.serve({
  hostname: "127.0.0.1",
  port: BUILT_OUTPUT_PORT,
  fetch: (request) => worker.fetch(request, { ASSETS }, ctx),
});

console.log(`Production build on ${BUILT_OUTPUT_ORIGIN}, stub backend on ${STUB_SUPABASE_ORIGIN}`);
