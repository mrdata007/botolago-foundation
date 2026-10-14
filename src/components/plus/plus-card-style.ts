import type { CardProfile } from "@/components/manager-card/types";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { CardEditionCode } from "@/services/use-card-design";

import { PLUS_STYLES, styleLabel } from "./plus-copy";

/** The standard card first (always free, the way back), then the four paid editions. */
export const CARD_STYLES: readonly CardEditionCode[] = ["standard", ...PLUS_STYLES];

/** An edition's name in the reader's language (literal keys, so the i18n gate can see them). */
export function editionLabel(t: (key: TranslationKey) => string, edition: CardEditionCode): string {
  return edition === "standard" ? t("plus.pick.standard") : styleLabel(t, edition);
}

/** The edition a profile is drawn in. */
export function editionOf(profile: CardProfile): CardEditionCode {
  return profile.edition ?? "standard";
}
