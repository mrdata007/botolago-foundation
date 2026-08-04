// Design System V2 — Top bar.
// Glass surface with soft elevation and safe-area padding.

import { Link, useRouterState } from "@tanstack/react-router";

import { Logo } from "@/components/brand/Logo";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { isPrimaryRouteActive, primaryNavItems } from "./primary-nav";

export function TopBar({ trailing }: { trailing?: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <header className="sticky top-0 z-30 pt-[max(env(safe-area-inset-top),0.25rem)]">
      <div
        className="surface-4 mx-3 mt-2 flex items-center gap-3 px-3 py-2 md:mx-auto md:max-w-5xl md:px-4"
        style={{ boxShadow: "var(--shadow-navigation)" }}
      >
        <Logo />

        <nav aria-label={t("nav.primary")} className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
          {primaryNavItems.map((item) => {
            const active = isPrimaryRouteActive(pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-xl px-3 py-2 text-xs font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
                  active
                    ? "bg-[color:var(--brand-primary)] text-white shadow-sm"
                    : "text-[color:var(--text-secondary)] hover:bg-white/70 hover:text-foreground",
                )}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-2 md:ms-0">
          {trailing}
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
