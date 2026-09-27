import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";

import type { PepitesPlayerCard } from "@/backend/pepites/contracts";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import {
  initials,
  pp,
  ratingBand,
  SEGMENT_COLOURS,
  segments,
  shirtName,
  teamKit,
} from "./pepites-design";
import { formatNumber, playerPhotoUrl } from "./pepites-format";

/**
 * The visual parts of the Figma file "BotolaGO — Pépites (UI)" (page
 * Components): GoMark, the night band, FilterChip, Seg10Bar, RatingChip, the
 * headshot, the shirt a player without a licensed photo wears, FactsStrip.
 * Data goes in; nothing here fetches.
 */

/** "GO · Pépites · DATA": the sub-brand mark, on night backgrounds. */
export function GoMark() {
  const { t } = useI18n();
  return (
    <Link
      to="/pepites"
      className="inline-flex items-center gap-1.5 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pepites-on-night)]"
      aria-label={t("pepites.title")}
      data-testid="pepites-gomark"
    >
      <span
        aria-hidden
        className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-[6px] bg-white"
      >
        <img
          src="/favicon.png?v=2"
          alt=""
          width={20}
          height={20}
          draggable={false}
          className="size-5 object-contain"
        />
      </span>
      <span
        aria-hidden
        className={cn("text-[12px] text-[color:var(--pepites-on-night)]", pp.heavy)}
      >
        {t("pepites.brand")}
      </span>
      <span
        aria-hidden
        className={cn(
          "rounded-[4px] px-[5px] py-[3px] text-[8px] leading-none text-[color:var(--pepites-night)] ltr:tracking-[0.14em]",
          pp.energyFill,
          pp.monoStrong,
        )}
      >
        DATA
      </span>
    </Link>
  );
}

/**
 * The night band: navy, cut on a slant at the bottom, with the club's glow
 * and a violet one, and an outlined number behind everything (the rank, or
 * how many players). Full-bleed; its content keeps the page column.
 */
export function NightBand({
  glow,
  ghost,
  cut = 32,
  className,
  children,
  testId,
  wide = false,
}: {
  /** The club colour behind the leader; none on pages without one. */
  glow?: string | null;
  ghost?: string | null;
  /** How far the slant drops, in px, from the inline end to the inline start. */
  cut?: number;
  className?: string;
  children: ReactNode;
  testId?: string;
  wide?: boolean;
}) {
  return (
    <section
      data-testid={testId}
      // The slant (styles.css, `.pepites-night-band`) mirrors in Arabic.
      className={cn("pepites-night-band relative isolate overflow-hidden", pp.night, className)}
      style={{ "--pepites-cut": `${cut}px` } as CSSProperties}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -start-[50px] -top-[40px] -z-10 size-[150px] rounded-full bg-[color:var(--pepites-violet)] opacity-45 blur-[30px]"
      />
      {glow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -end-[20px] top-[40px] -z-10 size-[220px] rounded-full opacity-75 blur-[30px]"
          style={{ backgroundColor: glow }}
        />
      ) : null}
      {ghost ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -end-[10px] top-[10px] -z-10 select-none text-[clamp(150px,55vw,230px)] text-transparent",
            pp.display,
            pp.lean,
          )}
          style={{ WebkitTextStroke: "1.5px rgb(255 255 255 / 0.1)" }}
        >
          {ghost}
        </span>
      ) : null}
      <div
        className={cn(
          "mx-auto w-full px-4",
          wide ? "md:max-w-[1232px] md:px-4" : "md:max-w-[var(--ui-content-max)]",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** The energy streak under the hero figures. */
export function EnergyStreak() {
  return (
    <div
      aria-hidden
      className={cn("h-[5px] w-[120px] -ms-6 [transform:skewX(-8deg)]", pp.energyFill)}
    />
  );
}

/** A mono meta line ("U23 · BOTOLA PRO · 2025-26"). */
export function MonoLine({
  children,
  tone = "meta",
  className,
  testId,
}: {
  children: ReactNode;
  tone?: "meta" | "sub" | "spring" | "muted";
  className?: string;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      className={cn(
        "text-[11px] leading-[1.4] ltr:tracking-[0.06em]",
        tone === "sub" ? cn(pp.mono, "ltr:tracking-[0.04em]") : pp.monoStrong,
        tone === "meta" && pp.onNightMeta,
        tone === "sub" && pp.onNightSub,
        tone === "spring" && pp.spring,
        tone === "muted" && pp.muted,
        className,
      )}
    >
      {children}
    </p>
  );
}

/** FilterChip: 26px pill. `dark` sits on the night band. */
export function FilterChip({
  selected,
  tone = "light",
  children,
  testId,
  ...target
}: {
  selected: boolean;
  tone?: "light" | "dark";
  children: ReactNode;
  testId?: string;
} & (
  | { onClick: () => void; to?: never; search?: never }
  | { to: string; search?: Record<string, unknown>; onClick?: never }
)) {
  const className = cn(
    "inline-flex h-[26px] shrink-0 items-center rounded-full border px-[11px] text-[11px] leading-none transition-colors",
    pp.heavy,
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pepites-violet)] focus-visible:ring-offset-1",
    tone === "light"
      ? selected
        ? "border-[color:var(--pepites-ink)] bg-[color:var(--pepites-ink)] text-white dark:bg-[color:var(--ui-ink)]"
        : "border-[color:var(--pepites-line)] bg-[color:var(--pepites-card)] text-[color:var(--pepites-ink)]"
      : selected
        ? "border-white bg-white text-[color:var(--pepites-night)]"
        : "border-white/15 bg-white/10 text-white",
  );
  if (target.to) {
    return (
      <Link to={target.to} search={target.search} className={className} data-testid={testId}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={target.onClick}
      className={className}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/**
 * Seg10Bar: ten skewed segments, `round(value / 10)` lit from the inline
 * start in the energy colours. `value` is out of 100.
 */
export function Seg10Bar({
  value,
  tone = "light",
  className,
  label,
}: {
  value: number | null | undefined;
  tone?: "light" | "dark";
  className?: string;
  label?: string;
}) {
  const lit = segments(value);
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("flex h-[6px] w-full gap-[2px]", className)}
    >
      {SEGMENT_COLOURS.map((colour, index) => (
        <span
          key={colour}
          className={cn(
            "h-full flex-1 rounded-[1.5px] [transform:skewX(-20deg)] rtl:[transform:skewX(20deg)]",
            index >= lit &&
              (tone === "light" ? "bg-[color:var(--pepites-seg-empty)]" : "bg-white/15"),
          )}
          style={index < lit ? { backgroundColor: colour } : undefined}
        />
      ))}
    </div>
  );
}

/** RatingChip: the match rating on its fixed colour scale, always with the number. */
export function RatingChip({ rating }: { rating: number | null | undefined }) {
  const { lang } = useI18n();
  if (typeof rating !== "number" || !Number.isFinite(rating)) {
    return <span className={cn("inline-block w-[34px] text-center text-[11px]", pp.muted)}>–</span>;
  }
  const band = ratingBand(rating);
  return (
    <bdi
      data-band={band}
      className={cn(
        "inline-flex h-[20px] w-[34px] items-center justify-center rounded-[5px] text-[11px] leading-none",
        pp.heavy,
        band === 1 && "bg-[color:var(--pepites-rating-1)] text-white",
        band === 2 && "bg-[color:var(--pepites-rating-2)] text-white",
        band === 3 && "bg-[color:var(--pepites-rating-3)] text-white",
        band === 4 && "bg-[color:var(--pepites-rating-4)] text-white",
        band === 5 && "bg-[color:var(--pepites-rating-5)] text-white",
      )}
    >
      {formatNumber(rating, lang, 1)}
    </bdi>
  );
}

/**
 * A circle headshot: the approved photo when there is one; otherwise the
 * club-colour disc with initials and the orange "photo missing" dot.
 */
export function Headshot({
  player,
  size = 36,
  missingDot = true,
}: {
  player: Pick<PepitesPlayerCard, "name" | "team" | "photo">;
  size?: 20 | 36 | 44;
  missingDot?: boolean;
}) {
  const photoUrl = playerPhotoUrl(player);
  const kit = teamKit(player.team);
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundImage: `radial-gradient(circle at 50% 80%, ${kit.primary} 0%, #0a0d1f 100%)`,
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full rounded-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <>
          <span
            className={cn(pp.display, "text-white")}
            style={{ fontSize: size === 20 ? 7 : size === 36 ? 13 : 15 }}
          >
            {initials(player.name)}
          </span>
          {missingDot && size > 20 ? (
            <span
              data-testid="pepites-photo-missing"
              className="absolute bottom-0 end-0 size-[9px] rounded-full border-[1.5px] border-white bg-[color:var(--pepites-missing)]"
            />
          ) : null}
        </>
      )}
    </span>
  );
}

/**
 * The shirt a player wears when no licensed photo exists: the club's kit
 * (src/lib/kits.ts), the surname on the back and the Pépites rank as the
 * number. The shape is the Figma ShirtFallback's.
 */
export function PepitesShirt({
  player,
  number,
  className,
}: {
  player: Pick<PepitesPlayerCard, "name" | "team">;
  number: number | null;
  className?: string;
}) {
  const { lang } = useI18n();
  const kit = teamKit(player.team);
  return (
    <svg
      viewBox="0 0 130 122"
      className={cn("h-[120px] w-[128px] drop-shadow-[0_10px_8px_rgba(0,0,0,0.45)]", className)}
      aria-hidden
      data-testid="pepites-shirt"
    >
      <path
        d="M41.2 0.53L17.73 11.64L0.67 40.53L19.87 53.87L28.4 44.98V120.53H100.93V44.98L109.47 53.87L128.67 40.53L111.6 11.64L88.13 0.53C72.49 4.98 56.84 4.98 41.2 0.53Z"
        fill={kit.primary}
        stroke="rgb(0 0 0 / 0.25)"
      />
      <path
        d="M41.2 1.09L17.73 12.2L0.67 41.09L19.87 54.42L28.4 45.54V25.54L41.2 1.09ZM88.13 1.09L111.6 12.2L128.67 41.09L109.47 54.42L100.93 45.54V25.54L88.13 1.09Z"
        fill={kit.secondary}
        stroke="rgb(0 0 0 / 0.25)"
      />
      <text
        x="64.7"
        y="44"
        textAnchor="middle"
        fill={kit.ink}
        fontFamily="Changa, Manrope, sans-serif"
        fontWeight={800}
        fontSize={shirtName(player.name).length > 10 ? 9 : 12}
      >
        {shirtName(player.name)}
      </text>
      {number !== null ? (
        <text
          x="64.7"
          y="92"
          textAnchor="middle"
          fill={kit.ink}
          fontFamily="Changa, Manrope, sans-serif"
          fontWeight={800}
          fontSize={34}
        >
          {formatNumber(number, lang)}
        </text>
      ) : null}
    </svg>
  );
}

/** FactsStrip: four figures between two hairlines, on the night band. */
export function FactsStrip({
  facts,
  testId,
}: {
  facts: ReadonlyArray<{ label: string; value: string }>;
  testId?: string;
}) {
  return (
    <dl data-testid={testId} className="flex border-y border-[color:var(--pepites-on-night-rule)]">
      {facts.map((fact) => (
        <div key={fact.label} className="flex min-w-0 flex-1 flex-col items-center gap-[3px] py-2">
          <dd className={cn(pp.display, "order-1 text-[18px] text-white")}>
            <bdi>{fact.value}</bdi>
          </dd>
          <dt
            className={cn(
              pp.mono,
              "order-2 text-[10px] leading-[1.4] text-white/70 ltr:tracking-[0.04em]",
            )}
          >
            {fact.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

/**
 * ScoreRing (Figma 4:17): the score on a 72px ring, the arc in the energy
 * gradient from twelve o'clock, clockwise, `score / 100` of the way round.
 * The Arabic frames keep the arc clockwise.
 */
export function ScoreRing({
  score,
  label,
  size = 72,
  testId,
}: {
  score: number | null;
  label: string;
  size?: number;
  testId?: string;
}) {
  const { lang } = useI18n();
  const stroke = size * 0.08;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = typeof score === "number" ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const gradientId = `pepites-ring-${size}`;
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      data-testid={testId}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5de39b" />
            <stop offset="0.45" stopColor="#7fd6f0" />
            <stop offset="1" stopColor="#7c6cf0" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(255 255 255 / 0.11)"
          strokeWidth={stroke}
        />
        {share > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeDasharray={`${circumference * share} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <bdi className={cn(pp.display, "text-white")} style={{ fontSize: size * 0.33 }}>
          {typeof score === "number" ? formatNumber(Math.round(score), lang) : "–"}
        </bdi>
        <span
          className={cn(
            pp.monoStrong,
            "text-[10px] leading-[1.4] text-white/70 ltr:tracking-[0.04em]",
          )}
        >
          {label}
        </span>
      </span>
    </div>
  );
}
