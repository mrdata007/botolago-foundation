import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRightLeft, Home, ListChecks, Menu, Shirt, type LucideIcon } from "lucide-react";

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

export function FantasyMobileNav() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const secondaryActive =
    isFantasyRouteActive(pathname, "/fantasy/leagues") ||
    fantasySecondaryItems.some((item) => isFantasyRouteActive(pathname, item.to));

  return (
    <nav
      aria-label={t("nav.fantasy")}
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 md:hidden"
    >
      <div
        className="surface-4 mx-auto flex max-w-2xl items-stretch justify-between px-2 py-1.5"
        style={{ boxShadow: "var(--shadow-navigation)" }}
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
              className={cn(
                "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold",
                "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
                active
                  ? "text-[color:var(--brand-accent)]"
                  : "text-[color:var(--text-muted)] hover:text-foreground",
              )}
            >
              <ActiveSurface active={active} />
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate leading-none">{t(item.labelKey)}</span>
            </Link>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("fantasy.tab.more")}
              className={cn(
                "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold",
                "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
                secondaryActive
                  ? "text-[color:var(--brand-accent)]"
                  : "text-[color:var(--text-muted)] hover:text-foreground",
              )}
            >
              <ActiveSurface active={secondaryActive} />
              <Menu className="h-5 w-5 shrink-0" aria-hidden />
              <span className="leading-none">{t("fantasy.tab.more")}</span>
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
                    className="w-full cursor-pointer font-semibold"
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
                    <Link to={item.to} className="w-full cursor-pointer font-semibold">
                      <Icon className="h-4 w-4" aria-hidden />
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
        "pointer-events-none absolute inset-1 -z-[1] rounded-xl",
        "transition-[opacity,transform] duration-[var(--duration-quick)] ease-[var(--ease-emphasized)]",
        active ? "scale-100 opacity-100" : "scale-95 opacity-0",
      )}
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--brand-accent) 18%, transparent), color-mix(in oklab, var(--brand-primary) 12%, transparent))",
        boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--brand-accent) 34%, transparent)",
      }}
    />
  );
}
