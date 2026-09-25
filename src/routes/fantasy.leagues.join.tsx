import emptyLeaguesArt from "@/assets/illustrations/empty-leagues.webp";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiAlert,
  UiButton,
  UiCard,
  UiEmptyState,
  UiHeader,
  UiInput,
  UiLinkButton,
  UiSegmented,
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
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/leagues/join")({
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
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<{ id: string; name: string } | null>(null);
  const [scoring, setScoring] = useState<"classic" | "h2h">("classic");

  // Arriving from a Pronostics invite link (one league, two games): the code
  // this tab holds fills the field, so nobody has to retype it. Read after
  // mount: the server render has no tab storage.
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
    enabled: !!joined,
  });

  const joinPrivate = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setInvalid(false);
    try {
      await fantasyService.joinLeague(code.trim());
      clearPendingInvite();
      await qc.invalidateQueries({ queryKey: key("leagues", "private") });
      const leagues = await fantasyService.getLeagues("private");
      const league = leagues[leagues.length - 1];
      setJoined(league ? { id: league.id, name: league.name } : { id: "", name: code.trim() });
    } catch {
      setInvalid(true);
    } finally {
      setBusy(false);
    }
  };

  const joinPublic = async () => {
    if (busy) return;
    const target = (publicQ.data ?? []).find((l) => l.rank === null) ?? publicQ.data?.[0];
    if (!target) return;
    setBusy(true);
    try {
      await fantasyService.joinLeague(target.code ?? target.id);
      await qc.invalidateQueries({ queryKey: key("leagues", "public") });
      setJoined({ id: target.id, name: target.name });
    } catch {
      setInvalid(true);
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
          <h2 className={cn("mt-4", ui.display.section, ui.tone.default)}>
            {t("fpl.players_to_be_added")}
          </h2>

          <div className="mt-3">
            {membersQ.isPending ? (
              <div role="status" aria-label={t("state.loading")} className="space-y-2">
                <UiSkeleton className="h-12" />
                <UiSkeleton className="h-12" />
                <UiSkeleton className="h-12" />
              </div>
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
            setInvalid(false);
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
              {invalid ? null : (
                <>
                  <p className={cn("text-center", ui.text.bodyStrong, ui.tone.default)}>
                    {t("fpl.private_code_help")}
                  </p>
                  <p className={cn("mt-2 text-center", ui.text.secondary, ui.tone.muted)}>
                    {t("fpl.create_own_league")}
                  </p>
                </>
              )}
              {/* The code is a hex literal: read and typed left-to-right in both
                  languages, and never letter-spaced. */}
              <UiInput
                className="mt-6"
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("fpl.private_league_code")}
                aria-label={t("fpl.private_league_code")}
                error={invalid ? t("fpl.invalid_code") : undefined}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                fieldClassName={cn(
                  "text-center font-mono",
                  ui.text.tabular,
                  ui.radius.full,
                  "min-h-[var(--ui-row-min)]",
                  !invalid && "border-[color:var(--ui-rule-strong)]",
                )}
              />
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
              <p className={cn("mt-3 text-center", ui.text.secondary, ui.tone.muted)}>
                {t("fpl.classic_help")}
              </p>
              <UiSegmented
                className="mt-6"
                variant="pill"
                value={scoring}
                onChange={setScoring}
                label={t("fpl.classic")}
                options={[
                  { value: "classic", label: t("fpl.classic") },
                  { value: "h2h", label: t("fpl.head_to_head"), disabled: true },
                ]}
              />
              <p className={cn("mt-1.5 text-center", ui.text.micro, ui.tone.muted)}>
                {t("fpl.head_to_head_help")}
              </p>
              {invalid ? (
                <UiAlert tone="negative" className={cn("mt-3", ui.radius.card)}>
                  {t("state.error")}
                </UiAlert>
              ) : null}
              <UiButton
                className="mt-4"
                onClick={() => void joinPublic()}
                disabled={busy || publicQ.isPending || (publicQ.data ?? []).length === 0}
              >
                {busy ? t("fpl.saving") : t("fpl.join_a_league")}
              </UiButton>
              {(publicQ.data ?? []).length === 0 && !publicQ.isPending ? (
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
