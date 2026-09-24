import type { TranslationKey } from "@/i18n/dictionaries";
import type { ChipKey } from "@/lib/fantasy-engine";

/**
 * What a chip does, in one line, for a manager who has never played one. It
 * sits under the chip's name wherever the chips are listed: the row above the
 * Pick Team pitch, the transfer confirmation and the team profile.
 *
 * Literal branches, never `fantasy.chip.${chip}_desc`: a key assembled at
 * runtime is invisible to the i18n gate and to the TranslationKey type alike.
 */
export function chipDescription(chip: ChipKey, t: (key: TranslationKey) => string): string {
  return chip === "bench_boost"
    ? t("fantasy.chip.bench_boost_desc")
    : chip === "free_hit"
      ? t("fantasy.chip.free_hit_desc")
      : chip === "triple_captain"
        ? t("fantasy.chip.triple_captain_desc")
        : t("fantasy.chip.wildcard_desc");
}
