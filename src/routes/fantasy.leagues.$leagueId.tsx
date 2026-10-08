import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import type { ResetInviteCodeDto } from "@/backend/predictions/contracts";
import { mapPredictionsError } from "@/backend/predictions/errors";
import { LeagueInviteCode } from "@/components/fantasy/LeagueInviteCode";
import { CupInfo } from "@/components/fantasy-lists/CupInfo";
import { InviteLinkShare } from "@/components/predictions/leagues/InviteLinkShare";
import { LeaguePredictionsStandings } from "@/components/predictions/leagues/LeaguePredictionsStandings";
import { roundQueryOptions } from "@/components/predictions/use-predictions-round";
import {
  compactMoveFormat,
  formatMove,
  rankFigure,
  STANDINGS_FIGURE_CELL,
  STANDINGS_NAME_CELL,
} from "@/components/fantasy-lists/standings";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { ReportNameMenu } from "@/components/report/ReportNameMenu";
import {
  isOthersLeague,
  isOwnStanding,
  standingReportTargets,
} from "@/components/report/report-targets";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiModal,
  UiPill,
  UiRankMovement,
  UiSkeleton,
  UiTable,
  UiTabs,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import { PRONOSTICS_PROMOTED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { useManagerCardLive } from "@/services/manager-card-status";
import { predictionsService } from "@/services/predictions";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import type { League } from "@/types/fantasy";

// The card's band, minis and compare link are their own chunks, requested only while the section is
// live and the league is a private one: with the switch off this page imports nothing of the
// Manager Card.
const LeagueCardBand = lazy(() =>
  import("@/components/manager-card/inline/LeagueCardBand").then((module) => ({
    default: module.LeagueCardBand,
  })),
);
const LeagueCompareLink = lazy(() =>
  import("@/components/manager-card/inline/LeagueCardBand").then((module) => ({
    default: module.LeagueCompareLink,
  })),
);
const LeagueRowMini = lazy(() =>
  import("@/components/manager-card/inline/LeagueRowMini").then((module) => ({
    default: module.LeagueRowMini,
  })),
);

export const Route = createFileRoute("/fantasy/leagues/$leagueId")({
  head: () => fantasyHead("league"),
  component: LeagueDetailPage,
});

/**
 * League detail: the league's name in the header, underline tabs (Ligue |
 * Coupe), the "last updated" line and the standings.
 *
 * The standings are the A-Rankings table: one card, a transparent head of
 * kicker labels, rank / team over manager / gameweek / total, and the quiet
 * ▲/▼ movement. Rank, gameweek and total are scanned one column at a time, so
 * they are tabular figures aligned to the inline-end edge, and the column
 * order mirrors with the document rather than by hand. The gameweek column
 * says "J.14" in both languages; it used to be an English "GW14".
 *
 * Under the standings of a private league (BG-0157): its owner can invite
 * ("Inviter des amis": a confirmation, then a new code and the share buttons),
 * a member reads who can, and "Quitter la ligue" asks first, naming the league.
 */
function LeagueDetailPage() {
  return (
    <FantasyFrame bottomNav>
      <LeagueDetailBody />
    </FantasyFrame>
  );
}

function LeagueDetailBody() {
  const { leagueId } = Route.useParams();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const screen = useFantasyScreen();
  const { key } = useFantasyDataSource();
  const cardLive = useManagerCardLive();
  const [tab, setTab] = useState<"league" | "predictions" | "cup">("league");
  // The journée the Pronostics tab ranks by default (BG-0146).
  const predictionsRound = useQuery({
    ...roundQueryOptions(null, lang),
    enabled: PRONOSTICS_PROMOTED && tab === "predictions",
  });
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmInvite, setConfirmInvite] = useState(false);
  // The new code, shown once with the share buttons: only its digest is kept.
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const navigate = useNavigate();
  // Focus after a confirmation closes: back to the control that opened it
  // (`UiModal` has no trigger to return to), and to the new code once it
  // arrives, so a screen-reader user hears it rather than the page's top.
  const inviteOpener = useRef<HTMLDivElement>(null);
  const leaveOpener = useRef<HTMLDivElement>(null);
  const shared = useRef<HTMLDivElement>(null);
  const refocus = (box: { current: HTMLElement | null }) => (event: Event) => {
    event.preventDefault();
    box.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  };
  useEffect(() => {
    if (inviteCode) shared.current?.focus();
  }, [inviteCode]);
  // The reader's own team, which gets no "Signaler" (see `isOwnStanding`).
  const ownTeamId = useFantasyOwned().snapshot?.teamId ?? null;

  const leagueQ = useQuery({
    queryKey: key("league", leagueId),
    queryFn: () => fantasyService.getLeague(leagueId),
    enabled: screen.phase === "ready",
  });
  const standingsQ = useQuery({
    queryKey: key("standings", leagueId),
    queryFn: () => fantasyService.getLeagueStandings(leagueId),
    refetchInterval: 60_000,
    enabled: screen.phase === "ready",
  });
  const gw = screen.gameweek?.number ?? null;
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  const invite = useMutation(
    leagueInviteMutation(leagueId, { t, queryClient: qc, onCode: setInviteCode }),
  );

  const leave = async () => {
    if (!leagueQ.data || busy) return;
    setBusy(true);
    try {
      await fantasyService.leaveLeague(leagueQ.data.id);
      await qc.invalidateQueries({ queryKey: key("leagues", "private") });
      toast.success(t("fantasy.leagues.left"));
      // To the leagues list, not `history.back()`: after joining, Back is the
      // join form, and from a shared link it is outside the app.
      void navigate({ to: "/fantasy/leagues", replace: true });
    } catch (error) {
      // Refused until the one-time code is in: said as such, once (the auth
      // layer says it too, under the same toast id), not "Une erreur est
      // survenue". The manager is still in the league until the code is in.
      if (isMfaStepUpError(error)) showStepUpNotice(t);
      else toast.error(t("state.error"));
    } finally {
      setBusy(false);
    }
  };

  // BG-0100: pinned to the competition calendar, never the viewer's. A
  // formatter without `timeZone` disagrees with every other time on the page.
  const updated = moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const movementLabels = {
    up: t("fantasy.rank.up"),
    down: t("fantasy.rank.down"),
    same: t("fantasy.rank.same"),
  };
  const rows = standingsQ.data ?? [];
  // The card's surfaces (plan M5): a private league's members, while the section is live. The
  // batch read behind them is for signed-in managers and leaves the rows as they are if it fails.
  const cardsOn = cardLive && leagueQ.data?.type === "private" && rows.length > 0;
  const teamIds = rows.map((row) => row.managerId);
  // A public league can be thousands strong: a five-digit rank takes the
  // small stat step, and a move of a thousand places or more is compact.
  const rankStep = rankFigure(Math.max(1, ...rows.map((row) => row.rank)));
  const compactNf = compactMoveFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  return (
    <>
      <UiHeader
        kicker={t("nav.fantasy")}
        title={leagueQ.data?.name ?? t("fpl.league")}
        backTo="/fantasy/leagues"
        trailing={
          leagueQ.data && isOthersLeague(leagueQ.data) ? (
            <ReportNameMenu
              placement="header"
              targets={[
                { kind: "league", name: leagueQ.data.name, id: `league:${leagueQ.data.id}` },
              ]}
            />
          ) : null
        }
      />
      <FantasyScreenGate state={screen} next={`/fantasy/leagues/${leagueId}`}>
        <UiTabs
          value={tab}
          onChange={setTab}
          label={t("fpl.league")}
          idBase="league"
          className="px-2"
          options={[
            { value: "league", label: t("fpl.league"), panelId: "league-panel-league" },
            // Pronostics (BG-0146): the league's other game. Shown once promoted.
            ...(PRONOSTICS_PROMOTED
              ? [
                  {
                    value: "predictions" as const,
                    label: t("predictions.league.tab"),
                    panelId: "league-panel-predictions",
                  },
                ]
              : []),
            { value: "cup", label: t("fpl.cups"), panelId: "league-panel-cup" },
          ]}
        />
        <section
          role="tabpanel"
          id={`league-panel-${tab}`}
          aria-labelledby={`league-tab-${tab}`}
          className={cn("px-4 pb-8 pt-4", ui.surface.page)}
        >
          {tab === "predictions" ? (
            <LeaguePredictionsStandings
              leagueId={leagueId}
              roundNumber={
                predictionsRound.data?.allowed
                  ? (predictionsRound.data.round?.number ?? null)
                  : null
              }
            />
          ) : tab === "league" ? (
            <>
              <p className={cn("text-center", ui.text.meta, ui.tone.muted)}>
                {t("fpl.last_updated")}:{" "}
                <strong className={cn(ui.tone.default, "[font-weight:var(--ui-weight-heavy)]")}>
                  {updated}
                </strong>
              </p>
              {cardsOn ? (
                // The newly rated friends, hung on a rail, and the way to « Les vôtres ».
                <Suspense fallback={null}>
                  <LeagueCardBand order={teamIds} ownTeamId={ownTeamId} />
                  <LeagueCompareLink leagueId={leagueId} />
                </Suspense>
              ) : null}

              <div className="mt-4">
                {standingsQ.isPending ? (
                  <div role="status" aria-label={t("state.loading")} className="space-y-2">
                    <UiSkeleton className="h-12" />
                    <UiSkeleton className="h-12" />
                    <UiSkeleton className="h-12" />
                    <UiSkeleton className="h-12" />
                  </div>
                ) : standingsQ.isError ? (
                  <UiErrorState onRetry={() => void standingsQ.refetch()} />
                ) : rows.length === 0 ? (
                  <UiEmptyState
                    title={t("fpl.no_data_yet")}
                    body={t("fantasy.leagues.no_standings")}
                  />
                ) : (
                  <UiCard padding="none" className="overflow-hidden">
                    {/* The figure columns size to their content and the name
                        column takes the rest without being able to widen the
                        table (see `standings.ts`), so a long team name wraps
                        in its own cell instead of pushing Total off-screen. */}
                    <UiTable caption={t("fantasy.leagues.standings")}>
                      <UiTHead className="bg-transparent">
                        <UiTR>
                          <UiTH className={cn("ps-4", STANDINGS_FIGURE_CELL)}>{t("fpl.pos")}</UiTH>
                          <UiTH className={STANDINGS_NAME_CELL}>{t("fpl.team")}</UiTH>
                          <UiTH numeric className={STANDINGS_FIGURE_CELL} title={t("fpl.gameweek")}>
                            {gw
                              ? `${t("fantasy.leagues.gw")}${nf.format(gw)}`
                              : t("fantasy.leagues.gw")}
                          </UiTH>
                          <UiTH numeric className={STANDINGS_FIGURE_CELL}>
                            {t("fpl.total")}
                          </UiTH>
                          <UiTH numeric className={cn("pe-4", STANDINGS_FIGURE_CELL)}>
                            <span aria-hidden>+/−</span>
                            <span className="sr-only">{t("fantasy.leagues.movement")}</span>
                          </UiTH>
                        </UiTR>
                      </UiTHead>
                      <UiTBody>
                        {rows.map((row, index) => (
                          <UiTR
                            key={row.managerId}
                            className={cn(index === rows.length - 1 && "border-b-0")}
                          >
                            <UiTD
                              className={cn(
                                "ps-4",
                                STANDINGS_FIGURE_CELL,
                                rankStep,
                                row.rank <= 3 ? ui.tone.default : ui.tone.muted,
                              )}
                            >
                              <bdi>{nf.format(row.rank)}</bdi>
                            </UiTD>
                            <UiTD className={cn("py-2.5", STANDINGS_NAME_CELL)}>
                              <div className="flex items-center gap-1">
                                {cardsOn ? (
                                  <Suspense
                                    fallback={
                                      <span aria-hidden className="me-1 h-7 w-7 shrink-0" />
                                    }
                                  >
                                    <LeagueRowMini teamId={row.managerId} teamIds={teamIds} />
                                  </Suspense>
                                ) : null}
                                <div className="min-w-0 flex-1">
                                  <span
                                    dir="auto"
                                    className={cn(
                                      "line-clamp-2 break-words",
                                      ui.text.secondary,
                                      "[font-weight:var(--ui-weight-strong)]",
                                      ui.tone.default,
                                    )}
                                  >
                                    {row.teamName}
                                  </span>
                                  {row.managerName && row.managerName !== row.teamName ? (
                                    <span
                                      dir="auto"
                                      className={cn("block truncate", ui.text.meta, ui.tone.muted)}
                                    >
                                      {row.managerName}
                                    </span>
                                  ) : null}
                                </div>
                                {isOwnStanding(row.managerId, ownTeamId) ? null : (
                                  <ReportNameMenu targets={standingReportTargets(row)} />
                                )}
                              </div>
                            </UiTD>
                            <UiTD numeric className={cn(STANDINGS_FIGURE_CELL, ui.tone.muted)}>
                              {nf.format(row.gameweekScore)}
                            </UiTD>
                            <UiTD
                              numeric
                              strong
                              className={cn(STANDINGS_FIGURE_CELL, ui.stat.md, ui.tone.default)}
                            >
                              {nf.format(row.totalScore)}
                            </UiTD>
                            <UiTD numeric className={cn("pe-4", STANDINGS_FIGURE_CELL)}>
                              <UiRankMovement
                                variant="quiet"
                                rank={row.rank}
                                previousRank={row.previousRank}
                                labels={movementLabels}
                                formatDelta={(places) => formatMove(places, nf, compactNf)}
                              />
                            </UiTD>
                          </UiTR>
                        ))}
                      </UiTBody>
                    </UiTable>
                  </UiCard>
                )}
              </div>

              {leagueQ.data?.type === "private" ? (
                <>
                  {isLeagueOwner(leagueQ.data) ? (
                    <div className="mt-6 flex flex-col gap-3" data-testid="fantasy-league-invite">
                      <div ref={inviteOpener} className="contents">
                        <UiButton
                          variant="ink"
                          onClick={() => setConfirmInvite(true)}
                          disabled={invite.isPending}
                        >
                          <UserPlus className="h-4 w-4" aria-hidden />
                          {t("fantasy.leagues.invite_friends")}
                        </UiButton>
                      </div>
                      {inviteCode ? (
                        // The code grouped in fours, as on the leagues page,
                        // then the share buttons; focused when it arrives.
                        <div
                          ref={shared}
                          tabIndex={-1}
                          role="group"
                          aria-label={t("fpl.invite_code")}
                          className={cn("flex flex-col gap-3", ui.radius.card, ui.focus)}
                        >
                          {/* In a card like the share buttons under it; the
                              code is shown this once, and says so. */}
                          <UiCard padding="md">
                            <LeagueInviteCode code={inviteCode} once className="mt-0" />
                          </UiCard>
                          <InviteLinkShare
                            game="fantasy"
                            league={leagueQ.data.name}
                            code={inviteCode}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p
                      className={cn("mt-6 text-center", ui.text.meta, ui.tone.muted)}
                      data-testid="fantasy-league-invite-owner-only"
                    >
                      {t("fantasy.leagues.invite_owner_only")}
                    </p>
                  )}
                  {/* The owner cannot leave (api.leave_fantasy_league refuses
                      the owner), so only members are offered it, as on the
                      Pronostics league page. */}
                  {isLeagueOwner(leagueQ.data) ? null : (
                    <div ref={leaveOpener} className="contents">
                      <UiButton
                        variant="outline"
                        className={cn("mt-6 border-[color:var(--ui-rule-strong)]", ui.tone.default)}
                        onClick={() => setConfirmLeave(true)}
                        disabled={busy}
                        data-testid="fantasy-league-leave"
                      >
                        {t("fpl.leave_league")}
                      </UiButton>
                    </div>
                  )}
                  <UiModal
                    open={confirmInvite}
                    onOpenChange={setConfirmInvite}
                    onCloseAutoFocus={refocus(inviteOpener)}
                    title={t("fantasy.leagues.invite_friends")}
                    description={t("fantasy.leagues.invite_confirm")}
                    footer={
                      <>
                        <UiButton
                          variant="ink"
                          onClick={() => {
                            setConfirmInvite(false);
                            invite.mutate();
                          }}
                        >
                          {t("common.confirm")}
                        </UiButton>
                        <UiButton variant="ghost" size="sm" onClick={() => setConfirmInvite(false)}>
                          {t("common.cancel")}
                        </UiButton>
                      </>
                    }
                  />
                  <UiModal
                    open={confirmLeave}
                    onOpenChange={setConfirmLeave}
                    onCloseAutoFocus={refocus(leaveOpener)}
                    title={withLeagueName(t("fantasy.leagues.leave_title"), leagueQ.data.name)}
                    description={t("fantasy.leagues.leave_body")}
                    footer={
                      <>
                        <UiButton
                          variant="destructive"
                          onClick={() => {
                            setConfirmLeave(false);
                            void leave();
                          }}
                        >
                          {t("fpl.leave_league")}
                        </UiButton>
                        <UiButton variant="ghost" size="sm" onClick={() => setConfirmLeave(false)}>
                          {t("common.cancel")}
                        </UiButton>
                      </>
                    }
                  />
                </>
              ) : null}
            </>
          ) : (
            <CupInfo
              lead={
                <UiPill>{t("fpl.cup_not_started").replace("{n}", String((gw ?? 1) + 1))}</UiPill>
              }
            />
          )}
        </section>
      </FantasyScreenGate>
    </>
  );
}

/* eslint-disable react-refresh/only-export-components --
   The two pure pieces below are exported so that
   `fantasy-league-invite.test.tsx` runs the real invite (over a stubbed
   service) and the real owner rule instead of grepping this file for them.
   Nothing but the test imports them, so Fast Refresh has nothing to lose. */

/**
 * "Inviter des amis", once confirmed: a new invite code for the league.
 *
 * One league serves both games, and the call that issues a new code is the
 * Pronostics one (`api.reset_prediction_league_invite_code`): the database
 * checks that the caller owns the league, and the old code stops working. On
 * success the code goes to `onCode`, to be shown once with the share buttons
 * (only its digest is kept). A refusal for want of the one-time code is the
 * auth layer's notice, once; anything else (Pronostics closed to this
 * account, not the owner, no network) is said in plain words, never silently.
 */
export function leagueInviteMutation(
  leagueId: string,
  deps: {
    t: (key: TranslationKey) => string;
    queryClient: QueryClient;
    onCode: (code: string) => void;
  },
) {
  const { t, queryClient, onCode } = deps;
  return {
    mutationFn: () => predictionsService.resetInviteCode(leagueId),
    onSuccess: (result: ResetInviteCodeDto) => {
      onCode(result.inviteCode);
      // The Pronostics page's "code ending in …" hint for this league.
      void queryClient.invalidateQueries({ queryKey: ["predictions", "league", leagueId] });
    },
    onError: (failure: unknown) => {
      if (mapPredictionsError(failure).code === "mfa_required") showStepUpNotice(t);
      else toast.error(t("fantasy.leagues.invite_failed"));
    },
  };
}

/**
 * Only the league's owner can issue a new invite code (the database checks
 * `owner_user_id`). The server calls that role "owner"; the local mock store
 * calls the manager who made a league its "creator". An admin is not an owner.
 */
export function isLeagueOwner(league: Pick<League, "role"> | undefined): boolean {
  return league?.role === "owner" || league?.role === "creator";
}

/* eslint-enable react-refresh/only-export-components */

/**
 * A sentence that names the league, with the name isolated (`<bdi>`): a
 * French name in an Arabic sentence keeps its own direction and the quotes
 * and question mark stay where the sentence puts them.
 */
function withLeagueName(template: string, name: string): ReactNode {
  const [before, after = ""] = template.split("{league}");
  return (
    <>
      {before}
      <bdi>{name}</bdi>
      {after}
    </>
  );
}
