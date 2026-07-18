// Pass 3.1 — Narrow helper for generated-type mismatches on nullable UUIDs.
//
// The live Postgres RPCs `save_fantasy_team_v2` and `finalize_fantasy_gameweek_v2`
// accept SQL NULL for optional UUID/text arguments (`_team_id`,
// `_current_gameweek_id`, `_chip_finalize`, `_manager_name`). Supabase's
// generated `Args` types, however, model every argument as a non-nullable
// primitive because the SQL definitions do not declare DEFAULT NULL for
// those columns. Casting null through `unknown` scatters unsafe casts across
// the codebase, so we isolate the two documented mismatches here.
//
// This helper is the ONE place allowed to widen a nullable value into the
// generated string slot. If the generated types are ever regenerated to
// reflect nullable inputs, delete this file and inline the values.

/**
 * Widens `string | null | undefined` into the string slot expected by the
 * generated Supabase Args type. Emits `null` (not `""`) so the RPC's SQL
 * `COALESCE(NULL, ...)` and IS NULL branches fire correctly.
 *
 * Only call this for arguments whose SQL definition accepts NULL.
 */
export function asNullableUuidArg(value: string | null | undefined): string {
  // Cast is intentional: the runtime value is `null` when unset, which is
  // what PostgREST forwards to the RPC. The generated `string` type is a
  // documented over-tightening of the actual SQL signature.
  return (value ?? null) as unknown as string;
}

/** Same as `asNullableUuidArg` but for optional text arguments. */
export function asNullableTextArg(value: string | null | undefined): string {
  return (value ?? null) as unknown as string;
}
