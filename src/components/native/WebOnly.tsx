import { useEffect, useState, type ReactNode } from "react";

import { useInNativeApp } from "./use-in-native-app";

/**
 * Something that works in a browser and not inside the phone app: a file
 * download (neither Capacitor shell handles one), or Google and Apple sign-in
 * in an app built before it could open the phone's browser sheet.
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
 * `showInAppWhen`: asked once mounted inside the app; if it says yes, the
 * children are shown there after all (without `data-web-only`). Google and
 * Apple sign-in use it to appear in a build that has the Browser plugin
 * (`nativeOAuthAvailable`). There they appear after mount, not on the first
 * paint.
 *
 * The wrapper is `display: contents`, so the children sit in the parent's
 * layout (a grid's gap, a flex column) as if it were not there.
 */
export function WebOnly({
  children,
  showInAppWhen,
}: {
  children: ReactNode;
  showInAppWhen?: () => boolean;
}) {
  const native = useInNativeApp();
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setInApp(native && showInAppWhen ? showInAppWhen() : false);
  }, [native, showInAppWhen]);
  if (native) return inApp ? <div className="contents">{children}</div> : null;
  return (
    <div data-web-only="" className="contents">
      {children}
    </div>
  );
}
