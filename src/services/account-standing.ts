import { z } from "zod";
import { getIdentityApi } from "@/integrations/supabase/v2-client";

/**
 * Whether the signed-in account is banned, and what the sign-in page should
 * say about it once the app has signed it out.
 *
 * The ban itself is enforced in the database (a banned account's writes are
 * refused there, whatever calls them). This is the part a person sees: on load
 * and whenever the tab comes back, the app asks, and a banned account is
 * signed out and told why instead of meeting refusals one button at a time.
 */

export const accountStandingSchema = z.object({
  banned: z.boolean(),
  bannedUntil: z.string().datetime({ offset: true }).nullable(),
});

export type AccountStanding = z.infer<typeof accountStandingSchema>;

/**
 * The account's standing, or null when it cannot be known right now -- no
 * network, a database the migration has not reached yet, an unexpected
 * answer. Null means "carry on": an unknown standing never signs anyone out.
 */
export async function fetchAccountStanding(): Promise<AccountStanding | null> {
  try {
    const { data, error } = await getIdentityApi().rpc("get_my_account_standing");
    if (error) return null;
    const parsed = accountStandingSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const SUSPENSION_NOTICE_KEY = "botolago.account.suspended";

export interface SuspensionNotice {
  /** ISO end of the ban; null for a ban until lifted. */
  readonly until: string | null;
}

/** Kept for the sign-in page, which the app opens right after signing out. */
export function rememberSuspension(until: string | null): void {
  try {
    window.sessionStorage.setItem(SUSPENSION_NOTICE_KEY, JSON.stringify({ until }));
  } catch {
    // Storage can be denied outright in a private window. The sign-out still
    // happens; only the explanation is lost.
  }
}

/** Reads the notice once and forgets it, so it is shown a single time. */
export function takeSuspensionNotice(): SuspensionNotice | null {
  try {
    const raw = window.sessionStorage.getItem(SUSPENSION_NOTICE_KEY);
    if (raw === null) return null;
    window.sessionStorage.removeItem(SUSPENSION_NOTICE_KEY);
    const parsed = z
      .object({ until: z.string().datetime({ offset: true }).nullable() })
      .safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
