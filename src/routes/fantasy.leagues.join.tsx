import emptyLeaguesArt from "@/assets/illustrations/empty-leagues.webp";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiAlert,
  UiButton,
  UiEmptyState,
  UiHeader,
  UiInput,
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
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/leagues/join")({
  component: JoinLeaguePage,
});

/**
 * "Join a League": the Private / Public control, code entry with its invalid
 * state, the public Classic / Head-to-Head toggle, and the members list shown
 * right after joining.
 */
function JoinLeaguePage() {
  return (
    <FantasyFrame>
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
        <UiHeader title={joined.name} tone="gradient" onBack={() => setJoined(null)} />
        <div className={cn("px-4 pt-3", ui.surface.page)}>
          <p className={cn("text-center", ui.text.meta, ui.tone.muted)}>
            {t("fpl.last_updated")}: {t("fantasy.stat.none")}
          </p>
          <h2 className={cn("pt-3", ui.text.section, ui.tone.default)}>
            {t("fpl.players_to_be_added")}
          </h2>
        </div>

        {membersQ.isPending ? (
          <div role="status" aria-label={t("state.loading")} className="m-4 space-y-2">
            <UiSkeleton className="h-10" />
            <UiSkeleton className="h-10" />
            <UiSkeleton className="h-10" />
          </div>
        ) : members.length === 0 ? (
          <div className="p-4">
            <UiEmptyState
              title={t("fantasy.leagues.no_members_title")}
              body={t("fantasy.leagues.no_members")}
            />
          </div>
        ) : (
          <UiTable caption={t("fpl.players_to_be_added")} className="mt-3">
            <UiTHead>
              <UiTR>
                <UiTH>{t("fpl.team")}</UiTH>
                <UiTH>{t("fpl.manager")}</UiTH>
              </UiTR>
            </UiTHead>
            <UiTBody>
              {members.map((row) => (
                <UiTR key={row.managerId}>
                  <UiTD strong dir="auto">
                    {row.teamName}
                  </UiTD>
                  <UiTD dir="auto" className={ui.tone.muted}>
                    {row.managerName || t("fantasy.stat.none")}
                  </UiTD>
                </UiTR>
              ))}
            </UiTBody>
          </UiTable>
        )}

        <div className="px-4 pt-4">
          <UiButton
            variant="ink"
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
        title={t("fpl.leagues")}
        tone="gradient"
        backTo="/fantasy/leagues"
        trailing={
          <Link
            to="/fantasy/leagues"
            className={cn(
              "inline-flex items-center px-2",
              "min-h-[var(--ui-tap-min)]",
              ui.text.body,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.radius.control,
              ui.focus,
            )}
          >
            {t("fpl.done")}
          </Link>
        }
      >
        <p className={cn("mt-3 text-center", ui.text.title)}>{t("fpl.join_a_league")}</p>
        <UiSegmented
          className="mt-3"
          tone="onGradient"
          value={tab}
          label={t("fpl.join_a_league")}
          onChange={(v) => {
            setTab(v);
            setInvalid(false);
          }}
          options={[
            { value: "private", label: t("fpl.private") },
            { value: "public", label: t("fpl.public") },
          ]}
        />
      </UiHeader>

      <FantasyScreenGate state={screen} next="/fantasy/leagues/join">
        {tab === "private" ? (
          <form
            className="px-4 pt-6"
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
                <p className={cn("mt-3 text-center", ui.text.secondary, ui.tone.muted)}>
                  {t("fpl.create_own_league")}
                </p>
              </>
            )}
            {/* The code is a hex literal: read and typed left-to-right in both
                languages, and never letter-spaced. */}
            <UiInput
              className="mt-8"
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("fpl.private_league_code")}
              aria-label={t("fpl.private_league_code")}
              error={invalid ? t("fpl.invalid_code") : undefined}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              fieldClassName={cn("text-center font-mono", ui.text.tabular)}
            />
            <UiButton type="submit" className="mt-3" disabled={!code.trim() || busy}>
              {busy ? t("fpl.saving") : t("fpl.join_a_league")}
            </UiButton>
          </form>
        ) : (
          <div className="px-4 pt-6">
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
              value={scoring}
              onChange={setScoring}
              label={t("fpl.classic")}
              options={[
                { value: "classic", label: t("fpl.classic") },
                { value: "h2h", label: t("fpl.head_to_head"), disabled: true },
              ]}
            />
            <p className={cn("mt-1 text-center", ui.text.micro, ui.tone.muted)}>
              {t("fpl.head_to_head_help")}
            </p>
            {invalid ? (
              <UiAlert tone="negative" className="mt-3">
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
                className="mt-3 shadow-none"
                illustration={emptyLeaguesArt}
                title={t("fantasy.leagues.empty_title")}
                body={t("fpl.no_leagues")}
              />
            ) : null}
          </div>
        )}
      </FantasyScreenGate>
    </>
  );
}
