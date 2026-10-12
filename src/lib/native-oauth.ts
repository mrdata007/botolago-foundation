/**
 * Google and Apple sign-in inside the phone app: the rules, with no plugin and
 * no network, so they can be tested. The plugins are driven by
 * `src/services/native-oauth-runtime.ts`; the whole flow is described in
 * docs/mobile/PHONE_APP.md ("Signing in inside the app").
 *
 * Why the app cannot do what the website does: Google refuses to sign anyone
 * in inside an embedded web view (`disallowed_useragent`), and the shell hands
 * any page outside botolago.com to Safari or Chrome, which keep the session to
 * themselves. So, inside the app only:
 *
 *  1. the page makes a PKCE pair (a secret "verifier" it keeps, and its
 *     SHA-256 "challenge" it sends), and keeps the verifier with where to go
 *     afterwards (`PendingNativeOAuth`, in the web view's own storage);
 *  2. it opens Supabase's authorize address in the phone's own browser sheet
 *     (`@capacitor/browser`: SFSafariViewController on iPhone, a Custom Tab
 *     on Android), which Google accepts;
 *  3. Supabase sends the browser back to `botolago://auth/callback?code=…`,
 *     the app's own address. The phone opens the app with it, and the app's
 *     `appUrlOpen` event hands it to the page;
 *  4. the page trades the code and its verifier for a session (Supabase's
 *     `grant_type=pkce`), so only the page that started the sign-in can finish
 *     it: another app that registered `botolago://` gets a code it cannot use.
 *
 * In a browser none of this runs: the website keeps `signInWithOAuth` as it was.
 */

import { nativePlatform, nativePluginAvailable, type NativeScope } from "./native-app";
import { sanitizeAuthCallbackNext } from "./auth-callback";

/** The app's own URL scheme. Registered in the native projects by `scripts/mobile/prepare-native.mjs`. */
export const APP_URL_SCHEME = "botolago";

/**
 * Where Supabase sends the phone's browser back to. It must be in Supabase
 * Auth's Redirect URLs (Authentication, URL Configuration), or Supabase sends
 * the browser to the Site URL instead and the app never hears back.
 */
export const NATIVE_OAUTH_REDIRECT = `${APP_URL_SCHEME}://auth/callback`;

/** The plugin (its `jsName`) that opens the phone's browser sheet. */
export const NATIVE_BROWSER_PLUGIN = "Browser";

/** How long a started sign-in may take before its verifier is thrown away. */
export const PENDING_OAUTH_MAX_AGE_MS = 15 * 60 * 1000;

/** Where the started sign-in is kept, in the web view's `localStorage`. */
export const PENDING_OAUTH_KEY = "botolago.auth.native-oauth";

export type OAuthProvider = "google" | "apple";

/**
 * Whether this page can sign in with Google or Apple through the phone's
 * browser: inside the app, and only in a build that has the Browser plugin.
 * The app loads the live site, so an app built before the plugin was added
 * runs this code too: there the buttons stay hidden, as they were.
 */
export function nativeOAuthAvailable(scope: NativeScope = globalThis as NativeScope): boolean {
  return nativePlatform(scope) !== null && nativePluginAvailable(NATIVE_BROWSER_PLUGIN, scope);
}

// ---------------------------------------------------------------------------
// PKCE

const VERIFIER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
/** RFC 7636: 43 to 128 characters from the unreserved set. */
const VERIFIER_LENGTH = 64;

export interface PkceCrypto {
  readonly getRandomValues: (array: Uint8Array) => Uint8Array;
  readonly digest: (data: Uint8Array) => Promise<ArrayBuffer>;
}

function defaultCrypto(): PkceCrypto {
  const c = globalThis.crypto;
  if (!c?.getRandomValues || !c.subtle) throw new Error("WebCrypto is not available");
  return {
    getRandomValues: (array) => c.getRandomValues(array),
    digest: (data) => c.subtle.digest("SHA-256", data as BufferSource),
  };
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

/** A fresh verifier and its S256 challenge (RFC 7636 §4.1, §4.2). */
export async function createPkcePair(crypto: PkceCrypto = defaultCrypto()): Promise<PkcePair> {
  const random = crypto.getRandomValues(new Uint8Array(VERIFIER_LENGTH));
  // 256 is not a multiple of the alphabet's 66 characters, so the bytes at or
  // above 198 (256 - 256 % 66) are skipped: every character stays equally likely.
  let verifier = "";
  let pool = random;
  while (verifier.length < VERIFIER_LENGTH) {
    for (const byte of pool) {
      if (verifier.length >= VERIFIER_LENGTH) break;
      if (byte < 256 - (256 % VERIFIER_ALPHABET.length)) {
        verifier += VERIFIER_ALPHABET[byte % VERIFIER_ALPHABET.length];
      }
    }
    pool = crypto.getRandomValues(new Uint8Array(VERIFIER_LENGTH));
  }
  const digest = await crypto.digest(new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

// ---------------------------------------------------------------------------
// Supabase's two addresses

function authBase(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("The Supabase URL must be https");
  }
  return `${url.origin}/auth/v1`;
}

/**
 * Supabase's authorize address for `provider`, asking for a PKCE code sent to
 * `redirectTo`: the same address `supabase.auth.signInWithOAuth` builds for a
 * PKCE client (`provider`, `redirect_to`, `code_challenge`,
 * `code_challenge_method=s256`).
 */
export function buildAuthorizeUrl(input: {
  readonly supabaseUrl: string;
  readonly provider: OAuthProvider;
  readonly redirectTo: string;
  readonly codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    provider: input.provider,
    redirect_to: input.redirectTo,
    code_challenge: input.codeChallenge,
    code_challenge_method: "s256",
  });
  return `${authBase(input.supabaseUrl)}/authorize?${params.toString()}`;
}

/** The request that trades the code and the verifier for a session. */
export function buildTokenRequest(input: {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly code: string;
  readonly verifier: string;
}): { url: string; init: RequestInit } {
  return {
    url: `${authBase(input.supabaseUrl)}/token?grant_type=pkce`,
    init: {
      method: "POST",
      headers: {
        apikey: input.publishableKey,
        "content-type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({ auth_code: input.code, code_verifier: input.verifier }),
    },
  };
}

export interface SessionTokens {
  readonly access_token: string;
  readonly refresh_token: string;
}

/** The two tokens from Supabase's answer, or `null` if it is not a session. */
export function parseTokenResponse(body: unknown): SessionTokens | null {
  if (!body || typeof body !== "object") return null;
  const { access_token, refresh_token } = body as Record<string, unknown>;
  if (typeof access_token !== "string" || typeof refresh_token !== "string") return null;
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

// ---------------------------------------------------------------------------
// The started sign-in, kept between leaving for the browser and coming back

export interface PendingNativeOAuth {
  readonly verifier: string;
  readonly provider: OAuthProvider;
  /** Where to land once signed in: a sanitised same-site path. */
  readonly next: string;
  readonly createdAt: number;
}

export function serializePending(pending: PendingNativeOAuth): string {
  return JSON.stringify({ ...pending, next: sanitizeAuthCallbackNext(pending.next) });
}

/** The stored sign-in, or `null` if it is missing, malformed or too old. */
export function parsePending(raw: string | null, now: number): PendingNativeOAuth | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { verifier, provider, next, createdAt } = value as Record<string, unknown>;
  if (typeof verifier !== "string" || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return null;
  if (provider !== "google" && provider !== "apple") return null;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
  const age = now - createdAt;
  if (age < 0 || age > PENDING_OAUTH_MAX_AGE_MS) return null;
  return {
    verifier,
    provider,
    next: sanitizeAuthCallbackNext(typeof next === "string" ? next : null),
    createdAt,
  };
}

// ---------------------------------------------------------------------------
// The address the phone opened the app with

/**
 * The site's address the app accepts as its own links (Universal Links / App
 * Links). Only the one the e-mails use (Supabase's Site URL): Android verifies
 * every host of a link filter, and one that fails (no association file served
 * there) fails them all on Android 11 and earlier.
 */
export const APP_LINK_HOSTS: readonly string[] = ["botolago.com"];

/**
 * The site's paths that open the app instead of the browser, once the
 * association files are live (`src/lib/app-links.ts`): the e-mail links'
 * landing page.
 */
export const APP_LINK_PATHS: readonly string[] = ["/auth/callback"];

export type AppUrl =
  /** The phone's browser came back from Google or Apple. */
  | {
      readonly kind: "oauth";
      readonly code: string | null;
      readonly error: string | null;
    }
  /** A link to the site (an e-mail link), to open in the web view. */
  | { readonly kind: "site"; readonly path: string };

/**
 * What an address the phone opened the app with means, or `null` for one this
 * app does not handle (it is then ignored).
 *
 * `botolago://auth/callback?code=…` (or `?error=…`) is the end of a Google or
 * Apple sign-in. `https://botolago.com/auth/callback?…` is an e-mail link
 * (confirmation, password reset) that the phone gave to the app: it becomes
 * the same path in the web view, query and fragment included, where the
 * callback page does what it does in a browser.
 */
export function parseAppUrl(raw: string): AppUrl | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol === `${APP_URL_SCHEME}:`) {
    // `botolago://auth/callback`: "auth" is the host, "/callback" the path.
    if (url.host !== "auth" || url.pathname.replace(/\/+$/, "") !== "/callback") return null;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const read = (name: string) => url.searchParams.get(name) ?? hash.get(name);
    const error = read("error_description") ?? read("error");
    const code = read("code");
    return { kind: "oauth", code: code || null, error: error || (code ? null : "no_code") };
  }
  if (url.protocol === "https:" && APP_LINK_HOSTS.includes(url.hostname) && !url.port) {
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (!APP_LINK_PATHS.includes(pathname)) return null;
    const path = sanitizeAuthCallbackNext(`${pathname}${url.search}${url.hash}`);
    return path === "/" ? null : { kind: "site", path };
  }
  return null;
}

/** Where the web view goes once the code has been traded (the callback page finishes the landing). */
export function callbackLanding(next: string): string {
  return `/auth/callback?next=${encodeURIComponent(sanitizeAuthCallbackNext(next))}`;
}

/** Where the web view goes when the sign-in failed: the callback page's error, with a way back. */
export function callbackFailure(reason: string): string {
  return `/auth/callback?error_description=${encodeURIComponent(reason.slice(0, 200) || "error")}`;
}

/** The last address handled, in the web view's `sessionStorage`. */
export const HANDLED_APP_URL_KEY = "botolago.app.handled-url";

/**
 * Whether `url` is new and should be handled now; it is then marked handled.
 *
 * The same address can reach the page twice: on iPhone the event that opened
 * the app is kept for the first listener and `App.getLaunchUrl()` also returns
 * it, and on both phones `getLaunchUrl()` keeps answering the address the app
 * was started with after every page load. Handling it again would replay an
 * e-mail link (already used) or a sign-in code (already traded) and land on an
 * error, or reload the page forever. `sessionStorage` lasts as long as the
 * web view, across the page loads the handling itself causes; `memory` covers
 * a web view that refuses storage.
 */
export function claimAppUrl(
  url: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  memory: Set<string>,
): boolean {
  if (memory.has(url)) return false;
  memory.add(url);
  try {
    if (storage?.getItem(HANDLED_APP_URL_KEY) === url) return false;
    storage?.setItem(HANDLED_APP_URL_KEY, url);
  } catch {
    /* refused: memory alone */
  }
  return true;
}
