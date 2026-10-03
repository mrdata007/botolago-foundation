import { Check, Lock, Target, X } from "lucide-react";
import type { ReactNode } from "react";

import type { PredictionFixtureDto, ResultKind, ScorePair } from "@/backend/predictions/contracts";
import { matchOutcome } from "@/backend/predictions/scoring";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ui, UiBadge, UiCard, UiLivePill } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useJustTurnedOn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { presentFootballClub } from "@/services/football";
import type { Pick } from "./use-predictions-round";
import { formatKickoffTime } from "./predictions-copy";
import { ScoreStepper } from "./ScoreStepper";

/** A score as three pieces, never one string: "2–1" would read "1–2" inside Arabic. */
export function ScoreLine({ score, className }: { score: ScorePair; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", ui.text.tabular, className)}>
      <bdi>{score.home}</bdi>
      <span aria-hidden>–</span>
      <bdi>{score.away}</bdi>
    </span>
  );
}

export interface FixtureScore {
  readonly points: number | null;
  readonly kind: ResultKind | null;
}

/**
 * One match of the journée (plan §8). Open: teams and time on the first line,
 * the two steppers on the second, which is the only layout that fits 360px
 * with 44px buttons. Locked: the saved pick and the match's state. Final: one
 * line, "Raja 2–1 Wydad · Votre pronostic 2–1 · +3", and the reason.
 *
 * The home team comes first in the markup, so in Arabic it sits on the right.
 */
export function FixturePredictionCard({
  fixture,
  pick,
  open,
  scored,
  notCounted = false,
  saved,
  savedReady = true,
  className,
  onStep,
}: {
  fixture: PredictionFixtureDto;
  pick: Pick | null;
  open: boolean;
  /** Points and kind once scored (the database's, or the phone's for a guest). */
  scored: FixtureScore | null;
  /** A guest pick the import refused because the match had started. */
  notCounted?: boolean;
  /**
   * The copy the server holds, for a signed-in reader: `null` when nothing is
   * saved yet, left out for a guest (whose picks stay on the phone). The card
   * settles and its tick pops the moment the server's copy matches the pick,
   * never on the tap itself.
   */
  saved?: ScorePair | null;
  /**
   * False while the server's copy is still being read, so a saved pick that
   * arrives after the page opens is not taken for one the reader just made.
   */
  savedReady?: boolean;
  /** Extra layout from the host, e.g. centring when a deck makes the card taller. */
  className?: string;
  onStep: (side: "home" | "away", delta: 1 | -1) => void;
}) {
  const { t, lang } = useI18n();
  const home = presentFootballClub(fixture.home);
  const away = presentFootballClub(fixture.away);
  const homeName = fixture.home.shortName || fixture.home.name;
  const awayName = fixture.away.shortName || fixture.away.name;

  // A signed-in pick is "locked in" once the server holds exactly it.
  const confirmed = Boolean(saved && pick && saved.home === pick.home && saved.away === pick.away);
  const justSaved = useJustTurnedOn(confirmed, 900, savedReady);
  // A result that arrives while the page is open celebrates once; one that was
  // already in when the page opened does not.
  const scoredKind = fixture.final && fixture.result ? (scored?.kind ?? null) : null;
  const justScored = useJustTurnedOn(
    scoredKind === "exact" || scoredKind === "outcome",
    900,
    savedReady,
  );

  if (fixture.final && fixture.result) {
    return (
      <UiCard
        padding="sm"
        testId={`prediction-${fixture.id}`}
        className={cn(
          "flex flex-col gap-1.5 border-s-4",
          scoredKind === "exact"
            ? "border-s-[color:var(--ui-positive)]"
            : scoredKind === "outcome"
              ? "border-s-[color:var(--ui-ink-fg)]"
              : "border-s-[color:var(--ui-rule)]",
          justScored && (scoredKind === "exact" ? "glow-exact" : "glow-hit"),
          className,
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("min-w-0 truncate", ui.text.bodyStrong)} dir="auto">
            {homeName}
          </span>
          <span className="sr-only">{t("predictions.result.final")}</span>
          <ScoreLine score={fixture.result} className={ui.score.row} />
          <span className={cn("min-w-0 truncate", ui.text.bodyStrong)} dir="auto">
            {awayName}
          </span>
          {scored?.points !== null && scored?.points !== undefined ? (
            <UiBadge
              tone={scored.points === 3 ? "positive" : scored.points === 1 ? "action" : "neutral"}
              className={cn("ms-auto", justScored && "pop")}
            >
              {scoredKind === "exact" ? (
                <Target className="me-1 h-3.5 w-3.5" aria-hidden />
              ) : scoredKind === "outcome" ? (
                <Check className="me-1 h-3.5 w-3.5" aria-hidden />
              ) : scoredKind === "miss" ? (
                <X className="me-1 h-3.5 w-3.5" aria-hidden />
              ) : null}
              <bdi>+{scored.points}</bdi>
            </UiBadge>
          ) : null}
        </div>
        <p className={cn(ui.text.meta, ui.tone.muted)}>
          {pick ? (
            <>
              {t("predictions.result.yours")} <ScoreLine score={pick} />
              {" · "}
            </>
          ) : null}
          {resultReason(fixture, pick, scored, notCounted, t)}
          {fixture.corrected ? ` · ${t("predictions.result.corrected")}` : null}
        </p>
      </UiCard>
    );
  }

  const status = lockedStatus(fixture, open, t);
  return (
    <UiCard
      padding="sm"
      testId={`prediction-${fixture.id}`}
      className={cn(
        "flex flex-col gap-2",
        open &&
          pick &&
          "ring-2 ring-[color:color-mix(in_oklab,var(--ui-positive)_45%,transparent)]",
        justSaved && "settle",
        className,
      )}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ClubCrest club={home} size="sm" />
          <span className={cn("min-w-0 truncate", ui.text.bodyStrong)} dir="auto">
            {homeName}
          </span>
        </div>
        <span className={cn("text-center", ui.text.meta, ui.tone.muted)}>
          {fixture.live ? (
            <ScoreLine score={fixture.live} className={ui.score.row} />
          ) : fixture.kickoffConfirmed ? (
            <bdi>{formatKickoffTime(fixture.kickoffAt, lang)}</bdi>
          ) : (
            t("predictions.fixture.time_tbc")
          )}
        </span>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className={cn("min-w-0 truncate text-end", ui.text.bodyStrong)} dir="auto">
            {awayName}
          </span>
          <ClubCrest club={away} size="sm" />
        </div>
      </div>

      {open ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <div className="justify-self-start">
            <ScoreStepper
              team={homeName}
              value={pick?.home ?? null}
              onStep={(delta) => onStep("home", delta)}
              testId={`prediction-${fixture.id}-home`}
            />
          </div>
          <span aria-hidden className={cn(ui.score.row, ui.tone.faint)}>
            –
          </span>
          <div className="flex items-center gap-1 justify-self-end">
            <ScoreStepper
              team={awayName}
              value={pick?.away ?? null}
              onStep={(delta) => onStep("away", delta)}
              testId={`prediction-${fixture.id}-away`}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn(ui.text.meta)}>
            {pick ? (
              <>
                {t("predictions.result.yours")}{" "}
                <ScoreLine score={pick} className={ui.text.bodyStrong} />
              </>
            ) : (
              <span className={ui.tone.muted}>{t("predictions.fixture.no_prediction")}</span>
            )}
          </span>
          <span className={cn("inline-flex items-center gap-1.5", ui.text.meta, ui.tone.muted)}>
            {status}
          </span>
        </div>
      )}
      {open && pick ? (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <UiBadge tone="positive" className="gap-1 !px-2 !py-0.5">
            <Check className={cn("h-3.5 w-3.5", justSaved && "pop")} aria-hidden />
            {t("predictions.fixture.picked")}
          </UiBadge>
          <span className={cn(ui.text.micro, ui.tone.muted)}>
            {fixture.kickoffConfirmed
              ? t("predictions.fixture.until").replace(
                  "{time}",
                  formatKickoffTime(fixture.kickoffAt, lang),
                )
              : t("predictions.fixture.time_tbc")}
          </span>
        </div>
      ) : null}
      {notCounted ? (
        <p className={cn(ui.text.micro, ui.tone.muted)}>{t("predictions.result.not_counted")}</p>
      ) : null}
    </UiCard>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

function lockedStatus(fixture: PredictionFixtureDto, open: boolean, t: Translate): ReactNode {
  if (open) return null;
  if (fixture.live) return <UiLivePill />;
  switch (fixture.status) {
    case "postponed":
      return t("predictions.fixture.postponed");
    case "cancelled":
      return t("predictions.fixture.cancelled");
    case "abandoned":
      return t("predictions.fixture.abandoned");
    case "finished":
      return t("predictions.result.pending");
    default:
      return (
        <>
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {t("predictions.fixture.locked")}
        </>
      );
  }
}

function resultReason(
  fixture: PredictionFixtureDto,
  pick: Pick | null,
  scored: FixtureScore | null,
  notCounted: boolean,
  t: Translate,
): string {
  if (notCounted) return t("predictions.result.not_counted");
  if (!pick) return t("predictions.fixture.no_prediction");
  switch (scored?.kind) {
    case "exact":
      return t("predictions.result.exact");
    case "outcome": {
      const outcome = fixture.result ? matchOutcome(fixture.result) : "draw";
      if (outcome === "draw") return t("predictions.result.outcome_draw");
      const winner = outcome === "home" ? fixture.home : fixture.away;
      return t("predictions.result.outcome_win").replace("{team}", winner.shortName || winner.name);
    }
    case "miss":
      return t("predictions.result.miss");
    case "late":
      return t("predictions.result.late");
    case "void":
      return t("predictions.fixture.cancelled");
    default:
      return t("predictions.result.pending");
  }
}
