import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FplHeader } from "@/components/fpl/primitives";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/States";
import { ClubCrest } from "@/components/common/ClubCrest";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { DifficultyBadge } from "@/components/fantasy/DifficultyBadge";
import { getKitForClub } from "@/lib/kits";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Position } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/players")({
  component: PlayersRoute,
});

/**
 * FPL "Player stats" reconstructed on the Fantasy design system: the same
 * Back header (`FplHeader`) and phone-width column (`FantasyFrame`) as
 * `fantasy.team.tsx`/`fantasy.points.tsx`, with a filterable player list on
 * white background underneath, in the `SquadListTable` row idiom (jersey,
 * ink name plate, right-aligned numeric columns).
 */
function PlayersRoute() {
  const isPlayerDetail = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === "/fantasy/players/$playerId"),
  });
  if (isPlayerDetail) return <Outlet />;
  return (
    <FantasyFrame>
      <PlayersPage />
    </FantasyFrame>
  );
}

type SortKey = "points" | "form" | "price" | "ownership";
const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
const WATCH_KEY = "botolago.fantasy.watchlist";

function readWatch(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(WATCH_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function PlayersPage() {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });

  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Position | "">("");
  const [clubId, setClubId] = useState("");
  const [sort, setSort] = useState<SortKey>("points");
  const [compare, setCompare] = useState<string[]>([]); // up to 2
  const [watch, setWatch] = useState<string[]>(readWatch());

  const toggleWatch = (id: string) => {
    const next = watch.includes(id) ? watch.filter((x) => x !== id) : [...watch, id];
    setWatch(next);
    try {
      window.localStorage.setItem(WATCH_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const toggleCompare = (id: string) => {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const next = [...prev, id];
      return next.slice(-2);
    });
  };

  const list = useMemo(() => {
    let l = (playersQ.data ?? []).slice();
    if (pos) l = l.filter((p) => p.position === pos);
    if (clubId) l = l.filter((p) => p.clubId === clubId);
    if (q.trim()) {
      const s = q.toLowerCase();
      l = l.filter((p) => p.name.fr.toLowerCase().includes(s) || p.name.ar.includes(q));
    }
    l.sort((a, b) => {
      if (sort === "price") return b.price - a.price;
      if (sort === "form") return b.form - a.form;
      if (sort === "ownership") return b.ownership - a.ownership;
      return b.totalPoints - a.totalPoints;
    });
    return l;
  }, [playersQ.data, pos, clubId, q, sort]);

  if (playersQ.isError || clubsQ.isError) {
    return (
      <>
        <FplHeader title={t("fpl.player_stats")} backTo="/fantasy" />
        <div className="bg-white px-4 pb-6 pt-3">
          <ErrorState
            onRetry={() => {
              void playersQ.refetch();
              void clubsQ.refetch();
            }}
          />
        </div>
      </>
    );
  }
  if (!playersQ.data || !clubsQ.data) {
    return (
      <>
        <FplHeader title={t("fpl.player_stats")} backTo="/fantasy" />
        <div className="bg-white px-4 pb-6 pt-3">
          <LoadingState />
        </div>
      </>
    );
  }
  const clubs = clubsQ.data;
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);
  const playerOf = (id: string) => playersQ.data!.find((p) => p.id === id)!;

  const sorts: { k: SortKey; labelKey: TranslationKey }[] = [
    { k: "points", labelKey: "fantasy.picker.sort.points" },
    { k: "form", labelKey: "fantasy.picker.sort.form" },
    { k: "price", labelKey: "fantasy.picker.sort.price" },
    { k: "ownership", labelKey: "fantasy.picker.sort.ownership" },
  ];

  return (
    <>
      <FplHeader title={t("fpl.player_stats")} backTo="/fantasy" />
      <div className="bg-white px-4 pb-6 pt-3">
        <label className="flex items-center gap-2 rounded-[10px] border border-[color:var(--fpl-grey)] bg-[color:var(--fpl-grey)]/60 px-3 py-2">
          <Search className="h-4 w-4 text-[color:var(--fpl-grey-text)]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("fantasy.picker.search")}
            className="w-full bg-transparent text-sm text-[color:var(--fpl-ink-deep)] outline-none placeholder:text-[color:var(--fpl-grey-text)]"
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-1">
          <Chip active={pos === ""} onClick={() => setPos("")}>
            {t("common.all")}
          </Chip>
          {positions.map((p) => (
            <Chip key={p} active={pos === p} onClick={() => setPos(p)}>
              {t(`player.pos.${p}` as TranslationKey)}
            </Chip>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Chip active={clubId === ""} onClick={() => setClubId("")}>
            {t("common.all")}
          </Chip>
          {clubs.map((c) => (
            <Chip key={c.id} active={clubId === c.id} onClick={() => setClubId(c.id)}>
              <ClubCrest club={c} size="sm" className="h-5 w-5 rounded-full text-[8px]" />
              {tr(c.shortName)}
            </Chip>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-black uppercase tracking-wide text-[color:var(--fpl-grey-text)]">
            {t("fantasy.picker.sort")}:
          </span>
          {sorts.map((s) => (
            <Chip key={s.k} active={sort === s.k} onClick={() => setSort(s.k)}>
              {t(s.labelKey)}
            </Chip>
          ))}
        </div>

        {compare.length === 2 && (
          <div className="mt-3 rounded-[10px] border border-[color:var(--fpl-grey)] p-3">
            <div className="mb-2 text-sm font-black text-[color:var(--fpl-ink-deep)]">
              {t("fantasy.players.compare_title")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {compare.map((id) => {
                const p = playerOf(id);
                return (
                  <div key={id} className="rounded-[8px] bg-[color:var(--fpl-grey)] p-2">
                    <div className="flex items-center gap-1.5">
                      {clubOf(p.clubId) && <ClubCrest club={clubOf(p.clubId)!} size="sm" />}
                      <div className="truncate text-xs font-bold text-[color:var(--fpl-ink-deep)]">
                        {tr(p.name)}
                      </div>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                      <dt className="text-[color:var(--fpl-grey-text)]">{t("fantasy.price")}</dt>
                      <dd className="fpl-tabular text-end text-[color:var(--fpl-ink-deep)]">
                        {nf.format(p.price)}
                      </dd>
                      <dt className="text-[color:var(--fpl-grey-text)]">
                        {t("fantasy.total_points")}
                      </dt>
                      <dd className="fpl-tabular text-end text-[color:var(--fpl-ink-deep)]">
                        {p.totalPoints}
                      </dd>
                      <dt className="text-[color:var(--fpl-grey-text)]">{t("fantasy.form")}</dt>
                      <dd className="fpl-tabular text-end text-[color:var(--fpl-ink-deep)]">
                        {nf.format(p.form)}
                      </dd>
                      <dt className="text-[color:var(--fpl-grey-text)]">
                        {t("fantasy.ownership")}
                      </dt>
                      <dd className="fpl-tabular text-end text-[color:var(--fpl-ink-deep)]">
                        {nf.format(p.ownership)}%
                      </dd>
                      <dt className="text-[color:var(--fpl-grey-text)]">
                        {t("fantasy.expected_points")}
                      </dt>
                      <dd className="fpl-tabular text-end text-[color:var(--fpl-ink-deep)]">
                        {p.expectedPoints}
                      </dd>
                    </dl>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setCompare([])}
              className="mt-2 text-[11px] font-semibold text-[color:var(--fpl-grey-text)] hover:text-[color:var(--fpl-ink)]"
            >
              {t("common.reset")}
            </button>
          </div>
        )}
        {compare.length === 1 && (
          <div className="mt-3 rounded-[8px] bg-[color:var(--fpl-grey)] px-3 py-2 text-xs text-[color:var(--fpl-grey-text)]">
            {t("fantasy.players.pick_two")}
          </div>
        )}

        <div className="mt-3">
          {list.length === 0 && <EmptyState />}
          {list.map((p) => {
            const c = clubOf(p.clubId);
            const oppc = p.nextOpponentClubId ? clubOf(p.nextOpponentClubId) : undefined;
            const kit = getKitForClub(c, p.kitPattern);
            const inWatch = watch.includes(p.id);
            const inCompare = compare.includes(p.id);
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 border-b border-[color:var(--fpl-grey)] py-2"
              >
                <Link
                  to="/fantasy/players/$playerId"
                  params={{ playerId: p.id }}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <JerseyVisual kit={kit} size={32} imageUrl={p.jerseyImageUrl} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-[color:var(--fpl-ink-deep)]">
                        {tr(p.name)}
                      </span>
                      {p.status !== "available" && <PlayerStatusBadge status={p.status} />}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[color:var(--fpl-grey-text)]">
                      {c && tr(c.shortName)} · {t(`player.pos.${p.position}` as TranslationKey)} ·{" "}
                      {t("fantasy.form")} {nf.format(p.form)} · {nf.format(p.ownership)}%
                    </div>
                  </div>
                </Link>
                {oppc && p.nextFixtureDifficulty && (
                  <DifficultyBadge
                    difficulty={p.nextFixtureDifficulty}
                    label={`${oppc.crestPlaceholder} ${p.nextIsHome ? "(D)" : "(E)"}`}
                    className="w-14"
                  />
                )}
                <div className="text-end">
                  <div className="fpl-tabular text-sm font-black text-[color:var(--fpl-ink-deep)]">
                    {nf.format(p.price)}
                  </div>
                  <div className="text-[10px] text-[color:var(--fpl-grey-text)]">
                    {p.totalPoints} {t("fantasy.points.abbr")}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => toggleWatch(p.id)}
                    aria-label={
                      inWatch ? t("fantasy.players.remove_watch") : t("fantasy.players.add_watch")
                    }
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-[6px]",
                      inWatch
                        ? "bg-[color:var(--fpl-amber)] text-[color:var(--fpl-ink-deep)]"
                        : "bg-[color:var(--fpl-grey)] text-[color:var(--fpl-grey-text)]",
                    )}
                  >
                    <Star className={cn("h-3.5 w-3.5", inWatch && "fill-current")} aria-hidden />
                  </button>
                  <button
                    onClick={() => toggleCompare(p.id)}
                    className={cn(
                      "rounded-[6px] px-1.5 py-0.5 text-[10px] font-bold",
                      inCompare
                        ? "bg-[color:var(--fpl-ink)] text-white"
                        : "bg-[color:var(--fpl-grey)] text-[color:var(--fpl-grey-text)]",
                    )}
                  >
                    {t("fantasy.players.compare")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "bg-[color:var(--fpl-ink)] text-white"
          : "bg-[color:var(--fpl-grey)] text-[color:var(--fpl-grey-text)] hover:text-[color:var(--fpl-ink-deep)]",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
