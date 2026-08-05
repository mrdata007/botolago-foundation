import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, Trophy, WalletCards } from "lucide-react";

import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import {
  getGameweekPresentation,
  type GameweekStatusTone,
} from "@/components/fantasy/gameweek-presentation";
import { useI18n } from "@/i18n/provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import type { FantasyGameweekStatus } from "@/types/domain";

export function GameweekStatusStrip() {
  const { t, lang } = useI18n();
  const { source, key } = useFantasyDataSource();
  const numberFormat = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 1,
  });

  const gameweek = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const status: FantasyGameweekStatus =
    gameweek.data?.status ??
    (gameweek.data
      ? new Date(gameweek.data.deadline).getTime() > Date.now()
        ? "open"
        : gameweek.data.isCurrent
          ? "locked"
          : "finalized"
      : "scheduled");
  const presentation = getGameweekPresentation(status, gameweek.data?.pointsState ?? "provisional");
  const summary = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: source !== "guest",
    staleTime: 30_000,
    refetchInterval: presentation.pollIntervalMs,
  });

  if (gameweek.isPending) {
    return (
      <div
        role="status"
        aria-label={t("state.loading")}
        className="surface-4 mt-3 h-24 animate-pulse motion-reduce:animate-none"
      />
    );
  }

  if (gameweek.isError || !gameweek.data) return null;

  const data = source === "guest" ? undefined : summary.data;
  const cta =
    source === "guest" || data === null
      ? { to: "/fantasy/create" as const, labelKey: "fantasy.create.title" as const }
      : presentation.pointsRoute
        ? { to: "/fantasy/points" as const, labelKey: "fantasy.points.title" as const }
        : { to: "/fantasy/team" as const, labelKey: "home.view_fantasy_team" as const };

  return (
    <section
      aria-label={`${t("home.gameweek")} ${gameweek.data.number}`}
      className="surface-4 relative mt-3 overflow-hidden p-3 sm:p-4"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -end-14 -top-20 h-44 w-44 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand-accent) 28%, transparent), transparent 72%)",
          filter: "blur(8px)",
        }}
      />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
            style={{ backgroundImage: "var(--bg-brand-gradient)" }}
          >
            <Trophy className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--brand-accent)]">
              {t("fantasy.title")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-base font-black text-foreground">
                {t("home.gameweek")} {gameweek.data.number}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${statusToneClass(presentation.tone)}`}
              >
                {t(presentation.badgeKey)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-end">
          <CalendarClock className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />
          <div>
            {presentation.showCountdown ? (
              <>
                <div className="text-[9px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
                  {t("home.deadline")}
                </div>
                <DeadlineCountdown iso={gameweek.data.deadline} />
              </>
            ) : (
              <div className="max-w-44 text-xs font-black text-foreground">
                {presentation.detailKey ? t(presentation.detailKey) : t(presentation.badgeKey)}
              </div>
            )}
          </div>
        </div>
      </div>

      {data && (
        <div className="relative mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            label={t("fantasy.gw_points")}
            value={numberFormat.format(data.gameweekPoints)}
            accent
          />
          <Metric
            label={t("fantasy.overall_rank")}
            value={
              gameweek.data.rankingAvailable === false || data.overallRank === null
                ? "—"
                : numberFormat.format(data.overallRank)
            }
          />
          <Metric label={t("fantasy.free_transfers")} value={String(data.transfersLeft)} />
          <Metric
            label={t("fantasy.bank")}
            value={numberFormat.format(data.bankValue)}
            icon={<WalletCards className="h-3.5 w-3.5" aria-hidden />}
          />
        </div>
      )}

      <div className="relative mt-3">
        <Link
          to={cta.to}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl cta-brand px-4 py-2 text-sm font-black sm:w-auto"
        >
          {t(cta.labelKey)}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function statusToneClass(tone: GameweekStatusTone): string {
  switch (tone) {
    case "accent":
      return "bg-[color:color-mix(in_oklab,var(--brand-accent)_16%,transparent)] text-[color:var(--brand-primary)]";
    case "live":
      return "bg-[color:color-mix(in_oklab,var(--color-live)_14%,transparent)] text-[color:var(--color-live)]";
    case "warning":
      return "bg-[color:color-mix(in_oklab,var(--color-warning)_16%,transparent)] text-amber-900";
    case "final":
      return "bg-[color:color-mix(in_oklab,var(--color-success)_14%,transparent)] text-[color:var(--color-success)]";
    case "neutral":
      return "bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)]";
  }
}

function Metric({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[color:var(--surface)]/70 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span
          className={
            accent
              ? "text-base font-black tabular-nums text-[color:var(--brand-accent)]"
              : "text-base font-black tabular-nums text-foreground"
          }
        >
          {value}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
        {label}
      </div>
    </div>
  );
}
