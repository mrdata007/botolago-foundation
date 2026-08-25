import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { PlayerDecisionSummary } from "@/components/fantasy/PlayerDecisionSummary";
import {
  PLAYER_STATUS_SORT_ORDER,
  selectUpcomingFixture,
} from "@/components/fantasy/player-decision-presentation";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import {
  fantasyWatchlistStorageKey,
  readFantasyWatchlist,
  writeFantasyWatchlist,
  type FantasyWatchlistStorage,
} from "@/services/fantasy-watchlist";
import type { Position } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/players")({
  component: PlayersRoute,
});

function PlayersRoute() {
  const isPlayerDetail = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === "/fantasy/players/$playerId"),
  });
  return isPlayerDetail ? <Outlet /> : <PlayersPage />;
}

type SortKey = "fixture" | "price" | "name" | "availability";
const positions: Position[] = ["GK", "DEF", "MID", "FWD"];

function getBrowserStorage(): FantasyWatchlistStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function PlayersPage() {
  const { t, tr, lang } = useI18n();
  const { user, status: authStatus } = useAuth();
  const { source } = useFantasyDataSource();
  const watchStorageKey = useMemo(
    () => fantasyWatchlistStorageKey({ source, authStatus, userId: user?.id }),
    [source, authStatus, user?.id],
  );
  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const fixturesQ = useQuery({
    queryKey: ["fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
  });
  const fixtureReferenceTime = fixturesQ.data === undefined ? undefined : fixturesQ.dataUpdatedAt;

  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Position | "">("");
  const [clubId, setClubId] = useState("");
  const [sort, setSort] = useState<SortKey>("fixture");
  const [watchState, setWatchState] = useState<{ key: string | null; ids: string[] }>({
    key: null,
    ids: [],
  });

  useEffect(() => {
    setWatchState({
      key: watchStorageKey,
      ids: watchStorageKey ? readFantasyWatchlist(getBrowserStorage(), watchStorageKey) : [],
    });
  }, [watchStorageKey]);

  const watchReady = watchStorageKey !== null && watchState.key === watchStorageKey;
  const watch = watchReady ? watchState.ids : [];

  const toggleWatch = (id: string) => {
    if (!watchReady || !watchStorageKey) return;

    const next = watch.includes(id) ? watch.filter((item) => item !== id) : [...watch, id];
    setWatchState({ key: watchStorageKey, ids: next });
    writeFantasyWatchlist(getBrowserStorage(), watchStorageKey, next);
  };

  const list = useMemo(() => {
    let result = (playersQ.data ?? []).slice();
    if (pos) result = result.filter((player) => player.position === pos);
    if (clubId) result = result.filter((player) => player.clubId === clubId);
    if (q.trim()) {
      const normalized = q.toLowerCase();
      result = result.filter(
        (player) => player.name.fr.toLowerCase().includes(normalized) || player.name.ar.includes(q),
      );
    }

    const fixtures = fixturesQ.data ?? [];
    const nextFixtureByClub = new Map(
      Array.from(new Set(result.map((player) => player.clubId))).map((id) => [
        id,
        selectUpcomingFixture(id, fixtures, fixtureReferenceTime),
      ]),
    );

    result.sort((left, right) => {
      if (sort === "price") return right.price - left.price;
      if (sort === "name") return left.name[lang].localeCompare(right.name[lang], lang);
      if (sort === "availability") {
        return (
          PLAYER_STATUS_SORT_ORDER[left.status] - PLAYER_STATUS_SORT_ORDER[right.status] ||
          right.price - left.price
        );
      }

      const leftFixture = nextFixtureByClub.get(left.clubId);
      const rightFixture = nextFixtureByClub.get(right.clubId);
      if (!leftFixture && !rightFixture) return right.price - left.price;
      if (!leftFixture) return 1;
      if (!rightFixture) return -1;
      if (leftFixture.isBlank !== rightFixture.isBlank) return leftFixture.isBlank ? 1 : -1;
      return (
        leftFixture.gameweek - rightFixture.gameweek ||
        leftFixture.difficulty - rightFixture.difficulty ||
        right.price - left.price
      );
    });
    return result;
  }, [playersQ.data, fixturesQ.data, fixtureReferenceTime, pos, clubId, q, sort, lang]);

  if (playersQ.isError || clubsQ.isError || fixturesQ.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void playersQ.refetch();
          void clubsQ.refetch();
          void fixturesQ.refetch();
        }}
      />
    );
  }
  if (!playersQ.data || !clubsQ.data || !fixturesQ.data) return <LoadingState />;

  const sorts: { key: SortKey; labelKey: TranslationKey }[] = [
    { key: "fixture", labelKey: "fantasy.picker.sort.fixture" },
    { key: "price", labelKey: "fantasy.picker.sort.price" },
    { key: "availability", labelKey: "fantasy.picker.sort.availability" },
    { key: "name", labelKey: "fantasy.picker.sort.name" },
  ];

  return (
    <div>
      <h1 className="text-xl font-black text-foreground">
        <span className="text-brand">{t("fantasy.players.title")}</span>
      </h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t("fantasy.players.decision_intro")}
      </p>

      <div className="mt-3 space-y-2">
        <label className="glass-surface glass-regular flex min-h-11 items-center gap-2 rounded-xl border border-[var(--glass-border)] px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t("fantasy.picker.search")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="flex flex-wrap gap-1">
          <Chip active={pos === ""} onClick={() => setPos("")}>
            {t("common.all")}
          </Chip>
          {positions.map((position) => (
            <Chip key={position} active={pos === position} onClick={() => setPos(position)}>
              {t(`player.pos.${position}` as TranslationKey)}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          <Chip active={clubId === ""} onClick={() => setClubId("")}>
            {t("common.all")}
          </Chip>
          {clubsQ.data.map((club) => (
            <Chip key={club.id} active={clubId === club.id} onClick={() => setClubId(club.id)}>
              <ClubCrest club={club} size="sm" className="h-5 w-5 rounded-full text-[8px]" />
              {tr(club.shortName)}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
            {t("fantasy.picker.sort")}:
          </span>
          {sorts.map((item) => (
            <Chip key={item.key} active={sort === item.key} onClick={() => setSort(item.key)}>
              {t(item.labelKey)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {list.length === 0 && <EmptyState />}
        {list.map((player) => {
          const inWatch = watch.includes(player.id);
          const club = clubsQ.data.find((item) => item.id === player.clubId);
          return (
            <article key={player.id} className="surface-4 flex min-w-0 items-start gap-2 p-2.5">
              <Link
                to="/fantasy/players/$playerId"
                params={{ playerId: player.id }}
                className="min-w-0 flex-1 rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
              >
                <PlayerDecisionSummary
                  player={player}
                  club={club}
                  clubs={clubsQ.data}
                  fixtures={fixturesQ.data}
                  fixtureReferenceTime={fixtureReferenceTime}
                />
                <span className="sr-only">{t("fantasy.players.open_profile")}</span>
              </Link>
              <button
                type="button"
                disabled={!watchReady}
                onClick={() => toggleWatch(player.id)}
                aria-pressed={inWatch}
                aria-label={
                  inWatch ? t("fantasy.players.remove_watch") : t("fantasy.players.add_watch")
                }
                className={cn(
                  "grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
                  inWatch
                    ? "bg-[color:color-mix(in_oklab,var(--brand-accent)_18%,transparent)] text-[color:var(--brand-accent)]"
                    : "bg-[color:var(--surface-hover)] text-[color:var(--text-muted)] hover:text-foreground",
                  !watchReady && "cursor-not-allowed opacity-50",
                )}
              >
                <Star className={cn("h-4 w-4", inWatch && "fill-current")} aria-hidden />
              </button>
            </article>
          );
        })}
      </div>
    </div>
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
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "bg-[color:var(--brand-primary)] text-white"
          : "bg-white/60 text-foreground ring-1 ring-black/5 hover:bg-white",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
