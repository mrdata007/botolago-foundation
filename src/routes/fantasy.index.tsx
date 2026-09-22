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
import { FantasyBrand } from "@/components/brand/FantasyBrand";
import { MediaImage } from "@/components/common/FailureAwareImage";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyPhaseBody } from "@/components/fpl/FantasyScreenGate";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiCard,
  UiPill,
  UiSegmented,
  UiSkeleton,
  UiTable,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
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
 *
 * Converted to the UI kit (BG-0092). The hub carried the largest single
 * cluster of the section's debt: 33 `--fpl-*` references, a `<style>` block
 * with a hand-written `rgba()` team card, three translucent `bg-white/NN`
 * panels that left themed copy on a permanently white pane, a literal
 * `linear-gradient(180deg, …)` that mirrors the wrong way under `dir="rtl"`,
 * and `--fpl-ink-deep` used as a text colour on nine headings. The layout,
 * the data flow and every query are unchanged — only the presentation is.
 *
 * The pills and the Leagues/Cups tabs now come straight from the kit rather
 * than through `components/fpl/primitives`. `FplPill` on its default tone was
 * `UiPill`, and `FplSegmented tone="onLight"` was `UiSegmented
 * tone="onSurface"` — the adapter's whole contribution was renaming the tone.
 * It is a migration seam for screens not yet converted, and this one is.
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
        // Pinned to the competition calendar, not the viewer's browser: the
        // deadline is 2026-09-24T18:30Z and must read 19:30 Casablanca for
        // everyone (BG-0100).
        timeZone: MATCH_TIME_ZONE,
      }).format(new Date(gameweek.deadline))
    : null;

  const teamCardClass = cn(
    "flex min-h-[var(--ui-row-min)] items-center justify-center gap-2 px-4 text-center",
    ui.radius.control,
    ui.surface.card,
    ui.text.subtitle,
    ui.tone.ink,
    ui.focus,
  );

  const teamCard = (() => {
    if (screen.phase === "loading") {
      return <UiSkeleton className="h-14" />;
    }
    if (authStatus !== "authenticated" || source === "guest") {
      return (
        <Link to="/auth/login" search={{ next: "/fantasy" }} className={teamCardClass}>
          {t("auth.prompt.login")} <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
        </Link>
      );
    }
    if (team) {
      return (
        <Link to="/fantasy/profile" className={teamCardClass}>
          <span className="truncate">{team.teamName}</span>
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
        </Link>
      );
    }
    return (
      <Link to="/fantasy/create" className={teamCardClass}>
        {t("fpl.create_team")} <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
      </Link>
    );
  })();

  return (
    <FantasyFrame bottomNav>
      {/* Hero */}
      <section
        className={cn(
          "relative overflow-hidden pb-4 pt-[max(env(safe-area-inset-top),1rem)]",
          ui.space.gutter,
          ui.tone.onGradHeader,
        )}
        style={{ backgroundImage: "var(--ui-grad-hero)" }}
      >
        <h1 className="pt-6">
          <FantasyBrand endorser="mobile" />
        </h1>
        <div className="mt-4">{teamCard}</div>

        <UiCard className="mt-3 text-center" padding="md">
          {screen.phase === "ready" || screen.phase === "guest" || screen.phase === "no_team" ? (
            <>
              {gameweek ? (
                // The deadline is the one thing on this card with a clock on
                // it, so it is the figure; gameweek and "deadline" are its
                // caption. It used to be a pill over a line of body text.
                <p className="flex flex-col items-center gap-1">
                  <span className={cn(ui.text.label, ui.tone.muted)}>
                    {`${t("fpl.gameweek")} ${gameweek.number} · ${t("fpl.deadline")}`}
                  </span>
                  <span className={cn(ui.text.title, ui.tone.ink)}>{deadlineText}</span>
                </p>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <HubButton
                  to="/fantasy/team"
                  gradient
                  icon={<Shirt className="h-4 w-4 shrink-0" aria-hidden />}
                >
                  {t("fpl.pick_team")}
                </HubButton>
                <HubButton
                  to="/fantasy/transfers"
                  gradient
                  icon={<ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden />}
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
        </UiCard>
      </section>

      {/* Promotional banner slot (Draft banner in the reference → BotolaGO overall rankings) */}
      <div className={cn("pt-4", ui.space.gutter)}>
        <Link
          to="/fantasy/rankings"
          className={cn(
            "relative block overflow-hidden px-4 py-4 text-center",
            ui.radius.control,
            ui.surface.ink,
            ui.focus,
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              // Centred radial origins, so the highlight does not land on the
              // opposite edge under `dir="rtl"`.
              background:
                "radial-gradient(70% 140% at 50% 0%, var(--ui-accent-sky) 0%, transparent 62%), radial-gradient(80% 140% at 50% 100%, var(--ui-ink-deep) 0%, transparent 68%)",
            }}
          />
          {/* Prose, not a figure — the stat ramp is numerals only. */}
          <span className={cn("relative block", ui.text.hero, ui.tone.onInkPlain)}>
            {t("fpl.rankings")}
          </span>
          <span
            className={cn(
              "relative mt-1 inline-flex items-center gap-1",
              ui.text.secondary,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.tone.onInkPlain,
            )}
          >
            {t("fpl.view_all")} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </span>
        </Link>
      </div>

      {/* News & Video — hidden at launch (NEWS_ENABLED). */}
      {NEWS_ENABLED && (
        <section className="pt-5">
          <div className={cn("flex items-center justify-between gap-2", ui.space.gutter)}>
            <h2 className={cn("min-w-0 truncate", ui.text.section, ui.tone.default)}>
              {t("fpl.news_video")}
            </h2>
            <Link
              to="/news"
              className={cn(
                "inline-flex shrink-0 items-center gap-1",
                ui.text.secondary,
                "[font-weight:var(--ui-weight-heavy)]",
                ui.tone.ink,
                ui.focus,
                ui.radius.control,
              )}
            >
              {t("fpl.view_all")} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          </div>
          <div
            className={cn(
              "mt-2 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none]",
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
                  ui.radius.tight,
                  ui.surface.sunken,
                  ui.focus,
                )}
              >
                {article.heroUrl ? (
                  <MediaImage
                    src={article.heroUrl}
                    alt={article.heroAlt ?? ""}
                    fallback={article.heroGradient}
                    className="aspect-[16/10] w-full"
                  />
                ) : null}
                <p
                  className={cn(
                    // No `leading-*` literal beside the ramp step: the step
                    // carries its own leading, per script (BG-0124). This one
                    // was `leading-snug` and never applied — `ui.text.meta`
                    // sets the same property after it — so it was a second
                    // source of truth that happened to be losing.
                    "line-clamp-3 px-2 py-2",
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
                  <UiSkeleton key={index} className="h-[170px] w-[190px] shrink-0" />
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
      <section className={cn("pt-6", ui.space.gutter)}>
        <h2 className={cn(ui.text.section, ui.tone.default)}>{t("fpl.follow")}</h2>
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
        className={cn("mt-6 py-6", ui.space.gutter, ui.tone.onGradHeader)}
        // `to bottom`, not `180deg`: a degree angle lands on the opposite
        // edge under `dir="rtl"`.
        style={{ backgroundImage: "var(--ui-grad-header)" }}
      >
        <h2 className={ui.text.section}>{t("fpl.more_about")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MoreAboutLink to="/fantasy/rules">{t("fpl.rules")}</MoreAboutLink>
          <MoreAboutLink to="/fantasy/help">{t("fpl.help_rules")}</MoreAboutLink>
        </div>
      </section>

      {owned.mutationStatus === "error" ? null : null}
    </FantasyFrame>
  );
}

function MoreAboutLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        // `min-h-16` (64px) stays a literal deliberately. It is not a control
        // height — it clears `--ui-row-min` with 16px to spare — it is the
        // height of a two-up tile, and the ramp has no step for that. Rule 5
        // exists to stop a control being sized under the tap floor by a
        // literal; shrinking this to `--ui-row-min` to satisfy the letter of
        // it would make the tile smaller for no reason.
        "grid min-h-16 place-items-center px-3 text-center",
        ui.radius.control,
        ui.surface.card,
        ui.text.bodyStrong,
        ui.tone.ink,
        ui.focus,
      )}
    >
      {children}
    </Link>
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
        // `leading-tight` dropped: the ramp step below sets the line box, per
        // script (BG-0124), and this button's label truncates — the one place
        // a too-flat leading cuts glyph ink instead of just looking tight.
        "inline-flex min-h-[var(--ui-row-min)] items-center justify-center gap-1.5 px-2 py-1 text-center",
        "[&_svg]:shrink-0",
        ui.radius.control,
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        ui.focus,
        gradient
          ? "text-[color:var(--ui-ink-deep)]"
          : // Flat on the card rather than raised cards on a card.
            cn(ui.surface.sunken, ui.tone.ink),
      )}
      style={gradient ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
    >
      {icon}
      {/* Two lines, not an ellipsis: at 390px French labels such as
          "Statistiques joueurs" lost their second word to `truncate`. */}
      <span className="min-w-0 line-clamp-2 text-balance">{children}</span>
    </Link>
  );
}

function FollowCard({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex flex-col items-center gap-2 px-2 py-3 text-center",
        ui.radius.control,
        ui.surface.card,
        ui.focus,
      )}
    >
      <span
        className={cn(
          "grid h-16 w-16 shrink-0 place-items-center",
          ui.radius.full,
          "text-[color:var(--ui-ink-deep)]",
        )}
        style={{ backgroundImage: "var(--ui-grad-action)" }}
      >
        {icon}
      </span>
      <span
        className={cn(
          "min-w-0 truncate",
          ui.text.meta,
          ui.tone.default,
          "[font-weight:var(--ui-weight-heavy)]",
        )}
      >
        {label}
      </span>
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
    <UiCard as="section" className="mx-4 mt-6" padding="md">
      <h2 className={cn(ui.text.section, ui.tone.default)}>{t("fpl.leagues_cups")}</h2>
      <UiSegmented
        className="mt-3"
        tone="onSurface"
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
            <LeagueAction
              to="/fantasy/leagues/join"
              icon={<Plus className="h-4 w-4" aria-hidden />}
            >
              {t("fpl.join_leagues")}
            </LeagueAction>
            <LeagueAction to="/fantasy/leagues" icon={<Settings className="h-4 w-4" aria-hidden />}>
              {t("fpl.configure_leagues")}
            </LeagueAction>
          </div>

          <div className="mt-4">
            <UiPill>{t("fpl.general_leagues")}</UiPill>
            <LeagueTable rows={generalRows} caption={t("fpl.general_leagues")} />
          </div>
          <div className="mt-4">
            <UiPill>{t("fpl.private_leagues")}</UiPill>
            {phase !== "ready" || !hasTeam ? (
              <p className={cn("px-1 py-3", ui.text.meta, ui.tone.muted)}>{t("fpl.no_leagues")}</p>
            ) : leaguesLoading ? (
              <UiSkeleton className="my-3 h-10" />
            ) : leagues.length === 0 ? (
              <p className={cn("px-1 py-3", ui.text.meta, ui.tone.muted)}>{t("fpl.no_leagues")}</p>
            ) : (
              <LeagueTable
                caption={t("fpl.private_leagues")}
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
          <UiPill>{t("fpl.cups")}</UiPill>
          <p className={cn("mt-3", ui.text.body, ui.tone.default)}>{t("fpl.cup_not_qualified")}</p>
          <h3 className={cn("mt-3", ui.text.section, ui.tone.default)}>{t("fpl.cup_how_title")}</h3>
          {/* `leading-relaxed` dropped for the same reason as the other two on
              this screen: `ui.text.secondary` already sets the line box and
              sets it per script, and a Tailwind literal beside it is a second
              source of truth that wins or loses on class order (BG-0124). */}
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{t("fpl.cup_how_body")}</p>
        </div>
      )}
    </UiCard>
  );
}

function LeagueAction({
  to,
  icon,
  children,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex min-h-[var(--ui-tap-min)] items-center justify-center gap-1 px-2 py-1",
        // An SVG is a flex item and shrinks like any other, so a long label
        // beside it takes the width out of the icon instead of wrapping.
        // Measured here: a `lucide-plus` sized `h-4 w-4` rendering 14.0 × 16.0,
        // the only distorted glyph in the product across six routes. Lucide
        // draws square, so a squeezed one reads as a drawing mistake.
        "[&_svg]:shrink-0",
        ui.radius.control,
        ui.surface.sunken,
        ui.text.secondary,
        "[font-weight:var(--ui-weight-heavy)]",
        ui.tone.ink,
        ui.focus,
      )}
    >
      {icon}
      <span className="min-w-0 line-clamp-2 text-balance text-center">{children}</span>
    </Link>
  );
}

function LeagueTable({
  rows,
  caption,
}: {
  rows: Array<{ name: string; to: string; rank: number | null }>;
  caption: string;
}) {
  const { t } = useI18n();
  return (
    <UiTable caption={caption} className="mt-2">
      <UiTHead>
        <UiTR>
          <UiTH numeric className="w-24">
            {t("fpl.rank")}
          </UiTH>
          <UiTH>{t("fpl.league")}</UiTH>
        </UiTR>
      </UiTHead>
      <UiTBody>
        {rows.map((row) => (
          <UiTR key={row.to + row.name}>
            <UiTD numeric>{row.rank ?? "-"}</UiTD>
            <UiTD>
              {/* The row link is the tap target for the whole row, so it
                  carries the 44px floor itself: as a bare inline `<a>` it
                  measured 21px tall in French and 32px in Arabic. */}
              <Link
                to={row.to}
                className={cn(
                  "inline-flex min-h-[var(--ui-tap-min)] w-full items-center",
                  ui.text.body,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.tone.default,
                  ui.focus,
                  ui.radius.control,
                )}
              >
                {row.name}
              </Link>
            </UiTD>
          </UiTR>
        ))}
      </UiTBody>
    </UiTable>
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
    <section className={cn("pt-6", ui.space.gutter)}>
      <h2 className={cn(ui.text.section, ui.tone.default)}>{t("fpl.notifications")}</h2>
      <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("fpl.notifications_body")}</p>
      <div className="mt-3">
        <ToggleRow
          icon={<Bell className="h-5 w-5 shrink-0" aria-hidden />}
          label={t("fpl.push")}
          checked={push}
          disabled={!enabled || busy}
          onChange={togglePush}
        />
        <ToggleRow
          icon={<Mail className="h-5 w-5 shrink-0" aria-hidden />}
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
    <div
      className={cn(
        "flex min-h-[var(--ui-row-min)] items-center justify-between gap-3 py-2",
        ui.rule.block,
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-center gap-3",
          ui.text.body,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.tone.default,
        )}
      >
        {icon}
        <span className="min-w-0">
          {label}
          {hint ? <span className={cn("ms-2", ui.text.micro, ui.tone.muted)}>{hint}</span> : null}
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
              checked ? "start-7" : "start-1",
            )}
            style={{ backgroundColor: "var(--ui-surface)" }}
          />
        </span>
      </button>
    </div>
  );
}
