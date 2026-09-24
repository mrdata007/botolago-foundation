import { describe, expect, it } from "bun:test";

import { EMPTY_PRIZE_FORM, toPrizeDraft, toPrizeForm } from "./prize-admin-form";

describe("the prize editor form", () => {
  it("trims text, turns blank optional fields into null and parses a whole value", () => {
    expect(
      toPrizeDraft({
        ...EMPTY_PRIZE_FORM,
        nameFr: "  Smartphone ",
        nameAr: "   ",
        descriptionFr: " Un smartphone. ",
        value: " 2500 ",
        sponsorName: " inwi ",
        imageUrl: "",
      }),
    ).toEqual({
      id: null,
      tier: "gameweek",
      nameFr: "Smartphone",
      nameAr: null,
      descriptionFr: "Un smartphone.",
      descriptionAr: null,
      estimatedValueMad: 2500,
      sponsorName: "inwi",
      sponsorLogoUrl: null,
      imageUrl: null,
      active: false,
    });
  });

  it("never sends a value for a mini-league prize", () => {
    expect(
      toPrizeDraft({ ...EMPTY_PRIZE_FORM, tier: "mini_league", value: "300" }).estimatedValueMad,
    ).toBeNull();
  });

  it("sends a value that is not a whole number as null, for the database to refuse by name", () => {
    for (const value of ["", "12.5", "-3", "abc"])
      expect(toPrizeDraft({ ...EMPTY_PRIZE_FORM, value }).estimatedValueMad).toBeNull();
  });

  it("round-trips a saved prize", () => {
    const saved = {
      id: "00000000-0000-4000-8000-000000000001",
      tier: "season" as const,
      nameFr: "Voyage",
      nameAr: "رحلة",
      descriptionFr: "",
      descriptionAr: null,
      estimatedValueMad: 25000,
      sponsorName: null,
      sponsorLogoUrl: null,
      imageUrl: "https://cdn.example.test/trip.webp",
      active: true,
      updatedAt: "2026-09-24T12:00:00Z",
    };
    const { updatedAt: _updatedAt, ...expected } = saved;
    expect(toPrizeDraft(toPrizeForm(saved))).toEqual(expected);
  });
});
