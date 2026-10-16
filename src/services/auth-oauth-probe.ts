// Asks Supabase Auth's `/authorize` address before the browser is sent there.
//
// Tapping "Continuer avec Google" navigates the whole page to
// `<project>/auth/v1/authorize?provider=google&…`. When that provider is not
// switched on in Supabase, that address answers a 400 with a small JSON body,
// and the visitor is left on a raw `{"code":400,"error_code":"validation_failed",
// "msg":"Unsupported provider: provider is not enabled"}` page with no way
// back but the browser's Back button (sweep case A8). Once the browser has
// left, the app cannot do anything about it, so the app asks first.
//
// What the request can and cannot tell:
//
//   - A provider that is on answers with a redirect to the provider's own page.
//     The request is made with `redirect: "manual"`, and a cross-origin
//     redirect comes back as an "opaque redirect" that needs no permission to
//     see. That is the go-ahead.
//   - A provider that is off answers 400. The answer can be read only if the
//     Supabase gateway allows cross-origin reads from this site. Where it
//     does, the visitor gets the app's own message. Where it does not, the
//     request fails as a network error the page cannot tell from a real
//     outage, and the app goes ahead and navigates, exactly as it did before
//     this check existed. Nothing is made worse by asking.
//
// The check asks nothing that changes anything: `/authorize` only builds a
// redirect to the provider (the sign-in itself starts on the provider's page).

import { isProviderOffReason } from "@/lib/auth-callback";
import type { AuthErrorCode } from "./auth-types";

/** Long enough for a slow phone connection; past it the browser is left to try. */
export const OAUTH_PROBE_TIMEOUT_MS = 4000;

/** The part of a fetch answer this check reads. */
export interface ProbeResponse {
  readonly type?: string;
  readonly status: number;
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export type ProbeFetch = (url: string, init: RequestInit) => Promise<ProbeResponse>;

export interface OAuthProbeDependencies {
  readonly fetch?: ProbeFetch;
  /** Whether the device says it is online; defaults to `navigator.onLine`. */
  readonly online?: () => boolean;
  readonly timeoutMs?: number;
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * What a readable, non-redirect answer from `/authorize` means for the visitor.
 * Every one of these is a page the browser would have shown raw.
 */
export function classifyAuthorizeAnswer(status: number, body: unknown): AuthErrorCode {
  const record = isRecord(body) ? body : {};
  // Supabase writes the reason under `msg` (its older shape) or `message`.
  const message = record.msg ?? record.message ?? record.error_description;
  if (isProviderOffReason(record.error_code ?? record.error, message)) {
    return "provider_unavailable";
  }
  if (status === 429) return "rate_limited";
  if (status === 0 || status === 502 || status === 503 || status === 504) return "network";
  if (status >= 520 && status <= 530) return "network";
  return "generic";
}

/**
 * `null` when the browser should go on to the address, else the error to show.
 * Never throws: whatever the request cannot settle is left to the browser.
 */
export async function probeOAuthAuthorizeUrl(
  url: string,
  deps: OAuthProbeDependencies = {},
): Promise<AuthErrorCode | null> {
  const online = deps.online ?? isOnline;
  if (!online()) return "network";
  const send: ProbeFetch | undefined =
    deps.fetch ?? (typeof fetch === "function" ? (u, i) => fetch(u, i) : undefined);
  if (!send) return null;

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), deps.timeoutMs ?? OAUTH_PROBE_TIMEOUT_MS)
    : null;
  try {
    const response = await send(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      signal: controller?.signal,
    });
    // The provider is on: a redirect to its page (opaque in a browser, a plain
    // 3xx where redirects are readable).
    if (response.type === "opaqueredirect") return null;
    if (response.status >= 300 && response.status < 400) return null;
    if (response.ok) return null;
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON (a gateway's own page): the status alone says what it was.
    }
    return classifyAuthorizeAnswer(response.status, body);
  } catch {
    // CORS refused the read, the connection dropped or the check timed out.
    // A device that says it is offline is told so; for anything else the
    // browser is left to try the address itself.
    return online() ? null : "network";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
