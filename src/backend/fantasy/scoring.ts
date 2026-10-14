/**
 * Fantasy point arithmetic. The code is in supabase/functions/_shared/fantasy-scoring-core.ts
 * so the Edge Function `fantasy-lifecycle-worker` and the scripts run the same
 * module; import it from here as before.
 */
export * from "../../../supabase/functions/_shared/fantasy-scoring-core.ts";
