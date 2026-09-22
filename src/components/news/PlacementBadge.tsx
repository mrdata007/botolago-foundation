import { Zap } from "lucide-react";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Corner ribbon for "breaking" placements returned by `api.news_home_modules`.
 * Positioned opposite the card's own category tag so it never overlaps it:
 * `imageLed` cards show their tag at `start-3 top-3`, so this sits at
 * `end-3 top-3`; every other card variant keeps its tag inline in the body,
 * so this sits at `start-3 top-3` there instead.
 */
export function PlacementBadge({
  corner = "start",
  className,
}: {
  corner?: "start" | "end";
  className?: string;
}) {
  const { lang } = useI18n();
  return (
    <span
      className={cn(
        "absolute top-3 z-20 inline-flex items-center gap-1 px-2.5 py-1",
        ui.radius.full,
        // The kit's label token already carries the size, weight, casing and
        // an `ltr:`-only tracking; the colour is the kit's negative status.
        ui.text.label,
        "bg-[color:var(--ui-negative)] text-[color:var(--ui-on-ink-plain)] shadow-[var(--ui-shadow-card)]",
        corner === "start" ? "start-3" : "end-3",
        className,
      )}
    >
      <Zap className="h-3 w-3" aria-hidden />
      {lang === "ar" ? "عاجل" : "Dernière minute"}
    </span>
  );
}
