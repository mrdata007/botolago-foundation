import { describe, expect, test } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  mayRiseToTwo,
  pendingCountLabel,
  pendingItemsOfFixture,
  pointsCell,
  resolvePlayerPoints,
  teamPendingItemCount,
} from "./points-pending";

const item = (category: string, reason: string | null = null, fixtureId = "f1") => ({
  fixtureId,
  category,
  reason,
});

describe("resolvePlayerPoints", () => {
  test("no row, gameweek open: null and pending", () => {
    expect(resolvePlayerPoints({ provisionalPoints: null, finalPoints: null }, false)).toEqual({
      points: null,
      status: "pending",
      pendingItems: [],
    });
  });

  test("no row, gameweek final, older response: a real 0", () => {
    const r = resolvePlayerPoints({ provisionalPoints: null, finalPoints: null }, true);
    expect(r.points).toBe(0);
    expect(r.status).toBe("final");
  });

  test("server pointsStatus pending is believed", () => {
    const r = resolvePlayerPoints(
      { provisionalPoints: null, finalPoints: null, pointsStatus: "pending" },
      true,
    );
    expect(r.points).toBeNull();
    expect(r.status).toBe("pending");
  });

  test("points with pending items are provisional even when the gameweek is final", () => {
    const r = resolvePlayerPoints(
      { provisionalPoints: 3, finalPoints: 3, pendingItems: [item("clean_sheet")] },
      true,
    );
    expect(r.status).toBe("provisional");
    expect(r.pendingItems).toEqual([item("clean_sheet")]);
  });

  test("points in a final gameweek with nothing waiting are final", () => {
    expect(resolvePlayerPoints({ provisionalPoints: 3, finalPoints: 3 }, true).status).toBe(
      "final",
    );
  });

  test("points in an open gameweek are provisional", () => {
    expect(resolvePlayerPoints({ provisionalPoints: 3, finalPoints: null }, false).status).toBe(
      "provisional",
    );
  });

  test("a server 'provisional' is not upgraded to final by the client", () => {
    const r = resolvePlayerPoints(
      { provisionalPoints: 3, finalPoints: 3, pointsStatus: "provisional" },
      true,
    );
    expect(r.status).toBe("provisional");
  });
});

describe("teamPendingItemCount", () => {
  test("uses the server's figure, even 0", () => {
    expect(teamPendingItemCount(0, [{ pendingItems: [1, 2] }])).toBe(0);
    expect(teamPendingItemCount(4, [])).toBe(4);
  });
  test("falls back to the sum over players, and to 0 for an old response", () => {
    expect(teamPendingItemCount(undefined, [{ pendingItems: [1, 2] }, { pendingItems: [1] }])).toBe(
      3,
    );
    expect(teamPendingItemCount(undefined, [{}])).toBe(0);
  });
});

describe("presentation helpers", () => {
  test("only an appearance with a minutes conflict may rise to 2 pts", () => {
    expect(mayRiseToTwo(item("appearance", "minutes_conflict"))).toBe(true);
    expect(mayRiseToTwo(item("appearance", null))).toBe(false);
    expect(mayRiseToTwo(item("clean_sheet", "minutes_conflict"))).toBe(false);
  });

  test("pointsCell: dash for null, figure otherwise, star when items wait", () => {
    expect(pointsCell(undefined, null)).toEqual({ kind: "none" });
    expect(pointsCell({ pendingItems: [] }, null)).toEqual({ kind: "pending" });
    expect(pointsCell({ pendingItems: [] }, 0)).toEqual({
      kind: "points",
      value: 0,
      waiting: false,
    });
    expect(pointsCell({ pendingItems: [item("clean_sheet")] }, 4)).toEqual({
      kind: "points",
      value: 4,
      waiting: true,
    });
  });

  test("pendingItemsOfFixture keeps one fixture's items", () => {
    const items = [item("a", null, "f1"), item("b", null, "f2")];
    expect(pendingItemsOfFixture(items, "f2").map((i) => i.category)).toEqual(["b"]);
    expect(pendingItemsOfFixture(undefined, "f2")).toEqual([]);
  });
});

describe("wording (fr and ar)", () => {
  const tOf = (lang: "fr" | "ar") => (key: TranslationKey) => dictionaries[lang][key];

  test("the count agrees with the number in French", () => {
    expect(pendingCountLabel(1, "fr", tOf("fr"))).toBe("1 élément en attente");
    expect(pendingCountLabel(3, "fr", tOf("fr"))).toBe("3 éléments en attente");
  });

  test("the count agrees with the number in Arabic", () => {
    expect(pendingCountLabel(1, "ar", tOf("ar"))).toBe("عنصر واحد قيد الانتظار");
    expect(pendingCountLabel(2, "ar", tOf("ar"))).toBe("عنصران قيد الانتظار");
    expect(pendingCountLabel(3, "ar", tOf("ar"))).toBe("3 عناصر قيد الانتظار");
    expect(pendingCountLabel(12, "ar", tOf("ar"))).toBe("12 عنصر قيد الانتظار");
  });

  test("the owner's labels", () => {
    expect(dictionaries.fr["fantasy.points.pending_label"]).toBe("En attente");
    expect(dictionaries.ar["fantasy.points.pending_label"]).toBe("قيد الانتظار");
    expect(dictionaries.fr["fantasy.points.item_pending"]).toBe("En attente de confirmation");
    expect(dictionaries.ar["fantasy.points.item_pending"]).toBe("بانتظار التأكيد");
    expect(dictionaries.fr["fantasy.points.appearance_may_rise"]).toBe("peut passer à 2 pts");
    expect(dictionaries.ar["fantasy.points.appearance_may_rise"]).toBe("قد ترتفع إلى نقطتين");
  });

  test("the categories a pending item names already have a name in both languages", () => {
    for (const category of ["appearance", "clean_sheet", "goals_conceded"]) {
      const key = `fantasy.points.event.${category}` as TranslationKey;
      expect(dictionaries.fr[key]).toBeTruthy();
      expect(dictionaries.ar[key]).toBeTruthy();
    }
  });
});
