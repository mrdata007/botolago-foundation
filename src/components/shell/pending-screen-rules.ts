/** Which frame the loading screen draws (PendingScreen.tsx). */

/** The pages drawn without the app frame. */
export function pendingWithoutShell(pathname: string): boolean {
  return /^\/(admin|auth|dev)(\/|$)/.test(pathname);
}

/** The detail pages drawn without the bottom bar (`hideBottomNav` in their routes). */
export function pendingHidesBottomNav(pathname: string): boolean {
  if (pathname === "/matches/standings") return false;
  return /^\/(news|clubs|journee|matches)\/[^/]+\/?$/.test(pathname);
}
