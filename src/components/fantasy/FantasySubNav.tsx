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
  | "/fantasy/rules";

const items: { to: FantasyRoute; labelKey: TranslationKey }[] = [
  { to: "/fantasy", labelKey: "fantasy.tab.hub" },
  { to: "/fantasy/team", labelKey: "fantasy.tab.team" },
  { to: "/fantasy/transfers", labelKey: "fantasy.tab.transfers" },
  { to: "/fantasy/points", labelKey: "fantasy.tab.points" },
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
      className="glass-surface glass-regular sticky top-16 z-20 -mx-3 border-y border-[var(--glass-border)] px-3 py-2"
    >
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {items.map((it) => {
          const active = it.to === "/fantasy" ? pathname === "/fantasy" : pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-[color:var(--brand-primary)] text-white shadow-sm"
                  : "bg-white/50 text-foreground hover:bg-white/80",
              )}
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
