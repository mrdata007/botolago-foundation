import { prefersReducedMotion } from "./motion";

/**
 * How a change of page moves (docs/engineering/MOTION_PLAN.md, #11).
 *
 * The browser's view transition snapshots the old page, swaps in the new one
 * and animates between the two; `styles.css` styles each kind by name:
 *
 *   - `forward`  into a page that sits inside the current one (a list to its
 *                detail): the new page arrives from the reading direction.
 *   - `back`     out of such a page: the new page arrives from the other side.
 *   - `fade`     everything else, the bottom tabs included: a plain cross-fade.
 *
 * Nothing moves when only the search or hash changes (a filter, a tab inside a
 * page), when the reader asked for less motion, or where the browser has no
 * view transitions: the page just changes, as it always did.
 */
export type PageTransitionKind = "forward" | "back" | "fade";

/** Whether `path` sits inside `parent` (`/matches/12` inside `/matches`). */
function isInside(path: string, parent: string): boolean {
  if (parent === "/" || parent === "") return false;
  return path.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
}

export function pageTransitionKind(fromPath: string, toPath: string): PageTransitionKind {
  if (isInside(toPath, fromPath)) return "forward";
  if (isInside(fromPath, toPath)) return "back";
  return "fade";
}

/** The view-transition types for a navigation, or false for none. */
export function pageTransitionTypes(info: {
  fromPath: string | undefined;
  toPath: string;
  pathChanged: boolean;
  reducedMotion: boolean;
}): string[] | false {
  if (info.reducedMotion || !info.pathChanged || info.fromPath === undefined) return false;
  return [pageTransitionKind(info.fromPath, info.toPath)];
}

/** What the router is given as `defaultViewTransition`. */
export const defaultViewTransition = {
  types: ({
    fromLocation,
    toLocation,
    pathChanged,
  }: {
    fromLocation?: { pathname: string };
    toLocation: { pathname: string };
    pathChanged: boolean;
  }) =>
    pageTransitionTypes({
      fromPath: fromLocation?.pathname,
      toPath: toLocation.pathname,
      pathChanged,
      reducedMotion: prefersReducedMotion(),
    }),
};
