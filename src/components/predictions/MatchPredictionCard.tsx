import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { OpenMatchVotesDto } from "@/backend/predictions/contracts";
import { guestPickScore } from "@/backend/predictions/scoring";
import { useAuth } from "@/auth/AuthProvider";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { FixturePredictionCard } from "./FixturePredictionCard";
import { MatchVoteCard } from "./MatchVoteCard";
import { questionView } from "./match-votes";
import { SwipeDeck, type SwipeSlide } from "./SwipeDeck";
import { useMatchVotes } from "./use-match-votes";
import { isFixtureOpen, nextPick, usePredictionsRound } from "./use-predictions-round";

/**
 * "Votre pronostic" on a match page (plan §9, entry point 2), then the fan
 * votes (owner decision 2026-09-25): one card at a time, swiped like
 * Sofascore's, with dots. The first card is the same record as /pronostics —
 * same save, same cache, same card; the next three are the votes (who wins,
 * both teams score, who scores first), for fun. Draws nothing for a match
 * Pronostics does not cover (another season, another competition) or while
 * the game is off; the prediction alone when the votes cannot be read.
 */
export function MatchPredictionCard({
  fixtureId,
  roundNumber,
}: {
  fixtureId: string;
  roundNumber: number | null;
}) {
  const { t } = useI18n();
  const { requireAuth } = useAuth();
  const model = usePredictionsRound(roundNumber);
  const votes = useMatchVotes(fixtureId);
  const fixture = model.round?.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!model.round?.round || !fixture) return null;

  const pick = model.pickFor(fixture.id);
  const saved = model.uid ? model.mine.get(fixture.id) : undefined;
  const scored = saved
    ? { points: saved.points, kind: saved.resultKind }
    : model.uid
      ? null
      : guestPickScore(pick, fixture);

  const slides: SwipeSlide[] = [
    {
      key: "score",
      node: (
        <FixturePredictionCard
          fixture={fixture}
          pick={pick}
          open={isFixtureOpen(fixture, model.now)}
          scored={scored}
          className="justify-center"
          onStep={(side, delta) => {
            const next = nextPick(pick, side, delta);
            if (next) model.setPick(fixture, next);
          }}
        />
      ),
    },
  ];
  const read = votes.votes;
  const matchVotes: OpenMatchVotesDto | null = read?.allowed === true && read.covered ? read : null;
  if (matchVotes) {
    const open = matchVotes.open && isFixtureOpen(fixture, model.now);
    for (const entry of matchVotes.questions) {
      const view = questionView(entry, votes.uid ? null : (votes.phone[entry.question] ?? null));
      slides.push({
        key: entry.question,
        node: (
          <MatchVoteCard
            fixture={fixture}
            view={view}
            open={open}
            onVote={(choice) => void votes.cast(entry.question, choice)}
          />
        ),
      });
    }
  }
  const votedOnPhone = !votes.uid && matchVotes !== null && Object.keys(votes.phone).length > 0;

  return (
    <section
      className={cn("flex flex-col gap-2 py-3", ui.space.gutter)}
      aria-labelledby="match-prediction-title"
      data-testid="match-prediction"
    >
      <h2 id="match-prediction-title" className={cn(ui.text.label, ui.tone.muted)}>
        {t("predictions.match.title")}
      </h2>
      <SwipeDeck
        label={t("predictions.votes.deck")}
        slides={slides}
        testId="match-prediction-deck"
      />
      {votedOnPhone ? (
        <p
          className={cn("flex flex-wrap items-center gap-x-2", ui.text.meta, ui.tone.muted)}
          data-testid="match-votes-phone"
        >
          <span>{t("predictions.votes.phone")}</span>
          <button
            type="button"
            onClick={() => {
              track("pronostics_signup_click");
              requireAuth(() => {}, { reason: t("predictions.guest.cta_body") });
            }}
            className={cn(
              "underline underline-offset-2",
              ui.text.bodyStrong,
              ui.tone.ink,
              ui.focus,
            )}
          >
            {t("predictions.guest.cta_button")}
          </button>
        </p>
      ) : null}
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
