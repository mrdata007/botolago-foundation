// A sentinel origin that nothing can ever legitimately resolve to, used only
// to ask the URL parser the one question that matters: "once a browser
// resolves this, does it still point at the page that sent it?"
const SAME_ORIGIN_PROBE = "https://auth-callback-next.invalid";

/**
 * Reduces a caller-supplied `next` to a path that can only ever land back on
 * this origin.
 *
 * A prefix check alone is not enough. Browsers resolve `next` with the WHATWG
 * URL parser, and that parser rewrites the string before it decides what the
 * origin is:
 *
 *   - `\` is treated as `/` for http(s) URLs, so `/\evil.example` resolves to
 *     `https://evil.example/` even though it starts with a single `/`.
 *   - Leading/embedded C0 control characters (tab, LF, CR) are *stripped*, so
 *     `/<TAB>/evil.example` becomes `//evil.example` after parsing.
 *
 * Both forms passed the previous `startsWith("/") && !startsWith("//")` check
 * and turned `/auth/callback?next=...` into an off-origin redirect -- a
 * credible phishing hop, because the victim arrives there straight after a
 * real sign-in on the real domain.
 *
 * So: refuse the rewriting characters outright, then resolve against a
 * sentinel origin and require the result to still be on it. Anything else
 * collapses to `/`.
 *
 * The result is checked again after resolving, because resolving can itself
 * produce the prefix the first check refused: dot segments are removed, so
 * `/.//evil.example`, `/..//evil.example`, `/a/..//evil.example` and
 * `/%2e//evil.example` all resolve to the path `//evil.example`, which is
 * still on the probe's origin -- and was returned as is, a protocol-relative
 * URL to another site. The pages that use `next` sanitised it a second time,
 * which caught it; `challengeSearch` (second-factor.ts) sanitises once.
 *
 * Idempotent: a path is returned only if sanitising it again returns it
 * unchanged, so one pass and two passes always agree.
 */
export function sanitizeAuthCallbackNext(raw: string | null): string {
  const once = resolveSameOriginPath(raw);
  if (once === null) return "/";
  return resolveSameOriginPath(once) === once ? once : "/";
}

/** A path the browser can only resolve to this origin: one `/`, then no second. */
function isPlainPath(value: string): boolean {
  // C0 controls and DEL: stripped or rejected by the URL parser, never
  // meaningful in a path we generated ourselves.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  // Normalised to "/" for special schemes, so a backslash is a second way to
  // write a protocol-relative URL.
  if (value.includes("\\")) return false;
  return value.startsWith("/") && !value.startsWith("//");
}

/** `raw` resolved the way a browser resolves it, or `null` when it may leave the site. */
function resolveSameOriginPath(raw: string | null): string | null {
  if (!raw || !isPlainPath(raw)) return null;
  let resolved: URL;
  try {
    resolved = new URL(raw, SAME_ORIGIN_PROBE);
  } catch {
    return null;
  }
  if (resolved.origin !== SAME_ORIGIN_PROBE) return null;
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  // After dot segments are gone: `/.//evil.example` is `//evil.example` now.
  return isPlainPath(path) ? path : null;
}

/**
 * The `next` an auth route's `validateSearch` returns: a same-site path, or
 * `undefined`.
 *
 * The key is always present. TanStack Router lays a route's validated search
 * over the raw query the page inherits from the root route, so leaving an
 * unsafe `next` out of the result does not remove it: the raw value comes
 * back through `useSearch()`. It has to be overwritten. Until 2026-09-24 every
 * auth route left it out, and the live login page carried
 * `next=https://attacker.invalid` into its links and its post-login redirect.
 */
export function authNextSearch(raw: unknown): { next?: string } {
  const next = typeof raw === "string" ? sanitizeAuthCallbackNext(raw) : undefined;
  // Optional in the type, so links to these pages need no `next`; present at
  // runtime, so it overwrites the raw one.
  return { next: next && next !== "/" ? next : undefined };
}

export function cleanAuthCallbackUrl(rawUrl: string): string {
  const clean = new URL(rawUrl);
  clean.search = "";
  clean.hash = "";
  return clean.toString();
}
