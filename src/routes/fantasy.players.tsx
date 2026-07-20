import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fantasyService } from "@/services/fantasy-runtime";
import { botolaService } from "@/services/mock";
import { LoadingState, EmptyState } from "@/components/common/States";
import { ClubCrest } from "@/components/common/ClubCrest";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { DifficultyBadge } from "@/components/fantasy/DifficultyBadge";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Search, Star } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Position } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/players")({
  component: PlayersPage,
});

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
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });

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

  if (!playersQ.data || !clubsQ.data) return <LoadingState />;
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
    <div>
      <h1 className="text-xl font-black text-foreground">
        <span className="text-brand">{t("fantasy.players.title")}</span>
      </h1>

      <div className="mt-3 space-y-2">
        <label className="glass-surface glass-regular flex items-center gap-2 rounded-xl border border-[var(--glass-border)] px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("fantasy.picker.search")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="flex flex-wrap gap-1">
          <Chip active={pos === ""} onClick={() => setPos("")}>
            {t("common.all")}
          </Chip>
          {positions.map((p) => (
            <Chip key={p} active={pos === p} onClick={() => setPos(p)}>
              {t(`player.pos.${p}` as TranslationKey)}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip active={clubId === ""} onClick={() => setClubId("")}>
            {t("common.all")}
          </Chip>
          {clubs.map((c) => (
            <Chip key={c.id} active={clubId === c.id} onClick={() => setClubId(c.id)}>
              {tr(c.shortName)}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
            {t("fantasy.picker.sort")}:
          </span>
          {sorts.map((s) => (
            <Chip key={s.k} active={sort === s.k} onClick={() => setSort(s.k)}>
              {t(s.labelKey)}
            </Chip>
          ))}
        </div>
      </div>

      {compare.length === 2 && (
        <div className="glass-surface glass-strong mt-3 rounded-2xl border border-[var(--glass-border)] p-3">
          <div className="mb-2 text-sm font-black">{t("fantasy.players.compare_title")}</div>
          <div className="grid grid-cols-2 gap-3">
            {compare.map((id) => {
              const p = playerOf(id);
              return (
                <div key={id} className="rounded-xl bg-white/70 p-2 ring-1 ring-black/5">
                  <div className="flex items-center gap-1.5">
                    {clubOf(p.clubId) && <ClubCrest club={clubOf(p.clubId)!} size="sm" />}
                    <div className="truncate text-xs font-bold">{tr(p.name)}</div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                    <dt className="text-muted-foreground">{t("fantasy.price")}</dt>
                    <dd className="tabular-nums text-end">{nf.format(p.price)}</dd>
                    <dt className="text-muted-foreground">{t("fantasy.total_points")}</dt>
                    <dd className="tabular-nums text-end">{p.totalPoints}</dd>
                    <dt className="text-muted-foreground">{t("fantasy.form")}</dt>
                    <dd className="tabular-nums text-end">{nf.format(p.form)}</dd>
                    <dt className="text-muted-foreground">{t("fantasy.ownership")}</dt>
                    <dd className="tabular-nums text-end">{nf.format(p.ownership)}%</dd>
                    <dt className="text-muted-foreground">{t("fantasy.expected_points")}</dt>
                    <dd className="tabular-nums text-end">{p.expectedPoints}</dd>
                  </dl>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setCompare([])}
            className="mt-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("common.reset")}
          </button>
        </div>
      )}
      {compare.length === 1 && (
        <div className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-xs text-muted-foreground ring-1 ring-black/5">
          {t("fantasy.players.pick_two")}
        </div>
      )}

      <div className="mt-3 grid gap-1.5">
        {list.length === 0 && <EmptyState />}
        {list.map((p) => {
          const c = clubOf(p.clubId);
          const oppc = p.nextOpponentClubId ? clubOf(p.nextOpponentClubId) : undefined;
          const inWatch = watch.includes(p.id);
          const inCompare = compare.includes(p.id);
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 ring-1 ring-black/5"
            >
              <Link
                to="/fantasy/players/$playerId"
                params={{ playerId: p.id }}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                {c && <ClubCrest club={c} size="sm" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-foreground">{tr(p.name)}</span>
                    {p.status !== "available" && <PlayerStatusBadge status={p.status} />}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {t(`player.pos.${p.position}` as TranslationKey)} · {t("fantasy.form")}{" "}
                    {nf.format(p.form)} · {nf.format(p.ownership)}%
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
                <div className="text-sm font-black tabular-nums">{nf.format(p.price)}</div>
                <div className="text-[10px] text-muted-foreground">{p.totalPoints} pts</div>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => toggleWatch(p.id)}
                  aria-label={
                    inWatch ? t("fantasy.players.remove_watch") : t("fantasy.players.add_watch")
                  }
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-lg",
                    inWatch
                      ? "bg-[color:var(--brand-accent)]/20 text-[color:var(--brand-accent)]"
                      : "bg-white ring-1 ring-black/10 text-muted-foreground",
                  )}
                >
                  <Star className={cn("h-3.5 w-3.5", inWatch && "fill-current")} aria-hidden />
                </button>
                <button
                  onClick={() => toggleCompare(p.id)}
                  className={cn(
                    "rounded-lg px-1.5 py-0.5 text-[10px] font-bold",
                    inCompare
                      ? "bg-[color:var(--brand-primary)] text-white"
                      : "bg-white ring-1 ring-black/10",
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
        "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
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
