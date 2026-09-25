import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Club, Match, MatchStatus } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "./ClubCrest";
import { cn } from "@/lib/utils";
import { ui, UiBadge, UiLivePill } from "@/components/ui-kit";
import { clubMatchPalettes, clubStyle, type ClubPalette } from "@/lib/club-palette";
import {
  isKickoffDateUnconfirmed,
  isKickoffTimeUnconfirmed,
  MATCH_TIME_ZONE,
} from "@/lib/match-kickoff";

/**
 * Match card (Option A "Club colours").
 *
 * One component, one router `<Link>` to `/matches/$matchId`, four shapes:
 *
 *   - `list`     the A-Home / A-Matches row, flat, for a caller's card that
 *                stacks rows one hairline apart: a 4px club edge at each end,
 *                the crest discs, the names, and in the middle the kickoff
 *                time or the score in the display face. Live rows carry the
 *                navy live pill under the score; finished rows put "Terminé"
 *                there and quieten the loser's name.
 *   - `row`      the same row as a card of its own (the default).
 *   - `compact`  the standalone row that always names its round (H2H lists).
 *   - `hero`     Home's live match: the two club colours split down the
 *                middle, each half with its inverse crest disc and name, and
 *                a light score box with the live pill centred over the seam.
 *
 * Club colours come from `clubMatchPalettes(home, away)` — never two
 * independent `clubStyle(club)` calls — so a clash (Wydad v Tétouan) repaints
 * the away edge bar, half and crest together.
 *
 * Direction: home is always the first child, so it sits at the inline start
 * (the right in Arabic) with no direction utility at all: the grid tracks,
 * the split halves and the three-child score all mirror by themselves. Each
 * figure is its own `<bdi>` inside a container that inherits the page
 * direction, so the home score lands on the home side in both languages.
 *
 * Club names truncate on one line in a row, or wrap at word boundaries in the
 * hero halves. They never break inside a word: `break-words` did, and
 * printed "Wyda / d AC" once the crest disc grew.
 *
 * `aria-label` states the whole card (score, minute, status), so the visual
 * content under it is hidden from assistive tech rather than read twice.
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

export type MatchCardVariant = "row" | "list" | "compact" | "hero";

/** A row inside a caller's card: flat, one hairline from its neighbours. The
 *  card clips its children to its radius (that is what tapers the edge bars
 *  into its corners), so the focus ring is drawn inside the row. */
const LIST_FRAME = cn(
  "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
  "hover:bg-[color:var(--ui-surface-sunken)]",
  ui.focus,
  "focus-visible:ring-inset focus-visible:ring-offset-0",
);

/** The same row as a card of its own: the card surface, clipping its edges. */
const CARD_FRAME = cn(
  ui.surface.card,
  "overflow-hidden",
  "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
  ui.focus,
);

/** The split live card: a feature surface, lifted off the page. */
const HERO_FRAME = cn(
  "relative overflow-hidden",
  ui.radius.sheet,
  ui.shadow.lifted,
  "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
  ui.focus,
);

export function MatchCard({
  match,
  home,
  away,
  variant = "row",
  listGameweek,
  extras,
}: {
  match: Match;
  home: Club;
  away: Club;
  variant?: MatchCardVariant;
  /** The gameweek the surrounding page already names. A row from any other
   *  round keeps its "J. n" tag, so a list that spans two rounds never files
   *  a match under the wrong one. */
  listGameweek?: number;
  extras?: MatchCardExtras;
}) {
  const { t, tr, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const kickoff = new Date(match.kickoff);
  // The pair, not two independent palettes: the clash rule may re-colour away.
  const pair = useMemo(() => clubMatchPalettes(home, away), [home, away]);

  const status: ExtendedStatus = extras?.displayStatus ?? match.status;
  const isLive = status === "live" || status === "half_time" || status === "extra_time";
  const isFinished = status === "finished" || status === "penalties";
  const isScheduled = status === "scheduled" || status === "delayed";
  const isPostponed = status === "postponed" || status === "cancelled";
  const unconfirmedDate = isKickoffDateUnconfirmed(match) || status === "cancelled";
  const unconfirmedTime = isKickoffTimeUnconfirmed(match);
  const isHero = variant === "hero";

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

  // A short name that is only a code ("WCA") gives way to the club's name:
  // the crest disc already shows the code. Short names that are words stay —
  // the full Arabic names ("الدفاع الحسني الجديدي") would not fit a row.
  const rowName = (club: Club) => {
    const short = tr(club.shortName);
    return /^[A-Z0-9]{2,6}$/.test(short.trim()) ? tr(club.name) : short;
  };
  const homeName = isHero ? tr(home.name) : rowName(home);
  const awayName = isHero ? tr(away.name) : rowName(away);
  const hs = match.homeScore ?? 0;
  const as = match.awayScore ?? 0;

  // Who lost, for a finished row: that name steps back. A shoot-out decides a
  // level score when its result is known.
  const shootout = status === "penalties" ? extras?.penaltiesScore : undefined;
  const homeMargin = shootout && hs === as ? shootout.home - shootout.away : hs - as;
  const homeLost = isFinished && homeMargin < 0;
  const awayLost = isFinished && homeMargin > 0;

  const showRoundTag =
    variant === "compact" || (!isHero && match.gameweek > 0 && match.gameweek !== listGameweek);

  const a11yLabel = (() => {
    const score = t("matches.a11y.score")
      .replace("{home}", tr(home.name))
      .replace("{hs}", String(hs))
      .replace("{away}", tr(away.name))
      .replace("{as}", String(as));
    if (isLive) {
      const state =
        match.minute === undefined
          ? t("matches.status.live")
          : t("matches.a11y.live_minute").replace("{minute}", String(match.minute));
      return `${score} — ${state}`;
    }
    if (isFinished) return `${score} — ${t("matches.a11y.status_finished")}`;
    if (isScheduled) {
      return `${homeName} ${t("matches.vs")} ${awayName} — ${weekdayFmt} · ${unconfirmedTime ? t("matches.kickoff_unconfirmed") : t("matches.a11y.kickoff_at").replace("{time}", timeFmt)}`;
    }
    return `${homeName} ${t("matches.vs")} ${awayName} — ${t(`matches.a11y.status_${match.status}` as never) || t("matches.status.postponed")}`;
  })();

  /** Three flex children in a container that follows the page direction. */
  const score = (className: string) => (
    <div className={cn("flex items-center gap-1.5", className)}>
      <bdi>{hs}</bdi>
      <span>–</span>
      <bdi>{as}</bdi>
    </div>
  );

  // What sits under the score or the time: the state that changes how the
  // row is read. A scheduled row needs nothing there.
  const caption = (() => {
    if (isLive) {
      return (
        <UiLivePill
          minute={match.minute}
          size={isHero ? "md" : "sm"}
          // Extra time names itself on the pill; the rest of play is "live".
          label={status === "extra_time" ? t("matches.status.extra_time") : undefined}
        />
      );
    }
    if (status === "penalties") {
      return (
        <span className={cn(ui.text.micro, ui.tone.muted)}>
          {extras?.penaltiesScore
            ? `${t("matches.penalty_shootout")} ${extras.penaltiesScore.home}–${extras.penaltiesScore.away}`
            : t("matches.status.penalties")}
        </span>
      );
    }
    if (status === "finished") {
      return isHero ? (
        <span
          className={cn(
            "inline-flex px-2.5 py-1",
            ui.radius.full,
            ui.surface.inkPlain,
            ui.text.label,
          )}
        >
          {t("matches.status.ft")}
        </span>
      ) : (
        <span className={cn(ui.text.micro, "[font-weight:var(--ui-weight-strong)]", ui.tone.muted)}>
          {t("matches.status.ft")}
        </span>
      );
    }
    if (isPostponed) {
      return (
        <UiBadge tone="caution">
          {status === "cancelled" ? t("matches.status.cancelled") : t("matches.status.postponed")}
        </UiBadge>
      );
    }
    if (status === "delayed")
      return <UiBadge tone="caution">{t("matches.status.delayed")}</UiBadge>;
    return null;
  })();

  // The figure in the middle: the score once a match has started, else the
  // kickoff time — or what is actually known when the time is not.
  const figure = (() => {
    if (isLive || isFinished) {
      return score(
        isHero
          ? cn("px-4 py-1", ui.surface.scorebox, ui.radius.card, ui.shadow.lifted, ui.score.lg)
          : cn(ui.score.row, "[font-weight:var(--ui-weight-heavy)]", ui.tone.default),
      );
    }
    if (isPostponed) return null;
    if (unconfirmedDate || unconfirmedTime) {
      // Resolved before the JSX so both keys stay literal: the i18n gate reads
      // translation arguments statically and counts any expression in that
      // position -- even a ternary of two literals -- as opaque.
      let label = t("matches.kickoff_unconfirmed");
      if (unconfirmedDate) label = t("matches.kickoff_date_unconfirmed");
      return <span className={cn("max-w-24", ui.text.micro, ui.tone.muted)}>{label}</span>;
    }
    return isHero ? (
      <bdi
        className={cn(
          "px-4 py-1",
          ui.surface.scorebox,
          ui.radius.card,
          ui.shadow.lifted,
          ui.score.lg,
        )}
      >
        {timeFmt}
      </bdi>
    ) : (
      <bdi className={cn(ui.score.row, ui.tone.default)}>{timeFmt}</bdi>
    );
  })();

  const roundTag = showRoundTag ? (
    <span className={cn(ui.text.micro, "[font-weight:var(--ui-weight-strong)]", ui.tone.muted)}>
      {t("matches.gameweek")} {match.gameweek}
    </span>
  ) : null;

  // A row's cells, padded to the board's 60px with a 32px crest; a live row's
  // first line gives its bottom padding to the pill's line underneath.
  const cellPad = isLive ? "pb-1.5 pt-3" : "py-3.5";

  const nameClass = (lost: boolean) =>
    cn(
      ui.text.secondary,
      lost
        ? cn("[font-weight:var(--ui-weight-strong)]", ui.tone.muted)
        : cn("[font-weight:var(--ui-weight-heavy)]", ui.tone.default),
    );

  const content: ReactNode = isHero ? (
    <>
      {/* The two halves, home first: flex order mirrors in Arabic. */}
      <div className="flex">
        <Half club={home} palette={pair.home} name={homeName} side="home" />
        <Half club={away} palette={pair.away} name={awayName} side="away" />
      </div>
      {/* Centred over the seam without a physical offset: stretched across
          the card, then shrunk to its content and centred by auto margins. */}
      <div className="pointer-events-none absolute inset-x-0 top-4 mx-auto flex w-fit flex-col items-center gap-2">
        {figure}
        {caption}
      </div>
    </>
  ) : (
    // Five tracks: edge | home | figure | away | edge. A live row adds a
    // second line for its pill, spanning the three middle tracks, so the
    // pill never widens the figure's track and squeezes the names.
    <div className="grid grid-cols-[4px_minmax(0,1fr)_auto_minmax(0,1fr)_4px] items-stretch gap-x-2.5">
      <span {...clubStyle(pair.home)} className={cn(ui.club.edgeFill, isLive && "row-span-2")} />
      <div className={cn("flex min-w-0 flex-1 items-center gap-2", cellPad)}>
        <ClubCrest club={home} palette={pair.home} size="sm" />
        <span className={cn("min-w-0 truncate", nameClass(homeLost))}>{homeName}</span>
      </div>
      <div
        className={cn(
          "flex min-w-16 flex-col items-center justify-center gap-1 text-center",
          cellPad,
        )}
      >
        {figure}
        {isLive ? null : caption}
        {roundTag}
      </div>
      <div className={cn("flex min-w-0 flex-1 items-center justify-end gap-2", cellPad)}>
        <span className={cn("min-w-0 truncate text-end", nameClass(awayLost))}>{awayName}</span>
        <ClubCrest club={away} palette={pair.away} size="sm" />
      </div>
      <span {...clubStyle(pair.away)} className={cn(ui.club.edgeFill, isLive && "row-span-2")} />
      {isLive ? <div className="col-[2/5] flex justify-center pb-3">{caption}</div> : null}
    </div>
  );

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      aria-label={a11yLabel}
      className={cn(
        // `min-w-0` is load-bearing, not cosmetic. Every caller renders these
        // cards into a single-column `grid` or a flex column, whose track is
        // sized to the largest item's content-based minimum. The club-name
        // spans are `truncate` (`white-space: nowrap`), so without it the
        // card's minimum is the full, untruncated name, the track grows past
        // the page gutter, and `html, body { overflow-x: clip }` clips the
        // trailing edge away with no scroll to reach it.
        "group block min-w-0",
        isHero ? HERO_FRAME : variant === "list" ? LIST_FRAME : CARD_FRAME,
      )}
    >
      {/* The label above states all of this. */}
      <div aria-hidden>{content}</div>
    </Link>
  );
}

/** One side of the hero: the club's colour, its crest disc and its name. */
function Half({
  club,
  palette,
  name,
  side,
}: {
  club: Club;
  palette: ClubPalette;
  name: string;
  side: "home" | "away";
}) {
  return (
    <div
      {...clubStyle(palette)}
      className={cn(
        // `pt-16` keeps the crest and the name clear of the score box and the
        // live pill centred above them.
        "flex min-w-0 flex-1 flex-col justify-end gap-1.5 pb-3.5 pt-16",
        side === "home" ? "items-start pe-2 ps-3.5" : "items-end pe-3.5 ps-2 text-end",
        ui.club.fill,
      )}
    >
      <ClubCrest club={club} palette={palette} size="md" tone="inverse" />
      {/* Two lines at most, broken between words only. */}
      <p className={cn("line-clamp-2 max-w-full", ui.display.team)}>{name}</p>
    </div>
  );
}
