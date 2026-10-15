import type { AuthStatus } from "@/services/auth-types";

/**
 * Who may see Curva: an account. A signed-out visitor (`guest` in the mock and device modes,
 * `anonymous` with Supabase) gets the lock screen on every Curva address; while the session is not
 * known yet (`loading`, or a second factor still owed) nothing of Curva is drawn.
 */
export type CurvaAccess = "open" | "locked" | "pending";

export function curvaAccess(status: AuthStatus): CurvaAccess {
  if (status === "authenticated") return "open";
  if (status === "guest" || status === "anonymous") return "locked";
  return "pending";
}
