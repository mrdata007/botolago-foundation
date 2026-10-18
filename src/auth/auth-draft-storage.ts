export const AUTH_DRAFT_FIELDS = [
  "login.email",
  "register.fullName",
  "register.username",
  "register.email",
] as const;

/** Only a confirmed session may retire drafts from every auth entry point. */
export function clearAuthDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    for (const field of AUTH_DRAFT_FIELDS) {
      window.sessionStorage.removeItem(`botolago.auth-draft.${field}`);
    }
  } catch {
    // Blocked browser storage must never prevent authentication.
  }
}
