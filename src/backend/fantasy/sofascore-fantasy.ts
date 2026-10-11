/**
 * SofaScore-only Fantasy observations (docs/backend/SOFASCORE_FANTASY_SIMPLE.md).
 *
 * The builder is in supabase/functions/_shared/sofascore-fantasy.ts so that the
 * Edge Function `football-live-refresh` (which runs it after every finished
 * match) and the manual runner (scripts/backend/sofascore-fantasy-simple-ingest.ts,
 * the backfill and override tool) use the same code. Import it from here as
 * before.
 */
export * from "../../../supabase/functions/_shared/sofascore-fantasy.ts";
