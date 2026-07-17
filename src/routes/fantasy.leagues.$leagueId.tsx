import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-mock";
import { LoadingState, EmptyState } from "@/components/common/States";
import { LeagueTable } from "@/components/fantasy/LeagueTable";
import { RankChangeIndicator } from "@/components/fantasy/RankChangeIndicator";
import { useI18n } from "@/i18n/provider";
import { ArrowLeft, Copy, Trophy } from "lucide-react";

export const Route = createFileRoute("/fantasy/leagues/$leagueId")({
  component: LeagueDetailPage,
});

function LeagueDetailPage() {
  const { leagueId } = Route.useParams();
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const leagueQ = useQuery({ queryKey: ["league", leagueId], queryFn: () => fantasyService.getLeague(leagueId) });
  const standingsQ = useQuery({ queryKey: ["standings", leagueId], queryFn: () => fantasyService.getLeagueStandings(leagueId) });

  if (leagueQ.isLoading) return <LoadingState />;
  const l = leagueQ.data;
  if (!l) return <EmptyState />;

  const copy = () => { if (l.code) try { navigator.clipboard.writeText(l.code); } catch { /* ignore */ } };

  return (
    <div>
      <Link to="/fantasy/leagues" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {t("common.back")}
      </Link>

      <div className="mt-2 glass-surface glass-strong flex items-center gap-3 rounded-3xl border border-[var(--glass-border)] p-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--bg-brand-gradient)] text-white">
          <Trophy className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black text-foreground">{l.name}</div>
          <div className="text-xs text-muted-foreground">
            {nf.format(l.members)} {t("fantasy.leagues.members")} · {t("fantasy.leagues.leader")}: {l.leaderName ?? "—"}
          </div>
        </div>
        <div className="text-end">
          <div className="text-lg font-black tabular-nums">#{nf.format(l.rank)}</div>
          <RankChangeIndicator rank={l.rank} previousRank={l.previousRank} />
        </div>
      </div>

      {l.code && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm ring-1 ring-black/5">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("fantasy.leagues.code")}</div>
            <div className="font-mono font-black">{l.code}</div>
          </div>
          <button onClick={copy} className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--brand-primary)] px-2 py-1 text-xs font-semibold text-white">
            <Copy className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.leagues.share")}
          </button>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 text-sm font-black text-foreground">{t("fantasy.leagues.standings")}</div>
        {standingsQ.data && standingsQ.data.length > 0 ? (
          <LeagueTable standings={standingsQ.data} meId="me" />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
