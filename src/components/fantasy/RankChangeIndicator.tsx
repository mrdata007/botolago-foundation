import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Rank movement with the numeric delta.
 *
 * `UiRankMovement` is the kit's glyph-only version and is what the standings
 * tables use; this one is kept for the two places that also show *how far* a
 * manager moved (the rankings list and the "my rank" card).
 *
 * Two things it no longer does: it no longer spells its own green as a raw
 * `oklch(...)` — gains and losses are `--ui-positive` / `--ui-negative`, which
 * are legible as text in both themes — and it no longer announces the English
 * `"change -3"`. Direction is a translated word, the magnitude is a localized
 * numeral, and the glyph carries the same information for a reader who cannot
 * resolve the colour.
 */
export function RankChangeIndicator({
  rank,
  previousRank,
  className,
}: {
  rank: number;
  previousRank: number;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const delta = previousRank - rank;
  const up = delta > 0;
  const down = delta < 0;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  // Three separate calls, each on a literal key. Selecting the key inside the
  // call instead would hide it from the i18n gate, which can only see a key it
  // can read as a literal at the call site.
  const direction = up
    ? t("fantasy.rank.up")
    : down
      ? t("fantasy.rank.down")
      : t("fantasy.rank.same");
  const magnitude = nf.format(Math.abs(delta));

  return (
    <span
      aria-label={up || down ? `${direction} ${magnitude}` : direction}
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5",
        ui.radius.full,
        ui.stat.sm,
        up && ui.tone.positive,
        down && ui.tone.negative,
        !up && !down && ui.tone.muted,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span aria-hidden>{magnitude}</span>
    </span>
  );
}
