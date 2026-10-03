/**
 * READ-ONLY date-of-birth corroboration of Sofascore <-> Flashscore player
 * pairs, through the manual "Provider probe" workflow. No database, nothing
 * persisted, and NO date, timestamp, name or raw payload is ever printed: the
 * log of a public repository is public. Each pair prints one state
 * (AGREE / DISAGREE / NO_SIGNAL_*) with provider ids and request counts.
 *
 *   RAPIDAPI_KEY=... FLASHSCORE_RAPIDAPI_HOST=... PAIRS='[{"m":"17132481","s":"1140820","f":"8AYnWqxg"}]' \
 *     bun scripts/backend/provider-identity-corroboration.ts
 *
 * Requests: one Sofascore `matches/get-lineups` per DISTINCT match (it carries
 * every player's birth date, reused for all pairs of that match) and one
 * Flashscore `v1/players/data` per DISTINCT player. Each response is fetched
 * once and reused in memory. The total is capped (default 32) and checked
 * BEFORE the first request; a failed request is recorded and never retried.
 * The existing quota-reserve safeguard in `probe` still applies.
 */
import {
  assertNoDates,
  corroborateDob,
  flashscoreBirthdayFromPlayerData,
  sofascoreBirthdaysFromLineups,
  type CorroborationResult,
} from "../../src/backend/fantasy/provider-identity-corroboration";
import { probe } from "./provider-probe";

export const MAX_REQUESTS = 32;

export interface PairInput {
  /** Sofascore match id, Sofascore player id, Flashscore player id. */
  readonly m: string;
  readonly s: string;
  readonly f: string;
}

export type FetchProvider = (
  provider: "sofascore" | "flashscore",
  pathAndQuery: string,
) => Promise<{ readonly status: number; readonly body: unknown }>;

export interface CorroborationReport {
  readonly requests: { readonly sofascore: number; readonly flashscore: number };
  readonly failed: readonly {
    readonly provider: string;
    readonly id: string;
    readonly status: number;
  }[];
  readonly results: readonly (
    | CorroborationResult
    | { readonly m: string; readonly s: string; readonly f: string; readonly dob: "NOT_FETCHED" }
  )[];
  readonly summary: Readonly<Record<string, number>>;
}

export const sofascoreLineupsPath = (matchId: string) =>
  `matches/get-lineups?matchId=${encodeURIComponent(matchId)}`;
export const flashscorePlayerPath = (playerId: string) =>
  `v1/players/data?player_id=${encodeURIComponent(playerId)}&sport_id=1&locale=en_INT`;

/** How many requests these pairs need, counting each match and each Flashscore player once. */
export function requestsNeeded(pairs: readonly PairInput[]) {
  return {
    sofascore: new Set(pairs.map((p) => p.m)).size,
    flashscore: new Set(pairs.map((p) => p.f)).size,
  };
}

export async function runCorroboration(options: {
  readonly pairs: readonly PairInput[];
  readonly fetchProvider: FetchProvider;
  readonly now: Date;
  readonly maxRequests?: number;
}): Promise<CorroborationReport> {
  const { pairs, fetchProvider, now } = options;
  const cap = options.maxRequests ?? MAX_REQUESTS;
  const need = requestsNeeded(pairs);
  if (need.sofascore + need.flashscore > cap) {
    throw new Error(
      `Refused: ${need.sofascore + need.flashscore} requests needed, at most ${cap} allowed.`,
    );
  }
  const failed: { provider: string; id: string; status: number }[] = [];
  const lineups = new Map<string, Map<string, unknown> | null>();
  const players = new Map<string, { readonly value: unknown } | null>();
  let sofa = 0;
  let flash = 0;

  for (const m of [...new Set(pairs.map((p) => p.m))]) {
    sofa += 1;
    const r = await fetchProvider("sofascore", sofascoreLineupsPath(m));
    if (r.status === 200) lineups.set(m, sofascoreBirthdaysFromLineups(r.body));
    else {
      lineups.set(m, null);
      failed.push({ provider: "sofascore", id: m, status: r.status });
    }
  }
  for (const f of [...new Set(pairs.map((p) => p.f))]) {
    flash += 1;
    const r = await fetchProvider("flashscore", flashscorePlayerPath(f));
    if (r.status === 200) players.set(f, { value: flashscoreBirthdayFromPlayerData(r.body) });
    else {
      players.set(f, null);
      failed.push({ provider: "flashscore", id: f, status: r.status });
    }
  }

  const results = pairs.map((p) => {
    const sofaLineup = lineups.get(p.m);
    const flashPlayer = players.get(p.f);
    // A request that failed is NOT_FETCHED. A response without a date is no signal.
    if (!sofaLineup || !flashPlayer) return { m: p.m, s: p.s, f: p.f, dob: "NOT_FETCHED" as const };
    return corroborateDob(
      { sofascoreFixtureId: p.m, sofascorePlayerId: p.s, flashscorePlayerId: p.f },
      sofaLineup.get(p.s),
      flashPlayer.value,
      now,
    );
  });
  const summary: Record<string, number> = {};
  for (const r of results) summary[r.dob] = (summary[r.dob] ?? 0) + 1;
  const report: CorroborationReport = {
    requests: { sofascore: sofa, flashscore: flash },
    failed,
    results,
    summary,
  };
  // The last line of defence: nothing that looks like a date may be printed.
  assertNoDates(JSON.stringify(report));
  return report;
}

if (import.meta.main) {
  const raw = process.env.PAIRS ?? "";
  const pairs = JSON.parse(raw) as PairInput[];
  if (!Array.isArray(pairs) || pairs.length === 0)
    throw new Error("PAIRS must be a non-empty JSON array");
  for (const p of pairs) {
    if (![p.m, p.s, p.f].every((v) => typeof v === "string" && /^[A-Za-z0-9]{1,20}$/.test(v))) {
      throw new Error("Every pair needs ids made of letters and digits only");
    }
  }
  const report = await runCorroboration({
    pairs,
    now: new Date(),
    fetchProvider: async (provider, path) => {
      const r = await probe(provider, path);
      let body: unknown = null;
      try {
        body = JSON.parse(r.body);
      } catch {
        body = null;
      }
      return { status: r.status, body };
    },
  });
  console.log(JSON.stringify(report));
}
