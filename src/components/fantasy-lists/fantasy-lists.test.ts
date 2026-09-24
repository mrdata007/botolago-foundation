import { describe, expect, test } from "bun:test";

import type { FantasyPlayerGameweekHistoryEntryDto } from "@/backend/fantasy/contracts";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { splitPlayerName, surnameStep } from "./player-name";
import { MIN_BAR_PCT, recentPointsBars } from "./points-chart";
import { rankOrdinal, splitAroundFigure } from "./rank-ordinal";
import { compactMoveFormat, formatMove, rankFigure } from "./standings";
import { ui } from "@/components/ui-kit";

const tFr = (key: TranslationKey) => dictionaries.fr[key];
const tAr = (key: TranslationKey) => dictionaries.ar[key];
const frNumber = (value: number) => new Intl.NumberFormat("fr-FR").format(value);
const arNumber = (value: number) => new Intl.NumberFormat("ar-MA").format(value);

describe("rankOrdinal — the figure and its affix are separate parts", () => {
  test("French: 1er, then e for every other rank, after the figure", () => {
    expect(rankOrdinal(1, "fr", tFr, frNumber)).toEqual({ before: "", figure: "1", after: "er" });
    expect(rankOrdinal(2, "fr", tFr, frNumber)).toEqual({ before: "", figure: "2", after: "e" });
    expect(rankOrdinal(21, "fr", tFr, frNumber).after).toBe("e");
    expect(rankOrdinal(12483, "fr", tFr, frNumber)).toEqual({
      before: "",
      figure: frNumber(12483),
      after: "e",
    });
  });

  test("Arabic: a word before the figure and nothing after it", () => {
    for (const rank of [1, 2, 12483]) {
      const parts = rankOrdinal(rank, "ar", tAr, arNumber);
      expect(parts.before).toBe("المركز");
      expect(parts.figure).toBe(arNumber(rank));
      expect(parts.after).toBe("");
    }
  });

  test("the figure part never carries a letter, so it can sit in the digits-only score ramp", () => {
    for (const [lang, t, format] of [
      ["fr", tFr, frNumber],
      ["ar", tAr, arNumber],
    ] as const) {
      for (const rank of [1, 3, 11, 101, 12483]) {
        expect(rankOrdinal(rank, lang, t, format).figure).toMatch(/^[\d\s.,\u202f]+$/);
      }
    }
  });

  test("a template without the placeholder shows the bare figure", () => {
    expect(splitAroundFigure("rang", "3")).toEqual({ before: "", figure: "3", after: "" });
  });
});

describe("splitPlayerName / surnameStep", () => {
  test("first word light, the rest heavy", () => {
    expect(splitPlayerName("Ayoub El Kaabi")).toEqual({ first: "Ayoub", last: "El Kaabi" });
    expect(splitPlayerName("  Bouly   Sambou ")).toEqual({ first: "Bouly", last: "Sambou" });
    expect(splitPlayerName("أيوب الكعبي")).toEqual({ first: "أيوب", last: "الكعبي" });
  });

  test("a one-word name is all family name", () => {
    expect(splitPlayerName("Hakimi")).toEqual({ first: null, last: "Hakimi" });
    expect(splitPlayerName("")).toEqual({ first: null, last: "" });
  });

  test("a long family name steps down a size", () => {
    expect(surnameStep("El Kaabi")).toBe("hero");
    expect(surnameStep("Attiat-Allah")).toBe("hero");
    expect(surnameStep("Ali Bemammer Jr")).toBe("title");
  });
});

const entry = (
  sequence: number,
  points: number,
  over: Partial<FantasyPlayerGameweekHistoryEntryDto> = {},
): FantasyPlayerGameweekHistoryEntryDto => ({
  gameweekId: `00000000-0000-4000-8000-0000000000${String(sequence).padStart(2, "0")}`,
  gameweekSequence: sequence,
  gameweekName: `Journée ${sequence}`,
  points,
  minutesPlayed: 90,
  didPlay: true,
  state: "final",
  opponents: [],
  ...over,
});

describe("recentPointsBars", () => {
  test("keeps the last six gameweeks, oldest first, whatever order they arrive in", () => {
    const history = [9, 3, 1, 8, 2, 7, 4, 6, 5].map((seq) => entry(seq, seq));
    expect(recentPointsBars(history).map((bar) => bar.sequence)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(recentPointsBars(history, 3).map((bar) => bar.sequence)).toEqual([7, 8, 9]);
  });

  test("scales to the best week of the window", () => {
    const bars = recentPointsBars([entry(1, 17), entry(2, 9), entry(3, 1)]);
    expect(bars[0].heightPct).toBe(100);
    expect(bars[1].heightPct).toBe(53);
    expect(bars[2].heightPct).toBe(MIN_BAR_PCT);
  });

  test("a blank or negative week is the baseline, never a bar", () => {
    const bars = recentPointsBars([entry(1, 6), entry(2, 0), entry(3, -1)]);
    expect(bars.map((bar) => bar.heightPct)).toEqual([100, 0, 0]);
    expect(recentPointsBars([entry(1, 0), entry(2, -2)]).every((bar) => bar.heightPct === 0)).toBe(
      true,
    );
  });

  test("carries the provisional state and the detail a reader needs", () => {
    const [bar] = recentPointsBars([
      entry(14, 9, {
        state: "provisional",
        minutesPlayed: 63,
        opponents: [
          {
            teamId: "00000000-0000-4000-8000-0000000000aa",
            shortName: "RCA",
            name: "Raja CA",
            home: false,
          },
        ],
      }),
    ]);
    expect(bar.provisional).toBe(true);
    expect(bar.minutesPlayed).toBe(63);
    expect(bar.opponents[0].shortName).toBe("RCA");
  });

  test("no history is no bars", () => {
    expect(recentPointsBars([])).toEqual([]);
  });
});

describe("standings columns", () => {
  test("a rank of four digits or more steps down to the small stat size", () => {
    expect(rankFigure(9)).toBe(ui.stat.md);
    expect(rankFigure(336)).toBe(ui.stat.md);
    expect(rankFigure(999)).toBe(ui.stat.md);
    expect(rankFigure(1000)).toBe(ui.stat.sm);
    expect(rankFigure(12483)).toBe(ui.stat.sm);
  });

  test("a move is exact below a thousand places and compact from there", () => {
    const exact = new Intl.NumberFormat("fr-FR");
    const compact = compactMoveFormat("fr-FR");
    expect(formatMove(4, exact, compact)).toBe("4");
    expect(formatMove(999, exact, compact)).toBe("999");
    expect(formatMove(1210, exact, compact)).toBe(compact.format(1210));
    // Two significant digits: "12 k", never "12,2 k".
    expect(formatMove(12153, exact, compact).replace(/\s/g, " ")).toBe("12 k");
  });
});
