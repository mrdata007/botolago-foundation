import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { getBulkCopy } from "@/components/admin/player-mappings/bulk-copy";

import { dictionaries } from "./dictionaries";

/**
 * Arabic glossary consistency decisions, owner delegated 2026-10-17
 * (docs/review/2026-10-16-arabic-wording-review.md, Part 6). Each block fails on
 * the old wording.
 */

const ar = dictionaries.ar as Record<string, string>;

describe("manager is مدرب, never مدير", () => {
  test("league table strings", () => {
    expect(ar["fantasy.leagues.manager"]).toBe("المدرب");
    expect(ar["fantasy.leagues.search_manager"]).toBe("ابحث عن مدرب");
    expect(ar["fantasy.leagues.manager"]).not.toContain("مدير");
    expect(ar["fantasy.leagues.search_manager"]).not.toContain("مدير");
  });
});

describe("the Free Hit chip is الضربة الحرة", () => {
  test("restored messages", () => {
    expect(ar["fantasy.points.free_hit_restored"]).toBe("تمت استعادة تشكيلة الضربة الحرة.");
    expect(ar["fantasy.freehit.restored"]).toBe("تمت استعادة الفريق الأصلي بعد الضربة الحرة.");
  });
  test("no Latin chip name left in the dictionary", () => {
    for (const [key, value] of Object.entries(ar)) {
      expect(value.includes("Free Hit") ? key : "").toBe("");
    }
  });
});

describe("replace and automatic substitutions use the استبدال family", () => {
  test("substitute buttons", () => {
    expect(ar["fantasy.substitute"]).toBe("استبدال");
    expect(ar["fpl.substitute"]).toBe("استبدال");
  });
  test("incremental policy matches fantasy.points.autosubs", () => {
    expect(ar["fantasy.points.autosubs"]).toBe("الاستبدالات التلقائية");
    expect(ar["fantasy.scoring.incrementalPolicy"]).toContain("الاستبدالات التلقائية");
    expect(ar["fantasy.scoring.incrementalPolicy"]).not.toContain("التبديلات التلقائية");
  });
  test("transfers stay انتقال", () => {
    expect(ar["fantasy.transfers.gw_closed"]).toContain("الانتقالات");
  });
});

describe("the brand stays Latin", () => {
  test("home.explore", () => {
    expect(ar["home.explore"]).toBe("استكشف {accent}BotolaGO{/accent}");
  });
  test("no dictionary string spells the brand in Arabic letters", () => {
    for (const [key, value] of Object.entries(ar)) {
      expect(value.includes("بوتولاجو") ? key : "").toBe("");
    }
  });
});

describe("guillemets carry no inner spaces", () => {
  test("every «» pair hugs its content", () => {
    for (const [key, value] of Object.entries(ar)) {
      expect(/«\s|\s»/.test(value) ? key : "").toBe("");
    }
  });
  test("the four keys that had them", () => {
    expect(ar["fantasy.hub.invite_message"]).toContain("«{name}»");
    expect(ar["fantasy.hub.invite_ready"]).toContain("«{name}»");
    expect(ar["card.onboarding.m6.msg.league"]).toContain("«{league}»");
    expect(ar["card.onboarding.m6.msg.league_provisional"]).toContain("«{league}»");
  });
});

describe("bulk mapping steps use Western digits", () => {
  test("headings read 1. 2. 3.", () => {
    const copy = getBulkCopy("ar");
    expect(copy.phases.propose.heading.startsWith("1. ")).toBe(true);
    expect(copy.phases.approve.heading.startsWith("2. ")).toBe(true);
    expect(copy.phases.execute.heading.startsWith("3. ")).toBe(true);
  });
  test("no Eastern-Arabic digit in the file", () => {
    const source = readFileSync("src/components/admin/player-mappings/bulk-copy.ts", "utf8");
    expect(/[٠-٩۰-۹]/.test(source)).toBe(false);
  });
});
