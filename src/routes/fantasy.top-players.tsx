import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Bookmark,
  Crown,
  Medal,
  Share2,
  Star,
  UserPlus,
} from "lucide-react";
import { fantasyService } from "@/services/fantasy-runtime";
import { botolaService } from "@/services/mock";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { GameweekSelector } from "@/components/fantasy/GameweekSelector";
import { ClubCrest } from "@/components/common/ClubCrest";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { getKitForClub } from "@/lib/kits";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/States";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Trans } from "@/components/common/Trans";
import type { TopPlayerOfWeek, FantasyPlayer } from "@/types/fantasy";
import type { Club } from "@/types/domain";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/fantasy/top-players")({
  head: () => ({
    meta: [
      { title: "Top 5 joueurs de la semaine — BotolaGO" },
      {
        name: "description",
        content: "Les cinq meilleurs joueurs de la journée Fantasy Botola Pro.",
      },
      { property: "og:title", content: "Top 5 joueurs de la semaine — BotolaGO" },
      {
        property: "og:description",
        content: "Les cinq meilleurs joueurs de la journée Fantasy Botola Pro.",
      },
    ],
  }),
  component: TopPlayersPage,
});

type Enriched = {
  top: TopPlayerOfWeek;
  player: FantasyPlayer;
  club?: Club;
};

function TopPlayersPage() {
  const { t, tr, lang, dir } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => botolaService.getCurrentGameweek(),
  });
  const availableGwsQ = useQuery({
    queryKey: ["top-gws"],
    queryFn: () => fantasyService.getAvailableTopGameweeks(),
  });
  const [gw, setGw] = useState<number | null>(null);
  const currentGw = gw ?? gwQ.data?.number ?? 14;

  const topQ = useQuery({
    queryKey: ["top-players", currentGw],
    queryFn: () => fantasyService.getTopPlayersOfWeek(currentGw),
    enabled: currentGw > 0,
  });
  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
  });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });

  const enriched = useMemo<Enriched[]>(() => {
    if (!topQ.data || !playersQ.data || !clubsQ.data) return [];
    return topQ.data
      .map((top) => {
        const player = playersQ.data!.find((p) => p.id === top.playerId);
        if (!player) return null;
        const club = clubsQ.data!.find((c) => c.id === player.clubId);
        return { top, player, club } as Enriched;
      })
      .filter((x): x is Enriched => x !== null)
      .sort((a, b) => a.top.rank - b.top.rank);
  }, [topQ.data, playersQ.data, clubsQ.data]);

  const gwMin = availableGwsQ.data?.[0] ?? 1;
  const gwMax = availableGwsQ.data?.[availableGwsQ.data.length - 1] ?? currentGw;
  const maxPoints = enriched[0]?.top.weeklyPoints ?? 1;

  const isLoading = topQ.isLoading || playersQ.isLoading || clubsQ.isLoading || gwQ.isLoading;
  const isError = topQ.isError || playersQ.isError || clubsQ.isError;

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/fantasy"
          aria-label={t("common.back")}
          className="glass-surface glass-regular grid h-9 w-9 place-items-center rounded-full border border-[var(--glass-border)] text-foreground"
        >
          {dir === "rtl" ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
        </Link>
        <button
          type="button"
          aria-label="share"
          onClick={() => {
            if (typeof navigator !== "undefined" && "share" in navigator) {
              void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
                .share({
                  title: t("fantasy.top.title"),
                  url: typeof window !== "undefined" ? window.location.href : "",
                })
                .catch(() => undefined);
            }
          }}
          className="glass-surface glass-regular grid h-9 w-9 place-items-center rounded-full border border-[var(--glass-border)] text-foreground"
        >
          <Share2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3">
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          <Trans text={t("fantasy.top.title")} />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("fantasy.top.subtitle")}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("fantasy.top.gw_label")}
        </span>
        <GameweekSelector value={currentGw} min={gwMin} max={gwMax} onChange={setGw} />
      </div>

      {/* Content states */}
      {isLoading && (
        <div className="mt-6">
          <LoadingState />
        </div>
      )}
      {isError && !isLoading && (
        <div className="mt-6">
          <ErrorState onRetry={() => topQ.refetch()} />
        </div>
      )}
      {!isLoading && !isError && enriched.length === 0 && (
        <div className="mt-6">
          <EmptyState />
        </div>
      )}

      {enriched.length > 0 && (
        <>
          <div className="mt-4">
            <TopPlayerHeroCard entry={enriched[0]} tr={tr} t={t} nf={nf} />
          </div>

          <SectionHeader title={`#2 — #5`} />
          <div className="grid gap-3">
            {enriched.slice(1).map((e) => (
              <RankedPlayerCard key={e.player.id} entry={e} tr={tr} t={t} nf={nf} />
            ))}
          </div>

          <SectionHeader title={t("fantasy.top.comparison")} />
          <WeeklyTopPlayersComparison entries={enriched} maxPoints={maxPoints} tr={tr} nf={nf} />
        </>
      )}
    </div>
  );
}

/* -------------------- Reusable subcomponents -------------------- */

type CardProps = {
  entry: Enriched;
  tr: (v: { fr: string; ar: string }) => string;
  t: (k: TranslationKey) => string;
  nf: Intl.NumberFormat;
};

const rankAccent: Record<number, string> = {
  1: "from-amber-300 via-yellow-400 to-amber-600",
  2: "from-slate-200 via-slate-300 to-slate-500",
  3: "from-orange-300 via-amber-500 to-orange-700",
  4: "from-blue-400 via-blue-500 to-slate-700",
  5: "from-blue-400 via-blue-500 to-slate-700",
};

function TopPlayerHeroCard({ entry, tr, t, nf }: CardProps) {
  const navigate = useNavigate();
  const { player, club, top } = entry;
  const kit = getKitForClub(club, player.kitPattern);

  return (
    <article
      className={cn(
        "glass-surface glass-strong relative overflow-hidden rounded-3xl border border-[var(--glass-border)] p-4",
      )}
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklab, var(--brand-primary) 55%, transparent) 0%, color-mix(in oklab, #22d3ee 25%, transparent) 100%)",
      }}
    >
      {/* Gold accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 end-[-40px] h-56 w-56 rounded-full blur-3xl"
        style={{
          background: "radial-gradient(closest-side, rgba(251,191,36,0.55), transparent 70%)",
        }}
      />
      <div className="relative flex items-start gap-4">
        {/* Rank + jersey */}
        <div className="flex flex-col items-center gap-2">
          <div
            className={cn(
              "grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br text-sm font-black text-white shadow-lg ring-2 ring-white/40",
              rankAccent[1],
            )}
            aria-label={`#${top.rank}`}
          >
            <Crown className="h-4 w-4" aria-hidden />
          </div>
          <JerseyVisual
            kit={kit}
            size={70}
            imageUrl={player.jerseyImageUrl}
            ariaLabel={tr(player.name)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-100">
            <Star className="h-3 w-3" aria-hidden />
            {t("fantasy.top.best_player")}
          </div>
          <div className="mt-1 truncate text-lg font-black text-white">{tr(player.name)}</div>
          <div className="mt-1 flex items-center gap-2">
            {club && <ClubCrest club={club} size="sm" />}
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-white/90">
                {club && tr(club.name)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-white/70">
                {t(`player.pos.${player.position}` as TranslationKey)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <div className="text-4xl font-black leading-none text-white tabular-nums">
            {top.weeklyPoints}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-white/80">
            {t("fantasy.top.points")}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="relative mt-4 grid grid-cols-4 gap-2">
        <HeroStat label={t("fantasy.top.goals")} value={String(top.goals)} />
        <HeroStat label={t("fantasy.top.assists")} value={String(top.assists)} />
        <HeroStat label={t("fantasy.top.clean_sheets")} value={String(top.cleanSheets)} />
        <HeroStat label={t("fantasy.top.minutes")} value={`${top.minutes}'`} />
      </div>

      <div className="relative mt-3 grid grid-cols-3 gap-2 text-white/90">
        <MetaChip label={t("fantasy.price")} value={nf.format(top.price)} />
        <MetaChip
          label={t("fantasy.top.ownership")}
          value={`${nf.format(top.ownershipPercent)}%`}
        />
        <MetaChip label={t("fantasy.top.form")} value={nf.format(top.form)} />
      </div>

      {/* Actions */}
      <div className="relative mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            navigate({ to: "/fantasy/players/$playerId", params: { playerId: player.id } })
          }
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-[color:var(--brand-primary)] shadow-sm transition-transform motion-safe:hover:-translate-y-0.5"
        >
          {t("fantasy.top.view_player")}
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white backdrop-blur"
        >
          <Bookmark className="h-4 w-4" aria-hidden />
          {t("fantasy.top.add_watchlist")}
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/fantasy/transfers" })}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white backdrop-blur"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {t("fantasy.top.transfer_in")}
        </button>
      </div>
    </article>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/15 px-2 py-2 text-center backdrop-blur">
      <div className="text-lg font-black tabular-nums text-white">{value}</div>
      <div className="mt-0.5 truncate text-[9px] uppercase tracking-wider text-white/80">
        {label}
      </div>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-white/70">{label}</span>
      <span className="text-xs font-black tabular-nums text-white">{value}</span>
    </div>
  );
}

function RankedPlayerCard({ entry, tr, t, nf }: CardProps) {
  const navigate = useNavigate();
  const { player, club, top } = entry;
  const kit = getKitForClub(club, player.kitPattern);

  const rankStyles: Record<number, { badge: string; icon: React.ReactNode }> = {
    2: {
      badge: "from-slate-200 to-slate-500 text-slate-900",
      icon: <Medal className="h-3.5 w-3.5" aria-hidden />,
    },
    3: {
      badge: "from-orange-300 to-amber-700 text-white",
      icon: <Award className="h-3.5 w-3.5" aria-hidden />,
    },
    4: { badge: "from-blue-500 to-slate-700 text-white", icon: null },
    5: { badge: "from-blue-500 to-slate-700 text-white", icon: null },
  };
  const rs = rankStyles[top.rank] ?? rankStyles[4];

  return (
    <button
      type="button"
      onClick={() =>
        navigate({ to: "/fantasy/players/$playerId", params: { playerId: player.id } })
      }
      className="glass-surface glass-regular flex w-full items-center gap-3 rounded-2xl border border-[var(--glass-border)] px-3 py-3 text-start transition-transform motion-safe:hover:-translate-y-0.5"
    >
      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm font-black shadow-inner",
          rs.badge,
        )}
        aria-label={`#${top.rank}`}
      >
        {rs.icon ?? `#${top.rank}`}
      </div>

      <JerseyVisual
        kit={kit}
        size={40}
        imageUrl={player.jerseyImageUrl}
        ariaLabel={tr(player.name)}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {club && <ClubCrest club={club} size="sm" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-foreground">{tr(player.name)}</div>
            <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {club && tr(club.shortName)} • {t(`player.pos.${player.position}` as TranslationKey)}
            </div>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>
            <b className="font-black tabular-nums text-foreground">{top.goals}</b>{" "}
            {t("fantasy.top.goals")}
          </span>
          <span>
            <b className="font-black tabular-nums text-foreground">{top.assists}</b>{" "}
            {t("fantasy.top.assists")}
          </span>
          <span>
            <b className="font-black tabular-nums text-foreground">{top.cleanSheets}</b> CS
          </span>
          <span>
            <b className="font-black tabular-nums text-foreground">{top.minutes}'</b>
          </span>
          <span>•</span>
          <span>
            {t("fantasy.top.form")}{" "}
            <b className="font-black tabular-nums text-foreground">{nf.format(top.form)}</b>
          </span>
          <span>
            {t("fantasy.top.ownership")}{" "}
            <b className="font-black tabular-nums text-foreground">
              {nf.format(top.ownershipPercent)}%
            </b>
          </span>
        </div>
      </div>

      <div className="text-end">
        <div className="text-2xl font-black leading-none tabular-nums text-foreground">
          {top.weeklyPoints}
        </div>
        <div className="mt-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("fantasy.top.points")}
        </div>
      </div>
    </button>
  );
}

function WeeklyTopPlayersComparison({
  entries,
  maxPoints,
  tr,
  nf,
}: {
  entries: Enriched[];
  maxPoints: number;
  tr: (v: { fr: string; ar: string }) => string;
  nf: Intl.NumberFormat;
}) {
  return (
    <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-4">
      <div className="grid gap-2.5">
        {entries.map((e) => {
          const pct = Math.max(6, Math.round((e.top.weeklyPoints / Math.max(1, maxPoints)) * 100));
          const shortName = tr(e.player.name).split(" ").slice(-1)[0];
          const barColor =
            e.top.rank === 1
              ? "bg-gradient-to-r from-amber-300 to-amber-600"
              : e.top.rank === 2
                ? "bg-gradient-to-r from-slate-300 to-slate-500"
                : e.top.rank === 3
                  ? "bg-gradient-to-r from-orange-300 to-amber-700"
                  : "bg-gradient-to-r from-[color:var(--brand-primary)] to-cyan-500";
          return (
            <div key={e.player.id} className="grid grid-cols-[3rem_1fr_2.5rem] items-center gap-2">
              <div className="truncate text-xs font-semibold text-foreground">
                #{e.top.rank} {shortName}
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-white/40 ring-1 ring-black/5">
                <div
                  className={cn("h-full rounded-full", barColor)}
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={maxPoints}
                  aria-valuenow={e.top.weeklyPoints}
                />
              </div>
              <div className="text-end text-xs font-black tabular-nums text-foreground">
                {nf.format(e.top.weeklyPoints)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
