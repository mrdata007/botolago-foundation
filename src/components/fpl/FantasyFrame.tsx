import type { ReactNode } from "react";

import { BottomNav } from "@/components/shell/BottomNav";
import { TopBar } from "@/components/shell/TopBar";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * Fantasy screen frame.
 *
 * Every Fantasy screen is a single column carrying its own header (gradient
 * hero on the hub, "Back / Title" bar on inner screens). On wider viewports
 * that column is centred under the BotolaGO top bar so global navigation
 * stays reachable without changing the screen composition.
 *
 * WIDTH — the column is the same one the rest of the product uses.
 * `AppShell` renders `UiScreen width="content"`, whose rule is `max-w-2xl`
 * (672px), and Home, Matches, Standings and Profile have all been on it
 * since the shell migration. Fantasy was the one section left on the 480px
 * `--ui-column-max` phone canvas, which at 1440px left two thirds of the
 * viewport as empty gutter and made Fantasy read as a different application.
 * This deliberately reuses `max-w-2xl` — the kit's own rule for a content
 * column — rather than inventing a third width.
 *
 * (`--ui-column-max` is not wrong; it is the phone-canvas token, still
 * offered as `UiScreen width="column"`. It is just not what a page column in
 * this product is. `UiSheet` was pinned to it too, and no longer is: a 480px
 * sheet under a 672px screen only ever showed on desktop, where the
 * "thumb-width" that justified it is not a constraint.)
 *
 * The gutter is NOT applied here, unlike `UiScreen`: Fantasy screens render
 * full-bleed bands of their own — the hero gradient, `FplHeader`, `FplBanner`
 * — and each inner block brings `ui.space.gutter` itself.
 *
 * SURFACE — the two backgrounds used to be `--fpl-bg` and a literal
 * `bg-white`. The literal was the reason a dark-theme Fantasy screen
 * rendered its themed foreground on a permanently white column at 1.09:1;
 * `background="white"` now means the themed surface.
 */
export function FantasyFrame({
  children,
  bottomNav = false,
  className,
  background = "light",
}: {
  children: ReactNode;
  /** The hub keeps the application bottom navigation exactly like the reference. */
  bottomNav?: boolean;
  className?: string;
  background?: "light" | "white";
}) {
  // `ui.surface.bar` is the kit's flat opaque-surface pair (fill + matching
  // foreground) with no radius or shadow of its own — what a full-bleed
  // column needs. `ui.surface.card` would bring the card radius and shadow.
  const surface = background === "white" ? ui.surface.bar : ui.surface.page;
  return (
    <div className={cn("fpl-root relative min-h-dvh", surface)}>
      <div className="hidden md:block">
        <TopBar />
      </div>
      <main
        className={cn(
          // Same column rule as `UiScreen width="content"`, which is what
          // every migrated public route renders through `AppShell`.
          "fpl-column relative mx-auto w-full max-w-2xl",
          "md:my-4 md:min-h-[calc(100dvh-7rem)] md:overflow-hidden",
          "md:rounded-[var(--ui-radius-column)] md:shadow-[var(--ui-shadow-column)]",
          bottomNav ? "pb-28 md:pb-12" : "pb-8",
          surface,
          className,
        )}
      >
        {children}
      </main>
      {bottomNav ? <BottomNav /> : null}
    </div>
  );
}
