import { useState } from "react";
import type { LeagueStanding } from "@/types/fantasy";
import { useI18n } from "@/i18n/provider";
import { RankChangeIndicator } from "./RankChangeIndicator";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function LeagueTable({
  standings,
  meId,
  showSearch = true,
  compact = false,
}: {
  standings: LeagueStanding[];
  meId?: string;
  showSearch?: boolean;
  compact?: boolean;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? standings.filter(
        (s) =>
          s.managerName.toLowerCase().includes(q.toLowerCase()) ||
          s.teamName.toLowerCase().includes(q.toLowerCase()),
      )
    : standings;

  return (
    <div className="space-y-2">
      {showSearch && (
        <label className="glass-surface glass-regular flex items-center gap-2 rounded-xl border border-[var(--glass-border)] px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("fantasy.leagues.search_manager")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/5">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start">#</th>
              <th className="px-3 py-2 text-start">{t("fantasy.leagues.manager")}</th>
              {!compact && <th className="px-2 py-2 text-center">{t("fantasy.leagues.gw")}</th>}
              <th className="px-3 py-2 text-end">{t("fantasy.leagues.total")}</th>
              <th className="px-2 py-2 text-end">{t("fantasy.leagues.movement")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isMe = meId && s.managerId === meId;
              return (
                <tr
                  key={s.managerId}
                  className={cn("border-t border-border/70", isMe && "bg-[color:var(--brand-accent)]/10")}
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{s.rank}</td>
                  <td className="px-3 py-2">
                    <div className="truncate font-bold text-foreground">{s.managerName}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{s.teamName}</div>
                  </td>
                  {!compact && (
                    <td className="px-2 py-2 text-center tabular-nums">{s.gameweekScore}</td>
                  )}
                  <td className="px-3 py-2 text-end font-black tabular-nums text-foreground">
                    {nf.format(s.totalScore)}
                  </td>
                  <td className="px-2 py-2 text-end">
                    <RankChangeIndicator rank={s.rank} previousRank={s.previousRank} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
