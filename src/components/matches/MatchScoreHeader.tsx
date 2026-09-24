import { useState, type ReactNode, type Ref } from "react";
import { CalendarClock, MapPin, Plus } from "lucide-react";
import type { MatchLineupDto } from "@/backend/football/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ui, UiLivePill } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import {
  isKickoffDateUnconfirmed,
  isKickoffTimeUnconfirmed,
  MATCH_TIME_ZONE,
} from "@/lib/match-kickoff";
import { cn } from "@/lib/utils";
import type { MatchEvent } from "@/services/match-live";
import type { Club, Match } from "@/types/domain";
import { BallIcon } from "./BallIcon";
import { GOAL_EVENT_TYPES } from "./goal-moment";

/** The navy status pill under the score box, in the live pill's shape. */
const STATUS_PILL = cn(
  "inline-flex items-center whitespace-nowrap px-2.5 py-1",
  ui.radius.full,
  ui.text.label,
);

/**
 * The match hero (A-Match): a split header in the two clubs' colours.
 *
 * Home is the first half and away the second, so Arabic puts home on the
 * right with no extra rule — and the score box, whose three figures sit in a
 * container that inherits the page direction, agrees with it. The colours are
 * the pair `clubMatchPalettes` resolved (`palettes`), so two red clubs never
 * paint one red slab: the away half takes its second colour or the ink.
 *
 * Under the split: the elapsed-time bar while live, then a white band with
 * the scorers (and, behind the round "+", the assists and cards), or the
 * kick-off and venue for a match that is not live.
 *
 * Full-bleed on a phone, as the board draws it; from `sm` up it is a feature
 * card (`--ui-radius-sheet`, lifted) inside the content column.
 *
 * The page's `<h1>` lives here, visually hidden: the two team names ARE the
 * heading, but they sit in two separate halves.
 */
export function MatchScoreHeader({
  match,
  home,
  away,
  palettes,
  elapsed,
  events = [],
  lineups = [],
  headingId,
  ref,
}: {
  match: Match;
  home: Club;
  away: Club;
  /** The resolved pair from `clubMatchPalettes(home, away)`. */
  palettes: { home: ClubPalette; away: ClubPalette };
  elapsed: number;
  /** Key events, for the scorers under the score. */
  events?: readonly MatchEvent[];
  /** Published lineups, used only to put names on those events. */
  lineups?: readonly MatchLineupDto[];
  headingId: string;
  /** The header's root, which the page watches to swap in its compact bar. */
  ref?: Ref<HTMLElement>;
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
  // A postponed match has no day either, so the meta line drops the date
  // rather than pairing a real weekday with "Date à confirmer".
  const displayedKickoff = unconfirmedDate
    ? t("matches.kickoff_date_unconfirmed")
    : `${dateFmt} · ${unconfirmedTime ? t("matches.kickoff_unconfirmed") : timeFmt}`;
  const venue = tr(match.venue).trim();

  const hs = match.homeScore ?? 0;
  const as = match.awayScore ?? 0;
  const scoreA11y = t("matches.a11y.score")
    .replace("{home}", tr(home.shortName))
    .replace("{hs}", String(hs))
    .replace("{away}", tr(away.shortName))
    .replace("{as}", String(as));

  const showScore = isLive || isFinished;
  const hasScorers = showScore && hasScoreEvents(events);
  const showMeta = !isLive;

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={cn(
        // Flush under the top bar and edge to edge on a phone (cancelling the
        // screen's gutter and top padding); a lifted feature card from `sm`.
        "relative -mx-[var(--ui-gutter)] -mt-4 overflow-hidden",
        "sm:mx-0 sm:mt-0 sm:rounded-[var(--ui-radius-sheet)] sm:shadow-[var(--ui-shadow-lifted)]",
      )}
    >
      <h1 id={headingId} className="sr-only">
        {`${tr(home.name)} ${t("matches.vs")} ${tr(away.name)}`}
      </h1>

      <div className="relative flex">
        <TeamHalf club={home} palette={palettes.home} side="home" />
        <TeamHalf club={away} palette={palettes.away} side="away" />

        {/* Centred over the seam by a full-width flex overlay — no
            `left: 50%`, which would stay on the left in Arabic — and
            anchored to the crest row, as the board draws it: the wide score
            box sits beside the crests, and only the narrow status pill
            shares the name row, so a two-line name ("Maghreb Tétouan", any
            Arabic name) never runs under the box. `pt-11` is the halves'
            top padding less 4px, so the box clears the names below it. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2.5 pt-11">
          {showScore ? (
            // One polite announcement per score change: the sentence, not
            // the three glyphs, which are hidden from assistive tech.
            <div
              aria-live={isLive ? "polite" : undefined}
              aria-atomic="true"
              className={cn("px-4 py-1", ui.surface.scorebox, ui.radius.card, ui.shadow.lifted)}
            >
              <span className="sr-only">{scoreA11y}</span>
              <span aria-hidden className={cn("flex items-center gap-3", ui.score.hero)}>
                <bdi>{hs}</bdi>
                <span>–</span>
                <bdi>{as}</bdi>
              </span>
            </div>
          ) : isScheduled ? (
            <div className={cn("px-4 py-1", ui.surface.scorebox, ui.radius.card, ui.shadow.lifted)}>
              {unconfirmedDate || unconfirmedTime ? (
                // Words, not figures: the score type's 1.1 line box is sized
                // for digits and would cut Arabic letters.
                <span
                  className={cn(
                    "block max-w-28 py-2 text-center",
                    ui.text.secondary,
                    "[font-weight:var(--ui-weight-heavy)]",
                  )}
                >
                  {unconfirmedDate
                    ? t("matches.kickoff_date_unconfirmed")
                    : t("matches.kickoff_unconfirmed")}
                </span>
              ) : (
                // A kick-off time is one step down from a score: four
                // digits at the hero size are wider than the seam allows.
                <bdi className={cn("block py-1", ui.score.lg)}>{timeFmt}</bdi>
              )}
            </div>
          ) : null}

          {isLive ? (
            <>
              <UiLivePill size="md" minute={match.minute} />
              {/* The page refreshes itself while live; said once, quietly. */}
              <span className="sr-only">{t("matches.detail.live_updating")}</span>
            </>
          ) : isFinished ? (
            <span className={cn(STATUS_PILL, ui.surface.inkPlain)}>{t("matches.status.ft")}</span>
          ) : isScheduled ? (
            <span className={cn(STATUS_PILL, ui.surface.inkPlain)}>
              {t("matches.status.scheduled")}
            </span>
          ) : isPostponed ? (
            <span
              className={cn(
                STATUS_PILL,
                "bg-[color:var(--ui-caution)] text-[color:var(--ui-on-caution)]",
              )}
            >
              {t("matches.status.postponed")}
            </span>
          ) : null}
        </div>
      </div>

      {isLive && (
        // How far into the 90 minutes, from the inline start (the right in
        // Arabic). Decorative: the pill says the minute.
        <div aria-hidden className="flex h-1.25 bg-[color:var(--ui-rule)]">
          <span
            className="bg-[color:var(--ui-live)] transition-[width] duration-[var(--duration-sheet)] ease-[var(--ease-standard)]"
            style={{ width: `${Math.min(100, (elapsed / 90) * 100)}%` }}
          />
        </div>
      )}

      {(hasScorers || showMeta) && (
        <div className={cn("grid gap-2 px-4 pb-2 pt-3.5", ui.surface.bar, ui.rule.block)}>
          {hasScorers && <ScoreEvents events={events} lineups={lineups} />}
          {showMeta && (
            <div
              className={cn(
                "flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-1.5 text-center",
                ui.text.meta,
                ui.tone.muted,
              )}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                <span className="sr-only">{t("matches.detail.kickoff")}</span>
                <span className={ui.tone.default}>{displayedKickoff}</span>
              </span>
              {/* No venue on record: no line, rather than a label over nothing. */}
              {venue ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="sr-only">{t("matches.detail.venue")}</span>
                  <span className={ui.tone.default}>{venue}</span>
                </span>
              ) : null}
            </div>
          )}
          {isPostponed && (
            <p
              className={cn(
                "mb-2 px-3 py-2 text-center",
                ui.radius.card,
                ui.surface.sunken,
                ui.text.meta,
                ui.tone.muted,
              )}
            >
              {t("matches.detail.postponed_notice")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * One half of the split: the club's fill, its crest as a surface disc, the
 * name in the display face and the city. The inner padding (64px on the
 * seam side) is the room the score box takes over the seam.
 */
function TeamHalf({
  club,
  palette,
  side,
}: {
  club: Club;
  palette: ClubPalette;
  side: "home" | "away";
}) {
  const { tr } = useI18n();
  const city = tr(club.city).trim();
  return (
    <div
      {...clubStyle(palette)}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-2 py-12",
        ui.club.fill,
        side === "home" ? "pe-16 ps-3" : "pe-3 ps-16",
      )}
    >
      <ClubCrest club={club} palette={palette} size="lg" tone="inverse" />
      <p
        className={cn(
          "line-clamp-2 max-w-full break-words text-center text-balance",
          ui.display.teamLg,
        )}
      >
        {tr(club.name)}
      </p>
      {city ? <p className={cn("max-w-full truncate", ui.text.label)}>{city}</p> : null}
    </div>
  );
}

const CARD_TYPES: ReadonlySet<MatchEvent["type"]> = new Set([
  "yellow_card",
  "second_yellow",
  "red_card",
]);

function hasScoreEvents(events: readonly MatchEvent[]) {
  return events.some(
    (event) =>
      event.side !== null && (GOAL_EVENT_TYPES.has(event.type) || CARD_TYPES.has(event.type)),
  );
}

/** "12′", "45+2′" — isolated by the caller in a `<bdi>`. */
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
  const goals = events.filter((event) => GOAL_EVENT_TYPES.has(event.type) && event.side !== null);
  const cards = events.filter((event) => CARD_TYPES.has(event.type) && event.side !== null);
  const hasAssists = goals.some((goal) => nameOf(goal.relatedPlayerId));
  if (goals.length === 0 && cards.length === 0) return null;

  const penaltyLabel = t("matches.detail.penalty_short");
  const ownGoalLabel = t("matches.detail.own_goal_short");
  const assistLabel = t("matches.event.assist");

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
        <p className="line-clamp-2 break-words">
          {scorer && <span className={ui.tone.default}>{scorer} </span>}
          <bdi
            className={cn(ui.text.tabular, ui.tone.muted, "[font-weight:var(--ui-weight-strong)]")}
          >
            {eventMinute(goal)}
          </bdi>
          {note && (
            <span className={cn(ui.tone.muted, "[font-weight:var(--ui-weight-strong)]")}>
              {` (${note})`}
            </span>
          )}
        </p>
        {assist &&
          reveal(
            <p className={cn("line-clamp-2 break-words", ui.text.micro, ui.tone.muted)}>
              {assistLabel} {assist}
            </p>,
          )}
      </li>
    );
  };

  const cardItem = (card: MatchEvent) => {
    const who = nameOf(card.playerId) ?? card.detail ?? undefined;
    const label =
      card.type === "red_card"
        ? t("matches.event.red")
        : card.type === "second_yellow"
          ? t("matches.event.second_yellow")
          : t("matches.event.yellow");
    return (
      <li
        key={card.id}
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          // Home cards read toward the seam, like the home scorers.
          card.side === "home" ? "justify-end" : "flex-row-reverse justify-end",
        )}
      >
        <span className="line-clamp-2 min-w-0 break-words">
          {who && <span className={ui.tone.default}>{who} </span>}
          <bdi className={cn(ui.text.tabular, ui.tone.muted)}>{eventMinute(card)}</bdi>
        </span>
        <span
          aria-label={label}
          role="img"
          className={cn(
            "h-3.5 w-2.5 shrink-0",
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
    <div className={cn("grid gap-2", ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}>
      {goals.length > 0 && (
        <div
          role="group"
          aria-label={t("matches.detail.scorers")}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-3"
        >
          <ul className="grid min-w-0 gap-1 text-end">{homeGoals.map(goalItem)}</ul>
          <BallIcon className={cn("mt-0.5 h-4 w-4", ui.tone.default)} />
          <ul className="grid min-w-0 gap-1 text-start">{awayGoals.map(goalItem)}</ul>
        </div>
      )}

      {cards.length > 0 &&
        reveal(
          <div
            role="group"
            aria-label={t("matches.detail.cards")}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-3",
              goals.length > 0 && "border-t border-dashed border-[color:var(--ui-rule)] pt-2",
            )}
          >
            <ul className="grid min-w-0 gap-1">{homeCards.map(cardItem)}</ul>
            <span className="w-4" aria-hidden />
            <ul className="grid min-w-0 gap-1">{awayCards.map(cardItem)}</ul>
          </div>,
        )}

      {(hasAssists || cards.length > 0) && (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={open ? t("matches.detail.events_hide") : t("matches.detail.events_show")}
          className={cn(
            "group mx-auto grid place-items-center",
            ui.radius.full,
            ui.space.tap,
            ui.focus,
          )}
        >
          <span
            className={cn(
              "grid h-8 w-8 place-items-center transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
              ui.radius.full,
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
