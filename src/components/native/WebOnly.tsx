import type { ReactNode } from "react";

import { useInNativeApp } from "./use-in-native-app";

/**
 * Something that works in a browser and not inside the phone app: Google and
 * Apple sign-in (Google refuses an embedded web view, and the shell hands the
 * provider's page to Safari, which can never hand the session back), or a
 * file download (neither Capacitor shell handles one).
 *
 * Hidden inside the app from the first paint and removed after mount:
 *  - the server HTML and the first client render always contain it, so they
 *    match wherever the page is opened;
 *  - `src/styles.css` hides `[data-web-only]` under `<html data-native-app>`,
 *    which the head script (`NATIVE_APP_INIT_SCRIPT`) sets before the page
 *    paints, so the app never shows it, not even for a frame;
 *  - once mounted, React drops it from the tree, so it is gone for assistive
 *    technology and for anything that queries the DOM, even if the head
 *    script did not run.
 *
 * The wrapper is `display: contents`, so the children sit in the parent's
 * layout (a grid's gap, a flex column) as if it were not there.
 */
export function WebOnly({ children }: { children: ReactNode }) {
  const native = useInNativeApp();
  if (native) return null;
  return (
    <div data-web-only="" className="contents">
      {children}
    </div>
  );
}
