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
/**
 * Where a Retour with nothing behind it goes: a path, or a path with the
 * search that makes it the right place (a match opened cold goes back to its
 * own day on the calendar, not to today's).
 */
export type BackFallback = string | { to: string; search?: Record<string, string> };

export type BackDestination =
  | { kind: "history" }
  | { kind: "route"; to: string; search?: Record<string, string> };

export function backDestination(canGoBack: boolean, fallback: BackFallback): BackDestination {
  if (canGoBack) return { kind: "history" };
  return typeof fallback === "string"
    ? { kind: "route", to: fallback }
    : { kind: "route", ...fallback };
}

/**
 * A back handler that never strands the reader.
 *
 * With an in-app entry behind this one it steps back to it, so Retour returns
 * to the journey the reader came from: the calendar day, the search results,
 * the club's Matchs tab, each in the state it was left (those pages keep that
 * state in their URL or their history entry). `fallback` is where the control
 * goes when there is no in-app history: the listing the page belongs to
 * (`/news` for an article, `/matches` for a match), so "back" still means
 * something to someone who arrived by link.
 */
export function useBackTo(fallback: BackFallback) {
  const router = useRouter();
  // A new object each render is fine for the caller; the handler only needs
  // the fallback's value, so it is keyed on that.
  const key = typeof fallback === "string" ? fallback : JSON.stringify(fallback);
  return useCallback(() => {
    const destination = backDestination(router.history.canGoBack(), fallback);
    if (destination.kind === "history") {
      router.history.back();
      return;
    }
    void router.navigate({
      to: destination.to,
      ...(destination.search ? { search: destination.search } : {}),
    } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is `fallback`'s value
  }, [router, key]);
}
