import type { ComponentProps, ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { ui, UiBackButton, UiHeader, UiPageTitle } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The frame every Pépites page shares, on the main design (BG-0152): the
 * default `AppShell` — the global top bar at every width (it carries the
 * profile button while Pépites holds Profil's slot in the bottom bar), the
 * neutral page, the bottom bar — and one full-bleed `pageHeader` band under
 * the bar:
 *
 *   hub page     `<PepitesPageTitle title={…}>{chip row}</PepitesPageTitle>`
 *                (Home, Ranking, Method: the kit's `UiPageTitle`)
 *   detail page  `<PepitesDetailHeader kicker={…} title={…} />`
 *                (Compare, an earlier week: the kit's `UiHeader` with the
 *                back pill), or no band and a `PepitesBack` in the page's
 *                own hero card (the player page)
 *
 * `width="desktop"` opens the page to the desktop canvas the Home and match
 * pages use (672px phone, 896px from 768px, 1320px from 1024px, and the
 * search field in the top bar from 1024px); pass the same `desktop` to the
 * band so its content lines up with the column underneath.
 *
 * DEPRECATED props, accepted only so the screens compile while they migrate
 * (the BG-0152 integration stage removes them): `hero` (read as
 * `pageHeader`), `wide` (read as `width="desktop"`) and `tone` (ignored: no
 * page is night any more).
 */
export function PepitesShell({
  pageHeader,
  width,
  children,
  className,
  hero,
  wide,
}: {
  /** The full-bleed band under the top bar: a title band or a detail header. */
  pageHeader?: ReactNode;
  /** `content` (default): the 672px reading column. `desktop`: the desktop canvas. */
  width?: "content" | "desktop";
  children: ReactNode;
  /** Classes for the content column's flex stack (`gap-4` by default). */
  className?: string;
  /** @deprecated Use `pageHeader`. */
  hero?: ReactNode;
  /** @deprecated Use `width="desktop"`. */
  wide?: boolean;
  /** @deprecated Ignored. */
  tone?: "page" | "night";
}) {
  const desktop = (width ?? (wide ? "desktop" : "content")) === "desktop";
  return (
    <AppShell contentWidth={desktop ? "desktop" : "compact"} pageHeader={pageHeader ?? hero}>
      <div className={cn("flex flex-col gap-4", className)} data-testid="pepites-page">
        {children}
      </div>
    </AppShell>
  );
}

/**
 * A band's content box, widened to the desktop canvas. `UiPageTitle` and
 * `UiHeader` keep their content to the 672px column; a desktop-width page
 * needs it on the column `UiScreen width="desktop"` draws instead
 * (`max-w-4xl` from 768px, `--ui-desktop-max` from 1024px). The rule
 * targets the band's own inner box (`> div`), so the kit is not forked.
 */
const DESKTOP_TITLE_COLUMN = "md:[&>div]:max-w-4xl lg:[&>div]:max-w-[var(--ui-desktop-max)]";
/** The same for `UiHeader`, whose inner box sits inside the gutter. */
const DESKTOP_HEADER_COLUMN =
  "md:[&>div]:max-w-[calc(var(--container-4xl)_-_2*var(--ui-gutter))] lg:[&>div]:max-w-[calc(var(--ui-desktop-max)_-_2*var(--ui-gutter))]";
/** A plain bar row lined up like `UiPageTitle`'s content. */
const BAR_ROW = cn(ui.space.content, ui.space.gutter);

/**
 * The kit's back pill (`UiBackButton`: arrow + "Retour", mirrored in Arabic
 * by styles.css) with the test id the e2e suites look for, which the kit
 * control does not forward. The wrapper is a real box, so a click on it
 * lands on the link.
 */
export function PepitesBack({
  to = "/pepites",
  testId = "pepites-back",
  label,
  className,
}: {
  to?: string;
  /** `pepites-back` on detail pages, `pepites-ranking-back` on the ranking. */
  testId?: string;
  /** Replaces "Retour" / "رجوع". */
  label?: string;
  className?: string;
}) {
  return (
    <span data-testid={testId} className={cn("inline-flex", className)}>
      <UiBackButton to={to} label={label} />
    </span>
  );
}

/**
 * A Pépites title fills its row (`flex-1`), so its box spans the band
 * whatever the title's length, and it WRAPS instead of truncating:
 * `UiPageTitle` truncates because the app's hub titles are one word
 * ("Matches"), while Pépites titles carry data ("Top 10 · Semaine 15",
 * "Classement final 2025-26") that an ellipsis would cut, worst beside the
 * trailing buttons on a 390px phone. The display leading holds two lines.
 */
const TITLE_FILLS_AND_WRAPS =
  "[&_:is(h1,h2)]:flex-1 [&_:is(h1,h2)]:whitespace-normal [&_:is(h1,h2)]:text-balance";

/**
 * A hub's title band: the kit's `UiPageTitle` (Changa h1, an inline-end
 * control, a chip row as `children`), with three Pépites needs on top:
 *
 * - `backTo` puts the back pill on its own row above the title, inside the
 *   same white band (the ranking and the method page are one level down
 *   from `/pepites`). `backTestId` names it for the tests.
 * - `desktop` lines the band up with a `width="desktop"` page.
 * - the heading fills the title row and wraps (see above).
 */
export function PepitesPageTitle({
  desktop = false,
  backTo,
  backTestId = "pepites-back",
  className,
  ...title
}: Omit<ComponentProps<typeof UiPageTitle>, "width"> & {
  desktop?: boolean;
  backTo?: string;
  backTestId?: string;
}) {
  const band = (
    <UiPageTitle
      {...title}
      className={cn(
        TITLE_FILLS_AND_WRAPS,
        backTo && "pt-1",
        desktop && DESKTOP_TITLE_COLUMN,
        className,
      )}
    />
  );
  if (!backTo) return band;
  return (
    <>
      <div className={cn(ui.surface.bar, "pt-2", desktop && DESKTOP_TITLE_COLUMN)}>
        <div className={BAR_ROW}>
          <PepitesBack to={backTo} testId={backTestId} />
        </div>
      </div>
      {band}
    </>
  );
}

/**
 * A detail page's header band under the global top bar: the kit's
 * `UiHeader` — back pill at the inline start, a centred kicker and title,
 * up to two `UiIconButton`s at the end, `children` under it — with the back
 * pill carrying a test id, the top padding of a band (not of a top bar: no
 * safe-area inset, the global bar above already has it) and, with
 * `desktop`, the desktop column.
 *
 * Its `title` is the page's `<h1>`. A page whose hero already holds the
 * `<h1>` (a player's name) passes only the `kicker`.
 */
export function PepitesDetailHeader({
  backTo = "/pepites",
  backTestId = "pepites-back",
  desktop = false,
  className,
  ...header
}: Omit<
  ComponentProps<typeof UiHeader>,
  "backTo" | "onBack" | "showBack" | "leading" | "sticky" | "wide" | "tone"
> & {
  backTo?: string;
  backTestId?: string;
  desktop?: boolean;
}) {
  return (
    <UiHeader
      {...header}
      leading={<PepitesBack to={backTo} testId={backTestId} />}
      className={cn("pt-2", desktop && DESKTOP_HEADER_COLUMN, className)}
    />
  );
}
