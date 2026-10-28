// SportAPI (RapidAPI host sportapi7.p.rapidapi.com) behind the request paths the
// Edge Functions already use.
//
// Every caller (sofascore-live-refresh, -match-details, -fantasy-auto,
// -staged-stats, -standings, -catalog) asks for the paths of the Sofascore host
// (`matches/get-lineups?matchId=1`, `tournaments/get-live-events?sport=football`,
// ...) and parses what that host answers. SportAPI serves Sofascore's own raw
// data with the same ids, under native paths (`api/v1/event/1/lineups`). This
// module maps one to the other and adjusts the few answers whose shape differs, so
// no caller changes. rapidapi-client.ts applies it when RAPIDAPI_HOST is
// SportAPI's host; the budget counter and the essential-endpoint list keep using
// the Sofascore-host path, so a call is counted under the same endpoint name on
// either host.
//
// Real answers captured on 2026-10-27 were compared with the Sofascore host's
// (tests/fixtures/providers/sportapi/README.md): the shapes are the same raw
// Sofascore objects; SportAPI only carries more fields. The differences that matter
// are in this file:
//   - a missing resource is an HTTP 404 here (rapidapi-client.ts turns it into
//     `data_unavailable`), where the Sofascore host answered 200 with an
//     `{"error": ...}` body;
//   - the live feed lists every football match in the world and cannot be limited
//     to one tournament by the request, so the Botola ones are kept here;
//   - the season lists are paged in the path, not in a query string.
//
// Dependency-free apart from sibling shared modules.

import { BOTOLA_UNIQUE_TOURNAMENT_ID } from "./sofascore-fixtures.ts";

export const SPORTAPI_RAPIDAPI_HOST = "sportapi7.p.rapidapi.com";

/** The path to send to SportAPI and how to turn its answer into the Sofascore host's. */
export interface TranslatedRequest {
  /** Without a leading slash or a query string. */
  readonly path: string;
  readonly normalise: (data: unknown) => unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const identity = (data: unknown): unknown => data;

/** A provider id: digits, no leading zero. Anything else is not sent. */
function id(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  return value !== null && /^[1-9][0-9]{0,11}$/.test(value) ? value : null;
}

/** A page number: 0 or more, three digits at most. */
function page(params: URLSearchParams): string | null {
  const value = params.get("pageIndex") ?? "0";
  return /^(0|[1-9][0-9]{0,2})$/.test(value) ? value : null;
}

/**
 * `{events: [...]}` of the live feed without the events of other tournaments.
 * An event whose tournament cannot be read stays, so the parser still counts it
 * as malformed, as it did on the Sofascore host.
 */
export function onlyBotolaLiveEvents(data: unknown): unknown {
  if (!isRecord(data) || !Array.isArray(data.events)) return data;
  const events = data.events.filter((event) => {
    if (!isRecord(event) || !isRecord(event.tournament)) return true;
    const unique = event.tournament.uniqueTournament;
    if (!isRecord(unique)) return true;
    const tournamentId = unique.id;
    return !(
      typeof tournamentId === "number" &&
      Number.isInteger(tournamentId) &&
      tournamentId > 0 &&
      tournamentId !== BOTOLA_UNIQUE_TOURNAMENT_ID
    );
  });
  return { ...data, events };
}

/** `hasNextPage` is always a boolean, as the season pager reads it. */
export function withHasNextPage(data: unknown): unknown {
  if (!isRecord(data) || !Array.isArray(data.events)) return data;
  return { ...data, hasNextPage: data.hasNextPage === true };
}

/**
 * The SportAPI request for a path of the Sofascore host, or null when there is
 * none (an endpoint without an equivalent, or an id that is not a plain number):
 * the caller then sends nothing.
 */
export function translateToSportApi(pathAndQuery: string): TranslatedRequest | null {
  const trimmed = pathAndQuery.replace(/^\//, "");
  const cut = trimmed.indexOf("?");
  const route = cut === -1 ? trimmed : trimmed.slice(0, cut);
  const params = new URLSearchParams(cut === -1 ? "" : trimmed.slice(cut + 1));
  const sent = (path: string, normalise: (data: unknown) => unknown = identity) => ({
    path,
    normalise,
  });

  switch (route) {
    case "matches/get-lineups":
    case "matches/get-incidents":
    case "matches/get-statistics": {
      const matchId = id(params, "matchId");
      return matchId ? sent(`api/v1/event/${matchId}/${route.slice("matches/get-".length)}`) : null;
    }
    case "tournaments/get-live-events":
      return params.get("sport") === "football" || params.get("sport") === null
        ? sent("api/v1/sport/football/events/live", onlyBotolaLiveEvents)
        : null;
    case "tournaments/get-next-matches":
    case "tournaments/get-last-matches": {
      const tournamentId = id(params, "tournamentId");
      const seasonId = id(params, "seasonId");
      const pageIndex = page(params);
      if (!tournamentId || !seasonId || pageIndex === null) return null;
      const direction = route === "tournaments/get-next-matches" ? "next" : "last";
      return sent(
        `api/v1/unique-tournament/${tournamentId}/season/${seasonId}/events/${direction}/${pageIndex}`,
        withHasNextPage,
      );
    }
    case "tournaments/get-standings": {
      const tournamentId = id(params, "tournamentId");
      const seasonId = id(params, "seasonId");
      const type = params.get("type") ?? "total";
      if (!tournamentId || !seasonId || !["total", "home", "away"].includes(type)) return null;
      return sent(`api/v1/unique-tournament/${tournamentId}/season/${seasonId}/standings/${type}`);
    }
    case "teams/get-squad": {
      const teamId = id(params, "teamId");
      return teamId ? sent(`api/v1/team/${teamId}/players`) : null;
    }
    // Images: the answer is a PNG, not JSON. Nothing to normalise; the catalog's
    // client keeps the bytes (sofascore-catalog.ts).
    case "teams/get-logo": {
      const teamId = id(params, "teamId");
      return teamId ? sent(`api/v1/team/${teamId}/image`) : null;
    }
    case "players/get-image": {
      const playerId = id(params, "playerId");
      return playerId ? sent(`api/v1/player/${playerId}/image`) : null;
    }
    default:
      return null;
  }
}
