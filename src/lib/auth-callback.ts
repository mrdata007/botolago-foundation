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

/**
 * Query keys that hold a credential or a one-time code, never carried into a
 * return target: an auth callback, a provider error, an unsubscribe link.
 */
const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token",
  "token_hash",
  "code",
  "type",
  "authorization_id",
  "error",
  "error_code",
  "error_description",
]);

/** A hash worth keeping is an anchor (`#security`); `#code=…` and `#access_token=…` are not. */
const PLAIN_ANCHOR = /^[A-Za-z0-9_-]{1,64}$/;

/** Pages a reader is never sent back to after signing in. */
const NEVER_RETURN_TO = ["/auth", "/unsubscribe"] as const;

/** Longer than any real page address; past it only the path is kept. */
const MAX_RETURN_TARGET_LENGTH = 2000;

function isNeverReturnTo(pathname: string): boolean {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // An undecodable path is judged as written.
  }
  const lower = decoded.toLowerCase();
  return NEVER_RETURN_TO.some((base) => lower === base || lower.startsWith(`${base}/`));
}

/** The query without credential keys, in the form it was written (no re-encoding). */
function withoutSensitiveQuery(searchStr: string): string {
  const pairs = searchStr
    .replace(/^\?/, "")
    .split("&")
    .filter((pair) => {
      if (!pair) return false;
      const rawKey = pair.split("=", 1)[0] ?? "";
      try {
        return !SENSITIVE_QUERY_KEYS.has(
          decodeURIComponent(rawKey.replace(/\+/g, " ")).toLowerCase(),
        );
      } catch {
        // A key that cannot be read cannot be shown to be harmless.
        return false;
      }
    });
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

/**
 * The `next` a sign-in link should carry for a reader standing on `location`:
 * the page, its query (the selected round, tab, filter) and a plain anchor,
 * run through the same sanitiser as every other `next`. The home page needs
 * none.
 *
 * Passing only `pathname` drops the query, so a reader who opened the sign-in
 * prompt on `/pronostics?journee=12&tab=ligues` came back to `/pronostics`.
 *
 * The address bar can hold more than a place. A hash such as the invite's
 * `#code=<secret>` or an OAuth `#access_token=…`, a `?code=`, `?token=` or
 * `?error_description=` query, would be copied into the sign-in page's own
 * address and the e-mail callback link, so none is carried: a hash only if it
 * is a plain anchor, and the credential keys above are removed from the
 * query. The auth pages and the unsubscribe link are not places to return to.
 * The whole target stays under 2,000 characters; past that only the path is
 * kept, and a path that long is dropped.
 */
export function authReturnTarget(location: {
  pathname: string;
  searchStr?: string;
  hash?: string;
}): string | undefined {
  if (isNeverReturnTo(location.pathname)) return undefined;
  const anchor = (location.hash ?? "").replace(/^#/, "");
  const hash = PLAIN_ANCHOR.test(anchor) ? `#${anchor}` : "";
  const query = withoutSensitiveQuery(location.searchStr ?? "");
  const full = `${location.pathname}${query}${hash}`;
  const candidate =
    full.length <= MAX_RETURN_TARGET_LENGTH
      ? full
      : location.pathname.length <= MAX_RETURN_TARGET_LENGTH
        ? location.pathname
        : "/";
  const next = sanitizeAuthCallbackNext(candidate);
  // Resolving can turn a path into a protected one (`/a/../auth/login`).
  if (next === "/" || isNeverReturnTo(next.split(/[?#]/, 1)[0] ?? next)) return undefined;
  return next;
}

/**
 * How an auth page lands on a validated `next`. The router reads a string
 * passed as `to` as a bare path, so `/pronostics?journee=3` would be looked up
 * as a page of that exact name; `href` parses the query and hash. `replace`
 * keeps the sign-in screen out of the history, so Back from the destination
 * does not return to a form that has already done its job.
 */
export function authLanding(next: string): { href: string; replace: true } {
  return { href: sanitizeAuthCallbackNext(next), replace: true };
}

export function cleanAuthCallbackUrl(rawUrl: string): string {
  const clean = new URL(rawUrl);
  clean.search = "";
  clean.hash = "";
  return clean.toString();
}
