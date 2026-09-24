import fantasyHeroPhoto from "@/assets/photos/fantasy-hero.webp";
import emptyLeaguesArt from "@/assets/illustrations/empty-leagues.webp";
import { BrandedText } from "@/components/brand/BrandedText";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Mail,
  Plus,
  Settings2,
  Shirt,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { MediaImage } from "@/components/common/FailureAwareImage";
import {
  SectionGroupHeader,
  SectionHeader,
  SectionHeaderLink,
} from "@/components/common/SectionHeader";
import { useDeadlineCountdown, formatDeadline } from "@/components/fpl/deadline";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { LeagueList } from "@/components/fantasy-lists/LeagueList";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyPhaseBody } from "@/components/fpl/FantasyScreenGate";
import { PrizeWelcome } from "@/components/prizes/PrizeWelcome";
import { GameweekStatusText } from "@/components/fpl/GameweekStatusText";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { ui, UiCard, UiLinkButton, UiLivePill, UiPageTitle, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED, PRIZES_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useMyNotificationPreferences } from "@/services/use-notification-preferences";
import { fantasyService } from "@/services/fantasy-runtime";
import { newsService } from "@/services/news";
import type { Gameweek } from "@/types/domain";

export const Route = createFileRoute("/fantasy/")({
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
 */
function FantasyHub() {
  const { t, lang } = useI18n();
  const { user, status: authStatus } = useAuth();
  const screen = useFantasyScreen({ needsTeam: false, needsAuth: false });
  const { source, key } = useFantasyDataSource();
  const team = screen.team;
  const gameweek = screen.gameweek;
  const isGuestView = authStatus !== "authenticated" || source === "guest";
  const hasTeam = screen.phase === "ready" && !!team && !isGuestView;

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

  const teamArea = (() => {
    if (screen.phase === "loading" || authStatus === "loading") {
      return (
        <div role="status" aria-label={t("state.loading")} className="space-y-3">
          <UiSkeleton className={cn("h-44", ui.radius.sheet)} />
          <UiSkeleton className={cn("h-12", ui.radius.full)} />
        </div>
      );
    }
    if (screen.phase !== "ready") {
      return (
        <FantasyPhaseBody phase={screen.phase} next="/fantasy" retry={screen.retry} className="" />
      );
    }
    if (isGuestView) {
      return <FantasyPhaseBody phase="guest" next="/fantasy" retry={screen.retry} className="" />;
    }
    if (!team) {
      return (
        <>
          <div
            className={cn(
              "px-4 py-4",
              ui.radius.sheet,
              ui.shadow.lifted,
              "text-[color:var(--ui-ink-deep)]",
            )}
            style={{ backgroundImage: "var(--ui-grad-action)" }}
          >
            <p className={ui.display.section}>{t("fpl.your_team")}</p>
            <p className={cn("mt-1", ui.text.secondary, "[font-weight:var(--ui-weight-strong)]")}>
              {t("fpl.no_team_yet")}
            </p>
          </div>
          <UiLinkButton to="/fantasy/create" variant="ink" className="mt-3">
            <Plus className="h-5 w-5" aria-hidden />
            {t("fpl.create_team")}
          </UiLinkButton>
        </>
      );
    }
    const manager = user?.displayName?.trim() || summary.data?.managerName || team.managerName;
    return (
      <>
        <TeamCard
          teamName={team.teamName}
          manager={manager && manager !== team.teamName ? manager : null}
          gameweek={gameweek}
          points={summary.data?.gameweekPoints ?? null}
          total={summary.data?.totalPoints ?? null}
          overallRank={summary.data?.overallRank ?? null}
          pending={summary.isPending}
        />
        <UiLinkButton to="/fantasy/team" variant="gradient" className="mt-3.5">
          <Shirt className="h-5 w-5" aria-hidden />
          {t("fpl.pick_team")}
        </UiLinkButton>
        <TransfersRow freeTransfers={team.freeTransfers} bank={team.bank} />
      </>
    );
  })();

  return (
    <FantasyFrame bottomNav topBar="always">
      <UiPageTitle title={t("fantasy.title")} />

      {gameweek && screen.phase === "ready" ? (
        <GameweekBand gameweek={gameweek} />
      ) : screen.phase === "loading" ? (
        <UiSkeleton className="h-24 rounded-none" />
      ) : null}

      <div className={cn("pt-3.5", ui.space.gutter)}>{teamArea}</div>

      <ShortcutTiles />

      <LeaguesSection
        phase={screen.phase}
        hasTeam={hasTeam}
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

      <NotificationsSection />

      <MoreAboutSection />

      {/* The hub's one arrival dialog, shown once per device while prizes are
          on. It waits for the splash and the language chooser to let go. */}
      {PRIZES_ENABLED && <PrizeWelcome hasTeam={hasTeam} />}
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
            <GameweekStatusText status={gameweek.status} className={cn(ui.text.label, "min-h-8")} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The team card                                                        */
/* ------------------------------------------------------------------ */

/**
 * The manager's card, on the action gradient (a feature surface: sheet
 * radius, the lifted shadow). Everything on it is ink-deep, the gradient's own
 * foreground in both themes; the strip at its foot is a 55% veil of the
 * on-ink white, which stays light in dark too, so the ink-deep figures keep
 * their contrast there.
 *
 * The points figure stands alone, so it is Changa (`ui.score.hero`); the
 * three under it are a row read as a set, so they stay on the stat ramp.
 * Every figure is real or an en dash — no invented movement, no zero for
 * "not known yet". The whole card opens the team profile, as the old team
 * link did.
 */
function TeamCard({
  teamName,
  manager,
  gameweek,
  points,
  total,
  overallRank,
  pending,
}: {
  teamName: string;
  manager: string | null;
  gameweek: Gameweek | null;
  points: number | null;
  total: number | null;
  overallRank: number | null;
  pending: boolean;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const none = t("fantasy.stat.none");
  const live = gameweek?.status === "live";
  const figure = (value: number | null) =>
    pending ? (
      <UiSkeleton className="mx-auto h-6 w-10" />
    ) : value === null ? (
      none
    ) : (
      nf.format(value)
    );
  const veil = "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_55%,transparent)]";
  const seam = "border-s border-[color:color-mix(in_oklab,var(--ui-ink-deep)_14%,transparent)]";
  return (
    <Link
      to="/fantasy/profile"
      className={cn(
        "block overflow-hidden",
        ui.radius.sheet,
        ui.shadow.lifted,
        "text-[color:var(--ui-ink-deep)]",
        ui.focus,
      )}
      style={{ backgroundImage: "var(--ui-grad-action)" }}
    >
      <div className="flex items-start justify-between gap-3 px-4 pb-3.5 pt-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className={cn("line-clamp-2 break-words", ui.display.section)}>{teamName}</p>
          {manager ? (
            <p className={cn("truncate", ui.text.meta, "[font-weight:var(--ui-weight-strong)]")}>
              {manager}
            </p>
          ) : null}
          {overallRank !== null ? (
            <p className={cn("mt-2", ui.text.meta, "[font-weight:var(--ui-weight-strong)]")}>
              {t("fpl.rank")} <span className={ui.text.tabular}>{nf.format(overallRank)}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-baseline gap-1">
            {pending ? (
              <UiSkeleton className="h-12 w-16" />
            ) : (
              <bdi className={ui.score.hero}>{points === null ? none : nf.format(points)}</bdi>
            )}
            <span className={cn(ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
              {t("fantasy.points.abbr")}
            </span>
          </div>
          {live && gameweek ? (
            <UiLivePill
              label={`${t("fantasy.leagues.gw")}${gameweek.number} · ${t("matches.status.live")}`}
            />
          ) : (
            <span className={cn("max-w-[9.5rem] text-balance text-end", ui.text.label)}>
              {t("fantasy.gw_points")}
            </span>
          )}
        </div>
      </div>
      <dl className={cn("grid grid-cols-3 text-center", veil)}>
        <div className="flex flex-col items-center gap-0.5 px-1 py-2.5">
          <dt className={ui.text.label}>{t("fpl.average")}</dt>
          <dd className={ui.stat.lg}>{figure(gameweek?.averagePoints ?? null)}</dd>
        </div>
        <div className={cn("flex flex-col items-center gap-0.5 px-1 py-2.5", seam)}>
          <dt className={ui.text.label}>{t("fpl.highest")}</dt>
          <dd className={ui.stat.lg}>{figure(gameweek?.highestPoints ?? null)}</dd>
        </div>
        <div className={cn("flex flex-col items-center gap-0.5 px-1 py-2.5", seam)}>
          <dt className={ui.text.label}>{t("fpl.total")}</dt>
          <dd className={ui.stat.lg}>{figure(total)}</dd>
        </div>
      </dl>
    </Link>
  );
}

/** "Transferts — Transferts gratuits 1 · Banque 1,4 ›" */
function TransfersRow({ freeTransfers, bank }: { freeTransfers: number; bank: number }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return (
    <Link
      to="/fantasy/transfers"
      className={cn(
        "mt-2 flex items-center gap-3 px-3 py-2.5",
        ui.surface.card,
        ui.space.row,
        "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
        ui.focus,
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center",
          ui.radius.full,
          ui.surface.sunken,
          ui.tone.ink,
        )}
      >
        <ArrowDownUp className="h-5 w-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{t("fpl.transfers")}</span>
        {/* Each figure stays with its label; under 390px the line breaks
            between the two pairs instead of cutting the bank off. */}
        <span className={cn(ui.text.meta, ui.tone.muted)}>
          <span className="whitespace-nowrap">
            {t("fpl.free_transfers")} <span className={ui.text.tabular}>{freeTransfers}</span> ·
          </span>{" "}
          <span className="whitespace-nowrap">
            {t("fpl.bank")} <span className={ui.text.tabular}>{nf.format(bank)}</span>
          </span>
        </span>
      </span>
      <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
    </Link>
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
/* Leagues                                                              */
/* ------------------------------------------------------------------ */

function LeaguesSection({
  phase,
  hasTeam,
  gameweek,
  overallRank,
  leagues,
  leaguesLoading,
}: {
  phase: string;
  hasTeam: boolean;
  gameweek: number | null;
  overallRank: number | null;
  leagues: Array<{ id: string; name: string; rank: number | null; members: number }>;
  leaguesLoading: boolean;
}) {
  const { t } = useI18n();
  return (
    <section className={cn("mt-6", ui.space.gutter)}>
      <SectionHeader title={t("fantasy.hub.my_leagues")} />

      {/* The same rows as Leagues & Cups (`LeagueList`): one look for a
          league wherever it is listed, and its focus ring drawn inside the
          clipped card. */}
      <SectionGroupHeader title={t("fpl.general_leagues")} />
      <LeagueList
        label={t("fpl.general_leagues")}
        rows={[
          { key: "overall", name: t("fpl.overall"), to: "/fantasy/rankings", rank: overallRank },
          ...(gameweek
            ? [
                {
                  key: "gameweek",
                  name: t("fpl.gameweek_league").replace("{n}", String(gameweek)),
                  to: "/fantasy/rankings",
                  rank: null,
                },
              ]
            : []),
        ]}
      />

      <SectionGroupHeader title={t("fpl.private_leagues")} className="mt-4" />
      {phase !== "ready" || !hasTeam ? (
        <NoLeaguesNote text={t("fpl.no_leagues")} />
      ) : leaguesLoading ? (
        <UiSkeleton className={cn("h-14", ui.radius.card)} />
      ) : leagues.length === 0 ? (
        <NoLeaguesNote text={t("fpl.no_leagues")} />
      ) : (
        <LeagueList
          label={t("fpl.private_leagues")}
          rows={leagues.map((league) => ({
            key: league.id,
            name: league.name,
            to: `/fantasy/leagues/${league.id}`,
            rank: league.rank,
            members: league.members,
          }))}
        />
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <UiLinkButton to="/fantasy/leagues/join" variant="soft" size="sm" className="flex-auto">
          <Plus className="h-4 w-4" aria-hidden />
          {t("fpl.join_leagues")}
        </UiLinkButton>
        <UiLinkButton to="/fantasy/leagues" variant="soft" size="sm" className="flex-auto">
          <Settings2 className="h-4 w-4" aria-hidden />
          {t("fpl.configure_leagues")}
        </UiLinkButton>
      </div>

      <SectionGroupHeader title={t("fpl.cups")} className="mt-5" />
      <UiCard padding="md">
        <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{t("fpl.cup_not_qualified")}</p>
        <h3 className={cn("mt-3", ui.text.label, ui.tone.muted)}>{t("fpl.cup_how_title")}</h3>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("fpl.cup_how_body")}</p>
      </UiCard>
    </section>
  );
}

/** "No private leagues yet", with the same spot art as the leagues page. */
function NoLeaguesNote({ text }: { text: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-3 py-2.5", ui.surface.card)}>
      <img
        src={emptyLeaguesArt}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="h-12 w-auto shrink-0 object-contain"
      />
      <p className={cn(ui.text.meta, ui.tone.muted)}>{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                        */
/* ------------------------------------------------------------------ */

function NotificationsSection() {
  const { t } = useI18n();
  const { user, status, refresh } = useAuth();
  const { preferences, setEmailEnabled } = useMyNotificationPreferences();
  const [busy, setBusy] = useState(false);
  const enabled = status === "authenticated" && !!user;
  const reminders = !!user?.notifications.fantasyDeadlines;
  const email = !!preferences?.channels.email;

  // Both switches write the same preferences row, so one waits for the other.
  const toggleReminders = async () => {
    if (!enabled || busy) return;
    setBusy(true);
    try {
      const result = await authService.completeProfile({
        notifications: { fantasyDeadlines: !reminders },
      });
      if (!result.ok) toast.error(t("state.error"));
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleEmail = async () => {
    if (!enabled || busy || !preferences) return;
    setBusy(true);
    try {
      await setEmailEnabled(!email);
    } catch {
      toast.error(t("state.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn("mt-6", ui.space.gutter)}>
      <SectionHeader title={t("fpl.notifications")} />
      <p className={cn("-mt-1 mb-2.5", ui.text.secondary, ui.tone.muted)}>
        {t("fpl.notifications_body")}
      </p>
      <UiCard padding="none">
        {/* The Fantasy reminder preference. It used to be labelled "push",
            and there are no push notifications. */}
        <ToggleRow
          icon={<Bell className="h-[18px] w-[18px]" aria-hidden />}
          label={t("auth.setup.notif_deadline")}
          checked={reminders}
          disabled={!enabled || busy}
          onChange={toggleReminders}
        />
        <ToggleRow
          icon={<Mail className="h-[18px] w-[18px]" aria-hidden />}
          label={t("fpl.emails")}
          checked={email}
          disabled={!enabled || busy || !preferences}
          onChange={toggleEmail}
          hint={enabled && user.email ? <bdi dir="ltr">{user.email}</bdi> : undefined}
          last
        />
      </UiCard>
    </section>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  disabled,
  onChange,
  hint,
  last = false,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  hint?: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-1.5 pe-2 ps-3",
        ui.space.row,
        !last && ui.rule.block,
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center",
            ui.radius.full,
            ui.surface.sunken,
            ui.tone.ink,
          )}
        >
          {icon}
        </span>
        <span className={cn("min-w-0", ui.text.bodyStrong, ui.tone.default)}>
          {label}
          {hint ? (
            <span className={cn("block [overflow-wrap:anywhere]", ui.text.micro, ui.tone.muted)}>
              {hint}
            </span>
          ) : null}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={cn(
          // The 32px track is the visual; the control itself clears the 44px
          // tap floor, which the bare track did not.
          "grid shrink-0 place-items-center disabled:opacity-50",
          ui.space.tap,
          ui.radius.full,
          ui.focus,
        )}
      >
        <span
          aria-hidden
          className={cn("relative block h-8 w-14 transition-colors", ui.radius.full)}
          style={{
            backgroundColor: checked ? "var(--ui-positive)" : "var(--ui-surface-sunken)",
          }}
        >
          <span
            className={cn(
              "absolute top-1 h-6 w-6 transition-[inset-inline-start]",
              ui.radius.full,
              ui.shadow.card,
              checked ? "start-7" : "start-1",
            )}
            style={{ backgroundColor: "var(--ui-surface)" }}
          />
        </span>
      </button>
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
