import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

/**
 * Where a "Retour" control should actually send the reader.
 *
 * `history.back()` on its own is wrong for any page that can be opened cold,
 * and for a news product most of them are: a shared link, a search result, a
 * push notification, a bookmark. In a fresh tab the app IS the first history
 * entry, so going back steps off the site entirely and the tab lands on
 * about:blank -- no heading, no content, nothing to press. It fails silently:
 * no console error, nothing to notice in a session that started at the home
 * page, which is why it survived to production.
 *
 * TanStack's history knows the difference. Its `canGoBack()` reads the app's
 * own entry index, so it is false exactly when there is no in-app entry behind
 * this one. Note that it stays false when the reader arrived from an external
 * page in the same tab -- which is what we want: an in-app back control should
 * return you into the app, not eject you to the referrer.
 *
 * The decision is made on click rather than during render, deliberately: the
 * server has no history state, so branching in render would make the control
 * differ between the server and client markup and add a hydration mismatch.
 */
export type BackDestination = { kind: "history" } | { kind: "route"; to: string };

export function backDestination(canGoBack: boolean, fallback: string): BackDestination {
  return canGoBack ? { kind: "history" } : { kind: "route", to: fallback };
}

/**
 * A back handler that never strands the reader.
 *
 * `fallback` is where the control goes when there is no in-app history: the
 * listing the page belongs to (`/news` for an article, `/matches` for a match),
 * so "back" still means something to someone who arrived by link.
 */
export function useBackTo(fallback: string) {
  const router = useRouter();
  return useCallback(() => {
    const destination = backDestination(router.history.canGoBack(), fallback);
    if (destination.kind === "history") {
      router.history.back();
      return;
    }
    void router.navigate({ to: destination.to });
  }, [router, fallback]);
}
