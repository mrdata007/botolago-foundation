import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import type { OpenMatchVotesDto } from "@/backend/predictions/contracts";
import { guestPickScore } from "@/backend/predictions/scoring";
import { useAuth } from "@/auth/AuthProvider";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { FixturePredictionCard } from "./FixturePredictionCard";
import { MatchVoteCard } from "./MatchVoteCard";
import { questionView, voteCardWorthShowing } from "./match-votes";
import { SwipeDeck, type SwipeSlide } from "./SwipeDeck";
import { useMatchVotes } from "./use-match-votes";
import { isFixtureOpen, nextPick, usePredictionsRound } from "./use-predictions-round";

/** A group's heading over a card of the deck: the section label's step. */
const DECK_HEADING = cn(ui.text.label, ui.tone.muted);

/**
 * One slide of the deck: its group's heading, then its card filling the rest
 * of the slide (every slide is as tall as the tallest). The heading is inside
 * the slide, so it moves with its card: "Votre pronostic" leaves with the
 * score card and "L'avis des supporters" arrives with the first vote.
 */
function DeckSlide({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {heading}
      {children}
    </div>
  );
}

/**
 * "Votre pronostic" on a match page (plan §9, entry point 2), then the fan
 * votes (owner decision 2026-09-25): one card at a time, swiped like
 * Sofascore's, with dots. The first card is the same record as /pronostics —
 * same save, same cache, same card; the next three are the votes (who wins,
 * both teams score, who scores first), for fun, under their own heading,
 * "L'avis des supporters", so they never read as part of the prediction (or
 * as a bet: critique of 2026-10-06). Draws nothing for a match Pronostics does
 * not cover (another season, another competition) or while the game is off;
 * the prediction alone when the votes cannot be read.
 */
export function MatchPredictionCard({
  fixtureId,
  roundNumber,
  placement = "column",
}: {
  fixtureId: string;
  roundNumber: number | null;
  /**
   * `column`: its own band with the page's gutter, in the desktop column
   * beside the tabs. `inline`: inside the summary panel, which already has the
   * gutter, with no band of its own, and compact once there is nothing to
   * predict (see below).
   */
  placement?: "column" | "inline";
}) {
  const { t } = useI18n();
  const { requireAuth } = useAuth();
  const model = usePredictionsRound(roundNumber);
  const votes = useMatchVotes(fixtureId);
  const fixture = model.round?.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!model.round?.round || !fixture) return null;

  const pick = model.pickFor(fixture.id);
  const open = isFixtureOpen(fixture, model.now);

  // Closed, and nothing was predicted: what is left to say is that, and a way
  // to the round. One line instead of a deck of cards built for picking,
  // which on a finished match filled a screen with "Pas de pronostic".
  if (placement === "inline" && !open && !pick) {
    return (
      <Link
        to="/pronostics"
        search={{ journee: model.round.round.number }}
        data-testid="match-prediction"
        className={cn(
          "flex items-center justify-between gap-3 px-3.5 py-2",
          ui.surface.card,
          ui.space.tap,
          ui.focus,
        )}
      >
        <span className="min-w-0">
          <span className={cn("block", ui.text.label, ui.tone.muted)}>
            {t("predictions.match.title")}
          </span>
          <span className={cn("block", ui.text.bodyStrong, ui.tone.default)}>
            {t("predictions.fixture.no_prediction")}
          </span>
        </span>
        <span className={cn("inline-flex shrink-0 items-center gap-1", ui.text.meta, ui.tone.ink)}>
          {t("predictions.match.round_link")}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>
    );
  }
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
        <DeckSlide heading={<h2 className={DECK_HEADING}>{t("predictions.match.title")}</h2>}>
          <FixturePredictionCard
            fixture={fixture}
            pick={pick}
            open={open}
            scored={scored}
            saved={model.uid ? (saved ?? null) : undefined}
            savedReady={!model.uid || model.mineQuery.isSuccess}
            className="flex-1 justify-center"
            onStep={(side, delta) => {
              const next = nextPick(pick, side, delta);
              if (next) model.setPick(fixture, next);
            }}
          />
        </DeckSlide>
      ),
    },
  ];
  const read = votes.votes;
  const matchVotes: OpenMatchVotesDto | null = read?.allowed === true && read.covered ? read : null;
  if (matchVotes) {
    const votesOpen = matchVotes.open && open;
    for (const entry of matchVotes.questions) {
      const view = questionView(entry, votes.uid ? null : (votes.phone[entry.question] ?? null));
      if (!voteCardWorthShowing(view, open)) continue;
      // The votes' heading is a heading once, before the first of them; on
      // the next cards it is the same words for the eye only, so a screen
      // reader meets one heading per group.
      const firstVote = slides.length === 1;
      slides.push({
        key: entry.question,
        node: (
          <DeckSlide
            heading={
              firstVote ? (
                <h2 className={DECK_HEADING}>{t("predictions.votes.heading")}</h2>
              ) : (
                <p aria-hidden className={DECK_HEADING}>
                  {t("predictions.votes.heading")}
                </p>
              )
            }
          >
            <MatchVoteCard
              fixture={fixture}
              view={view}
              open={votesOpen}
              className="flex-1"
              onVote={(choice) => void votes.cast(entry.question, choice)}
            />
          </DeckSlide>
        ),
      });
    }
  }
  const votedOnPhone = !votes.uid && matchVotes !== null && Object.keys(votes.phone).length > 0;

  return (
    <section
      className={cn("flex flex-col gap-2", placement === "column" && cn("py-3", ui.space.gutter))}
      data-testid="match-prediction"
    >
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
