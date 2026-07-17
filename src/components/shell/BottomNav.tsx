import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Newspaper, Trophy, CalendarDays, User } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { ComponentType } from "react";

type NavItem = {
  to: "/" | "/news" | "/fantasy" | "/matches" | "/profile";
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
};

const items: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/news", labelKey: "nav.news", icon: Newspaper },
  { to: "/fantasy", labelKey: "nav.fantasy", icon: Trophy },
  { to: "/matches", labelKey: "nav.matches", icon: CalendarDays },
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

export function BottomNav() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 px-3"
    >
      <div className="glass-surface glass-strong mx-auto flex max-w-2xl items-stretch justify-between rounded-2xl border border-[var(--glass-border)] px-2 py-1.5 shadow-lg shadow-black/5">
        {items.map((it) => {
          const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-[color:var(--brand-accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active && "drop-shadow")} aria-hidden />
              <span className="truncate leading-none">{t(it.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
