import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { DifficultyBadge } from "@/components/fantasy/DifficultyBadge";
import { PlayerDecisionSummary } from "@/components/fantasy/PlayerDecisionSummary";
import {
  buildPlayerDecisionPresentation,
  compareFixtureSchedule,
  isUpcomingFixture,
  type PlayerFixtureDataState,
} from "@/components/fantasy/player-decision-presentation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";

export const Route = createFileRoute("/fantasy/players/$playerId")({
  component: PlayerDetailPage,
});

type Tab = "overview" | "fixtures" | "news";

function PlayerDetailPage() {
  const { playerId } = Route.useParams();
  const { t, tr, lang, dir } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-MA";
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const dateTime = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const playerQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
    select: (players) => players.find((player) => player.id === playerId),
    staleTime: 60_000,
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const fixturesQ = useQuery({
    queryKey: ["fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
    staleTime: 60_000,
  });

  if (playerQ.isLoading || clubsQ.isLoading) return <LoadingState />;
  if (playerQ.isError || clubsQ.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void playerQ.refetch();
          void clubsQ.refetch();
        }}
      />
    );
  }

  const player = playerQ.data;
  const clubs = clubsQ.data;
  if (!player || !clubs) return <EmptyState />;

  const fixtureState: PlayerFixtureDataState =
    fixturesQ.data !== undefined ? "ready" : fixturesQ.isError ? "error" : "loading";
  const fixtureReferenceTime = fixtureState === "ready" ? fixturesQ.dataUpdatedAt : undefined;
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;
  const club = clubs.find((candidate) => candidate.id === player.clubId);
  const decision = buildPlayerDecisionPresentation({
    player,
    fixtures: fixturesQ.data ?? [],
    fixtureReferenceTime,
  });
  const nextFixture = decision.nextFixture;
  const nextOpponent =
    nextFixture && !nextFixture.isBlank
      ? clubs.find((candidate) => candidate.id === nextFixture.opponentClubId)
      : undefined;
  const nextFixtureValue =
    fixtureState === "loading"
      ? t("fantasy.players.fixture_loading")
      : fixtureState === "error"
        ? t("fantasy.players.fixture_error")
        : !nextFixture
          ? t("fantasy.players.no_fixture")
          : nextFixture.isBlank
            ? t("fantasy.fixtures.blank")
            : nextOpponent
              ? `${tr(nextOpponent.shortName)} · ${t(
                  nextFixture.isHome ? "common.home" : "common.away",
                )} · ${number.format(nextFixture.difficulty)}/5`
              : `${t("fantasy.fixtures.difficulty")} ${number.format(nextFixture.difficulty)}/5`;
  const news = player.news ? tr(player.news).trim() : "";
  const tabItems: Array<{ key: Tab; label: TranslationKey }> = [
    { key: "overview", label: "fantasy.players.tab.overview" },
    { key: "fixtures", label: "fantasy.players.tab.fixtures" },
  ];
  if (news) tabItems.push({ key: "news", label: "fantasy.players.tab.news" });

  const playerFixtures = (fixturesQ.data ?? [])
    .filter(
      (fixture) =>
        fixture.clubId === player.clubId && isUpcomingFixture(fixture, fixtureReferenceTime),
    )
    .sort(compareFixtureSchedule)
    .slice(0, 6);

  return (
    <div>
      <Link
        to="/fantasy/players"
        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
      >
        <BackIcon className="h-3.5 w-3.5" aria-hidden />
        {t("common.back")}
      </Link>

      <h1 className="sr-only">{tr(player.name)}</h1>
      <section className="surface-4 mt-2 p-4 sm:p-5">
        <PlayerDecisionSummary
          player={player}
          club={club}
          clubs={clubs}
          fixtures={fixturesQ.data}
          fixtureState={fixtureState}
          fixtureReferenceTime={fixtureReferenceTime}
          density="comfortable"
        />
      </section>

      <Tabs defaultValue="overview" dir={dir}>
        <TabsList
          aria-label={t("fantasy.players.title")}
          className="mt-3 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 scrollbar-none"
        >
          {tabItems.map((item) => (
            <TabsTrigger
              key={item.key}
              value={item.key}
              className="min-h-11 rounded-full bg-white/60 px-3 py-2 text-xs font-semibold ring-1 ring-black/5 data-[state=active]:bg-[color:var(--brand-primary)] data-[state=active]:text-white"
            >
              {t(item.label)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatDl
              label={t("fantasy.picker.filter_position")}
              value={t(`player.pos.${player.position}` as TranslationKey)}
            />
            <StatDl label={t("fantasy.price")} value={number.format(player.price)} />
            <StatDl
              label={t("fantasy.picker.filter_status")}
              value={t(`player.status.${player.status}` as TranslationKey)}
            />
            <StatDl label={t("fantasy.players.next")} value={nextFixtureValue} />
          </dl>
        </TabsContent>

        <TabsContent value="fixtures" className="mt-3">
          {fixturesQ.isError ? (
            <ErrorState onRetry={() => void fixturesQ.refetch()} />
          ) : fixturesQ.isLoading ? (
            <LoadingState />
          ) : playerFixtures.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {playerFixtures.map((fixture, index) => {
                const opponent = clubs.find((candidate) => candidate.id === fixture.opponentClubId);
                const kickoff =
                  fixture.kickoffAt && !Number.isNaN(Date.parse(fixture.kickoffAt))
                    ? dateTime.format(new Date(fixture.kickoffAt))
                    : null;
                return (
                  <article
                    key={`${fixture.clubId}:${fixture.gameweek}:${fixture.opponentClubId}:${fixture.isHome ? "home" : "away"}:${fixture.kickoffAt ?? "tbd"}:${index}`}
                    className="surface-2 flex min-w-0 items-center gap-3 p-3"
                  >
                    {!fixture.isBlank && opponent && <ClubCrest club={opponent} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {t("home.gameweek")} {number.format(fixture.gameweek)}
                      </div>
                      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-sm font-semibold text-foreground">
                        {fixture.isBlank ? (
                          <span>{t("fantasy.fixtures.blank")}</span>
                        ) : (
                          <>
                            <span className="truncate">
                              {opponent ? tr(opponent.shortName) : "—"}
                            </span>
                            <span className="text-muted-foreground">
                              · {t(fixture.isHome ? "common.home" : "common.away")}
                            </span>
                          </>
                        )}
                        {fixture.isDouble && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
                            {t("fantasy.fixtures.double")}
                          </span>
                        )}
                      </div>
                      {!fixture.isBlank && kickoff && fixture.kickoffAt && (
                        <time
                          dateTime={fixture.kickoffAt}
                          className="mt-0.5 block truncate text-[11px] text-muted-foreground"
                        >
                          {kickoff}
                        </time>
                      )}
                    </div>
                    {!fixture.isBlank && (
                      <DifficultyBadge
                        difficulty={fixture.difficulty}
                        label={`${number.format(fixture.difficulty)} / ${number.format(5)}`}
                        className="w-12 shrink-0"
                      />
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        {news && (
          <TabsContent value="news" className="mt-3">
            <div className="rounded-2xl bg-card p-4 text-sm leading-relaxed text-muted-foreground ring-1 ring-black/5">
              {news}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function StatDl({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-3 py-2 ring-1 ring-black/5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-black text-foreground">{value}</dd>
    </div>
  );
}
