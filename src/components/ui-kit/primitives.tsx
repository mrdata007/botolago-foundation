/**
 * BotolaGO UI Kit — shared primitives.
 *
 * These encode the Fantasy design language (the product's design source of
 * truth) in a form the rest of the app can adopt. They deliberately do NOT
 * carry any Fantasy-specific layout: no pitch, no squad grid, no gameweek
 * chrome. What is shared is the language — type scale, radii, surfaces, the
 * header pattern, buttons, tabs, pills, rows, states — not the screens.
 *
 * House rules, enforced by `ui-kit.contract.test.ts`:
 *   - logical properties only (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/
 *     `border-s`/`border-e`/`text-start`/`text-end`);
 *   - every `tracking-*` is `ltr:`-prefixed — Arabic letterforms join and
 *     must never be letter-spaced (open defect BG-0069);
 *   - colours come from `--ui-*` or `currentColor`, never from a literal,
 *     so light and dark both work;
 *   - `--ui-ink` fills and borders; foregrounds use `--ui-ink-fg`
 *     (`ui.tone.ink`). `--ui-ink` as a text colour measured 1.25:1 on dark
 *     — that is BG-0083 and it must not come back;
 *   - every interactive element clears the 44px tap floor
 *     (`--ui-tap-min`).
 */

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Info, Loader2, X } from "lucide-react";
import type {
  AnchorHTMLAttributes,
  AriaAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  ElementType,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TdHTMLAttributes,
  TextareaHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { useId, useRef } from "react";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { rovingTabStop, rovingTarget } from "./tabs-keyboard";
import { ui } from "./tokens";

/**
 * The test hook every state block needs and no state primitive forwarded.
 *
 * Nine Admin surfaces name their empty, loading and error blocks —
 * `admin-news-empty`, `admin-audit-loading`, `admin-approvals-empty` — and
 * the kit's own state components dropped the attribute, so converting a
 * screen meant either losing its hook or wrapping the block in a spare `div`
 * to carry one. `UiButton`, `UiInput` and `UiSelect` already forward it by
 * spreading; this is the same affordance, named, for the ones that do not
 * spread.
 */
interface UiTestable {
  /** Rendered as `data-testid`. */
  testId?: string;
}

/* ------------------------------------------------------------------ */
/* Screen frame                                                        */
/* ------------------------------------------------------------------ */

/**
 * The page canvas: a mobile-first single column on the page surface.
 *
 * `width="column"` is the phone canvas Fantasy uses (480px, centered and
 * raised on desktop). `width="content"` and `"wide"` keep the reading widths
 * the content pages need while sharing the same gutter, background and
 * bottom-nav clearance.
 */
export function UiScreen({
  children,
  width = "content",
  className,
  bottomNav = false,
  raised = false,
}: {
  children: ReactNode;
  width?: "column" | "content" | "wide";
  className?: string;
  /** Reserve clearance for the fixed bottom navigation. */
  bottomNav?: boolean;
  /** Lift the column off the page on desktop, as the Fantasy frame does. */
  raised?: boolean;
}) {
  return (
    <main
      className={cn(
        "relative mx-auto w-full",
        ui.space.gutter,
        width === "column" && "max-w-[var(--ui-column-max)]",
        width === "content" && "max-w-2xl",
        width === "wide" && "max-w-5xl",
        bottomNav ? "pb-28 md:pb-12" : "pb-8",
        "pt-4 md:pt-6",
        raised &&
          "md:my-4 md:overflow-hidden md:rounded-[var(--ui-radius-column)] md:shadow-[var(--ui-shadow-column)]",
        className,
      )}
    >
      {children}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

/**
 * The screen header: a full-bleed band carrying
 * `[back] — centred kicker + title — [trailing]` on a 1fr/auto/1fr grid, with
 * an optional band underneath for a subtitle, tabs or filters.
 *
 * Option A: the back control is `UiBackButton` (a soft pill, arrow + "Retour")
 * whenever `backTo`, `onBack` or `showBack` asks for one; the title is set in
 * the display face (`ui.display.header`, Changa 19/800 — 16 when both flanks
 * are occupied), and an optional `kicker` ("FANTASY", "JOURNÉE 14") sits
 * above it in the label type. `trailing` takes one or two `UiIconButton`s.
 *
 * Three tones: `surface` (opaque, hairline-ruled — the Option A default),
 * `ink` (solid brand; the back pill turns glass) and `gradient` (the
 * cyan→indigo hero band, which no Option A screen uses).
 */
export function UiHeader({
  title,
  kicker,
  backTo,
  onBack,
  showBack = false,
  leading,
  trailing,
  children,
  tone = "surface",
  sticky = false,
  className,
}: {
  /**
   * The screen's name, rendered as its `<h1>`. Leave it out only when the
   * `kicker` alone labels the bar and the page carries its own `<h1>` (the
   * match page, whose teams are the heading).
   */
  title?: ReactNode;
  /** A small uppercase line above the title: the section or the context. */
  kicker?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  /** Render a Back control that falls back to router history. */
  showBack?: boolean;
  /** Replaces the Back control entirely. */
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  tone?: "gradient" | "ink" | "surface";
  sticky?: boolean;
  className?: string;
}) {
  const backTone = tone === "ink" ? "glass" : "soft";
  const leadingNode = leading ? (
    leading
  ) : backTo ? (
    <UiBackButton to={backTo} tone={backTone} />
  ) : onBack || showBack ? (
    <UiBackButton onClick={onBack} tone={backTone} />
  ) : null;

  return (
    <header
      className={cn(
        "relative pb-3",
        ui.space.gutter,
        ui.safe.top,
        sticky && "sticky top-0 z-30",
        tone === "gradient" && "text-[color:var(--ui-on-grad-header)]",
        tone === "ink" && "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink-plain)]",
        tone === "surface" && cn(ui.surface.bar, ui.rule.block),
        className,
      )}
      style={tone === "gradient" ? { backgroundImage: "var(--ui-grad-header)" } : undefined}
    >
      {/* The band is full-bleed; its content keeps to the page's content
          column (672px less the gutters), so on a wide screen Back and the
          actions sit over the column's edges, not the window's. Inside a
          narrower frame the cap never binds. */}
      <div className="mx-auto w-full max-w-[calc(var(--ui-content-max)_-_2*var(--ui-gutter))]">
        {/* Centring: the two `1fr` tracks are equal whenever the title fits
            between two flanks as wide as the wider one, so every such title is
            centred on the bar. A title too wide for that slot (at 390px beside
            the 101px "Retour" pill: anything over ~140px in French) does not
            truncate to stay centred: the track that holds the pill cannot
            shrink below it, the empty one can, and the title slides toward the
            end by just enough to show in full. Equal tracks forced by a mirror
            of the pill were tried and measured: "Statistiques joueurs" came
            out centred as "Statistiques jou…". Keep header titles short — the
            boards pair a short title with a `kicker`. */}
        <div className="grid min-h-[var(--ui-tap-min)] grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="justify-self-start">{leadingNode}</div>
          {/* `min-w-0`: a grid item's minimum is its content, so without it a
            long title widens the middle track instead of truncating. */}
          <div className="min-w-0 text-center">
            {kicker ? (
              <p
                className={cn(
                  "truncate",
                  ui.text.label,
                  tone === "surface" && ui.tone.muted,
                  tone === "ink" && ui.tone.onInkMuted,
                )}
              >
                {kicker}
              </p>
            ) : null}
            {title ? (
              <h1
                className={cn(
                  "truncate",
                  leadingNode && trailing ? ui.display.headerSm : ui.display.header,
                )}
              >
                {title}
              </h1>
            ) : null}
          </div>
          <div className="flex items-center gap-2 justify-self-end">{trailing}</div>
        </div>
        {children}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Icon buttons and the back control                                   */
/* ------------------------------------------------------------------ */

export type UiIconButtonVariant = "soft" | "glass" | "ink" | "ghost";

/**
 * The paint for each round control variant. `glass` reads `--ui-on-club`,
 * which is the plain on-ink white by default and the measured foreground
 * inside a `clubStyle()` block — so the same glass button is legible on a
 * navy band, on a photo scrim, on Wydad red and on FUS orange (where the
 * on-club colour is ink-deep, and white glass would be 2:1).
 */
function iconButtonPaint(variant: UiIconButtonVariant) {
  return cn(
    variant === "soft" && cn(ui.surface.sunken, ui.tone.ink, ui.focus),
    variant === "glass" &&
      cn(
        "bg-[color:color-mix(in_srgb,var(--ui-on-club)_16%,transparent)]",
        ui.tone.onClub,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-on-club)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
      ),
    variant === "ink" && cn(ui.surface.inkPlain, ui.focus),
    variant === "ghost" &&
      cn("bg-transparent hover:bg-[color:var(--ui-surface-sunken)]", ui.tone.ink, ui.focus),
    "disabled:cursor-not-allowed disabled:opacity-50",
  );
}

const ICON_BUTTON_FRAME = cn(
  "inline-grid shrink-0 place-items-center transition-[filter,opacity,background-color]",
  "[&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0",
  ui.space.tap,
  ui.radius.full,
);

/**
 * A round 44px control holding one icon (or two letters, like the language
 * switcher's "FR"): share, follow, bookmark, notifications, the check that
 * says a player is already in the team.
 *
 * `aria-label` is REQUIRED by the type. An icon is not a name, and an
 * unnamed button is announced as "button".
 *
 * Variants: `soft` (sunken disc, brand icon — the top bar and headers),
 * `glass` (a 16% wash of the on-club colour — on a club block or a photo),
 * `ink` (navy disc, white icon), `ghost` (no fill until hovered). It forwards
 * `ref` and spreads every other prop, so it works as a Radix `asChild`
 * trigger.
 */
export function UiIconButton({
  variant = "soft",
  className,
  children,
  ref,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  "aria-label": string;
  children: ReactNode;
  variant?: UiIconButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      {...props}
      ref={ref}
      className={cn(ICON_BUTTON_FRAME, iconButtonPaint(variant), className)}
    >
      {children}
    </button>
  );
}

/** `UiIconButton` as a router link — same shape, same required name. */
export function UiIconLinkButton({
  to,
  params,
  search,
  variant = "soft",
  className,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "aria-label" | "children"> & {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  "aria-label": string;
  children: ReactNode;
  variant?: UiIconButtonVariant;
}) {
  return (
    <Link
      to={to}
      params={params}
      search={search}
      {...props}
      className={cn(ICON_BUTTON_FRAME, iconButtonPaint(variant), className)}
    >
      {children}
    </Link>
  );
}

/**
 * The back control: a round soft pill with an arrow and "Retour" / "رجوع"
 * (`t("fpl.back")`). A link when `to` is given; otherwise a button that runs
 * `onClick`, or router history when there is none.
 *
 * The arrow is `lucide-arrow-left`, which `styles.css` mirrors under
 * `dir="rtl"` for every screen at once — do not add `rtl:rotate-180` on top,
 * it composes with that transform and points the arrow backwards again.
 *
 * `iconOnly` keeps the name for screen readers and drops the visible word —
 * for a compact bar with no room (the sticky score bar). `tone="glass"` is
 * for a club block or a photo, like `UiIconButton variant="glass"`.
 */
export function UiBackButton({
  to,
  onClick,
  label,
  tone = "soft",
  iconOnly = false,
  className,
}: {
  to?: string;
  onClick?: () => void;
  /** Overrides the default "Retour" wording. */
  label?: string;
  tone?: "soft" | "glass";
  iconOnly?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const name = label ?? t("fpl.back");
  const classes = cn(
    iconOnly
      ? ICON_BUTTON_FRAME
      : cn(ICON_BUTTON_FRAME, "inline-flex items-center gap-1.5 ps-2.5 pe-3.5"),
    ui.text.bodyStrong,
    iconButtonPaint(tone),
    className,
  );
  const content = (
    <>
      <ArrowLeft aria-hidden />
      {iconOnly ? <span className="sr-only">{name}</span> : <span>{name}</span>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick ?? (() => router.history.back())} className={classes}>
      {content}
    </button>
  );
}

/**
 * The column a `UiPageTitle` lines its content up with on a wide screen: the
 * band stays full-bleed, its content sits in the same centred column as the
 * page underneath. An inner box rather than computed padding, so a caller
 * that already narrows the band still gets its gutter and nothing collapses.
 */
const PAGE_TITLE_COLUMN = {
  /** `UiScreen width="content"` — every `AppShell` page. */
  content: ui.space.content,
  /** The 480px phone column (`UiScreen width="column"`, the Fantasy frame). */
  column: ui.space.column,
} as const;

/**
 * The hub title band (Option A) — Matches, Actualités, Fantasy, Profil: a
 * white band under the top bar carrying the screen's `<h1>` in the display
 * face (`ui.display.title`, Changa 34/800), an optional control at the
 * inline end (the season picker: `<UiButton variant="soft" size="sm">`), and
 * optional `children` under it (a scrolling `UiChip` row, a tablist).
 *
 * Full-bleed like `UiHeader`: render it outside `UiScreen`'s gutter, above
 * the content column. On a wide screen its content lines up with that column
 * (`width`, default `content`).
 */
export function UiPageTitle({
  title,
  trailing,
  children,
  as: Tag = "h1",
  width = "content",
  className,
}: {
  title: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  /** The heading element; `h1` unless the page already has one. */
  as?: "h1" | "h2";
  /** The column the content lines up with on a wide screen. */
  width?: keyof typeof PAGE_TITLE_COLUMN;
  className?: string;
}) {
  return (
    <div className={cn(ui.surface.bar, ui.rule.block, "pb-3 pt-2", className)}>
      <div className={cn(PAGE_TITLE_COLUMN[width], ui.space.gutter)}>
        <div className="flex min-h-[var(--ui-tap-min)] items-center justify-between gap-3">
          <Tag className={cn("min-w-0 truncate", ui.display.title)}>{title}</Tag>
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
        {children ? <div className="mt-3 min-w-0">{children}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

/**
 * The card: an opaque surface, the 14px card radius (`--ui-radius-card`,
 * carried by `ui.surface.card`), one small shadow, no border and no glass.
 * `interactive` adds the press feedback used on tappable tiles. A feature
 * surface (score header, Fantasy card, hero) takes `ui.radius.sheet` through
 * `className` instead.
 *
 * ARIA and `role`/`id` pass through (BG-0129). They used not to, so a caller
 * could not label a card, mark it as a region, or point an
 * `aria-labelledby`/`aria-describedby` at one — and a card is exactly the kind
 * of box that wants a name. The pass-through is deliberately narrow: ARIA plus
 * `role` and `id`, not arbitrary DOM props. Spreading everything would let a
 * caller attach `onClick` to a plain `div`, which is the tappable-card defect
 * `interactive` and `as` exist to prevent.
 */
export function UiCard({
  children,
  as: Tag = "div",
  padding = "md",
  interactive = false,
  className,
  role,
  id,
  testId,
  ...aria
}: {
  children: ReactNode;
  as?: ElementType;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  className?: string;
  role?: string;
  id?: string;
} & UiTestable &
  AriaAttributes) {
  return (
    <Tag
      role={role}
      id={id}
      data-testid={testId}
      {...aria}
      className={cn(
        ui.surface.card,
        padding === "sm" && "p-3",
        padding === "md" && "p-4",
        padding === "lg" && "p-5",
        interactive &&
          cn(
            "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
            ui.focus,
          ),
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export type UiButtonVariant =
  | "gradient"
  | "ink"
  | "light"
  /**
   * The sunken pill: a quiet control that is not the page's call to action —
   * the season picker beside a hub title ("2026/27 ⌄"), a "Jouer" inside a
   * chip card. Same fill as `UiIconButton variant="soft"`.
   */
  | "soft"
  | "outline"
  | "ghost"
  /**
   * The confirm action of a destructive dialog — delete this account, sign
   * out and erase my data. A filled negative, not an outline: the point of
   * the fill is that the control cannot be mistaken for the safe one beside
   * it. Three screens were composing this by hand from `--ui-negative`
   * mixes, each slightly differently.
   */
  | "destructive";
export type UiButtonSize = "sm" | "md";
/**
 * Which surface the button is sitting on.
 *
 * `outline` and `ghost` paint their text in `--ui-ink-fg`, a deep navy in the
 * light theme. On the page that is correct; on the dark mesh behind the
 * welcome and auth screens it is a button you cannot read, and its focus ring
 * — drawn in the same colour, over a `--ui-page` offset — is a ring you
 * cannot see. So the welcome screen hand-rolled its own buttons instead.
 * `tone="onMesh"` is that screen's answer, stated once.
 */
export type UiButtonTone = "onSurface" | "onMesh";

function buttonClass(
  variant: UiButtonVariant,
  size: UiButtonSize,
  tone: UiButtonTone,
  className?: string,
) {
  const onMesh = tone === "onMesh";
  return cn(
    "inline-flex items-center justify-center gap-2",
    // A flex item shrinks by default, and an SVG is a flex item like any
    // other: put a long label beside an icon in a narrow button and the
    // browser takes the width out of the icon. A Lucide glyph is drawn square,
    // so the result is a distorted icon rather than a wrapped label — measured
    // on /fantasy, a `lucide-plus` sized `h-4 w-4` rendering 14.0 x 16.0.
    // Enforced here rather than as `shrink-0` on every call site: most already
    // carry it, the ones that forget are the ones that break, and a button is
    // where icon and label compete for width.
    "[&_svg]:shrink-0",
    // Option A: every button is a pill, like the chips and the icon buttons.
    ui.radius.full,
    onMesh ? ui.focusOnMesh : ui.focus,
    size === "md"
      ? cn("min-h-[var(--ui-row-min)] w-full px-4", ui.text.bodyStrong)
      : cn(
          // BOTH axes. `md` is full-width so its width is never in question;
          // `sm` is inline, and a control 44px tall and 30px wide clears no
          // floor — an icon-only `sm` button is exactly that shape. Found
          // when a hand-rolled back control that carried `ui.space.tap` (which
          // sets both) became a `sm` button and silently lost its width.
          "min-h-[var(--ui-tap-min)] min-w-[var(--ui-tap-min)] px-3",
          // A pill never wraps. `sm` is inline and sizes to its label, so
          // squeezed into a narrow flex cell it used to break "Voir le
          // joueur" onto two lines inside a 51px pill — and `rounded-full`
          // turned that box into a near-circle with the words outside the
          // curve. On one line it takes its width; the row around it wraps
          // instead. Because the explicit `min-w` above replaces a flex
          // item's automatic minimum, a caller can still squeeze it below its
          // label with a zero basis (`flex-1`): give a growing `sm` button
          // `flex-auto`. A label meant to wrap (a two-line grid cell) opts
          // back in on its own span with `text-balance` / `whitespace-normal`.
          "whitespace-nowrap text-center",
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
        ),
    "transition-[filter,opacity] disabled:cursor-not-allowed",
    // The primary call to action is the one button lifted off the page. A
    // disabled one lies flat again, so it does not read as armed.
    variant === "gradient" &&
      "text-[color:var(--ui-ink-deep)] shadow-[var(--ui-shadow-lifted)] disabled:opacity-45 disabled:shadow-none",
    variant === "ink" &&
      "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink-plain)] disabled:bg-[color:var(--ui-surface-sunken)] disabled:text-[color:var(--ui-on-surface-muted)]",
    // BG-0083: these three read as text on a surface, so they take the
    // theme-correct foreground, not the ink fill.
    variant === "light" &&
      "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)] shadow-[var(--ui-shadow-card)] disabled:opacity-50",
    variant === "soft" &&
      !onMesh &&
      "bg-[color:var(--ui-surface-sunken)] text-[color:var(--ui-on-surface)] disabled:opacity-50",
    variant === "outline" &&
      !onMesh &&
      "border border-current bg-transparent text-[color:var(--ui-ink-fg)] disabled:opacity-50",
    variant === "ghost" &&
      !onMesh &&
      "bg-transparent text-[color:var(--ui-ink-fg)] disabled:opacity-50",
    // On the mesh the same two variants keep their shape and change only the
    // colours they read from: the plain on-dark foreground, and a fill/rule
    // mixed from it so the control sits ON the mesh rather than beside it.
    onMesh &&
      variant === "outline" &&
      cn(
        "border bg-[color:var(--ui-mesh-glass)] border-[color:var(--ui-mesh-rule)]",
        ui.tone.onMesh,
        "disabled:opacity-50",
      ),
    onMesh && variant === "ghost" && cn("bg-transparent", ui.tone.onMesh, "disabled:opacity-50"),
    onMesh &&
      variant === "soft" &&
      cn("bg-[color:var(--ui-mesh-glass)]", ui.tone.onMesh, "disabled:opacity-50"),
    // The fill carries `--ui-on-negative`, not a hand-picked white: the
    // negative inverts across the themes, so white measured 5.49:1 in light
    // and 2.31:1 in dark.
    variant === "destructive" &&
      cn(
        "bg-[color:var(--ui-negative)]",
        ui.tone.onNegative,
        "disabled:bg-[color:var(--ui-surface-sunken)] disabled:text-[color:var(--ui-on-surface-muted)]",
      ),
    className,
  );
}

export function UiButton({
  variant = "gradient",
  size = "md",
  tone = "onSurface",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: UiButtonVariant;
  size?: UiButtonSize;
  tone?: UiButtonTone;
}) {
  return (
    <button
      type="button"
      {...props}
      className={buttonClass(variant, size, tone, className)}
      style={variant === "gradient" ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
    >
      {children}
    </button>
  );
}

export function UiLinkButton({
  to,
  params,
  search,
  variant = "gradient",
  size = "md",
  tone = "onSurface",
  className,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  variant?: UiButtonVariant;
  size?: UiButtonSize;
  tone?: UiButtonTone;
}) {
  return (
    <Link
      to={to}
      params={params}
      search={search}
      {...props}
      className={buttonClass(variant, size, tone, className)}
      style={variant === "gradient" ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control / tabs                                            */
/* ------------------------------------------------------------------ */

export type UiSegmentedSize = "md" | "lg";

/**
 * Tabs / segmented control.
 *
 * `size` exists because the segments used to be a hardcoded 40px at the 15px
 * body size: under the 44px tap floor, and four French labels
 * ("Général | Journée | Classement | Aide") do not fit at 390px. `md` is now
 * the floor itself (`--ui-tap-min`) at the meta size, which fits four labels;
 * `lg` is the roomier row height for two or three long labels.
 *
 * `variant="pill"` (Option A) is the two-way toggle — "Terrain | Liste": a
 * white rounded-full track on the card shadow, the chosen side a navy pill
 * with white text. Navigation between sections is `UiTabs`, not this.
 */
export function UiSegmented<T extends string>({
  value,
  onChange,
  options,
  tone = "onSurface",
  size = "md",
  variant = "track",
  className,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; disabled?: boolean }>;
  /** `onGradient` for a control sitting inside a gradient header band. */
  tone?: "onSurface" | "onGradient";
  size?: UiSegmentedSize;
  /** `track` (sunken track, raised white segment) or `pill` (Option A toggle). */
  variant?: "track" | "pill";
  className?: string;
  label?: string;
}) {
  const pill = variant === "pill";
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "grid p-[3px]",
        pill
          ? cn(ui.radius.full, "bg-[color:var(--ui-surface)] shadow-[var(--ui-shadow-card)]")
          : ui.radius.track,
        !pill &&
          (tone === "onGradient"
            ? "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_35%,transparent)]"
            : ui.surface.sunken),
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "truncate px-2 transition-colors disabled:opacity-50",
              pill ? ui.radius.full : ui.radius.segment,
              size === "md"
                ? cn("min-h-[var(--ui-tap-min)]", ui.text.meta)
                : cn("min-h-[var(--ui-row-min)]", ui.text.body),
              "[font-weight:var(--ui-weight-strong)]",
              ui.focus,
              active
                ? pill
                  ? ui.surface.inkPlain
                  : "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)] shadow-[var(--ui-shadow-card)]"
                : tone === "onGradient" && !pill
                  ? "text-[color:var(--ui-on-grad-header)]"
                  : "text-[color:var(--ui-on-surface-muted)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Underline tabs (Option A) — the match tabs, the rankings tabs: equal
 * columns on the bar surface over a hairline, each label in the display face
 * (Changa 16; 600 muted, 800 on-surface when chosen), the chosen one marked
 * by a 4px bar on its block-end edge.
 *
 * The bar is `inset 0 -4px 0` — a BLOCK-axis offset, the same in both
 * directions — painted in `accent`, which defaults to `--ui-ink-fg` (≥ 3:1
 * on the bar in both themes). The match tabs pass the home club's edge
 * colour: put `clubStyle(home)` on an ancestor and `accent="var(--ui-club-edge)"`.
 *
 * Keyboard: one tab stop (roving tabindex). ArrowLeft/ArrowRight move and
 * select — swapped under `dir="rtl"`, read from the tablist's own computed
 * direction, so "next" is always the reading direction — Home and End jump
 * to the ends, disabled tabs are skipped. A key with Alt, Ctrl or Meta held
 * is left to the browser (Alt+ArrowLeft is Back). The arithmetic lives in
 * `tabs-keyboard.ts`, tested on its own. Each tab gets the id
 * `${idBase}-tab-${value}` so a panel can say
 * `aria-labelledby={`${idBase}-tab-${value}`}`; pass `panelId` per option to
 * set `aria-controls` the other way.
 */
export function UiTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  accent,
  idBase,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; disabled?: boolean; panelId?: string }>;
  /** The tablist's accessible name. Required: a set of tabs needs one. */
  label: string;
  /** The indicator colour, any CSS colour; defaults to `var(--ui-ink-fg)`. */
  accent?: string;
  /** Prefix for the tab ids; a generated one when omitted. */
  idBase?: string;
  className?: string;
}) {
  const generated = useId();
  const base = idBase ?? generated;
  const tabs = useRef(new Map<T, HTMLButtonElement>());
  // The one tab in the tab order: the selected one, or the first enabled tab
  // when the selection is disabled or absent — never none.
  const tabStop = rovingTabStop(options, value);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const focused = options.find((option) => tabs.current.get(option.value) === event.target);
    // `null` for a modified key (Alt+Arrow is browser Back/Forward) or a key
    // that is not ours: leave it to the browser, do not prevent it.
    const target = rovingTarget(options, event, focused?.value, value, rtl);
    if (target === null) return;
    event.preventDefault();
    tabs.current.get(target)?.focus();
    if (target !== value) onChange(target);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("grid", ui.surface.bar, ui.rule.block, className)}
      style={
        {
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
          "--tab-accent": accent ?? "var(--ui-ink-fg)",
        } as CSSProperties
      }
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) tabs.current.set(option.value, node);
              else tabs.current.delete(option.value);
            }}
            id={`${base}-tab-${option.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={option.panelId}
            tabIndex={option.value === tabStop ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-[var(--ui-row-min)] min-w-0 items-center justify-center px-1",
              "transition-colors disabled:opacity-50",
              ui.display.tab,
              ui.focus,
              active
                ? cn(
                    "[font-weight:var(--ui-weight-heavy)] shadow-[inset_0_-4px_0_var(--tab-accent)]",
                    ui.tone.default,
                  )
                : ui.tone.muted,
            )}
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pills, chips and badges                                             */
/* ------------------------------------------------------------------ */

/**
 * A static emphatic label — "Journée 14", "Gardiens", a countdown. Fully
 * round (Option A). `ink` is the navy pill with plain white text; the cyan
 * on-ink of the Fantasy-flat look is gone from Option A.
 */
export function UiPill({
  children,
  tone = "ink",
  className,
}: {
  children: ReactNode;
  tone?: "ink" | "action" | "sunken";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1",
        ui.radius.full,
        ui.text.secondary,
        "[font-weight:var(--ui-weight-heavy)]",
        tone === "ink" && ui.surface.inkPlain,
        tone === "action" && "text-[color:var(--ui-ink-deep)]",
        tone === "sunken" && cn(ui.surface.sunken, ui.tone.muted),
        className,
      )}
      style={tone === "action" ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
    >
      {children}
    </span>
  );
}

/**
 * A selectable filter chip — the shared replacement for ad-hoc chip rows.
 *
 * It forwards `ref` and accepts `aria-current`, because a chip row is not
 * always a set of toggles: a date strip is a set of links to *the* current
 * day, which is `aria-current="date"`, and a roving-focus strip has to be
 * able to call `.focus()` on the selected chip. When `aria-current` is given
 * the chip drops `aria-pressed`, so it never announces both.
 *
 * Option A: fully round; unselected is the sunken pill in the default text
 * colour, selected the navy pill with white text (`ui.surface.inkPlain`,
 * 12.81:1) rather than the cyan on-ink.
 */
export function UiChip({
  children,
  selected = false,
  onClick,
  className,
  ref,
  "aria-current": ariaCurrent,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  children: ReactNode;
  selected?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      {...props}
      ref={ref}
      onClick={onClick}
      aria-current={ariaCurrent}
      aria-pressed={ariaCurrent === undefined ? selected : undefined}
      className={cn(
        // A chip is tappable, so it sits on the 44px floor like every other
        // control in the kit.
        // `px-3`: the 44px height already makes the pill; the boards' 14px
        // inline padding pushed the /fantasy/players sort row (four chips) onto
        // a second line at 390px in both languages. The 44px width floor is
        // for the shortest labels ("GB" measured 42px wide); a row that must
        // shrink its chips passes `min-w-0`.
        "inline-flex min-h-[var(--ui-tap-min)] min-w-[var(--ui-tap-min)] shrink-0 items-center justify-center gap-1.5 px-3 py-1.5",
        ui.radius.full,
        ui.text.meta,
        "[font-weight:var(--ui-weight-strong)]",
        ui.focus,
        "transition-colors",
        selected ? cn(ui.surface.inkPlain, "shadow-[var(--ui-shadow-card)]") : ui.surface.sunken,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function UiBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  /**
   * `outline` is for a state that must not read as spent. `neutral` sits on
   * the sunken surface, which is how this product draws "used up"; an
   * available-but-inactive state needs the page surface and a rule instead.
   */
  tone?: "neutral" | "outline" | "action" | "positive" | "negative" | "caution";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-3 py-1",
        ui.radius.full,
        // `ltr:` — Arabic letterforms join and must never be letter-spaced.
        ui.text.label,
        tone === "neutral" && cn(ui.surface.sunken, ui.tone.muted),
        tone === "outline" && cn("bg-[color:var(--ui-surface)]", ui.rule.all, ui.tone.ink),
        tone === "action" && "text-[color:var(--ui-ink-deep)]",
        tone === "positive" &&
          "bg-[color:color-mix(in_oklab,var(--ui-positive)_20%,transparent)] text-[color:var(--ui-positive)]",
        tone === "negative" &&
          "bg-[color:color-mix(in_oklab,var(--ui-negative)_18%,transparent)] text-[color:var(--ui-negative)]",
        // Caution is the only status colour that cannot be a foreground: it is
        // a light amber in both themes and measured 1.78:1 as text. So unlike
        // its neighbours this tone is a FILL with `--ui-on-caution` on it —
        // and the thing it marks is neither an error nor spent. A pending
        // approval mapped onto `negative` reads as a failure; onto `neutral`
        // it reads as already dealt with.
        tone === "caution" && "bg-[color:var(--ui-caution)] text-[color:var(--ui-on-caution)]",
        className,
      )}
      style={tone === "action" ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
    >
      {children}
    </span>
  );
}

/**
 * The live pill (Option A): a navy rounded-full pill (`ui.surface.inkPlain`,
 * 12.81:1 light, 12.60 dark) with the breathing red dot and the translated
 * live label — `t("matches.status.live")`, never an English "LIVE" — then
 * the minute in `<bdi>` so "45+2′" keeps its order in Arabic.
 *
 * The dot is `live-breathe` (still under reduced motion) and is decorative:
 * the word carries the state. The pill is not a live region; the score is.
 * `label` replaces the word for a variant like "J.14 · EN DIRECT".
 */
export function UiLivePill({
  minute,
  label,
  size = "sm",
  className,
}: {
  /** The match minute: a number, or a string such as "45+2". The prime is added. */
  minute?: number | string;
  label?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap",
        ui.radius.full,
        ui.surface.inkPlain,
        size === "md"
          ? cn("gap-1.5 px-2.5 py-1", ui.text.label)
          : cn(
              "gap-1 px-2 py-0.5",
              ui.text.micro,
              "[font-weight:var(--ui-weight-heavy)] uppercase ltr:tracking-wide",
            ),
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "live-breathe shrink-0 bg-[color:var(--ui-live)]",
          ui.radius.full,
          size === "md" ? "h-2 w-2" : "h-1.5 w-1.5",
        )}
      />
      <span>{label ?? t("matches.status.live")}</span>
      {minute !== undefined && minute !== "" ? (
        <bdi className={ui.text.tabular}>{`${minute}′`}</bdi>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Rows, dividers and banners                                          */
/* ------------------------------------------------------------------ */

export function UiDivider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-[color:var(--ui-rule)]", className)} />;
}

export function UiKeyValueRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-1",
        ui.space.row,
        ui.rule.block,
        ui.text.body,
        className,
      )}
    >
      <span className={ui.tone.default}>{label}</span>
      <span className={cn(ui.tone.default, "[font-weight:var(--ui-weight-heavy)]")}>{value}</span>
    </div>
  );
}

/** Full-bleed ink strip used for a single emphatic line of state. */
export function UiBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-4 py-2 text-center", ui.surface.ink, ui.text.bodyStrong, className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading / empty / error                                             */
/* ------------------------------------------------------------------ */

export function UiSkeleton({ className, testId }: { className?: string } & UiTestable) {
  return (
    <div
      aria-hidden
      data-testid={testId}
      className={cn("shimmer", ui.radius.control, className)}
      style={{ backgroundColor: "var(--ui-surface-sunken)" }}
    />
  );
}

/**
 * The three non-ready states, in one shape, so they read the same on every
 * screen: a centered card with an optional glyph, a heading, a line of body
 * copy and one action.
 */
export function UiStatePanel({
  kind,
  title,
  body,
  action,
  onRetry,
  illustration,
  className,
  testId,
}: {
  kind: "loading" | "empty" | "error";
  title?: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  onRetry?: () => void;
  /** An optional spot illustration (image URL) above the heading.
   *  Decorative: the heading carries the meaning. */
  illustration?: string;
  className?: string;
} & UiTestable) {
  const { t } = useI18n();

  if (kind === "loading") {
    return (
      <div
        role="status"
        aria-label={t("state.loading")}
        data-testid={testId}
        className={cn("py-6", className)}
      >
        <div
          className={cn(
            "mx-auto mb-4 flex items-center justify-center gap-2",
            ui.text.meta,
            ui.tone.muted,
          )}
        >
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {t("state.loading")}
        </div>
        <div className="space-y-3">
          <UiSkeleton className="h-12" />
          <UiSkeleton className="h-24" />
          <UiSkeleton className="h-12" />
        </div>
      </div>
    );
  }

  const isError = kind === "error";
  return (
    <UiCard padding="lg" testId={testId} className={cn("text-center", className)}>
      <div role={isError ? "alert" : "status"}>
        {illustration ? (
          <img
            src={illustration}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="mx-auto mb-3 h-28 w-auto max-w-full object-contain"
          />
        ) : isError ? (
          <AlertTriangle className="mx-auto h-7 w-7 text-[color:var(--ui-negative)]" aria-hidden />
        ) : null}
        <h2 className={cn(isError && !illustration && "mt-3", ui.text.section, ui.tone.default)}>
          {title ?? (isError ? t("fpl.error.title") : t("state.empty"))}
        </h2>
        {body ? <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{body}</p> : null}
        {action ??
          (onRetry ? (
            <UiButton variant="ink" className="mt-4" onClick={onRetry}>
              {t("state.retry")}
            </UiButton>
          ) : null)}
      </div>
    </UiCard>
  );
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

export type UiAlertTone = "info" | "positive" | "caution" | "negative";

/**
 * An inline message about the screen you are on — not a state replacement
 * (that is `UiStatePanel`) and not a toast. `negative` announces itself as an
 * alert; the quieter tones are polite status.
 */
export function UiAlert({
  tone = "info",
  title,
  children,
  icon,
  action,
  live,
  role,
  className,
  testId,
}: {
  tone?: UiAlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Replaces the default glyph. Pass `null` for no glyph. */
  icon?: ReactNode;
  action?: ReactNode;
  /**
   * `false` renders the alert with no live region.
   *
   * One alert announcing itself is the point. A LIST of them is not: five
   * alerts is five simultaneous live regions, and a screen reader is handed
   * five interruptions for one screen. A list wants exactly one region on the
   * container — or none, if the list is part of the page rather than news
   * about it — so the items have to be able to opt out.
   */
  live?: boolean;
  /**
   * Overrides the role the tone would pick. `negative` announces as an alert
   * and everything else as a polite status, which is the right default — but
   * a caution that says "the revocation worker has not run" is an alert
   * whatever colour it is, and deriving the role from the colour quietly
   * downgraded two of them.
   */
  role?: "status" | "alert";
  className?: string;
} & UiTestable) {
  const accent =
    tone === "positive"
      ? "var(--ui-positive)"
      : tone === "caution"
        ? "var(--ui-caution)"
        : tone === "negative"
          ? "var(--ui-negative)"
          : "var(--ui-ink-fg)";

  return (
    <div
      role={live === false ? undefined : (role ?? (tone === "negative" ? "alert" : "status"))}
      data-testid={testId}
      className={cn("flex items-start gap-3 p-3", ui.radius.control, className)}
      style={{
        backgroundColor: `color-mix(in oklab, ${accent} 14%, var(--ui-surface))`,
        color: "var(--ui-on-surface)",
      }}
    >
      {icon === null ? null : (
        <span className="mt-0.5 shrink-0" style={{ color: accent }} aria-hidden>
          {icon ??
            (tone === "negative" || tone === "caution" ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Info className="h-5 w-5" />
            ))}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title ? <p className={ui.text.bodyStrong}>{title}</p> : null}
        {children ? (
          <div className={cn(title && "mt-0.5", ui.text.secondary, ui.tone.muted)}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty / error states                                                */
/* ------------------------------------------------------------------ */

type UiStatePanelProps = Parameters<typeof UiStatePanel>[0];

/**
 * `UiStatePanel` under a name that says what it is. A screen should never
 * hand-roll an empty or error block: these two keep the heading size, the
 * body tone and the single retry action identical everywhere.
 */
export function UiEmptyState(props: Omit<UiStatePanelProps, "kind">) {
  return <UiStatePanel kind="empty" {...props} />;
}

export function UiErrorState(props: Omit<UiStatePanelProps, "kind">) {
  return <UiStatePanel kind="error" {...props} />;
}

/* ------------------------------------------------------------------ */
/* Overlays: sheet and modal                                           */
/* ------------------------------------------------------------------ */

function UiScrim() {
  return (
    <Dialog.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-[color:var(--ui-scrim)]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      )}
    />
  );
}

/** The translated round close control both overlays carry. */
function UiOverlayClose({ onSurface = false }: { onSurface?: boolean }) {
  const { t } = useI18n();
  return (
    <Dialog.Close
      aria-label={t("fpl.close")}
      className={cn(
        "grid shrink-0 place-items-center",
        ui.space.tap,
        ui.radius.full,
        ui.focus,
        onSurface
          ? cn(ui.surface.sunken, ui.tone.default)
          : "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_15%,transparent)]",
      )}
    >
      <X className="h-5 w-5" aria-hidden />
    </Dialog.Close>
  );
}

/**
 * Bottom sheet — the player picker, the player action list, any
 * choose-one-thing surface on a phone.
 *
 * It is a real dialog: focus is trapped, Escape closes, the page behind is
 * inert, and the close control is LABELLED IN THE USER'S LANGUAGE. Sheets in
 * this product used to close with a hardcoded English "Close".
 *
 * `title` is required, because a dialog without an accessible name is a
 * defect; pass `titleHidden` when the sheet's own header already shows it.
 *
 * WIDTH. It matches the content column (`max-w-2xl`), which is what
 * `UiScreen width="content"` and `FantasyFrame` both use, so a sheet is exactly
 * as wide as the screen it rises over. It was pinned to `--ui-column-max`
 * (480px) to keep a sheet "thumb-width" once the Fantasy column widened past
 * it. That cap has no effect below 672px — the sheet is already full-bleed on
 * every phone — so the only place it showed was desktop, where thumb reach is
 * not a constraint and a 480px sheet under a 672px screen reads as a mistake.
 * The extra width is also where the picker's price and form columns fit.
 */
export function UiSheet({
  open,
  onOpenChange,
  title,
  titleHidden = false,
  description,
  header,
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  titleHidden?: boolean;
  description?: ReactNode;
  /** Replaces the default ink title bar entirely. */
  header?: ReactNode;
  /** Pinned under the scrolling body, inside the safe area. */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <UiScrim />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden",
            "mx-auto w-full max-w-2xl",
            "rounded-t-[var(--ui-radius-sheet)]",
            ui.surface.overlay,
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "data-[state=open]:duration-[var(--duration-sheet)] data-[state=closed]:duration-[var(--duration-quick)]",
            className,
          )}
        >
          {header ? (
            <>
              {header}
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="sr-only">{description}</Dialog.Description>
              ) : null}
            </>
          ) : (
            <div className={cn("flex items-center gap-3 px-4 py-3", ui.surface.inkPlain)}>
              <div className="min-w-0 flex-1">
                <Dialog.Title
                  className={cn("truncate", ui.text.subtitle, titleHidden && "sr-only")}
                >
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description
                    className={cn("truncate opacity-80", ui.text.meta, titleHidden && "sr-only")}
                  >
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>
              <UiOverlayClose />
            </div>
          )}
          <div className={cn("min-h-0 flex-1 overflow-y-auto", !footer && ui.safe.bottom)}>
            {children}
          </div>
          {footer ? (
            <div className={cn("px-4 pt-3", ui.rule.blockStart, ui.safe.bottom)}>{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Centred modal — confirmations and short forms. Same dialog semantics and
 * the same translated close control as `UiSheet`; use the sheet for anything
 * a thumb scrolls through on a phone.
 */
export function UiModal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <UiScrim />
        <Dialog.Content
          className={cn(
            "fixed inset-0 z-50 m-auto flex h-fit max-h-[88dvh] w-[min(100%-2rem,26rem)] flex-col overflow-hidden",
            "rounded-[var(--ui-radius-sheet)]",
            ui.surface.overlay,
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=open]:duration-[var(--duration-quick)]",
            className,
          )}
        >
          <div className="flex items-start gap-3 px-4 pt-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className={ui.text.section}>{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <UiOverlayClose onSurface />
          </div>
          {children ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
          ) : null}
          {footer ? <div className="flex flex-col gap-2 px-4 pb-4 pt-1">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

function UiFieldFrame({
  id,
  label,
  hint,
  error,
  reserveError,
  children,
  className,
}: {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /**
   * Keep the error line's height whether or not there is an error, and
   * announce it politely when one appears.
   *
   * Without this, a field that validates on submit does two things a restyle
   * is not allowed to do. It says nothing: the message appears silently, so a
   * screen-reader user is told the form failed only by the focus moving. And
   * it jumps: the line is inserted rather than filled, which on a phone
   * pushes the submit button roughly 16px down, out from under the thumb
   * already travelling toward it.
   *
   * The auth forms already do both by hand. Opt-in rather than default so an
   * inline filter field, where a permanently reserved line is dead space,
   * does not pay for a form's behaviour.
   */
  reserveError?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label ? (
        <label htmlFor={id} className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}>
          {label}
        </label>
      ) : null}
      {children}
      {reserveError ? (
        // Always mounted, so the live region exists BEFORE the message does —
        // a region created at the same moment as its content is not reliably
        // announced.
        <p
          id={`${id}-error`}
          role="alert"
          aria-live="polite"
          // One line box of THIS text, not a guessed 16px. The auth forms
          // reserve `min-h-4`, which under-reserves in Arabic: the same 13px
          // runs on a 1.95 leading there against 1.4 in French, so the jump
          // the reservation exists to prevent comes back for Arabic readers.
          className={cn(
            "min-h-[calc(var(--ui-text-meta)*var(--ui-leading-flat))]",
            ui.text.meta,
            ui.tone.negative,
          )}
        >
          {error}
        </p>
      ) : error ? (
        <p id={`${id}-error`} role="alert" className={cn(ui.text.meta, ui.tone.negative)}>
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p id={`${id}-hint`} className={cn(ui.text.meta, ui.tone.muted)}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Compose `aria-describedby` rather than replace it.
 *
 * `{...props}` followed by `aria-describedby={...}` reads like a default and
 * is the opposite: it overwrites whatever the caller passed, and sets it to
 * `undefined` when the field has no error and no hint — actively unlinking a
 * description the screen deliberately attached. The register form describes
 * its password field by BOTH its error and its strength meter; the meter was
 * being dropped, and dropped hardest exactly when the password was rejected.
 */
function describedBy(own: string | undefined, ids: unknown[]): string | undefined {
  return (
    [own, ...ids].filter((v): v is string => typeof v === "string" && v.length > 0).join(" ") ||
    undefined
  );
}

const FIELD_BOX = cn(
  "w-full min-h-[var(--ui-tap-min)] px-3",
  "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)]",
  "border border-[color:var(--ui-rule)]",
  "placeholder:text-[color:var(--ui-on-surface-faint)]",
  "disabled:opacity-50",
);

/**
 * Single-line text field. `label` is rendered and wired with `htmlFor`; if
 * there is genuinely no visible label, pass `aria-label` instead — the field
 * is never left unnamed.
 */
export function UiInput({
  label,
  hint,
  error,
  reserveError,
  trailing,
  leading,
  id,
  className,
  fieldClassName,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Reserve the error line and announce it politely. See `UiFieldFrame`. */
  reserveError?: boolean;
  /**
   * A control that lives INSIDE the field box, on its inline-end edge — the
   * show/hide-password eye, a clear button, a unit.
   *
   * It has to be here rather than composed at the call site: the frame is one
   * flex column holding label, box and error, so an absolutely-positioned
   * child anchored to the frame stretches across all three. Only the input
   * gets the positioning context, and the input takes the padding, so the
   * caret never runs under the control. `end-1` is logical, so it is the
   * right edge in French and the left in Arabic.
   */
  trailing?: ReactNode;
  /**
   * The same slot on the inline-START edge — a magnifier on a search field, a
   * currency mark. Unlike `trailing` this one is decorative far more often
   * than it is a control, so give it `aria-hidden` unless it does something.
   */
  leading?: ReactNode;
  /** Class for the wrapper, so a field can size itself in a grid. */
  className?: string;
  /** Class for the input box itself. */
  fieldClassName?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  const field = (
    <input
      {...props}
      id={fieldId}
      ref={ref}
      aria-invalid={error ? true : props["aria-invalid"]}
      aria-describedby={describedBy(props["aria-describedby"], [
        (error || reserveError) && `${fieldId}-error`,
        !error && hint && `${fieldId}-hint`,
      ])}
      className={cn(
        FIELD_BOX,
        ui.radius.track,
        ui.text.body,
        ui.focus,
        error && "border-[color:var(--ui-negative)]",
        trailing && "pe-11",
        leading && "ps-10",
        fieldClassName,
      )}
    />
  );
  return (
    <UiFieldFrame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      reserveError={reserveError}
      className={className}
    >
      {trailing || leading ? (
        // The wrapper inherits the field's own `dir`. Without it a field
        // forced to `ltr` inside an Arabic page takes its padding from `ltr`
        // while the adornment, positioned on the WRAPPER, takes its edge from
        // the ambient `rtl` — so the control is padded on one side and the
        // eye or the chevron sits on the other.
        <span dir={props.dir} className="relative flex w-full">
          {leading ? (
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center">
              {leading}
            </span>
          ) : null}
          {field}
          {trailing ? (
            <span className="absolute inset-y-0 end-1 flex items-center">{trailing}</span>
          ) : null}
        </span>
      ) : (
        field
      )}
    </UiFieldFrame>
  );
}

/**
 * Dropdown. A native `<select>` on purpose: it is the one control that is
 * already localised, already keyboard- and screen-reader-correct, and that
 * opens as the platform picker on a phone. The chevron is decorative and
 * sits on the inline-end edge, so it mirrors in Arabic.
 */
export function UiSelect({
  label,
  hint,
  error,
  reserveError,
  id,
  options,
  placeholder,
  className,
  fieldClassName,
  children,
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Reserve the error line and announce it politely. See `UiFieldFrame`. */
  reserveError?: boolean;
  /** Convenience for the common case; `children` wins if both are given. */
  options?: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  className?: string;
  fieldClassName?: string;
  ref?: Ref<HTMLSelectElement>;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <UiFieldFrame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      reserveError={reserveError}
      className={className}
    >
      {/* Shares the select's `dir` so the chevron and the `pe-9` that makes
          room for it resolve from the same direction. */}
      <div dir={props.dir} className="relative">
        <select
          {...props}
          id={fieldId}
          ref={ref}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={describedBy(props["aria-describedby"], [
            (error || reserveError) && `${fieldId}-error`,
            !error && hint && `${fieldId}-hint`,
          ])}
          className={cn(
            FIELD_BOX,
            ui.radius.track,
            ui.text.body,
            ui.focus,
            "appearance-none pe-9",
            error && "border-[color:var(--ui-negative)]",
            fieldClassName,
          )}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {children ??
            options?.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
        </select>
        <ChevronDown
          className={cn(
            "pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2",
            ui.tone.muted,
          )}
          aria-hidden
        />
      </div>
    </UiFieldFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

/**
 * Tabular data stays a `<table>`.
 *
 * League standings are read by scanning one column at a time — rank, then
 * total, then movement — and a card grid destroys that. These primitives are
 * deliberately low-level (`UiTable` / `UiTHead` / `UiTBody` / `UiTR` /
 * `UiTH` / `UiTD`) so a screen composes its own columns without inventing a
 * table of its own.
 *
 * Numeric cells take `numeric`, which aligns to the inline-end edge
 * (`text-end`, so it mirrors) and switches on the tabular stat ramp, so
 * digits line up column to column in French and Arabic alike.
 *
 * The wrapper scrolls horizontally rather than letting a wide table push the
 * page sideways; that is the one legitimate `overflow-x-auto` in the kit.
 */
export function UiTable({
  children,
  caption,
  captionHidden = true,
  className,
  tableClassName,
}: {
  children: ReactNode;
  /** Every table needs a name; hidden by default. */
  caption?: ReactNode;
  captionHidden?: boolean;
  className?: string;
  tableClassName?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className={cn("w-full border-collapse", ui.text.meta, tableClassName)}>
        {caption ? (
          <caption className={cn("text-start", captionHidden ? "sr-only" : "px-3 py-2")}>
            {caption}
          </caption>
        ) : null}
        {children}
      </table>
    </div>
  );
}

export function UiTHead({ children, className }: { children: ReactNode; className?: string }) {
  return <thead className={cn(ui.surface.sunken, className)}>{children}</thead>;
}

export function UiTBody({ children, className }: { children: ReactNode; className?: string }) {
  return <tbody className={className}>{children}</tbody>;
}

export function UiTR({
  children,
  highlighted = false,
  onClick,
  className,
}: {
  children: ReactNode;
  /** "This row is you" in a standings table. */
  highlighted?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        ui.rule.block,
        highlighted && "bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_12%,var(--ui-surface))]",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function UiTH({
  children,
  numeric = false,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      {...props}
      className={cn(
        "px-2 py-2 align-middle",
        ui.text.label,
        ui.tone.muted,
        numeric ? "text-end" : "text-start",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function UiTD({
  children,
  numeric = false,
  strong = false,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; strong?: boolean }) {
  return (
    <td
      {...props}
      className={cn(
        "px-2 py-2 align-middle",
        numeric ? cn("text-end", ui.stat.sm) : "text-start",
        strong && "[font-weight:var(--ui-weight-heavy)]",
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * Rank movement: up, down or unchanged. A glyph AND an accessible name,
 * because colour alone is not a difference a reader can rely on.
 *
 * `variant="quiet"` is the Option A table cell: a small ▲/▼ and the number
 * of places moved, in the positive/negative text colour, on the tabular stat
 * ramp so the column lines up; "=" when unchanged. The name is sr-only text
 * beside the glyph, so it is read with the number ("up 4").
 */
export function UiRankMovement({
  rank,
  previousRank,
  labels,
  variant = "disc",
  formatDelta = String,
  className,
}: {
  rank: number;
  previousRank: number | null;
  /** Accessible names for the three outcomes. */
  labels: { up: string; down: string; same: string };
  variant?: "disc" | "quiet";
  /** How the quiet variant writes the number of places (e.g. a locale grouping). */
  formatDelta?: (places: number) => string;
  className?: string;
}) {
  if (variant === "quiet") {
    const delta = previousRank === null ? 0 : previousRank - rank;
    if (delta === 0) {
      return (
        <span className={cn(ui.stat.sm, ui.tone.muted, className)}>
          <span aria-hidden>=</span>
          <span className="sr-only">{labels.same}</span>
        </span>
      );
    }
    const up = delta > 0;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1",
          ui.stat.sm,
          up ? ui.tone.positive : ui.tone.negative,
          className,
        )}
      >
        <span aria-hidden className="text-[length:0.75em]">
          {up ? "▲" : "▼"}
        </span>
        <span className="sr-only">{up ? labels.up : labels.down}</span>
        <bdi>{formatDelta(Math.abs(delta))}</bdi>
      </span>
    );
  }
  if (previousRank === null || previousRank === rank) {
    return (
      <span
        aria-label={labels.same}
        className={cn("inline-block w-5 text-center", ui.tone.muted, className)}
      >
        —
      </span>
    );
  }
  const up = rank < previousRank;
  return (
    <span
      aria-label={up ? labels.up : labels.down}
      className={cn(
        "inline-grid h-5 w-5 place-items-center",
        ui.radius.full,
        ui.text.micro,
        "[font-weight:var(--ui-weight-hero)] text-[color:var(--ui-on-ink-plain)]",
        className,
      )}
      style={{ backgroundColor: up ? "var(--ui-positive)" : "var(--ui-negative)" }}
    >
      {up ? "▲" : "▼"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export type UiStatSize = "sm" | "md" | "lg" | "hero";

/**
 * A number and what it means. The number uses the stat ramp — tabular
 * figures, its own weight and an `ltr:`-only tightening — so a row of
 * StatBlocks lines up and a column of them reads as a table of figures.
 *
 * THE LABEL WRAPS, AND IT IS BOUNDED. Both halves of that matter, and the
 * second was the bug. This is a `flex-col` box, usually `items-center`, so a
 * child with `white-space: nowrap` and no `max-width` sizes itself to its own
 * text and simply grows past the tile. `truncate` on such a child is INERT —
 * `scrollWidth === clientWidth`, because the box already fits the content it
 * was asked to clip — so the ellipsis never appears and the label spills over
 * its neighbours instead. Measured on /fantasy/rankings at 390px: a 103.3px
 * tile carrying a 140.4px label, "Classement général" starting 2.5px outside
 * the card and overlapping "Points totaux" by 8.4px.
 *
 * `max-w-full` supplies the bound. With it the label could truncate — but
 * these labels are fixed product vocabulary ("Classement général", "Points de
 * la journée", "Passes décisives"), and an ellipsis on those destroys the
 * meaning the figure depends on. So it wraps instead, which the grid absorbs:
 * rows stretch, so a two-line label just makes every tile in the row taller
 * together. Same call BG-0111 made on the Home tiles — accommodate the longest
 * label rather than shorten it.
 *
 * `sub` keeps `truncate`, now also bounded so it actually fires: it is a
 * supplementary line, where an ellipsis loses nothing the reader needs.
 */
export function UiStatBlock({
  value,
  label,
  sub,
  size = "md",
  tone = "default",
  align = "start",
  className,
}: {
  value: ReactNode;
  label?: ReactNode;
  sub?: ReactNode;
  size?: UiStatSize;
  tone?: "default" | "ink" | "positive" | "negative" | "onInk";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        align === "center" && "items-center text-center",
        align === "end" && "items-end text-end",
        align === "start" && "items-start text-start",
        className,
      )}
    >
      {label ? (
        <span className={cn("max-w-full text-balance", ui.text.label, ui.tone.muted)}>{label}</span>
      ) : null}
      <span
        className={cn(
          ui.stat[size],
          tone === "default" && ui.tone.default,
          tone === "ink" && ui.tone.ink,
          tone === "positive" && ui.tone.positive,
          tone === "negative" && ui.tone.negative,
          tone === "onInk" && ui.tone.onInk,
        )}
      >
        {value}
      </span>
      {sub ? (
        <span className={cn("max-w-full truncate", ui.text.micro, ui.tone.muted)}>{sub}</span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Player units                                                        */
/* ------------------------------------------------------------------ */

/**
 * `PlayerPlate` — the pitch's core unit: a shirt (or any visual you pass),
 * a name band and a sub band carrying price, fixture or points.
 *
 * Option A inverts the bands: the name sits on the SURFACE (white, heavy)
 * and the figure on `--ui-plate-figure` (ink-deep in light) with plain white
 * text, one rounded plate with the card shadow, so it reads on the pastel
 * turf. The figure band has its own token because ink-deep in dark is the
 * dark surface's lightness, and the two bands merged there.
 *
 * It renders as a `<button>` when `onClick` is given and as a plain block
 * otherwise, so an empty slot is not a fake control. `state` tints the sub
 * plate: `doubtful` amber, `selected` the action gradient, `out` dimmed.
 */
export function UiPlayerPlate({
  name,
  visual,
  sub,
  badge,
  flag,
  state = "default",
  onClick,
  ariaLabel,
  className,
}: {
  name: ReactNode;
  /** The shirt/crest/avatar. Any node; the kit does not own kit artwork. */
  visual?: ReactNode;
  /** Sub plate: price ("5.7"), fixture ("WAC (D)") or points ("8"). */
  sub?: ReactNode;
  /** Top inline-end corner: captain / vice marker. */
  badge?: ReactNode;
  /** Top inline-start corner: availability warning, remove control. */
  flag?: ReactNode;
  state?: "default" | "selected" | "doubtful" | "out";
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  const Tag: ElementType = onClick ? "button" : "div";
  return (
    <div className={cn("relative flex w-full flex-col items-center", className)}>
      {flag ? <span className="absolute -start-0.5 top-0 z-10">{flag}</span> : null}
      {badge ? <span className="absolute -end-0.5 top-0 z-10">{badge}</span> : null}
      <Tag
        type={onClick ? "button" : undefined}
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
          "flex w-full flex-col items-center",
          ui.radius.tight,
          // The plate clears 44px through its content today (the smallest
          // case, a 40px jersey over two micro bands, measures ~79px), but
          // inherited is not guaranteed. When it IS a control, state it.
          onClick && cn("cursor-pointer", ui.space.tap, ui.focus),
          state === "out" && "opacity-45",
        )}
      >
        {visual ? <span className="relative block">{visual}</span> : null}
        <span
          className={cn(
            "block w-full overflow-hidden",
            ui.radius.segment,
            "shadow-[var(--ui-shadow-card)]",
          )}
        >
          <span
            className={cn(
              "block w-full truncate px-1 py-0.5 text-center",
              "bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)]",
              ui.text.micro,
              "[font-weight:var(--ui-weight-heavy)]",
            )}
          >
            {name}
          </span>
          <span
            className={cn(
              "block w-full truncate px-1 py-0.5 text-center",
              ui.text.micro,
              // This band carries points, price OR a fixture code, and on a
              // pitch there are eleven of them stacked down the screen — figures
              // a reader scans as a column even though nothing draws one. It was
              // the only numeric surface in the product still proportional
              // (measured: 7 non-tabular figures on /fantasy/points, 0 anywhere
              // else). Harmless on the fixture variant: tabular-nums only
              // affects digits, so "FUS (D)" is unchanged.
              ui.text.tabular,
              "[font-weight:var(--ui-weight-strong)]",
              state === "doubtful" || state === "selected"
                ? "text-[color:var(--ui-ink-deep)]"
                : "bg-[color:var(--ui-plate-figure)] text-[color:var(--ui-on-ink-plain)]",
            )}
            style={
              state === "doubtful"
                ? { backgroundColor: "var(--ui-caution)" }
                : state === "selected"
                  ? { backgroundImage: "var(--ui-grad-action)" }
                  : undefined
            }
          >
            {sub}
          </span>
        </span>
      </Tag>
    </div>
  );
}

/**
 * `PlayerRow` — the list/picker unit: visual, name over club + position,
 * then up to three numeric columns on the inline-end edge.
 *
 * The numeric columns are `ui.stat.sm`, so a picker list scans like a table
 * even though each row is a control.
 */
export function UiPlayerRow({
  name,
  meta,
  visual,
  stats,
  trailing,
  selected = false,
  disabled = false,
  onClick,
  className,
}: {
  name: ReactNode;
  /** Club · position line under the name. */
  meta?: ReactNode;
  visual?: ReactNode;
  /** Inline-end figures: price, points, form. Rendered in order. */
  stats?: ReadonlyArray<{ key: string; value: ReactNode; label?: ReactNode }>;
  trailing?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Tag: ElementType = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-pressed={onClick ? selected : undefined}
      className={cn(
        "flex w-full items-center gap-3 px-3 text-start",
        ui.space.row,
        ui.rule.block,
        onClick && ui.focus,
        selected && "bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_12%,var(--ui-surface))]",
        disabled && "opacity-45",
        className,
      )}
    >
      {visual ? <span className="shrink-0">{visual}</span> : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn("block truncate", ui.text.body, "[font-weight:var(--ui-weight-heavy)]")}
        >
          {name}
        </span>
        {meta ? (
          <span className={cn("block truncate", ui.text.meta, ui.tone.muted)}>{meta}</span>
        ) : null}
      </span>
      {stats?.map((stat) => (
        <span key={stat.key} className="shrink-0">
          <UiStatBlock value={stat.value} label={stat.label} size="sm" align="end" />
        </span>
      ))}
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* Pitch                                                               */
/* ------------------------------------------------------------------ */

/**
 * `PitchSurface` — the turf, the markings and the slot geometry, and
 * nothing else. It takes rows of already-rendered nodes (normally
 * `UiPlayerPlate`) and an optional bench strip; it knows nothing about
 * formations, squad rules or who may be substituted.
 *
 * The mowing bands run `to bottom` and the markings are drawn from
 * `--ui-pitch-line`, so the pitch is direction-neutral and themed: a row
 * only reorders its peers under `dir="rtl"`.
 *
 * Option A turf: a `to bottom` wash from `--ui-pitch-turf-a` (spring) to
 * `--ui-pitch-turf-b` (sky), both pastel mixes of the action gradient, under
 * 36px bands of the on-ink foreground at 22%. The bench is a plain surface
 * strip (`--ui-pitch-bench`) with muted uppercase position labels.
 */
export function UiPitchSurface({
  rows,
  bench,
  benchLabels,
  benchHighlighted = false,
  className,
}: {
  /** GK → DEF → MID → FWD, each a list of slot nodes. */
  rows: ReadonlyArray<ReadonlyArray<ReactNode>>;
  bench?: ReadonlyArray<ReactNode>;
  benchLabels?: ReadonlyArray<string>;
  /** Bench Boost active: the strip gets the accent outline. */
  benchHighlighted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div
        className="relative overflow-hidden"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, color-mix(in srgb, var(--ui-on-ink-plain) 22%, transparent) 0 36px, transparent 36px 72px), linear-gradient(to bottom, var(--ui-pitch-turf-a), var(--ui-pitch-turf-b))",
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 100 150"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <g fill="none" stroke="var(--ui-pitch-line)" strokeWidth="0.6">
            <rect x="3" y="0" width="94" height="150" />
            <rect x="20" y="0" width="60" height="20" />
            <rect x="35" y="0" width="30" height="7" />
            <path d="M 38 20 A 12 12 0 0 0 62 20" />
            <circle cx="50" cy="150" r="14" />
            <circle cx="50" cy="150" r="1" fill="var(--ui-pitch-line)" />
          </g>
          <rect x="41" y="-1" width="18" height="4" fill="var(--ui-pitch-line)" />
        </svg>

        <div className="relative flex flex-col gap-3 px-1 pb-4 pt-3">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex items-start justify-evenly gap-1">
              {row.map((slot, slotIndex) => (
                <div key={slotIndex} className="min-w-0 shrink grow-0 basis-[76px] sm:basis-[84px]">
                  {slot}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {bench && bench.length > 0 ? (
        <div
          className={cn(
            "relative px-2 pb-3 pt-2",
            benchHighlighted &&
              "outline outline-2 -outline-offset-2 outline-[color:var(--ui-accent-sky)]",
          )}
          style={{ background: "var(--ui-pitch-bench)" }}
        >
          {benchLabels ? (
            <div className="mb-1 flex items-start justify-evenly gap-1">
              {benchLabels.map((label, index) => (
                <div
                  key={index}
                  className={cn(
                    "w-[76px] shrink-0 text-center sm:w-[84px]",
                    ui.text.label,
                    ui.tone.muted,
                  )}
                >
                  {label}
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-start justify-evenly gap-1">
            {bench.map((slot, index) => (
              <div key={index} className="w-[76px] shrink-0 sm:w-[84px]">
                {slot}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fixture difficulty                                                  */
/* ------------------------------------------------------------------ */

export type UiDifficulty = 1 | 2 | 3 | 4 | 5;

const FDR_STYLE: Record<UiDifficulty, { backgroundColor: string; color: string }> = {
  1: { backgroundColor: "var(--ui-fdr-1)", color: "var(--ui-on-fdr-1)" },
  2: { backgroundColor: "var(--ui-fdr-2)", color: "var(--ui-on-fdr-2)" },
  3: { backgroundColor: "var(--ui-fdr-3)", color: "var(--ui-on-fdr-3)" },
  4: { backgroundColor: "var(--ui-fdr-4)", color: "var(--ui-on-fdr-4)" },
  5: { backgroundColor: "var(--ui-fdr-5)", color: "var(--ui-on-fdr-5)" },
};

/**
 * Fixture Difficulty Rating square, 1 easiest → 5 hardest. Each step has
 * both a fill (`--ui-fdr-N`) and the foreground that clears AA on it
 * (`--ui-on-fdr-N`) in both themes, so no screen has to reach for a literal
 * white again.
 */
export function UiDifficultyCell({
  difficulty,
  children,
  title,
  className,
}: {
  difficulty: UiDifficulty;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div
      title={title}
      className={cn(
        "grid min-h-[var(--ui-tap-min)] place-items-center px-1.5 text-center",
        ui.radius.tight,
        ui.text.micro,
        // An FDR square usually holds a number. `ui.text.micro` carries no
        // tabular figures, so a column of them did not line up — the one
        // figure left in Fantasy that was not on the tabular rail. Harmless
        // for the club-token labels beside them: tabular-nums touches digits
        // only.
        ui.text.tabular,
        "[font-weight:var(--ui-weight-hero)]",
        className,
      )}
      style={FDR_STYLE[difficulty]}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

/**
 * A dropdown menu, on the kit.
 *
 * Three surfaces reached for `@/components/ui/dropdown-menu` because the
 * barrel had nothing: the language switcher and both Fantasy navs. That
 * component is the V1 palette (`bg-popover`, `border`, `shadow-md`), an
 * off-scale `rounded-md`, and — the part that matters — `py-1.5 text-sm`
 * items, which is roughly a 32px row against a 44px floor. Rule 5 has no
 * exception for a menu.
 *
 * Radix directly rather than through that component, so the item height is a
 * token rather than something a call site has to remember to override.
 * `dir` is passed through because a menu that opens from an `end`-aligned
 * trigger has to know which edge that is.
 */
export function UiMenu({
  trigger,
  children,
  align = "end",
  label,
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  /** Accessible name for the menu itself, when the trigger's is not enough. */
  label?: string;
  className?: string;
}) {
  const { dir } = useI18n();
  return (
    <Menu.Root dir={dir}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align={align}
          sideOffset={6}
          aria-label={label}
          className={cn(
            "z-50 min-w-[9rem] overflow-hidden p-1",
            ui.surface.overlay,
            ui.radius.track,
            "shadow-[var(--ui-shadow-overlay)]",
            ui.rule.all,
            className,
          )}
        >
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * One row of a `UiMenu`. `selected` marks the current choice and is announced
 * — a bullet glyph alone says nothing to a screen reader.
 */
export function UiMenuItem({
  children,
  onSelect,
  selected,
  disabled,
  asChild,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  selected?: boolean;
  disabled?: boolean;
  /**
   * Render the child as the item instead of wrapping it.
   *
   * A menu of navigation entries has to be a menu of links — a `<button>` that
   * calls `navigate()` is not a link, and loses the href, the middle-click and
   * the copy-link. Without this the Fantasy "More" menu could not move off the
   * V1 dropdown, whose items are `py-1.5 text-sm`: a ~32px row against a 44px
   * floor.
   */
  asChild?: boolean;
  className?: string;
}) {
  return (
    <Menu.Item
      asChild={asChild}
      disabled={disabled}
      onSelect={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full cursor-pointer select-none items-center justify-between gap-3 px-3 outline-none",
        ui.space.row,
        ui.radius.control,
        ui.text.body,
        ui.tone.default,
        "data-[highlighted]:bg-[color:var(--ui-surface-sunken)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        selected && ui.tone.ink,
        className,
      )}
    >
      {asChild ? (
        children
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{children}</span>
          {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
        </>
      )}
    </Menu.Item>
  );
}

/* ------------------------------------------------------------------ */
/* Checkbox                                                            */
/* ------------------------------------------------------------------ */

/**
 * An independent boolean, on the kit.
 *
 * A native `<input type="checkbox">` on purpose, for the same reasons
 * `UiSelect` stays a native `<select>`: it is already keyboard- and
 * screen-reader-correct, it works inside a wrapping `<label>`, and a wrapping
 * label is what lets the consent row put links in its own text without
 * stealing the click.
 *
 * What was NOT free, and is what this primitive is for. Three screens drew a
 * 16px box — a quarter of the 44px floor. The label around it rescues the
 * click, but the box is still the target a reader aims at, so the hit area
 * grows behind it while the ink stays 16px. The checked plate painted in the
 * browser's own accent, which is not a colour this product chose; it is
 * `--ui-ink` now. And one of the three carried no focus ring at all — on the
 * acknowledgement that unlocks deleting an account.
 */
export function UiCheckbox({
  label,
  hint,
  className,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** The row's text. Pass a node when it carries links. */
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const generated = useId();
  const id = props.id ?? generated;
  return (
    // The hint is a SIBLING of the label, not inside it. Wrapping both in one
    // `<label>` puts the hint in the control's accessible NAME, and the
    // `aria-describedby` below puts it in the description too — so a screen
    // reader reads the same sentence twice for every row. Name from the
    // label, description from the hint, each said once.
    <div className={cn("flex items-start gap-3 py-1", ui.text.secondary, className)}>
      <input
        {...props}
        id={id}
        ref={ref}
        type="checkbox"
        aria-describedby={describedBy(props["aria-describedby"], [hint && `${id}-hint`])}
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--ui-ink)]",
          ui.radius.tight,
          ui.hitArea,
          ui.focus,
        )}
      />
      <span className="min-w-0">
        <label htmlFor={id} className={cn("block cursor-pointer", ui.tone.default)}>
          {label}
        </label>
        {hint ? (
          <span id={`${id}-hint`} className={cn("mt-0.5 block", ui.text.meta, ui.tone.muted)}>
            {hint}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Multi-line text field.
 *
 * `UiInput`'s frame with a `<textarea>` in the box, because four writing
 * surfaces in the editorial console were spelling out the field recipe by
 * hand — a fifth copy of something the kit already owns, and each copy one
 * more place for the border, the radius or the focus ring to drift.
 *
 * No `trailing` slot: a control pinned to the inline-end edge of a fourteen-
 * row writing surface has nothing sensible to align to.
 */
export function UiTextarea({
  label,
  hint,
  error,
  reserveError,
  id,
  className,
  fieldClassName,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Reserve the error line and announce it politely. See `UiFieldFrame`. */
  reserveError?: boolean;
  className?: string;
  fieldClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <UiFieldFrame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      reserveError={reserveError}
      className={className}
    >
      <textarea
        {...props}
        id={fieldId}
        ref={ref}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={describedBy(props["aria-describedby"], [
          (error || reserveError) && `${fieldId}-error`,
          !error && hint && `${fieldId}-hint`,
        ])}
        className={cn(
          FIELD_BOX,
          "resize-y py-3",
          ui.radius.track,
          ui.text.body,
          ui.focus,
          error && "border-[color:var(--ui-negative)]",
          fieldClassName,
        )}
      />
    </UiFieldFrame>
  );
}
