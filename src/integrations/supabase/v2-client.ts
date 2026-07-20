import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/backend/generated/database.types";
import { supabase } from "./client";

/**
 * The frozen application still has legacy-typed fantasy adapters. Identity V2
 * shares the same physical/auth client but uses the greenfield generated type
 * contract and explicitly selects the only exposed schema: api.
 */
export const supabaseV2 = supabase as unknown as SupabaseClient<Database>;
export const identityApi = supabaseV2.schema("api");
