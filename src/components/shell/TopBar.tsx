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

import { Search, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/Logo";
import { ui, UiIconButton, UiIconLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PEPITES_PROMOTED } from "@/lib/feature-flags";
import { recallSearchQuery } from "@/lib/search-context";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useManagerCardLive } from "@/services/manager-card-status";
import { isPrimaryRouteActive, usePrimaryNavItems } from "./primary-nav";

export function TopBar({
  trailing,
  wide = false,
}: {
  trailing?: React.ReactNode;
  /**
   * From 1024px, open the bar to the desktop canvas and put the search field
   * in it. Search itself does not depend on this: every bar has the search
   * button, and a bar kept to the content column opens the field under it.
   */
  wide?: boolean;
}) {
  const { t } = useI18n();
  // Gradins takes the fifth slot while it is live, and Profil is in this bar either way.
  const gradinsLive = useManagerCardLive();
  const [searchOpen, setSearchOpen] = useState(false);
  // Back from a search result: the field is open again, holding the query
  // (`GlobalSearch` restores it), and not focused, so no keyboard rises.
  const [searchRestored, setSearchRestored] = useState(false);
  useEffect(() => {
    if (recallSearchQuery() === "") return;
    setSearchOpen(true);
    setSearchRestored(true);
  }, []);

  return (
    <header className={cn("sticky top-0 z-30", ui.surface.bar, ui.rule.block, ui.safe.top, "pb-2")}>
      <div
        className={cn(
          // `@container`: what the bar can hold is asked in rem, which a larger
          // text size changes, not in pixels (see the logo and the buttons).
          "@container mx-auto flex items-center gap-3",
          wide
            ? "md:max-w-[var(--ui-content-max)] lg:max-w-[var(--ui-desktop-max)]"
            : "md:max-w-[var(--ui-content-max)]",
          ui.space.gutter,
          "min-h-[var(--ui-tap-min)]",
        )}
      >
        {/* The boards set the wordmark at about 21px against 44px controls:
            the bar is quiet and the page title under it is the loud line. */}
        {/* The wordmark while it fits beside the buttons (search, bell,
            language, profile: four on a signed-in phone); below that — a
            320px phone, or a large text size on a narrow one — the "GO" of the
            same wordmark, which keeps the buttons on screen and the brand in
            the bar. */}
        <Logo size="sm" className="hidden @min-[20rem]:flex" />
        <Logo variant="icon" className="shrink @min-[20rem]:hidden" />

        <PrimaryNavLinks />

        {wide ? <GlobalSearch className="hidden w-64 lg:block" /> : null}

        <div className="ms-auto flex items-center gap-2 @max-[20rem]:gap-1 md:ms-0">
          {trailing}
          <UiIconButton
            className={wide ? "lg:hidden" : undefined}
            aria-label={t("nav.search.label")}
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchRestored(false);
              setSearchOpen((open) => !open);
            }}
          >
            <Search aria-hidden />
          </UiIconButton>
          <NotificationBell />
          <LanguageSwitcher />
          {/* Pépites takes Profil's slot in the bar once promoted, so the
              profile moves here. */}
          {PEPITES_PROMOTED || gradinsLive ? (
            <UiIconLinkButton to="/profile" aria-label={t("nav.profile")}>
              <UserRound aria-hidden />
            </UiIconLinkButton>
          ) : null}
        </div>
      </div>
      {/* Over the page, not in the bar's flow: `--topbar-h` is the height the
          live strip and the filters stick under, so the bar cannot grow. */}
      {searchOpen ? (
        <div
          className={cn(
            "absolute inset-x-0 top-full z-10 pb-2 pt-2",
            wide && "lg:hidden",
            ui.surface.bar,
            ui.rule.block,
          )}
        >
          <div className={cn("mx-auto md:max-w-[var(--ui-content-max)]", ui.space.gutter)}>
            <GlobalSearch autoFocus={!searchRestored} />
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** The primary destinations as a centred row, on wide screens only. */
export function PrimaryNavLinks() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const primaryNavItems = usePrimaryNavItems();
  const gradinsLive = useManagerCardLive();
  return (
    <nav
      aria-label={t("nav.primary")}
      className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex"
    >
      {primaryNavItems.map((item) => {
        const active = isPrimaryRouteActive(pathname, item.to, gradinsLive);
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
                  // chip — not the cyan `ui.surface.ink`; in dark, the
                  // selected fill (BG-0149), since navy vanishes there.
                  ui.surface.selected
                : cn(
                    ui.tone.muted,
                    // BG-0083: the hover used to write `--ui-ink`, a FILL,
                    // as the text colour — 1.25:1 on a dark surface. The
                    // foreground a hover moves to is the full-strength one.
                    "hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)] hover:text-[color:var(--ui-on-surface)]",
                  ),
            )}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
