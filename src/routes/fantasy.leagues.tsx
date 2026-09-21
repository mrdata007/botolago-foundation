import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiButton,
  UiCard,
  UiEmptyState,
  UiHeader,
  UiInput,
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
import { cn } from "@/lib/utils";
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
 * "Leagues & Cups": the Leagues / Cups control, Join + Configure actions, the
 * general and private league tables, and the create-a-league form.
 *
 * Converted to the kit. The league lists stay tables — rank and name are read
 * one column at a time — and the create form's result is the one place on this
 * screen that needed real design work; see `InviteCode`.
 */
function LeaguesPage() {
  return (
    <FantasyFrame>
      <LeaguesBody />
    </FantasyFrame>
  );
}

/**
 * The invite code, made shareable.
 *
 * The backend mints a 32-character hex string (`0035D6D8995B37EA0F05E2331C21FC0F`).
 * Nobody can read that down a phone line, and as one unbroken run it also wraps
 * mid-token on a 390px screen. This does the three things presentation can do
 * about it: group it into fours so the eye can chunk it, set it in a monospaced
 * face at tabular width so `0`/`O` and `1`/`I` are distinguishable, and put a
 * copy control next to it — because copying is what anyone sharing this will
 * actually do.
 *
 * `dir="ltr"` is deliberate even in Arabic: the code is a hex literal, not
 * prose, and must be read and transcribed left to right in both languages.
 * The grouping is visual only — `aria-label` and the clipboard both carry the
 * original unbroken string, so a screen reader and a paste get the real code.
 */
function InviteCode({ code }: { code: string }) {
  const { t } = useI18n();
  const groups = code.match(/.{1,4}/g) ?? [code];
  return (
    <div className={cn("mt-3 p-3", ui.radius.control, ui.surface.sunken)}>
      <p className={cn(ui.text.label, ui.tone.muted)}>{t("fpl.invite_code")}</p>
      <div className="mt-1 flex items-start gap-2">
        <code
          dir="ltr"
          aria-label={code}
          className={cn(
            "min-w-0 flex-1 select-all break-words font-mono",
            ui.text.meta,
            "[font-weight:var(--ui-weight-heavy)] [font-variant-numeric:tabular-nums]",
            ui.tone.default,
          )}
        >
          {groups.map((group, index) => (
            <span key={`${group}-${index}`} className="me-1.5 inline-block" aria-hidden>
              {group}
            </span>
          ))}
        </code>
        <UiButton
          size="sm"
          variant="outline"
          aria-label={t("fantasy.leagues.copy_code")}
          className="shrink-0"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            toast.success(t("fpl.copied"));
          }}
        >
          <Copy className="h-4 w-4" aria-hidden />
          {t("fpl.copy")}
        </UiButton>
      </div>
      <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>{t("fantasy.leagues.invite_help")}</p>
    </div>
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
      <UiHeader title={t("fpl.leagues_cups")} tone="gradient" backTo="/fantasy" />
      <FantasyScreenGate state={screen} next="/fantasy/leagues">
        <section className="mx-3 mt-3">
          <UiCard>
            <UiSegmented
              value={tab}
              onChange={setTab}
              label={t("fpl.leagues_cups")}
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
                    className={cn(
                      "inline-flex items-center justify-center gap-1 px-2",
                      "min-h-[var(--ui-tap-min)]",
                      ui.radius.control,
                      ui.surface.sunken,
                      ui.tone.ink,
                      ui.text.meta,
                      "[font-weight:var(--ui-weight-heavy)]",
                      ui.focus,
                    )}
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{t("fpl.join_leagues")}</span>
                  </Link>
                  <UiButton
                    size="sm"
                    variant="outline"
                    aria-expanded={createOpen}
                    onClick={() => setCreateOpen((v) => !v)}
                  >
                    <Settings className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{t("fpl.configure_leagues")}</span>
                  </UiButton>
                </div>

                {createOpen ? (
                  <form
                    className={cn("mt-3 p-3", ui.radius.control, ui.surface.sunken)}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void createLeague();
                    }}
                  >
                    <UiInput
                      label={t("fpl.league_name")}
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      maxLength={40}
                    />
                    <UiButton
                      type="submit"
                      className="mt-3"
                      disabled={createName.trim().length < 3 || busy}
                    >
                      {busy ? t("fpl.saving") : t("fpl.create_league")}
                    </UiButton>
                    {created ? (
                      <>
                        <p
                          dir="auto"
                          className={cn("mt-3 truncate", ui.text.bodyStrong, ui.tone.default)}
                        >
                          {created.name}
                        </p>
                        {created.code ? (
                          <InviteCode code={created.code} />
                        ) : (
                          <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
                            {t("fpl.invite_code")}: {t("fantasy.stat.none")}
                          </p>
                        )}
                      </>
                    ) : null}
                  </form>
                ) : null}

                <div className="mt-4">
                  <UiPill>{t("fpl.general_leagues")}</UiPill>
                  <LeagueRows
                    rows={[
                      {
                        key: "overall",
                        name: t("fpl.overall"),
                        to: "/fantasy/rankings",
                        rank: null,
                      },
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
                  <UiPill>{t("fpl.private_leagues")}</UiPill>
                  {privateQ.isPending ? (
                    <UiSkeleton className="my-3 h-10" />
                  ) : (privateQ.data ?? []).length === 0 ? (
                    <UiEmptyState
                      className="mt-2 shadow-none"
                      title={t("fantasy.leagues.empty_title")}
                      body={t("fpl.no_leagues")}
                    />
                  ) : (
                    <LeagueRows
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
                <UiPill>{t("fpl.cups")}</UiPill>
                <p className={cn("mt-3", ui.text.body, ui.tone.default)}>
                  {t("fpl.cup_not_qualified")}
                </p>
                <h2 className={cn("mt-3", ui.text.section, ui.tone.default)}>
                  {t("fpl.cup_how_title")}
                </h2>
                <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
                  {t("fpl.cup_how_body")}
                </p>
                <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
                  {t("fpl.cup_tiebreak")}
                </p>
                <ul className={cn("mt-1 space-y-0.5", ui.text.secondary, ui.tone.muted)}>
                  <li>{t("fpl.cup_tb1")}</li>
                  <li>{t("fpl.cup_tb2")}</li>
                  <li>{t("fpl.cup_tb3")}</li>
                </ul>
              </div>
            )}
          </UiCard>
        </section>
      </FantasyScreenGate>
    </>
  );
}

/** Rank + league name. A table, because that is what two aligned columns are. */
function LeagueRows({
  rows,
}: {
  rows: Array<{ key: string; name: string; to: string; rank: number | null }>;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  return (
    <UiTable caption={t("fpl.league")} className="mt-2">
      <UiTHead>
        <UiTR>
          <UiTH numeric className="w-20">
            {t("fpl.rank")}
          </UiTH>
          <UiTH>{t("fpl.league")}</UiTH>
        </UiTR>
      </UiTHead>
      <UiTBody>
        {rows.map((row) => (
          <UiTR key={row.key}>
            <UiTD numeric className={ui.tone.muted}>
              {/* An unranked league is "no rank yet", not a zero. */}
              {row.rank === null ? t("fantasy.stat.none") : nf.format(row.rank)}
            </UiTD>
            <UiTD>
              <Link
                to={row.to}
                className={cn(
                  "flex items-center min-h-[var(--ui-tap-min)]",
                  ui.text.body,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.tone.default,
                  ui.radius.control,
                  ui.focus,
                )}
              >
                <span dir="auto" className="truncate">
                  {row.name}
                </span>
              </Link>
            </UiTD>
          </UiTR>
        ))}
      </UiTBody>
    </UiTable>
  );
}
