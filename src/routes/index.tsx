import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, CircleDot, Bell, Newspaper, Trophy, UserRound } from "lucide-react";

import { newsService } from "@/services/news";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { footballService } from "@/services/football";
import { fantasyService } from "@/services/fantasy-runtime";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { AppShell } from "@/components/shell/AppShell";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Trans } from "@/components/common/Trans";
import { Section } from "@/components/common/Section";
import { FantasySummaryCard } from "@/components/common/FantasySummaryCard";
import { FantasyUnavailableState } from "@/components/fantasy/FantasyUnavailableState";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";
import { FantasyAlertList } from "@/components/common/FantasyAlertList";
import { ArticleCard } from "@/components/common/ArticleCard";
import { MatchCard } from "@/components/common/MatchCard";
import { ClubCrest } from "@/components/common/ClubCrest";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { EmptyState, ErrorState } from "@/components/common/States";
import {
  HeroSkeleton,
  MatchCardSkeleton,
  ArticleCardSkeleton,
  AlertRowSkeleton,
  StandingsRowSkeleton,
  SkeletonList,
} from "@/components/common/Skeletons";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { ui, UiCard, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { authService } from "@/services/auth";
import { hasWelcomed, markWelcomeDone } from "@/lib/welcome";
import { cn } from "@/lib/utils";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import type { Match } from "@/types/domain";

const HOME_TITLE = "BotolaGO — Actualité, matchs et Fantasy du football marocain";
const HOME_DESCRIPTION =
  "Suivez la Botola Pro sur BotolaGO : résultats en direct, actualités, classement et votre équipe Fantasy.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:url", content: `${PUBLIC_SITE_ORIGIN}/` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: HOME_TITLE },
      { name: "twitter:description", content: HOME_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${PUBLIC_SITE_ORIGIN}/` }],
  }),
  component: HomePage,
});

function useGreeting() {
  const { t } = useI18n();
  const h = new Date().getHours();
  if (h < 12) return t("home.greeting_morning");
  if (h < 18) return t("home.greeting_afternoon");
  return t("home.greeting_evening");
}

function HomePage() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const { t } = useI18n();

  // Read localStorage only after mount so SSR and first client render match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const showWelcome = mounted && status === "anonymous" && !hasWelcomed();

  if (showWelcome) {
    return (
      <WelcomeScreen
        onSignIn={() => navigate({ to: "/auth/login" })}
        onGuest={async () => {
          await authService.continueAsGuest();
          markWelcomeDone();
          toast.success(t("auth.success.guest"));
        }}
      />
    );
  }
  return <HomeContent />;
}

/**
 * BotolaGO Home (Accueil) — dashboard redesign (BG-0012).
 *
 * A genuine "control center" landing screen, not a duplicate of the News
 * page. Fixed structure, now drawn in the product design language: the UI
 * kit's type scale, 6px radii, opaque `--ui-surface` cards and one shadow
 * token — no V2 glass (`surface-4`/`surface-2`), no Tailwind type ramp and
 * no responsive type steps, which the language never takes:
 *
 *   1. Gameweek band           — greeting, the gameweek, its date and the
 *                                Fantasy deadline on the header gradient: the
 *                                page's one anchor (Accueil art-direction pass)
 *   2. Matches                 — one fixture list grouped by day, rising out
 *                                of the band
 *   3. Fantasy                 — the manager's team and numbers, or the
 *                                way into creating one
 *   4. News preview            — a few curated cards linking into /news
 *   5. Standings snapshot      — top of the table, only when real data exists
 *   6. Discovery links         — quick access to Matches/Fantasy/News/Profile
 */
function HomeContent() {
  const { t, tr, lang } = useI18n();
  const { status, user } = useAuth();
  const { source, key } = useFantasyDataSource();
  const greeting = useGreeting();
  const availability = useFantasyAvailability();
  const fantasyReady = !availability.isError && availability.data?.status === "ready";
  const canCreate = availability.data?.status === "ready" && availability.data.canCreate;

  const summaryQ = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: fantasyReady && source !== "guest",
  });
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    enabled: fantasyReady,
  });
  const matchesQ = useQuery({
    queryKey: ["football", "home-matches", lang],
    queryFn: () => footballService.getHomeMatches(lang),
  });
  const alertsQ = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fantasyService.getAlerts(),
    enabled: fantasyReady,
  });
  const playersQ = useQuery({
    queryKey: ["all-players-for-alerts"],
    queryFn: () => fantasyService.getTrendingPlayers(),
    enabled: fantasyReady,
  });
  // News is hidden at launch (owner decision — see `@/lib/feature-flags`), so
  // the edition is not even fetched: no News RPC, no third-party media URLs
  // reaching the document, nothing to flash before the section is skipped.
  const newsQ = useQuery({
    queryKey: ["news", "edition", lang, "auto"] as const,
    queryFn: () => newsService.getEdition(lang, "auto"),
    enabled: NEWS_ENABLED,
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });

  // Standings snapshot reuses the same real data source as /matches
  // (getHomeMatches never carries a table; a season-scoped fetch does).
  // No standings route/component exists yet, so this section renders only
  // once a real, non-empty table comes back — never a fabricated one.
  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
  });
  const currentSeasonId = useMemo(
    () => seasonsQ.data?.find((season) => season.isCurrent)?.id ?? seasonsQ.data?.[0]?.id,
    [seasonsQ.data],
  );
  const standingsQ = useQuery({
    queryKey: ["football", "home-standings", lang, currentSeasonId],
    queryFn: () => footballService.getMatchDay(new Date(), lang, currentSeasonId),
    enabled: seasonsQ.isSuccess,
  });

  const clubById = (id: string) =>
    matchesQ.data?.clubs.find((club) => club.id === id) ??
    standingsQ.data?.clubs.find((club) => club.id === id) ??
    clubsQ.data?.find((club) => club.id === id);

  // Localized full date used in the greeting meta line.
  const dateLine = useMemo(() => {
    // The greeting dates the football day, so it follows the competition
    // calendar rather than the viewer's browser (BG-0100).
    const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
      timeZone: MATCH_TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return fmt.format(new Date());
  }, [lang]);

  const matchDays = useMemo(
    () => groupByMatchDay(matchesQ.data?.matches ?? [], lang),
    [matchesQ.data, lang],
  );

  // Up to three curated stories: the edition's lead plus its next articles.
  // Never the full News page — a lightweight preview only.
  const newsPreview = useMemo(() => {
    const edition = newsQ.data;
    if (!edition) return null;
    const rest = edition.articles.filter((a) => a.id !== edition.lead?.id);
    return [...(edition.lead ? [edition.lead] : []), ...rest].slice(0, 3);
  }, [newsQ.data]);

  const standingsLoading = seasonsQ.isPending || (seasonsQ.isSuccess && standingsQ.isPending);
  const standingsFailed = seasonsQ.isError || standingsQ.isError;
  const standingsRows = standingsQ.data?.standings ?? [];
  const showStandings = standingsLoading || standingsFailed || standingsRows.length > 0;

  return (
    <AppShell>
      {/* -------------------------------------------------------- */}
      {/* 1. Gameweek band — the page's anchor                     */}
      {/* -------------------------------------------------------- */}
      {/* The page's only H1, and deliberately sr-only: the band names the
          gameweek, which is what a reader needs, but the document still owes
          crawlers and screen-reader users a descriptive title. */}
      <h1 className="sr-only">{HOME_TITLE}</h1>
      <GameweekBand greeting={greeting} dateLine={dateLine} gameweek={gwQ.data} />

      {/* -------------------------------------------------------- */}
      {/* 2. Matches                                                */}
      {/* -------------------------------------------------------- */}
      {/* The fixture list rises out of the band: pulled up over its lower
          edge so the gameweek and its matches read as one moment rather than
          a banner followed by a separate section. */}
      <Section index={1} className="relative -mt-10 sm:-mt-10">
        <UiCard padding="none" className="min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 ps-4 pe-2 pt-2">
            <h2 className={cn("truncate", ui.text.subtitle, ui.tone.default)}>
              {plain(t("home.live_upcoming"))}
            </h2>
            <ViewAllLink to="/matches" />
          </div>
          {matchesQ.isLoading && (
            <div className="grid gap-2 p-3">
              <SkeletonList count={2}>{() => <MatchCardSkeleton />}</SkeletonList>
            </div>
          )}
          {matchesQ.isError && (
            <div className="p-3">
              <ErrorState onRetry={() => void matchesQ.refetch()} />
            </div>
          )}
          {!matchesQ.isLoading && matchesQ.data?.matches.length === 0 && (
            <div className="p-3">
              <EmptyState compact>{t("state.empty")}</EmptyState>
            </div>
          )}
          {matchDays.map((day) => (
            <div key={day.key}>
              <div
                className={cn(
                  "px-4 pb-1 pt-3",
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.tone.muted,
                )}
              >
                {day.label}
              </div>
              <div className="divide-y divide-[color:var(--ui-rule)]">
                {day.matches.map((m) => {
                  const home = clubById(m.homeClubId);
                  const away = clubById(m.awayClubId);
                  if (!home || !away) return null;
                  return <MatchCard key={m.id} match={m} home={home} away={away} variant="list" />;
                })}
              </div>
            </div>
          ))}
        </UiCard>
      </Section>

      {/* -------------------------------------------------------- */}
      {/* 3. Fantasy — gameweek deadline / team entry                */}
      {/* -------------------------------------------------------- */}
      <Section index={2}>
        <SectionHeader
          title={plain(t("home.fantasy_hub"))}
          action={<ViewAllLink to="/fantasy" className={ALIGN_WITH_TITLE} />}
        />
        {status === "loading" || availability.isPending ? (
          <HeroSkeleton />
        ) : availability.isError ? (
          <ErrorState onRetry={() => void availability.refetch()} />
        ) : availability.data.status !== "ready" ? (
          <FantasyUnavailableState reason={availability.data.status} />
        ) : source === "guest" ? (
          <CreateTeamLink canCreate={canCreate} />
        ) : summaryQ.isError || gwQ.isError ? (
          <ErrorState
            onRetry={() => {
              void summaryQ.refetch();
              void gwQ.refetch();
            }}
          />
        ) : summaryQ.data && gwQ.data ? (
          <FantasySummaryCard
            summary={{
              ...summaryQ.data,
              managerName: user?.displayName?.trim() || summaryQ.data.managerName,
            }}
          />
        ) : summaryQ.isSuccess && summaryQ.data === null ? (
          <CreateTeamLink canCreate={canCreate} />
        ) : (
          <HeroSkeleton />
        )}

        {fantasyReady && source !== "guest" && (
          <div className="mt-3">
            {alertsQ.isError || playersQ.isError ? null : alertsQ.data && playersQ.data ? (
              alertsQ.data.length > 0 && (
                <>
                  <div className="mb-1.5 inline-flex items-center gap-1.5">
                    <Bell className={cn("h-3.5 w-3.5 shrink-0", ui.tone.ink)} aria-hidden />
                    {/* `home.fantasy_alerts` carries `{accent}` markers, so
                        it must go through <Trans> — rendered raw it prints
                        the literal markers on screen. */}
                    <Trans
                      text={t("home.fantasy_alerts")}
                      className={cn(ui.text.label, ui.tone.muted)}
                      accentClassName={ui.tone.ink}
                    />
                  </div>
                  <FantasyAlertList alerts={alertsQ.data} players={playersQ.data} />
                </>
              )
            ) : (
              <SkeletonList count={1}>{() => <AlertRowSkeleton />}</SkeletonList>
            )}
          </div>
        )}
      </Section>

      {/* -------------------------------------------------------- */}
      {/* 4. News preview — hidden at launch (NEWS_ENABLED)         */}
      {/* -------------------------------------------------------- */}
      {NEWS_ENABLED && (
        <Section index={3}>
          <SectionHeader
            title={plain(t("home.news_preview"))}
            action={<ViewAllLink to="/news" className={ALIGN_WITH_TITLE} />}
          />
          <div className="grid gap-2.5">
            {newsQ.isError ? (
              <ErrorState onRetry={() => void newsQ.refetch()} />
            ) : !newsPreview ? (
              <SkeletonList count={3}>{() => <ArticleCardSkeleton />}</SkeletonList>
            ) : newsPreview.length === 0 ? (
              <EmptyState compact>{t("state.empty")}</EmptyState>
            ) : (
              newsPreview.map((a) => (
                <ArticleCard key={a.id} article={a} variant="compact" clubs={clubsQ.data ?? []} />
              ))
            )}
          </div>
        </Section>
      )}

      {/* -------------------------------------------------------- */}
      {/* 5. Standings snapshot — only when the backend has one     */}
      {/* -------------------------------------------------------- */}
      {showStandings && (
        <Section index={4}>
          <SectionHeader
            title={plain(t("matches.table_preview"))}
            action={<ViewAllLink to="/matches" className={ALIGN_WITH_TITLE} />}
          />
          {standingsLoading ? (
            <SkeletonList count={5}>{() => <StandingsRowSkeleton />}</SkeletonList>
          ) : standingsFailed ? (
            <ErrorState
              onRetry={() => {
                void seasonsQ.refetch();
                void standingsQ.refetch();
              }}
            />
          ) : (
            <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)]">
              {standingsRows.slice(0, 5).map((row) => {
                const club = clubById(row.clubId);
                if (!club) return null;
                return (
                  <div key={row.clubId} className="flex items-center gap-2.5 px-3 py-2">
                    <span
                      className={cn(
                        "w-4 shrink-0 text-center font-mono",
                        ui.text.meta,
                        "[font-weight:var(--ui-weight-heavy)]",
                        ui.text.tabular,
                        ui.tone.muted,
                      )}
                      aria-hidden
                    >
                      {row.position}
                    </span>
                    <ClubCrest club={club} size="sm" />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        ui.text.body,
                        "[font-weight:var(--ui-weight-heavy)]",
                        ui.tone.default,
                      )}
                    >
                      {tr(club.shortName)}
                    </span>
                    <span
                      className={cn(
                        "w-7 shrink-0 text-center",
                        ui.text.micro,
                        ui.text.tabular,
                        ui.tone.muted,
                      )}
                      aria-label={t("matches.table.played")}
                    >
                      {row.played}
                    </span>
                    <span
                      className={cn(
                        "w-8 shrink-0 text-center",
                        ui.text.micro,
                        ui.text.tabular,
                        ui.tone.muted,
                      )}
                      aria-label={t("matches.table.goal_difference")}
                    >
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </span>
                    <span
                      className={cn(
                        "w-8 shrink-0 text-end",
                        ui.text.body,
                        "[font-weight:var(--ui-weight-hero)]",
                        ui.text.tabular,
                        ui.tone.default,
                      )}
                      aria-label={t("matches.table.points")}
                    >
                      {row.points}
                    </span>
                  </div>
                );
              })}
            </UiCard>
          )}
        </Section>
      )}

      {/* -------------------------------------------------------- */}
      {/* 6. Discovery links                                        */}
      {/* -------------------------------------------------------- */}
      <Section index={5} className="pb-2">
        <SectionHeader title={plain(t("home.explore"))} />
        <div className={cn("grid gap-2", NEWS_ENABLED ? "grid-cols-4" : "grid-cols-3")}>
          <DiscoveryLink to="/matches" icon={CircleDot} label={t("nav.matches")} />
          <DiscoveryLink to="/fantasy" icon={Trophy} label={t("nav.fantasy")} />
          {/* News discovery tile — hidden at launch (NEWS_ENABLED). */}
          {NEWS_ENABLED && <DiscoveryLink to="/news" icon={Newspaper} label={t("nav.news")} />}
          <DiscoveryLink to="/profile" icon={UserRound} label={t("nav.profile")} />
        </div>
      </Section>
    </AppShell>
  );
}

/** `SectionHeader` bottom-aligns its action, and the link's 44px tap box
 *  then centres its text 12px above the title's line. Pulling the box down by
 *  the header's own bottom padding puts the two on one line without
 *  shrinking the tap target. */
const ALIGN_WITH_TITLE = "-mb-3";

function ViewAllLink({
  to,
  className,
}: {
  to: "/news" | "/matches" | "/fantasy";
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-0.5 px-2 py-1.5",
        "min-h-[var(--ui-tap-min)]",
        ui.radius.control,
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        ui.tone.ink,
        "transition-colors duration-[var(--duration-quick)]",
        "hover:bg-[color:var(--ui-surface-sunken)]",
        ui.focus,
        className,
      )}
    >
      {t("home.view_all")}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

function DiscoveryLink({
  to,
  icon: Icon,
  label,
}: {
  to: "/matches" | "/fantasy" | "/news" | "/profile";
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}) {
  // One quiet row of tiles. These repeat the navigation bar, so they carry
  // the ink colour rather than the action gradient, which on this page is
  // kept for the one thing a guest should do (create a team).
  return (
    <Link
      to={to}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1.5 px-2 py-3 text-center",
        ui.surface.card,
        "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
        ui.focus,
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", ui.tone.ink)} aria-hidden />
      {/* Wraps rather than truncates: "Actualités" / "الملف الشخصي" do not
          fit a three- or four-up tile on one line at 360px. */}
      <span
        className={cn(
          "min-w-0 leading-tight",
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.tone.default,
        )}
      >
        {label}
      </span>
    </Link>
  );
}

/** Home titles are single-tone: the `{accent}` markers the dictionary
 *  carries for other surfaces are dropped here, so a title introduces its
 *  content without becoming a second accent on the page. */
function plain(text: string): string {
  return text.replace(/\{\/?accent\}/g, "");
}

function CreateTeamLink({ canCreate }: { canCreate: boolean }) {
  const { t } = useI18n();
  return (
    <UiLinkButton to={canCreate ? "/fantasy/create" : "/fantasy"} className="w-full">
      <Trophy className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{t(canCreate ? "fantasy.create.title" : "fantasy.title")}</span>
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </UiLinkButton>
  );
}

/**
 * The gameweek band: Home's anchor. The header gradient is the one the
 * Fantasy screens open on, so the page is recognisably BotolaGO without
 * another wordmark; on it, the gameweek at hero size and — while it is still
 * ahead — the Fantasy deadline, counting down. Full-bleed on a phone, a
 * rounded panel in the content column from `sm`. Its lower edge is covered by
 * the fixture list, which is why it carries extra bottom padding.
 */
function GameweekBand({
  greeting,
  dateLine,
  gameweek,
}: {
  greeting: string;
  dateLine: string;
  gameweek?: { number: number; deadline: string };
}) {
  const { t } = useI18n();
  const deadlineAhead =
    gameweek !== undefined && new Date(gameweek.deadline).getTime() > Date.now();
  return (
    <section
      className={cn(
        "-mx-[var(--ui-gutter)] px-[var(--ui-gutter)] pb-14 pt-5",
        "sm:mx-0 sm:mt-4 sm:rounded-[var(--ui-radius-control)] sm:px-6 sm:pt-6",
        ui.tone.onGradHeader,
        "animate-in fade-in-0 duration-500 ease-out",
      )}
      // `to bottom` inside the token: a degree angle would land on the
      // opposite edge under `dir="rtl"`.
      style={{ backgroundImage: "var(--ui-grad-header)" }}
    >
      <p className={cn("truncate", ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}>
        {greeting} · {capitalizeFirst(dateLine)}
      </p>
      {gameweek ? (
        <p className={cn("mt-1.5", ui.text.hero)}>
          {t("home.gameweek")} {gameweek.number}
        </p>
      ) : null}
      {deadlineAhead ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={ui.text.label}>{t("home.deadline")}</span>
          <DeadlineCountdown iso={gameweek.deadline} tone="onGradient" />
        </div>
      ) : null}
    </section>
  );
}

/** "mercredi 23 septembre" → "Mercredi 23 septembre". CSS `capitalize`
 *  would title-case every word, and French does not capitalise months. */
function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** Home's fixtures, grouped under the football day they are played on. */
function groupByMatchDay(matches: readonly Match[], lang: string) {
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: MATCH_TIME_ZONE });
  const labelFmt = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const days: { key: string; label: string; matches: Match[] }[] = [];
  for (const match of matches) {
    const kickoff = new Date(match.kickoff);
    const key = keyFmt.format(kickoff);
    const last = days[days.length - 1];
    if (last && last.key === key) last.matches.push(match);
    else days.push({ key, label: capitalizeFirst(labelFmt.format(kickoff)), matches: [match] });
  }
  return days;
}
