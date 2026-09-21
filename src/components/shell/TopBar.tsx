// BotolaGO shell — Top bar, on the UI kit.
//
// Converted from the Design System V2 glass pill (`surface-4`, 22px blur,
// floating with a 12px inset) to the Fantasy language: a full-bleed opaque
// bar on the surface token, a hairline rule at the block end, the Fantasy
// radii, and the Fantasy type scale for the desktop nav. Nothing here is
// Fantasy *layout* — only the language.

import { Link, useRouterState } from "@tanstack/react-router";

import { Logo } from "@/components/brand/Logo";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { isPrimaryRouteActive, primaryNavItems } from "./primary-nav";

export function TopBar({ trailing }: { trailing?: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <header
      className={cn(
        "sticky top-0 z-30",
        ui.surface.bar,
        ui.rule.block,
        ui.safe.top,
        "pb-2",
        "shadow-[var(--ui-shadow-card)]",
      )}
    >
      <div
        className={cn(
          "mx-auto flex items-center gap-3 md:max-w-5xl",
          ui.space.gutter,
          "min-h-[var(--ui-tap-min)]",
        )}
      >
        <Logo />

        <nav
          aria-label={t("nav.primary")}
          className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex"
        >
          {primaryNavItems.map((item) => {
            const active = isPrimaryRouteActive(pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-3 py-2 transition-colors",
                  ui.radius.control,
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.focus,
                  active
                    ? cn(ui.surface.ink, "shadow-[var(--ui-shadow-card)]")
                    : cn(
                        ui.tone.muted,
                        "hover:bg-[color:var(--ui-surface-sunken)] hover:text-[color:var(--ui-ink)]",
                      ),
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
