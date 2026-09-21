import { UiDifficultyCell, type UiDifficulty } from "@/components/ui-kit";

/**
 * Fixture Difficulty Rating pill.
 *
 * The scale, the fill and — crucially — the foreground that clears AA on that
 * fill now come from the kit (`--ui-fdr-N` / `--ui-on-fdr-N`) via
 * `UiDifficultyCell`. The previous local table paired steps 4 and 5 with a
 * literal `text-white`, which is not a themed colour and left the label at the
 * wrong contrast once the alias layer started following the theme; the kit
 * never lets a screen pick an FDR foreground itself.
 *
 * The public props are unchanged, and the badge now clears the 44px tap floor
 * because `UiDifficultyCell` sizes from `--ui-tap-min` instead of `min-h-9`.
 */
export function DifficultyBadge({
  difficulty,
  label,
  title,
  className,
}: {
  difficulty: UiDifficulty;
  /** The compact token drawn in the square. */
  label: string;
  /**
   * The full, unabbreviated meaning of the square — the opponent's real name
   * and venue. A caller that renders an abbreviation must pass this: with
   * `code` null for most of the league, three letters cannot carry club
   * identity on their own.
   */
  title?: string;
  className?: string;
}) {
  return (
    <UiDifficultyCell difficulty={difficulty} title={title ?? label} className={className}>
      <span aria-hidden={title ? true : undefined}>{label}</span>
      {title ? <span className="sr-only">{title}</span> : null}
    </UiDifficultyCell>
  );
}
