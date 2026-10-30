import { describe, expect, it } from "bun:test";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import {
  firstUseOfImage,
  repeatsHowToWin,
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

describe("firstUseOfImage", () => {
  it("shows a photo once, and never the same photo on a later card", () => {
    const prizes = [
      { imageUrl: "a.jpg" },
      { imageUrl: null },
      { imageUrl: "a.jpg" },
      { imageUrl: "b.jpg" },
    ];
    expect(prizes.map((_, index) => firstUseOfImage(prizes, index))).toEqual([
      true,
      false,
      false,
      true,
    ]);
  });
});

describe("repeatsHowToWin", () => {
  it("drops a description that says what the rule says, in both languages", () => {
    expect(
      repeatsHowToWin(
        "Le meilleur score de la journée remporte une recharge mobile et un maillot officiel.",
        fr("prizes.how.gameweek"),
      ),
    ).toBe(true);
    expect(
      repeatsHowToWin(
        "Le meilleur total sur un bloc de 4 journées remporte un smartphone.",
        fr("prizes.how.monthly"),
      ),
    ).toBe(true);
    expect(
      repeatsHowToWin(
        "صاحب أعلى نقاط في الجولة يفوز برصيد هاتفي وقميص رسمي.",
        ar("prizes.how.gameweek"),
      ),
    ).toBe(true);
  });

  it("keeps a description that adds something the rule does not say", () => {
    expect(
      repeatsHowToWin(
        "Le champion de la saison remporte un voyage pour assister au derby.",
        fr("prizes.how.season"),
      ),
    ).toBe(false);
    expect(
      repeatsHowToWin(
        "Le leader de chaque ligue privée d'au moins 10 membres reçoit un pack supporter.",
        fr("prizes.how.mini_league"),
      ),
    ).toBe(false);
    expect(repeatsHowToWin("", fr("prizes.how.season"))).toBe(false);
  });
});
