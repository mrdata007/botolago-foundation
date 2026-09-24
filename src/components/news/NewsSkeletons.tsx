import { ui, UiSkeleton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * Placeholders in the shape of the Option A News cards, so what loads in
 * lands where the skeleton stood. The shared `ArticleCardSkeleton`
 * (`common/Skeletons.tsx`) still draws the retired image-on-top card, and
 * Home keeps using it.
 */

/** The lead photo card: its minimum height, the sheet radius. */
export function NewsLeadSkeleton() {
  return <UiSkeleton className={cn("min-h-[14.5rem] w-full sm:min-h-[20rem]", ui.radius.sheet)} />;
}

/** An Option A row: the edge, two title lines and the meta, the 88×68 thumbnail at the inline end. */
export function NewsRowSkeleton() {
  return (
    <div
      aria-hidden
      className={cn(
        ui.surface.card,
        "grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-3.5 py-3 pe-3 ps-3.5",
        "border-s-4 border-s-[color:var(--ui-surface-sunken)]",
      )}
    >
      <div className="grid gap-2 pt-1">
        <UiSkeleton className="h-3.5 w-11/12" />
        <UiSkeleton className="h-3.5 w-3/5" />
        <UiSkeleton className="mt-1 h-3 w-2/5" />
      </div>
      <UiSkeleton className={cn("h-17 w-22", ui.radius.track)} />
    </div>
  );
}
