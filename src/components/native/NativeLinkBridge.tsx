import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { appLinkPath } from "@/lib/app-links";
import { nativePlatform } from "@/lib/native-app";

/** Once per app start: the link that launched the app is opened once. */
let launchHandled = false;

/**
 * In the phone app, opens the page of a botolago.com link the phone handed to
 * the app (`@/lib/app-links`, ST-2): the link that started it, and any link
 * tapped while it runs. Renders nothing; nothing at all in a browser.
 */
export function NativeLinkBridge() {
  // Decided after the first render, so the server and the first client render agree.
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(nativePlatform() !== null);
  }, []);
  return native ? <NativeLinkBridgeActive /> : null;
}

function NativeLinkBridgeActive() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let handle: { remove(): Promise<void> } | null = null;
    const open = (link: string | undefined) => {
      const path = link ? appLinkPath(link) : null;
      const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (path && path !== here) void router.navigate({ href: path });
    };
    void (async () => {
      const { App } = await import("@capacitor/app");
      if (!launchHandled) {
        launchHandled = true;
        open((await App.getLaunchUrl())?.url);
      }
      const added = await App.addListener("appUrlOpen", ({ url }) => open(url));
      if (cancelled) await added.remove();
      else handle = added;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [router]);

  return null;
}
