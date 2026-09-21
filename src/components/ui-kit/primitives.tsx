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
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, ChevronLeft, Info, Loader2, X } from "lucide-react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ElementType,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { useId } from "react";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { ui } from "./tokens";

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
 * The Fantasy header pattern, generalised: a full-bleed band carrying
 * `[back] — centered title — [trailing]` on a 1fr/auto/1fr grid, with an
 * optional band underneath for a subtitle, tabs or filters.
 *
 * Three tones: `gradient` (the cyan→indigo hero band), `ink` (solid brand)
 * and `surface` (opaque, hairline-ruled — for content pages that should not
 * shout).
 */
export function UiHeader({
  title,
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
  title: ReactNode;
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
  const { t } = useI18n();
  const router = useRouter();

  const backLabel = (
    <span className={cn("inline-flex items-center gap-0.5", ui.text.body)}>
      <ChevronLeft className="h-5 w-5" aria-hidden />
      {t("fpl.back")}
    </span>
  );
  const backControlClass = cn(
    "inline-flex items-center -ms-1 pe-2",
    ui.space.tap,
    ui.radius.control,
    ui.focus,
  );

  const leadingNode = leading ? (
    leading
  ) : backTo ? (
    <Link to={backTo} className={backControlClass}>
      {backLabel}
    </Link>
  ) : onBack || showBack ? (
    <button
      type="button"
      onClick={onBack ?? (() => router.history.back())}
      className={backControlClass}
    >
      {backLabel}
    </button>
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
      <div className="grid min-h-[var(--ui-tap-min)] grid-cols-[1fr_auto_1fr] items-center">
        <div className="justify-self-start">{leadingNode}</div>
        <h1
          className={cn(
            "truncate px-2 text-center",
            leadingNode && trailing ? ui.text.subtitle : ui.text.title,
          )}
        >
          {title}
        </h1>
        <div className="justify-self-end">{trailing}</div>
      </div>
      {children}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

/**
 * The Fantasy card: an opaque surface, 6px radius, one small shadow, no
 * border and no glass. `interactive` adds the press feedback used on tappable
 * tiles.
 */
export function UiCard({
  children,
  as: Tag = "div",
  padding = "md",
  interactive = false,
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  className?: string;
}) {
  return (
    <Tag
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

export type UiButtonVariant = "gradient" | "ink" | "light" | "outline" | "ghost";
export type UiButtonSize = "sm" | "md";

function buttonClass(variant: UiButtonVariant, size: UiButtonSize, className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2",
    ui.radius.control,
    ui.focus,
    size === "md"
      ? cn("min-h-[var(--ui-row-min)] w-full px-4", ui.text.bodyStrong)
      : cn("min-h-[var(--ui-tap-min)] px-3", ui.text.meta, "[font-weight:var(--ui-weight-heavy)]"),
    "transition-[filter,opacity] disabled:cursor-not-allowed",
    variant === "gradient" && "text-[color:var(--ui-ink-deep)] disabled:opacity-45",
    variant === "ink" &&
      "bg-[color:var(--ui-ink)] text-[color:var(--ui-on-ink-plain)] disabled:bg-[color:var(--ui-surface-sunken)] disabled:text-[color:var(--ui-on-surface-muted)]",
    // BG-0083: these three read as text on a surface, so they take the
    // theme-correct foreground, not the ink fill.
    variant === "light" &&
      "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)] shadow-[var(--ui-shadow-card)] disabled:opacity-50",
    variant === "outline" &&
      "border border-current bg-transparent text-[color:var(--ui-ink-fg)] disabled:opacity-50",
    variant === "ghost" && "bg-transparent text-[color:var(--ui-ink-fg)] disabled:opacity-50",
    className,
  );
}

export function UiButton({
  variant = "gradient",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: UiButtonVariant;
  size?: UiButtonSize;
}) {
  return (
    <button
      type="button"
      {...props}
      className={buttonClass(variant, size, className)}
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
  className,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  variant?: UiButtonVariant;
  size?: UiButtonSize;
}) {
  return (
    <Link
      to={to}
      params={params}
      search={search}
      {...props}
      className={buttonClass(variant, size, className)}
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
 */
export function UiSegmented<T extends string>({
  value,
  onChange,
  options,
  tone = "onSurface",
  size = "md",
  className,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; disabled?: boolean }>;
  /** `onGradient` for a control sitting inside a gradient header band. */
  tone?: "onSurface" | "onGradient";
  size?: UiSegmentedSize;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "grid p-[3px]",
        ui.radius.track,
        tone === "onGradient"
          ? "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_35%,transparent)]"
          : ui.surface.sunken,
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
              ui.radius.segment,
              size === "md"
                ? cn("min-h-[var(--ui-tap-min)]", ui.text.meta)
                : cn("min-h-[var(--ui-row-min)]", ui.text.body),
              "[font-weight:var(--ui-weight-strong)]",
              ui.focus,
              active
                ? "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)] shadow-[var(--ui-shadow-card)]"
                : tone === "onGradient"
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

/* ------------------------------------------------------------------ */
/* Pills, chips and badges                                             */
/* ------------------------------------------------------------------ */

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
        "inline-flex items-center px-3 py-1",
        ui.radius.control,
        ui.text.secondary,
        "[font-weight:var(--ui-weight-heavy)]",
        tone === "ink" && ui.surface.ink,
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
        "inline-flex min-h-[var(--ui-tap-min)] shrink-0 items-center px-3 py-1.5",
        ui.radius.control,
        ui.text.meta,
        "[font-weight:var(--ui-weight-strong)]",
        ui.focus,
        "transition-colors",
        selected
          ? cn(ui.surface.ink, "shadow-[var(--ui-shadow-card)]")
          : cn(ui.surface.sunken, ui.tone.muted),
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
  tone?: "neutral" | "action" | "positive" | "negative";
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
        tone === "action" && "text-[color:var(--ui-ink-deep)]",
        tone === "positive" &&
          "bg-[color:color-mix(in_oklab,var(--ui-positive)_20%,transparent)] text-[color:var(--ui-positive)]",
        tone === "negative" &&
          "bg-[color:color-mix(in_oklab,var(--ui-negative)_18%,transparent)] text-[color:var(--ui-negative)]",
        className,
      )}
      style={tone === "action" ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
    >
      {children}
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

export function UiSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
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
  className,
}: {
  kind: "loading" | "empty" | "error";
  title?: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useI18n();

  if (kind === "loading") {
    return (
      <div role="status" aria-label={t("state.loading")} className={cn("py-6", className)}>
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
    <UiCard padding="lg" className={cn("text-center", className)}>
      <div role={isError ? "alert" : "status"}>
        {isError ? (
          <AlertTriangle className="mx-auto h-7 w-7 text-[color:var(--ui-negative)]" aria-hidden />
        ) : null}
        <h2 className={cn(isError && "mt-3", ui.text.section, ui.tone.default)}>
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
  className,
}: {
  tone?: UiAlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Replaces the default glyph. Pass `null` for no glyph. */
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
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
      role={tone === "negative" ? "alert" : "status"}
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
            "mx-auto w-full max-w-[var(--ui-column-max)]",
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
  children,
  className,
}: {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
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
      {error ? (
        <p id={`${id}-error`} className={cn(ui.text.meta, ui.tone.negative)}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={cn(ui.text.meta, ui.tone.muted)}>
          {hint}
        </p>
      ) : null}
    </div>
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
  id,
  className,
  fieldClassName,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Class for the wrapper, so a field can size itself in a grid. */
  className?: string;
  /** Class for the input box itself. */
  fieldClassName?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <UiFieldFrame id={fieldId} label={label} hint={hint} error={error} className={className}>
      <input
        {...props}
        id={fieldId}
        ref={ref}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          FIELD_BOX,
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
    <UiFieldFrame id={fieldId} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <select
          {...props}
          id={fieldId}
          ref={ref}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
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
 */
export function UiRankMovement({
  rank,
  previousRank,
  labels,
  className,
}: {
  rank: number;
  previousRank: number | null;
  /** Accessible names for the three outcomes. */
  labels: { up: string; down: string; same: string };
  className?: string;
}) {
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
      {label ? <span className={cn("truncate", ui.text.label, ui.tone.muted)}>{label}</span> : null}
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
      {sub ? <span className={cn("truncate", ui.text.micro, ui.tone.muted)}>{sub}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Player units                                                        */
/* ------------------------------------------------------------------ */

/**
 * `PlayerPlate` — the pitch's core unit: a shirt (or any visual you pass),
 * an ink name plate and a sub plate carrying price, fixture or points.
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
          onClick && cn("cursor-pointer", ui.focus),
          state === "out" && "opacity-45",
        )}
      >
        {visual ? <span className="relative block">{visual}</span> : null}
        <span
          className={cn(
            "block w-full truncate rounded-t-[var(--ui-radius-tight)] px-1 py-0.5 text-center",
            ui.surface.inkPlain,
            ui.text.micro,
            "[font-weight:var(--ui-weight-heavy)]",
          )}
        >
          {name}
        </span>
        <span
          className={cn(
            "block w-full truncate rounded-b-[var(--ui-radius-tight)] px-1 py-0.5 text-center",
            ui.text.micro,
            "[font-weight:var(--ui-weight-strong)]",
            state === "doubtful" || state === "selected"
              ? "text-[color:var(--ui-ink-deep)]"
              : cn(ui.surface.card, "rounded-t-none shadow-none"),
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
          background:
            "repeating-linear-gradient(to bottom, var(--ui-pitch-turf-a) 0 60px, var(--ui-pitch-turf-b) 60px 120px)",
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
                    ui.text.micro,
                    "[font-weight:var(--ui-weight-strong)] text-[color:var(--ui-on-pitch)]",
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
        "grid min-h-[var(--ui-tap-min)] place-items-center px-1.5 text-center leading-tight",
        ui.radius.tight,
        ui.text.micro,
        "[font-weight:var(--ui-weight-hero)]",
        className,
      )}
      style={FDR_STYLE[difficulty]}
    >
      {children}
    </div>
  );
}
