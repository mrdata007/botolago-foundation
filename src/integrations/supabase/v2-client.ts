import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/backend/generated/database.types";
import { supabase } from "./client";

/**
 * The frozen application still has legacy-typed fantasy adapters. Identity V2
 * shares the same physical/auth client but uses the greenfield generated type
 * contract and explicitly selects the only exposed schema: api.
 */
export const supabaseV2 = supabase as unknown as SupabaseClient<Database>;

/**
 * Resolve the schema client lazily so importing pure repository helpers does
 * not require browser/CI credentials. The first real backend call still fails
 * closed through the canonical Supabase client when configuration is absent.
 */
export function getIdentityApi() {
  return supabaseV2.schema("api");
}
