/** Which frame the loading screen draws (PendingScreen.tsx). */

/**
 * The pages drawn without the app frame: admin, auth and dev screens, and the
 * standalone OAuth consent page (`/.lovable/oauth/consent`), which must not
 * offer the app's navigation while it loads.
 */
export function pendingWithoutShell(pathname: string): boolean {
  return /^\/(admin|auth|dev|\.lovable)(\/|$)/.test(pathname);
}

/** The detail pages drawn without the bottom bar (`hideBottomNav` in their routes). */
export function pendingHidesBottomNav(pathname: string): boolean {
  if (pathname === "/matches/standings") return false;
  return /^\/(news|clubs|journee|matches)\/[^/]+\/?$/.test(pathname);
}
