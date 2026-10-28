import { describe, expect, test } from "bun:test";

import { MockFootballRepository } from "@/backend/football/mock-repository";
import { clubAliasNames } from "@/content/club-aliases";
import { presentFootballClub } from "@/services/football";
import type { Club, Match } from "@/types/domain";

import { clubSlug } from "./club-slug";
import { clubSeoDescription, clubSeoTitle, matchSeoDescription, matchSeoTitle } from "./seo-titles";

/**
 * Owner decision, 2026-10-28: SEO must not move. The club table gives every
 * current club one display short name ("Raja", "Wydad", "Zemamra", "RS
 * Berkane"), and `presentFootballClub` applies it. The search titles,
 * descriptions, structured-data names and page addresses keep reading the
 * names the data gives. The strings below are what `main` produced before the
 * club table was applied; they are pinned as text so a change shows here.
 */

const context = { actorId: null, requestId: "test" } as const;

/** Production's catalog entries (name, short name, slug, city), as the data gives them. */
const DATA = {
  raja: ["Raja Casablanca", "Raja Casablanca", "raja-casablanca-3b0f1fc95b29", "Casablanca"],
  wydad: ["Wydad Casablanca", "WCA", "wydad-casablanca-80a3fb8202ae", "Casablanca"],
  zemamra: [
    "Renaissance Club Athletic Zemamra",
    "RCA Zemamra",
    "cr-khemis-zemamra-dc6fb8196f3e",
    "Zemamra",
  ],
  rsb: ["RSB Berkane", "RSB Berkane", "rsb-berkane-7b2e23bc450f", "Berkane"],
} as const;

async function presented(): Promise<Record<keyof typeof DATA, Club>> {
  const [first] = await new MockFootballRepository().getHomeMatches("fr", 1, context);
  const base = first!.homeTeam;
  const make = (key: keyof typeof DATA, index: number) => {
    const [name, shortName, slug, city] = DATA[key];
    return presentFootballClub({
      ...base,
      id: `7b2e23bc-450f-4a1e-9d0c-00000000000${index}`,
      slug,
      name,
      shortName,
      city,
      code: "",
    });
  };
  return {
    raja: make("raja", 1),
    wydad: make("wydad", 2),
    zemamra: make("zemamra", 3),
    rsb: make("rsb", 4),
  };
}

const match = (overrides: Partial<Match> = {}) =>
  ({
    kickoff: "2026-10-25T19:00:00.000Z",
    status: "scheduled",
    dateUnconfirmed: false,
    calledOff: false,
    ...overrides,
  }) as Match;

describe("search titles do not move with the display short name", () => {
  test("the clubs themselves now print the table's short names", async () => {
    const clubs = await presented();
    expect(clubs.raja.shortName.fr).toBe("Raja");
    expect(clubs.wydad.shortName.fr).toBe("Wydad");
    expect(clubs.zemamra.shortName.fr).toBe("Zemamra");
    expect(clubs.rsb.shortName.fr).toBe("RS Berkane");
  });

  test("club titles and descriptions are the strings main produced", async () => {
    const clubs = await presented();
    expect(clubSeoTitle(clubs.raja)).toBe(
      "Raja Casablanca : calendrier, classement, effectif et news | BotolaGO",
    );
    expect(clubSeoDescription(clubs.raja)).toBe(
      "Raja Casablanca, club de Casablanca, en Botola Pro : prochain match, résultats, classement Raja Casablanca, effectif et actualité.",
    );
    expect(clubSeoTitle(clubs.wydad)).toBe(
      "Wydad Casablanca : calendrier, classement, effectif et news | BotolaGO",
    );
    expect(clubSeoDescription(clubs.wydad)).toBe(
      "Wydad Casablanca, club de Casablanca, en Botola Pro : prochain match, résultats, classement Wydad Casablanca, effectif et actualité.",
    );
    expect(clubSeoTitle(clubs.zemamra)).toBe(
      "RCA Zemamra : calendrier, classement, effectif et news | BotolaGO",
    );
    expect(clubSeoDescription(clubs.zemamra)).toBe(
      "RCA Zemamra (Renaissance Club Athletic Zemamra), club de Zemamra, en Botola Pro : prochain match, résultats, classement RCA Zemamra, effectif et actualité.",
    );
    expect(clubSeoTitle(clubs.rsb)).toBe(
      "RSB Berkane : calendrier, classement, effectif et news | BotolaGO",
    );
    expect(clubSeoDescription(clubs.rsb)).toBe(
      "RSB Berkane, club de Berkane, en Botola Pro : prochain match, résultats, classement RSB Berkane, effectif et actualité.",
    );
  });

  test("match titles and descriptions are the strings main produced", async () => {
    const clubs = await presented();
    expect(matchSeoTitle(match(), clubs.raja, clubs.wydad)).toBe(
      "Raja Casablanca vs Wydad Casablanca : heure, compo et live (25 oct. 2026) | BotolaGO",
    );
    expect(matchSeoDescription(match(), clubs.raja, clubs.wydad)).toBe(
      "Raja Casablanca – Wydad Casablanca le 25 oct. 2026 à 19:00 en Botola Pro : heure du match, compositions, face-à-face, puis score en direct et résumé.",
    );
    const finished = match({ status: "finished", homeScore: 1, awayScore: 0 });
    expect(matchSeoTitle(finished, clubs.zemamra, clubs.rsb)).toBe(
      "RCA Zemamra 1-0 RSB Berkane : résumé, buts et compo (25 oct. 2026) | BotolaGO",
    );
    expect(matchSeoDescription(finished, clubs.zemamra, clubs.rsb)).toBe(
      "RCA Zemamra 1-0 RSB Berkane (Renaissance Club Athletic Zemamra – RSB Berkane), le 25 oct. 2026 en Botola Pro : résumé, buteurs, compositions et statistiques du match.",
    );
  });

  test("page addresses and the alias names (structured data) are unchanged", async () => {
    const clubs = await presented();
    expect(Object.values(clubs).map((club) => club.pathSlug)).toEqual([
      "raja-casablanca",
      "wydad-casablanca",
      "rca-zemamra",
      "rsb-berkane",
    ]);
    // Even without the precomputed address, the slug is read from the data's name.
    expect(Object.values(clubs).map((club) => clubSlug(club))).toEqual([
      "raja-casablanca",
      "wydad-casablanca",
      "rca-zemamra",
      "rsb-berkane",
    ]);
    // The aliases the club page prints and puts in its structured data: the same
    // lookup against the data's club (before the table) and the presented one.
    for (const [key, [name, shortName, slug]] of Object.entries(DATA)) {
      const raw = {
        slug,
        name: { fr: name, ar: name },
        shortName: { fr: shortName, ar: shortName },
      };
      const shown = [name];
      expect(clubAliasNames(clubs[key as keyof typeof DATA], shown), key).toEqual(
        clubAliasNames(raw, shown),
      );
    }
  });
});
