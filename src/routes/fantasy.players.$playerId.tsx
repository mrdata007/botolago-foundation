import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fantasyService } from "@/services/fantasy-mock";
import { botolaService } from "@/services/mock";
import { LoadingState, EmptyState } from "@/components/common/States";
import { ClubCrest } from "@/components/common/ClubCrest";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { DifficultyBadge } from "@/components/fantasy/DifficultyBadge";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/fantasy/players/$playerId")({
  component: PlayerDetailPage,
});

type Tab = "overview" | "history" | "fixtures" | "stats" | "news";
const tabs: { key: Tab; label: TranslationKey }[] = [
  { key: "overview", label: "fantasy.players.tab.overview" },
  { key: "history", label: "fantasy.players.tab.history" },
  { key: "fixtures", label: "fantasy.players.tab.fixtures" },
  { key: "stats", label: "fantasy.players.tab.stats" },
  { key: "news", label: "fantasy.players.tab.news" },
];

function PlayerDetailPage() {
  const { playerId } = Route.useParams();
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const playerQ = useQuery({ queryKey: ["fantasy-player", playerId], queryFn: () => fantasyService.getPlayer(playerId) });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const fixturesQ = useQuery({ queryKey: ["fixture-difficulty"], queryFn: () => fantasyService.getFixtureDifficulty() });
  const [tab, setTab] = useState<Tab>("overview");

  if (playerQ.isLoading) return <LoadingState />;
  const p = playerQ.data;
  if (!p || !clubsQ.data) return <EmptyState />;
  const clubs = clubsQ.data;
  const club = clubs.find((c) => c.id === p.clubId);
  const playerFixtures = (fixturesQ.data ?? []).filter((f) => f.clubId === p.clubId).slice(0, 5);

  return (
    <div>
      <Link to="/fantasy/players" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {t("common.back")}
      </Link>

      <div className="mt-2 glass-surface glass-strong flex items-center gap-3 rounded-3xl border border-[var(--glass-border)] p-4">
        {club && <ClubCrest club={club} size="lg" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black text-foreground">{tr(p.name)}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t(`player.pos.${p.position}` as TranslationKey)}</span>
            {club && <span className="text-muted-foreground">· {tr(club.name)}</span>}
            {p.status !== "available" && <PlayerStatusBadge status={p.status} />}
          </div>
        </div>
        <div className="text-end">
          <div className="text-lg font-black tabular-nums text-brand-accent">{nf.format(p.price)}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("fantasy.price")}</div>
        </div>
      </div>

      <div className="mt-3 flex gap-1 overflow-x-auto scrollbar-none">
        {tabs.map((it) => (
          <button
            key={it.key}
            onClick={() => setTab(it.key)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold",
              tab === it.key ? "bg-[color:var(--brand-primary)] text-white" : "bg-white/60 ring-1 ring-black/5",
            )}
            aria-pressed={tab === it.key}
          >
            {t(it.label)}
          </button>
        ))}
      </div>

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
          <div className="rounded-2xl bg-card ring-1 ring-black/5 p-3">
            <div className="text-sm text-muted-foreground">
              {tr(p.name)}: {p.totalPoints} pts sur la saison ({nf.format(p.form)} / journée en moyenne).
            </div>
          </div>
        )}

        {tab === "fixtures" && (
          <div className="grid gap-1.5">
            {playerFixtures.length === 0 && <EmptyState />}
            {playerFixtures.map((f) => {
              const opp = clubs.find((c) => c.id === f.opponentClubId);
              return (
                <div key={f.gameweek} className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 ring-1 ring-black/5">
                  <div className="w-14 shrink-0 text-[11px] font-bold text-muted-foreground">GW {f.gameweek}</div>
                  {opp && <ClubCrest club={opp} size="sm" />}
                  <div className="flex-1 text-sm font-semibold">
                    {opp && tr(opp.shortName)}{" "}
                    <span className="text-muted-foreground">({f.isHome ? t("common.home") : t("common.away")})</span>
                    {f.isDouble && <span className="ms-1 rounded bg-emerald-500/15 px-1 text-[9px] font-black text-emerald-700">DGW</span>}
                    {f.isBlank && <span className="ms-1 rounded bg-neutral-500/20 px-1 text-[9px] font-black text-neutral-700">BGW</span>}
                  </div>
                  <DifficultyBadge difficulty={f.difficulty} label={String(f.difficulty)} className="w-8" />
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
            <StatDl k={t("fantasy.picker.filter_status")} v={t(`player.status.${p.status}` as TranslationKey)} />
          </dl>
        )}

        {tab === "news" && (
          <div className="rounded-2xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-black/5">
            {p.news ? tr(p.news) : t("state.empty")}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] px-2 py-3 text-center">
      <div className="text-lg font-black tabular-nums text-brand-accent">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
function StatDl({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-3 py-2 ring-1 ring-black/5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-sm font-black tabular-nums text-foreground">{v}</div>
    </div>
  );
}
