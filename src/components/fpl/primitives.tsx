/**
 * Fantasy chrome — the shrinking remainder of a second primitive set.
 *
 * The previous note here said "fifteen Fantasy routes and four Fantasy
 * components import these names", which is why the API was frozen. That is no
 * longer true: after the screen conversions the importers are down to four
 * files, and the adapter earns its keep only for the ones a lane has not
 * reached yet. It is not a component library; it is a migration seam, and the
 * end state is an empty file.
 *
 * WHAT IS LEFT, AND WHY. Every export below is a thin rename of a kit
 * primitive whose remaining callers live outside the fpl-primitives lane
 * (`src/routes/fantasy.profile.tsx`, and `LegacyFantasyPage.tsx` for
 * `FplHeader`). Each carries the kit call it is equal to, so whoever converts
 * `fantasy.profile.tsx` can inline it and delete the export in the same edit
 * rather than re-deriving the mapping. Nothing here does a job the kit has no
 * equivalent for — if it did, that would be the thing to say instead.
 *
 * WHAT WENT, AND WHERE ITS RECORD LIVES. Four exports had no caller at all,
 * so they were carrying decision records for code nobody ran:
 *
 *   - `FplDeadlineLine` — formatted the deadline in `MATCH_TIME_ZONE` rather
 *     than a literal zone string, so it could not drift from the fixture
 *     cards (BG-0100). The hub renders that line itself and keeps the same
 *     rule; see `fantasy.index.tsx`, which comments it at the call site.
 *   - `FplRankMovement` — existed because the glyph used to announce a
 *     hardcoded English "up" / "down", and colour alone is not a difference a
 *     reader can rely on. Both live standings surfaces (`LeagueTable.tsx`,
 *     `fantasy.leagues.$leagueId.tsx`) now pass translated `labels` to
 *     `UiRankMovement` themselves, which is where the fix belongs. They use
 *     `fantasy.rank.up/down/same`; this used a duplicate `fpl.rank.*` set, so
 *     removing it leaves those three keys referenced by nothing and the i18n
 *     gate's W3 count rises by exactly three. That is the gate working: the
 *     keys are a second copy of vocabulary the product already has.
 *   - `FplButton` — `UiButton` with the `secondary → outline` mapping below.
 *   - `FplBanner` — `UiBanner`, verbatim.
 *
 * The older defect notes are kept where the code they describe still is:
 * BG-0083 (`--fpl-ink`, a FILL, used as a text colour) and the literal
 * `bg-white` / `text-white` that rendered 1.09:1 on a dark card are both
 * fixed at the token layer now, and `ui.tone.ink` / `ui.surface.card` are
 * what the kit primitives below paint with.
 */

import type { ReactNode } from "react";

import {
  UiBadge,
  UiHeader,
  UiKeyValueRow,
  UiLinkButton,
  UiPill,
  UiSegmented,
  type UiButtonVariant,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

/* ------------------------------------------------------------------ */
/* Header: "‹ Back   Title   [right]" on the cyan→blue gradient.       */
/* ------------------------------------------------------------------ */

/**
 * `UiHeader` with the Fantasy prop names and one behaviour: Back is offered
 * even with no explicit destination, falling through to router history.
 *
 * Callers left: `LegacyFantasyPage.tsx` and `fantasy.profile.tsx`. Both pass
 * an explicit `backTo`, so both are `<UiHeader title backTo tone="gradient">`
 * — which is what `fantasy.help.tsx` and `fantasy.players.$playerId.tsx`
 * already write directly.
 */
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

/* ------------------------------------------------------------------ */
/* Segmented control ("Squad | List", "League | Cup").                 */
/* ------------------------------------------------------------------ */

/**
 * `UiSegmented` with the Fantasy tone names (`onLight` is `onSurface`).
 * Caller left: `fantasy.profile.tsx`, on the default `onGradient`.
 *
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

/**
 * `UiPill` with the Fantasy tone names (`cyan` is the action gradient).
 * Caller left: `fantasy.profile.tsx`, twice, both on the default `ink`.
 */
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

/**
 * `UiLinkButton` with the mapping above. Caller left: `fantasy.profile.tsx`,
 * once, on the default `gradient` — i.e. `<UiLinkButton to=…>`.
 */
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
/* Key/value list rows used by profile, points overview…               */
/* ------------------------------------------------------------------ */

/**
 * `UiKeyValueRow`, verbatim — same three props, same order. Callers left:
 * `fantasy.profile.tsx`, seven of them.
 */
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

/**
 * Small state badge: ACTIVE (gradient), UNAVAILABLE / USED (sunken),
 * AVAILABLE (outlined). Caller left: `fantasy.profile.tsx`, once, for the
 * chip rows.
 *
 * This is the last export that was doing something the kit could not, and it
 * no longer is. "Available" must not read as spent — `neutral`'s sunken fill
 * is how this product draws "used up" — so the badge composed the outline by
 * hand: `ui.surface.card` for the fill, `ui.rule.all` for the hairline,
 * `ui.tone.ink` for the label, and `shadow-none` to undo the card shadow that
 * came with the fill. `UiBadge tone="outline"` is exactly that composition,
 * stated once in the kit, so the hand-rolled version is gone and this export
 * is now a four-way `tone` switch — i.e. nothing but a name.
 *
 * ONE VISIBLE CHANGE, and it is a fix. `ui.surface.card` also carries
 * `rounded-[var(--ui-radius-control)]`, which `cn()` merged over the badge's
 * own `ui.radius.full`: "available" rendered as a 6px rounded rectangle while
 * ACTIVE, USED and UNAVAILABLE — the three states stacked directly above and
 * below it in the same column — rendered as pills. That was a side effect of
 * borrowing a surface for its colour, not a decision. The tone keeps the pill,
 * so the four states are one shape again.
 */
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
      tone={state === "active" ? "action" : state === "available" ? "outline" : "neutral"}
      className="min-w-28"
    >
      {label}
    </UiBadge>
  );
}
