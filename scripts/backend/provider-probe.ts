/**
 * Phase 0 probe for the Sofascore + Flashscore Fantasy plan
 * (docs/backend/FANTASY_SOFASCORE_FLASHSCORE_PLAN.md). Read-only: no database.
 *
 *   RAPIDAPI_KEY=... FLASHSCORE_RAPIDAPI_HOST=... \
 *     bun scripts/backend/provider-probe.ts <sofascore|flashscore> <path-and-query> [--out dir]
 *
 * The key is read from the environment and sent only as a header. It is never
 * printed, logged or put in a URL. Raw responses are written only to --out,
 * which must be outside the repository (public repo, third-party data).
 * Trimmed fixtures are committed separately, after the real field names have
 * been read from these responses.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HOSTS = {
  sofascore: "sofascore.p.rapidapi.com",
  // The FlashLive host is read from the RapidAPI playground, not assumed.
  flashscore: process.env.FLASHSCORE_RAPIDAPI_HOST ?? "",
} as const;

/** Stop when RapidAPI says fewer than this many requests remain. */
const MIN_REMAINING = 100;

let requestCount = 0;

export function requestsUsed() {
  return requestCount;
}

/** Rate-limit headers only; nothing else from the response is echoed. */
export function readQuota(headers: Headers) {
  const num = (name: string) => {
    const raw = headers.get(name);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    limit: num("x-ratelimit-requests-limit"),
    remaining: num("x-ratelimit-requests-remaining"),
  };
}

export async function probe(provider: keyof typeof HOSTS, pathAndQuery: string) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not set");
  const host = HOSTS[provider];
  if (!host) throw new Error(`No host configured for ${provider}`);
  if (/key=/i.test(pathAndQuery)) throw new Error("Never put a key in the URL");

  requestCount += 1;
  const response = await fetch(`https://${host}/${pathAndQuery.replace(/^\//, "")}`, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": host },
    signal: AbortSignal.timeout(30_000),
  });
  const quota = readQuota(response.headers);
  const body = await response.text();
  if (quota.remaining !== null && quota.remaining < MIN_REMAINING) {
    throw new Error(`Quota low (${quota.remaining} left): stopping before the next call`);
  }
  return { status: response.status, quota, body };
}

/** Field paths and types only, never values: safe to print in public logs. */
export function shapeOf(value: unknown, path = "$", out: string[] = []): string[] {
  if (out.length > 400) return out;
  if (Array.isArray(value)) {
    out.push(`${path}: array(${value.length})`);
    if (value.length > 0) shapeOf(value[0], `${path}[]`, out);
  } else if (value !== null && typeof value === "object") {
    for (const [name, child] of Object.entries(value)) shapeOf(child, `${path}.${name}`, out);
  } else {
    out.push(`${path}: ${value === null ? "null" : typeof value}`);
  }
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const [provider, ...rest] = args;
  const shape = rest.includes("--shape");
  const outAt = rest.indexOf("--out");
  const outDir = outAt >= 0 ? rest[outAt + 1] : undefined;
  const paths = rest.filter((a, i) => !a.startsWith("--") && i !== outAt + 1);
  if ((provider !== "sofascore" && provider !== "flashscore") || paths.length === 0) {
    console.error(
      "usage: provider-probe.ts <sofascore|flashscore> <path-and-query>... [--shape] [--out dir]",
    );
    process.exit(2);
  }
  for (const path of paths) {
    const result = await probe(provider, path);
    console.log(
      JSON.stringify({
        provider,
        path,
        status: result.status,
        bytes: result.body.length,
        quota: result.quota,
        requestsThisRun: requestsUsed(),
      }),
    );
    if (shape) {
      try {
        console.log(shapeOf(JSON.parse(result.body)).join("\n"));
      } catch {
        console.log("(response is not JSON)");
      }
    }
    if (outDir) {
      const dir = resolve(outDir);
      if (dir.startsWith(resolve(import.meta.dir, "../.."))) {
        throw new Error("--out must be outside the repository");
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, `${provider}-${path.replace(/[^\w]+/g, "_")}.json`), result.body);
    }
  }
}
