import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { botolaService } from "@/services/mock";
import { AppShell } from "@/components/shell/AppShell";
import { MatchCard } from "@/components/common/MatchCard";
import { ClubCrest } from "@/components/common/ClubCrest";
import { LoadingState, EmptyState } from "@/components/common/States";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/matches")({
  head: () => ({
    meta: [
      { title: "Matchs — BotolaGO" },
      { name: "description", content: "Suivez tous les matchs de la Botola Pro : en direct, à venir et résultats." },
      { property: "og:title", content: "Matchs — BotolaGO" },
      { property: "og:description", content: "Suivez tous les matchs de la Botola Pro : en direct, à venir et résultats." },
    ],
  }),
  component: MatchesPage,
});

type Tab = "live" | "upcoming" | "results";
const tabs: { key: Tab; label: TranslationKey }[] = [
  { key: "live", label: "matches.tab.live" },
  { key: "upcoming", label: "matches.tab.upcoming" },
  { key: "results", label: "matches.tab.results" },
];

function MatchesPage() {
  const { t, tr } = useI18n();
  const [tab, setTab] = useState<Tab>("live");
  const matchesQ = useQuery({ queryKey: ["matches", tab], queryFn: () => botolaService.getMatches(tab) });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const tableQ = useQuery({ queryKey: ["table"], queryFn: () => botolaService.getTable() });
  const clubById = (id: string) => clubsQ.data?.find((c) => c.id === id);

  return (
    <AppShell>
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">{t("matches.title")}</h1>

      <div className="mt-3">
        <div className="glass-surface glass-strong flex items-center gap-1 rounded-2xl border border-[var(--glass-border)] p-1">
          {tabs.map((it) => (
            <button
              key={it.key}
              onClick={() => setTab(it.key)}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                tab === it.key
                  ? "bg-[var(--brand-primary)] text-white shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={tab === it.key}
            >
              {t(it.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {matchesQ.isLoading && <LoadingState />}
        {!matchesQ.isLoading && matchesQ.data?.length === 0 && <EmptyState />}
        {matchesQ.data?.map((m) => {
          const home = clubById(m.homeClubId);
          const away = clubById(m.awayClubId);
          if (!home || !away) return null;
          return (
            <div key={m.id} className="space-y-1">
              <MatchCard match={m} home={home} away={away} />
              <div className="px-3 text-[10px] text-muted-foreground">{tr(m.venue)}</div>
            </div>
          );
        })}
      </div>

      <SectionHeader title={t("matches.table_preview")} />
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/5">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start">#</th>
              <th className="px-3 py-2 text-start">{t("matches.title")}</th>
              <th className="px-2 py-2 text-center">J</th>
              <th className="px-2 py-2 text-center">+/-</th>
              <th className="px-3 py-2 text-end">Pts</th>
            </tr>
          </thead>
          <tbody>
            {tableQ.data?.map((row) => {
              const club = clubById(row.clubId);
              if (!club) return null;
              return (
                <tr key={row.clubId} className="border-t border-border/70">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.position}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ClubCrest club={club} size="sm" />
                      <span className="truncate font-semibold text-foreground">{tr(club.shortName)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">{row.played}</td>
                  <td className="px-2 py-2 text-center tabular-nums">
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </td>
                  <td className="px-3 py-2 text-end font-black tabular-nums text-foreground">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
