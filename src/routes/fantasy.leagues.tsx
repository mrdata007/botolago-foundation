import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { FplButton, FplHeader, FplPill, FplSegmented } from "@/components/fpl/primitives";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { useI18n } from "@/i18n/provider";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

export const Route = createFileRoute("/fantasy/leagues")({
  component: LeaguesRoute,
});

function LeaguesRoute() {
  const isChild = useRouterState({
    select: (state) =>
      state.matches.some(
        (match) =>
          match.routeId === "/fantasy/leagues/$leagueId" ||
          match.routeId === "/fantasy/leagues/join",
      ),
  });
  return isChild ? <Outlet /> : <LeaguesPage />;
}

/**
 * FPL-015 "Leagues & Cups" as its own screen ("Configure Leagues" target):
 * Leagues / Cups control, Join + Configure actions, the ink section pills
 * with rank / league rows, plus the create-a-league form that "Configure
 * Leagues" leads to in the reference flow.
 */
function LeaguesPage() {
  return (
    <FantasyFrame>
      <LeaguesBody />
    </FantasyFrame>
  );
}

function LeaguesBody() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const screen = useFantasyScreen();
  const { key } = useFantasyDataSource();
  const [tab, setTab] = useState<"leagues" | "cups">("leagues");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [created, setCreated] = useState<{ name: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const privateQ = useQuery({
    queryKey: key("leagues", "private"),
    queryFn: () => fantasyService.getLeagues("private"),
    enabled: screen.phase === "ready",
  });
  const publicQ = useQuery({
    queryKey: key("leagues", "public"),
    queryFn: () => fantasyService.getLeagues("public"),
    enabled: screen.phase === "ready",
  });

  const createLeague = async () => {
    if (createName.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const league = await fantasyService.createLeague(createName.trim());
      setCreated({ name: createName.trim(), code: league.code });
      setCreateName("");
      await qc.invalidateQueries({ queryKey: key("leagues", "private") });
      toast.success(t("fantasy.leagues.created"));
    } catch {
      toast.error(t("state.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <FplHeader title={t("fpl.leagues_cups")} backTo="/fantasy" />
      <FantasyScreenGate state={screen} next="/fantasy/leagues">
        <section className="mx-3 mt-3 rounded-[6px] bg-white p-4 shadow-sm">
          <FplSegmented
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
                <button
                  type="button"
                  onClick={() => setCreateOpen((v) => !v)}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[4px] bg-white px-2 text-[14px] font-extrabold text-[color:var(--fpl-ink-deep)] shadow-[0_1px_4px_rgba(0,0,0,0.15)]"
                >
                  <Settings className="h-4 w-4" aria-hidden /> {t("fpl.configure_leagues")}
                </button>
              </div>

              {createOpen ? (
                <form
                  className="mt-3 rounded-[4px] bg-[color:var(--fpl-bg)] p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void createLeague();
                  }}
                >
                  <label className="block text-[13px] font-bold text-foreground">
                    {t("fpl.league_name")}
                    <input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      maxLength={40}
                      className="mt-1 h-11 w-full rounded-[4px] border-b-2 border-[color:var(--fpl-ink)] bg-white px-3 text-[15px] outline-none"
                    />
                  </label>
                  <FplButton
                    type="submit"
                    className="mt-3"
                    disabled={createName.trim().length < 3 || busy}
                  >
                    {busy ? t("fpl.saving") : t("fpl.create_league")}
                  </FplButton>
                  {created ? (
                    <div className="mt-3 flex items-center justify-between rounded-[4px] bg-white px-3 py-2 text-[13px]">
                      <span>
                        <strong>{created.name}</strong> · {t("fpl.invite_code")}:{" "}
                        <span className="font-mono font-bold">{created.code ?? "—"}</span>
                      </span>
                      {created.code ? (
                        <button
                          type="button"
                          aria-label={t("fpl.copy")}
                          onClick={() => {
                            void navigator.clipboard?.writeText(created.code!);
                            toast.success(t("fpl.copied"));
                          }}
                          className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--fpl-grey)]"
                        >
                          <Copy className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </form>
              ) : null}

              <div className="mt-4">
                <FplPill>{t("fpl.general_leagues")}</FplPill>
                <Table
                  rows={[
                    { key: "overall", name: t("fpl.overall"), to: "/fantasy/rankings", rank: null },
                    ...(publicQ.data ?? []).map((l) => ({
                      key: l.id,
                      name: l.name,
                      to: `/fantasy/leagues/${l.id}`,
                      rank: l.rank,
                    })),
                  ]}
                />
              </div>
              <div className="mt-4">
                <FplPill>{t("fpl.private_leagues")}</FplPill>
                {privateQ.isPending ? (
                  <div className="my-3 h-10 animate-pulse rounded bg-[color:var(--fpl-grey)] motion-reduce:animate-none" />
                ) : (privateQ.data ?? []).length === 0 ? (
                  <p className="px-1 py-3 text-[13px] text-[color:var(--fpl-grey-text)]">
                    {t("fpl.no_leagues")}
                  </p>
                ) : (
                  <Table
                    rows={(privateQ.data ?? []).map((l) => ({
                      key: l.id,
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
              <p className="mt-2 text-[14px] text-foreground">{t("fpl.cup_tiebreak")}</p>
              <ul className="mt-1 text-[14px] text-foreground">
                <li>{t("fpl.cup_tb1")}</li>
                <li>{t("fpl.cup_tb2")}</li>
                <li>{t("fpl.cup_tb3")}</li>
              </ul>
            </div>
          )}
        </section>
      </FantasyScreenGate>
    </>
  );
}

function Table({
  rows,
}: {
  rows: Array<{ key: string; name: string; to: string; rank: number | null }>;
}) {
  const { t } = useI18n();
  return (
    <table className="mt-2 w-full text-[15px]">
      <thead>
        <tr className="text-[12px] font-semibold text-[color:var(--fpl-grey-text)]">
          <th className="w-24 py-1 text-start font-semibold">{t("fpl.rank")}</th>
          <th className="py-1 text-start font-semibold">{t("fpl.league")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-[color:var(--fpl-grey)]">
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
