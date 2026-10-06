import { cn } from "@/lib/utils";

/**
 * STATUS BAR STRIP (BG-0151; shared since BG-0154).
 *
 * In the phone app the page is drawn under the status bar (`viewport-fit=cover`
 * with a transparent bar), so on a screen whose top does not stick, scrolled
 * content passes under the clock and its icons. This strip is exactly as tall
 * as the status bar and stays there, in the colour of the screen's own top, so
 * what scrolls passes under it instead. It is 0px tall wherever the top inset
 * is 0, which is every browser without a notch, so the website does not change.
 *
 * The host is a zero-height sticky box: it takes no room in the flow, and it
 * sticks for as long as its parent scrolls, so it belongs as a direct child of
 * the element that spans the whole page. The strip hangs from it, above the
 * page's own layers (`z-30`, under dialogs and sheets), and lets taps through.
 *
 * `surface` is the strip's fill, matching what sits under the clock when the
 * page is at rest: `ui.surface.bar` under a Fantasy inner screen's header, the
 * ink-deep of the dark band on the sign-in screens and the Landing page.
 * `className` goes on the host (`md:hidden` where a sticky top bar takes over;
 * `md:fixed md:inset-x-0` where no element spans the page to stick in, as on
 * the sign-in screens from `md`, whose column is a raised card).
 */
export function StatusBarStrip({ surface, className }: { surface: string; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none sticky top-0 z-30 h-0", className)}>
      <div className={cn("absolute inset-x-0 top-0 h-[env(safe-area-inset-top,0px)]", surface)} />
    </div>
  );
}

/**
 * The fill under the clock on the screens whose top is a dark band in both
 * themes (the sign-in screens' photo band, the Landing hero): the band's own
 * ink-deep, so the strip reads as the band's top edge at rest.
 */
export const STATUS_BAR_INK = "bg-[color:var(--ui-ink-deep)]";
