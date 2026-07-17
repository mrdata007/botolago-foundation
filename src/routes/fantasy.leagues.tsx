import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fantasyService } from "@/services/fantasy-mock";
import { LoadingState } from "@/components/common/States";
import { RankChangeIndicator } from "@/components/fantasy/RankChangeIndicator";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Copy, Trophy } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";

export const Route = createFileRoute("/fantasy/leagues")({
  component: LeaguesPage,
});

type Tab = "private" | "public" | "cup";
const tabs: { key: Tab; label: TranslationKey }[] = [
  { key: "private", label: "fantasy.leagues.tab.private" },
  { key: "public", label: "fantasy.leagues.tab.public" },
  { key: "cup", label: "fantasy.leagues.tab.cups" },
];

function LeaguesPage() {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const [tab, setTab] = useState<Tab>("private");
  const [joinCode, setJoinCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [joinToast, setJoinToast] = useState<string | null>(null);

  const { requireAuth } = useAuth();
  const leaguesQ = useQuery({ queryKey: ["fantasy-leagues", tab], queryFn: () => fantasyService.getLeagues(tab) });

  const handleCreate = () => {
    if (!createName.trim()) return;
    requireAuth(() => {
      const code = `BOT-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      setCreatedCode(code);
      setCreateName("");
    });
  };
  const handleJoin = () => {
    if (!joinCode.trim()) return;
    requireAuth(() => {
      setJoinToast(joinCode.trim());
      setJoinCode("");
      setTimeout(() => setJoinToast(null), 2400);
    });
  };
  const copy = (code: string) => {
    try { navigator.clipboard.writeText(code); } catch { /* ignore */ }
  };

  return (
    <div>
      <h1 className="text-xl font-black text-foreground">{t("fantasy.leagues.title")}</h1>

      <div className="mt-3 glass-surface glass-strong flex items-center gap-1 rounded-2xl border border-[var(--glass-border)] p-1">
        {tabs.map((it) => (
          <button
            key={it.key}
            onClick={() => setTab(it.key)}
            className={cn(
              "flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
              tab === it.key ? "bg-[color:var(--brand-primary)] text-white shadow" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={tab === it.key}
          >
            {t(it.label)}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        {leaguesQ.isLoading && <LoadingState />}
        {leaguesQ.data?.map((l) => (
          <Link
            key={l.id}
            to="/fantasy/leagues/$leagueId"
            params={{ leagueId: l.id }}
            className="glass-surface glass-regular flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] px-3 py-3"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-white">
              <Trophy className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-foreground">{l.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {nf.format(l.members)} {t("fantasy.leagues.members")} · {t("fantasy.leagues.leader")}: {l.leaderName ?? "—"}
              </div>
            </div>
            <div className="text-end">
              <div className="text-sm font-black tabular-nums">#{nf.format(l.rank)}</div>
              <RankChangeIndicator rank={l.rank} previousRank={l.previousRank} />
            </div>
          </Link>
        ))}
      </div>

      <SectionHeader title={t("fantasy.leagues.join")} />
      <div className="glass-surface glass-regular flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--glass-border)] p-3">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder={t("fantasy.leagues.enter_code")}
          className="min-w-0 flex-1 rounded-lg bg-white/70 px-3 py-2 text-sm outline-none ring-1 ring-black/5 placeholder:text-muted-foreground"
        />
        <button
          onClick={handleJoin}
          className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          disabled={!joinCode.trim()}
        >
          {t("fantasy.leagues.join")}
        </button>
      </div>
      {joinToast && (
        <div className="mt-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-800">
          {t("fantasy.leagues.code")}: {joinToast}
        </div>
      )}

      <SectionHeader title={t("fantasy.leagues.create")} />
      <div className="glass-surface glass-regular flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--glass-border)] p-3">
        <input
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          placeholder={t("fantasy.leagues.name")}
          className="min-w-0 flex-1 rounded-lg bg-white/70 px-3 py-2 text-sm outline-none ring-1 ring-black/5 placeholder:text-muted-foreground"
        />
        <button
          onClick={handleCreate}
          className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          disabled={!createName.trim()}
        >
          {t("fantasy.leagues.create")}
        </button>
      </div>
      {createdCode && (
        <div className="mt-2 flex items-center justify-between rounded-xl border border-[color:var(--brand-accent)]/40 bg-[color:var(--brand-accent)]/10 px-3 py-2 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("fantasy.leagues.code")}</div>
            <div className="font-mono font-black text-foreground">{createdCode}</div>
          </div>
          <button onClick={() => copy(createdCode)} className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-2 py-1 text-xs font-semibold ring-1 ring-black/10">
            <Copy className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.leagues.share")}
          </button>
        </div>
      )}
    </div>
  );
}
