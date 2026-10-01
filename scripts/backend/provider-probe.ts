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

/** Subtrees that carry no scoring facts and only add noise to the shape. */
export const DEFAULT_SKIP = [
  "fieldTranslations",
  "playerColor",
  "goalkeeperColor",
  "proposedMarketValueRaw",
] as const;

const MAX_ARRAY_ITEMS = 500;
const MAX_SHAPE_LINES = 600;

/**
 * Field paths and the types seen there, merged across every item of every list
 * and counted, so a field present on only some items (a goal's assist, a
 * keeper's saves) shows up with how often it appears. Never prints a value:
 * safe for public logs.
 */
export function shapeOf(value: unknown, skip: readonly string[] = DEFAULT_SKIP): string[] {
  const seen = new Map<string, { types: Set<string>; count: number; min: number; max: number }>();
  const note = (path: string, type: string, length = 0) => {
    const entry = seen.get(path) ?? { types: new Set(), count: 0, min: length, max: length };
    entry.types.add(type);
    entry.count += 1;
    entry.min = Math.min(entry.min, length);
    entry.max = Math.max(entry.max, length);
    seen.set(path, entry);
  };
  const walk = (node: unknown, path: string) => {
    if (skip.some((part) => path.includes(part))) return;
    if (Array.isArray(node)) {
      note(path, "array", node.length);
      for (const item of node.slice(0, MAX_ARRAY_ITEMS)) walk(item, `${path}[]`);
    } else if (node !== null && typeof node === "object") {
      for (const [name, child] of Object.entries(node)) walk(child, `${path}.${name}`);
    } else {
      note(path, node === null ? "null" : typeof node);
    }
  };
  walk(value, "$");
  return [...seen.entries()].slice(0, MAX_SHAPE_LINES).map(([path, entry]) => {
    const types = [...entry.types].join("|");
    const size = entry.types.has("array") ? ` len ${entry.min}-${entry.max}` : "";
    return `${path}: ${types}${size} x${entry.count}`;
  });
}

/** Every value at a path such as `$.incidents[].incidentType` or `$.DATA[0].ITEMS[]`. */
export function valuesAt(value: unknown, path: string): unknown[] {
  let nodes: unknown[] = [value];
  for (const segment of path
    .replace(/^\$\.?/, "")
    .split(".")
    .filter(Boolean)) {
    const match = /^([^[\]]*)(?:\[(\d*)\])?$/.exec(segment);
    const key = match?.[1] ?? segment;
    const bracket = match?.[2];
    nodes = nodes.flatMap((node) => {
      let child: unknown = node;
      if (key !== "") {
        child =
          node !== null && typeof node === "object"
            ? (node as Record<string, unknown>)[key]
            : undefined;
      }
      if (child === undefined) return [];
      if (bracket === undefined) return [child];
      if (!Array.isArray(child)) return [];
      return bracket === "" ? child : child.slice(Number(bracket), Number(bracket) + 1);
    });
  }
  return nodes;
}

const MAX_KEYS = 200;

/** The property names of the object(s) at a path, e.g. the endpoint names under `$.paths`. Names only. */
export function keysOf(value: unknown, path: string): string[] {
  return valuesAt(value, path)
    .filter((node) => node !== null && typeof node === "object" && !Array.isArray(node))
    .flatMap((node) => {
      const names = Object.keys(node as object);
      const shown = names.slice(0, MAX_KEYS).join(" ");
      return [`KEYS ${path} (${names.length}): ${shown}${names.length > MAX_KEYS ? " ..." : ""}`];
    });
}

const MAX_ROWS = 120;
const MAX_ROW_FIELDS = 8;

/**
 * One line per entry of a list, with only the named scalar fields, for lists of
 * matches or statistic lines (never players): `$.DATA[].EVENTS[]:EVENT_ID,HOME_NAME`.
 * At most 8 fields and 120 rows; objects and lists are never printed.
 */
export function rowsOf(value: unknown, spec: string): string[] {
  const at = spec.lastIndexOf(":");
  if (at < 0) return [];
  const path = spec.slice(0, at);
  const fields = spec
    .slice(at + 1)
    .split(",")
    .filter(Boolean)
    .slice(0, MAX_ROW_FIELDS);
  return valuesAt(value, path)
    .slice(0, MAX_ROWS)
    .map((entry, index) => {
      const cells = fields.map((field) => {
        const cell = valuesAt(entry, `$.${field}`)[0];
        if (cell === undefined) return "-";
        if (cell !== null && typeof cell === "object") return "(object)";
        return String(cell).slice(0, 60);
      });
      return `ROW ${index} | ${cells.join(" | ")}`;
    });
}

/** More distinct values than this and the field is free text or a name: not listed. */
const MAX_ENUM_VALUES = 15;
/** The most the limit can be raised to, for a field of known keys such as statistic names. */
const MAX_ENUM_VALUES_RAISED = 80;

/**
 * The distinct values of the named fields, with counts. A field with many
 * different values (a name, a free-text line) is reported only as a count, so
 * this cannot be used to dump third-party content into a public log.
 */
export function enumsOf(
  value: unknown,
  paths: readonly string[],
  limit = MAX_ENUM_VALUES,
): string[] {
  const max = Math.min(Math.max(Math.trunc(limit) || MAX_ENUM_VALUES, 1), MAX_ENUM_VALUES_RAISED);
  return paths.flatMap((path) => {
    const counts = new Map<string, number>();
    let found = 0;
    for (const item of valuesAt(value, path)) {
      if (item !== null && typeof item === "object") continue;
      found += 1;
      const key = item === null ? "null" : String(item).slice(0, 40);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (found === 0) return [];
    if (counts.size > max) {
      return [`ENUM ${path}: ${counts.size} distinct values over ${found} (not listed)`];
    }
    const listed = [...counts.entries()].map(
      ([name, count]) => `${JSON.stringify(name)} x${count}`,
    );
    return [`ENUM ${path}: ${listed.join(", ")}`];
  });
}

if (import.meta.main) {
  const [provider, ...rest] = process.argv.slice(2);
  const flag = (name: string) =>
    rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const shape = rest.includes("--shape");
  const enums = (flag("enum") ?? "").split(",").filter(Boolean);
  const enumMax = Number(flag("enum-max") ?? MAX_ENUM_VALUES);
  const keyPaths = (flag("keys") ?? "").split(",").filter(Boolean);
  const rowSpecs = rest.filter((a) => a.startsWith("--rows=")).map((a) => a.slice(7));
  const skip = flag("skip") ? (flag("skip") ?? "").split(",").filter(Boolean) : DEFAULT_SKIP;
  const outAt = rest.indexOf("--out");
  const outDir = outAt >= 0 ? rest[outAt + 1] : undefined;
  const paths = rest.filter((a, i) => !a.startsWith("--") && (outAt < 0 || i !== outAt + 1));
  if ((provider !== "sofascore" && provider !== "flashscore") || paths.length === 0) {
    console.error(
      "usage: provider-probe.ts <sofascore|flashscore> <path-and-query>... " +
        "[--shape] [--enum=$.a[].b,...] [--enum-max=N] [--rows=$.a[]:f1,f2] [--keys=$.a,...] [--skip=part,...] [--out dir]",
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
    if (shape || enums.length > 0 || rowSpecs.length > 0 || keyPaths.length > 0) {
      try {
        const parsed: unknown = JSON.parse(result.body);
        if (shape) console.log(shapeOf(parsed, skip).join("\n"));
        if (enums.length > 0) console.log(enumsOf(parsed, enums, enumMax).join("\n"));
        for (const keyPath of keyPaths) console.log(keysOf(parsed, keyPath).join("\n"));
        for (const spec of rowSpecs) console.log(`${spec}\n${rowsOf(parsed, spec).join("\n")}`);
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
