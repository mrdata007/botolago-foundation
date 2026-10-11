// The provider-neutral performance shapes live in the Edge-shared folder so the
// SofaScore Fantasy builder can run in the Edge Function and in src/backend from
// one source. Import them from here as before.
export * from "../../../../supabase/functions/_shared/performance-contracts.ts";
