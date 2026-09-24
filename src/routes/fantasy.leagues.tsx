import emptyLeaguesArt from "@/assets/illustrations/empty-leagues.webp";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SectionHeader } from "@/components/common/SectionHeader";
import { CupInfo } from "@/components/fantasy-lists/CupInfo";
import { LeagueList } from "@/components/fantasy-lists/LeagueList";
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
  UiLinkButton,
  UiSkeleton,
  UiTabs,
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
 * "Leagues & Cups", in the Option A language: underline tabs (Ligues |
 * Coupes) under the header, the Join and Manage actions as round pills, the
 * create form on a card, display section headings in place of the ink pills,
 * and the leagues as card rows with their rank ("3e sur 24") — the rows the
 * A-Fantasy hub draws for "Mes ligues". Behaviour is unchanged: the same
 * queries, the same create flow and the same links.
 */
function LeaguesPage() {
  return (
    <FantasyFrame bottomNav>
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
    <div className={cn("mt-3 p-3", ui.radius.card, ui.surface.page)}>
      <p className={cn(ui.text.label, ui.tone.muted)}>{t("fpl.invite_code")}</p>
      <div className="mt-1 flex items-start gap-2">
        <code
          dir="ltr"
          aria-label={code}
          className={cn(
            "min-w-0 flex-1 select-all break-words font-mono",
            ui.text.meta,
            // An invite code is a figure a reader copies character by
            // character, so it is on the tabular rail like every other figure.
            "[font-weight:var(--ui-weight-heavy)]",
            ui.text.tabular,
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
          variant="soft"
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
      <UiHeader kicker={t("nav.fantasy")} title={t("fpl.leagues_cups")} backTo="/fantasy" />
      <FantasyScreenGate state={screen} next="/fantasy/leagues">
        <UiTabs
          value={tab}
          onChange={setTab}
          label={t("fpl.leagues_cups")}
          idBase="leagues"
          className="px-2"
          options={[
            { value: "leagues", label: t("fpl.leagues"), panelId: "leagues-panel-leagues" },
            { value: "cups", label: t("fpl.cups"), panelId: "leagues-panel-cups" },
          ]}
        />
        <section
          role="tabpanel"
          id={`leagues-panel-${tab}`}
          aria-labelledby={`leagues-tab-${tab}`}
          className={cn("px-4 pb-8 pt-5", ui.surface.page)}
        >
          {tab === "leagues" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <UiLinkButton to="/fantasy/leagues/join" size="sm" variant="soft">
                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="line-clamp-2 whitespace-normal text-balance">
                    {t("fpl.join_leagues")}
                  </span>
                </UiLinkButton>
                <UiButton
                  size="sm"
                  variant={createOpen ? "ink" : "soft"}
                  aria-expanded={createOpen}
                  onClick={() => setCreateOpen((v) => !v)}
                >
                  <Settings className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="line-clamp-2 whitespace-normal text-balance">
                    {t("fpl.configure_leagues")}
                  </span>
                </UiButton>
              </div>

              {createOpen ? (
                <UiCard className="mt-3">
                  <form
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
                      fieldClassName={cn(
                        ui.radius.card,
                        "min-h-[var(--ui-row-min)] border-[color:var(--ui-rule-strong)]",
                      )}
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
                          className={cn("mt-4 truncate", ui.display.team, ui.tone.default)}
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
                </UiCard>
              ) : null}

              <section className="mt-6">
                <SectionHeader title={t("fpl.general_leagues")} />
                <LeagueList
                  label={t("fpl.general_leagues")}
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
                      members: l.members,
                    })),
                  ]}
                />
              </section>

              <section className="mt-6">
                <SectionHeader title={t("fpl.private_leagues")} />
                {privateQ.isPending ? (
                  <UiSkeleton className={cn("h-14", ui.radius.card)} />
                ) : (privateQ.data ?? []).length === 0 ? (
                  <UiEmptyState
                    illustration={emptyLeaguesArt}
                    title={t("fantasy.leagues.empty_title")}
                    body={t("fpl.no_leagues")}
                  />
                ) : (
                  <LeagueList
                    label={t("fpl.private_leagues")}
                    rows={(privateQ.data ?? []).map((l) => ({
                      key: l.id,
                      name: l.name,
                      to: `/fantasy/leagues/${l.id}`,
                      rank: l.rank,
                      members: l.members,
                    }))}
                  />
                )}
              </section>
            </>
          ) : (
            <CupInfo />
          )}
        </section>
      </FantasyScreenGate>
    </>
  );
}
