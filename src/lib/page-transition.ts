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
 *   - `fade`     everything else: a plain cross-fade.
 *   - `none`     a move between same-level destinations (the bottom tabs, and
 *                Matches / Classement / Pronostics): no transition at all, so
 *                the new page shows as soon as it is ready instead of waiting
 *                for the browser to snapshot and animate (NAVIGATION_SPEED.md).
 *
 * Nothing moves when only the search or hash changes (a filter, a tab inside a
 * page), when the reader asked for less motion, or where the browser has no
 * view transitions: the page just changes, as it always did.
 */
export type PageTransitionKind = "forward" | "back" | "fade" | "none";

/**
 * The same-level destinations: the bottom nav's routes (primary-nav.ts; a test
 * keeps the two in step) and the route-backed section tabs of Matches.
 * Each entry is a path that is itself a top-level page, not a page inside one.
 */
export const SAME_LEVEL_ROOTS: readonly string[] = [
  "/",
  "/news",
  "/fantasy",
  "/matches",
  "/pepites",
  "/curva",
  "/profile",
  "/matches/standings",
  "/pronostics",
];

/** The section a same-level destination belongs to: Pronostics and Classement live in Matches. */
function sectionOf(path: string): string {
  if (path === "/pronostics" || path === "/matches/standings") return "/matches";
  return path;
}

/** The section a deeper page sits in (`/matches/12` in `/matches`), if it sits in one. */
function sectionContaining(path: string): string | undefined {
  const root = SAME_LEVEL_ROOTS.find((r) => r !== "/" && (path === r || isInside(path, r)));
  return root === undefined ? undefined : sectionOf(root);
}

function normalise(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** Whether `path` sits inside `parent` (`/matches/12` inside `/matches`). */
function isInside(path: string, parent: string): boolean {
  if (parent === "/" || parent === "") return false;
  return path.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
}

export function pageTransitionKind(fromPath: string, toPath: string): PageTransitionKind {
  const from = normalise(fromPath);
  const to = normalise(toPath);
  // Same-level first: /matches to /matches/standings is a tab, not a drill-down.
  if (SAME_LEVEL_ROOTS.includes(to) && SAME_LEVEL_ROOTS.includes(from)) return "none";
  // A bottom-tab tap from deep inside another section (a match, an article) also stays put.
  const fromSection = sectionContaining(from);
  if (SAME_LEVEL_ROOTS.includes(to) && fromSection && fromSection !== sectionOf(to)) return "none";
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
  const kind = pageTransitionKind(info.fromPath, info.toPath);
  return kind === "none" ? false : [kind];
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

/**
 * Whether this browser can label a view transition with a type. The router
 * only consults `defaultViewTransition.types` (and so only honours a `false`
 * from it) where `:active-view-transition-type()` is supported. Elsewhere it
 * starts a bare, untyped transition on every navigation: a plain cross-fade,
 * since the slides are keyed on the types, and same-level moves would get it
 * too. `true` on the server, where nothing transitions anyway.
 */
export function supportsTypedViewTransitions(
  css: { supports?: (condition: string) => boolean } | undefined = typeof window === "undefined"
    ? undefined
    : window.CSS,
): boolean {
  if (typeof window === "undefined" && css === undefined) return true;
  return css?.supports?.("selector(:active-view-transition-type(a))") === true;
}

/**
 * The router's `defaultViewTransition`: the typed transitions where the
 * browser supports them, and none at all where it does not, so a browser
 * without types never cross-fades between same-level pages.
 */
export function viewTransitionOption(
  typed: boolean = supportsTypedViewTransitions(),
): typeof defaultViewTransition | false {
  return typed ? defaultViewTransition : false;
}
