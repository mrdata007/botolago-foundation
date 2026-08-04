import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

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

export function FantasySubNav() {
  const { t, dir } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const secondaryActive = fantasySecondaryItems.some((item) =>
    isFantasyRouteActive(pathname, item.to),
  );

  return (
    <nav
      aria-label={t("nav.fantasy")}
      className="glass-surface glass-regular sticky top-[var(--topbar-h)] z-20 -mx-3 hidden border-y border-[var(--glass-border)] px-3 py-2 md:block"
    >
      <div className="flex items-center gap-1">
        {fantasyPrimaryItems.map((item) => {
          const active = isFantasyRouteActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
                active ? "text-white" : "bg-white/50 text-foreground hover:bg-white/80",
              )}
              style={
                active
                  ? {
                      backgroundImage: "var(--bg-brand-gradient)",
                      boxShadow:
                        "0 6px 14px -8px color-mix(in oklab, var(--brand-accent) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.20)",
                    }
                  : undefined
              }
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
                "ms-auto inline-flex min-h-9 items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
                secondaryActive
                  ? "bg-[color:var(--brand-primary)] text-white"
                  : "bg-white/50 text-foreground hover:bg-white/80",
              )}
            >
              {t("fantasy.tab.more")}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
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
                      "w-full cursor-pointer font-semibold",
                      active && "bg-accent text-accent-foreground",
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
