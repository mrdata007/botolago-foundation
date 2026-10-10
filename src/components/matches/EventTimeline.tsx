import { useState, type ReactNode } from "react";
import { ArrowDownUp, CircleAlert, HeartPulse } from "lucide-react";
import type { MatchLineupDto } from "@/backend/football/contracts";
import { MatchDataState } from "./MatchDataState";
import { ui, UiChip } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { MatchEvent } from "@/services/match-live";
import type { Club } from "@/types/domain";
import { BallIcon } from "./BallIcon";
import { GOAL_EVENT_TYPES, trackArrivals } from "./goal-moment";
import { noEventsMessage, type MatchDataPhase } from "./match-empty-states";

const CARD_TYPES: ReadonlySet<MatchEvent["type"]> = new Set([
  "yellow_card",
  "second_yellow",
  "red_card",
]);
const PERIOD_TYPES: ReadonlySet<MatchEvent["type"]> = new Set(["period_start", "period_end"]);

/**
 * The Résumé tab (A-Match): the provider's key events, one card each.
 *
 * A home event carries the home club's 4px edge on the inline start and reads
 * icon · text · minute; an away event mirrors it — edge on the inline end,
 * minute first, text toward the end, icon last — so each side's events sit on
 * its own side of the column, and Arabic flips both with no extra rule. The
 * colours are the page's resolved pair (`palettes`), so a clash-resolved away
 * club is the same colour here as in the header.
 *
 * Period boundaries are not cards: the end of the first half is drawn as the
 * "MI-TEMPS" rule (before the first second-half event when the provider sent
 * no boundary). The rule carries no score: the half-time score is not in the
 * match data (`toMatch` does not map it), and counting goals out of a
 * timeline that can lag the score would be inventing one. Any other event
 * with no team is a quiet centred line.
 *
 * With no events, the message follows `phase` (see `match-empty-states`): "no
 * key events for now" under a finished 1–3 would deny the four goals.
 */
export function EventTimeline({
  events,
  home,
  away,
  palettes,
  lineups = [],
  isLive,
  phase,
  halfTime,
}: {
  events: readonly MatchEvent[];
  home: Club;
  away: Club;
  palettes: { home: ClubPalette; away: ClubPalette };
  /** Published lineups, only to put names on the events. */
  lineups?: readonly MatchLineupDto[];
  isLive: boolean;
  phase: MatchDataPhase;
  /** The half-time score, when the provider has recorded one: "MI-TEMPS · 1 – 1". */
  halfTime?: { home: number; away: number };
}) {
  const { t, lang } = useI18n();
  // "Moments forts": substitutions are hidden by default, and one tap shows
  // them (the same switch, off). The count is the full match's, not the
  // visible list's.
  const [highlights, setHighlights] = useState(true);
  const substitutionCount = events.filter((event) => event.type === "substitution").length;

  // Events already on screen at first render appear as they are; one that
  // arrives later, on a live refresh, fades in and opens (`event-enter`) so
  // it is noticed. Tracked by id, so a refetch or a language change that
  // returns the same events animates nothing.
  const [seen, setSeen] = useState<ReadonlySet<string>>(
    () => new Set(events.map((event) => event.id)),
  );
  const [entering, setEntering] = useState<ReadonlySet<string>>(() => new Set());
  const arrival = trackArrivals(seen, events);
  if (arrival.arrived.length > 0 && arrival.seen) {
    // Adjusting state while rendering, so the new row's first paint already
    // carries the animation instead of flashing in before it starts.
    setSeen(arrival.seen);
    if (isLive) setEntering(new Set([...entering, ...arrival.arrived.map((event) => event.id)]));
  }
  const settle = (id: string) =>
    setEntering((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  // Period boundaries are not cards. The end of the first half becomes the
  // half-time rule (so it shows during the break too); without one, the rule
  // goes before the first second-half event. Other boundaries are dropped:
  // the rule and the header's status already say where the match is.
  const pool = highlights ? events.filter((event) => event.type !== "substitution") : events;
  const halfTimeEnd = pool.find((event) => event.type === "period_end" && event.minute === 45)?.id;
  const firstSecondHalf = halfTimeEnd
    ? undefined
    : pool.find((event) => event.minute > 45 && !PERIOD_TYPES.has(event.type))?.id;
  const shown = pool.filter((event) => !PERIOD_TYPES.has(event.type) || event.id === halfTimeEnd);

  if (events.length === 0 || (shown.length === 0 && substitutionCount === 0)) {
    return <MatchDataState phase={phase} message={noEventsMessage(phase, t)} />;
  }

  const names = new Map(
    lineups.flatMap((lineup) =>
      lineup.players.map((player) => [player.id, player.displayName] as const),
    ),
  );

  return (
    <>
      {substitutionCount > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <UiChip selected={highlights} onClick={() => setHighlights((on) => !on)}>
            {t("matches.timeline.highlights")}
          </UiChip>
          {highlights ? (
            <button
              type="button"
              onClick={() => setHighlights(false)}
              className={cn("min-h-[var(--ui-tap-min)] px-1", ui.text.meta, ui.tone.ink, ui.focus)}
            >
              {showSubstitutionsLabel(substitutionCount, lang, t)}
            </button>
          ) : null}
        </div>
      ) : null}
      <ol className="grid gap-2.5">
        {shown.map((event) => {
          if (event.id === halfTimeEnd) {
            return (
              <li key={event.id}>
                <HalfTimeDivider score={halfTime} />
              </li>
            );
          }
          const isEntering = entering.has(event.id);
          return (
            <li key={event.id} className="contents">
              {event.id === firstSecondHalf && <HalfTimeDivider score={halfTime} />}
              <div
                className={cn(isEntering && "event-enter")}
                onAnimationEnd={(animation) => {
                  if (isEntering && animation.target === animation.currentTarget) settle(event.id);
                }}
              >
                <div className={cn(isEntering && "min-h-0 overflow-hidden")}>
                  <EventRow
                    event={event}
                    club={event.side === "home" ? home : event.side === "away" ? away : undefined}
                    palette={
                      event.side === "home"
                        ? palettes.home
                        : event.side === "away"
                          ? palettes.away
                          : undefined
                    }
                    nameOf={(id) => (id ? names.get(id) : undefined)}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** "Afficher les 4 remplacements" / "إظهار 4 تبديلات", each form its own literal key. */
function showSubstitutionsLabel(
  n: number,
  lang: "fr" | "ar",
  t: (key: TranslationKey) => string,
): string {
  let rule = new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(n);
  // The one and two keys spell their number out; French also files 0 under
  // "one". They are for exactly 1 and 2.
  if ((rule === "one" && n !== 1) || (rule === "two" && n !== 2)) rule = "other";
  const template =
    rule === "one"
      ? t("matches.timeline.show_subs_one")
      : rule === "two"
        ? t("matches.timeline.show_subs_two")
        : rule === "few"
          ? t("matches.timeline.show_subs_few")
          : t("matches.timeline.show_subs_other");
  return template.replace("{n}", String(n));
}

/** "MI-TEMPS" between two hairlines, with the half-time score when there is
 * one. Plain text, not `role="separator"`, whose content assistive tech does
 * not read. */
function HalfTimeDivider({ score }: { score?: { home: number; away: number } }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <span aria-hidden className="h-px flex-1 bg-[color:var(--ui-rule)]" />
      {/* `ui.text.label` letter-spaces Latin only (BG-0069). */}
      <span className={cn("flex items-center gap-1.5", ui.text.label, ui.tone.muted)}>
        {t("matches.status.ht")}
        {score ? (
          // Home first in the source, so Arabic puts it on the right, as the
          // header does; each figure isolated, the row a plain flex box.
          <span className={cn("flex items-center gap-1", ui.text.tabular)}>
            <span aria-hidden>·</span>
            <bdi>{score.home}</bdi>
            <span>–</span>
            <bdi>{score.away}</bdi>
          </span>
        ) : null}
      </span>
      <span aria-hidden className="h-px flex-1 bg-[color:var(--ui-rule)]" />
    </div>
  );
}

/** "63′", "45+2′": the digits in the display face, the prime in the body face (Changa has none). */
function Minute({ event, className }: { event: MatchEvent; className?: string }) {
  return (
    <bdi className={cn("shrink-0", ui.score.row, className)}>
      {event.minute}
      {event.addedTime > 0 ? `+${event.addedTime}` : ""}
      <span className={ui.font.body}>′</span>
    </bdi>
  );
}

function typeLabel(t: (key: TranslationKey) => string, type: MatchEvent["type"]): string {
  // A literal-key switch rather than a lookup table, so every key stays
  // visible to the i18n audit.
  switch (type) {
    case "goal":
      return t("matches.event.goal");
    case "penalty_goal":
      return t("matches.event.penalty");
    case "own_goal":
      return t("matches.event.own_goal");
    case "missed_penalty":
      return t("matches.event.missed_penalty");
    case "yellow_card":
      return t("matches.event.yellow");
    case "second_yellow":
      return t("matches.event.second_yellow");
    case "red_card":
      return t("matches.event.red");
    case "substitution":
      return t("matches.event.sub");
    case "var":
      return t("matches.event.var");
    case "injury":
      return t("matches.event.injury");
    case "period_start":
      return t("matches.event.period_start");
    case "period_end":
      return t("matches.event.period_end");
  }
}

/**
 * The small icon that says what happened, inline beside the player's name on
 * the team's own side. A goal is the ball; a card is the card itself; a
 * substitution the swap arrows; anything else a quiet glyph.
 */
function EventGlyph({ event }: { event: MatchEvent }) {
  const glyph = "h-4.5 w-4.5 shrink-0";
  if (GOAL_EVENT_TYPES.has(event.type)) {
    return <BallIcon className={cn(glyph, ui.tone.club)} />;
  }
  if (CARD_TYPES.has(event.type)) {
    return (
      <span
        aria-hidden
        className={cn(
          "h-4 w-3 shrink-0",
          ui.radius.tight,
          event.type === "yellow_card"
            ? "bg-[color:var(--ui-caution)]"
            : "bg-[color:var(--ui-live)]",
        )}
      />
    );
  }
  if (event.type === "substitution") {
    return <ArrowDownUp aria-hidden className={cn(glyph, ui.tone.club)} />;
  }
  if (event.type === "var") return <CircleAlert aria-hidden className={cn(glyph, ui.tone.muted)} />;
  if (event.type === "injury")
    return <HeartPulse aria-hidden className={cn(glyph, ui.tone.muted)} />;
  // A missed penalty: the ball, quiet.
  return <BallIcon className={cn(glyph, ui.tone.muted)} />;
}

function EventRow({
  event,
  club,
  palette,
  nameOf,
}: {
  event: MatchEvent;
  club?: Club;
  palette?: ClubPalette;
  nameOf: (id: string | null) => string | undefined;
}) {
  const { t, tr } = useI18n();
  const label = typeLabel(t, event.type);

  // Anything the provider did not attribute to a team (a VAR check, say): a
  // centred line, no card, no club colour — there is no side to put it on.
  if (!club || !palette || event.side === null) {
    return (
      <p className={cn("flex items-center justify-center gap-2 py-1", ui.text.meta, ui.tone.muted)}>
        <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
        <span>{label}</span>
        <bdi className={ui.text.tabular}>
          {event.minute}
          {event.addedTime > 0 ? `+${event.addedTime}` : ""}′
        </bdi>
      </p>
    );
  }

  const player = nameOf(event.playerId);
  const related = nameOf(event.relatedPlayerId);
  // The line under the title, from what the data carries: the assist for a
  // goal, the player replaced for a substitution (the provider's related
  // player is the one going off), else the provider's own detail, else the
  // club — which is what a card needs, since it names no one else.
  let sub: ReactNode = null;
  if (GOAL_EVENT_TYPES.has(event.type) && related) {
    sub = `${t("matches.event.assist")} ${related}`;
  } else if (event.type === "substitution" && related) {
    sub = t("matches.event.replaces").replace("{name}", related);
  } else if (event.detail && event.detail !== player) {
    sub = event.detail;
  } else {
    sub = tr(club.shortName);
  }

  const away = event.side === "away";
  const text = (
    <div className={cn("min-w-0", away && "text-end")}>
      <p className={cn("break-words", ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
        {player ? `${label} · ${player}` : label}
      </p>
      {sub ? <p className={cn("break-words", ui.text.meta, ui.tone.muted)}>{sub}</p> : null}
    </div>
  );
  // The minute sits in a pill in the middle of the column: navy for a goal
  // or a penalty, light grey for a card and everything else.
  const decisive = GOAL_EVENT_TYPES.has(event.type);
  const pill = (
    <span
      className={cn(
        "inline-flex items-center justify-center px-2.5 py-1",
        ui.radius.full,
        decisive ? ui.surface.inkPlain : ui.surface.sunken,
      )}
    >
      <Minute event={event} />
    </span>
  );
  // The icon beside the name, on the team's side: first for home, last for away.
  const side = (
    <div className={cn("flex min-w-0 items-center gap-2", away && "justify-end")}>
      {away ? (
        <>
          {text}
          <EventGlyph event={event} />
        </>
      ) : (
        <>
          <EventGlyph event={event} />
          {text}
        </>
      )}
    </div>
  );

  return (
    <div
      {...clubStyle(palette)}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 px-3.5 py-3",
        ui.surface.card,
        away ? ui.edge.end : ui.edge.start,
      )}
    >
      {away ? (
        <>
          <span />
          {pill}
          {side}
        </>
      ) : (
        <>
          {side}
          {pill}
          <span />
        </>
      )}
    </div>
  );
}
