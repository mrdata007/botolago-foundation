import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui } from "@/components/ui-kit";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { KitPattern } from "@/types/fantasy";

/**
 * The club shirt in a round soft disc, as the A-Players rows draw it. The
 * shirt colours come from the kit table (`getKitForClub`), the same source
 * the pitch uses. Decorative: the player's name and club are printed beside
 * it, so the whole disc is hidden from assistive tech.
 */
export function PlayerKitDisc({
  club,
  kitPattern,
  imageUrl,
  size = "md",
  className,
}: {
  club?: Club;
  kitPattern?: KitPattern;
  imageUrl?: string;
  /** `md` 44px (list rows), `lg` 56px (a hero card). */
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        ui.radius.full,
        ui.surface.sunken,
        size === "md" ? "h-11 w-11" : "h-14 w-14",
        className,
      )}
    >
      <JerseyVisual
        kit={getKitForClub(club, kitPattern)}
        size={size === "md" ? 28 : 36}
        imageUrl={imageUrl}
      />
    </span>
  );
}
