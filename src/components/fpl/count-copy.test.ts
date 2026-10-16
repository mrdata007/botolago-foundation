import { describe, expect, test } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import type { TranslationKey } from "@/i18n/dictionaries";

import { countForm, pickerApplyLabel, playersShownLabel, transferCountLabel } from "./count-copy";

const fr = (key: TranslationKey) => dictionaries.fr[key];
const ar = (key: TranslationKey) => dictionaries.ar[key];
const n = (value: number) => String(value);

/** The isolation marks around a number in Arabic text, which are not part of the wording. */
const plain = (text: string) => text.replace(/[⁦-⁩]/g, "");

describe("countForm", () => {
  test("Arabic: none, one, two, 3 to 10, then the singular again", () => {
    const forms = [0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103].map((value) =>
      countForm(value, "ar"),
    );
    expect(forms).toEqual([
      "zero",
      "one",
      "two",
      "few",
      "few",
      "many",
      "many",
      "other",
      "other",
      "other",
      "few",
    ]);
  });

  test("the categories are the ones Intl.PluralRules gives Arabic", () => {
    const rules = new Intl.PluralRules("ar");
    for (const value of [0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103, 111, 200, 1000]) {
      expect(countForm(value, "ar")).toBe(rules.select(value));
    }
  });

  test("French: none, one, then the plural", () => {
    expect([0, 1, 2].map((value) => countForm(value, "fr"))).toEqual(["zero", "one", "many"]);
  });
});

describe("the picker's apply button", () => {
  test("Arabic follows the register's forms for 0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103", () => {
    const label = (value: number) => plain(pickerApplyLabel(value, "ar", ar, n));
    expect(label(0)).toBe("لا يوجد لاعب مطابق");
    expect(label(1)).toBe("عرض لاعب واحد");
    expect(label(2)).toBe("عرض اللاعبَيْن");
    expect(label(3)).toBe("عرض 3 لاعبين");
    expect(label(10)).toBe("عرض 10 لاعبين");
    // 11 to 99: the accusative singular; 100, 101, 102, 200: the genitive singular.
    expect(label(11)).toBe("عرض 11 لاعبًا");
    expect(label(99)).toBe("عرض 99 لاعبًا");
    expect(label(100)).toBe("عرض 100 لاعب");
    expect(label(101)).toBe("عرض 101 لاعب");
    expect(label(102)).toBe("عرض 102 لاعب");
    expect(label(103)).toBe("عرض 103 لاعبين");
    expect(label(111)).toBe("عرض 111 لاعبًا");
    expect(label(200)).toBe("عرض 200 لاعب");
  });

  test("French says one player for one", () => {
    expect(pickerApplyLabel(1, "fr", fr, n)).toBe("Voir 1 joueur");
    expect(pickerApplyLabel(2, "fr", fr, n)).toBe("Voir 2 joueurs");
    expect(pickerApplyLabel(12, "fr", fr, n)).toBe("Voir 12 joueurs");
    expect(pickerApplyLabel(100, "fr", fr, n)).toBe("Voir 100 joueurs");
    expect(pickerApplyLabel(0, "fr", fr, n)).toBe("Aucun joueur correspondant");
  });

  test("a number in Arabic text is isolated, in French it is not", () => {
    expect(pickerApplyLabel(12, "ar", ar, n)).toBe("عرض ⁨12⁩ لاعبًا");
    expect(pickerApplyLabel(12, "fr", fr, n)).toBe("Voir 12 joueurs");
  });
});

describe("the transfer review's headline", () => {
  test("Arabic: one, two, 3 to 10, 11 and more", () => {
    const label = (value: number) => plain(transferCountLabel(value, "ar", ar, n));
    expect(label(1)).toBe("ستُجري انتقالًا واحدًا.");
    expect(label(2)).toBe("ستُجري انتقالين.");
    expect(label(3)).toBe("ستُجري 3 انتقالات.");
    expect(label(10)).toBe("ستُجري 10 انتقالات.");
    expect(label(11)).toBe("ستُجري 11 انتقالًا.");
    expect(label(15)).toBe("ستُجري 15 انتقالًا.");
    expect(label(99)).toBe("ستُجري 99 انتقالًا.");
    expect(label(100)).toBe("ستُجري 100 انتقال.");
    expect(label(103)).toBe("ستُجري 103 انتقالات.");
  });

  test("Arabic never prints a bare count next to the wrong noun", () => {
    // The old template printed "2 انتقالات" and "11 انتقالات".
    for (const value of [2, 11]) {
      expect(plain(transferCountLabel(value, "ar", ar, n))).not.toContain(`${value} انتقالات`);
    }
  });

  test("French: singular for one, the count otherwise", () => {
    expect(transferCountLabel(1, "fr", fr, n)).toBe("Vous allez effectuer 1 transfert.");
    expect(transferCountLabel(2, "fr", fr, n)).toBe("Vous allez effectuer 2 transferts.");
    expect(transferCountLabel(3, "fr", fr, n)).toBe("Vous allez effectuer 3 transferts.");
  });
});

describe("a count with no action", () => {
  test("is a label and a figure, not a fragment of a sentence", () => {
    expect(playersShownLabel(1, 40, "fr", fr, n)).toBe("Joueurs affichés : 1 sur 40");
    expect(plain(playersShownLabel(1, 40, "ar", ar, n))).toBe("اللاعبون المعروضون: 1 من 40");
    expect(plain(playersShownLabel(12, 40, "ar", ar, n))).toBe("اللاعبون المعروضون: 12 من 40");
  });

  test("the Pépites ranking count", () => {
    expect(dictionaries.fr["pepites.ranking.count_short"]).toBe("Joueurs : {n}");
    expect(dictionaries.ar["pepites.ranking.count_short"]).toBe("عدد اللاعبين: {n}");
  });
});
