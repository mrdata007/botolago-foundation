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
 *     so light and dark both work.
 */

import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, ChevronLeft, Loader2 } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ElementType, ReactNode } from "react";

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
        tone === "gradient" && "text-[color:var(--ui-ink-deep)]",
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
    variant === "light" &&
      "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink)] shadow-[var(--ui-shadow-card)] disabled:opacity-50",
    variant === "outline" &&
      "border border-current bg-transparent text-[color:var(--ui-ink)] disabled:opacity-50",
    variant === "ghost" && "bg-transparent text-[color:var(--ui-ink)] disabled:opacity-50",
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

export function UiSegmented<T extends string>({
  value,
  onChange,
  options,
  tone = "onSurface",
  className,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; disabled?: boolean }>;
  /** `onGradient` for a control sitting inside a gradient header band. */
  tone?: "onSurface" | "onGradient";
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
              "min-h-10 truncate px-3 transition-colors disabled:opacity-50",
              ui.radius.segment,
              ui.text.body,
              "[font-weight:var(--ui-weight-strong)]",
              ui.focus,
              active
                ? "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink)] shadow-[var(--ui-shadow-card)]"
                : tone === "onGradient"
                  ? "text-[color:var(--ui-ink-deep)]"
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

/** A selectable filter chip — the shared replacement for ad-hoc chip rows. */
export function UiChip({
  children,
  selected = false,
  onClick,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center px-3 py-1.5",
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
