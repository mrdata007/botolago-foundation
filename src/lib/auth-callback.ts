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
 */
export function sanitizeAuthCallbackNext(raw: string | null): string {
  if (!raw) return "/";
  // C0 controls and DEL: stripped or rejected by the URL parser, never
  // meaningful in a path we generated ourselves.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/u.test(raw)) return "/";
  // Normalised to "/" for special schemes, so a backslash is a second way to
  // write a protocol-relative URL.
  if (raw.includes("\\")) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";

  let resolved: URL;
  try {
    resolved = new URL(raw, SAME_ORIGIN_PROBE);
  } catch {
    return "/";
  }
  if (resolved.origin !== SAME_ORIGIN_PROBE) return "/";
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function cleanAuthCallbackUrl(rawUrl: string): string {
  const clean = new URL(rawUrl);
  clean.search = "";
  clean.hash = "";
  return clean.toString();
}
