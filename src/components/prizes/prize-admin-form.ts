import type { AdminPrizeDraft, AdminPrizeDto, PrizeTier } from "@/backend/prizes/contracts";

/** The prize editor's own shape: every field is the string its input holds. */
export interface PrizeForm {
  id: string | null;
  tier: PrizeTier;
  nameFr: string;
  nameAr: string;
  descriptionFr: string;
  descriptionAr: string;
  value: string;
  sponsorName: string;
  sponsorLogoUrl: string;
  imageUrl: string;
  active: boolean;
}

export const EMPTY_PRIZE_FORM: PrizeForm = {
  id: null,
  tier: "gameweek",
  nameFr: "",
  nameAr: "",
  descriptionFr: "",
  descriptionAr: "",
  value: "",
  sponsorName: "",
  sponsorLogoUrl: "",
  imageUrl: "",
  active: false,
};

export function toPrizeForm(prize: AdminPrizeDto): PrizeForm {
  return {
    id: prize.id,
    tier: prize.tier,
    nameFr: prize.nameFr,
    nameAr: prize.nameAr ?? "",
    descriptionFr: prize.descriptionFr,
    descriptionAr: prize.descriptionAr ?? "",
    value: prize.estimatedValueMad === null ? "" : String(prize.estimatedValueMad),
    sponsorName: prize.sponsorName ?? "",
    sponsorLogoUrl: prize.sponsorLogoUrl ?? "",
    imageUrl: prize.imageUrl ?? "",
    active: prize.active,
  };
}

/**
 * What the editor submits. Surrounding whitespace is trimmed (the database
 * refuses untrimmed text), a blank optional field is null, and a mini-league
 * prize never carries a value. A value that is not a whole number is sent as
 * null so the database refuses it by name (`prize_value_invalid`) instead of
 * the page guessing.
 */
export function toPrizeDraft(form: PrizeForm): AdminPrizeDraft {
  const optional = (value: string) => (value.trim() === "" ? null : value.trim());
  const value = form.value.trim();
  return {
    id: form.id,
    tier: form.tier,
    nameFr: form.nameFr.trim(),
    nameAr: optional(form.nameAr),
    descriptionFr: form.descriptionFr.trim(),
    descriptionAr: optional(form.descriptionAr),
    estimatedValueMad: form.tier === "mini_league" || !/^\d+$/.test(value) ? null : Number(value),
    sponsorName: optional(form.sponsorName),
    sponsorLogoUrl: optional(form.sponsorLogoUrl),
    imageUrl: optional(form.imageUrl),
    active: form.active,
  };
}
