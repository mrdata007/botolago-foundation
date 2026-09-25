import fantasyHeroPhoto from "@/assets/photos/fantasy-hero.webp";
import { BrandedText } from "@/components/brand/BrandedText";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { MediaImage } from "@/components/common/FailureAwareImage";
import { SectionHeader, SectionHeaderLink } from "@/components/common/SectionHeader";
import { useDeadlineCountdown, formatDeadline } from "@/components/fpl/deadline";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { PrizeWelcome } from "@/components/prizes/PrizeWelcome";
import {
  FantasyHubLeagues,
  FantasyHubReminders,
  FantasyHubTeamArea,
} from "@/components/fantasy/FantasyHubPersonal";
import { fantasyHubLayout } from "@/components/fantasy/fantasy-hub-layout";
import { GameweekStatusText } from "@/components/fpl/GameweekStatusText";
import { nextDeadlineAfter } from "@/components/fantasy/gameweek-presentation";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { ui, UiCard, UiPageTitle, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import { NEWS_ENABLED, PRIZES_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";
import { newsService } from "@/services/news";
import { prizesService } from "@/services/prizes";
import type { Gameweek } from "@/types/domain";

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
 * call to action, the Transfers row, four shortcut tiles, then "Mes ligues"
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
function FantasyHub() {
  const { t, lang } = useI18n();
  const { user, status: authStatus } = useAuth();
  const screen = useFantasyScreen({ needsTeam: false, needsAuth: false });
  const { source, key } = useFantasyDataSource();
  const team = screen.team;
  const gameweek = screen.gameweek;
  const layout = fantasyHubLayout({ authStatus, source, phase: screen.phase, hasTeam: !!team });
  const hasTeam = layout.audience === "owner";

  // News is hidden at launch (owner decision — see `@/lib/feature-flags`), so
  // the hub's "News & Video" rail is not rendered and its feed is not fetched.
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
        <GameweekBand gameweek={gameweek} />
      ) : screen.phase === "loading" ? (
        <UiSkeleton className="h-24 rounded-none" />
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
          prizes={(introPrizes.data?.length ?? 0) > 0}
        />
      </div>

      <ShortcutTiles />

      {/* Personal: an overall rank, private leagues, a cup to qualify for.
          None of it can apply before there is a team. */}
      <FantasyHubLeagues
        layout={layout}
        gameweek={gameweek?.number ?? null}
        overallRank={summary.data?.overallRank ?? null}
        leagues={leagues.data ?? []}
        leaguesLoading={leagues.isPending && leagues.isEnabled}
      />

      {/* News & Video — hidden at launch (NEWS_ENABLED). */}
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
/* The gameweek band                                                    */
/* ------------------------------------------------------------------ */

/**
 * "JOURNÉE 14 · DATE LIMITE / ven. 25 sept., 19:30 — [⏱ 1j 13h 59min]" on the
 * floodlit photo.
 *
 * The scrim runs `to bottom` over the whole band: the board's `to right`
 * darkened only the text side, and in Arabic the text is on the other side.
 * Text on it is the plain on-ink white; the countdown pill is the action
 * gradient with ink-deep, the pairing the gradient is specified for. After
 * the deadline the pill gives way to the gameweek's state, when there is one.
 */
function GameweekBand({ gameweek }: { gameweek: Gameweek }) {
  const { t, lang } = useI18n();
  const left = useDeadlineCountdown(gameweek.deadline);
  // Read with the countdown's tick, so it appears when the deadline passes.
  const next = left?.passed ? nextDeadlineAfter(gameweek, Date.now()) : null;
  return (
    <section
      aria-label={`${t("fpl.gameweek")} ${gameweek.number}`}
      className="relative isolate overflow-hidden"
    >
      <img
        src={fantasyHeroPhoto}
        alt=""
        aria-hidden
        decoding="async"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_55%]"
      />
      <span
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 76%, transparent), color-mix(in oklab, var(--ui-ink-deep) 90%, transparent))",
        }}
      />
      <div className={cn("py-3.5", ui.space.gutter, ui.tone.onInkPlain)}>
        {/* One element, "Journée 14 · Date limite" — pinned by the e2e
            journey. The space between the two spans is part of the text. */}
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn(ui.display.title, "uppercase")}>
            {`${t("fpl.gameweek")} ${gameweek.number}`}
          </span>{" "}
          <span className={cn(ui.text.label, ui.tone.onInkMuted)}>{`· ${t("fpl.deadline")}`}</span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className={cn(ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
            <bdi>{formatDeadline(gameweek.deadline, lang, { weekday: "short" })}</bdi>
          </p>
          {left && !left.passed ? (
            // Home's deadline pill, so the same deadline reads the same way
            // on both screens ("13h 59min" on the last day, never "0j").
            <DeadlineCountdown iso={gameweek.deadline} />
          ) : left?.passed && gameweek.status ? (
            <GameweekStatusText
              status={gameweek.status}
              deadlinePassed
              className={cn(ui.text.label, "min-h-8")}
            />
          ) : null}
        </div>
        {next ? (
          // After the deadline, the one a manager can still act on: a team
          // that joined late plays from the next gameweek, and this is the
          // only place its deadline is named.
          <p className={cn("mt-1", ui.text.meta, ui.tone.onInkMuted)}>
            {`${t("fpl.gameweek")} ${next.number} · ${t("fantasy.next_deadline")} · `}
            <bdi>{formatDeadline(next.deadline, lang, { weekday: "short" })}</bdi>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Shortcuts                                                            */
/* ------------------------------------------------------------------ */

function ShortcutTiles() {
  const { t } = useI18n();
  const tiles: Array<{ to: string; label: string; icon: ReactNode }> = [
    { to: "/matches", label: t("fpl.fixtures"), icon: <CalendarDays aria-hidden /> },
    { to: "/fantasy/fixtures", label: t("fpl.fdr"), icon: <SlidersHorizontal aria-hidden /> },
    { to: "/fantasy/players", label: t("fpl.player_stats"), icon: <TrendingUp aria-hidden /> },
    { to: "/fantasy/top-players", label: t("fpl.top_players"), icon: <Star aria-hidden /> },
  ];
  return (
    <div className={cn("mt-2.5", ui.space.gutter)}>
      <ul className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <li key={tile.to} className="min-w-0">
            <Link
              to={tile.to}
              className={cn(
                "flex h-full items-center gap-2.5 px-2.5 py-2",
                ui.surface.card,
                ui.space.row,
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                ui.tone.default,
                "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
                ui.focus,
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center [&_svg]:h-[18px] [&_svg]:w-[18px]",
                  ui.radius.full,
                  ui.surface.sunken,
                  ui.tone.ink,
                )}
              >
                {tile.icon}
              </span>
              {/* Two lines, not an ellipsis: "Difficulté des matchs" and
                  "Statistiques joueurs" need them at 390px. */}
              <span className="min-w-0 text-balance">{tile.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* More about                                                           */
/* ------------------------------------------------------------------ */

function MoreAboutSection() {
  const { t } = useI18n();
  const rows: Array<{ to: string; label: string; icon: ReactNode }> = [
    ...(PRIZES_ENABLED
      ? [{ to: "/prizes", label: t("prizes.title"), icon: <Trophy aria-hidden /> }]
      : []),
    { to: "/fantasy/rules", label: t("fpl.rules"), icon: <BookOpen aria-hidden /> },
    { to: "/fantasy/help", label: t("fpl.help_rules"), icon: <CircleHelp aria-hidden /> },
  ];
  return (
    <section className={cn("mt-6", ui.space.gutter)}>
      {/* Not `SectionHeader`: that truncates, and this heading names the
          product — the wordmark stands in for "BotolaGO" — so it wraps. */}
      <h2 className={cn("pb-2.5 text-balance", ui.display.section, ui.tone.default)}>
        <BrandedText text={t("fpl.more_about")} />
      </h2>
      <UiCard padding="none">
        <ul>
          {rows.map((row, index) => (
            <li key={row.to} className={cn(index < rows.length - 1 && ui.rule.block)}>
              <Link
                to={row.to}
                className={cn(
                  "flex items-center gap-3 py-1.5 pe-3 ps-3",
                  ui.space.row,
                  ui.text.bodyStrong,
                  ui.tone.default,
                  "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
                  ui.focus,
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center [&_svg]:h-[18px] [&_svg]:w-[18px]",
                    ui.radius.full,
                    ui.surface.sunken,
                    ui.tone.ink,
                  )}
                >
                  {row.icon}
                </span>
                <span className="min-w-0 flex-1">{row.label}</span>
                <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </UiCard>
    </section>
  );
}
