// Design System V2 — Bottom navigation.
//
// Premium glass pill with a per-item pressed/active indicator, ≥44×44 tap
// targets, safe-area padding, RTL-safe. Uses CSS-only transitions to keep
// bundle size unchanged. Respects prefers-reduced-motion via the global
// media query in styles.css.

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
      aria-label={t("nav.primary")}
      className="fixed inset-x-0 bottom-0 z-40 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 px-3"
    >
      <div
        className="surface-4 mx-auto flex max-w-2xl items-stretch justify-between px-2 py-1.5"
        style={{ boxShadow: "var(--shadow-navigation)" }}
      >
        {items.map((it) => {
          const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              aria-current={active ? "page" : undefined}
              aria-label={t(it.labelKey)}
              className={cn(
                "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold",
                "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
                active
                  ? "text-[color:var(--brand-accent)]"
                  : "text-[color:var(--text-muted)] hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-1 -z-[1] rounded-xl",
                  "transition-[opacity,transform] duration-[var(--duration-quick)] ease-[var(--ease-emphasized)]",
                  active ? "opacity-100 scale-100" : "opacity-0 scale-95",
                )}
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--brand-accent) 18%, transparent), color-mix(in oklab, var(--brand-primary) 12%, transparent))",
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in oklab, var(--brand-accent) 34%, transparent)",
                }}
              />
              <Icon className={cn("h-5 w-5 shrink-0", active && "drop-shadow-sm")} aria-hidden />
              <span className="truncate leading-none">{t(it.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
