import { useState, type ReactNode } from "react";
import { CalendarClock, Goal, MapPin, Plus, Trophy } from "lucide-react";
import type { MatchLineupDto } from "@/backend/football/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { LiveIndicator } from "@/components/matches/LiveIndicator";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { MatchEvent } from "@/services/match-live";
import type { Club, Match } from "@/types/domain";
import {
  isKickoffDateUnconfirmed,
  isKickoffTimeUnconfirmed,
  MATCH_TIME_ZONE,
} from "@/lib/match-kickoff";
import { ui } from "@/components/ui-kit";
import { stadiumPhotoFor } from "@/lib/stadium-photo";

/**
 * Live-first scoreboard header.
 *
 * State-aware: live shows minute + a match-clock progress bar, finished shows
 * FT, scheduled shows the kickoff time, postponed shows a notice.
 */
export function MatchScoreHeader({
  match,
  home,
  away,
  elapsed,
  events = [],
  lineups = [],
}: {
  match: Match;
  home: Club;
  away: Club;
  elapsed: number;
  /** Key events, for the scorers under the score. */
  events?: readonly MatchEvent[];
  /** Published lineups, used only to put names on those events. */
  lineups?: readonly MatchLineupDto[];
}) {
  const { t, tr, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const kickoff = new Date(match.kickoff);
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(kickoff);
  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(kickoff);

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const isScheduled = match.status === "scheduled";
  const isPostponed = match.status === "postponed";
  const unconfirmedDate = isKickoffDateUnconfirmed(match);
  const unconfirmedTime = isKickoffTimeUnconfirmed(match);
  const displayedTime = unconfirmedDate
    ? t("matches.kickoff_date_unconfirmed")
    : unconfirmedTime
      ? t("matches.kickoff_unconfirmed")
      : timeFmt;
  // A postponed match has no day either, so the meta cell drops the date
  // rather than pairing a real weekday with "Date à confirmer".
  const displayedKickoff = unconfirmedDate ? displayedTime : `${dateFmt} · ${displayedTime}`;
  const venue = tr(match.venue).trim();

  const hs = match.homeScore ?? 0;
  const as = match.awayScore ?? 0;
  const scoreA11y = t("matches.a11y.score")
    .replace("{home}", tr(home.shortName))
    .replace("{hs}", String(hs))
    .replace("{away}", tr(away.shortName))
    .replace("{as}", String(as));

  return (
    <header
      className={cn(
        "relative mt-4 overflow-hidden rounded-[var(--radius-hero)] border border-[var(--border-subtle)]",
        "bg-[color:var(--background-elevated)] px-4 py-5 shadow-card sm:px-6 sm:py-6",
        "animate-in fade-in-0 slide-in-from-bottom-1 duration-500 ease-out",
      )}
    >
      {/* A stadium photograph behind the crests and kick-off, starting below
          the competition line and fading into the card surface at both ends,
          so every line of text keeps the card's own foreground and contrast.
          Decorative. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-12 h-32">
        <img
          src={stadiumPhotoFor(match.id, "bright")}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover object-[50%_60%]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, var(--background-elevated) 0%, color-mix(in oklab, var(--background-elevated) 50%, transparent) 25%, color-mix(in oklab, var(--background-elevated) 85%, transparent) 55%, var(--background-elevated) 72%)",
          }}
        />
      </div>

      <div className="relative flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase ltr:tracking-[0.16em] text-[color:var(--brand-accent)]">
          <Trophy className="h-3.5 w-3.5" aria-hidden />
          {t("matches.competition.botola")} · {t("matches.gameweek")} {match.gameweek}
        </div>
        {isLive ? (
          <LiveIndicator minute={match.minute} size="md" />
        ) : isFinished ? (
          <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[11px] font-black uppercase ltr:tracking-[0.14em] text-[color:var(--text-secondary)]">
            {t("matches.status.ft")}
          </span>
        ) : isScheduled ? (
          <span className="inline-flex items-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[11px] font-black uppercase ltr:tracking-[0.14em] text-[color:var(--text-muted)]">
            {t("matches.status.scheduled")}
          </span>
        ) : isPostponed ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-black uppercase ltr:tracking-[0.14em]"
            style={{
              background: "color-mix(in oklab, var(--color-warning) 14%, transparent)",
              color: "color-mix(in oklab, var(--color-warning) 60%, black)",
            }}
          >
            {t("matches.status.postponed")}
          </span>
        ) : null}
      </div>

      <div
        className="relative mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5"
        role="group"
        aria-label={
          isLive || isFinished
            ? scoreA11y
            : `${tr(home.shortName)} ${t("matches.vs")} ${tr(away.shortName)} — ${displayedKickoff}`
        }
      >
        <TeamColumn club={home} />
        <div className="flex flex-col items-center px-1">
          {isLive || isFinished ? (
            <div
              className="flex items-baseline gap-2 text-5xl font-black tabular-nums ltr:tracking-tight text-foreground sm:text-6xl"
              aria-live={isLive ? "polite" : "off"}
            >
              <span>{hs}</span>
              <span className="text-[color:var(--text-muted)]">–</span>
              <span>{as}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  ui.tone.default,
                  "[font-weight:var(--ui-weight-hero)]",
                  // Both labels take the compact branch. The hero monospace
                  // size is for a four-character clock; "Date à confirmer" in
                  // that slot swells the centre track of a three-column grid
                  // and pushes the team columns under the header's
                  // overflow-hidden on a phone.
                  unconfirmedDate || unconfirmedTime
                    ? cn("max-w-28 text-center", ui.text.secondary)
                    : cn(ui.text.tabular, "text-[calc(var(--ui-text-hero)*1.2)]"),
                )}
              >
                {displayedTime}
              </div>
              <div className="mt-0.5 text-[10px] font-black uppercase ltr:tracking-[0.16em] text-[color:var(--text-muted)]">
                {t("matches.kickoff")}
              </div>
            </div>
          )}
        </div>
        <TeamColumn club={away} />
      </div>

      {(isLive || isFinished) && <ScoreEvents events={events} lineups={lineups} />}

      {isLive && (
        <div className="relative mt-5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase ltr:tracking-[0.14em] text-[color:var(--text-muted)]">
            <span>{t("matches.detail.elapsed")}</span>
            <span className="tabular-nums">{elapsed}′ / 90′</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-hover)]">
            <div
              className="h-full rounded-full bg-[color:var(--color-live)] transition-[width] duration-700"
              style={{ width: `${Math.min(100, (elapsed / 90) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {isPostponed && (
        <p
          className={cn(
            "relative mt-4 px-3 py-2",
            ui.radius.control,
            ui.surface.sunken,
            ui.text.meta,
            ui.tone.muted,
          )}
        >
          {t("matches.detail.postponed_notice")}
        </p>
      )}

      <div
        className={cn(
          "relative mt-5 grid grid-cols-1 gap-2 border-t border-[var(--border-subtle)] pt-3",
          venue ? "sm:grid-cols-3" : "sm:grid-cols-2",
        )}
      >
        <MetaCell
          icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}
          label={t("matches.detail.kickoff")}
          value={displayedKickoff}
        />
        <MetaCell
          icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
          label={t("matches.detail.competition")}
          value={t("matches.competition.botola")}
        />
        {/* No venue on record: no row, rather than a label over nothing. */}
        {venue ? (
          <MetaCell
            icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
            label={t("matches.detail.venue")}
            value={venue}
          />
        ) : null}
      </div>
    </header>
  );
}

const GOAL_TYPES: ReadonlySet<MatchEvent["type"]> = new Set(["goal", "penalty_goal", "own_goal"]);
const CARD_TYPES: ReadonlySet<MatchEvent["type"]> = new Set([
  "yellow_card",
  "second_yellow",
  "red_card",
]);

function eventMinute(event: MatchEvent) {
  return `${event.minute}${event.addedTime > 0 ? `+${event.addedTime}` : ""}′`;
}

/**
 * Scorers under the score (after premierleague.com). Goals always show; the
 * round + opens the assists and the cards, which grow into place while the +
 * turns into ×. Names come from the published lineups, then from the event's
 * own detail text; an event with neither shows its minute alone. Renders
 * nothing for a match with no goals and no cards.
 */
function ScoreEvents({
  events,
  lineups,
}: {
  events: readonly MatchEvent[];
  lineups: readonly MatchLineupDto[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const names = new Map(
    lineups.flatMap((lineup) =>
      lineup.players.map((player) => [player.id, player.displayName] as const),
    ),
  );
  const nameOf = (id: string | null) => (id ? names.get(id) : undefined);
  const goals = events.filter((event) => GOAL_TYPES.has(event.type) && event.side !== null);
  const cards = events.filter((event) => CARD_TYPES.has(event.type) && event.side !== null);
  const hasAssists = goals.some((goal) => nameOf(goal.relatedPlayerId));
  if (goals.length === 0 && cards.length === 0) return null;

  const showLabel = t("matches.detail.events_show");
  const hideLabel = t("matches.detail.events_hide");
  const penaltyLabel = t("matches.detail.penalty_short");
  const ownGoalLabel = t("matches.detail.own_goal_short");
  const assistLabel = t("matches.event.assist");
  const yellowLabel = t("matches.event.yellow");
  const secondYellowLabel = t("matches.event.second_yellow");
  const redLabel = t("matches.event.red");

  // Opens and closes with the + ; hidden from assistive tech while closed.
  const reveal = (children: ReactNode) => (
    <div
      aria-hidden={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-[var(--duration-sheet)] ease-[var(--ease-standard)]",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );

  const goalItem = (goal: MatchEvent) => {
    const scorer = nameOf(goal.playerId) ?? goal.detail ?? undefined;
    const assist = nameOf(goal.relatedPlayerId);
    const note =
      goal.type === "penalty_goal" ? penaltyLabel : goal.type === "own_goal" ? ownGoalLabel : null;
    return (
      <li key={goal.id} className="min-w-0">
        <div className="line-clamp-2 break-words">
          {scorer && <span className={ui.tone.default}>{scorer} </span>}
          <span className={cn(ui.text.tabular, ui.tone.muted)}>{eventMinute(goal)}</span>
          {note && <span className={ui.tone.muted}> ({note})</span>}
        </div>
        {assist &&
          reveal(
            <div className={cn("line-clamp-2 break-words", ui.text.micro, ui.tone.muted)}>
              {assistLabel} {assist}
            </div>,
          )}
      </li>
    );
  };

  const cardItem = (card: MatchEvent) => {
    const who = nameOf(card.playerId) ?? card.detail ?? undefined;
    return (
      <li
        key={card.id}
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          card.side === "home" ? "justify-end" : "flex-row-reverse justify-end",
        )}
      >
        <span className="line-clamp-2 min-w-0 break-words">
          {who && <span className={ui.tone.default}>{who} </span>}
          <span className={cn(ui.text.tabular, ui.tone.muted)}>{eventMinute(card)}</span>
        </span>
        <span
          aria-label={
            card.type === "red_card"
              ? redLabel
              : card.type === "second_yellow"
                ? secondYellowLabel
                : yellowLabel
          }
          role="img"
          className={cn(
            "h-3 w-2.5 shrink-0",
            ui.radius.tight,
            card.type === "yellow_card"
              ? "bg-[color:var(--ui-caution)]"
              : "bg-[color:var(--ui-live)]",
          )}
        />
      </li>
    );
  };

  const homeGoals = goals.filter((goal) => goal.side === "home");
  const awayGoals = goals.filter((goal) => goal.side === "away");
  const homeCards = cards.filter((card) => card.side === "home");
  const awayCards = cards.filter((card) => card.side === "away");

  return (
    <div className={cn("relative mt-4 grid gap-2", ui.text.meta)}>
      {goals.length > 0 && (
        <div
          role="group"
          aria-label={t("matches.detail.scorers")}
          className="grid grid-cols-[1fr_auto_1fr] items-start gap-x-3"
        >
          <ul className="grid min-w-0 gap-1 text-end">{homeGoals.map(goalItem)}</ul>
          <Goal className={cn("mt-0.5 h-3.5 w-3.5", ui.tone.muted)} aria-hidden />
          <ul className="grid min-w-0 gap-1 text-start">{awayGoals.map(goalItem)}</ul>
        </div>
      )}

      {cards.length > 0 &&
        reveal(
          <div
            role="group"
            aria-label={t("matches.detail.cards")}
            className={cn(
              "grid grid-cols-[1fr_auto_1fr] items-start gap-x-3",
              goals.length > 0 && "border-t border-dashed border-[color:var(--ui-rule)] pt-2",
            )}
          >
            <ul className="grid min-w-0 gap-1">{homeCards.map(cardItem)}</ul>
            <span className="w-3.5" aria-hidden />
            <ul className="grid min-w-0 gap-1">{awayCards.map(cardItem)}</ul>
          </div>,
        )}

      {(hasAssists || cards.length > 0) && (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={open ? hideLabel : showLabel}
          className={cn(
            "group mx-auto grid place-items-center rounded-full",
            ui.space.tap,
            ui.focus,
          )}
        >
          <span
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
              ui.surface.sunken,
              ui.tone.ink,
              "group-hover:bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_12%,var(--ui-surface-sunken))]",
            )}
          >
            <Plus
              aria-hidden
              className={cn(
                "h-4 w-4 transition-transform duration-[var(--duration-sheet)] ease-[var(--ease-standard)]",
                open && "rotate-45",
              )}
            />
          </span>
        </button>
      )}
    </div>
  );
}

function TeamColumn({ club }: { club: Club }) {
  const { tr } = useI18n();
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <ClubCrest club={club} size="lg" />
      <div className={cn("min-w-0 text-center", ui.text.bodyStrong, ui.tone.default)}>
        <div className="truncate">{tr(club.shortName)}</div>
        <div className="mt-0.5 truncate text-[10px] font-semibold uppercase ltr:tracking-[0.14em] text-[color:var(--text-muted)]">
          {tr(club.city)}
        </div>
      </div>
    </div>
  );
}

function MetaCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase ltr:tracking-[0.14em] text-[color:var(--text-muted)]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground">{value}</div>
    </div>
  );
}
