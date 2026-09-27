import { describe, expect, it } from "bun:test";
import { join } from "node:path";

/**
 * A server render that stops waiting for its data must also stop the reads
 * (audit 2026-09-26). `prefetchForSsr` cancels its queries at the budget, but
 * a query's cancellation only reaches the network through the abort signal
 * React Query hands its `queryFn`: the football reads ignored it, so every
 * read a render gave up on ran on to the client's own 10 s timeout, holding a
 * connection and a database slot for a page that had already gone out.
 *
 * Each page's real loader runs against a local server that never answers the
 * football RPCs and counts the requests whose client went away. It runs in a
 * child process: the Supabase client is a module singleton configured from
 * the environment, which must not leak into the rest of the suite.
 */

const root = join(import.meta.dir, "../..");

type Outcome = { waited: number; received: number; aborted: number };

function runLoader(route: string, call: string): Outcome {
  const script = `
    import { QueryClient } from "@tanstack/react-query";
    let received = 0;
    let aborted = 0;
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        if (!new URL(request.url).pathname.includes("/rpc/football_")) {
          return new Response("[]", { headers: { "content-type": "application/json" } });
        }
        received += 1;
        return new Promise((resolve) => {
          request.signal.addEventListener("abort", () => {
            aborted += 1;
            resolve(new Response(null, { status: 499 }));
          });
        });
      },
    });
    process.env.SUPABASE_URL = "http://127.0.0.1:" + server.port;
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.VITE_FOOTBALL_DATA_MODE = "supabase";
    const { Route } = await import(${JSON.stringify(join(root, route))});
    const queryClient = new QueryClient();
    const loader = Route.options.loader;
    const started = Date.now();
    await ${call};
    const waited = Date.now() - started;
    // The aborts reach the server a moment after the render moved on.
    await Bun.sleep(300);
    process.stdout.write(JSON.stringify({ waited, received, aborted }));
    server.stop(true);
    process.exit(0);
  `;
  const proc = Bun.spawnSync(["bun", "-e", script], { cwd: root, env: { ...process.env } });
  if (!proc.success) throw new Error(`${route} failed: ${proc.stderr.toString()}`);
  return JSON.parse(proc.stdout.toString()) as Outcome;
}

describe("server render past its budget", () => {
  const pages: [string, string, string][] = [
    ["home", "src/routes/index.tsx", "loader({ context: { queryClient } })"],
    [
      "matches",
      "src/routes/matches.index.tsx",
      "loader.handler({ context: { queryClient }, deps: {} })",
    ],
    [
      "standings",
      "src/routes/matches.standings.tsx",
      "loader({ context: { queryClient }, deps: {} })",
    ],
    ["clubs", "src/routes/clubs.index.tsx", "loader({ context: { queryClient } })"],
  ];

  for (const [name, route, call] of pages) {
    it(`aborts the ${name} page's football reads it stopped waiting for`, () => {
      const outcome = runLoader(route, call);
      expect(outcome.waited).toBeLessThan(5_000);
      expect(outcome.received).toBeGreaterThan(0);
      expect(outcome).toEqual({ ...outcome, aborted: outcome.received });
    }, 20_000);
  }
});
