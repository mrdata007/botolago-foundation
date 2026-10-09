import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { formatDeadline } from "@/components/fpl/deadline";
import { useGradinsCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import type { NextRound } from "./gradins-state";

/**
 * One line under the identity line: « J8 · date limite sam. 16:30 », a chevron, and the way to the
 * team.
 *
 * G1 puts belonging first (the people, the club, the seasons), so « Cette journée » sits a long
 * way down the page; this line keeps what happens next on the first screen. It is the same round
 * and the same deadline « Cette journée » reads (`nextRound`, Morocco time), worded with the same
 * key (`gradins.round.line`), and it leads where that block's button does (`/fantasy/team`), which
 * is why a reader of a screen is also told « Composer l'équipe ».
 */
export function RoundGlance({ round, composeLabel }: { round: NextRound; composeLabel: string }) {
  const { lang } = useI18n();
  const copy = useGradinsCopy();
  return (
    <Link
      to="/fantasy/team"
      className={cn(
        "press mx-auto flex min-h-[var(--ui-tap-min)] items-center justify-center gap-1 px-4",
        ui.text.secondary,
        ui.tone.default,
        ui.focus,
      )}
      data-testid="gradins-glance"
    >
      <span className="min-w-0 text-pretty text-center">
        {fill(copy.roundLine, {
          gw: round.number,
          deadline: <bdi>{formatDeadline(round.deadline, lang, { weekday: "short" })}</bdi>,
        })}
        <span className="sr-only"> · {composeLabel}</span>
      </span>
      <ChevronRight className={cn("h-4 w-4 shrink-0", ui.tone.muted)} aria-hidden />
    </Link>
  );
}
