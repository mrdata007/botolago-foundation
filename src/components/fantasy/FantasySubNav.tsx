import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

        <DropdownMenu dir={dir}>
          <DropdownMenuTrigger asChild>
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
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {fantasySecondaryItems.map((item) => {
              const active = isFantasyRouteActive(pathname, item.to);
              return (
                <DropdownMenuItem key={item.to} asChild>
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "w-full cursor-pointer",
                      ui.text.body,
                      active && cn(ui.surface.sunken, ui.tone.ink),
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
