import type { ReactNode } from "react";

import { BottomNav } from "@/components/shell/BottomNav";
import { StatusBarStrip } from "@/components/shell/StatusBarStrip";
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
 * `AppShell` renders `UiScreen width="content"`, the 672px reading column,
 * and Home, Matches, Standings and Profile have all been on it since the
 * shell migration. Fantasy was the one section left on the 480px
 * `--ui-column-max` phone canvas, which at 1440px left two thirds of the
 * viewport as empty gutter and made Fantasy read as a different application.
 *
 * That width is a token now, so this is `ui.space.content` rather than the
 * literal `max-w-2xl` it used to be. The note here used to argue that
 * `max-w-2xl` was "the kit's own rule for a content column" — it was the
 * nearest thing available, but a Tailwind step is not a rule: it said 672px
 * without saying WHICH 672px, so a reader could not tell the reading column
 * from any other box that happens to be that wide, and nothing tied the two
 * to each other. `--ui-content-max` is that statement, and `ui.space.content`
 * carries the same `mx-auto w-full` this line already spelled out.
 *
 * (`--ui-column-max` is not wrong; it is the phone-canvas token, still
 * offered as `UiScreen width="column"` and as `ui.space.column`. It is just
 * not what a page column in this product is. `UiSheet` was pinned to it too,
 * and no longer is: a 480px sheet under a 672px screen only ever showed on
 * desktop, where the "thumb-width" that justified it is not a constraint.)
 *
 * The gutter is NOT applied here, unlike `UiScreen`: Fantasy screens render
 * full-bleed bands of their own — the hero gradient, `UiHeader`, `UiBanner`
 * — and each inner block brings `ui.space.gutter` itself.
 *
 * SURFACE — the two backgrounds used to be `--fpl-bg` and a literal
 * `bg-white`. The literal was the reason a dark-theme Fantasy screen
 * rendered its themed foreground on a permanently white column at 1.09:1;
 * `background="white"` now means the themed surface.
 *
 * TOP BAR (Option A) — `topBar="always"` is the hub (A-Fantasy): the global
 * white bar with the wordmark and the language disc on every width, then the
 * page's own title band. The default, `"desktop"`, is every inner screen
 * (A-Team, A-Players): on a phone the screen's `UiHeader` — back, kicker,
 * title — IS the top row, and the global bar only returns from `md` up, where
 * there is room for both. Its wrapper is `display: contents` rather than a
 * block: a sticky bar inside a box exactly its own height has nowhere to
 * stick, so the desktop bar used to scroll away with the page.
 *
 * BOTTOM NAV — opt-in per route, unchanged: the Option A screens pass it
 * (every A board shows the nav), and a screen whose own bottom bar is not yet
 * lifted above the nav leaves it off. A bar that sticks to the bottom of a
 * screen that has the nav sits at `bottom-[var(--bottomnav-h)]` (0 from `md`,
 * where the nav is hidden).
 *
 * STICKY BOTTOM BAR (BG-0154) — from `md` the column rounds its corners and
 * clips what overflows them. It used to clip with `overflow: hidden`, and
 * `hidden` makes the column a scroll container, so a `sticky bottom-0` bar
 * inside it stuck to the column, which never scrolls, instead of the window:
 * it did not stick at all. On a notched iPhone turned sideways (844x390, an
 * `md` width) the player page's actions sat below the window and ran into the
 * home indicator as the page scrolled. `stickyBottomBar` clips with
 * `overflow: clip` instead, which clips the same corners without making a
 * scroll container, and `flow-root` keeps the block formatting context
 * `hidden` gave (`clip` does not make one). The player page opts in, and so
 * does Pick Team for its confirmation bar (BG-0157). The squad
 * builder and transfer confirmation bars are sticky in the column too and do
 * not stick from `md` either; they keep today's behaviour until that is
 * decided for them.
 */
export function FantasyFrame({
  children,
  bottomNav = false,
  topBar = "desktop",
  stickyBottomBar = false,
  className,
  background = "light",
}: {
  children: ReactNode;
  /** Render the application bottom navigation (phones; it is `md:hidden`). */
  bottomNav?: boolean;
  /** The screen has a `sticky bottom-0` bar in the column that must stick from `md` too. */
  stickyBottomBar?: boolean;
  /** `always` shows the global top bar on phones too — the hub, which has no `UiHeader`. */
  topBar?: "desktop" | "always";
  className?: string;
  background?: "light" | "white";
}) {
  // `ui.surface.bar` is the kit's flat opaque-surface pair (fill + matching
  // foreground) with no radius or shadow of its own — what a full-bleed
  // column needs. `ui.surface.card` would bring the card radius and shadow.
  const surface = background === "white" ? ui.surface.bar : ui.surface.page;
  return (
    <div className={cn("fpl-root relative min-h-dvh", surface)}>
      {topBar === "always" ? (
        <TopBar />
      ) : (
        <>
          <div className="hidden md:contents">
            <TopBar />
          </div>
          {/* STATUS BAR (BG-0151) — on a phone the inner screen's `UiHeader`
              does not stick, so in the app (`viewport-fit=cover`, transparent
              status bar) scrolled content would pass under the clock. The
              strip is exactly as tall as the status bar, in the header's own
              surface, and stays there. 0px tall in a browser. From `md` the
              sticky top bar above takes over. */}
          <StatusBarStrip surface={ui.surface.bar} className="md:hidden" />
        </>
      )}
      <main
        className={cn(
          // Same column as `UiScreen width="content"`, which is what every
          // migrated public route renders through `AppShell`. `fpl-column` is
          // kept: the viewport-containment tooling selects `main.fpl-column`.
          "fpl-column relative",
          ui.space.content,
          "md:my-4 md:min-h-[calc(100dvh-7rem)]",
          stickyBottomBar ? "md:flow-root md:overflow-clip" : "md:overflow-hidden",
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
