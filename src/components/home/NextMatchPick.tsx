import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { formatShare, questionView, sharesVisible } from "@/components/predictions/match-votes";
import { useMatchVotes } from "@/components/predictions/use-match-votes";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubMatchPalettes, clubStyle, type ClubPalette } from "@/lib/club-palette";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";
import type { MatchVoteChoice } from "@/backend/predictions/contracts";
import type { Club, Match } from "@/types/domain";
import { bandClubName } from "./band-matches";
import { kickoffClock, kickoffDay, pluralForm } from "./kickoff-countdown";
import { useClock } from "./use-clock";

const PANEL = "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_10%,transparent)]";
const PICK_OUTLINE = "border-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_40%,transparent)]";

/**
 * A club's side of the card: the crest above its name, both centred. Beside the
 * crest a phone left a name about 40px, and "Casablanca" ran into the kickoff;
 * under it the name has the whole side. A word longer than the side breaks
 * rather than overflow.
 *
 * The side carries the vote, so it has the room of a tap target (44px tall at
 * least) and a 1px edge in every state (transparent when held or when the vote
 * is closed), so it is as tall as a button as it is as a plain side.
 */
const CLUB_SIDE = cn(
  "flex min-h-[var(--ui-tap-min)] min-w-0 flex-col items-center gap-1.5 border px-1 py-2 text-center",
  ui.radius.card,
);
const CLUB_NAME = cn(
  "min-w-0 max-w-full [overflow-wrap:anywhere]",
  ui.text.secondary,
  "[font-weight:var(--ui-weight-heavy)]",
);

/** The neutral part of the split bar: the draw, which belongs to neither club. */
const DRAW_SEGMENT = "bg-[color:color-mix(in_oklab,var(--ui-on-surface)_35%,var(--ui-surface))]";

/** `clubStyle` with the segment's flex share merged in. */
function segment(palette: ClubPalette, percent: number): { "data-club": ""; style: CSSProperties } {
  const club = clubStyle(palette);
  return { "data-club": club["data-club"], style: { ...club.style, flex: `${percent} 1 0` } };
}

/**
 * The next match, inside Home's navy band: the two clubs, the kickoff and the
 * time left to it, and, when fans can vote on it, "Votre favori ?" with the two
 * clubs as the two vote targets and "Match nul" as a quiet third answer.
 *
 * Owner decision 2026-10-28: the three equal outlined buttons (club, draw,
 * club) read as a 1X2 betting slip, which BotolaGO must never look like. The
 * clubs themselves are what a fan taps; the draw is a line of text. Once the
 * reader has voted, and there are enough votes for a share to mean something
 * (the match page's own rule, `sharesVisible`), the split shows as a bar in the
 * clubs' colours with the percentages at its ends.
 *
 * The tap is the match page's own "who wins" vote (`useMatchVotes`): the same
 * record, the same cache, kept on the account when signed in and on the phone
 * for a visitor. It is not the score prediction of /pronostics, which needs
 * two figures. With no vote to cast (the game is off, the match is not
 * covered, kickoff has passed) the panel is the match alone.
 *
 * The card is one link to the match page: the kickoff block is the link and its
 * area is stretched over the card, with the vote controls above it. Home is on
 * the start side, so Arabic puts it on the right as the score header does. A
 * control is 44px tall at least and says what it picks.
 *
 * The countdown follows the clock (`useClock`, one shared timer) and is the
 * only thing here that depends on the time: the server's render and the first
 * browser render leave its line empty, and the line keeps its height, so
 * nothing moves when it fills. Day words ("Aujourd'hui", "Demain") are the
 * Casablanca calendar's, as every kickoff time on the page.
 *
 * Until the votes are known (the server's render never has them) the vote
 * area's space is held, so the band does not grow when they arrive, but only
 * while a vote is expected (`holdVote`): the caller says no when the match
 * cannot have one (its journée unknown, its kick-off past) or when another
 * card has already found the game closed. The area then closes only if the
 * read finds no vote after all, which the server cannot know beforehand
 * (Pronostics off, or open to testers only).
 *
 * In the band's carousel (`fill`) the panel takes its slide's whole height,
 * the clubs centred in the space above the vote area, so the vote areas of the
 * cards side by side line up and no card is shorter than its neighbour.
 */
export function NextMatchPick({
  match,
  home,
  away,
  withVote,
  fill = false,
  votesEnabled = true,
  holdVote = true,
  onGameClosed,
}: {
  match: Match;
  home: Club;
  away: Club;
  /** Offer the vote: the caller's say, as it holds the Pronostics flag. */
  withVote: boolean;
  /** A slide of the band's carousel: no top margin, and the slide's full height. */
  fill?: boolean;
  /** Read the votes now; the carousel reads the card in view and its neighbours first. */
  votesEnabled?: boolean;
  /** Hold the vote area's place while the votes are read: a vote is expected. */
  holdVote?: boolean;
  /**
   * The read found the game closed to this reader, or failed: true of every
   * match, so the carousel stops holding the area on its other cards.
   */
  onGameClosed?: () => void;
}) {
  const { t, tr, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const now = useClock();
  const kickoff = new Date(match.kickoff);
  const name = (club: Club) => bandClubName(club, tr);
  const palettes = useMemo(() => clubMatchPalettes(home, away), [home, away]);
  const played = match.status === "live" || match.status === "finished";
  const scored = played && match.homeScore !== undefined && match.awayScore !== undefined;

  // The word under the time: "Aujourd'hui" or "Demain" when that is so on the
  // Casablanca calendar, else the weekday. Until the clock is read (the server
  // render) it is the weekday, which does not depend on the time.
  const day = now === null ? null : kickoffDay(match.kickoff, now);
  const weekday = moroccoDateTimeFormat(locale, { weekday: "short" }).format(kickoff);
  const dayWord =
    day === "today"
      ? t("matches.date.today")
      : day === "tomorrow"
        ? t("matches.date.tomorrow")
        : weekday;

  const vote = useVoteState({
    match,
    enabled: withVote && match.status === "scheduled" && votesEnabled,
    wanted: withVote && match.status === "scheduled",
    hold: holdVote,
    onGameClosed,
  });
  const stage = withVote && match.status === "scheduled" ? vote : null;

  const side = (club: Club, palette: ClubPalette, choice: MatchVoteChoice): ReactNode => {
    const face = (
      <>
        <ClubCrest club={club} palette={palette} size="md" tone="inverse" />
        <span className={CLUB_NAME}>{name(club)}</span>
      </>
    );
    const view = stage?.view;
    if (!view) {
      return <span className={cn(CLUB_SIDE, "border-transparent")}>{face}</span>;
    }
    const mine = view.options.find((option) => option.choice === choice)?.mine ?? false;
    return (
      <button
        type="button"
        aria-pressed={mine}
        onClick={() => stage!.cast(choice)}
        className={cn(
          CLUB_SIDE,
          "relative z-10",
          ui.focusOnMesh,
          mine
            ? "border-transparent bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)]"
            : PICK_OUTLINE,
        )}
      >
        {face}
        {mine ? (
          <Check
            aria-hidden
            className="absolute end-1.5 top-1.5 size-4 text-[color:var(--ui-ink-fg)]"
          />
        ) : null}
      </button>
    );
  };

  return (
    <div
      className={cn(
        "relative p-3",
        fill ? "flex flex-1 flex-col" : "mt-5",
        ui.radius.card,
        PANEL,
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-[color:var(--ui-on-mesh)]",
      )}
      data-testid="home-next-match"
    >
      <StatusLine match={match} now={now} />

      {stage && (stage.view || stage.holding) ? (
        <p
          aria-hidden={stage.view ? undefined : true}
          className={cn(
            "mb-2 text-center",
            ui.text.label,
            ui.tone.onInkMuted,
            stage.view ? undefined : "invisible",
          )}
        >
          {t("home.pick.title")}
        </p>
      ) : null}

      <div
        role={stage?.view ? "group" : undefined}
        aria-label={stage?.view ? t("home.pick.title") : undefined}
        className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-2", fill && "flex-1")}
      >
        {side(home, palettes.home, "home")}
        <span className="flex flex-col items-center text-center">
          <Link
            to="/matches/$matchId"
            params={{ matchId: match.id }}
            className={cn(
              "flex min-h-[var(--ui-tap-min)] flex-col items-center justify-center rounded-[var(--ui-radius-control)] after:absolute after:inset-0 after:content-['']",
              "focus-visible:outline-none",
            )}
          >
            <span className="sr-only">
              {name(home)} – {name(away)}
              {", "}
            </span>
            {scored ? (
              <span className={cn("flex items-center gap-1.5", ui.score.row, ui.text.tabular)}>
                <bdi>{match.homeScore}</bdi>
                <span aria-hidden>–</span>
                <bdi>{match.awayScore}</bdi>
              </span>
            ) : (
              <bdi className={cn(ui.score.row, ui.text.tabular)}>
                {moroccoDateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
                  kickoff,
                )}
              </bdi>
            )}
            <span className={cn(ui.text.micro, ui.tone.onInkMuted)}>{dayWord}</span>
          </Link>
        </span>
        {side(away, palettes.away, "away")}
      </div>

      {stage && (stage.view || stage.holding) ? (
        <DrawAndSplit
          stage={stage}
          palettes={palettes}
          homeName={name(home)}
          awayName={name(away)}
        />
      ) : null}
    </div>
  );
}

/**
 * The stage of the card, over the clubs: how long to the kickoff, the loudest
 * thing on the card (owner direction 2026-10-28). A small "Coup d'envoi dans"
 * and the time left in the display face ("1 h 23"), in fresh turf on the navy
 * band; "En direct" or "Terminé" once the match is on or over. Its two lines
 * are held from the first render (the server's render and the browser's first
 * draw the same two empty lines), so the countdown filling in moves nothing.
 * A match whose date or time is not confirmed has nothing to say here.
 */
function StatusLine({ match, now }: { match: Match; now: number | null }) {
  const { t, lang } = useI18n();
  const box = "mb-2 flex flex-col items-center text-center";
  const caption = cn(ui.text.label, ui.tone.onInkMuted);
  const figures = cn(
    ui.score.md,
    "text-[color:var(--ui-accent-spring)] [&_[data-unit]]:mx-0.5 [&_[data-unit]]:text-[length:var(--ui-text-body)] [&_[data-unit]]:[font-weight:var(--ui-weight-heavy)]",
  );
  if (match.status === "live" || match.status === "finished") {
    const word = match.status === "live" ? t("matches.status.live") : t("matches.status.finished");
    return (
      <p className={box} data-testid="home-kickoff-countdown" data-state={match.status}>
        <span className={cn(ui.score.sm, "text-[color:var(--ui-accent-spring)]")}>{word}</span>
      </p>
    );
  }
  if (match.status !== "scheduled") return null;
  if (now === null) {
    // The server's render and the first browser render: the lines' room only.
    return (
      <p className={box} data-testid="home-kickoff-countdown" data-state="pending" aria-hidden>
        <span className={caption}>{" "}</span>
        <span className={figures}>{" "}</span>
      </p>
    );
  }
  const clock = kickoffClock(match, now);
  if (clock.kind === "unconfirmed") return null;
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    useGrouping: false,
  });
  const number = (value: number, pad = false) => (
    <bdi className={ui.text.tabular}>{pad ? String(value).padStart(2, "0") : nf.format(value)}</bdi>
  );
  let label: string;
  let value: ReactNode;
  if (clock.kind === "imminent" || clock.kind === "waiting") {
    label = t("home.kickoff.label");
    value = clock.kind === "imminent" ? t("home.kickoff.imminent") : t("home.kickoff.waiting");
  } else {
    label = t("home.kickoff.in");
    // Each unit is worded for its count (`pluralForm`): "1 h", "58 min" in
    // French; "ساعة", "ساعتان", "5 ساعات", "58 دقيقة" in Arabic.
    const unit = (forms: string, count: number) => {
      const form = pluralForm(forms, count, lang);
      if (!form.includes("{n}")) return <span>{form}</span>;
      const [before = "", after = ""] = form.split("{n}");
      return (
        <span>
          {before ? <span data-unit>{before}</span> : null}
          {number(count)}
          {after ? <span data-unit>{after}</span> : null}
        </span>
      );
    };
    const days = unit(t("home.kickoff.unit_day"), clock.days);
    const hours = unit(t("home.kickoff.unit_hour"), clock.hours);
    if (clock.days > 0) value = fillTemplate(t("home.kickoff.in_days"), { d: days, h: hours });
    else if (clock.hours > 0)
      value =
        lang === "ar" && clock.minutes === 0
          ? hours
          : fillTemplate(t("home.kickoff.in_hours"), {
              h: hours,
              // French: "1 h 05", not "1 h 5", the minutes a pair of figures.
              // Arabic names them ("23 دقيقة").
              m:
                lang === "ar"
                  ? unit(t("home.kickoff.unit_minute"), clock.minutes)
                  : number(clock.minutes, true),
            });
    else value = unit(t("home.kickoff.unit_minute"), clock.minutes);
  }
  return (
    <p className={box} data-testid="home-kickoff-countdown" data-state={clock.kind}>
      <span className={caption}>{label}</span>
      <span className={figures}>{value}</span>
    </p>
  );
}

/**
 * "{h} h {m}" with its figures as nodes, so each can be isolated; what is not a
 * figure is a unit word, set small beside them.
 */
function fillTemplate(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{[a-z]+\})/).map((part, index) => {
    const key = /^\{([a-z]+)\}$/.exec(part)?.[1];
    if (key && key in values) return <span key={index}>{values[key]}</span>;
    return part.trim() ? (
      <span key={index} data-unit>
        {part}
      </span>
    ) : (
      part
    );
  });
}

/** What the vote area needs from the votes: the view to draw, or to hold. */
function useVoteState({
  match,
  enabled,
  wanted,
  hold,
  onGameClosed,
}: {
  match: Match;
  enabled: boolean;
  wanted: boolean;
  hold: boolean;
  onGameClosed?: () => void;
}) {
  const votes = useMatchVotes(match.id, { enabled });
  const dto = votes.votes;
  // Closed to this reader (or unreadable) is not this match's own state.
  const gameClosed = wanted && (dto ? !dto.allowed : votes.failed);
  useEffect(() => {
    if (gameClosed) onGameClosed?.();
  }, [gameClosed, onGameClosed]);
  const winner =
    wanted && dto?.allowed && dto.covered && dto.open
      ? dto.questions.find((entry) => entry.question === "winner")
      : undefined;
  const view = winner
    ? questionView(winner, votes.uid ? null : (votes.phone.winner ?? null))
    : undefined;
  return {
    view,
    holding: hold && !view && votes.pending,
    cast: (choice: MatchVoteChoice) => votes.cast("winner", choice),
  };
}

type VoteStage = ReturnType<typeof useVoteState>;

/**
 * Under the clubs: "Match nul" as a line of text, and, once the reader has
 * voted and the shares mean something, the split bar and the percentages
 * (home at the start, the draw in the middle, away at the end).
 *
 * The row and the bar are there before the vote too (the bar invisible), so a
 * vote moves nothing. While the votes are read the same room is held, in the
 * same shape, hidden from assistive tech.
 */
function DrawAndSplit({
  stage,
  palettes,
  homeName,
  awayName,
}: {
  stage: VoteStage;
  palettes: { home: ClubPalette; away: ClubPalette };
  homeName: string;
  awayName: string;
}) {
  const { t, lang } = useI18n();
  const view = stage.view;
  const share = (choice: MatchVoteChoice) => view?.options.find((o) => o.choice === choice);
  const revealed = !!view && view.mine !== null && sharesVisible(view.total);
  const homeShare = share("home");
  const drawShare = share("draw");
  const awayShare = share("away");
  const drawMine = drawShare?.mine ?? false;
  const pct = (percent: number | undefined) => (
    <bdi className={ui.text.tabular}>{formatShare(percent ?? 0, lang)}</bdi>
  );
  // The clubs' shares are the loud figures of the result (display face); the
  // draw's stays a quiet line of text.
  const figure = cn(ui.score.row, ui.tone.onInkPlain);

  return (
    <div
      className="mt-1"
      aria-hidden={view ? undefined : true}
      data-testid={view ? "home-vote-split" : "home-vote-hold"}
      data-revealed={view ? revealed : undefined}
    >
      <div className="grid min-h-[var(--ui-tap-min)] grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className={cn("justify-self-start", figure, !revealed && "invisible")}>
          {revealed ? (
            <>
              <span className="sr-only">{homeName} </span>
              {pct(homeShare?.percent)}
            </>
          ) : (
            " "
          )}
        </span>
        {view ? (
          <button
            type="button"
            aria-pressed={drawMine}
            onClick={() => stage.cast("draw")}
            className={cn(
              "relative z-10 flex min-h-[var(--ui-tap-min)] items-center gap-1 px-2 underline-offset-4",
              ui.radius.control,
              ui.text.secondary,
              ui.focusOnMesh,
              drawMine
                ? cn("[font-weight:var(--ui-weight-heavy)] underline", ui.tone.onInkPlain)
                : cn(ui.tone.onInkMuted, "hover:underline"),
            )}
          >
            {drawMine ? <Check aria-hidden className="size-4" /> : null}
            <span>{t("predictions.votes.draw")}</span>
            {revealed ? <span aria-hidden>{pct(drawShare?.percent)}</span> : null}
            {revealed ? (
              <span className="sr-only">{formatShare(drawShare?.percent ?? 0, lang)}</span>
            ) : null}
          </button>
        ) : (
          <span
            className={cn(
              "invisible flex min-h-[var(--ui-tap-min)] items-center px-2",
              ui.text.secondary,
            )}
          >
            {t("predictions.votes.draw")}
          </span>
        )}
        <span className={cn("justify-self-end", figure, !revealed && "invisible")}>
          {revealed ? (
            <>
              <span className="sr-only">{awayName} </span>
              {pct(awayShare?.percent)}
            </>
          ) : (
            " "
          )}
        </span>
      </div>
      {/* The bar: a plate in the surface colour (the clubs' edge colours are
          measured against it), the two clubs' fills, the draw between them in
          a neutral. The figures above carry the numbers; the bar is their
          shape, so it is hidden from assistive tech. */}
      <div
        aria-hidden
        data-testid="home-vote-bar"
        className={cn(
          "mt-1 flex h-4 gap-0.5 rounded-full bg-[color:var(--ui-surface)] p-[2px]",
          !revealed && "invisible",
        )}
      >
        <span
          {...segment(palettes.home, homeShare?.percent ?? 0)}
          className={cn("min-w-0 rounded-full", ui.club.fillOnly, ui.club.ring)}
        />
        <span
          style={{ flex: `${drawShare?.percent ?? 0} 1 0` }}
          className={cn("min-w-0 rounded-full", DRAW_SEGMENT)}
        />
        <span
          {...segment(palettes.away, awayShare?.percent ?? 0)}
          className={cn("min-w-0 rounded-full", ui.club.fillOnly, ui.club.ring)}
        />
      </div>
    </div>
  );
}
