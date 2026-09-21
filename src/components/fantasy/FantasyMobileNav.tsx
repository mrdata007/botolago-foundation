import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRightLeft, Home, ListChecks, Menu, Shirt, type LucideIcon } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { primaryNavItems } from "@/components/shell/primary-nav";
import {
  fantasyPrimaryItems,
  fantasySecondaryItems,
  isFantasyRouteActive,
  type FantasyRoute,
} from "./fantasy-navigation";

const icons: Partial<Record<FantasyRoute, LucideIcon>> = {
  "/fantasy": Home,
  "/fantasy/team": Shirt,
  "/fantasy/points": ListChecks,
  "/fantasy/transfers": ArrowRightLeft,
};

const mobileItems = fantasyPrimaryItems.filter((item) => item.to !== "/fantasy/leagues");

/**
 * Phone Fantasy navigation bar.
 *
 * Converted to the kit (BG-0092): the `surface-4` glass bar is now an opaque
 * `ui.surface.bar` on `--ui-shadow-raised`, the active tint is composed from
 * `--ui-ink-fg` rather than the legacy brand pair, and the labels take
 * `ui.text.micro` instead of a hardcoded 10px.
 */
export function FantasyMobileNav() {
  const { t, dir } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const secondaryActive =
    isFantasyRouteActive(pathname, "/fantasy/leagues") ||
    fantasySecondaryItems.some((item) => isFantasyRouteActive(pathname, item.to));

  const itemClass = (active: boolean) =>
    cn(
      "relative flex min-h-[var(--ui-tap-min)] min-w-[var(--ui-tap-min)] flex-1 flex-col",
      "items-center justify-center gap-0.5 px-1 py-1.5",
      ui.radius.control,
      ui.text.micro,
      "[font-weight:var(--ui-weight-strong)]",
      ui.focus,
      "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
      active ? ui.tone.ink : ui.tone.muted,
    );

  return (
    <nav
      aria-label={t("nav.fantasy")}
      className={cn("fixed inset-x-0 bottom-0 z-40 px-3 pt-2 md:hidden", ui.safe.bottom)}
    >
      <div
        className={cn(
          "mx-auto flex max-w-2xl items-stretch justify-between px-2 py-1.5",
          ui.radius.track,
          ui.surface.bar,
          "shadow-[var(--ui-shadow-raised)]",
        )}
      >
        {mobileItems.map((item) => {
          const active = isFantasyRouteActive(pathname, item.to);
          const Icon = icons[item.to] ?? Home;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              aria-label={t(item.labelKey)}
              className={itemClass(active)}
            >
              <ActiveSurface active={active} />
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        <DropdownMenu dir={dir}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("fantasy.tab.more")}
              aria-current={secondaryActive ? "page" : undefined}
              className={itemClass(secondaryActive)}
            >
              <ActiveSurface active={secondaryActive} />
              <Menu className="h-5 w-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate">{t("fantasy.tab.more")}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" sideOffset={10} className="min-w-52">
            {fantasyPrimaryItems
              .filter((item) => item.to === "/fantasy/leagues")
              .concat(fantasySecondaryItems)
              .map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <Link
                    to={item.to}
                    aria-current={isFantasyRouteActive(pathname, item.to) ? "page" : undefined}
                    className={cn("w-full cursor-pointer", ui.text.body)}
                  >
                    {t(item.labelKey)}
                  </Link>
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            {primaryNavItems
              .filter((item) => item.to !== "/fantasy")
              .map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to} className={cn("w-full cursor-pointer", ui.text.body)}>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
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

function ActiveSurface({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-1 -z-[1]",
        ui.radius.control,
        "transition-[opacity,transform] duration-[var(--duration-quick)] ease-[var(--ease-emphasized)]",
        active ? "scale-100 opacity-100" : "scale-95 opacity-0",
      )}
      style={{
        backgroundColor: "color-mix(in oklab, var(--ui-ink-fg) 14%, transparent)",
        boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--ui-ink-fg) 30%, transparent)",
      }}
    />
  );
}
