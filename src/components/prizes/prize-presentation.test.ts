import { describe, expect, it } from "bun:test";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import {
  fill,
  formatMad,
  periodLabel,
  prizeAdminErrorMessage,
  tierLabel,
} from "./prize-presentation";

const fr = (key: TranslationKey) => dictionaries.fr[key];
const ar = (key: TranslationKey) => dictionaries.ar[key];

describe("prize labels", () => {
  it("fills named placeholders and leaves unknown ones visible", () => {
    expect(fill("Journée {n}", { n: 7 })).toBe("Journée 7");
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it("names every period the way the wall shows it", () => {
    const base = { firstGameweekNumber: 5, lastGameweekNumber: 8, seasonName: "2026/27" };
    expect(periodLabel(fr, { ...base, tier: "gameweek", firstGameweekNumber: 8 })).toBe(
      "Journée 8",
    );
    expect(periodLabel(fr, { ...base, tier: "monthly" })).toBe("Journées 5–8");
    expect(periodLabel(fr, { ...base, tier: "season" })).toBe("Saison 2026/27");
    expect(periodLabel(ar, { ...base, tier: "monthly" })).toBe("الجولات 5–8");
    expect(periodLabel(fr, { ...base, tier: "mini_league", leagueName: "Les amis" })).toBe(
      "Les amis",
    );
  });

  it("calls the block tier 'Monthly' in the interface", () => {
    expect(tierLabel(fr, "monthly")).toBe("Lot du mois");
    expect(tierLabel(ar, "monthly")).toBe("الجائزة الشهرية");
  });

  it("formats a value in dirhams in the reader's language", () => {
    expect(formatMad(fr, 25000, "fr").replace(/\s/g, " ")).toBe("Valeur estimée : 25 000 MAD");
    expect(formatMad(ar, 500, "ar")).toContain("درهم");
  });

  it("turns known refusals into sentences and keeps the code for the rest", () => {
    expect(prizeAdminErrorMessage(fr, "prize_settings_conflict")).toBe(
      dictionaries.fr["prizes.admin.error.settings_conflict"],
    );
    expect(prizeAdminErrorMessage(fr, "staff_access_denied")).toBe(
      "Action refusée : staff_access_denied",
    );
  });
});
