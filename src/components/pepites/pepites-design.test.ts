import { describe, expect, it } from "bun:test";

import { initials, ratingBand, segments, shirtName, teamKit } from "./pepites-design";
import { formatCount, nextSeasonLabel, playerMetaLine } from "./pepites-format";

describe("the Figma parts' helpers", () => {
  it("takes initials from the first and last words, a note in brackets aside", () => {
    expect(initials("Abdelhamid Maali")).toBe("AM");
    expect(initials("Baba Bello Ilou")).toBe("BI");
    expect(initials("Achraf V. (fictif)")).toBe("AV");
    expect(initials("Hakimi")).toBe("H");
  });

  it("prints the surname on the shirt, in capitals", () => {
    expect(shirtName("Baba Bello Ilou")).toBe("BELLO ILOU");
    expect(shirtName("Achraf V. (fictif)")).toBe("V");
    expect(shirtName("Hakimi")).toBe("HAKIMI");
  });

  it("lights round(value / 10) of the ten segments", () => {
    expect([segments(86), segments(73), segments(4), segments(100), segments(null)]).toEqual([
      9, 7, 0, 10, 0,
    ]);
  });

  it("puts each rating on the chip's fixed scale, lower bounds included", () => {
    expect([5.9, 6, 6.49, 6.5, 7, 7.49, 7.5].map(ratingBand)).toEqual([1, 2, 2, 3, 4, 4, 5]);
  });

  it("dresses a club the kit table does not know in the default kit", () => {
    const unknown = { id: "x", name: { fr: "Club X", ar: "س" }, shortName: { fr: "CX", ar: "س" } };
    expect(teamKit(unknown).primary).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("groups thousands in French only, and names the next season", () => {
    expect(formatCount(1275, "fr")).toBe("1 275");
    expect(formatCount(1275, "ar")).toBe("1275");
    expect(nextSeasonLabel("2025-26")).toBe("2026-27");
    expect(nextSeasonLabel("2099-00")).toBe("2100-01");
    expect(nextSeasonLabel("saison")).toBe("saison");
  });

  it("builds the row's mono meta line with the figures isolated", () => {
    const t = (key: string) =>
      ({
        "pepites.position_short.fwd": "ATT",
        "pepites.meta.age_short": "{n}A",
        "pepites.meta.goals_assists": "{g}B {a}PD",
      })[key] ?? key;
    const line = playerMetaLine(
      {
        team: { id: "t", name: { fr: "Ittihad Tanger", ar: "" }, shortName: { fr: "IRT", ar: "" } },
        positionGroup: "FWD",
        age: 20,
      },
      { minutes: 1275, goals: 0, assists: 8 },
      { t: t as never, tr: (value) => value.fr, lang: "fr" },
    );
    expect(line.replace(/[⁨⁩]/g, "")).toBe("IRT · ATT · 20A · 1 275’ · 0B 8PD");
  });
});
