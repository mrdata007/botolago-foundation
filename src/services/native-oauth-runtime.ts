import { supabase } from "@/integrations/supabase/client";
import {
  NATIVE_OAUTH_REDIRECT,
  PENDING_OAUTH_KEY,
  buildAuthorizeUrl,
  buildTokenRequest,
  callbackFailure,
  callbackLanding,
  createPkcePair,
  parsePending,
  parseTokenResponse,
  serializePending,
  type AppUrl,
  type OAuthProvider,
} from "@/lib/native-oauth";

/**
 * The phone side of `src/lib/native-oauth.ts`: the Browser plugin, the
 * web view's storage and Supabase's token endpoint. Loaded only inside the
 * app (the auth service and `NativeAuthBridge` import it on demand), so the
 * website never downloads it.
 */

function supabaseSettings(): { url: string; key: string } {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) throw new Error("Supabase is not configured");
  return { url, key };
}

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Opens Google's or Apple's sign-in in the phone's browser sheet. Resolves
 * once the sheet is open: the sign-in finishes when the phone opens the app
 * with `botolago://auth/callback` (`finishNativeOAuth`).
 */
export async function startNativeOAuth(provider: OAuthProvider, next: string): Promise<boolean> {
  try {
    const { url: supabaseUrl } = supabaseSettings();
    const storage = store();
    if (!storage) return false;
    const { verifier, challenge } = await createPkcePair();
    storage.setItem(
      PENDING_OAUTH_KEY,
      serializePending({ verifier, provider, next, createdAt: Date.now() }),
    );
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({
      url: buildAuthorizeUrl({
        supabaseUrl,
        provider,
        redirectTo: NATIVE_OAUTH_REDIRECT,
        codeChallenge: challenge,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The end of a Google or Apple sign-in: trades the code for a session with the
 * verifier this page kept, and answers where the web view goes next (the
 * callback page, which sends an account with a second factor to its code and a
 * new one to profile setup, as on the website).
 */
export async function finishNativeOAuth(
  result: Extract<AppUrl, { kind: "oauth" }>,
): Promise<string> {
  // The browser sheet stays open on iPhone until it is closed (Android's
  // Custom Tab is already gone: the app came to the front over it).
  void import("@capacitor/browser").then(({ Browser }) => Browser.close()).catch(() => undefined);

  const storage = store();
  const pending = parsePending(storage?.getItem(PENDING_OAUTH_KEY) ?? null, Date.now());
  // One use only, whatever happens next.
  try {
    storage?.removeItem(PENDING_OAUTH_KEY);
  } catch {
    /* storage refused: the record expires on its own */
  }
  if (result.error || !result.code) return callbackFailure(result.error ?? "no_code");
  if (!pending) return callbackFailure("no_pending_sign_in");

  try {
    const { url, key } = supabaseSettings();
    const request = buildTokenRequest({
      supabaseUrl: url,
      publishableKey: key,
      code: result.code,
      verifier: pending.verifier,
    });
    const response = await fetch(request.url, request.init);
    const tokens = response.ok ? parseTokenResponse(await response.json()) : null;
    if (!tokens) return callbackFailure("exchange_failed");
    const { error } = await supabase.auth.setSession(tokens);
    if (error) return callbackFailure("exchange_failed");
    return callbackLanding(pending.next);
  } catch {
    return callbackFailure("exchange_failed");
  }
}
