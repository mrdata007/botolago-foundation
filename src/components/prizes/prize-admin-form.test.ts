import { describe, expect, it } from "bun:test";

import type { AdminPrizeDto, AdminPrizeWinnerDto } from "@/backend/prizes/contracts";
import {
  EMPTY_PRIZE_FORM,
  formsAfterSave,
  toPrizeDraft,
  toPrizeForm,
  withSavedPrize,
  withUpdatedWinner,
} from "./prize-admin-form";

describe("the prize editor form", () => {
  it("trims text, turns blank optional fields into null and parses a whole value", () => {
    expect(
      toPrizeDraft({
        ...EMPTY_PRIZE_FORM,
        nameFr: "  Smartphone ",
        nameAr: "   ",
        descriptionFr: " Un smartphone. ",
        value: " 2500 ",
        sponsorName: " Sponsor Test ",
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
      sponsorName: "Sponsor Test",
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

const prize = (n: number, nameFr: string): AdminPrizeDto => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  tier: "gameweek",
  nameFr,
  nameAr: null,
  descriptionFr: "",
  descriptionAr: null,
  estimatedValueMad: 500,
  sponsorName: null,
  sponsorLogoUrl: null,
  imageUrl: null,
  active: false,
  updatedAt: "2026-09-24T12:00:00Z",
});

describe("saving one prize in the catalog", () => {
  it("changes only the saved row and keeps what is still being typed in the others", () => {
    const first = prize(1, "Recharge");
    const second = prize(2, "Maillot");
    const forms = {
      [first.id]: toPrizeForm(first),
      [second.id]: { ...toPrizeForm(second), nameFr: "Maillot officiel (en cours)" },
      new: { ...EMPTY_PRIZE_FORM, nameFr: "Brouillon" },
    };
    const saved = { ...first, nameFr: "Recharge mobile" };
    expect(withSavedPrize([first, second], saved)).toEqual([saved, second]);
    const after = formsAfterSave(forms, first.id, saved);
    expect(after[first.id]?.nameFr).toBe("Recharge mobile");
    expect(after[second.id]?.nameFr).toBe("Maillot officiel (en cours)");
    expect(after.new?.nameFr).toBe("Brouillon");
  });

  it("adds a created prize and empties only the new-prize form", () => {
    const first = prize(1, "Recharge");
    const created = prize(3, "Écharpe");
    const forms = {
      [first.id]: { ...toPrizeForm(first), nameFr: "Recharge (en cours)" },
      new: { ...EMPTY_PRIZE_FORM, nameFr: "Écharpe" },
    };
    expect(withSavedPrize([first], created)).toEqual([first, created]);
    const after = formsAfterSave(forms, "new", created);
    expect(after.new).toEqual(EMPTY_PRIZE_FORM);
    expect(after[created.id]).toEqual(toPrizeForm(created));
    expect(after[first.id]?.nameFr).toBe("Recharge (en cours)");
  });
});

describe("updating one winner in a filtered list", () => {
  const winner = (n: number, status: AdminPrizeWinnerDto["status"]) =>
    ({ id: `w${n}`, status }) as unknown as AdminPrizeWinnerDto;

  it("drops a row whose new status leaves the filter", () => {
    const items = [winner(1, "pending"), winner(2, "pending")];
    expect(withUpdatedWinner(items, winner(1, "verified"), "pending")).toEqual([
      winner(2, "pending"),
    ]);
  });

  it("keeps it when the status still matches, or when every status is shown", () => {
    const items = [winner(1, "pending"), winner(2, "pending")];
    expect(withUpdatedWinner(items, winner(1, "pending"), "pending")).toEqual(items);
    expect(withUpdatedWinner(items, winner(1, "verified"), "all")).toEqual([
      winner(1, "verified"),
      winner(2, "pending"),
    ]);
  });
});
