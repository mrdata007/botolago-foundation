// BotolaGO shell — Bottom navigation, on the UI kit (Option A "Club colours").
//
// A full-bleed opaque bar seated on the viewport edge, a hairline rule at the
// block start, ≥44×44 tap targets and the kit's micro type. The active item
// carries the action-gradient pill behind its icon — the one place the
// product's action colour marks "you are here".
//
// The pill alone is NOT the state cue. Spring→sky on the white bar measures
// about 1.34:1, which is a decoration, not a boundary (WCAG 1.4.11). So the
// active label also changes weight and colour (heavy, full-strength
// foreground against the muted strong-weight inactive labels), and
// `aria-current="page"` says it to assistive tech. Do not remove either.
//
// Items stay `flex-1`, never a fixed column count: the bar lays out 4 items
// while News is hidden (`NEWS_ENABLED=false`, filtered in primary-nav.ts)
// and 5 when it is on. Its height — `pt-2`, a 32px pill, a gap, the micro
// line, the item's `py-1`, safe-bottom and the rule — lands on the 76px
// `--bottomnav-h` in styles.css.
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
        "pt-2",
        ui.shadow.raised,
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
                "group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1",
                ui.space.tap,
                ui.radius.card,
                ui.text.micro,
                ui.focus,
                "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                active
                  ? cn(ui.tone.default, "[font-weight:var(--ui-weight-heavy)]")
                  : cn(
                      ui.tone.muted,
                      "[font-weight:var(--ui-weight-strong)]",
                      // BG-0083: this hover wrote `--ui-ink` — a fill — as
                      // the text colour. The hover moves to the full-strength
                      // foreground instead, the same one the active label uses.
                      "hover:text-[color:var(--ui-on-surface)]",
                    ),
              )}
            >
              {/* The pill behind the icon. The gradient is a background IMAGE,
                  so it is set inline from the token (a class cannot name a
                  `var()` image and stay a literal Tailwind can scan). The
                  icon on it is ink-deep, dark in both themes like the
                  gradient under it: 12.4:1 light, 10.7:1 dark. */}
              <span
                aria-hidden
                className={cn(
                  "grid h-8 w-14 shrink-0 place-items-center",
                  ui.radius.full,
                  "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                  active
                    ? "text-[color:var(--ui-ink-deep)]"
                    : "group-hover:bg-[color:var(--ui-surface-sunken)]",
                )}
                style={active ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
              </span>
              {/* BG-0124 — no local `leading-*` here. A `leading-none` on
                  this span, combined with `truncate`, once cut 2px off the
                  Latin descender in "Fantasy" and a third of the Arabic ink.
                  `ui.text.micro` already sets the leading for both scripts. */}
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
