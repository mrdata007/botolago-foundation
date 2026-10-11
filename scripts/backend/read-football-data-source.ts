import { appendFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

import { parseFootballDataSource, skipsSportsMonks } from "./fantasy-season-orchestrator";

/**
 * Workflow helper: reads `api.football_data_source()` (read-only) and writes
 * `source=<name>` and `skip_sportsmonks=<true|false>` to $GITHUB_OUTPUT, so a
 * workflow can skip the steps that call SportsMonks while SofaScore is the
 * source.
 *
 * Fail safe: any failure (missing credentials, network, an unknown value) is
 * reported as `unknown` with `skip_sportsmonks=false`, so the workflow behaves
 * exactly as it did before the switch existed. This script never exits
 * non-zero and never prints a credential.
 */
export function outputsFor(raw: unknown) {
  const source = parseFootballDataSource(raw);
  return { source, skipSportsMonks: skipsSportsMonks(source) };
}

export async function readFootballDataSource(
  url: string | undefined,
  key: string | undefined,
): Promise<unknown> {
  if (!url || !key) return null;
  const api = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "api" },
  });
  const { data, error } = await api
    .rpc("football_data_source", {})
    .abortSignal(AbortSignal.timeout(30000));
  return error ? null : data;
}

if (import.meta.main) {
  let raw: unknown = null;
  try {
    raw = await readFootballDataSource(
      process.env.SUPABASE_PRODUCTION_URL?.replace(/\/$/, ""),
      process.env.SUPABASE_SECRET_KEY,
    );
  } catch {
    raw = null;
  }
  const { source, skipSportsMonks } = outputsFor(raw);
  const lines = `source=${source}\nskip_sportsmonks=${skipSportsMonks}\n`;
  process.stdout.write(`football data source: ${source}; skip SportsMonks: ${skipSportsMonks}\n`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, lines);
}
