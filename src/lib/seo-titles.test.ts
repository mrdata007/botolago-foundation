import { describe, expect, test } from "bun:test";
import {
  clubSearchName,
  clubSeoDescription,
  clubSeoTitle,
  matchSeoDescription,
  matchSeoTitle,
} from "./seo-titles";
import type { Club, Match } from "@/types/domain";

const club = (short: string, name: string, city = "Berkane") =>
  ({
    name: { fr: name, ar: name },
    shortName: { fr: short, ar: short },
    city: { fr: city, ar: city },
  }) as unknown as Club;

const berkane = club("RSB Berkane", "Renaissance Sportive de Berkane");
const zemamra = club("RCA Zemamra", "Renaissance Club Athletic Zemamra", "Zemamra");

const match = (overrides: Partial<Match> = {}) =>
  ({
    kickoff: "2026-10-25T19:00:00.000Z",
    status: "scheduled",
    dateUnconfirmed: false,
    calledOff: false,
    ...overrides,
  }) as Match;

describe("search titles", () => {
  test("a club goes by its short name; a bare code gives way to the full name", () => {
    expect(clubSearchName(berkane)).toBe("RSB Berkane");
    expect(clubSearchName(club("RSB", "RS Berkane"))).toBe("RS Berkane");
    expect(clubSearchName(club(" ", "Wydad AC"))).toBe("Wydad AC");
  });

  test("a match title leads with the short names and the words people search", () => {
    expect(matchSeoTitle(match(), berkane, zemamra)).toBe(
      "RSB Berkane vs RCA Zemamra : heure, compo et live (25 oct. 2026) | BotolaGO",
    );
    expect(matchSeoTitle(match({ status: "live" }), berkane, zemamra)).toBe(
      "RSB Berkane vs RCA Zemamra : score en direct et compo | BotolaGO",
    );
    expect(
      matchSeoTitle(match({ status: "finished", homeScore: 2, awayScore: 2 }), berkane, zemamra),
    ).toBe("RSB Berkane 2-2 RCA Zemamra : résumé, buts et compo (25 oct. 2026) | BotolaGO");
  });

  test("an unconfirmed date is never put in a title", () => {
    const postponed = match({ status: "postponed", dateUnconfirmed: true });
    expect(matchSeoTitle(postponed, berkane, zemamra)).toBe(
      "RSB Berkane vs RCA Zemamra : heure, compo et live | BotolaGO",
    );
  });

  test("the description carries the full names too, and the Morocco time", () => {
    const description = matchSeoDescription(match(), berkane, zemamra);
    expect(description).toContain(
      "(Renaissance Sportive de Berkane – Renaissance Club Athletic Zemamra)",
    );
    // Morocco keeps UTC+0 from 2026-09-20 (`@/lib/morocco-time`).
    expect(description).toContain("le 25 oct. 2026 à 19:00");
  });

  test("a club title and description name the club both ways", () => {
    expect(clubSeoTitle(berkane)).toBe(
      "RSB Berkane : calendrier, classement, effectif et news | BotolaGO",
    );
    expect(clubSeoDescription(berkane)).toBe(
      "RSB Berkane (Renaissance Sportive de Berkane), club de Berkane, en Botola Pro : prochain match, résultats, classement RSB Berkane, effectif et actualité.",
    );
  });
});
