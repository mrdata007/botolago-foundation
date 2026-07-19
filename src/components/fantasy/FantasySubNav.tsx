import { Link, useRouterState } from "@tanstack/react-router";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";

type FantasyRoute =
  | "/fantasy"
  | "/fantasy/team"
  | "/fantasy/transfers"
  | "/fantasy/points"
  | "/fantasy/leagues"
  | "/fantasy/players"
  | "/fantasy/fixtures"
  | "/fantasy/top-players"
  | "/fantasy/rules";

const items: { to: FantasyRoute; labelKey: TranslationKey }[] = [
  { to: "/fantasy", labelKey: "fantasy.tab.hub" },
  { to: "/fantasy/team", labelKey: "fantasy.tab.team" },
  { to: "/fantasy/transfers", labelKey: "fantasy.tab.transfers" },
  { to: "/fantasy/points", labelKey: "fantasy.tab.points" },
  { to: "/fantasy/top-players", labelKey: "fantasy.tab.top" },
  { to: "/fantasy/leagues", labelKey: "fantasy.tab.leagues" },
  { to: "/fantasy/players", labelKey: "fantasy.tab.players" },
  { to: "/fantasy/fixtures", labelKey: "fantasy.tab.fixtures" },
  { to: "/fantasy/rules", labelKey: "fantasy.tab.rules" },
];

export function FantasySubNav() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Fantasy sections"
      className="glass-surface glass-regular sticky top-[var(--topbar-h)] z-20 -mx-3 border-y border-[var(--glass-border)] px-3 py-2"
    >
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {items.map((it) => {
          const active =
            it.to === "/fantasy" ? pathname === "/fantasy" : pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "relative whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-colors",
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
              {t(it.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
