import { Info } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import type { PredictionFixtureDto } from "@/backend/predictions/contracts";
import { predictionPoints, predictionResultKind } from "@/backend/predictions/scoring";
import { useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
import {
  ui,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiIconButton,
  UiPageTitle,
  UiStatePanel,
  UiTabs,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { FixturePredictionCard, type FixtureScore } from "./FixturePredictionCard";
import { LeaguesPanel } from "./leagues/LeaguesPanel";
import { PredictionsLeaderboard } from "./PredictionsLeaderboard";
import { PredictionsStickyBar } from "./PredictionsStickyBar";
import { formatDayHeading, formatLockMoment, matchDay, remainingLabel } from "./predictions-copy";
import { RoundSwitcher } from "./RoundSwitcher";
import { ScoringRulesSheet } from "./ScoringRulesSheet";
import {
  isFixtureOpen,
  nextPick,
  readFailure,
  usePredictionsRound,
  useGuestPredictions,
  type Pick,
  type RoundSeed,
} from "./use-predictions-round";

export type PredictionsTab = "predict" | "board" | "leagues";

/** A visitor sees the sign-up card after this many picks in a journée. */
const GUEST_NUDGE_AFTER = 3;

/**
 * `/pronostics` (plan §8): one journée, its matches grouped by day, each
 * locking at its own kick-off; the journée and season rankings; the rules.
 * The database decides whether the game is open to this reader at all.
 */
export function PredictionsPage({
  roundNumber,
  tab,
  seed,
  onRoundChange,
  onTabChange,
}: {
  roundNumber: number | null;
  tab: PredictionsTab;
  /** The journée the server rendered, when it is the one asked for. */
  seed?: RoundSeed;
  onRoundChange: (round: number) => void;
  onTabChange: (tab: PredictionsTab) => void;
}) {
  const { t, lang } = useI18n();
  const { requireAuth } = useAuth();
  const [rulesOpen, setRulesOpen] = useState(false);
  const model = usePredictionsRound(roundNumber, seed);
  const guest = useGuestPredictions();
  const { round, query, now } = model;

  const header = (
    <UiPageTitle
      title={t("predictions.title")}
      trailing={
        <UiIconButton aria-label={t("predictions.rules.title")} onClick={() => setRulesOpen(true)}>
          <Info aria-hidden />
        </UiIconButton>
      }
      className="border-b-0"
    >
      <UiTabs<PredictionsTab>
        value={tab}
        onChange={onTabChange}
        label={t("predictions.tabs_label")}
        idBase="predictions-tab"
        options={[
          { value: "predict", label: t("predictions.tab.predict") },
          { value: "board", label: t("predictions.tab.board") },
          { value: "leagues", label: t("predictions.tab.leagues") },
        ]}
      />
    </UiPageTitle>
  );

  const shell = (content: ReactNode) => (
    <AppShell backgroundVariant="matches" pageHeader={header}>
      <div className="flex flex-col gap-4 pt-2">{content}</div>
      <ScoringRulesSheet open={rulesOpen} onOpenChange={setRulesOpen} />
    </AppShell>
  );

  if (query.isPending) return shell(<UiStatePanel kind="loading" />);
  if (query.isError) {
    return shell(
      readFailure(query.error) === "coming_soon" ? (
        <ComingSoon />
      ) : (
        <UiErrorState
          title={t("predictions.state.unavailable")}
          onRetry={() => void query.refetch()}
        />
      ),
    );
  }
  if (!round) return shell(<ComingSoon />);
  if (!round.round) {
    return shell(<UiEmptyState title={t("predictions.state.no_fixtures")} />);
  }

  const fixtures = round.fixtures;
  const journee = round.round;
  const countable = fixtures.filter((fixture) => !fixture.void);
  const picks = new Map<string, Pick | null>(
    fixtures.map((fixture) => [fixture.id, model.pickFor(fixture.id)]),
  );
  const done = countable.filter((fixture) => picks.get(fixture.id)).length;
  const openWithoutPick = countable.filter(
    (fixture) => isFixtureOpen(fixture, now) && !picks.get(fixture.id),
  ).length;

  const scoreOf = (fixture: PredictionFixtureDto): FixtureScore | null => {
    if (model.uid) {
      const saved = model.mine.get(fixture.id);
      return saved ? { points: saved.points, kind: saved.resultKind } : null;
    }
    const pick = picks.get(fixture.id);
    if (!pick || !fixture.final || !fixture.result) return null;
    return {
      points: predictionPoints(pick, fixture.result),
      kind: predictionResultKind(pick, fixture.result),
    };
  };

  return shell(
    <>
      <RoundSwitcher
        number={journee.number}
        state={journee.state}
        rounds={round.rounds}
        onChange={onRoundChange}
      />
      <p
        className={cn("-mt-2 text-center", ui.text.meta, ui.tone.muted)}
        data-testid="predictions-progress"
      >
        {/* Each half keeps to one line: a wrap falls between them, never
            before the French " : ". */}
        <span className="whitespace-nowrap">
          {openWithoutPick > 0
            ? remainingLabel(openWithoutPick, lang, t)
            : done > 0
              ? t("predictions.all_done")
              : null}
        </span>
        {journee.nextLockAt ? (
          <>
            {openWithoutPick > 0 || done > 0 ? " · " : null}
            <span className="whitespace-nowrap">
              {t("predictions.next_lock").replace(
                "{when}",
                formatLockMoment(journee.nextLockAt, lang),
              )}
            </span>
          </>
        ) : null}
      </p>

      {tab === "leagues" ? (
        <LeaguesPanel />
      ) : tab === "board" ? (
        <PredictionsLeaderboard
          roundNumber={journee.number}
          uid={model.uid}
          guestPoints={model.uid ? null : guestPoints(fixtures, picks)}
        />
      ) : (
        <>
          {!model.uid && !model.guestPersistent ? (
            <UiCard padding="sm" testId="predictions-storage-blocked">
              <p className={ui.text.meta}>{t("predictions.guest.storage_blocked")}</p>
            </UiCard>
          ) : null}

          {fixtures.length === 0 ? (
            <UiEmptyState title={t("predictions.state.no_fixtures")} />
          ) : (
            <DayGroups fixtures={fixtures}>
              {(fixture) => (
                <FixturePredictionCard
                  key={fixture.id}
                  fixture={fixture}
                  pick={picks.get(fixture.id) ?? null}
                  open={isFixtureOpen(fixture, now)}
                  scored={scoreOf(fixture)}
                  notCounted={!model.uid && guest.state.notCounted.includes(fixture.id)}
                  onStep={(side, delta) => {
                    const next = nextPick(picks.get(fixture.id) ?? null, side, delta);
                    if (next) model.setPick(fixture, next);
                  }}
                />
              )}
            </DayGroups>
          )}

          {!model.uid && done >= GUEST_NUDGE_AFTER ? (
            <UiCard padding="md" testId="predictions-guest-cta" className="flex flex-col gap-2">
              <p className={ui.text.bodyStrong}>{t("predictions.guest.cta_title")}</p>
              <p className={cn(ui.text.meta, ui.tone.muted)}>{t("predictions.guest.cta_body")}</p>
              <UiButton
                variant="ink"
                onClick={() => requireAuth(() => {}, { reason: t("predictions.guest.cta_body") })}
              >
                {t("predictions.guest.cta_button")}
              </UiButton>
            </UiCard>
          ) : null}

          <PredictionsStickyBar
            done={done}
            total={countable.length}
            state={model.saveState}
            onRetry={model.retrySave}
            onSignUp={() => requireAuth(() => {}, { reason: t("predictions.guest.cta_body") })}
          />
        </>
      )}
    </>,
  );
}

function ComingSoon() {
  const { t } = useI18n();
  return (
    <UiEmptyState
      testId="predictions-coming-soon"
      title={t("predictions.state.coming_soon")}
      body={t("predictions.state.coming_soon_body")}
    />
  );
}

/** A guest's points for the journée, on the phone: nothing is ranked. */
function guestPoints(
  fixtures: readonly PredictionFixtureDto[],
  picks: ReadonlyMap<string, Pick | null>,
): number | null {
  let points: number | null = null;
  for (const fixture of fixtures) {
    const pick = picks.get(fixture.id);
    if (!pick || !fixture.final || !fixture.result) continue;
    points = (points ?? 0) + predictionPoints(pick, fixture.result);
  }
  return points;
}

/** The journée's matches under their day headings (Casablanca days). */
function DayGroups({
  fixtures,
  children,
}: {
  fixtures: readonly PredictionFixtureDto[];
  children: (fixture: PredictionFixtureDto) => ReactNode;
}) {
  const { lang } = useI18n();
  const groups = useMemo(() => {
    const byDay: { key: string; first: string; fixtures: PredictionFixtureDto[] }[] = [];
    for (const fixture of fixtures) {
      const key = matchDay(fixture.kickoffAt);
      const last = byDay[byDay.length - 1];
      if (last && last.key === key) last.fixtures.push(fixture);
      else byDay.push({ key, first: fixture.kickoffAt, fixtures: [fixture] });
    }
    return byDay;
  }, [fixtures]);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section
          key={group.key}
          className="flex flex-col gap-2"
          aria-label={formatDayHeading(group.first, lang)}
        >
          <h2 className={cn(ui.text.label, ui.tone.muted)}>
            {formatDayHeading(group.first, lang)}
          </h2>
          {group.fixtures.map((fixture) => children(fixture))}
        </section>
      ))}
    </div>
  );
}
