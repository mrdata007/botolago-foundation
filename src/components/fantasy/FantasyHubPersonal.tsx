import emptyLeaguesArt from "@/assets/illustrations/empty-leagues.webp";
import { Link } from "@tanstack/react-router";
import { ArrowDownUp, Bell, ChevronRight, Mail, Plus, Settings2, Shirt } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { SectionGroupHeader, SectionHeader } from "@/components/common/SectionHeader";
import { LeagueList } from "@/components/fantasy-lists/LeagueList";
import { FantasyPhaseBody } from "@/components/fpl/FantasyScreenGate";
import type { FantasyScreenPhase } from "@/components/fpl/useFantasyScreen";
import { ui, UiCard, UiLinkButton, UiLivePill, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth";
import { useMyNotificationPreferences } from "@/services/use-notification-preferences";
import type { FantasySummary, Gameweek } from "@/types/domain";
import type { FantasyTeam } from "@/types/fantasy";
import { FantasyGuestIntro } from "./FantasyGuestIntro";
import { joinTarget, type FantasyHubLayout } from "./fantasy-hub-layout";

/**
 * The Fantasy hub's personal parts — the team card's place, "Mes ligues"
 * (with the cup) and the reminder switches — each rendered from
 * `fantasyHubLayout` (audit 2026-09-25, A16). The hub (`fantasy.index.tsx`)
 * places them between its public parts: the gameweek band, the shortcuts,
 * the News rail and the "more about" links.
 *
 * They live apart from the route so that what each visitor is shown can be
 * rendered in a test for every audience, rather than read off the source —
 * exported from the route file instead, they would leave its code-split
 * chunk for the bundle every page loads.
 * The owner's pieces below (`TeamCard`, `TransfersRow`, `LeaguesSection`,
 * `NotificationsSection`) moved here from the route unchanged, but for the
 * branch of `LeaguesSection` that only a screen other than an owner's could
 * reach.
 */

/**
 * The team card's place:
 *   - skeletons while the session or the screen resolves;
 *   - the screen's own panel for a closed season, a gameweek not yet
 *     playable or a failed request;
 *   - the first-time proposition for a visitor without a team;
 *   - the owner's card, "Composer l'équipe" and the transfers row.
 */
export function FantasyHubTeamArea({
  layout,
  phase,
  retry,
  gameweek,
  team,
  displayName,
  summary,
  summaryPending,
  prizes,
}: {
  layout: FantasyHubLayout;
  phase: FantasyScreenPhase;
  retry: () => void;
  gameweek: Gameweek | null;
  team: FantasyTeam | null;
  /** The signed-in account's own name, which the card prefers to the team's. */
  displayName: string | null;
  summary: FantasySummary | null;
  summaryPending: boolean;
  /** The prize catalog lists at least one prize, so the proposition may say so. */
  prizes: boolean;
}) {
  const { t } = useI18n();
  if (phase === "loading" || layout.audience === "pending") {
    return (
      <div role="status" aria-label={t("state.loading")} className="space-y-3">
        <UiSkeleton className={cn("h-44", ui.radius.sheet)} />
        <UiSkeleton className={cn("h-12", ui.radius.full)} />
      </div>
    );
  }
  if (phase !== "ready") {
    return <FantasyPhaseBody phase={phase} next="/fantasy" retry={retry} className="" />;
  }
  // A ready screen without a team is always one of the two intro
  // audiences; `!team` is here for the type below.
  if (layout.intro || !team) {
    // Which gameweek a new team joins: after the current deadline it is the
    // next one, and with none to join (`enrolment === null`) the create
    // button would only lead to a refusal, so the proposition says
    // registration is closed instead. Mock mode carries no enrolment and
    // keeps the button.
    return (
      <FantasyGuestIntro
        audience={layout.intro ?? "no_team"}
        joinBy={joinTarget(gameweek)}
        registrationClosed={gameweek?.enrolment === null}
        prizes={prizes}
      />
    );
  }
  const manager = displayName?.trim() || summary?.managerName || team.managerName;
  return (
    <>
      <TeamCard
        teamName={team.teamName}
        manager={manager && manager !== team.teamName ? manager : null}
        gameweek={gameweek}
        points={summary?.gameweekPoints ?? null}
        total={summary?.totalPoints ?? null}
        overallRank={summary?.overallRank ?? null}
        pending={summaryPending}
      />
      <UiLinkButton to="/fantasy/team" variant="gradient" className="mt-3.5">
        <Shirt className="h-5 w-5" aria-hidden />
        {t("fpl.pick_team")}
      </UiLinkButton>
      <TransfersRow freeTransfers={team.freeTransfers} bank={team.bank} />
    </>
  );
}

/** "Mes ligues" and the cup: an owner's, held while that is still unknown. */
export function FantasyHubLeagues({
  layout,
  gameweek,
  overallRank,
  leagues,
  leaguesLoading,
}: {
  layout: FantasyHubLayout;
  gameweek: number | null;
  overallRank: number | null;
  leagues: Array<{ id: string; name: string; rank: number | null; members: number }>;
  leaguesLoading: boolean;
}) {
  if (layout.dashboard === "reserve") return <DashboardPlaceholder section="leagues" />;
  if (layout.dashboard !== "show") return null;
  return (
    <LeaguesSection
      gameweek={gameweek}
      overallRank={overallRank}
      leagues={leagues}
      leaguesLoading={leaguesLoading}
    />
  );
}

/**
 * The Fantasy reminder and e-mail switches. Signed out, both used to be
 * drawn disabled with no reason given; without a team there is no deadline
 * of theirs to be reminded of.
 */
export function FantasyHubReminders({ layout }: { layout: FantasyHubLayout }) {
  if (layout.dashboard === "reserve") return <DashboardPlaceholder section="reminders" />;
  if (layout.dashboard !== "show") return null;
  return <NotificationsSection />;
}

/**
 * A dashboard section's place while it is not yet known whether it applies
 * (`dashboard: "reserve"`), at its proportions: for "Mes ligues" the heading,
 * the two general leagues, the private ones, the two buttons and the cup
 * card; for the reminders the heading, its line and the two switches. No
 * heading and no copy — nothing in it can be untrue for a visitor who turns
 * out to have no team — and nothing announced: the team card's skeleton
 * already says the screen is loading.
 */
function DashboardPlaceholder({ section }: { section: "leagues" | "reminders" }) {
  return (
    <div
      aria-hidden
      data-testid={`fantasy-hub-${section}-placeholder`}
      className={cn("mt-6", ui.space.gutter)}
    >
      <UiSkeleton className="mb-3 h-6 w-36" />
      {section === "leagues" ? (
        <>
          <UiSkeleton className={cn("h-36", ui.radius.card)} />
          <UiSkeleton className={cn("mt-4 h-24", ui.radius.card)} />
          <UiSkeleton className={cn("mt-3 h-11", ui.radius.full)} />
          <UiSkeleton className={cn("mt-5 h-48", ui.radius.card)} />
        </>
      ) : (
        <>
          <UiSkeleton className="h-4 w-full" />
          <UiSkeleton className="mt-2 h-4 w-3/5" />
          <UiSkeleton className={cn("mt-2.5 h-28", ui.radius.card)} />
        </>
      )}
    </div>
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
/* Leagues                                                              */
/* ------------------------------------------------------------------ */

/**
 * Rendered for an owner's ready screen only (`FantasyHubLeagues`), so the
 * private leagues are always this manager's own query; the old "not ready,
 * or no team: no private leagues" branch has nothing left to catch.
 */
function LeaguesSection({
  gameweek,
  overallRank,
  leagues,
  leaguesLoading,
}: {
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
      {leaguesLoading ? (
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
