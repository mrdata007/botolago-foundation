import { describe, expect, test } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import { scoringPolicyView } from "./fantasy-scoring-policy";

const adaptive = {
  fromGameweek: 1,
  selectionDelayHours: 12,
  scope: "fixture",
  lateModeUpgrade: false,
} as const;
const rating = (fromGameweek: number) => ({ fromGameweek, noRatingPoints: 5 });

describe("scoringPolicyView (audit LOC-01)", () => {
  test("rating off: the action-based paragraph stands alone, with no round named", () => {
    expect(scoringPolicyView({ adaptiveScoring: adaptive })).toEqual({
      ratingFromGameweek: null,
      showEventPolicy: true,
      eventPolicyUntilGameweek: null,
    });
  });

  test("neither policy object: nothing about either policy", () => {
    expect(scoringPolicyView({})).toEqual({
      ratingFromGameweek: null,
      showEventPolicy: false,
      eventPolicyUntilGameweek: null,
    });
    expect(scoringPolicyView(undefined).showEventPolicy).toBe(false);
  });

  test("rating from round 5 with the adaptive policy: the old paragraph is scoped to rounds 1 to 4", () => {
    expect(scoringPolicyView({ adaptiveScoring: adaptive, ratingScoring: rating(5) })).toEqual({
      ratingFromGameweek: 5,
      showEventPolicy: true,
      eventPolicyUntilGameweek: 4,
    });
  });

  test("rating from round 1: there are no earlier rounds, so the old paragraph is left out", () => {
    expect(scoringPolicyView({ adaptiveScoring: adaptive, ratingScoring: rating(1) })).toEqual({
      ratingFromGameweek: 1,
      showEventPolicy: false,
      eventPolicyUntilGameweek: null,
    });
  });

  test("adaptive and rating starting in the same round: no earlier round used the old paragraph", () => {
    // The server allows it (migration 20261014090000: adaptive from_gameweek <= rating's).
    expect(
      scoringPolicyView({
        adaptiveScoring: { ...adaptive, fromGameweek: 5 },
        ratingScoring: rating(5),
      }),
    ).toEqual({ ratingFromGameweek: 5, showEventPolicy: false, eventPolicyUntilGameweek: 4 });
  });

  test("adaptive starting before the rating: the old paragraph stays, scoped to the rounds before", () => {
    expect(
      scoringPolicyView({
        adaptiveScoring: { ...adaptive, fromGameweek: 3 },
        ratingScoring: rating(5),
      }),
    ).toEqual({ ratingFromGameweek: 5, showEventPolicy: true, eventPolicyUntilGameweek: 4 });
  });

  test("adaptive starting after the rating (the server refuses it): the old paragraph is not shown", () => {
    expect(
      scoringPolicyView({
        adaptiveScoring: { ...adaptive, fromGameweek: 7 },
        ratingScoring: rating(5),
      }).showEventPolicy,
    ).toBe(false);
  });

  test("rating without the adaptive object: no action-based paragraph is invented", () => {
    const view = scoringPolicyView({ ratingScoring: rating(5) });
    expect(view.showEventPolicy).toBe(false);
    expect(view.ratingFromGameweek).toBe(5);
  });
});

describe("the scoping lines in both languages", () => {
  test("French and Arabic carry the round slot and the rule they name", () => {
    const fr = dictionaries.fr;
    const ar = dictionaries.ar;
    expect(fr["fantasy.scoring.eventUntil"]).toBe("Jusqu’à la journée {n} : barème par actions.");
    expect(ar["fantasy.scoring.eventUntil"]).toBe(
      "حتى الجولة {n}: احتساب النقاط حسب أحداث المباراة.",
    );
    expect(fr["fantasy.scoring.ratingFrom"]).toBe(
      "À partir de la journée {n} : points selon la note SofaScore.",
    );
    expect(ar["fantasy.scoring.ratingFrom"]).toBe(
      "ابتداءً من الجولة {n}: النقاط حسب تقييم SofaScore.",
    );
  });
});
