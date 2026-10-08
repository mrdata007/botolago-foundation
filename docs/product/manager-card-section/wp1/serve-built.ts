/**
 * Serves one tree's production build (`<treeDir>/.output`) on a single port, with the smoke
 * test's stub backend behind it, so a browser can load the built app with no network beyond this
 * machine. The Worker module runs under Bun, as `tests/e2e/built-output-serve.ts` does; the stub
 * answers from the mock repositories on an ephemeral port and is reached through this server, so
 * the build only has to know one origin.
 *
 *   bun --no-env-file --preload ./docs/product/manager-card-section/wp1/fixed-date.ts \
 *     docs/product/manager-card-section/wp1/serve-built.ts <treeDir> [port=4187]
 */
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { startStubSupabase } from "../../../../tests/e2e/stub-supabase";

const [treeDir, portArg = "4187"] = process.argv.slice(2);
if (!treeDir) throw new Error("usage: serve-built.ts <treeDir> [port]");

const output = join(treeDir, ".output");
const publicDir = join(output, "public");
const ASSETS = {
  async fetch(request: Request): Promise<Response> {
    const path = normalize(join(publicDir, decodeURIComponent(new URL(request.url).pathname)));
    if (!path.startsWith(publicDir + sep)) return new Response("Not Found", { status: 404 });
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    const headers = new Headers();
    if (path.startsWith(join(publicDir, "assets") + sep)) {
      headers.set("cache-control", "public, max-age=31536000, immutable");
    }
    return new Response(file, { headers });
  },
};

const worker = (await import(pathToFileURL(join(output, "server", "index.mjs")).href)).default as {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
};
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} };
const stub = startStubSupabase(0);
const STUB_PATHS = /^\/(rest|auth|storage|functions|realtime|__stub)\//;

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(portArg),
  async fetch(request) {
    const url = new URL(request.url);
    if (STUB_PATHS.test(url.pathname)) {
      const target = new URL(url.pathname + url.search, `http://127.0.0.1:${stub.server.port}`);
      return fetch(target, {
        method: request.method,
        headers: request.headers,
        body:
          request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      });
    }
    return worker.fetch(request, { ASSETS }, ctx);
  },
});
console.log(`Built tree ${treeDir} on http://127.0.0.1:${portArg} (stub backend behind it)`);
