import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowRightLeft,
  Bell,
  CalendarDays,
  Mail,
  Newspaper,
  Plus,
  Settings,
  Shirt,
  Trophy,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { MediaImage } from "@/components/common/FailureAwareImage";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyPhaseBody } from "@/components/fpl/FantasyScreenGate";
import { FplPill, FplSegmented } from "@/components/fpl/primitives";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { newsService } from "@/services/news";

export const Route = createFileRoute("/fantasy/")({
  component: FantasyHub,
});

/**
 * FPL-001 Fantasy hub + FPL-015 "Leagues & Cups" section, reconstructed
 * screen-for-screen with BotolaGO identity and Botola Pro data.
 */
function FantasyHub() {
  const { t, lang } = useI18n();
  const { user, status: authStatus } = useAuth();
  const screen = useFantasyScreen({ needsTeam: false, needsAuth: false });
  const owned = useFantasyOwned();
  const { source, key } = useFantasyDataSource();
  const team = screen.team;
  const gameweek = screen.gameweek;

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
  const leagues = useQuery({
    queryKey: key("leagues", "private"),
    queryFn: () => fantasyService.getLeagues("private"),
    enabled: source === "cloud" && screen.phase === "ready" && !!team,
  });

  const deadlineText = gameweek
    ? new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Casablanca",
      }).format(new Date(gameweek.deadline))
    : null;

  const teamCard = (() => {
    if (screen.phase === "loading") {
      return (
        <div className="h-14 animate-pulse rounded-[6px] bg-white/60 motion-reduce:animate-none" />
      );
    }
    if (authStatus !== "authenticated" || source === "guest") {
      return (
        <Link to="/auth/login" search={{ next: "/fantasy" }} className="fpl-team-card">
          {t("auth.prompt.login")} <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      );
    }
    if (team) {
      return (
        <Link to="/fantasy/profile" className="fpl-team-card">
          <span className="truncate">{team.teamName}</span>
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
        </Link>
      );
    }
    return (
      <Link to="/fantasy/create" className="fpl-team-card">
        {t("fpl.create_team")} <ArrowRight className="h-5 w-5" aria-hidden />
      </Link>
    );
  })();

  return (
    <FantasyFrame bottomNav>
      {/* Hero */}
      <section
        className="relative overflow-hidden px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)]"
        style={{ backgroundImage: "var(--fpl-hero)" }}
      >
        <div className="flex items-center gap-2 pt-6">
          <img src="/favicon.png" alt="" width={40} height={40} className="h-10 w-10 rounded-lg" />
          <h1 className="text-[34px] font-black tracking-tight text-[color:var(--fpl-ink-deep)]">
            {t("fantasy.title")}
          </h1>
        </div>
        <div className="mt-4">{teamCard}</div>

        <div className="mt-3 rounded-[6px] bg-white/85 px-4 pb-4 pt-3 text-center backdrop-blur">
          {screen.phase === "ready" || screen.phase === "guest" || screen.phase === "no_team" ? (
            <>
              {gameweek ? (
                <>
                  <FplPill>{`${t("fpl.gameweek")} ${gameweek.number}`}</FplPill>
                  <p className="mt-2 text-[14px] text-[color:var(--fpl-ink-deep)]">
                    {t("fpl.gameweek")} {gameweek.number} {t("fpl.deadline")}:{" "}
                    <strong className="font-extrabold">{deadlineText}</strong>
                  </p>
                </>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <HubButton
                  to="/fantasy/team"
                  gradient
                  icon={<Shirt className="h-4 w-4" aria-hidden />}
                >
                  {t("fpl.pick_team")}
                </HubButton>
                <HubButton
                  to="/fantasy/transfers"
                  gradient
                  icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />}
                >
                  {t("fpl.transfers")}
                </HubButton>
                <HubButton to="/matches">{t("fpl.fixtures")}</HubButton>
                <HubButton to="/fantasy/fixtures">{t("fpl.fdr")}</HubButton>
                <HubButton to="/fantasy/players">{t("fpl.player_stats")}</HubButton>
                <HubButton to="/fantasy/top-players">{t("fpl.top_players")}</HubButton>
              </div>
            </>
          ) : (
            <div className="-mx-4 -mb-4">
              <FantasyPhaseBody phase={screen.phase} next="/fantasy" retry={screen.retry} />
            </div>
          )}
        </div>
      </section>

      {/* Promotional banner slot (Draft banner in the reference → BotolaGO overall rankings) */}
      <div className="px-4 pt-4">
        <Link
          to="/fantasy/rankings"
          className="relative block overflow-hidden rounded-[6px] bg-[color:var(--fpl-ink)] px-4 py-4 text-center text-white"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(60% 120% at 0% 50%, oklch(0.62 0.18 262) 0%, transparent 60%), radial-gradient(50% 120% at 100% 50%, oklch(0.86 0.11 205) 0%, transparent 60%)",
            }}
          />
          <span className="relative block text-[12px] font-bold uppercase tracking-[0.2em] text-[color:var(--fpl-cyan)]">
            BotolaGO Fantasy
          </span>
          <span className="relative block text-[28px] font-black leading-tight">
            {t("fpl.rankings")}
          </span>
          <span className="relative mt-1 inline-flex items-center gap-1 text-[14px] font-bold">
            {t("fpl.view_all")} <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
      </div>

      {/* News & Video — hidden at launch (NEWS_ENABLED). */}
      {NEWS_ENABLED && (
        <section className="pt-5">
          <div className="flex items-center justify-between px-4">
            <h2 className="text-[22px] font-extrabold text-[color:var(--fpl-ink-deep)]">
              {t("fpl.news_video")}
            </h2>
            <Link
              to="/news"
              className="inline-flex items-center gap-1 text-[14px] font-bold text-[color:var(--fpl-ink)]"
            >
              {t("fpl.view_all")} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-2 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
            {hubArticles.map((article) => (
              <Link
                key={article.id}
                to="/news/$articleId"
                params={{ articleId: article.id }}
                className="w-[190px] shrink-0 snap-start overflow-hidden rounded-[4px] bg-[color:var(--fpl-cyan)]/40"
              >
                {article.heroUrl ? (
                  <MediaImage
                    src={article.heroUrl}
                    alt={article.heroAlt ?? ""}
                    fallback={article.heroGradient}
                    className="aspect-[16/10] w-full"
                  />
                ) : null}
                <p className="line-clamp-3 px-2 py-2 text-[13px] font-bold leading-snug text-[color:var(--fpl-ink-deep)]">
                  {article.title[lang] ?? article.title.fr}
                </p>
              </Link>
            ))}
            {articles.isPending
              ? [0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="h-[170px] w-[190px] shrink-0 animate-pulse rounded-[4px] bg-white motion-reduce:animate-none"
                  />
                ))
              : null}
          </div>
        </section>
      )}

      {/* Leagues & Cups */}
      <LeaguesAndCups
        phase={screen.phase}
        hasTeam={!!team}
        gameweek={gameweek?.number ?? null}
        leagues={leagues.data ?? []}
        leaguesLoading={leagues.isPending && leagues.isEnabled}
      />

      {/* Notifications */}
      <NotificationsSection />

      {/* Follow BotolaGO */}
      <section className="px-4 pt-6">
        <h2 className="text-[22px] font-extrabold text-[color:var(--fpl-ink-deep)]">
          {t("fpl.follow")}
        </h2>
        {/* Three tiles with News, two without it — the row stays balanced
            instead of leaving a gap where the News tile was. */}
        <div className={cn("mt-3 grid gap-2", NEWS_ENABLED ? "grid-cols-3" : "grid-cols-2")}>
          {NEWS_ENABLED && (
            <FollowCard
              to="/news"
              label={t("nav.news")}
              icon={<Newspaper className="h-7 w-7" aria-hidden />}
            />
          )}
          <FollowCard
            to="/matches"
            label={t("nav.matches")}
            icon={<CalendarDays className="h-7 w-7" aria-hidden />}
          />
          <FollowCard
            to="/fantasy/rankings"
            label={t("fantasy.tab.rankings")}
            icon={<Trophy className="h-7 w-7" aria-hidden />}
          />
        </div>
      </section>

      {/* More about */}
      <section
        className="mt-6 px-4 py-6"
        style={{
          backgroundImage:
            "linear-gradient(180deg, oklch(0.84 0.11 205) 0%, oklch(0.68 0.16 238) 100%)",
        }}
      >
        <h2 className="text-[22px] font-extrabold text-[color:var(--fpl-ink-deep)]">
          {t("fpl.more_about")}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            to="/fantasy/rules"
            className="grid min-h-16 place-items-center rounded-[4px] bg-white/40 px-3 text-center text-[15px] font-extrabold text-[color:var(--fpl-ink-deep)]"
          >
            {t("fpl.rules")}
          </Link>
          <Link
            to="/fantasy/help"
            className="grid min-h-16 place-items-center rounded-[4px] bg-white/40 px-3 text-center text-[15px] font-extrabold text-[color:var(--fpl-ink-deep)]"
          >
            {t("fpl.help_rules")}
          </Link>
        </div>
      </section>

      <style>{`
        .fpl-team-card{display:flex;min-height:56px;align-items:center;justify-content:center;gap:.5rem;border-radius:6px;background:rgba(255,255,255,.55);padding:0 1rem;text-align:center;font-size:22px;font-weight:800;color:var(--fpl-ink-deep);backdrop-filter:blur(6px)}
      `}</style>
      {owned.mutationStatus === "error" ? null : null}
    </FantasyFrame>
  );
}

function HubButton({
  to,
  children,
  gradient,
  icon,
}: {
  to: string;
  children: ReactNode;
  gradient?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex min-h-[52px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-center text-[13px] font-extrabold leading-tight text-[color:var(--fpl-ink-deep)]",
        gradient ? "" : "bg-white shadow-sm",
      )}
      style={gradient ? { backgroundImage: "var(--fpl-grad)" } : undefined}
    >
      {icon}
      {children}
    </Link>
  );
}

function FollowCard({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 rounded-[4px] bg-white px-2 py-3 text-center shadow-sm"
    >
      <span
        className="grid h-16 w-16 place-items-center rounded-full text-[color:var(--fpl-ink-deep)]"
        style={{ backgroundImage: "var(--fpl-grad)" }}
      >
        {icon}
      </span>
      <span className="text-[13px] font-extrabold text-[color:var(--fpl-ink-deep)]">{label}</span>
    </Link>
  );
}

function LeaguesAndCups({
  phase,
  hasTeam,
  gameweek,
  leagues,
  leaguesLoading,
}: {
  phase: string;
  hasTeam: boolean;
  gameweek: number | null;
  leagues: Array<{ id: string; name: string; rank: number | null }>;
  leaguesLoading: boolean;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"leagues" | "cups">("leagues");
  const generalRows: Array<{ name: string; to: string; rank: number | null }> = [
    { name: t("fpl.overall"), to: "/fantasy/rankings", rank: null },
    ...(gameweek
      ? [
          {
            name: t("fpl.gameweek_league").replace("{n}", String(gameweek)),
            to: "/fantasy/rankings",
            rank: null,
          },
        ]
      : []),
  ];
  return (
    <section className="mx-4 mt-6 rounded-[6px] bg-white p-4 shadow-sm">
      <h2 className="text-[22px] font-extrabold text-[color:var(--fpl-ink-deep)]">
        {t("fpl.leagues_cups")}
      </h2>
      <FplSegmented
        className="mt-3"
        tone="onLight"
        value={tab}
        onChange={setTab}
        options={[
          { value: "leagues", label: t("fpl.leagues") },
          { value: "cups", label: t("fpl.cups") },
        ]}
      />
      {tab === "leagues" ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              to="/fantasy/leagues/join"
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[4px] bg-white px-2 text-[14px] font-extrabold text-[color:var(--fpl-ink-deep)] shadow-[0_1px_4px_rgba(0,0,0,0.15)]"
            >
              <Plus className="h-4 w-4" aria-hidden /> {t("fpl.join_leagues")}
            </Link>
            <Link
              to="/fantasy/leagues"
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[4px] bg-white px-2 text-[14px] font-extrabold text-[color:var(--fpl-ink-deep)] shadow-[0_1px_4px_rgba(0,0,0,0.15)]"
            >
              <Settings className="h-4 w-4" aria-hidden /> {t("fpl.configure_leagues")}
            </Link>
          </div>

          <div className="mt-4">
            <FplPill>{t("fpl.general_leagues")}</FplPill>
            <LeagueTable rows={generalRows} />
          </div>
          <div className="mt-4">
            <FplPill>{t("fpl.private_leagues")}</FplPill>
            {phase !== "ready" || !hasTeam ? (
              <p className="px-1 py-3 text-[13px] text-[color:var(--fpl-grey-text)]">
                {t("fpl.no_leagues")}
              </p>
            ) : leaguesLoading ? (
              <div className="my-3 h-10 animate-pulse rounded bg-[color:var(--fpl-grey)] motion-reduce:animate-none" />
            ) : leagues.length === 0 ? (
              <p className="px-1 py-3 text-[13px] text-[color:var(--fpl-grey-text)]">
                {t("fpl.no_leagues")}
              </p>
            ) : (
              <LeagueTable
                rows={leagues.map((l) => ({
                  name: l.name,
                  to: `/fantasy/leagues/${l.id}`,
                  rank: l.rank,
                }))}
              />
            )}
          </div>
        </>
      ) : (
        <div className="mt-4">
          <FplPill>{t("fpl.cups")}</FplPill>
          <p className="mt-3 text-[15px] text-foreground">{t("fpl.cup_not_qualified")}</p>
          <h3 className="mt-3 text-[20px] font-extrabold text-[color:var(--fpl-ink-deep)]">
            {t("fpl.cup_how_title")}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground">
            {t("fpl.cup_how_body")}
          </p>
        </div>
      )}
    </section>
  );
}

function LeagueTable({ rows }: { rows: Array<{ name: string; to: string; rank: number | null }> }) {
  const { t } = useI18n();
  return (
    <table className="mt-2 w-full text-[15px]">
      <thead>
        <tr className="text-start text-[12px] font-semibold text-[color:var(--fpl-grey-text)]">
          <th className="w-24 py-1 text-start font-semibold">{t("fpl.rank")}</th>
          <th className="py-1 text-start font-semibold">{t("fpl.league")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.to + row.name} className="border-t border-[color:var(--fpl-grey)]">
            <td className="py-3 text-[color:var(--fpl-grey-text)]">
              <span className="me-3">—</span>
              <span className="fpl-tabular">{row.rank ?? "-"}</span>
            </td>
            <td className="py-3">
              <Link to={row.to} className="font-bold text-foreground">
                {row.name}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NotificationsSection() {
  const { t } = useI18n();
  const { user, status, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const enabled = status === "authenticated" && !!user;
  const push = !!user?.notifications.fantasyDeadlines;

  const togglePush = async () => {
    if (!enabled || busy) return;
    setBusy(true);
    try {
      const result = await authService.completeProfile({
        notifications: { fantasyDeadlines: !push },
      });
      if (!result.ok) toast.error(t("state.error"));
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="px-4 pt-6">
      <h2 className="text-[22px] font-extrabold text-[color:var(--fpl-ink-deep)]">
        {t("fpl.notifications")}
      </h2>
      <p className="mt-1 text-[14px] text-foreground">{t("fpl.notifications_body")}</p>
      <div className="mt-3">
        <ToggleRow
          icon={<Bell className="h-5 w-5" aria-hidden />}
          label={t("fpl.push")}
          checked={push}
          disabled={!enabled || busy}
          onChange={togglePush}
        />
        <ToggleRow
          icon={<Mail className="h-5 w-5" aria-hidden />}
          label={t("fpl.emails")}
          checked={false}
          disabled
          onChange={() => {}}
          hint={t("fpl.coming_soon")}
        />
      </div>
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
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  hint?: string;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between border-b border-[color:var(--fpl-grey)] py-2">
      <span className="flex items-center gap-3 text-[15px] font-bold text-foreground">
        {icon}
        <span>
          {label}
          {hint ? (
            <span className="ms-2 text-[11px] font-semibold text-[color:var(--fpl-grey-text)]">
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
          "relative h-8 w-14 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-[oklch(0.72_0.19_150)]" : "bg-[color:var(--fpl-grey)]",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[inset-inline-start]",
            checked ? "start-7" : "start-1",
          )}
        />
      </button>
    </div>
  );
}
