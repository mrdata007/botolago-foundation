// robots.txt evaluation.
//
// The engine asks permission before it reads anything. A disallowed path is
// simply not fetched — there is no override flag, and the absence of a robots
// file is not treated as a licence for anything beyond ordinary public access.
//
// Only the directives that bear on "may we read this URL" are implemented:
// User-agent grouping, Allow, Disallow, and Crawl-delay. Longest-match wins,
// with Allow beating Disallow at equal length, which is the behaviour the
// major crawlers converged on.

import { NewsHttpClient, MAX_ROBOTS_BYTES } from "./http";

export interface RobotsRule {
  readonly type: "allow" | "disallow";
  readonly pattern: string;
}

export interface RobotsPolicy {
  readonly rules: readonly RobotsRule[];
  readonly crawlDelaySeconds: number | null;
  /** True when no robots.txt was served; ordinary public access still applies. */
  readonly absent: boolean;
}

export const PERMISSIVE_POLICY: RobotsPolicy = { rules: [], crawlDelaySeconds: null, absent: true };

function matchesUserAgent(group: readonly string[], userAgent: string): boolean {
  const lowered = userAgent.toLowerCase();
  return group.some((agent) => agent === "*" || lowered.includes(agent));
}

export function parseRobots(body: string, userAgent: string): RobotsPolicy {
  const lines = body.split(/\r?\n/u);
  let currentGroup: string[] = [];
  let collecting = false;
  let groupClosed = false;

  const specificRules: RobotsRule[] = [];
  const wildcardRules: RobotsRule[] = [];
  let specificDelay: number | null = null;
  let wildcardDelay: number | null = null;
  let sawSpecificGroup = false;

  const flushTargets = (): { rules: RobotsRule[]; wildcardOnly: boolean } | null => {
    if (!collecting) return null;
    const exact = currentGroup.some((agent) => agent !== "*");
    if (exact) sawSpecificGroup = true;
    return { rules: exact ? specificRules : wildcardRules, wildcardOnly: !exact };
  };

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines form one group; a directive closes it.
      if (groupClosed) {
        currentGroup = [];
        groupClosed = false;
      }
      currentGroup.push(value.toLowerCase());
      collecting = matchesUserAgent(currentGroup, userAgent);
      continue;
    }

    if (field === "allow" || field === "disallow") {
      groupClosed = true;
      const target = flushTargets();
      if (!target) continue;
      // `Disallow:` with an empty value means "nothing is disallowed".
      if (field === "disallow" && value === "") continue;
      target.rules.push({ type: field, pattern: value });
      continue;
    }

    if (field === "crawl-delay") {
      groupClosed = true;
      const target = flushTargets();
      if (!target) continue;
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds < 0) continue;
      if (target.wildcardOnly) wildcardDelay = seconds;
      else specificDelay = seconds;
    }
  }

  // A group naming us outranks the wildcard group entirely.
  const rules = sawSpecificGroup && specificRules.length > 0 ? specificRules : wildcardRules;
  const crawlDelaySeconds =
    sawSpecificGroup && specificDelay !== null ? specificDelay : wildcardDelay;
  return { rules, crawlDelaySeconds, absent: false };
}

function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false;
  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const segments = body.split("*");

  let cursor = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? "";
    if (segment === "") continue;
    if (index === 0) {
      if (!path.startsWith(segment)) return false;
      cursor = segment.length;
      continue;
    }
    const found = path.indexOf(segment, cursor);
    if (found === -1) return false;
    cursor = found + segment.length;
  }

  if (anchoredEnd) {
    const tail = segments[segments.length - 1] ?? "";
    return tail === "" ? true : path.endsWith(tail) && cursor === path.length;
  }
  return true;
}

/** Longest matching pattern wins; Allow beats Disallow at equal length. */
export function isAllowed(policy: RobotsPolicy, url: string): boolean {
  if (policy.rules.length === 0) return true;
  const target = new URL(url);
  const path = `${target.pathname}${target.search}`;

  let bestLength = -1;
  let bestAllow = true;
  for (const rule of policy.rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    const length = rule.pattern.length;
    if (length > bestLength || (length === bestLength && rule.type === "allow")) {
      bestLength = length;
      bestAllow = rule.type === "allow";
    }
  }
  return bestLength === -1 ? true : bestAllow;
}

/**
 * Loads and caches a host's robots.txt for the life of the run.
 *
 * A robots.txt that cannot be read is treated as permissive only when the
 * server says it does not exist (404/410). A network error or a 5xx means we
 * do not know the rules, and the caller refuses to fetch rather than assume.
 */
export class RobotsCache {
  private readonly cache = new Map<string, RobotsPolicy>();

  constructor(
    private readonly http: NewsHttpClient,
    private readonly userAgent: string,
  ) {}

  async policyFor(hostname: string, timeoutMs: number): Promise<RobotsPolicy> {
    const cached = this.cache.get(hostname);
    if (cached) return cached;

    let policy: RobotsPolicy;
    try {
      const result = await this.http.request({
        url: `https://${hostname}/robots.txt`,
        expectedHostname: hostname,
        timeoutMs,
        maxRetries: 1,
        maxBytes: MAX_ROBOTS_BYTES,
        accept: "text/plain,*/*;q=0.5",
        userAgent: this.userAgent,
      });
      policy = parseRobots(result.body, this.userAgent);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "news_engine_access_denied") {
        // 404 and friends: no robots file published.
        policy = PERMISSIVE_POLICY;
      } else {
        throw error;
      }
    }

    this.cache.set(hostname, policy);
    return policy;
  }
}
