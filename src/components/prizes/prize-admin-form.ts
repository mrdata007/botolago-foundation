import type {
  AdminPrizeDraft,
  AdminPrizeDto,
  AdminPrizeWinnerDto,
  PrizeTier,
  PrizeWinnerStatus,
} from "@/backend/prizes/contracts";

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

/**
 * The catalog after one prize is saved. Only that row changes: a save never
 * touches another prize (a second active prize in a tier is refused, not
 * swapped), and reloading every row would throw away what the admin is still
 * typing in the others.
 */
export function withSavedPrize(prizes: readonly AdminPrizeDto[], saved: AdminPrizeDto) {
  return prizes.some((prize) => prize.id === saved.id)
    ? prizes.map((prize) => (prize.id === saved.id ? saved : prize))
    : [...prizes, saved];
}

/** The editor forms after `key` ("new" or a prize id) was saved as `saved`. */
export function formsAfterSave(
  forms: Readonly<Record<string, PrizeForm>>,
  key: string,
  saved: AdminPrizeDto,
): Record<string, PrizeForm> {
  return {
    ...forms,
    ...(key === "new" ? { new: EMPTY_PRIZE_FORM } : {}),
    [saved.id]: toPrizeForm(saved),
  };
}

/**
 * The winners list after one row changed. A row whose new status no longer
 * matches the filter leaves the list: a winner just verified under "pending"
 * must not stay there, offering the next step under the wrong heading.
 */
export function withUpdatedWinner(
  items: readonly AdminPrizeWinnerDto[],
  updated: AdminPrizeWinnerDto,
  filter: PrizeWinnerStatus | "all",
) {
  return items.flatMap((item) =>
    item.id !== updated.id
      ? [item]
      : filter === "all" || updated.status === filter
        ? [updated]
        : [],
  );
}
