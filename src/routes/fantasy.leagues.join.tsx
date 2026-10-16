import emptyLeaguesArt from "@/assets/illustrations/empty-leagues.webp";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import { LeagueReadNotice } from "@/components/fantasy/LeagueReadNotice";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiAlert,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiInput,
  UiLinkButton,
  UiSkeleton,
  UiTable,
  UiTabs,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import {
  clearPendingInvite,
  pendingInviteCode,
} from "@/components/predictions/leagues/invite-link";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { joinFailureKind, type JoinFailure } from "@/services/fantasy-join-errors";
import { joinPrivateLeague } from "@/services/fantasy-join-flow";
import { listReadView } from "@/services/fantasy-read-state";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/leagues/join")({
  head: () => fantasyHead("joinLeague"),
  component: JoinLeaguePage,
});

/**
 * "Join a League": the Private / Public tabs, code entry with its invalid
 * state, the public Classic / Head-to-Head toggle, and the members list shown
 * right after joining.
 *
 * Option A: the header carries the kicker and the title, the two modes are
 * underline tabs, the code field and the buttons are round, and Classic /
 * Head-to-Head — a choice between two values, not two pages — is the pill
 * toggle. The flow and every string are unchanged.
 */
function JoinLeaguePage() {
  return (
    <FantasyFrame bottomNav>
      <JoinLeagueBody />
    </FantasyFrame>
  );
}

function JoinLeagueBody() {
  const { t } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const screen = useFantasyScreen();
  const { key } = useFantasyDataSource();
  const [tab, setTab] = useState<"private" | "public">("private");
  const [code, setCode] = useState("");
  // Why the last join did not go through; only a refused code is "invalid" (UX-004).
  const [failure, setFailure] = useState<JoinFailure | null>(null);
  // The join succeeded but the league list behind it could not be refreshed.
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<{ id: string; name: string } | null>(null);

  // Arriving from an invite link (one league, two games): the code this device
  // holds fills the field, so nobody has to retype it. Joining is still the
  // manager's own tap. Read after mount: the server render has no storage.
  useEffect(() => {
    const pending = pendingInviteCode();
    if (pending) setCode((current) => current || pending);
  }, []);

  const publicQ = useQuery({
    queryKey: key("leagues", "public"),
    queryFn: () => fantasyService.getLeagues("public"),
    enabled: screen.phase === "ready" && tab === "public",
  });
  const membersQ = useQuery({
    queryKey: key("standings", joined?.id ?? ""),
    queryFn: () => fantasyService.getLeagueStandings(joined!.id),
    enabled: !!joined?.id,
  });
  const publicView = listReadView(publicQ);
  const failureText =
    failure === "network"
      ? t("fantasy.leagues.join_network")
      : failure === "unavailable"
        ? t("fantasy.leagues.join_unavailable")
        : t("fpl.invalid_code");

  const joinPrivate = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setFailure(null);
    setRefreshFailed(false);
    try {
      // The server's acceptance is final: a failed refresh after it is said as
      // a failed refresh, never as a refused code (see `joinPrivateLeague`).
      const result = await joinPrivateLeague(code.trim(), {
        join: (typed) => fantasyService.joinLeague(typed),
        invalidateLists: () => qc.invalidateQueries({ queryKey: key("leagues", "private") }),
        readLeagues: () => fantasyService.getLeagues("private"),
      });
      clearPendingInvite();
      if (result.refreshFailed) setRefreshFailed(true);
      if (!result.joined) toast.info(t("predictions.leagues.already_member"));
      setJoined(
        result.league
          ? { id: result.league.id, name: result.league.name }
          : { id: result.leagueId ?? "", name: code.trim() },
      );
    } catch (error) {
      // Refused until the one-time code is in: the invite code typed is not
      // wrong, so the field is not marked "Code invalide". The notice says
      // what is owed, once (the auth layer says it too, under the same toast
      // id), and the invite code stays in the field for when it is in.
      // Anything else says what it was: the server's refusal of the code, or
      // a connection or service failure, which is not the code's fault.
      if (isMfaStepUpError(error)) showStepUpNotice(t);
      else setFailure(joinFailureKind(error));
    } finally {
      setBusy(false);
    }
  };

  /** After a join whose follow-up read failed: read the league's name again. */
  const refreshJoined = async () => {
    try {
      const leagues = await fantasyService.getLeagues("private");
      const league = joined?.id ? leagues.find((item) => item.id === joined.id) : undefined;
      if (league) setJoined({ id: league.id, name: league.name });
      setRefreshFailed(false);
      await qc.invalidateQueries({ queryKey: key("leagues", "private") });
    } catch {
      // Still flagged: the notice stays, with its retry.
    }
  };

  const joinPublic = async () => {
    if (busy) return;
    const target = (publicQ.data ?? []).find((l) => l.rank === null) ?? publicQ.data?.[0];
    if (!target) return;
    setBusy(true);
    setFailure(null);
    try {
      await fantasyService.joinLeague(target.code ?? target.id);
      await qc.invalidateQueries({ queryKey: key("leagues", "public") });
      setJoined({ id: target.id, name: target.name });
    } catch (error) {
      // As for a private code: a code owed is the notice, not "Une erreur est
      // survenue" in the alert under the toggle.
      if (isMfaStepUpError(error)) showStepUpNotice(t);
      else setFailure(joinFailureKind(error));
    } finally {
      setBusy(false);
    }
  };

  if (joined) {
    const members = membersQ.data ?? [];
    return (
      <>
        <UiHeader kicker={t("fpl.leagues")} title={joined.name} onBack={() => setJoined(null)} />
        <div className={cn("px-4 pb-8 pt-4", ui.surface.page)}>
          <p className={cn("text-center", ui.text.meta, ui.tone.muted)}>
            {t("fpl.last_updated")}: {t("fantasy.stat.none")}
          </p>
          {/* UX-004: the join went through; only the read behind it failed. */}
          {refreshFailed ? (
            <LeagueReadNotice
              className="mt-4"
              message={t("fantasy.leagues.joined_refresh_failed")}
              onRetry={() => void refreshJoined()}
            />
          ) : null}
          <h2 className={cn("mt-4", ui.display.section, ui.tone.default)}>
            {t("fpl.players_to_be_added")}
          </h2>

          {/* UX-003: members that could not be read are not "no members". */}
          {joined.id && membersQ.isError && membersQ.data ? (
            <LeagueReadNotice
              className="mt-3"
              message={t("fantasy.leagues.stale")}
              onRetry={() => void membersQ.refetch()}
            />
          ) : null}
          <div className="mt-3">
            {joined.id && membersQ.isPending ? (
              <div role="status" aria-label={t("state.loading")} className="space-y-2">
                <UiSkeleton className="h-12" />
                <UiSkeleton className="h-12" />
                <UiSkeleton className="h-12" />
              </div>
            ) : joined.id && membersQ.isError && !membersQ.data ? (
              <UiErrorState
                body={t("fantasy.leagues.members_read_failed")}
                onRetry={() => void membersQ.refetch()}
              />
            ) : members.length === 0 ? (
              <UiEmptyState
                title={t("fantasy.leagues.no_members_title")}
                body={t("fantasy.leagues.no_members")}
              />
            ) : (
              <UiCard padding="none" className="overflow-hidden">
                <UiTable caption={t("fpl.players_to_be_added")}>
                  <UiTHead className="bg-transparent">
                    <UiTR>
                      <UiTH className="ps-4">{t("fpl.team")}</UiTH>
                      <UiTH className="pe-4">{t("fpl.manager")}</UiTH>
                    </UiTR>
                  </UiTHead>
                  <UiTBody>
                    {members.map((row, index) => (
                      <UiTR
                        key={row.managerId}
                        className={cn(index === members.length - 1 && "border-b-0")}
                      >
                        <UiTD strong dir="auto" className="py-3 ps-4">
                          {row.teamName}
                        </UiTD>
                        <UiTD dir="auto" className={cn("py-3 pe-4", ui.tone.muted)}>
                          {row.managerName || t("fantasy.stat.none")}
                        </UiTD>
                      </UiTR>
                    ))}
                  </UiTBody>
                </UiTable>
              </UiCard>
            )}
          </div>

          <UiButton
            variant="ink"
            className="mt-6"
            onClick={() =>
              void nav({
                to: joined.id ? "/fantasy/leagues/$leagueId" : "/fantasy/leagues",
                params: joined.id ? { leagueId: joined.id } : undefined,
              })
            }
          >
            {t("fpl.done")}
          </UiButton>
        </div>
      </>
    );
  }

  return (
    <>
      <UiHeader
        kicker={t("fpl.leagues")}
        title={t("fpl.join_a_league")}
        backTo="/fantasy/leagues"
        trailing={
          <UiLinkButton to="/fantasy/leagues" size="sm" variant="ghost">
            {t("fpl.done")}
          </UiLinkButton>
        }
      />

      <FantasyScreenGate state={screen} next="/fantasy/leagues/join">
        <UiTabs
          value={tab}
          onChange={(v) => {
            setTab(v);
            setFailure(null);
          }}
          label={t("fpl.join_a_league")}
          idBase="join"
          className="px-2"
          options={[
            { value: "private", label: t("fpl.private"), panelId: "join-panel-private" },
            { value: "public", label: t("fpl.public"), panelId: "join-panel-public" },
          ]}
        />
        <section
          key={tab}
          role="tabpanel"
          id={`join-panel-${tab}`}
          aria-labelledby={`join-tab-${tab}`}
          className={cn("px-4 pb-8 pt-6", ui.surface.page)}
        >
          {tab === "private" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void joinPrivate();
              }}
            >
              {failure === "invalid_code" ? null : (
                <p className={cn("text-center", ui.text.bodyStrong, ui.tone.default)}>
                  {t("fpl.private_code_help")}
                </p>
              )}
              {/* The code is a hex literal: read and typed left-to-right in both
                  languages, and never letter-spaced. */}
              <UiInput
                className="mt-4"
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("fpl.private_league_code")}
                aria-label={t("fpl.private_league_code")}
                error={failure === "invalid_code" ? t("fpl.invalid_code") : undefined}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                fieldClassName={cn(
                  "text-center font-mono",
                  ui.text.tabular,
                  ui.radius.full,
                  "min-h-[var(--ui-row-min)]",
                  failure !== "invalid_code" && "border-[color:var(--ui-rule-strong)]",
                )}
              />
              {/* UX-004: a dropped connection or an unavailable service is not a wrong code. */}
              {failure && failure !== "invalid_code" ? (
                <UiAlert tone="negative" className={cn("mt-3", ui.radius.card)}>
                  {failureText}
                </UiAlert>
              ) : null}
              <UiButton type="submit" className="mt-3" disabled={!code.trim() || busy}>
                {busy ? t("fpl.saving") : t("fpl.join_a_league")}
              </UiButton>
            </form>
          ) : (
            <div>
              <p className={cn("text-center", ui.text.body, ui.tone.default)}>
                {t("fpl.public_help")}
              </p>
              <p className={cn("mt-3 text-center", ui.text.body, ui.tone.default)}>
                {t("fpl.public_help2")}
              </p>
              {failure ? (
                <UiAlert tone="negative" className={cn("mt-3", ui.radius.card)}>
                  {failure === "invalid_code" ? t("state.error") : failureText}
                </UiAlert>
              ) : null}
              <UiButton
                className="mt-6"
                onClick={() => void joinPublic()}
                disabled={busy || publicQ.isPending || (publicQ.data ?? []).length === 0}
              >
                {busy ? t("fpl.saving") : t("fpl.join_a_league")}
              </UiButton>
              {/* UX-003: a list that could not be read is not "no public league". */}
              {publicView === "failed" || publicView === "stale" ? (
                <LeagueReadNotice
                  className="mt-3"
                  message={
                    publicView === "failed"
                      ? t("fantasy.leagues.public_read_failed")
                      : t("fantasy.leagues.stale")
                  }
                  onRetry={() => void publicQ.refetch()}
                />
              ) : null}
              {publicView === "empty" ? (
                <UiEmptyState
                  className="mt-3"
                  illustration={emptyLeaguesArt}
                  title={t("fantasy.leagues.empty_title")}
                  body={t("fpl.no_leagues")}
                />
              ) : null}
            </div>
          )}
        </section>
      </FantasyScreenGate>
    </>
  );
}
