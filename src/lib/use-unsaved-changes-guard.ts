import { useBlocker } from "@tanstack/react-router";
import { useRef } from "react";

/**
 * Warns before unsaved work is lost, whichever way the editor leaves:
 *
 *   - any in-app navigation (a link, the back arrow, the browser Back button,
 *     a programmatic `navigate`) asks for confirmation through the router's
 *     blocker;
 *   - a reload, tab close or off-site link gets the browser's own
 *     "leave site?" prompt (`enableBeforeUnload`).
 *
 * The CMS editor used to register only a `beforeunload` listener, which a
 * client-side route change never fires -- so "Tous les articles" or the Admin
 * menu discarded unsaved text without a word.
 *
 * `allowNextNavigation()` lets one intended navigation through without a
 * prompt (e.g. moving to the editor right after a draft is created).
 */
export function useUnsavedChangesGuard(dirty: boolean, message: string) {
  const bypass = useRef(false);
  useBlocker({
    shouldBlockFn: () => {
      if (bypass.current) {
        bypass.current = false;
        return false;
      }
      if (!dirty) return false;
      return !window.confirm(message);
    },
    enableBeforeUnload: () => dirty && !bypass.current,
  });
  return {
    allowNextNavigation: () => {
      bypass.current = true;
    },
  };
}
