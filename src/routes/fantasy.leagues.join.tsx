import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { FplButton, FplHeader, FplSegmented } from "@/components/fpl/primitives";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/leagues/join")({
  component: JoinLeaguePage,
});

/**
 * FPL-020/021/022/023 "Join a League": Back / Leagues / Done header, the
 * Private / Public control, code entry with the invalid-code state, the
 * public Classic / Head-to-Head toggle, and the "Players to be added after
 * the next points update" list shown right after joining.
 */
function JoinLeaguePage() {
  return (
    <FantasyFrame background="white">
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
    return (
      <>
        <FplHeader title="" onBack={() => setJoined(null)} />
        <p className="px-4 pt-3 text-center text-[13px] text-foreground">
          {t("fpl.last_updated")}: —
        </p>
        <h1 className="px-4 pt-3 text-[20px] font-extrabold text-foreground">
          {t("fpl.players_to_be_added")}
        </h1>
        <table className="mt-3 w-full">
          <thead>
            <tr className="text-[13px] text-[color:var(--fpl-grey-text)]">
              <th className="px-4 py-2 text-start font-semibold">{t("fpl.team")}</th>
              <th className="px-4 py-2 text-start font-semibold">{t("fpl.manager")}</th>
            </tr>
          </thead>
          <tbody>
            {(membersQ.data ?? []).map((row) => (
              <tr key={row.managerId} className="border-t border-[color:var(--fpl-grey)]">
                <td className="px-4 py-3 text-[15px] text-foreground">{row.teamName}</td>
                <td className="px-4 py-3 text-[15px] text-foreground">{row.managerName || "—"}</td>
              </tr>
            ))}
            {membersQ.isPending ? (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-6 text-center text-[13px] text-[color:var(--fpl-grey-text)]"
                >
                  {t("state.loading")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="px-4 pt-4">
          <FplButton
            variant="ink"
            onClick={() =>
              void nav({
                to: joined.id ? "/fantasy/leagues/$leagueId" : "/fantasy/leagues",
                params: joined.id ? { leagueId: joined.id } : undefined,
              })
            }
          >
            {t("fpl.done")}
          </FplButton>
        </div>
      </>
    );
  }

  return (
    <>
      <FplHeader
        title={t("fpl.leagues")}
        backTo="/fantasy/leagues"
        right={
          <Link
            to="/fantasy/leagues"
            className="text-[15px] font-semibold text-[color:var(--fpl-ink)]"
          >
            {t("fpl.done")}
          </Link>
        }
      >
        <h1 className="mt-3 text-center text-[30px] font-black text-[color:var(--fpl-ink)]">
          {t("fpl.join_a_league")}
        </h1>
        <FplSegmented
          className="mt-3"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setInvalid(false);
          }}
          options={[
            { value: "private", label: t("fpl.private") },
            { value: "public", label: t("fpl.public") },
          ]}
        />
      </FplHeader>
      <FantasyScreenGate state={screen} next="/fantasy/leagues/join">
        {tab === "private" ? (
          <form
            className="px-4 pt-6"
            onSubmit={(e) => {
              e.preventDefault();
              void joinPrivate();
            }}
          >
            {invalid ? (
              <p
                role="alert"
                className="text-center text-[15px] font-semibold text-[color:var(--fpl-pink)]"
              >
                {t("fpl.invalid_code")}
              </p>
            ) : (
              <>
                <p className="text-center text-[15px] font-extrabold text-foreground">
                  {t("fpl.private_code_help")}
                </p>
                <p className="mt-3 text-center text-[14px] text-foreground">
                  {t("fpl.create_own_league")}
                </p>
              </>
            )}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("fpl.private_league_code")}
              aria-label={t("fpl.private_league_code")}
              className={cn(
                "mt-8 h-12 w-full border-b-2 bg-[color:var(--fpl-grey)] px-3 text-center text-[16px] text-foreground outline-none",
                invalid ? "border-[color:var(--fpl-pink)]" : "border-[color:var(--fpl-ink)]",
              )}
            />
            <FplButton type="submit" className="mt-3" disabled={!code.trim() || busy}>
              {busy ? t("fpl.saving") : t("fpl.join_a_league")}
            </FplButton>
          </form>
        ) : (
          <div className="px-4 pt-6">
            <p className="text-center text-[15px] text-foreground">{t("fpl.public_help")}</p>
            <p className="mt-3 text-center text-[15px] text-foreground">{t("fpl.public_help2")}</p>
            <p className="mt-3 text-center text-[14px] text-foreground">{t("fpl.classic_help")}</p>
            <FplSegmented
              tone="onLight"
              className="mt-6"
              value={scoring}
              onChange={setScoring}
              options={[
                { value: "classic", label: t("fpl.classic") },
                { value: "h2h", label: t("fpl.head_to_head"), disabled: true },
              ]}
            />
            <p className="mt-1 text-center text-[11px] text-[color:var(--fpl-grey-text)]">
              {t("fpl.head_to_head_help")}
            </p>
            {invalid ? (
              <p
                role="alert"
                className="mt-3 text-center text-[14px] font-semibold text-[color:var(--fpl-pink)]"
              >
                {t("state.error")}
              </p>
            ) : null}
            <FplButton
              className="mt-4"
              onClick={() => void joinPublic()}
              disabled={busy || publicQ.isPending || (publicQ.data ?? []).length === 0}
            >
              {busy ? t("fpl.saving") : t("fpl.join_a_league")}
            </FplButton>
            {(publicQ.data ?? []).length === 0 && !publicQ.isPending ? (
              <p className="mt-2 text-center text-[13px] text-[color:var(--fpl-grey-text)]">
                {t("fpl.no_leagues")}
              </p>
            ) : null}
          </div>
        )}
      </FantasyScreenGate>
    </>
  );
}
