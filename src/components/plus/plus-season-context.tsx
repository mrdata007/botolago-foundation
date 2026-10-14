import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  deriveSeason,
  LEAGUE_SIZE,
  SEASON,
  SEASON_PEOPLE,
  SEASON_RAW,
  type Season,
  type SeasonRaw,
} from "./plus-season-data";

/** One side of a duel, when the screen has a real manager (the example uses the dictionary). */
export interface SeasonPerson {
  name: string;
  initials: string;
  club: string | null;
}
export interface SeasonPeople {
  you: SeasonPerson;
  rival: SeasonPerson;
}

/**
 * What « Votre saison » and « Détail du duel » draw: the raw series, what is derived from them,
 * the number of journées and the league's size. The default is the example season, so the offer
 * (step 2) renders exactly as before; a member's screens are given the same shape by
 * `plus-member-data.ts`. `people` is null for the example (the dictionary names Karim and Sami).
 */
export interface SeasonView {
  raw: SeasonRaw;
  S: Season;
  /** Journées played. */
  J: number;
  /** Managers in the league; missing (`NaN`) when the reader's reads do not say. */
  leagueSize: number;
  people: SeasonPeople | null;
  /** True for the example season, false for a member's own figures. */
  example: boolean;
}

export const EXAMPLE_VIEW: SeasonView = {
  raw: SEASON_RAW,
  S: SEASON,
  J: SEASON.J,
  leagueSize: LEAGUE_SIZE,
  people: null,
  example: true,
};

export function makeSeasonView(
  raw: SeasonRaw,
  options: { leagueSize?: number; people?: SeasonPeople | null } = {},
): SeasonView {
  const leagueSize = options.leagueSize ?? Number.NaN;
  return {
    raw,
    S: deriveSeason(raw, Number.isFinite(leagueSize) ? leagueSize : LEAGUE_SIZE),
    J: raw.you.length,
    leagueSize,
    people: options.people ?? null,
    example: false,
  };
}

const SeasonContext = createContext<SeasonView>(EXAMPLE_VIEW);

export function SeasonProvider({ view, children }: { view: SeasonView; children: ReactNode }) {
  return <SeasonContext.Provider value={view}>{children}</SeasonContext.Provider>;
}

export function useSeason(): SeasonView {
  return useContext(SeasonContext);
}

/** Names and initials for the two sides of a duel; the example's, from the dictionary, by default. */
export function useDuelPeople(fallback: { you: string; rival: string }): SeasonPeople {
  const { people } = useSeason();
  return useMemo(
    () =>
      people ?? {
        you: {
          name: fallback.you,
          initials: SEASON_PEOPLE.you.initials,
          club: SEASON_PEOPLE.you.club,
        },
        rival: {
          name: fallback.rival,
          initials: SEASON_PEOPLE.rival.initials,
          club: SEASON_PEOPLE.rival.club,
        },
      },
    [people, fallback.you, fallback.rival],
  );
}
