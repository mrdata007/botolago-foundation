import { BrandedText } from "@/components/brand/BrandedText";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { MediaImage } from "@/components/common/FailureAwareImage";
import { SectionHeader, SectionHeaderLink } from "@/components/common/SectionHeader";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyHubRound } from "@/components/fantasy/FantasyHubRound";
import { DeadlineCard } from "@/components/fantasy/DeadlineCard";
import { FantasyGuestExplainer } from "@/components/fantasy/FantasyGuestIntro";
import { deadlineChecklist } from "@/lib/deadline-checklist";
import { PlusBriefingEntry } from "@/components/plus/PlusBriefing";
import { PrizeWelcome as ArrivalDialog } from "@/components/prizes/PrizeWelcome";
import {
  FantasyHubLeagues,
  FantasyHubReminders,
  FantasyHubTeamArea,
} from "@/components/fantasy/FantasyHubPersonal";
import { fantasyHubLayout } from "@/components/fantasy/fantasy-hub-layout";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { ui, UiCard, UiPageTitle, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import { NEWS_ENABLED, PRIZES_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";
import { useManagerCardLive } from "@/services/manager-card-status";
import { newsService } from "@/services/news";
import { prizesService } from "@/services/prizes";

// Pépites' tile is its own chunk, requested only while the section is live: with the switch off
// the hub imports nothing of the Manager Card.
const PepitesHubTile = lazy(() =>
  import("@/components/manager-card/inline/curva-inline").then((module) => ({
    default: module.PepitesHubTile,
  })),
);

/**
 * Whether a hero or the born panel was already shown in this session (plan 5.3), asked of the
 * card's own storage only while the section is live and only after mount: `null` until known,
 * and always `null` with the section off, which never loads it.
 */
function useHeroShownThisSession(live: boolean): boolean | null {
  const [shown, setShown] = useState<boolean | null>(null);
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    void import("@/components/manager-card/inline/curva-inline")
      .then((module) => {
        if (!cancelled) setShown(module.heroShownThisSession());
      })
      .catch(() => {
        if (!cancelled) setShown(false);
      });
    return () => {
      cancelled = true;
    };
  }, [live]);
  return shown;
}

export const Route = createFileRoute("/fantasy/")({
  head: () => fantasyHead("hub"),
  component: FantasyHub,
});

/**
 * FPL-001 Fantasy hub + FPL-015 "Leagues & Cups" section, reconstructed
 * screen-for-screen with BotolaGO identity and Botola Pro data.
 *
 * Option A (A-Fantasy), top to bottom: the global white top bar (the hub has
 * no `UiHeader`, so the bar returns on phones here), the "Fantasy" title band,
 * the gameweek on a floodlit photo with its deadline and a countdown pill,
 * the manager's gradient team card, "Composer l'équipe" as the one gradient
 * call to action, the Transfers row, the shortcuts as one plain list, then "Mes ligues"
 * as rows with an edge bar. Below the board's fold, the pieces of the old hub
 * that are real features stay, restyled: the cup note, the News rail (hidden
 * while News is), the Fantasy reminder and e-mail switches and the rules / help
 * links.
 *
 * NOT copied from the board, on purpose:
 *   - "▲ 1 210" rank movement — the summary has no previous overall rank;
 *   - the club-coloured league bars — leagues carry no club, so private
 *     leagues take the ink edge and the general ones the brand gradient;
 *   - the "J.14 · EN DIRECT" pill — shown only when the backend reports the
 *     gameweek live, which the demo data never does;
 *   - the `to right` photo scrim — it is `to bottom` (a horizontal gradient
 *     lands on the wrong side in Arabic).
 *
 * The caption "Journée 14 · Date limite" stays ONE element: the e2e journey
 * finds the hub by that exact text.
 *
 * All of the above is the OWNER's hub. A visitor without a team — signed out,
 * or signed in before creating one — gets the first-time proposition
 * (`FantasyGuestIntro`) where the team card would be, and neither "Mes
 * ligues", the cup nor the reminder switches, which cannot apply to them yet
 * (audit 2026-09-25, A16). `fantasyHubLayout` makes that call, and the
 * personal parts it decides — the team card's place, the leagues, the
 * reminders — are `FantasyHubPersonal`'s; the band, the shortcuts, the News
 * rail and the "more about" links are public and stay here.
 */
/**
 * The hub's arrival dialog (the prize welcome). While the section is live the card's moment comes
 * first: it waits until it is known that no hero or born panel was shown in this session, and for
 * the next session if one was (plan 5.3). With the section off it is the dialog, exactly.
 */
function PrizeWelcome() {
  const live = useManagerCardLive();
  const heroShown = useHeroShownThisSession(live);
  if (live && heroShown !== false) return null;
  return <ArrivalDialog />;
}

const DEADLINE_SKELETON_HEIGHT = {
  guest: { fr: "h-[199px]", ar: "h-[233px]" },
  owner: { fr: "h-[317px]", ar: "h-[361px]" },
} as const;

function FantasyHub() {
  const { t, lang } = useI18n();
  const { user, status: authStatus } = useAuth();
  const screen = useFantasyScreen({ needsTeam: false, needsAuth: false });
  const { source, key } = useFantasyDataSource();
  const team = screen.team;
  const gameweek = screen.gameweek;
  const layout = fantasyHubLayout({ authStatus, source, phase: screen.phase, hasTeam: !!team });
  const hasTeam = layout.audience === "owner";
  // A visitor without a team, with registration closed: the card under the
  // gameweek is a short notice, the public shortcuts follow it at once, and
  // the explanation of the game comes after them.
  const closedGuest = layout.intro !== null && gameweek?.enrolment === null;

  // The hub's "News & Video" rail and its feed follow `NEWS_ENABLED`
  // (`@/lib/feature-flags`): off, the rail is not rendered and the feed not fetched.
  const articles = useQuery({
    queryKey: ["fantasy-articles", lang],
    queryFn: () => newsService.getArticles(lang, { category: "for_you" }),
    staleTime: 5 * 60_000,
    enabled: NEWS_ENABLED,
  });
  // The reference "News & Video" cards always carry a photo: prefer articles
  // with a real hero image and only fall back to the gradient-backed ones
  // when the feed has no illustrated article at all.
  const illustrated = (articles.data ?? []).filter((article) => !!article.heroUrl);
  const hubArticles = (illustrated.length > 0 ? illustrated : (articles.data ?? [])).slice(0, 6);
  // The same query, key and service Home and the rankings use, so the card
  // and those screens read one cached answer.
  const summary = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: hasTeam,
  });
  // Every source, like the leagues screen itself — it used to be cloud-only,
  // which left the demo hub saying "no leagues" beside a leagues screen that
  // listed two.
  const leagues = useQuery({
    queryKey: key("leagues", "private"),
    queryFn: () => fantasyService.getLeagues("private"),
    enabled: hasTeam,
  });
  // The fixtures the other Fantasy screens read, for "starters with no match".
  const fixtures = useQuery({
    queryKey: key("fixture-difficulty"),
    queryFn: () => fantasyService.getFixtureDifficulty(),
    enabled: hasTeam && !!gameweek,
    staleTime: 60_000,
  });
  const checklist =
    hasTeam && team && gameweek
      ? deadlineChecklist(team, screen.players, fixtures.data ?? [], gameweek.number)
      : undefined;
  // The prize welcome's catalog, same key: the proposition says prizes are
  // there to be won only when the catalog lists one, and says it inline —
  // the dialog itself waits until there is a team to go with it.
  const introPrizes = useQuery({
    queryKey: ["prizes", "catalog"],
    queryFn: () => prizesService.listPrizes(),
    enabled: PRIZES_ENABLED && layout.intro !== null,
    staleTime: 5 * 60_000,
  });

  return (
    <FantasyFrame bottomNav topBar="always">
      <UiPageTitle title={t("fantasy.title")} />

      {gameweek && screen.phase === "ready" ? (
        <DeadlineCard
          gameweek={gameweek}
          checklist={checklist}
          freeTransfers={hasTeam && team ? team.freeTransfers : undefined}
        />
      ) : screen.phase === "loading" ? (
        // Hold the height of the card that is coming, so nothing below moves
        // when it arrives. A visitor with no account gets the countdown alone;
        // anyone signed in is held at the manager's card (countdown, checklist
        // and two buttons), the common case. Measured at 390px: French 199 and
        // 317, Arabic 233 and 361. A signed-in reader with no team, or a
        // gameweek past its deadline, gets a shorter card than the placeholder.
        <UiSkeleton
          className={cn(
            "rounded-none",
            DEADLINE_SKELETON_HEIGHT[
              authStatus === "guest" || authStatus === "anonymous" ? "guest" : "owner"
            ][lang === "ar" ? "ar" : "fr"],
          )}
        />
      ) : null}

      {/* BotolaGO+ « Briefing avant la deadline »: nothing while the feature is off. */}
      {hasTeam && gameweek && screen.phase === "ready" ? (
        <div className={ui.space.gutter}>
          <PlusBriefingEntry gameweekNumber={gameweek.number} />
        </div>
      ) : null}

      <div className={cn("pt-3.5", ui.space.gutter)}>
        <FantasyHubTeamArea
          layout={layout}
          phase={screen.phase}
          retry={screen.retry}
          gameweek={gameweek}
          team={team}
          displayName={user?.displayName ?? null}
          summary={summary.data ?? null}
          summaryPending={summary.isPending}
          summaryFailed={summary.isError}
          prizes={(introPrizes.data?.length ?? 0) > 0}
        />
      </div>

      {hasTeam && team && gameweek && screen.phase === "ready" ? (
        <FantasyHubRound
          team={team}
          players={screen.players}
          clubs={screen.clubs}
          fixtures={fixtures.data ?? []}
          fixturesPending={fixtures.isPending}
          gameweek={gameweek}
          summary={summary.data ?? null}
          summaryPending={summary.isPending}
        />
      ) : null}

      <ShortcutList visitor={!hasTeam} />

      {closedGuest ? (
        <div className={cn("mt-4", ui.space.gutter)}>
          <FantasyGuestExplainer prizes={(introPrizes.data?.length ?? 0) > 0} />
        </div>
      ) : null}

      {/* Personal: an overall rank, private leagues, a cup to qualify for.
          None of it can apply before there is a team. */}
      <FantasyHubLeagues
        layout={layout}
        gameweek={gameweek?.number ?? null}
        overallRank={summary.data?.overallRank ?? null}
        leagues={leagues.data ?? []}
        leaguesLoading={leagues.isPending && leagues.isEnabled}
      />

      {/* News & Video — follows NEWS_ENABLED. */}
      {NEWS_ENABLED && (
        <section className="mt-6">
          <div className={ui.space.gutter}>
            <SectionHeader
              title={t("fpl.news_video")}
              action={<SectionHeaderLink to="/news">{t("fpl.view_all")}</SectionHeaderLink>}
            />
          </div>
          <div
            className={cn(
              "flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none]",
              ui.space.gutter,
            )}
          >
            {hubArticles.map((article) => (
              <Link
                key={article.id}
                to="/news/$articleId"
                params={{ articleId: article.id }}
                className={cn(
                  "w-[190px] shrink-0 snap-start overflow-hidden",
                  ui.surface.card,
                  ui.focus,
                )}
              >
                {article.heroUrl ? (
                  <MediaImage
                    src={article.heroUrl}
                    alt={article.heroAlt ?? ""}
                    fallback={article.heroGradient}
                    frame={{ sizes: "190px", ratio: 16 / 10 }}
                    className="aspect-[16/10] w-full"
                  />
                ) : null}
                <p
                  className={cn(
                    "line-clamp-3 px-3 py-2",
                    ui.text.meta,
                    "[font-weight:var(--ui-weight-heavy)]",
                    ui.tone.default,
                  )}
                >
                  {article.title[lang] ?? article.title.fr}
                </p>
              </Link>
            ))}
            {articles.isPending
              ? [0, 1, 2].map((index) => (
                  <UiSkeleton
                    key={index}
                    className={cn("h-[170px] w-[190px] shrink-0", ui.radius.card)}
                  />
                ))
              : null}
          </div>
        </section>
      )}

      <FantasyHubReminders layout={layout} />

      <MoreAboutSection />

      {/* The hub's one arrival dialog, shown once per device while prizes are
          on. It waits for the splash and the language chooser to let go, and
          opens over the owner's dashboard only: a visitor without a team has
          the proposition, which names the prizes inline. */}
      {PRIZES_ENABLED && layout.prizeWelcome && <PrizeWelcome />}
    </FantasyFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Shortcuts                                                            */
/* ------------------------------------------------------------------ */

type Row = { to: string; label: string };

/**
 * A plain list of links: one white card, a row per destination, the label and
 * a chevron. No icon discs and no tile grid; the words say where each goes.
 */
function LinkList({ rows }: { rows: Row[] }) {
  return (
    <UiCard padding="none">
      <ul>
        {rows.map((row, index) => (
          <li key={row.to} className={cn(index < rows.length - 1 && ui.rule.block)}>
            <Link
              to={row.to}
              className={cn(
                "flex items-center gap-3 py-1.5 pe-3 ps-4",
                ui.space.row,
                ui.text.bodyStrong,
                ui.tone.default,
                "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
                ui.focus,
              )}
            >
              <span className="min-w-0 flex-1">{row.label}</span>
              <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </UiCard>
  );
}

/**
 * The hub's shortcuts as one list, under the team area. A visitor with no team
 * has no "Mes ligues" rows to reach the board from, so the general ranking and
 * the leagues lead their list (the leagues need an account: the label says so,
 * "créer ou rejoindre", and the page asks to sign in). They used to be a second
 * grid of tiles above the proposition (U18), which put a block of links between
 * the deadline and "Créer mon équipe"; now the deadline and that one button are
 * the first screen, and the list follows.
 */
function ShortcutList({ visitor }: { visitor: boolean }) {
  const { t } = useI18n();
  const live = useManagerCardLive();
  const rows: Row[] = [
    ...(visitor
      ? [
          { to: "/fantasy/rankings", label: t("fpl.rankings") },
          { to: "/fantasy/leagues", label: t("fantasy.hub.visitor_leagues") },
        ]
      : []),
    { to: "/matches", label: t("fpl.fixtures") },
    { to: "/fantasy/fixtures", label: t("fpl.fdr") },
    { to: "/fantasy/players", label: t("fpl.player_stats") },
    { to: "/fantasy/top-players", label: t("fpl.top_players") },
  ];
  return (
    <div className={cn("mt-4", ui.space.gutter)}>
      <LinkList rows={rows} />
      {live ? (
        // Pépites lives inside Fantasy while the section is live (plan 3.4): its own row, under
        // the shortcuts, for every audience.
        <Suspense fallback={null}>
          <PepitesHubTile className="mt-2" />
        </Suspense>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* More about                                                           */
/* ------------------------------------------------------------------ */

/** The prizes, then one rules link and one help link: each destination once on the hub. */
function MoreAboutSection() {
  const { t } = useI18n();
  const rows: Row[] = [
    ...(PRIZES_ENABLED ? [{ to: "/prizes", label: t("prizes.title") }] : []),
    { to: "/fantasy/rules", label: t("fpl.rules") },
    { to: "/fantasy/help", label: t("fantasy.hub.help_link") },
  ];
  return (
    <section className={cn("mt-6", ui.space.gutter)}>
      {/* Not `SectionHeader`: that truncates, and this heading names the
          product — the wordmark stands in for "BotolaGO" — so it wraps. */}
      <h2 className={cn("pb-2.5 text-balance", ui.display.section, ui.tone.default)}>
        <BrandedText text={t("fpl.more_about")} />
      </h2>
      <LinkList rows={rows} />
    </section>
  );
}
