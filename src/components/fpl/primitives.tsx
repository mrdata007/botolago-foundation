import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { useI18n } from "@/i18n/provider";
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
  const { t } = useI18n();
  const router = useRouter();
  const back = (
    <span className="inline-flex items-center gap-0.5 text-[15px] font-semibold">
      <ChevronLeft className="h-5 w-5" aria-hidden />
      {t("fpl.back")}
    </span>
  );
  return (
    <header
      className={cn(
        "relative px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] text-[color:var(--fpl-ink)]",
        variant === "gradient" ? "fpl-header-gradient" : "bg-[color:var(--fpl-ink)] text-white",
        className,
      )}
      style={variant === "gradient" ? { backgroundImage: "var(--fpl-header)" } : undefined}
    >
      <div className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center">
        <div className="justify-self-start">
          {left ? (
            left
          ) : backTo ? (
            <Link to={backTo} className="inline-flex min-h-11 items-center -ms-1 pe-2">
              {back}
            </Link>
          ) : onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center -ms-1 pe-2"
            >
              {back}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.history.back()}
              className="inline-flex min-h-11 items-center -ms-1 pe-2"
            >
              {back}
            </button>
          )}
        </div>
        <h1
          className={cn(
            "truncate px-2 text-center font-extrabold tracking-tight",
            left && right ? "text-[16px]" : "text-[19px]",
          )}
        >
          {title}
        </h1>
        <div className="justify-self-end">{right}</div>
      </div>
      {children}
    </header>
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
    timeZone: "Africa/Casablanca",
  }).format(date);
  return (
    <p className="mt-1 text-center text-[14px] text-[color:var(--fpl-ink)]">
      {t("fpl.gameweek")} {gameweek} {t("fpl.deadline")}:{" "}
      <strong className="font-extrabold">{formatted}</strong>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control ("Squad | List", "League | Cup").                 */
/* ------------------------------------------------------------------ */

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
    <div
      role="tablist"
      className={cn(
        "grid rounded-[10px] p-[3px]",
        tone === "onGradient" ? "bg-white/35" : "bg-[color:var(--fpl-grey)]",
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
              "min-h-10 rounded-[8px] px-3 text-[15px] font-bold transition-colors disabled:opacity-50",
              active
                ? "bg-white text-[color:var(--fpl-ink)] shadow-sm"
                : "text-[color:var(--fpl-ink)]",
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
/* Purple pill label ("Gameweek 21", "General Leagues", "Goalkeepers"). */
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
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-3 py-1 text-[14px] font-extrabold",
        tone === "ink"
          ? "bg-[color:var(--fpl-ink)] text-[color:var(--fpl-cyan)]"
          : "text-[color:var(--fpl-ink)]",
        className,
      )}
      style={tone === "cyan" ? { backgroundImage: "var(--fpl-grad)" } : undefined}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons: gradient primary, ink (dark), light (white).               */
/* ------------------------------------------------------------------ */

type ButtonVariant = "gradient" | "ink" | "light" | "outline" | "secondary";

export function FplButton({
  variant = "gradient",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] px-4 text-[15px] font-extrabold transition-[filter,opacity] disabled:cursor-not-allowed",
        variant === "gradient" && "text-[color:var(--fpl-ink)] disabled:opacity-45",
        variant === "ink" &&
          "bg-[color:var(--fpl-ink)] text-white disabled:bg-[color:var(--fpl-grey)] disabled:text-[color:var(--fpl-grey-text)]",
        variant === "light" && "bg-white text-[color:var(--fpl-ink)] shadow-sm disabled:opacity-50",
        variant === "outline" &&
          "border border-[color:var(--fpl-ink)] bg-transparent text-[color:var(--fpl-ink)] disabled:opacity-50",
        variant === "secondary" && "bg-[oklch(0.5_0.17_262)] text-white disabled:opacity-50",
        className,
      )}
      style={variant === "gradient" ? { backgroundImage: "var(--fpl-grad)" } : undefined}
    >
      {children}
    </button>
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
    <Link
      to={to}
      params={params}
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] px-4 text-[15px] font-extrabold",
        variant === "gradient" && "text-[color:var(--fpl-ink)]",
        variant === "ink" && "bg-[color:var(--fpl-ink)] text-white",
        variant === "light" && "bg-white text-[color:var(--fpl-ink)] shadow-sm",
        variant === "outline" && "border border-[color:var(--fpl-ink)] text-[color:var(--fpl-ink)]",
        className,
      )}
      style={variant === "gradient" ? { backgroundImage: "var(--fpl-grad)" } : undefined}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Ink banner ("Bank £6.1m", "You are about to transfer 1 player!").   */
/* ------------------------------------------------------------------ */

export function FplBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "bg-[color:var(--fpl-ink)] px-4 py-2 text-center text-[15px] font-extrabold text-[color:var(--fpl-cyan)]",
        className,
      )}
    >
      {children}
    </div>
  );
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
  return (
    <div
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 border-b border-[color:var(--fpl-grey)] px-1 text-[15px]",
        className,
      )}
    >
      <span className="text-foreground">{label}</span>
      <span className="font-extrabold text-foreground">{value}</span>
    </div>
  );
}

/** Small state badge: ACTIVE (gradient), UNAVAILABLE / USED (grey), AVAILABLE (light). */
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
    <span
      className={cn(
        "inline-flex min-w-28 items-center justify-center rounded-full px-3 py-1 text-[12px] font-extrabold uppercase tracking-wide",
        state === "active" && "text-[color:var(--fpl-ink)]",
        (state === "unavailable" || state === "used") &&
          "bg-[color:var(--fpl-grey)] text-[color:var(--fpl-grey-text)]",
        state === "available" &&
          "bg-white text-[color:var(--fpl-ink)] ring-1 ring-[color:var(--fpl-grey)]",
      )}
      style={state === "active" ? { backgroundImage: "var(--fpl-grad)" } : undefined}
    >
      {label}
    </span>
  );
}

/** Rank movement glyph: green up, pink down, grey dash. */
export function FplRankMovement({
  rank,
  previousRank,
}: {
  rank: number;
  previousRank: number | null;
}) {
  if (previousRank === null || previousRank === rank) {
    return (
      <span className="inline-block w-5 text-center text-[color:var(--fpl-grey-text)]">—</span>
    );
  }
  const up = rank < previousRank;
  return (
    <span
      aria-label={up ? "up" : "down"}
      className={cn(
        "inline-grid h-5 w-5 place-items-center rounded-full text-[10px] font-black text-white",
        up ? "bg-[oklch(0.72_0.19_150)]" : "bg-[color:var(--fpl-pink)]",
      )}
    >
      {up ? "▲" : "▼"}
    </span>
  );
}
