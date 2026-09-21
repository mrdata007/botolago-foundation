import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FplHeader, FplSegmented } from "@/components/fpl/primitives";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { LoadingState, EmptyState } from "@/components/common/States";
import { ClubCrest } from "@/components/common/ClubCrest";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { DifficultyBadge } from "@/components/fantasy/DifficultyBadge";
import { getKitForClub } from "@/lib/kits";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

export const Route = createFileRoute("/fantasy/players/$playerId")({
  // Named metadata for shared player links; the component's own query reuses
  // this cache entry. Any failure degrades to generic Fantasy copy.
  loader: async ({ params, context }) => {
    try {
      const player = await context.queryClient.ensureQueryData({
        queryKey: ["fantasy-player", params.playerId],
        queryFn: () => fantasyService.getPlayer(params.playerId),
      });
      return player ? { name: player.name.fr } : null;
    } catch {
      return null;
    }
  },
  head: ({ params, loaderData }) => {
    const canonical = `${PUBLIC_SITE_ORIGIN}/fantasy/players/${encodeURIComponent(params.playerId)}`;
    const title = loaderData
      ? `${loaderData.name} — BotolaGO Fantasy`
      : "Joueur — BotolaGO Fantasy";
    const description = loaderData
      ? `Statistiques, forme, prix et prochains matchs de ${loaderData.name} pour votre équipe BotolaGO Fantasy.`
      : "Statistiques, forme, prix et prochains matchs du joueur pour votre équipe BotolaGO Fantasy.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: PlayerDetailFramed,
});

type Tab = "overview" | "history" | "fixtures" | "stats" | "news";
const tabs: { key: Tab; label: TranslationKey }[] = [
  { key: "overview", label: "fantasy.players.tab.overview" },
  { key: "history", label: "fantasy.players.tab.history" },
  { key: "fixtures", label: "fantasy.players.tab.fixtures" },
  { key: "stats", label: "fantasy.players.tab.stats" },
  { key: "news", label: "fantasy.players.tab.news" },
];

/**
 * FPL "Player info" reconstructed on the Fantasy design system: the shared
 * Back header (`FplHeader`), a jersey/ink hero plate and the same
 * `FplSegmented` tab control the rest of Fantasy uses for Squad/List.
 */
function PlayerDetailFramed() {
  const { t } = useI18n();
  return (
    <FantasyFrame>
      <FplHeader title={t("fpl.player_info")} backTo="/fantasy/players" />
      <PlayerDetailPage />
    </FantasyFrame>
  );
}

function PlayerDetailPage() {
  const { playerId } = Route.useParams();
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const playerQ = useQuery({
    queryKey: ["fantasy-player", playerId],
    queryFn: () => fantasyService.getPlayer(playerId),
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const fixturesQ = useQuery({
    queryKey: ["fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
  });
  const [tab, setTab] = useState<Tab>("overview");

  if (playerQ.isLoading) {
    return (
      <div className="bg-white px-4 pb-6 pt-3">
        <LoadingState />
      </div>
    );
  }
  const p = playerQ.data;
  if (!p || !clubsQ.data) {
    return (
      <div className="bg-white px-4 pb-6 pt-3">
        <EmptyState />
      </div>
    );
  }
  const clubs = clubsQ.data;
  const club = clubs.find((c) => c.id === p.clubId);
  const kit = getKitForClub(club, p.kitPattern);
  const playerFixtures = (fixturesQ.data ?? []).filter((f) => f.clubId === p.clubId).slice(0, 5);

  return (
    <div className="bg-white px-4 pb-6 pt-3">
      <div className="flex items-center gap-3 rounded-[10px] border border-[color:var(--fpl-grey)] p-4">
        <JerseyVisual kit={kit} size={48} imageUrl={p.jerseyImageUrl} ariaLabel={tr(p.name)} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black text-[color:var(--fpl-ink-deep)]">
            {tr(p.name)}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[color:var(--fpl-grey-text)]">
              {t(`player.pos.${p.position}` as TranslationKey)}
            </span>
            {club && <span className="text-[color:var(--fpl-grey-text)]">· {tr(club.name)}</span>}
            {p.status !== "available" && <PlayerStatusBadge status={p.status} />}
          </div>
        </div>
        <div className="text-end">
          <div className="fpl-tabular text-lg font-black text-[color:var(--fpl-ink)]">
            {nf.format(p.price)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--fpl-grey-text)]">
            {t("fantasy.price")}
          </div>
        </div>
      </div>

      <FplSegmented
        className="mt-3"
        tone="onLight"
        value={tab}
        onChange={setTab}
        options={tabs.map((it) => ({ value: it.key, label: t(it.label) }))}
      />

      <div className="mt-3">
        {tab === "overview" && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t("fantasy.total_points")} value={String(p.totalPoints)} />
            <Stat label={t("fantasy.form")} value={nf.format(p.form)} />
            <Stat label={t("fantasy.ownership")} value={`${nf.format(p.ownership)}%`} />
            <Stat label={t("fantasy.expected_points")} value={String(p.expectedPoints ?? "—")} />
          </div>
        )}

        {tab === "history" && (
          <div className="rounded-[10px] border border-[color:var(--fpl-grey)] p-3">
            <div className="text-sm text-[color:var(--fpl-grey-text)]">
              {tr(p.name)}: {p.totalPoints} {t("fantasy.points.abbr")} ({nf.format(p.form)} /{" "}
              {t("fpl.gameweek").toLowerCase()}).
            </div>
          </div>
        )}

        {tab === "fixtures" && (
          <div className="grid gap-1.5">
            {playerFixtures.length === 0 && <EmptyState />}
            {playerFixtures.map((f) => {
              const opp = clubs.find((c) => c.id === f.opponentClubId);
              return (
                <div
                  key={f.gameweek}
                  className="flex items-center gap-2 border-b border-[color:var(--fpl-grey)] py-2"
                >
                  <div className="w-14 shrink-0 text-[11px] font-bold text-[color:var(--fpl-grey-text)]">
                    GW {f.gameweek}
                  </div>
                  {opp && <ClubCrest club={opp} size="sm" />}
                  <div className="flex-1 text-sm font-semibold text-[color:var(--fpl-ink-deep)]">
                    {opp && tr(opp.shortName)}{" "}
                    <span className="text-[color:var(--fpl-grey-text)]">
                      ({f.isHome ? t("common.home") : t("common.away")})
                    </span>
                    {f.isDouble && (
                      <span className="ms-1 rounded bg-[color:var(--fpl-green)] px-1 text-[9px] font-black text-[color:var(--fpl-ink-deep)]">
                        DGW
                      </span>
                    )}
                    {f.isBlank && (
                      <span className="ms-1 rounded bg-[color:var(--fpl-grey)] px-1 text-[9px] font-black text-[color:var(--fpl-grey-text)]">
                        BGW
                      </span>
                    )}
                  </div>
                  <DifficultyBadge
                    difficulty={f.difficulty}
                    label={String(f.difficulty)}
                    className="w-8"
                  />
                </div>
              );
            })}
          </div>
        )}

        {tab === "stats" && (
          <dl className="grid grid-cols-2 gap-2">
            <StatDl k={t("fantasy.form")} v={nf.format(p.form)} />
            <StatDl k={t("fantasy.total_points")} v={String(p.totalPoints)} />
            <StatDl k={t("fantasy.expected_points")} v={String(p.expectedPoints ?? "—")} />
            <StatDl k={t("fantasy.ownership")} v={`${nf.format(p.ownership)}%`} />
            <StatDl k={t("fantasy.price")} v={nf.format(p.price)} />
            <StatDl
              k={t("fantasy.picker.filter_status")}
              v={t(`player.status.${p.status}` as TranslationKey)}
            />
          </dl>
        )}

        {tab === "news" && (
          <div className="rounded-[10px] border border-[color:var(--fpl-grey)] p-4 text-sm text-[color:var(--fpl-grey-text)]">
            {p.news ? tr(p.news) : t("state.empty")}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[color:var(--fpl-grey)] px-2 py-3 text-center">
      <div className="fpl-tabular text-lg font-black text-[color:var(--fpl-ink)]">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[color:var(--fpl-grey-text)]">
        {label}
      </div>
    </div>
  );
}
function StatDl({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-[8px] bg-[color:var(--fpl-grey)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--fpl-grey-text)]">
        {k}
      </div>
      <div className="fpl-tabular text-sm font-black text-[color:var(--fpl-ink-deep)]">{v}</div>
    </div>
  );
}
