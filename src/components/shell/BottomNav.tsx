// BotolaGO shell — Bottom navigation, on the UI kit.
//
// Converted from the Design System V2 floating glass pill to the Fantasy
// language: a full-bleed opaque bar seated on the viewport edge, a hairline
// rule at the block start, ≥44×44 tap targets, and the kit's micro type
// scale. The active item is marked with the brand ink rather than a
// gradient wash, so it reads the same in light and dark.
//
// RTL-safe (no physical utilities) and reduced-motion-safe (the global
// media query in styles.css neutralises the transition).

import { Link, useRouterState } from "@tanstack/react-router";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { isPrimaryRouteActive, primaryNavItems } from "./primary-nav";

export function BottomNav() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav
      aria-label={t("nav.primary")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        ui.surface.bar,
        ui.rule.blockStart,
        ui.safe.bottom,
        "pt-1 shadow-[var(--ui-shadow-raised)]",
      )}
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-between px-2">
        {primaryNavItems.map((item) => {
          const active = isPrimaryRouteActive(pathname, item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              aria-label={t(item.labelKey)}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1.5",
                ui.space.tap,
                ui.radius.control,
                ui.text.micro,
                ui.focus,
                "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                active
                  ? cn(ui.tone.ink, "[font-weight:var(--ui-weight-heavy)]")
                  : cn(ui.tone.muted, "hover:text-[color:var(--ui-ink)]"),
              )}
            >
              {/* Active indicator: a short bar at the block start of the item,
                  logical so it mirrors, and tinted from the ink token so it
                  survives a theme switch. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-x-3 top-0 h-0.5 rounded-full",
                  "transition-opacity duration-[var(--duration-quick)] ease-[var(--ease-emphasized)]",
                  active ? "bg-[color:var(--ui-ink)] opacity-100" : "bg-transparent opacity-0",
                )}
              />
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              {/* BG-0124 — this span carried a local `leading-none` that
                  overrode `ui.text.micro`'s leading on the most-seen element
                  in the product. Combined with `truncate`, whose
                  `overflow: hidden` exists for a horizontal ellipsis, it cut
                  2px off the Latin descender in "Fantasy" and 5px of ink —
                  about a third — off the Arabic. The ramp already sets the
                  right leading for both scripts, so this sets none. */}
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
