import { useEffect, useState } from "react";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { MatchEvent } from "@/services/match-live";
import type { Club } from "@/types/domain";

/**
 * How long the moment is up, start to finish (Decision 8: "~2.4 s"). The
 * movements inside it are the motion tokens: the panel travels in and out on
 * `--duration-sheet`, the word and the scorer card land on `--duration-hero`.
 */
export const GOAL_MOMENT_MS = 2400;

/** A motion token's value in milliseconds, read from the page, or `fallback`. */
function tokenMs(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  if (raw.endsWith("ms")) return value;
  if (raw.endsWith("s")) return value * 1000;
  return fallback;
}

/**
 * The goal moment (A-Goal): when a new goal arrives while the page is open,
 * the page below the bar becomes the scoring club's colour for ~2.4 s — the
 * minute and the club, "BUT !" in the display face, and a card with the
 * scorer and the new score. `useGoalMoment` decides WHEN (never for a goal
 * that was there at load); this only draws it.
 *
 * - One-shot: its own timer takes it down, a tap anywhere or Escape takes it
 *   down sooner. It never takes focus and traps nothing — the reader's place
 *   on the page is where they left it.
 * - Silent for assistive tech: the header's score is the page's one polite
 *   live region and announces the new score once. This panel would only
 *   say it a second time.
 * - Reduced motion: no slide, no zoom — a brief static banner under the bar
 *   instead, for the same time. (The global reduced-motion rule would cut the
 *   takeover's movements to nothing, which leaves a full-screen flash; the
 *   banner is the calm version of the same news.)
 * - The panel slides up out of a clipping frame that starts under the bar,
 *   so it never passes over the bar on its way out.
 * - "BUT !" leans forward in French only: Changa has no italic, and a
 *   synthesised slant would lean Arabic the wrong way; the small tilt is
 *   mirrored instead.
 */
export function GoalMoment({
  event,
  club,
  palette,
  scorer,
  assist,
  score,
  onDone,
}: {
  event: MatchEvent;
  /** The club credited with the goal (the event's side). */
  club: Club;
  /** That side's resolved colours (`clubMatchPalettes`). */
  palette: ClubPalette;
  scorer?: string;
  assist?: string;
  /**
   * The score after the goal, home first. Absent while the score has not
   * caught up with the goal yet (`scoreCountsEveryGoal`): no score is better
   * than the one before the goal.
   */
  score?: { home: number; away: number };
  onDone: () => void;
}) {
  const { t, tr } = useI18n();
  // Only ever mounted on the client, after a refresh brought a goal.
  const [reduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const exit = reduced ? 0 : tokenMs("--duration-sheet", 320);
    const leave = window.setTimeout(() => setLeaving(true), GOAL_MOMENT_MS - exit);
    const done = window.setTimeout(onDone, GOAL_MOMENT_MS);
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") onDone();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDone, reduced]);

  const minute = (
    <bdi>
      {event.minute}
      {event.addedTime > 0 ? `+${event.addedTime}` : ""}′
    </bdi>
  );
  const newScore = score ? (
    <span className="inline-flex items-center gap-1">
      <bdi>{score.home}</bdi>
      <span>–</span>
      <bdi>{score.away}</bdi>
    </span>
  ) : null;
  const clubName = tr(club.name);

  if (reduced) {
    return (
      <div
        aria-hidden
        data-goal-moment="banner"
        onClick={onDone}
        className="fixed inset-x-0 top-[var(--topbar-h)] z-[45] cursor-pointer"
      >
        <div
          {...clubStyle(palette)}
          className={cn(
            // Plain fill, no stripes: the scorer line is small text, and the
            // stripes' lighter bands cost it contrast on a borderline club.
            "mx-auto flex max-w-2xl items-center gap-3 px-4 py-3",
            ui.club.fill,
            ui.shadow.lifted,
            "sm:rounded-b-[var(--ui-radius-sheet)]",
          )}
        >
          <p className={cn("shrink-0 whitespace-nowrap", ui.display.section)}>
            {t("matches.detail.goal_title")}
          </p>
          <p
            className={cn(
              "min-w-0 flex-1 truncate",
              ui.text.secondary,
              "[font-weight:var(--ui-weight-heavy)]",
            )}
          >
            {scorer ?? clubName} · {minute}
          </p>
          {newScore ? (
            <span
              className={cn(
                "shrink-0 px-2.5 py-0.5",
                ui.surface.scorebox,
                ui.radius.segment,
                ui.score.sm,
              )}
            >
              {newScore}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-goal-moment="takeover"
      onClick={onDone}
      className="fixed inset-x-0 bottom-0 top-[var(--topbar-h)] z-[45] cursor-pointer overflow-hidden"
    >
      <div
        {...clubStyle(palette)}
        className={cn(
          "flex h-full flex-col items-center justify-center gap-6 px-4",
          ui.club.fill,
          ui.club.stripes,
          leaving
            ? "animate-out fill-mode-forwards slide-out-to-top duration-[var(--duration-sheet)] ease-[var(--ease-standard)]"
            : "animate-in slide-in-from-bottom duration-[var(--duration-sheet)] ease-[var(--ease-emphasized)]",
        )}
      >
        {/* On a patch of plain fill: the palette measures the club's text
            against the fill, and the stripes' lighter bands would take this
            small line under 4.5:1 on a club that only just carries white. */}
        <p
          className={cn(
            "max-w-full truncate px-2.5 py-0.5",
            ui.radius.full,
            ui.club.fill,
            ui.text.label,
          )}
        >
          {minute} · {clubName}
        </p>
        <p
          className={cn(
            "whitespace-nowrap ltr:italic ltr:-rotate-[4deg] rtl:rotate-[4deg]",
            ui.display.mega,
            // The word must fit a 320px screen: "هدف!" is 296px at 112px.
            "text-[length:min(var(--ui-display-mega),30vw)] leading-[var(--ui-leading-display)]",
            !leaving &&
              "animate-in fade-in zoom-in-150 duration-[var(--duration-hero)] ease-[var(--ease-emphasized)]",
          )}
        >
          {t("matches.detail.goal_title")}
        </p>
        <div
          className={cn(
            "flex max-w-full items-center gap-3.5 py-3.5 pe-5 ps-3.5",
            ui.surface.card,
            ui.radius.sheet,
            ui.shadow.lifted,
            !leaving &&
              "animate-in fade-in slide-in-from-bottom-6 duration-[var(--duration-hero)] ease-[var(--ease-emphasized)]",
          )}
        >
          <ClubCrest club={club} palette={palette} size="lg" />
          <div className="min-w-0">
            <p className={cn("truncate", ui.display.section)}>{scorer ?? clubName}</p>
            <p
              className={cn(
                "flex flex-wrap items-center gap-x-1.5",
                ui.text.meta,
                "[font-weight:var(--ui-weight-strong)]",
                ui.tone.muted,
              )}
            >
              {assist ? (
                <span>
                  {t("matches.event.assist")} {assist}
                </span>
              ) : null}
              {assist && newScore ? <span aria-hidden>·</span> : null}
              {newScore}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
