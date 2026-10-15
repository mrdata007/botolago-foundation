import { supabaseV2 } from "@/integrations/supabase/v2-client";

/**
 * Whose data a read returns: the account whose session the request will carry
 * (the signed-in user's id, or "anonymous"). An unreadable session never
 * shares (a fresh identity per call).
 */
export async function hubIdentity(): Promise<string> {
  try {
    const { data } = await supabaseV2.auth.getSession();
    return data.session?.user.id ?? "anonymous";
  } catch {
    return `unknown:${crypto.randomUUID()}`;
  }
}
