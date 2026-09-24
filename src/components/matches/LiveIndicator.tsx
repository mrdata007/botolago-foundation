import { UiLivePill } from "@/components/ui-kit";

/**
 * The live badge — Option A's navy live pill.
 *
 * A thin, prop-compatible wrapper over the kit's `UiLivePill` so every
 * existing caller (match cards, the score header) moves to the one pill the
 * product now draws: white on navy (`ui.surface.inkPlain`, 12.8:1 light,
 * 12.6:1 dark), rounded, with the breathing `--ui-live` dot (CSS-only, still
 * under reduced motion) and the minute in `<bdi>` so "45+2′" keeps its order
 * in Arabic.
 *
 * The word is `t("matches.status.live")` — "EN DIRECT" / its Arabic — never
 * the boards' English "LIVE". What went: the 14% red tint, the literal
 * 10/11px sizes, the 900 weight and the `--color-live*` V1 aliases.
 *
 * `minute` also takes a string now ("45+2"); the prime is added by the pill.
 */
export function LiveIndicator({
  minute,
  size = "sm",
  className,
}: {
  minute?: number | string;
  size?: "sm" | "md";
  className?: string;
}) {
  return <UiLivePill minute={minute} size={size} className={className} />;
}
