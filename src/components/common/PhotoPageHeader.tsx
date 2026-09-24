import type { ReactNode } from "react";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * A section page's title on a night photograph (News).
 *
 * The same palette as Home's gameweek band — a navy ground, the photo, and a
 * navy scrim so the white title reads wherever the floodlights land. The
 * photo is mirrored in Arabic so its calm side stays under the title.
 * Decorative, so hidden from assistive tech; the `<h1>` carries the name.
 * `aside` is the end-side slot.
 *
 * Option A: the title is the display face (`ui.display.title`) and the band
 * is a feature surface (`ui.radius.sheet`). Matches no longer uses it — its
 * title is the white `UiPageTitle` band (A-Matches).
 */
export function PhotoPageHeader({
  photo,
  title,
  aside,
  objectPosition = "70% 40%",
}: {
  photo: string;
  title: ReactNode;
  aside?: ReactNode;
  /** CSS `object-position` for the photo, before the Arabic mirror. */
  objectPosition?: string;
}) {
  return (
    <header
      className={cn(
        "relative isolate mt-2 flex items-end gap-3 overflow-hidden px-4 pb-4 pt-8",
        ui.radius.sheet,
        ui.tone.onInkPlain,
        "bg-[color:var(--ui-ink-deep)]",
      )}
    >
      <img
        src={photo}
        alt=""
        aria-hidden
        decoding="async"
        className="absolute inset-0 -z-10 h-full w-full object-cover rtl:-scale-x-100"
        style={{ objectPosition }}
      />
      {/* `to bottom`: a degree angle would sit on the wrong edge in Arabic. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 55%, transparent) 0%, color-mix(in oklab, var(--ui-ink-deep) 75%, transparent) 100%)",
        }}
      />
      <h1 className={cn("min-w-0", ui.display.title)}>{title}</h1>
      {aside ? <div className="ms-auto shrink-0">{aside}</div> : null}
    </header>
  );
}
