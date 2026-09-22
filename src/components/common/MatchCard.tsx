import { Link } from "@tanstack/react-router";
import type { Club, Match, MatchStatus } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "./ClubCrest";
import { LiveIndicator } from "@/components/matches/LiveIndicator";
import { cn } from "@/lib/utils";
import { ui } from "@/components/ui-kit";
import { MapPin } from "lucide-react";
import {
  isKickoffDateUnconfirmed,
  isKickoffTimeUnconfirmed,
  MATCH_TIME_ZONE,
} from "@/lib/match-kickoff";

/**
 * Match card.
 *
 * A single, reusable match card that renders every supported match state
 * with a shared score-first structure but distinct visual identity:
 *   - `scheduled`             large kickoff time, teams equal, subtle chip
 *   - `live`                  pulsing LIVE + minute, bold score, ambient tint
 *   - `finished` (FT)         final score, calm chip
 *   - `postponed` / `delayed` / `cancelled`   status chip replaces score,
 *                              kickoff time is faded and struck-through where
 *                              appropriate
 *   - `penalties` / `extra_time` / `ht`       supported for future backend
 *                              data — the card renders these states cleanly
 *                              when the domain expands
 *
 * Converted to the shared UI kit (`@/components/ui-kit`): the Fantasy type
 * scale, radii, surface and focus ring replace the glass surfaces, the ad-hoc
 * pixel type and the hardcoded status colours. The public API is unchanged:
 * `match / home / away / glass? / showVenue? / variant? / extras?`.
 *
 * Behaviour:
 *   - The whole card is a router `<Link>` to `/matches/$matchId`.
 *   - RTL-safe: logical properties only; the physical layout stays consistent
 *     (home first, away last) which matches how match centers ship in both
 *     LTR and RTL products.
 *   - `aria-label` composes a screen-reader-friendly announcement so
 *     adjacent numeric scores are never ambiguous.
 *   - Scores use the kit's tabular figures so 0–0 and 10–2 align.
 *   - Every `tracking-*` is `ltr:`-prefixed — Arabic letterforms join and
 *     must never be letter-spaced (BG-0069).
 */

type ExtendedStatus =
  | MatchStatus
  | "half_time"
  | "extra_time"
  | "penalties"
  | "cancelled"
  | "delayed";

export interface MatchCardExtras {
  /** Optional presentation-only status upgrades. Domain data still drives
   * the real status; components can pass an extended state when a richer
   * live feed is wired later. */
  displayStatus?: ExtendedStatus;
  /** Optional regulation-time score before penalty shootout (e.g. "1–1"). */
  aetScoreline?: string;
  /** Optional penalty shootout result rendered next to the main score. */
  penaltiesScore?: { home: number; away: number };
}

/** Shared chip shell — the kit badge shape, tone supplied by the caller. */
const chip = "inline-flex items-center px-2 py-0.5 rounded-full";

export function MatchCard({
  match,
  home,
  away,
  glass = true,
  showVenue = false,
  variant = "row",
  extras,
}: {
  match: Match;
  home: Club;
  away: Club;
  glass?: boolean;
  showVenue?: boolean;
  variant?: "row" | "compact";
  extras?: MatchCardExtras;
}) {
  const { t, tr, lang } = useI18n();
  const kickoff = new Date(match.kickoff);
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";

  const status: ExtendedStatus = extras?.displayStatus ?? match.status;
  const isLive = status === "live" || status === "half_time" || status === "extra_time";
  const isFinished = status === "finished" || status === "penalties";
  const isScheduled = status === "scheduled" || status === "delayed";
  const isPostponed = status === "postponed" || status === "cancelled";
  const unconfirmedDate = isKickoffDateUnconfirmed(match) || status === "cancelled";
  const unconfirmedTime = isKickoffTimeUnconfirmed(match);

  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(kickoff);
  const weekdayFmt = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(kickoff);

  const home_s = tr(home.shortName);
  const away_s = tr(away.shortName);
  const hs = match.homeScore ?? 0;
  const as = match.awayScore ?? 0;

  const a11yLabel = (() => {
    if (isFinished || isLive) {
      return t("matches.a11y.score")
        .replace("{home}", home_s)
        .replace("{hs}", String(hs))
        .replace("{away}", away_s)
        .replace("{as}", String(as));
    }
    if (isScheduled) {
      return `${home_s} ${t("matches.vs")} ${away_s} — ${weekdayFmt} · ${unconfirmedTime ? t("matches.kickoff_unconfirmed") : t("matches.a11y.kickoff_at").replace("{time}", timeFmt)}`;
    }
    return `${home_s} ${t("matches.vs")} ${away_s} — ${t(`matches.a11y.status_${match.status}` as never) || t("matches.status.postponed")}`;
  })();

  // Status chip is intentionally minimal on scheduled/finished; only "live"
  // gets an emphatic treatment. Postponed/cancelled/delayed use the caution
  // token so they read the same in light and dark.
  const cautionChip = (label: string) => (
    <span
      className={cn(chip, ui.text.label)}
      style={{
        background: "color-mix(in oklab, var(--ui-caution) 20%, transparent)",
        color: "color-mix(in oklab, var(--ui-caution) 70%, var(--ui-on-surface))",
      }}
    >
      {label}
    </span>
  );

  const statusChip = (() => {
    if (isLive) {
      return <LiveIndicator minute={match.minute} />;
    }
    if (status === "finished") {
      return (
        <span className={cn(chip, ui.surface.sunken, ui.tone.muted, ui.text.label)}>
          {t("matches.status.ft")}
        </span>
      );
    }
    if (status === "penalties") {
      return (
        <span className={cn(chip, ui.surface.sunken, ui.tone.ink, ui.text.label)}>
          {t("matches.status.penalties")}
        </span>
      );
    }
    if (isPostponed) {
      return cautionChip(
        status === "cancelled" ? t("matches.status.cancelled") : t("matches.status.postponed"),
      );
    }
    if (status === "delayed") {
      return cautionChip(t("matches.status.delayed"));
    }
    // scheduled → subtle day chip
    return (
      <span className={cn(chip, ui.surface.sunken, ui.tone.muted, ui.text.label)}>
        {weekdayFmt}
      </span>
    );
  })();

  // Center column: score or kickoff time. Score always uses tabular figures.
  const centerContent = (() => {
    if (isLive || isFinished) {
      return (
        <div className="flex flex-col items-center">
          <div
            className={cn(
              "flex items-baseline gap-1.5",
              ui.text.tabular,
              ui.tone.default,
              "[font-weight:var(--ui-weight-hero)]",
              variant === "compact" ? ui.text.subtitle : ui.text.title,
            )}
          >
            <span aria-hidden>{hs}</span>
            <span aria-hidden className={ui.tone.muted}>
              –
            </span>
            <span aria-hidden>{as}</span>
          </div>
          {status === "penalties" && extras?.penaltiesScore && (
            <div className={cn("mt-0.5", ui.text.label, ui.text.tabular, ui.tone.ink)} aria-hidden>
              {t("matches.penalty_shootout")} {extras.penaltiesScore.home}–
              {extras.penaltiesScore.away}
            </div>
          )}
          {status === "extra_time" && (
            <div
              className={cn("mt-0.5", ui.text.label, "text-[color:var(--ui-negative)]")}
              aria-hidden
            >
              {t("matches.status.extra_time")}
            </div>
          )}
        </div>
      );
    }
    if (isPostponed) {
      // Was a struck-through `timeFmt`. For every postponed fixture in this
      // competition that time is the provider's UTC-midnight placeholder, so
      // the strikethrough was drawing a line through 01:00 -- an hour the
      // match was never going to kick off at. There is no original time to
      // cross out, so the slot states what is actually known.
      return (
        <div className={cn("max-w-24 text-center", ui.text.micro, ui.tone.muted)} aria-hidden>
          {t("matches.kickoff_date_unconfirmed")}
        </div>
      );
    }
    if (unconfirmedDate || unconfirmedTime) {
      // Resolved before the JSX so both keys stay literal: the i18n gate reads
      // translation arguments statically and counts any expression in that
      // position -- even a ternary of two literals -- as opaque.
      let label = t("matches.kickoff_unconfirmed");
      if (unconfirmedDate) label = t("matches.kickoff_date_unconfirmed");
      return (
        <div className={cn("max-w-24 text-center", ui.text.micro, ui.tone.muted)} aria-hidden>
          {label}
        </div>
      );
    }
    // scheduled / delayed → prominent kickoff time
    return (
      <div className="flex flex-col items-center">
        <div
          className={cn(
            ui.text.tabular,
            ui.tone.default,
            "[font-weight:var(--ui-weight-hero)]",
            variant === "compact" ? ui.text.body : ui.text.subtitle,
          )}
          aria-hidden
        >
          {timeFmt}
        </div>
        <div className={cn(ui.text.label, ui.tone.muted)} aria-hidden>
          {t("matches.kickoff")}
        </div>
      </div>
    );
  })();

  // `glass` is kept in the public API for callers; both settings now resolve
  // to the kit's opaque card. `glass` only decides whether the card carries
  // the press feedback of a tappable tile.
  const surfaceClass = cn(
    ui.surface.card,
    glass &&
      "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
  );

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      search={{ tab: "summary" }}
      aria-label={a11yLabel}
      className={cn(
        // `min-w-0` is load-bearing, not cosmetic. Every caller renders these
        // cards into a single-column `grid`, whose implicit `auto` track is
        // sized to the largest item's content-based minimum. The club-name
        // spans below are `truncate` (`white-space: nowrap`), so the card's
        // min-content width is the full, untruncated name — and `min-w-0` on
        // the inner name columns only relaxes *their* flex minimum, it does
        // not stop that minimum propagating out into the grid track. Without
        // this the track grows past the page gutter and the card's trailing
        // edge (the away crest and name in LTR, the matchday chip in RTL) is
        // clipped away by `html, body { overflow-x: clip }` with no scroll to
        // reach it. `min-width: 0` is inert in normal flow, so it changes
        // nothing except the grid/flex track this card is allowed to demand.
        "group block min-w-0",
        ui.focus,
        surfaceClass,
        // Live cards get a very soft ambient tint. It is a flat wash rather
        // than a directional gradient: CSS gradients take physical angles
        // only, and a physical angle would sit on the wrong edge in Arabic.
        isLive && "relative overflow-hidden",
      )}
    >
      {isLive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "color-mix(in oklab, var(--ui-negative) 6%, transparent)" }}
        />
      )}

      <div
        className={cn(
          "relative flex flex-col gap-1.5",
          variant === "compact" ? "px-3 py-2.5" : "px-3.5 py-3",
        )}
      >
        {/* Top row: status chip + gameweek */}
        <div className="flex items-center justify-between gap-2">
          {statusChip}
          <span className={cn(ui.text.label, ui.text.tabular, ui.tone.muted)}>
            {t("matches.gameweek")} {match.gameweek}
          </span>
        </div>

        {/* Main row: home | score/time | away */}
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ClubCrest club={home} size="sm" />
            <span
              className={cn(
                "truncate",
                ui.tone.default,
                variant === "compact" ? ui.text.meta : ui.text.body,
                "[font-weight:var(--ui-weight-heavy)]",
              )}
            >
              {home_s}
            </span>
          </div>

          <div className="shrink-0 px-1.5">{centerContent}</div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span
              className={cn(
                "truncate text-end",
                ui.tone.default,
                variant === "compact" ? ui.text.meta : ui.text.body,
                "[font-weight:var(--ui-weight-heavy)]",
              )}
            >
              {away_s}
            </span>
            <ClubCrest club={away} size="sm" />
          </div>
        </div>

        {showVenue && (
          <div className={cn("flex items-center gap-1 truncate", ui.text.micro, ui.tone.muted)}>
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{tr(match.venue)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
