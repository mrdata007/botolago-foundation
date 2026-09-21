import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { ui } from "@/components/ui-kit";

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  intensity?: "soft" | "regular" | "strong";
  as?: "div" | "section" | "article" | "aside";
}

/**
 * Formerly a glassmorphism surface; now the kit card.
 *
 * The product design language has no glass in it — surfaces are opaque, on
 * `--ui-surface`, with one small shadow and the 6px control radius. The
 * component is kept (with its props API untouched) so existing callers keep
 * working; `intensity` now selects elevation rather than blur:
 *
 *   - `soft`     flat, hairline-ruled — no shadow
 *   - `regular`  the standard card shadow (default)
 *   - `strong`   the raised shadow used for surfaces that float
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { className, intensity = "regular", as: _as = "div", ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        ui.surface.card,
        intensity === "soft" && cn(ui.rule.all, "shadow-none"),
        intensity === "strong" && "shadow-[var(--ui-shadow-raised)]",
        className,
      )}
      {...rest}
    />
  );
});
