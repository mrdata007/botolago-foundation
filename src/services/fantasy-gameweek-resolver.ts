// Pass 2 — Gameweek number ↔ UUID resolver.
//
// Loads `public.gameweeks` (id, number, season, status, deadline) once and
// exposes typed lookups. Missing numbers throw a typed FantasyRepoError
// rather than silently returning a wrong UUID.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { FantasyRepoError, toRepoError } from "@/services/fantasy-errors";

export interface GameweekRow {
  id: string;
  number: number;
  season: string;
  status: string;
  deadline: string;
}

export interface GameweekIndex {
  bySeasonAndNumber: ReadonlyMap<string, GameweekRow>;
  seasons: readonly string[];
}

function key(season: string, number: number): string {
  return `${season}#${number}`;
}

export function buildGameweekIndex(rows: GameweekRow[]): GameweekIndex {
  const bySeasonAndNumber = new Map<string, GameweekRow>();
  const seasons = new Set<string>();
  for (const r of rows) {
    bySeasonAndNumber.set(key(r.season, r.number), r);
    seasons.add(r.season);
  }
  return { bySeasonAndNumber, seasons: Array.from(seasons).sort() };
}

export function resolveGameweekId(
  index: GameweekIndex,
  input: { number: number; season: string },
): string {
  const row = index.bySeasonAndNumber.get(key(input.season, input.number));
  if (!row) {
    throw new FantasyRepoError(
      "gameweek_unresolved",
      `No gameweek matches season=${input.season} number=${input.number}`,
      undefined,
    );
  }
  return row.id;
}

export function resolveGameweek(
  index: GameweekIndex,
  input: { number: number; season: string },
): GameweekRow {
  const row = index.bySeasonAndNumber.get(key(input.season, input.number));
  if (!row) {
    throw new FantasyRepoError(
      "gameweek_unresolved",
      `No gameweek matches season=${input.season} number=${input.number}`,
    );
  }
  return row;
}

let cached: GameweekIndex | null = null;
let inflight: Promise<GameweekIndex> | null = null;

export function invalidateGameweekIndex(): void {
  cached = null;
  inflight = null;
}

export async function loadGameweekIndex(
  client: SupabaseClient<Database> = defaultClient,
  opts: { force?: boolean } = {},
): Promise<GameweekIndex> {
  if (!opts.force && cached) return cached;
  if (!opts.force && inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await client
      .from("gameweeks")
      .select("id, number, season, status, deadline");
    if (error) throw toRepoError(error);
    const idx = buildGameweekIndex((data ?? []) as GameweekRow[]);
    cached = idx;
    return idx;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Test hook — inject a prebuilt index. */
export function __setCachedGameweekIndexForTests(index: GameweekIndex | null): void {
  cached = index;
  inflight = null;
}
