import { useEffect, useState } from "react";

import { nativePlatform } from "@/lib/native-app";
import { claimAppUrl, parseAppUrl } from "@/lib/native-oauth";

/** Addresses already handled in this page (see `claimAppUrl`). */
const handledHere = new Set<string>();

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Brings what the phone opened the app with back into the page. Mounted once
 * in the root; renders nothing, and does nothing in a browser or on the server.
 *
 *  - `botolago://auth/callback?code=…`: the end of a Google or Apple sign-in
 *    started in the phone's browser sheet (`src/lib/native-oauth.ts`). The
 *    code is traded for a session here, in the web view, and the page goes to
 *    the callback page, which lands it as on the website.
 *  - `https://botolago.com/auth/callback?…`: an e-mail link (confirmation,
 *    password reset) the phone opened in the app rather than in the browser
 *    (Universal Links / App Links, `src/lib/app-links.ts`). The web view
 *    simply loads it.
 *
 * Both are full page loads, so the callback page reads its address as it does
 * in a browser. Listening starts at mount, and the address the app was
 * started with is read once too (Android delivers a cold start's address only
 * there).
 */
export function NativeAuthBridge() {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(nativePlatform() !== null);
  }, []);
  return native ? <NativeAuthBridgeActive /> : null;
}

async function handle(url: string | undefined | null) {
  if (!url) return;
  const parsed = parseAppUrl(url);
  if (!parsed || !claimAppUrl(url, sessionStore(), handledHere)) return;
  if (parsed.kind === "site") {
    window.location.assign(parsed.path);
    return;
  }
  const { finishNativeOAuth } = await import("@/services/native-oauth-runtime");
  window.location.assign(await finishNativeOAuth(parsed));
}

function NativeAuthBridgeActive() {
  useEffect(() => {
    let cancelled = false;
    let handleRef: { remove(): Promise<void> } | null = null;
    void (async () => {
      const { App } = await import("@capacitor/app");
      const listener = await App.addListener("appUrlOpen", ({ url }) => {
        void handle(url).catch(() => undefined);
      });
      if (cancelled) {
        await listener.remove();
        return;
      }
      handleRef = listener;
      const launch = await App.getLaunchUrl().catch(() => undefined);
      if (!cancelled) await handle(launch?.url);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      void handleRef?.remove();
    };
  }, []);
  return null;
}
