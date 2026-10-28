import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { countdownText, formatDeadline, useSecondCountdown } from "@/components/fpl/deadline";
import { deadlineHeadline } from "@/components/fantasy/gameweek-presentation";
import { useLiveMatches } from "@/components/matches/use-live-matches";
import { ui, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { DeadlineChecklist } from "@/lib/deadline-checklist";
import type { Gameweek } from "@/types/domain";
import { noMatchLabel, transfersLabel } from "./deadline-card-copy";

/**
 * The Fantasy hub's deadline card: the deadline that matters now, a live
 * countdown in three tiles, and — for a manager with a team — what is still to
 * check before the deadline and the two places to do it.
 *
 * It follows the game (`deadlineHeadline`). Before a round's deadline the card
 * is about that round. Once the deadline has passed it leads with the next
 * round's deadline (the server's own date, with the time left) and the round
 * being played becomes a line under it ("Journée 5 en cours"); with no later
 * deadline published it says so in words, with no date.
 *
 * A navy card in both themes: the action gradient belongs to the page's
 * primary button (DESIGN.md, Earned Gradient Rule), not to a slab. The tiles
 * are plain surface so their figures keep full contrast. "Journée 14 · Date
 * limite" stays ONE element: the e2e journey finds the hub by that exact text.
 *
 * The live dot is shown only while a match of the round is in play, read from
 * the live strip's own list; otherwise the line just says the round is in
 * progress.
 *
 * `checklist` and `freeTransfers` are only given for an owner, and the
 * checklist only shows while the deadline is ahead: after it there is nothing
 * left to check.
 */
export function DeadlineCard({
  gameweek,
  checklist,
  freeTransfers,
}: {
  gameweek: Gameweek;
  checklist?: DeadlineChecklist;
  freeTransfers?: number;
}) {
  const { t, lang } = useI18n();
  // Latin digits in both languages (BG-0157), the padding zero included. The
  // Arabic-Indic zero (U+0660) used here before read as a dot next to a Latin
  // digit, so 4 minutes did not read as "04".
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR");
  const now = useNow(5_000);
  const headline = deadlineHeadline({ gameweek, now, liveRounds: null });
  const lead = headline.lead;
  const parts = useSecondCountdown(lead?.deadline);
  const pad = (value: number) => nf.format(value).padStart(2, "0");
  const dash = "–";
  // From a full day out the tiles read days, hours and minutes ("2 j 1 h"),
  // not "49 heures"; inside the last day they tick hours, minutes and seconds.
  const days = parts ? Math.floor(parts.hours / 24) : 0;
  const tiles = parts
    ? days >= 1
      ? ([
          [pad(days), t("fantasy.deadline_card.days")],
          [pad(parts.hours % 24), t("fantasy.deadline_card.hours")],
          [pad(parts.minutes), t("fantasy.deadline_card.minutes")],
        ] as const)
      : ([
          [pad(parts.hours), t("fantasy.deadline_card.hours")],
          [pad(parts.minutes), t("fantasy.deadline_card.minutes")],
          [pad(parts.seconds), t("fantasy.deadline_card.seconds")],
        ] as const)
    : ([
        [dash, t("fantasy.deadline_card.hours")],
        [dash, t("fantasy.deadline_card.minutes")],
        [dash, t("fantasy.deadline_card.seconds")],
      ] as const);

  return (
    <section
      aria-label={`${t("fpl.gameweek")} ${(lead ?? headline.current).number}`}
      className={cn("py-3", ui.space.gutter)}
      data-testid="deadline-card"
      data-state={headline.state}
    >
      <div className={cn("p-4", ui.radius.sheet, ui.surface.inkControl)}>
        {lead ? (
          <>
            {/* One element, "Journée 14 · Date limite" — pinned by the e2e journey. */}
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className={cn(ui.display.title, "uppercase")}>
                {`${t("fpl.gameweek")} ${lead.number}`}
              </span>{" "}
              <span
                className={cn(ui.text.label, ui.tone.onInkMuted)}
              >{`· ${t("fpl.deadline")}`}</span>
            </p>
            <p className={cn("mt-0.5", ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
              <bdi>{formatDeadline(lead.deadline, lang, { weekday: "short" })}</bdi>
            </p>
            {/* The ticking figures are hidden from assistive tech; one
                sentence says the time left, and changes once a minute. */}
            <span className="sr-only">
              {parts
                ? countdownText({ days, hours: parts.hours % 24, minutes: parts.minutes }, t)
                : null}
            </span>
            <div aria-hidden className="mt-3 grid grid-cols-3 gap-2">
              {tiles.map(([value, label]) => (
                <div
                  key={label}
                  className={cn(
                    "flex flex-col items-center px-1 py-2",
                    ui.radius.card,
                    ui.surface.card,
                  )}
                >
                  <bdi className={cn(ui.score.md, ui.text.tabular, ui.tone.ink)}>{value}</bdi>
                  <span className={cn(ui.text.micro, ui.tone.muted)}>{label}</span>
                </div>
              ))}
            </div>
            {headline.current ? (
              <p className={cn("mt-3", ui.text.label, ui.tone.onInkMuted)}>
                <RoundLine gameweek={gameweek} now={now} />
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className={cn(ui.display.title, "uppercase")}>
              <RoundLine gameweek={gameweek} now={now} />
            </p>
            <p className={cn("mt-1", ui.text.secondary, ui.tone.onInkMuted)}>
              {t("fantasy.deadline_card.next_unpublished")}
            </p>
          </>
        )}

        {checklist && headline.state === "open" ? (
          <ul className="mt-3 grid gap-1.5">
            <CheckItem ok={checklist.startersSet === 11}>
              {checklist.startersSet === 11
                ? t("fantasy.deadline_card.starters_ok")
                : t("fantasy.deadline_card.starters_missing").replace(
                    "{n}",
                    nf.format(checklist.startersSet),
                  )}
            </CheckItem>
            <CheckItem ok={checklist.captainSet}>
              {checklist.captainSet
                ? t("fantasy.deadline_card.captain_ok")
                : t("fantasy.deadline_card.captain_missing")}
            </CheckItem>
            {checklist.startersWithoutMatch ? (
              <CheckItem ok={false} warning>
                {noMatchLabel(checklist.startersWithoutMatch, gameweek.number, lang, t, nf.format)}
              </CheckItem>
            ) : null}
          </ul>
        ) : null}

        {checklist ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <UiLinkButton
              to="/fantasy/team"
              variant="light"
              size="sm"
              className="min-w-0 whitespace-normal text-center leading-tight"
            >
              {t("fantasy.tab.team")}
            </UiLinkButton>
            <UiLinkButton
              to="/fantasy/transfers"
              variant="light"
              size="sm"
              className="min-w-0 whitespace-normal text-center leading-tight"
            >
              {freeTransfers === undefined
                ? t("fantasy.transfers")
                : transfersLabel(freeTransfers, lang, t, nf.format)}
            </UiLinkButton>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The clock, re-read on an interval. Starts from the render's own clock rather
 * than `null`: the card is only drawn once the gameweek has loaded, and the
 * state it shows must not flip a moment later.
 */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Where the round that is past its deadline stands: "Journée 5 en cours",
 * "… terminée", "… annulée", or "… en direct" with the breathing dot. The dot
 * and the word "en direct" need a match of this round in play in the app's
 * live list; the round's own status is not enough (a round stays `live` through
 * the hours between its matches). Only drawn once the card is past a deadline,
 * so the live list is only read then.
 */
function RoundLine({ gameweek, now }: { gameweek: Gameweek; now: number }) {
  const { t, lang } = useI18n();
  const live = useLiveMatches();
  const headline = deadlineHeadline({
    gameweek,
    now,
    liveRounds: live.data ? live.data.matches.map((match) => match.gameweek) : null,
  });
  const current = headline.current;
  if (!current) return null;
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR");
  const template = headline.live
    ? t("fantasy.deadline_card.round_live")
    : current.phase === "finished"
      ? t("fantasy.deadline_card.round_finished")
      : current.phase === "cancelled"
        ? t("fantasy.deadline_card.round_cancelled")
        : t("fantasy.deadline_card.round_in_progress");
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" data-live={headline.live}>
      {headline.live ? (
        <span
          aria-hidden
          className={cn(
            "live-breathe h-1.5 w-1.5 shrink-0 bg-[color:var(--ui-live)]",
            ui.radius.full,
          )}
        />
      ) : null}
      <span className="min-w-0">{template.replace("{n}", nf.format(current.number))}</span>
    </span>
  );
}

/** One line of the checklist: a tick when done, a warning when it needs a look. */
function CheckItem({
  ok,
  warning = false,
  children,
}: {
  ok: boolean;
  warning?: boolean;
  children: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center",
          ui.radius.full,
          ui.surface.card,
          warning || !ok ? "text-[color:var(--ui-caution)]" : "text-[color:var(--ui-positive)]",
        )}
      >
        {warning || !ok ? <TriangleAlert className="h-3 w-3" /> : <Check className="h-3 w-3" />}
      </span>
      <span className={cn("min-w-0", ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
        {children}
      </span>
    </li>
  );
}
