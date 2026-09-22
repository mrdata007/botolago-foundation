import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import { ui, UiMenu, UiMenuItem } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import {
  fantasyPrimaryItems,
  fantasySecondaryItems,
  isFantasyRouteActive,
} from "./fantasy-navigation";

/**
 * Desktop Fantasy sub-navigation.
 *
 * Converted to the kit (BG-0092): the glass bar is now an opaque
 * `ui.surface.bar` with a hairline rule (glass over a dark page rendered the
 * active tab's white label on a near-white pane), the active tab takes the
 * ink fill with `--ui-on-ink-plain` rather than a literal `text-white`, and
 * every tab clears the 44px tap floor.
 *
 * TWO THINGS A LATER LANE NEEDS, both established by search rather than
 * assumed.
 *
 * NOTHING MOUNTS THIS. `FantasySubNav` appears nowhere in `src/` outside its
 * own export — the only other hits in the tree are the surface inventory, a
 * BG-0094 evidence dump and a `.lovable` plan note. The ledger recorded that
 * about `FantasyMobileNav`; it is true of this file too.
 *
 * AND THE "More" MENU CANNOT MOVE TO `UiMenu` YET. Its items are `<Link>`s.
 * `UiMenuItem` exposes `onSelect` and no `asChild`, so the only two ways to
 * put a route in one are to nest an anchor inside a `role="menuitem"` div, or
 * to navigate imperatively from `onSelect` — which throws away the `href` and
 * with it middle-click, open-in-new-tab and the link role the `aria-current`
 * hangs off. Either is a navigation change, and this is a design migration.
 * So the V1 dropdown stays, with its ~32px items against the 44px floor,
 * until the kit can carry a menu OF LINKS. That is the gap; it is not a
 * preference for the V1 component.
 */
export function FantasySubNav() {
  const { t, dir } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const secondaryActive = fantasySecondaryItems.some((item) =>
    isFantasyRouteActive(pathname, item.to),
  );

  const tabClass = cn(
    "relative inline-flex min-h-[var(--ui-tap-min)] items-center whitespace-nowrap px-3",
    ui.radius.control,
    ui.text.meta,
    "[font-weight:var(--ui-weight-heavy)]",
    ui.focus,
    "transition-colors",
  );

  return (
    <nav
      aria-label={t("nav.fantasy")}
      className={cn(
        "sticky top-[var(--topbar-h)] z-20 -mx-3 hidden px-3 py-2 md:block",
        ui.surface.bar,
        ui.rule.block,
        ui.rule.blockStart,
      )}
    >
      <div className="flex items-center gap-1">
        {fantasyPrimaryItems.map((item) => {
          const active = isFantasyRouteActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                tabClass,
                active ? ui.surface.inkPlain : cn(ui.surface.sunken, ui.tone.muted),
              )}
              aria-current={active ? "page" : undefined}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}

        {/*
          The "More" menu was the last V1 dropdown on a Fantasy surface. Its
          items were `py-1.5 text-sm` — roughly a 32px row against the 44px
          floor, and rule 5 has no exception for a menu. `UiMenuItem` takes
          `asChild` now, so these stay real `<Link>`s: a button that calls
          navigate() is not a link and loses the href, the middle-click and
          the copy-link.
        */}
        <UiMenu
          align="end"
          className="min-w-48"
          trigger={
            <button
              type="button"
              aria-current={secondaryActive ? "page" : undefined}
              className={cn(
                tabClass,
                "ms-auto gap-1",
                secondaryActive ? ui.surface.inkPlain : cn(ui.surface.sunken, ui.tone.muted),
              )}
            >
              {t("fantasy.tab.more")}
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          }
        >
          {fantasySecondaryItems.map((item) => {
            const active = isFantasyRouteActive(pathname, item.to);
            return (
              <UiMenuItem key={item.to} asChild selected={active}>
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-full cursor-pointer items-center px-3",
                    ui.space.row,
                    ui.radius.control,
                    ui.text.body,
                    active ? cn(ui.surface.sunken, ui.tone.ink) : ui.tone.default,
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              </UiMenuItem>
            );
          })}
        </UiMenu>
      </div>
    </nav>
  );
}
