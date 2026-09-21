/**
 * Fantasy chrome — now a thin adapter over the shared UI kit.
 *
 * Fifteen Fantasy routes and four Fantasy components import these names, so
 * the exported API is deliberately unchanged: same components, same props,
 * same semantics. What changed is the inside. Every one of them used to
 * spell its own colours, sizes and radii from the light-only `--fpl-*`
 * palette; each now composes `@/components/ui-kit`, so the whole Fantasy
 * section picks up the themed tokens, the 44px tap floor and the one focus
 * ring at once — including the screens other lanes have not converted yet.
 *
 * Three defects are fixed here rather than at 200 call sites:
 *
 *   - BG-0083: the header title, the deadline line, the segmented labels and
 *     the pills took `--fpl-ink` (a FILL, dark navy in both themes) as their
 *     text colour. On the gradient band that is `--ui-on-grad-header`; on a
 *     surface it is `--ui-ink-fg` (`ui.tone.ink`).
 *   - literal `bg-white` / `text-white`: the alias layer themes tokens, not
 *     literals, so these rendered 1.09:1 on a dark card. They are now
 *     `ui.surface.card` / `ui.tone.onInkPlain`.
 *   - `FplRankMovement` announced a hardcoded English "up" / "down". The
 *     glyph is colour-only otherwise, so the accessible name is the whole
 *     signal for a screen-reader user; it is translated now.
 *
 * `FplDeadlineLine` formats with `MATCH_TIME_ZONE`, not a literal zone
 * string, so it cannot drift from the fixture cards beside it (BG-0100).
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

import {
  ui,
  UiBadge,
  UiBanner,
  UiButton,
  UiHeader,
  UiKeyValueRow,
  UiLinkButton,
  UiPill,
  UiRankMovement,
  UiSegmented,
  type UiButtonVariant,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Header: "‹ Back   Title   [right]" on the cyan→blue gradient.       */
/* ------------------------------------------------------------------ */

export function FplHeader({
  title,
  backTo,
  onBack,
  left,
  right,
  children,
  className,
  variant = "gradient",
}: {
  title: ReactNode;
  /** Router destination for the Back control. */
  backTo?: string;
  onBack?: () => void;
  /** Replaces the Back control entirely (e.g. the "✕ Cancel" pill while confirming). */
  left?: ReactNode;
  right?: ReactNode;
  /** Content rendered inside the gradient under the title row (deadline line, tabs…). */
  children?: ReactNode;
  className?: string;
  variant?: "gradient" | "ink";
}) {
  return (
    <UiHeader
      title={title}
      backTo={backTo}
      onBack={onBack}
      // The Fantasy header has always offered Back even with no explicit
      // destination, falling through to router history. `UiHeader` does the
      // same when asked, so only an explicit `left` suppresses it.
      showBack={!left && !backTo && !onBack}
      leading={left}
      trailing={right}
      tone={variant}
      className={className}
    >
      {children}
    </UiHeader>
  );
}

/** "Gameweek 21 Deadline: 13 Jan 2024 at 19:00" line under the header title. */
export function FplDeadlineLine({
  gameweek,
  deadlineIso,
}: {
  gameweek: number;
  deadlineIso: string;
}) {
  const { t, lang } = useI18n();
  const date = new Date(deadlineIso);
  const formatted = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // The deadline belongs to the competition, not to the viewer's browser.
    timeZone: MATCH_TIME_ZONE,
  }).format(date);
  return (
    <p className={cn("mt-1 text-center", ui.text.secondary, ui.tone.onGradHeader)}>
      {t("fpl.gameweek")} {gameweek} {t("fpl.deadline")}:{" "}
      <strong className="[font-weight:var(--ui-weight-heavy)]">{formatted}</strong>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control ("Squad | List", "League | Cup").                 */
/* ------------------------------------------------------------------ */

/**
 * `tone="onGradient"` has a known idle-tab contrast failure in dark: the
 * track is a fixed `color-mix` that cannot serve a foreground which flips
 * between near-black and near-white, so the idle label measured 4.44:1 here
 * (4.28/4.38:1 as measured by the pitch lane). That is a kit defect and the
 * kit lane is fixing it at source in `UiSegmented`; deliberately NOT worked
 * around locally, because a one-off colour here would only move the problem
 * and would diverge from the other `UiSegmented` call sites. See the kit
 * request in the BG-0092 implementation report.
 */
export function FplSegmented<T extends string>({
  value,
  onChange,
  options,
  className,
  tone = "onGradient",
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: ReactNode; disabled?: boolean }>;
  className?: string;
  tone?: "onGradient" | "onLight";
}) {
  return (
    <UiSegmented
      value={value}
      onChange={onChange}
      options={options}
      tone={tone === "onGradient" ? "onGradient" : "onSurface"}
      className={className}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Ink pill label ("Gameweek 21", "General Leagues", "Goalkeepers").    */
/* ------------------------------------------------------------------ */

export function FplPill({
  children,
  className,
  tone = "ink",
}: {
  children: ReactNode;
  className?: string;
  tone?: "ink" | "cyan";
}) {
  return (
    <UiPill tone={tone === "ink" ? "ink" : "action"} className={className}>
      {children}
    </UiPill>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons: gradient primary, ink (dark), light (surface).             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "gradient" | "ink" | "light" | "outline" | "secondary";

/**
 * The kit has no "secondary" fill — it was a one-off indigo used by a single
 * screen for the quieter of two side-by-side actions, which is exactly what
 * `outline` is for.
 */
function kitVariant(variant: ButtonVariant): UiButtonVariant {
  return variant === "secondary" ? "outline" : variant;
}

export function FplButton({
  variant = "gradient",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <UiButton variant={kitVariant(variant)} className={className} {...props}>
      {children}
    </UiButton>
  );
}

export function FplLinkButton({
  to,
  variant = "gradient",
  className,
  children,
  params,
}: {
  to: string;
  params?: Record<string, string>;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <UiLinkButton to={to} params={params} variant={kitVariant(variant)} className={className}>
      {children}
    </UiLinkButton>
  );
}

/* ------------------------------------------------------------------ */
/* Ink banner ("Bank 6.1", "You are about to transfer 1 player!").      */
/* ------------------------------------------------------------------ */

export function FplBanner({ children, className }: { children: ReactNode; className?: string }) {
  return <UiBanner className={className}>{children}</UiBanner>;
}

/* ------------------------------------------------------------------ */
/* Key/value list rows used by profile, points overview…               */
/* ------------------------------------------------------------------ */

export function FplKeyValueRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return <UiKeyValueRow label={label} value={value} className={className} />;
}

/** Small state badge: ACTIVE (gradient), UNAVAILABLE / USED (sunken), AVAILABLE (outlined). */
export function FplStateBadge({
  state,
}: {
  state: "active" | "unavailable" | "used" | "available";
}) {
  const { t } = useI18n();
  const label =
    state === "active"
      ? t("fpl.state.active")
      : state === "unavailable"
        ? t("fpl.state.unavailable")
        : state === "used"
          ? t("fpl.state.used")
          : t("fpl.state.play");
  return (
    <UiBadge
      tone={state === "active" ? "action" : "neutral"}
      className={cn(
        "min-w-28",
        // "Available" is the one that must not read as spent: an outlined
        // card surface, not the sunken fill the used/unavailable pair takes.
        state === "available" && cn(ui.surface.card, ui.rule.all, ui.tone.ink, "shadow-none"),
      )}
    >
      {label}
    </UiBadge>
  );
}

/** Rank movement glyph: up, down or unchanged — with an accessible name. */
export function FplRankMovement({
  rank,
  previousRank,
}: {
  rank: number;
  previousRank: number | null;
}) {
  const { t } = useI18n();
  return (
    <UiRankMovement
      rank={rank}
      previousRank={previousRank}
      labels={{ up: t("fpl.rank.up"), down: t("fpl.rank.down"), same: t("fpl.rank.same") }}
    />
  );
}
