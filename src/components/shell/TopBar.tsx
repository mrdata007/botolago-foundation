// BotolaGO shell — Top bar, on the UI kit (Option A "Club colours").
//
// A full-bleed opaque bar on the surface token with a hairline at the block
// end, the wordmark at the inline start and round 44px soft buttons at the
// inline end (`UiIconButton` — the language switcher today; a notifications
// bell only once there is an inbox to open, BG-0111 removed dead controls).
// The boards draw the bar with a hairline only, so the card shadow it used to
// carry on top of the rule is gone.
//
// The height is unchanged — safe-top + the 44px row + `pb-2` + the 1px rule —
// because `--topbar-h` in styles.css is computed from exactly those terms and
// the live strip and the /matches filters stick under it.

import { Link, useRouterState } from "@tanstack/react-router";

import { UserRound } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { ui, UiIconLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PEPITES_PROMOTED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { isPrimaryRouteActive, primaryNavItems } from "./primary-nav";

export function TopBar({ trailing }: { trailing?: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <header className={cn("sticky top-0 z-30", ui.surface.bar, ui.rule.block, ui.safe.top, "pb-2")}>
      <div
        className={cn(
          "mx-auto flex items-center gap-3 md:max-w-[var(--ui-content-max)]",
          ui.space.gutter,
          "min-h-[var(--ui-tap-min)]",
        )}
      >
        {/* The boards set the wordmark at about 21px against 44px controls:
            the bar is quiet and the page title under it is the loud line. */}
        <Logo size="sm" />

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
                  "inline-flex items-center justify-center px-4 transition-colors",
                  ui.space.tap,
                  // Round like every other control a thumb or a pointer
                  // presses in Option A (chips, buttons, the nav pill).
                  ui.radius.full,
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.focus,
                  active
                    ? // Selected is white on navy — the Option A selected
                      // chip — not the cyan `ui.surface.ink`.
                      ui.surface.inkPlain
                    : cn(
                        ui.tone.muted,
                        // BG-0083: the hover used to write `--ui-ink`, a FILL,
                        // as the text colour — 1.25:1 on a dark surface. The
                        // foreground a hover moves to is the full-strength one.
                        "hover:bg-[color:var(--ui-surface-sunken)] hover:text-[color:var(--ui-on-surface)]",
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
          {/* Pépites takes Profil's slot in the bar once promoted, so the
              profile moves here. */}
          {PEPITES_PROMOTED ? (
            <UiIconLinkButton to="/profile" aria-label={t("nav.profile")}>
              <UserRound aria-hidden />
            </UiIconLinkButton>
          ) : null}
        </div>
      </div>
    </header>
  );
}
