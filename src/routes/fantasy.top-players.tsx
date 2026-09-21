import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { Award, Bookmark, Crown, Medal, Share2, Star, UserPlus } from "lucide-react";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { useI18n } from "@/i18n/provider";
import { useWatchlist } from "@/lib/fantasy-watchlist";
import { cn } from "@/lib/utils";
import { GameweekSelector } from "@/components/fantasy/GameweekSelector";
import { ClubCrest } from "@/components/common/ClubCrest";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { getKitForClub } from "@/lib/kits";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/States";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FplHeader, FplPill } from "@/components/fpl/primitives";
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
  component: TopPlayersFramed,
});

type Enriched = {
  top: TopPlayerOfWeek;
  player: FantasyPlayer;
  club?: Club;
};

/**
 * FPL "Top players of the week" reconstructed on the Fantasy design system:
 * the shared Back header (`FplHeader`) and phone-width column
 * (`FantasyFrame`), with the hero/ranked cards restyled onto the ink/cyan
 * `--fpl-*` gradient instead of the generic glass/brand-primary surfaces it
 * used while wrapped in `LegacyFantasyPage`.
 */
function TopPlayersFramed() {
  const { t } = useI18n();
  return (
    <FantasyFrame>
      <FplHeader title={t("fpl.top_players")} backTo="/fantasy" right={<ShareButton />} />
      <TopPlayersPage />
    </FantasyFrame>
  );
}

function ShareButton() {
  const { t } = useI18n();

  // navigator.share exists on phones and almost nowhere on the desktop web, so
  // guarding on it and doing nothing else left this button visibly inert for
  // every desktop reader: a press, and no response of any kind. Copying the
  // link is the same intent by another route, and it is what the article and
  // match pages already do.
  const share = async () => {
    const url = typeof window === "undefined" ? "" : window.location.href;
    if (!url) return;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: t("fantasy.top.title"), url });
        return;
      } catch {
        // A dismissed share sheet rejects. That is the reader declining, not a
        // failure, so it must not fall through to copying a link they did not
        // ask for.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("article.share_copied"));
    } catch {
      toast.error(t("fantasy.error.network"));
    }
  };

  return (
    <button
      type="button"
      aria-label={t("article.share")}
      onClick={() => void share()}
      className="grid h-9 w-9 place-items-center rounded-full bg-white/35 text-[color:var(--fpl-ink)]"
    >
      <Share2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

function TopPlayersPage() {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
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
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });

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
    <div className="bg-white px-4 pb-10 pt-3">
      <p className="text-sm text-[color:var(--fpl-grey-text)]">{t("fantasy.top.subtitle")}</p>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--fpl-grey-text)]">
          {t("fantasy.top.gw_label")}
        </span>
        <GameweekSelector value={currentGw} min={gwMin} max={gwMax} onChange={setGw} />
      </div>

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

          <div className="mt-5 mb-2">
            <FplPill>#2 — #5</FplPill>
          </div>
          <div className="grid gap-3">
            {enriched.slice(1).map((e) => (
              <RankedPlayerCard key={e.player.id} entry={e} tr={tr} t={t} nf={nf} />
            ))}
          </div>

          <div className="mt-5 mb-2">
            <FplPill>{t("fantasy.top.comparison")}</FplPill>
          </div>
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

function TopPlayerHeroCard({ entry, tr, t, nf }: CardProps) {
  const navigate = useNavigate();
  const watchlist = useWatchlist();
  const { player, club, top } = entry;
  const kit = getKitForClub(club, player.kitPattern);

  return (
    <article
      className="relative overflow-hidden rounded-[14px] p-4"
      style={{ backgroundImage: "var(--fpl-header)" }}
    >
      {/* Gold accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 end-[-40px] h-56 w-56 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--fpl-amber) 55%, transparent), transparent 70%)",
        }}
      />
      <div className="relative flex items-start gap-4">
        {/* Rank + jersey */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="grid h-10 w-10 place-items-center rounded-full text-sm font-black text-[color:var(--fpl-ink-deep)] shadow-lg ring-2 ring-white/40"
            style={{ backgroundImage: "var(--fpl-grad)" }}
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
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/90">
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
          <div className="fpl-tabular text-4xl font-black leading-none text-white">
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
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-white px-3 py-2.5 text-sm font-bold text-[color:var(--fpl-ink)] shadow-sm transition-transform motion-safe:hover:-translate-y-0.5"
        >
          {t("fantasy.top.view_player")}
        </button>
        <button
          type="button"
          onClick={() => watchlist.toggle(player.id)}
          aria-pressed={watchlist.isWatched(player.id)}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-[6px] border px-3 py-2.5 text-xs font-semibold backdrop-blur",
            watchlist.isWatched(player.id)
              ? "border-[color:var(--fpl-amber)] bg-[color:var(--fpl-amber)] text-[color:var(--fpl-ink-deep)]"
              : "border-white/30 bg-white/10 text-white",
          )}
        >
          <Bookmark
            className={cn("h-4 w-4", watchlist.isWatched(player.id) && "fill-current")}
            aria-hidden
          />
          {watchlist.isWatched(player.id)
            ? t("fantasy.players.remove_watch")
            : t("fantasy.top.add_watchlist")}
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/fantasy/transfers" })}
          className="inline-flex items-center justify-center gap-2 rounded-[6px] border border-white/30 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white backdrop-blur"
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
    <div className="rounded-[8px] bg-white/15 px-2 py-2 text-center backdrop-blur">
      <div className="fpl-tabular text-lg font-black text-white">{value}</div>
      <div className="mt-0.5 truncate text-[9px] uppercase tracking-wider text-white/80">
        {label}
      </div>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[6px] bg-white/10 px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-white/70">{label}</span>
      <span className="fpl-tabular text-xs font-black text-white">{value}</span>
    </div>
  );
}

function RankedPlayerCard({ entry, tr, t, nf }: CardProps) {
  const navigate = useNavigate();
  const { player, club, top } = entry;
  const kit = getKitForClub(club, player.kitPattern);

  const rankStyles: Record<number, { badge: string; icon: React.ReactNode }> = {
    2: {
      badge: "bg-[color:var(--fpl-grey)] text-[color:var(--fpl-ink-deep)]",
      icon: <Medal className="h-3.5 w-3.5" aria-hidden />,
    },
    3: {
      badge: "bg-[color:var(--fpl-amber)] text-[color:var(--fpl-ink-deep)]",
      icon: <Award className="h-3.5 w-3.5" aria-hidden />,
    },
    4: { badge: "bg-[color:var(--fpl-ink)] text-white", icon: null },
    5: { badge: "bg-[color:var(--fpl-ink)] text-white", icon: null },
  };
  const rs = rankStyles[top.rank] ?? rankStyles[4];

  return (
    <button
      type="button"
      onClick={() =>
        navigate({ to: "/fantasy/players/$playerId", params: { playerId: player.id } })
      }
      className="flex w-full items-center gap-3 rounded-[10px] border border-[color:var(--fpl-grey)] px-3 py-3 text-start transition-transform motion-safe:hover:-translate-y-0.5"
    >
      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black",
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
            <div className="truncate text-sm font-bold text-[color:var(--fpl-ink-deep)]">
              {tr(player.name)}
            </div>
            <div className="truncate text-[10px] uppercase tracking-wider text-[color:var(--fpl-grey-text)]">
              {club && tr(club.shortName)} • {t(`player.pos.${player.position}` as TranslationKey)}
            </div>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[color:var(--fpl-grey-text)]">
          <span>
            <b className="fpl-tabular font-black text-[color:var(--fpl-ink-deep)]">{top.goals}</b>{" "}
            {t("fantasy.top.goals")}
          </span>
          <span>
            <b className="fpl-tabular font-black text-[color:var(--fpl-ink-deep)]">{top.assists}</b>{" "}
            {t("fantasy.top.assists")}
          </span>
          <span>
            <b className="fpl-tabular font-black text-[color:var(--fpl-ink-deep)]">
              {top.cleanSheets}
            </b>{" "}
            CS
          </span>
          <span>
            <b className="fpl-tabular font-black text-[color:var(--fpl-ink-deep)]">
              {top.minutes}'
            </b>
          </span>
          <span>•</span>
          <span>
            {t("fantasy.top.form")}{" "}
            <b className="fpl-tabular font-black text-[color:var(--fpl-ink-deep)]">
              {nf.format(top.form)}
            </b>
          </span>
          <span>
            {t("fantasy.top.ownership")}{" "}
            <b className="fpl-tabular font-black text-[color:var(--fpl-ink-deep)]">
              {nf.format(top.ownershipPercent)}%
            </b>
          </span>
        </div>
      </div>

      <div className="text-end">
        <div className="fpl-tabular text-2xl font-black leading-none text-[color:var(--fpl-ink-deep)]">
          {top.weeklyPoints}
        </div>
        <div className="mt-0.5 text-[9px] uppercase tracking-widest text-[color:var(--fpl-grey-text)]">
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
    <div className="rounded-[10px] border border-[color:var(--fpl-grey)] p-4">
      <div className="grid gap-2.5">
        {entries.map((e) => {
          const pct = Math.max(6, Math.round((e.top.weeklyPoints / Math.max(1, maxPoints)) * 100));
          const shortName = tr(e.player.name).split(" ").slice(-1)[0];
          return (
            <div key={e.player.id} className="grid grid-cols-[3rem_1fr_2.5rem] items-center gap-2">
              <div className="truncate text-xs font-semibold text-[color:var(--fpl-ink-deep)]">
                #{e.top.rank} {shortName}
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-[color:var(--fpl-grey)]">
                <div
                  className={cn(
                    "h-full rounded-full",
                    e.top.rank <= 3
                      ? "bg-[color:var(--fpl-amber)]"
                      : "[background-image:var(--fpl-grad)]",
                  )}
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={maxPoints}
                  aria-valuenow={e.top.weeklyPoints}
                />
              </div>
              <div className="fpl-tabular text-end text-xs font-black text-[color:var(--fpl-ink-deep)]">
                {nf.format(e.top.weeklyPoints)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
