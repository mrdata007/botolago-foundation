import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { fantasyService } from "@/services/fantasy-runtime";
import { LoadingState, EmptyState } from "@/components/common/States";
import { LeagueTable } from "@/components/fantasy/LeagueTable";
import { RankChangeIndicator } from "@/components/fantasy/RankChangeIndicator";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { ArrowLeft, Copy, LogOut, Trash2, Trophy } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/fantasy/leagues/$leagueId")({
  component: LeagueDetailPage,
});

function LeagueDetailPage() {
  const { leagueId } = Route.useParams();
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const { requireAuth } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);

  const leagueQ = useQuery({
    queryKey: ["league", leagueId],
    queryFn: () => fantasyService.getLeague(leagueId),
  });
  const standingsQ = useQuery({
    queryKey: ["standings", leagueId],
    queryFn: () => fantasyService.getLeagueStandings(leagueId),
  });

  const league = leagueQ.data;
  if (leagueQ.isLoading) return <LoadingState />;
  if (!league) return <EmptyState />;
  const standings = standingsQ.data ?? [];

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };
  const copy = () => {
    if (!league.code) return;
    try {
      navigator.clipboard.writeText(league.code);
      showToast(t("fantasy.leagues.copied"));
    } catch {
      /* ignore */
    }
  };
  const handleLeave = async () => {
    try {
      await fantasyService.leaveLeague(league.id);
      await qc.invalidateQueries({ queryKey: ["fantasy-leagues"] });
      navigate({ to: "/fantasy/leagues" });
    } catch {
      showToast(t("fantasy.error.permission"));
    } finally {
      setConfirm(null);
    }
  };
  const handleDelete = async () => {
    try {
      await fantasyService.archiveLeague(league.id);
      await qc.invalidateQueries({ queryKey: ["fantasy-leagues"] });
      navigate({ to: "/fantasy/leagues" });
    } catch {
      showToast(t("fantasy.error.permission"));
    } finally {
      setConfirm(null);
    }
  };

  const isCreator = league.role === "owner";
  const isMember = league.role === "member" || league.role === "admin";

  return (
    <div>
      <Link
        to="/fantasy/leagues"
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {t("common.back")}
      </Link>

      <div className="mt-2 glass-surface glass-strong flex items-center gap-3 rounded-3xl border border-[var(--glass-border)] p-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--bg-brand-gradient)] text-white">
          <Trophy className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-lg font-black text-foreground">{league.name}</div>
            {league.role && (
              <span className="rounded-full bg-[color:var(--brand-accent)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--brand-primary)]">
                {t(
                  league.role === "owner"
                    ? "fantasy.leagues.role.creator"
                    : "fantasy.leagues.role.member",
                )}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {nf.format(league.members)} {t("fantasy.leagues.members")} ·{" "}
            {t("fantasy.leagues.leader")}: {league.leaderName ?? "—"}
          </div>
        </div>
        <div className="text-end">
          <div className="text-lg font-black tabular-nums text-brand-accent">
            {league.rank === null ? "—" : `#${nf.format(league.rank)}`}
          </div>
          {league.rank !== null && (
            <RankChangeIndicator
              rank={league.rank}
              previousRank={league.previousRank ?? league.rank}
            />
          )}
        </div>
      </div>

      {league.code && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm ring-1 ring-black/5">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("fantasy.leagues.code")}
            </div>
            <div className="font-mono font-black">{league.code}</div>
          </div>
          <button
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--brand-primary)] px-2 py-1 text-xs font-semibold text-white"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.leagues.share")}
          </button>
        </div>
      )}

      <p className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-[11px] text-muted-foreground ring-1 ring-black/5">
        {t("fantasy.leagues.rules_summary")}
      </p>

      {(isMember || isCreator) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {isMember && (
            <button
              onClick={() => requireAuth(() => setConfirm("leave"))}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-foreground ring-1 ring-black/10"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.leagues.leave")}
            </button>
          )}
          {isCreator && (
            <button
              onClick={() => requireAuth(() => setConfirm("delete"))}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.leagues.delete")}
            </button>
          )}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 text-sm font-black text-foreground">
          {t("fantasy.leagues.standings")}
        </div>
        {standings.length > 0 ? <LeagueTable standings={standings} meId="me" /> : <EmptyState />}
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl bg-foreground/90 px-3 py-2 text-center text-xs font-semibold text-background shadow-lg"
        >
          {toast}
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                confirm === "delete"
                  ? "fantasy.leagues.delete_confirm_title"
                  : "fantasy.leagues.leave_confirm_title",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                confirm === "delete"
                  ? "fantasy.leagues.delete_confirm_desc"
                  : "fantasy.leagues.leave_confirm_desc",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm === "delete" ? handleDelete : handleLeave}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
