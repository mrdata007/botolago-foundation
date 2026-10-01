import type { ProviderName, ProviderSquad } from "./contracts";
import { assessCompleteness } from "./completeness";
import { CLUB_PROVIDER_TEAMS, type ClubProviderTeams } from "./club-registry";
import { normalizeFlashscoreSquad } from "./flashscore-squad";
import { checkProviderIds, type IdChecks } from "./id-checks";
import { normalizeSofascoreSquad, type DobDetail, type ParsedSquad } from "./sofascore-squad";

/**
 * READ-ONLY collector. It asks the two providers for each club's squad and
 * turns the answers into candidate evidence held in memory. It has no database
 * access of any kind, writes no file and prints nothing: the caller decides
 * what to do with the result (see `evidence.ts` for the sanitized form).
 *
 * The only I/O is the injected `fetchJson`, one GET per club per provider.
 */
export interface FetchResult {
  readonly status: number;
  /** Parsed JSON, or null when the body could not be read as JSON. */
  readonly body: unknown;
}
export type FetchJson = (provider: ProviderName, pathAndQuery: string) => Promise<FetchResult>;

export interface CollectedSquad extends ProviderSquad {
  /** Aggregate-only inputs for the evidence; carries a birth date, so it stays in memory. */
  readonly dobDetail: readonly DobDetail[];
}

export interface CollectionResult {
  readonly collectedAt: string;
  readonly squads: readonly CollectedSquad[];
  readonly requests: Readonly<
    Record<ProviderName, { readonly sent: number; readonly failed: number }>
  >;
  readonly idChecks: IdChecks;
}

export interface CollectOptions {
  readonly fetchJson: FetchJson;
  readonly now: Date;
  readonly clubs?: readonly ClubProviderTeams[];
  /** Squad sizes held elsewhere (the app catalog), used only to judge completeness. */
  readonly appSquadSizes?: Readonly<Record<string, number>>;
}

export const sofascoreSquadPath = (teamId: number) => `teams/get-squad?teamId=${teamId}`;
export const flashscoreSquadPath = (teamId: string) =>
  `v1/teams/squad?team_id=${encodeURIComponent(teamId)}&sport_id=1&locale=en_INT`;

const EMPTY_PARSED: ParsedSquad = {
  structureOk: false,
  players: [],
  dobDetail: [],
  diagnostics: {
    listedEntries: 0,
    malformedEntries: 0,
    excludedCoaches: 0,
    unknownPositionLabels: 0,
    duplicateIds: [],
    otherLists: { foreign: null, national: null },
  },
};

/** A stable code for a failed request; never a response body or message. */
const errorCodeFor = (error: unknown) =>
  error instanceof Error && error.name === "TimeoutError" ? "timeout" : "request_error";

async function fetchOne(
  fetchJson: FetchJson,
  provider: ProviderName,
  path: string,
): Promise<{ ok: boolean; body: unknown; errorCode: string | null }> {
  try {
    const result = await fetchJson(provider, path);
    if (result.status < 200 || result.status >= 300)
      return { ok: false, body: null, errorCode: `http_${result.status}` };
    return { ok: true, body: result.body, errorCode: null };
  } catch (error) {
    return { ok: false, body: null, errorCode: errorCodeFor(error) };
  }
}

export async function collectSquads(options: CollectOptions): Promise<CollectionResult> {
  const clubs = options.clubs ?? CLUB_PROVIDER_TEAMS;
  const counts = {
    sofascore: { sent: 0, failed: 0 },
    flashscore: { sent: 0, failed: 0 },
  };
  // First pass: fetch and parse every squad.
  const raw: {
    club: ClubProviderTeams;
    provider: ProviderName;
    requestedTeamId: string;
    fetched: Awaited<ReturnType<typeof fetchOne>>;
    parsed: ParsedSquad | null;
  }[] = [];
  for (const club of clubs) {
    for (const provider of ["sofascore", "flashscore"] as const) {
      const requestedTeamId =
        provider === "sofascore" ? String(club.sofascoreTeamId) : club.flashscoreTeamId;
      const path =
        provider === "sofascore"
          ? sofascoreSquadPath(club.sofascoreTeamId)
          : flashscoreSquadPath(club.flashscoreTeamId);
      counts[provider].sent += 1;
      const fetched = await fetchOne(options.fetchJson, provider, path);
      if (!fetched.ok) counts[provider].failed += 1;
      const parsed = !fetched.ok
        ? null
        : provider === "sofascore"
          ? normalizeSofascoreSquad(fetched.body, club.sofascoreTeamId, options.now)
          : normalizeFlashscoreSquad(fetched.body, club.flashscoreTeamId);
      raw.push({ club, provider, requestedTeamId, fetched, parsed });
    }
  }
  // Second pass: completeness needs the other provider's size for the same club.
  const squads: CollectedSquad[] = raw.map((entry) => {
    const other = raw.find((r) => r.club === entry.club && r.provider !== entry.provider);
    const comparisonCounts = [
      other?.parsed?.players.length ?? 0,
      options.appSquadSizes?.[entry.club.clubKey] ?? 0,
    ];
    const completeness = assessCompleteness({
      fetched: entry.fetched.ok,
      parsed: entry.parsed,
      comparisonCounts,
    });
    const parsed = entry.parsed ?? EMPTY_PARSED;
    const status: ProviderSquad["status"] = !entry.fetched.ok
      ? "fetch_failed"
      : parsed.structureOk
        ? "ok"
        : "invalid_payload";
    return {
      provider: entry.provider,
      clubKey: entry.club.clubKey,
      requestedTeamId: entry.requestedTeamId,
      status,
      errorCode: status === "invalid_payload" ? "unexpected_shape" : entry.fetched.errorCode,
      players: parsed.players.map((player) => ({
        ...player,
        squadCompleteness: completeness.state,
      })),
      diagnostics: parsed.diagnostics,
      completeness,
      dobDetail: parsed.dobDetail,
    };
  });
  return {
    collectedAt: options.now.toISOString(),
    squads,
    requests: counts,
    idChecks: checkProviderIds(squads),
  };
}
