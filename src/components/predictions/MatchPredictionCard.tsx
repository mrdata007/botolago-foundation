import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { guestPickScore } from "@/backend/predictions/scoring";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { FixturePredictionCard } from "./FixturePredictionCard";
import { isFixtureOpen, nextPick, usePredictionsRound } from "./use-predictions-round";

/**
 * "Votre pronostic" on a match page (plan §9, entry point 2): the same record
 * as /pronostics — same save, same cache, same card — and a way to predict the
 * rest of the journée. Draws nothing for a match Pronostics does not cover
 * (another season, another competition) or while the game is off.
 */
export function MatchPredictionCard({
  fixtureId,
  roundNumber,
}: {
  fixtureId: string;
  roundNumber: number | null;
}) {
  const { t } = useI18n();
  const model = usePredictionsRound(roundNumber);
  const fixture = model.round?.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!model.round?.round || !fixture) return null;

  const pick = model.pickFor(fixture.id);
  const saved = model.uid ? model.mine.get(fixture.id) : undefined;
  const scored = saved
    ? { points: saved.points, kind: saved.resultKind }
    : model.uid
      ? null
      : guestPickScore(pick, fixture);

  return (
    <section
      className={cn("flex flex-col gap-2 py-3", ui.space.gutter)}
      aria-labelledby="match-prediction-title"
      data-testid="match-prediction"
    >
      <h2 id="match-prediction-title" className={cn(ui.text.label, ui.tone.muted)}>
        {t("predictions.match.title")}
      </h2>
      <FixturePredictionCard
        fixture={fixture}
        pick={pick}
        open={isFixtureOpen(fixture, model.now)}
        scored={scored}
        onStep={(side, delta) => {
          const next = nextPick(pick, side, delta);
          if (next) model.setPick(fixture, next);
        }}
      />
      <Link
        to="/pronostics"
        search={{ journee: model.round.round.number }}
        className={cn(
          "inline-flex items-center gap-1 self-start",
          ui.space.tap,
          ui.text.bodyStrong,
          ui.tone.ink,
          ui.focus,
        )}
      >
        {t("predictions.match.all_round")}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
