import { Check, TriangleAlert } from "lucide-react";

import { GameweekStatusText } from "@/components/fpl/GameweekStatusText";
import { countdownText, formatDeadline, useSecondCountdown } from "@/components/fpl/deadline";
import { nextDeadlineAfter } from "@/components/fantasy/gameweek-presentation";
import { ui, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { DeadlineChecklist } from "@/lib/deadline-checklist";
import type { Gameweek } from "@/types/domain";
import { noMatchLabel, transfersLabel } from "./deadline-card-copy";

/**
 * The Fantasy hub's deadline card: the round and its date, a live countdown
 * in three tiles, and — for a manager with a team — what is still to check
 * before the deadline and the two places to do it.
 *
 * The action gradient with `--ui-ink-deep` throughout, the pairing it is
 * specified for in both themes; the tiles are plain surface so their figures
 * keep full contrast. "Journée 14 · Date limite" stays ONE element: the e2e
 * journey finds the hub by that exact text.
 *
 * `checklist` and `freeTransfers` are only given for an owner; a visitor sees
 * the round, the date and the countdown. After the deadline the tiles give
 * way to the round's state and the next deadline, as the old band did.
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
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const parts = useSecondCountdown(gameweek.deadline);
  const passed = parts?.passed === true;
  const next = passed ? nextDeadlineAfter(gameweek, Date.now()) : null;
  const pad = (value: number) => nf.format(value).padStart(2, lang === "ar" ? "٠" : "0");
  const dash = "–";

  return (
    <section
      aria-label={`${t("fpl.gameweek")} ${gameweek.number}`}
      className={cn("py-3", ui.space.gutter)}
    >
      <div
        className={cn("p-4 text-[color:var(--ui-ink-deep)]", ui.radius.sheet, ui.shadow.lifted)}
        style={{ backgroundImage: "var(--ui-grad-action)" }}
      >
        {/* One element, "Journée 14 · Date limite" — pinned by the e2e journey. */}
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn(ui.display.title, "uppercase")}>
            {`${t("fpl.gameweek")} ${gameweek.number}`}
          </span>{" "}
          <span className={cn(ui.text.label, "opacity-80")}>{`· ${t("fpl.deadline")}`}</span>
        </p>
        <p className={cn("mt-0.5", ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
          <bdi>{formatDeadline(gameweek.deadline, lang, { weekday: "short" })}</bdi>
        </p>

        {passed ? (
          <div className="mt-3 flex flex-col gap-1">
            {gameweek.status ? (
              <GameweekStatusText
                status={gameweek.status}
                deadlinePassed
                className={cn(ui.text.label, "min-h-8")}
              />
            ) : null}
            {next ? (
              <p className={cn(ui.text.meta, "opacity-80")}>
                {`${t("fpl.gameweek")} ${next.number} · ${t("fantasy.next_deadline")} · `}
                <bdi>{formatDeadline(next.deadline, lang, { weekday: "short" })}</bdi>
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {/* The ticking figures are hidden from assistive tech; one
                sentence says the time left, and changes once a minute. */}
            <span className="sr-only">
              {parts
                ? countdownText({ days: 0, hours: parts.hours, minutes: parts.minutes }, t)
                : null}
            </span>
            <div aria-hidden className="mt-3 grid grid-cols-3 gap-2">
              {(
                [
                  [parts ? pad(parts.hours) : dash, t("fantasy.deadline_card.hours")],
                  [parts ? pad(parts.minutes) : dash, t("fantasy.deadline_card.minutes")],
                  [parts ? pad(parts.seconds) : dash, t("fantasy.deadline_card.seconds")],
                ] as const
              ).map(([value, label]) => (
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
          </>
        )}

        {checklist ? (
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
              variant="ink"
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
