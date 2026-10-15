import { describe, expect, test } from "bun:test";

import { dictionaries } from "./dictionaries";

/**
 * One Arabic Fantasy glossary (audit 2026-10-14, LOC-04). The same concept had
 * several names between screens: transfers were التحويلات and الانتقالات, form
 * was الحالة, الفورمة and المستوى, a chip was رقاقة and جوكر. The register's
 * glossary:
 *
 *   transfers      الانتقالات        (FR Transferts, kept)
 *   recent form    المستوى الأخير    (FR Forme, kept)
 *   availability   الجاهزية          (FR Disponibilité, kept)
 *   chips          الجوكرات          (FR Jetons, kept)
 *   active chip    الجوكر المفعّل    (FR Jeton actif)
 *
 * The four chip names themselves (الورقة الحرة, الضربة الحرة, تعزيز الاحتياط,
 * القائد الثلاثي) are approved names and stay.
 *
 * These tests fail when a rejected variant comes back. The allow-lists are
 * short on purpose: an entry needs a reason that names where the register
 * keeps the word.
 */

const ar = dictionaries.ar as Record<string, string>;
const fr = dictionaries.fr as Record<string, string>;

/** Fantasy keys: the game itself, its picker and its transfer flow. */
const isFantasyKey = (key: string) => key.startsWith("fantasy.") || key.startsWith("fpl.");

/** Keys that hold text a player reads about the Fantasy game, wherever they live. */
const OTHER_FANTASY_KEYS = ["account_deletion.deleted_game"];

const fantasyEntries = Object.entries(ar).filter(
  ([key]) => isFantasyKey(key) || OTHER_FANTASY_KEYS.includes(key),
);

/** A rejected variant, why it is rejected, and where it may still appear. */
const REJECTED: ReadonlyArray<{
  pattern: RegExp;
  instead: string;
  allowed: Readonly<Record<string, string>>;
}> = [
  {
    // "conversion" is not a football move: a transfer is an انتقال.
    pattern: /تحويل/u,
    instead: "الانتقالات",
    allowed: {},
  },
  {
    // A chip is a "joker" (الجوكر), not an electronic chip.
    pattern: /رقاق|رقائق|رقيقة/u,
    instead: "الجوكر / الجوكرات",
    allowed: {},
  },
  {
    // Transliterated "forme": the register calls it المستوى الأخير.
    pattern: /فورم/u,
    instead: "المستوى الأخير",
    allowed: {},
  },
];

describe("Arabic Fantasy glossary", () => {
  for (const { pattern, instead, allowed } of REJECTED) {
    test(`no Fantasy text uses ${pattern} (use ${instead})`, () => {
      const offenders = fantasyEntries
        .filter(([key, value]) => pattern.test(value) && !(key in allowed))
        .map(([key, value]) => `${key}: ${value}`);
      expect(offenders).toEqual([]);
    });
  }

  test("no allow-list entry is stale", () => {
    for (const { pattern, allowed } of REJECTED) {
      for (const key of Object.keys(allowed)) {
        expect(pattern.test(ar[key] ?? "")).toBe(true);
      }
    }
  });

  test("a form label is the recent form everywhere in Fantasy, never the bare الحالة", () => {
    // Every Fantasy key whose French wording is "Forme" is the recent-form label.
    const formKeys = Object.keys(fr).filter((key) => isFantasyKey(key) && fr[key] === "Forme");
    expect(formKeys.length).toBeGreaterThanOrEqual(4);
    for (const key of formKeys) expect([key, ar[key]]).toEqual([key, "المستوى الأخير"]);
    // "الحالة" means status. It is not a Fantasy form label.
    for (const [key, value] of fantasyEntries) {
      if (/(^|[^ء-ي])الحالة([^ء-ي]|$)/u.test(value) && key.includes("form")) {
        throw new Error(`${key} calls form الحالة`);
      }
    }
  });

  test("the register's exact glossary", () => {
    expect(ar["fantasy.transfers"]).toBe("الانتقالات");
    expect(ar["fantasy.free_transfers"]).toBe("الانتقالات المجانية");
    expect(ar["fantasy.transfers.title"]).toBe("الانتقالات");
    expect(ar["fpl.transfers"]).toBe("الانتقالات");
    expect(ar["fantasy.form"]).toBe("المستوى الأخير");
    expect(ar["fpl.form"]).toBe("المستوى الأخير");
    expect(ar["fantasy.picker.sort.form"]).toBe("المستوى الأخير");
    expect(ar["fantasy.top.form"]).toBe("المستوى الأخير");
    expect(ar["fantasy.picker.filter_status"]).toBe("الجاهزية");
    expect(ar["fantasy.rules.chips"]).toBe("الجوكرات");
    expect(ar["fantasy.points.active_chip"]).toBe("الجوكر المفعّل");
    expect(ar["fantasy.transfers.chip_active"]).toBe("الجوكر المفعّل");
    expect(ar["fantasy.engine.chip_conflict"]).toBe("يوجد جوكر آخر مفعّل.");
    expect(ar["fantasy.engine.chip_used"]).toBe("سبق استخدام هذا الجوكر.");
    expect(ar["fantasy.error.transfer_failed"]).toBe("تعذّر تأكيد الانتقالات.");
  });

  test("the French side keeps its words", () => {
    expect(fr["fantasy.transfers"]).toBe("Transferts");
    expect(fr["fantasy.form"]).toBe("Forme");
    expect(fr["fantasy.picker.filter_status"]).toBe("Disponibilité");
    expect(fr["fantasy.rules.chips"]).toBe("Jetons");
    expect(fr["fantasy.points.active_chip"]).toBe("Jeton actif");
    expect(fr["fantasy.engine.chip_conflict"]).toBe("Un autre jeton est déjà actif.");
    expect(fr["fantasy.engine.chip_used"]).toBe("Ce jeton a déjà été utilisé.");
    expect(fr["fantasy.error.transfer_failed"]).toBe("Les transferts n'ont pas pu être confirmés.");
  });

  test("the approved chip names stay", () => {
    expect(ar["fantasy.chip.wildcard"]).toBe("الورقة الحرة");
    expect(ar["fantasy.chip.free_hit"]).toBe("الضربة الحرة");
    expect(ar["fantasy.chip.bench_boost"]).toBe("تعزيز الاحتياط");
    expect(ar["fantasy.chip.triple_captain"]).toBe("القائد الثلاثي");
  });

  test("the captain's armband is a different thing and keeps شارة القيادة", () => {
    expect(ar["landing.demo_caption"]).toContain("شارة القيادة");
  });
});
